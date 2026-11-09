const tls = require('tls');
const crypto = require('crypto');
const SystemSetting = require('../../models/system/SystemSetting');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const YoupiBankObservation = require('../../models/payments/YoupiBankObservation');
const Registration = require('../../models/events/Registration');
const { sanitizePlainText } = require('../../utils/sanitize');
const {
  isAuthorizedBankEmailSender,
  isLikelyBankSmsSender,
  redactSensitiveData,
  BankEmailParser,
  BankSmsParser,
  parseStatementCsv
} = require('./bankAlertParserService');
const {
  getYoupiConfig,
  parseVpaList,
  toRupeesString,
  signWebhookPayload,
  processIncomingWebhook,
  settlementStateFor
} = require('./youpiGatewayService');

let _schedulerTimer = null;
let _isPolling = false;

function maskSecret(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

async function getAutomationConfig({ includeSecrets = false } = {}) {
  const settingsDoc = await SystemSetting.findOne({ key: 'global' })
    .select(
      'youpiBackupVpas youpiAutoVerifyEnabled youpiAutoReconcileObserved youpiImapHost youpiImapPort youpiImapUser youpiImapPass youpiObserverSecret youpiLastPollAt youpiLastPollResult'
    )
    .lean()
    .catch(() => null);

  const envConfig = getYoupiConfig();
  const autoVerifyEnabled =
    typeof settingsDoc?.youpiAutoVerifyEnabled === 'boolean'
      ? settingsDoc.youpiAutoVerifyEnabled
      : String(process.env.YOUPI_AUTO_VERIFY_ENABLED || 'true').trim().toLowerCase() !== 'false';
  const autoReconcileObserved =
    typeof settingsDoc?.youpiAutoReconcileObserved === 'boolean'
      ? settingsDoc.youpiAutoReconcileObserved
      : String(process.env.YOUPI_AUTO_RECONCILE_OBSERVED || 'true').trim().toLowerCase() !== 'false';

  const imapHost = String(settingsDoc?.youpiImapHost || process.env.YOUPI_IMAP_HOST || 'imap.gmail.com').trim();
  const imapPort = Number(settingsDoc?.youpiImapPort || process.env.YOUPI_IMAP_PORT || 993) || 993;
  const imapUser = String(settingsDoc?.youpiImapUser || process.env.YOUPI_IMAP_USER || '').trim();
  const imapPass = String(settingsDoc?.youpiImapPass || process.env.YOUPI_IMAP_PASS || '').trim();
  const observerSecret = String(
    settingsDoc?.youpiObserverSecret || process.env.YOUPI_OBSERVER_SECRET || ''
  ).trim();

  const backupVpas = parseVpaList([
    ...(Array.isArray(settingsDoc?.youpiBackupVpas) ? settingsDoc.youpiBackupVpas : []),
    ...envConfig.backupPayeeVpas
  ]).filter(v => v.toLowerCase() !== envConfig.defaultPayeeVpa.toLowerCase());

  const base = {
    primaryVpa: envConfig.defaultPayeeVpa,
    backupVpas,
    autoVerifyEnabled,
    autoReconcileObserved,
    imapHost,
    imapPort,
    imapUser,
    imapConfigured: Boolean(imapHost && imapUser && imapPass),
    hasImapPass: Boolean(imapPass),
    imapPassHint: maskSecret(imapPass),
    observerConfigured: Boolean(observerSecret),
    hasObserverSecret: Boolean(observerSecret),
    observerSecretHint: maskSecret(observerSecret),
    lastPollAt: settingsDoc?.youpiLastPollAt || null,
    lastPollResult: settingsDoc?.youpiLastPollResult || null
  };

  if (includeSecrets) {
    return {
      ...base,
      imapPass,
      observerSecret
    };
  }
  return base;
}

function decodeMimeWord(str) {
  return String(str || '').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset, encoding, data) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(data, 'base64').toString('utf8');
      }
      const qp = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      return Buffer.from(qp, 'binary').toString('utf8');
    } catch {
      return data;
    }
  });
}

function decodeQuotedPrintable(input) {
  const cleaned = String(input || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8377;|&rsquo;|&#x20b9;/gi, '₹')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeMimeBody(rawBody) {
  const src = String(rawBody || '');
  if (!src) return '';

  // Handle simple single-part or multipart blocks cleanly
  const boundaryMatch = src.match(/--([A-Za-z0-9'()+_,\-./:=?]{4,70})\r?\n/);
  const parts = boundaryMatch
    ? src.split(new RegExp(`--${boundaryMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\r?\\n`))
    : [src];

  const decodedTexts = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const splitIdx = trimmed.search(/\r?\n\r?\n/);
    const headersPart = splitIdx >= 0 ? trimmed.slice(0, splitIdx) : '';
    let contentPart = splitIdx >= 0 ? trimmed.slice(splitIdx).replace(/^\r?\n\r?\n/, '') : trimmed;

    const cteMatch = headersPart.match(/Content-Transfer-Encoding:\s*([^\r\n;]+)/i);
    const cte = cteMatch ? cteMatch[1].trim().toLowerCase() : '';
    const ctMatch = headersPart.match(/Content-Type:\s*([^\r\n;]+)/i);
    const ct = ctMatch ? ctMatch[1].trim().toLowerCase() : '';

    if (ct && !ct.startsWith('text/') && !ct.startsWith('multipart/')) {
      continue;
    }

    if (cte === 'base64') {
      try {
        contentPart = Buffer.from(contentPart.replace(/\s+/g, ''), 'base64').toString('utf8');
      } catch {}
    } else if (cte === 'quoted-printable') {
      contentPart = decodeQuotedPrintable(contentPart);
    }

    if (ct.includes('html') || /<html|<body|<table/i.test(contentPart)) {
      decodedTexts.push(stripHtmlToText(contentPart));
    } else {
      decodedTexts.push(contentPart.replace(/\s+/g, ' ').trim());
    }
  }

  return decodedTexts.join('\n').slice(0, 8000);
}

function quoteImapString(val) {
  const escaped = String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function formatImapDate(dateObj) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = dateObj.getUTCDate();
  const m = months[dateObj.getUTCMonth()];
  const y = dateObj.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Pure-Node TLS IMAP reader (no npm dependencies) with strict literal `{N}` framing
 * and `EXAMINE INBOX` / `BODY.PEEK` so inbox state remains untouched and unread flags stay intact.
 */
async function fetchRecentInboxEmails({ host, port = 993, user, pass, sinceHours = 24, maxMessages = 15 }) {
  if (!host || !user || !pass) {
    throw new Error('IMAP credentials incomplete.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let buf = Buffer.alloc(0);
    let waiter = null;
    let seq = 1;

    const socket = tls.connect({
      host,
      port: Number(port) || 993,
      family: 4,
      rejectUnauthorized: true
    });

    const cleanup = () => {
      try {
        socket.removeAllListeners();
        socket.destroy();
      } catch {}
    };

    const fail = err => {
      if (settled) return;
      settled = true;
      if (waiter) {
        const w = waiter;
        waiter = null;
        w.reject(err);
      }
      cleanup();
      reject(err);
    };

    socket.setTimeout(10000);
    socket.on('timeout', () => fail(new Error(`IMAP connection timed out after 10s (${host}:${port})`)));
    socket.on('error', err => fail(err));

    const tryConsume = () => {
      if (!waiter) return;
      const w = waiter;
      let pos = 0;
      const lines = [];
      const literals = [];

      while (pos < buf.length) {
        const crlf = buf.indexOf('\r\n', pos);
        if (crlf === -1) return; // wait for complete line

        const lineBuf = buf.slice(pos, crlf);
        const lineStr = lineBuf.toString('utf8');
        let nextPos = crlf + 2;

        const litMatch = lineStr.match(/\{(\d+)\}$/);
        if (litMatch) {
          const litLen = Number(litMatch[1]);
          if (nextPos + litLen > buf.length) {
            return; // wait for full literal bytes
          }
          const litText = buf.slice(nextPos, nextPos + litLen).toString('utf8');
          literals.push(litText);
          lines.push({ line: lineStr, literalIndex: literals.length - 1 });
          nextPos += litLen;
          pos = nextPos;
          continue;
        }

        lines.push({ line: lineStr, literalIndex: -1 });
        pos = nextPos;

        if (w.mode === 'greeting' && /^\* (OK|PREAUTH)\b/i.test(lineStr)) {
          buf = buf.slice(pos);
          waiter = null;
          w.resolve({ status: 'OK', lines, literals });
          return;
        }

        if (w.mode === 'tagged') {
          const tagMatch = lineStr.match(new RegExp(`^${w.tag} (OK|NO|BAD)\\b(.*)$`, 'i'));
          if (tagMatch) {
            buf = buf.slice(pos);
            waiter = null;
            const status = tagMatch[1].toUpperCase();
            const message = tagMatch[2].trim();
            if (status !== 'OK') {
              w.reject(new Error(`IMAP ${status}: ${message}`));
            } else {
              w.resolve({ status, message, lines, literals });
            }
            return;
          }
        }
      }
    };

    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      tryConsume();
    });

    const waitForGreeting = () =>
      new Promise((res, rej) => {
        waiter = { mode: 'greeting', resolve: res, reject: rej };
        tryConsume();
      });

    const sendCommand = commandText =>
      new Promise((res, rej) => {
        const tag = `A${String(seq++).padStart(3, '0')}`;
        waiter = { mode: 'tagged', tag, resolve: res, reject: rej };
        socket.write(`${tag} ${commandText}\r\n`);
      });

    (async () => {
      try {
        await waitForGreeting();
        await sendCommand(`LOGIN ${quoteImapString(user)} ${quoteImapString(pass)}`);
        await sendCommand('EXAMINE "INBOX"');

        const sinceDate = new Date(Date.now() - Math.max(1, sinceHours) * 60 * 60 * 1000);
        const searchRes = await sendCommand(`UID SEARCH SINCE ${formatImapDate(sinceDate)}`);
        const uidTokens = [];
        for (const entry of searchRes.lines) {
          if (entry.line.startsWith('* SEARCH')) {
            const parts = entry.line.slice('* SEARCH'.length).trim().split(/\s+/).filter(Boolean);
            for (const p of parts) {
              if (/^\d+$/.test(p)) uidTokens.push(p);
            }
          }
        }

        const recentUids = uidTokens.slice(-maxMessages).reverse();
        const messages = [];

        for (const uid of recentUids) {
          const fetchRes = await sendCommand(
            `UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)] BODY.PEEK[TEXT])`
          );
          const headerRaw = fetchRes.literals[0] || '';
          const bodyRaw = fetchRes.literals[1] || '';

          const fromMatch = headerRaw.match(/^From:\s*(.+)$/im);
          const subjMatch = headerRaw.match(/^Subject:\s*(.+)$/im);
          const dateMatch = headerRaw.match(/^Date:\s*(.+)$/im);
          const msgIdMatch = headerRaw.match(/^Message-ID:\s*(.+)$/im);

          messages.push({
            uid,
            messageId: msgIdMatch ? msgIdMatch[1].trim() : `uid-${uid}`,
            from: decodeMimeWord(fromMatch ? fromMatch[1].trim() : ''),
            subject: decodeMimeWord(subjMatch ? subjMatch[1].trim() : ''),
            date: dateMatch ? dateMatch[1].trim() : '',
            body: decodeMimeBody(bodyRaw)
          });
        }

        await sendCommand('LOGOUT').catch(() => {});
        if (!settled) {
          settled = true;
          cleanup();
          resolve(messages);
        }
      } catch (err) {
        fail(err);
      }
    })();
  });
}

function buildObservationFingerprint({ source, bankRef, amountPaise, messageKey, observedAt, rawSnippet }) {
  if (bankRef && bankRef.length >= 6) {
    return crypto
      .createHash('sha256')
      .update(`${source}|UTR|${bankRef.toUpperCase()}|${amountPaise}`)
      .digest('hex');
  }
  const bucket = Math.floor(new Date(observedAt || Date.now()).getTime() / (60 * 1000));
  const discriminator = messageKey || `${bucket}|${String(rawSnippet || '').slice(0, 120)}`;
  return crypto
    .createHash('sha256')
    .update(`${source}|MSG|${amountPaise}|${discriminator}`)
    .digest('hex');
}

/**
 * Core automated verification pipeline:
 * 1) Authenticates bank email domain / DLT SMS sender header
 * 2) Extracts monetary paise, UTR/RRN, and credit-first semantics
 * 3) Enforces UTR replay/duplicate blocking + ambiguous-amount holding
 * 4) Dispatches HMAC-signed YouPI webhook to unlock event pass, competitions, WhatsApp, and email.
 */
async function ingestBankObservation({
  source = 'IMAP_EMAIL',
  sender = '',
  subject = '',
  text = '',
  observedAt = new Date(),
  messageKey = '',
  explicitAmountPaise = null,
  explicitBankRef = '',
  explicitSenderVpa = '',
  autoReconcileOverride = null
}) {
  const cleanSource = ['IMAP_EMAIL', 'SMS_OBSERVER', 'STATEMENT_CSV', 'MANUAL'].includes(source)
    ? source
    : 'IMAP_EMAIL';
  const combinedRaw = `${subject ? `${subject} ` : ''}${text || ''}`.trim();
  const safeSnippet = sanitizePlainText(redactSensitiveData(combinedRaw.slice(0, 320)), 320);

  if (cleanSource === 'IMAP_EMAIL' && !isAuthorizedBankEmailSender(sender)) {
    const fp = buildObservationFingerprint({
      source: cleanSource,
      bankRef: '',
      amountPaise: 0,
      messageKey: messageKey || `${sender}:${safeSnippet.slice(0, 80)}`,
      observedAt,
      rawSnippet: safeSnippet
    });
    const obs = await YoupiBankObservation.findOneAndUpdate(
      { fingerprint: fp },
      {
        $setOnInsert: {
          fingerprint: fp,
          source: cleanSource,
          sender: sanitizePlainText(sender, 160),
          bankRef: '',
          amountPaise: 0,
          observedAt: new Date(observedAt || Date.now()),
          rawSnippet: safeSnippet,
          attributionStatus: 'REJECTED_SPOOF',
          reason: 'Rejected: Email sender domain is not an authorized RBI/NPCI commercial bank domain.'
        }
      },
      { upsert: true, new: true }
    );
    return { accepted: false, status: 'REJECTED_SPOOF', observation: obs };
  }

  if (cleanSource === 'SMS_OBSERVER' && !isLikelyBankSmsSender(sender)) {
    const fp = buildObservationFingerprint({
      source: cleanSource,
      bankRef: '',
      amountPaise: 0,
      messageKey: messageKey || `${sender}:${safeSnippet.slice(0, 80)}`,
      observedAt,
      rawSnippet: safeSnippet
    });
    const obs = await YoupiBankObservation.findOneAndUpdate(
      { fingerprint: fp },
      {
        $setOnInsert: {
          fingerprint: fp,
          source: cleanSource,
          sender: sanitizePlainText(sender, 160),
          bankRef: '',
          amountPaise: 0,
          observedAt: new Date(observedAt || Date.now()),
          rawSnippet: safeSnippet,
          attributionStatus: 'REJECTED_SPOOF',
          reason: 'Rejected: SMS sender ID did not pass TRAI DLT alphanumeric bank header verification.'
        }
      },
      { upsert: true, new: true }
    );
    return { accepted: false, status: 'REJECTED_SPOOF', observation: obs };
  }

  let amountPaise = Number.isSafeInteger(Number(explicitAmountPaise)) ? Number(explicitAmountPaise) : 0;
  let bankRef = sanitizePlainText(explicitBankRef || '', 40).replace(/\s+/g, '');
  let parsedSenderVpa = sanitizePlainText(explicitSenderVpa || '', 120);
  let obsDate = new Date(observedAt || Date.now());
  if (Number.isNaN(obsDate.getTime())) obsDate = new Date();
  let finalSnippet = safeSnippet;

  if (amountPaise <= 0) {
    const parsed =
      cleanSource === 'SMS_OBSERVER'
        ? BankSmsParser.parse({ sender, text: combinedRaw, timestamp: observedAt })
        : BankEmailParser.parse({ from: sender, subject, body: text, date: observedAt });

    if (!parsed || !parsed.amountPaise || parsed.amountPaise <= 0) {
      return {
        accepted: false,
        status: 'IGNORED_NON_CREDIT',
        reason: 'Message did not match verified credit-first bank alert format.'
      };
    }
    amountPaise = parsed.amountPaise;
    bankRef = bankRef || parsed.bankReferenceNumber || '';
    parsedSenderVpa = parsedSenderVpa || parsed.senderVpa || '';
    if (parsed.observedAt) obsDate = parsed.observedAt;
    if (parsed.rawSnippet) finalSnippet = sanitizePlainText(parsed.rawSnippet, 320);
  }

  const fingerprint = buildObservationFingerprint({
    source: cleanSource,
    bankRef,
    amountPaise,
    messageKey,
    observedAt: obsDate,
    rawSnippet: finalSnippet
  });

  const alreadyProcessed = await YoupiBankObservation.findOne({ fingerprint });
  if (alreadyProcessed) {
    return {
      accepted: false,
      duplicate: true,
      status: alreadyProcessed.attributionStatus,
      observation: alreadyProcessed
    };
  }

  // Global anti-replay UTR check across settled sessions & registrations
  if (bankRef && bankRef.length >= 6) {
    const utrRegex = new RegExp(`^${bankRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const [settledSession, paidReg] = await Promise.all([
      YoupiPaymentSession.findOne({
        utr: utrRegex,
        status: { $in: ['RECONCILED', 'OBSERVED_SUCCESS', 'SUCCESS'] }
      }).select('paymentId orderId'),
      Registration.findOne({
        transactionId: utrRegex,
        paymentStatus: 'paid'
      }).select('_id youpiPaymentId')
    ]);

    if (settledSession || paidReg) {
      const dupObs = await YoupiBankObservation.create({
        fingerprint,
        source: cleanSource,
        sender: sanitizePlainText(sender, 160),
        bankRef,
        amountPaise,
        senderVpa: parsedSenderVpa,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        attributionStatus: 'DUPLICATE_UTR',
        matchedPaymentId: settledSession?.paymentId || paidReg?.youpiPaymentId || '',
        matchedOrderId: settledSession?.orderId || '',
        reason: 'Bank reference / UTR was already settled against another transaction.'
      });
      return { accepted: false, status: 'DUPLICATE_UTR', observation: dupObs };
    }
  }

  // Find candidate checkout sessions with exact integer-paise amount
  const isCsvStatement = cleanSource === 'STATEMENT_CSV';
  const lookbackStart = new Date(Date.now() - (isCsvStatement ? 72 : 36) * 60 * 60 * 1000);
  const graceMs = 15 * 60 * 1000;
  const rawCandidates = await YoupiPaymentSession.find({
    amountPaise,
    status: { $in: ['ACTIVE', 'INITIATED', 'PROCESSING', 'MANUAL_REVIEW'] },
    createdAt: { $gte: lookbackStart }
  }).sort({ createdAt: -1 });

  let openCandidates;
  if (isCsvStatement) {
    // Bank statement CSVs are date-only (no HH:MM timestamp, e.g. IST morning credits vs 12:00Z marker),
    // so filter by calendar window (+-36h around statement date) rather than intraday minute expiry.
    const csvWindowMs = 36 * 60 * 60 * 1000;
    openCandidates = rawCandidates.filter(c => {
      const refTime = c.createdAt ? c.createdAt.getTime() : Date.now();
      return Math.abs(obsDate.getTime() - refTime) <= csvWindowMs;
    });

    // If student paid right as checkout timed out into EXPIRED and closed tab before bank CSV upload,
    // allow unambiguous CSV recovery without polluting active checkouts with spurious ambiguity.
    if (openCandidates.length === 0) {
      const expiredCandidates = await YoupiPaymentSession.find({
        amountPaise,
        status: 'EXPIRED',
        createdAt: { $gte: lookbackStart }
      })
        .sort({ createdAt: -1 })
        .limit(10);
      openCandidates = expiredCandidates.filter(c => {
        const refTime = c.createdAt ? c.createdAt.getTime() : Date.now();
        return Math.abs(obsDate.getTime() - refTime) <= csvWindowMs;
      });
    }
  } else {
    openCandidates = rawCandidates.filter(c => {
      if (c.status === 'MANUAL_REVIEW') return true;
      if (!c.expiresAt) return true;
      return c.expiresAt.getTime() + graceMs >= obsDate.getTime();
    });
  }

  let matchedCandidate = null;
  let ambiguityReason = '';

  // Priority 1: Exact Order ID mention in bank narration/text
  const orderMatched = openCandidates.filter(
    c => c.orderId && combinedRaw.toUpperCase().includes(c.orderId.toUpperCase())
  );
  if (orderMatched.length === 1) {
    matchedCandidate = orderMatched[0];
  }

  // Priority 2: Exact UTR match against a student-submitted MANUAL_REVIEW session
  if (!matchedCandidate && bankRef && bankRef.length >= 6) {
    const utrMatched = openCandidates.filter(
      c => c.utr && c.utr.trim().toUpperCase() === bankRef.toUpperCase()
    );
    if (utrMatched.length === 1) {
      matchedCandidate = utrMatched[0];
    } else if (utrMatched.length > 1) {
      ambiguityReason = `${utrMatched.length} sessions share UTR ${bankRef}.`;
    }
  }

  // Priority 3: Unique open session sharing the exact paise amount
  if (!matchedCandidate && !ambiguityReason) {
    if (openCandidates.length === 1) {
      const only = openCandidates[0];
      // Safety check: if student explicitly submitted a DIFFERENT 12-digit UTR, hold for review
      if (
        only.utr &&
        bankRef &&
        only.utr.trim().toUpperCase() !== bankRef.toUpperCase()
      ) {
        ambiguityReason = `Open session has student-submitted UTR (${only.utr}) that differs from observed bank ref (${bankRef}). Held for admin review.`;
      } else {
        matchedCandidate = only;
      }
    } else if (openCandidates.length > 1) {
      ambiguityReason = `Ambiguous credit: ${openCandidates.length} open checkout sessions share exact amount ₹${toRupeesString(amountPaise)} without unique UTR/orderId.`;
    }
  }

  if (ambiguityReason) {
    const ambObs = await YoupiBankObservation.create({
      fingerprint,
      source: cleanSource,
      sender: sanitizePlainText(sender, 160),
      bankRef,
      amountPaise,
      senderVpa: parsedSenderVpa,
      observedAt: obsDate,
      rawSnippet: finalSnippet,
      attributionStatus: 'AMBIGUOUS',
      reason: ambiguityReason
    });
    return { accepted: false, status: 'AMBIGUOUS', reason: ambiguityReason, observation: ambObs };
  }

  if (!matchedCandidate) {
    const unattrObs = await YoupiBankObservation.create({
      fingerprint,
      source: cleanSource,
      sender: sanitizePlainText(sender, 160),
      bankRef,
      amountPaise,
      senderVpa: parsedSenderVpa,
      observedAt: obsDate,
      rawSnippet: finalSnippet,
      attributionStatus: 'OBSERVED_UNATTRIBUTED',
      reason: 'No open checkout session matched this exact credited amount.'
    });
    return { accepted: false, status: 'OBSERVED_UNATTRIBUTED', observation: unattrObs };
  }

  // Matched! Stamp observation evidence & dispatch verified YouPI HMAC settlement webhook
  matchedCandidate.observationSource = cleanSource;
  matchedCandidate.observedAt = obsDate;
  matchedCandidate.observedAmountPaise = amountPaise;
  if (parsedSenderVpa) matchedCandidate.observedSenderVpa = parsedSenderVpa;
  matchedCandidate.observedRawSnippet = finalSnippet;
  await matchedCandidate.save();

  const youpiCfg = getYoupiConfig();
  const autoCfg = await getAutomationConfig();
  const shouldReconcile =
    autoReconcileOverride !== null ? Boolean(autoReconcileOverride) : autoCfg.autoReconcileObserved;

  const targetStatus = shouldReconcile ? 'RECONCILED' : 'OBSERVED_SUCCESS';
  const eventType = shouldReconcile ? 'PAYMENT.RECONCILED' : 'PAYMENT.OBSERVED_SUCCESS';
  const finalBankRef = bankRef || matchedCandidate.utr || matchedCandidate.orderId;

  const signed = signWebhookPayload(
    {
      event: eventType,
      status: targetStatus,
      settlementState: settlementStateFor(targetStatus),
      paymentId: matchedCandidate.paymentId,
      orderId: matchedCandidate.orderId,
      amount: toRupeesString(matchedCandidate.amountPaise),
      amountPaise: String(matchedCandidate.amountPaise),
      currency: matchedCandidate.currency || 'INR',
      method: matchedCandidate.method || 'UPI',
      bankRef: finalBankRef,
      utr: finalBankRef,
      verificationTag: `AUTO_${cleanSource}_VERIFIED`,
      verificationLevel: cleanSource === 'STATEMENT_CSV' ? 3 : 2,
      completedAt: new Date().toISOString()
    },
    youpiCfg.webhookSecret
  );

  const webhookRes = await processIncomingWebhook({
    rawBody: signed.rawBody,
    signatureHeader: signed.signatureHeader,
    timestampHeader: signed.timestamp,
    deliveryIdHeader: signed.deliveryId
  });

  const savedObs = await YoupiBankObservation.create({
    fingerprint,
    source: cleanSource,
    sender: sanitizePlainText(sender, 160),
    bankRef: finalBankRef,
    amountPaise,
    senderVpa: parsedSenderVpa,
    observedAt: obsDate,
    rawSnippet: finalSnippet,
    attributionStatus: shouldReconcile ? 'MATCHED_RECONCILED' : 'MATCHED_OBSERVED',
    matchedPaymentId: matchedCandidate.paymentId,
    matchedOrderId: matchedCandidate.orderId,
    reason: `Automatically matched and settled via ${cleanSource}.`
  });

  return {
    accepted: true,
    status: savedObs.attributionStatus,
    observation: savedObs,
    session: webhookRes.session,
    registration: webhookRes.registration
  };
}

async function pollBankInboxOnce({ force = false } = {}) {
  if (_isPolling) {
    return { ok: true, skipped: true, reason: 'Poll already in progress' };
  }
  _isPolling = true;
  try {
    const cfg = await getAutomationConfig({ includeSecrets: true });
    if (!cfg.imapConfigured) {
      return {
        ok: false,
        skipped: true,
        reason: 'Bank IMAP email credentials are not configured.'
      };
    }

    if (!force && !cfg.autoVerifyEnabled) {
      return { ok: false, skipped: true, reason: 'Auto-verification is paused.' };
    }

    const emails = await fetchRecentInboxEmails({
      host: cfg.imapHost,
      port: cfg.imapPort,
      user: cfg.imapUser,
      pass: cfg.imapPass,
      sinceHours: 24,
      maxMessages: 20
    });

    const summary = {
      ok: true,
      scanned: emails.length,
      matched: 0,
      ambiguous: 0,
      unattributed: 0,
      duplicate: 0,
      rejectedSpoof: 0,
      ignored: 0,
      polledAt: new Date().toISOString()
    };

    for (const msg of emails) {
      const res = await ingestBankObservation({
        source: 'IMAP_EMAIL',
        sender: msg.from,
        subject: msg.subject,
        text: msg.body,
        observedAt: msg.date || new Date(),
        messageKey: msg.messageId || msg.uid
      });
      if (res.duplicate) summary.duplicate += 1;
      else if (res.accepted) summary.matched += 1;
      else if (res.status === 'AMBIGUOUS') summary.ambiguous += 1;
      else if (res.status === 'OBSERVED_UNATTRIBUTED') summary.unattributed += 1;
      else if (res.status === 'REJECTED_SPOOF') summary.rejectedSpoof += 1;
      else summary.ignored += 1;
    }

    await SystemSetting.findOneAndUpdate(
      { key: 'global' },
      {
        $set: {
          youpiLastPollAt: new Date(),
          youpiLastPollResult: summary
        }
      },
      { upsert: true }
    ).catch(() => {});

    return summary;
  } catch (err) {
    const errSummary = {
      ok: false,
      error: err.message,
      polledAt: new Date().toISOString()
    };
    await SystemSetting.findOneAndUpdate(
      { key: 'global' },
      {
        $set: {
          youpiLastPollAt: new Date(),
          youpiLastPollResult: errSummary
        }
      },
      { upsert: true }
    ).catch(() => {});
    return errSummary;
  } finally {
    _isPolling = false;
  }
}

async function reconcileStatementCsv({ csvText, adminUser = null }) {
  const parsed = parseStatementCsv(csvText);
  if (parsed.error) {
    const err = new Error(
      parsed.error === 'STATEMENT_TOO_LARGE'
        ? 'CSV statement exceeds the 2000-row limit.'
        : 'Unsupported bank CSV format. Expected Date, Narration/Description, and Credit/Deposit columns.'
    );
    err.status = 400;
    err.code = parsed.error;
    throw err;
  }

  const creditLines = parsed.lines.filter(l => l.direction === 'CREDIT');
  const results = [];
  let matchedCount = 0;
  let ambiguousCount = 0;
  let unattributedCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < creditLines.length; i++) {
    const line = creditLines[i];
    const messageKey = `CSV:${line.bookedOn}:${line.amountPaise}:${line.utr || line.ref || i}:${i}`;
    const res = await ingestBankObservation({
      source: 'STATEMENT_CSV',
      sender: adminUser?.email || 'bank-statement-csv',
      subject: `Statement Credit ${line.bookedOn}`,
      text: `${line.narration} ${line.ref || ''}`.trim(),
      observedAt: new Date(`${line.bookedOn}T12:00:00Z`),
      messageKey,
      explicitAmountPaise: line.amountPaise,
      explicitBankRef: line.utr || '',
      autoReconcileOverride: true
    });

    if (res.duplicate) duplicateCount += 1;
    else if (res.accepted) matchedCount += 1;
    else if (res.status === 'AMBIGUOUS') ambiguousCount += 1;
    else if (res.status === 'OBSERVED_UNATTRIBUTED') unattributedCount += 1;

    results.push({
      bookedOn: line.bookedOn,
      amount: toRupeesString(line.amountPaise),
      utr: line.utr || '',
      status: res.duplicate ? 'DUPLICATE' : res.status,
      matchedOrderId: res.observation?.matchedOrderId || ''
    });
  }

  return {
    totalRows: parsed.lines.length,
    creditRows: creditLines.length,
    matchedCount,
    ambiguousCount,
    unattributedCount,
    duplicateCount,
    details: results.slice(0, 50)
  };
}

function startPaymentAutomationScheduler() {
  if (_schedulerTimer) return _schedulerTimer;

  _schedulerTimer = setInterval(async () => {
    try {
      const cfg = await getAutomationConfig({ includeSecrets: true });
      if (!cfg.autoVerifyEnabled || !cfg.imapConfigured) return;

      const hasOpenSession = await YoupiPaymentSession.exists({
        status: { $in: ['ACTIVE', 'PROCESSING', 'MANUAL_REVIEW'] }
      });
      if (!hasOpenSession) return;

      await pollBankInboxOnce();
    } catch (err) {
      console.warn('YouPI auto-poll scheduler warning:', err.message);
    }
  }, 15000);

  if (typeof _schedulerTimer.unref === 'function') {
    _schedulerTimer.unref();
  }
  return _schedulerTimer;
}

function stopPaymentAutomationScheduler() {
  if (_schedulerTimer) {
    clearInterval(_schedulerTimer);
    _schedulerTimer = null;
  }
}

module.exports = {
  getAutomationConfig,
  fetchRecentInboxEmails,
  decodeMimeBody,
  ingestBankObservation,
  pollBankInboxOnce,
  reconcileStatementCsv,
  startPaymentAutomationScheduler,
  stopPaymentAutomationScheduler
};
