const tls = require('tls');
const crypto = require('crypto');
const SystemSetting = require('../../models/system/SystemSetting');
const User = require('../../models/auth/User');
const Event = require('../../models/events/Event');
const Notification = require('../../models/community/Notification');
const Registration = require('../../models/events/Registration');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const YoupiBankObservation = require('../../models/payments/YoupiBankObservation');
const YoupiStatementLine = require('../../models/payments/YoupiStatementLine');
const YoupiAndroidDevice = require('../../models/payments/YoupiAndroidDevice');
const { sanitizePlainText } = require('../../utils/sanitize');
const { generateQrSvg } = require('../../utils/qrGenerator');
const {
  STATEMENT_POSTING_DAYS,
  MAX_SCAN_CHARS,
  getChannelFamily,
  calculateObservationFingerprint,
  isAuthorizedBankEmailSender,
  isPureNumericSender,
  isLikelyBankSmsSender,
  extractIntelligentAmount,
  redactSensitiveData,
  BankEmailParser,
  BankSmsParser,
  parseStatementCsv,
  calendarDateInIndia,
  addCalendarDays
} = require('./bankAlertParserService');
const {
  PaymentEventBus,
  PaymentStatus,
  PaymentMethod,
  isAllowedNotificationPackage,
  getYoupiConfig,
  parseVpaList,
  normalizeReceivingAccountId,
  toRupeesString,
  signWebhookPayload,
  processIncomingWebhook,
  settlementStateFor,
  markSessionObservedNotReconciled,
  holdSessionManualReview,
  promoteNext,
  emitSessionUpdate,
  serializeSessionDto
} = require('./youpiGatewayService');

let _schedulerTimer = null;
let _isPolling = false;
const pendingGraceTimers = new Map();

function getGracePeriodMs() {
  if (process.env.PAYMENT_GRACE_PERIOD_MS !== undefined && process.env.PAYMENT_GRACE_PERIOD_MS !== '') {
    const val = Number(process.env.PAYMENT_GRACE_PERIOD_MS);
    if (Number.isFinite(val) && val >= 0) return val;
  }
  const isTestExecution =
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.NODE_TEST_CONTEXT) ||
    (process.execArgv && process.execArgv.some(a => a.includes('test'))) ||
    (process.argv && process.argv.some(a => a.includes('test')));
  return isTestExecution ? 0 : 5000;
}

function destroyAttributionTimers() {
  for (const timer of pendingGraceTimers.values()) {
    clearTimeout(timer);
  }
  pendingGraceTimers.clear();
}

function maskSecret(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createServiceError(message, status = 400, code = 'BAD_REQUEST', extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

async function getOrCreateAndroidEnrollmentSecret() {
  const envVal = String(process.env.ANDROID_ENROLLMENT_SECRET || '').trim();
  if (envVal) return envVal;

  const settingsDoc = await SystemSetting.findOne({ key: 'global' })
    .select('youpiAndroidEnrollmentSecret youpiObserverSecret')
    .lean()
    .catch(() => null);
  const stored = String(settingsDoc?.youpiAndroidEnrollmentSecret || '').trim();
  if (stored) return stored;

  const generated = crypto.randomBytes(24).toString('hex');
  await SystemSetting.findOneAndUpdate(
    { key: 'global' },
    { $set: { youpiAndroidEnrollmentSecret: generated } },
    { upsert: true }
  ).catch(() => {});
  return generated;
}

async function getAutomationConfig({ includeSecrets = false } = {}) {
  const settingsDoc = await SystemSetting.findOne({ key: 'global' })
    .select(
      'youpiBackupVpas youpiAutoVerifyEnabled youpiImapHost youpiImapPort youpiImapUser youpiImapPass youpiObserverSecret youpiAndroidEnrollmentSecret youpiLastPollAt youpiLastPollResult'
    )
    .lean()
    .catch(() => null);

  const envConfig = getYoupiConfig();
  const autoVerifyEnabled =
    typeof settingsDoc?.youpiAutoVerifyEnabled === 'boolean'
      ? settingsDoc.youpiAutoVerifyEnabled
      : String(process.env.YOUPI_AUTO_VERIFY_ENABLED || 'true').trim().toLowerCase() !== 'false';

  const imapHost = String(settingsDoc?.youpiImapHost || process.env.YOUPI_IMAP_HOST || 'imap.gmail.com').trim();
  const imapPort = Number(settingsDoc?.youpiImapPort || process.env.YOUPI_IMAP_PORT || 993) || 993;
  const imapUser = String(settingsDoc?.youpiImapUser || process.env.YOUPI_IMAP_USER || '').trim();
  const imapPass = String(settingsDoc?.youpiImapPass || process.env.YOUPI_IMAP_PASS || '').trim();
  const observerSecret = String(
    settingsDoc?.youpiObserverSecret || process.env.YOUPI_OBSERVER_SECRET || ''
  ).trim();
  const androidEnrollmentSecret = await getOrCreateAndroidEnrollmentSecret();

  const backupVpas = parseVpaList([
    ...(Array.isArray(settingsDoc?.youpiBackupVpas) ? settingsDoc.youpiBackupVpas : []),
    ...envConfig.backupPayeeVpas
  ]).filter(v => v.toLowerCase() !== envConfig.defaultPayeeVpa.toLowerCase());

  const base = {
    primaryVpa: envConfig.defaultPayeeVpa,
    backupVpas,
    autoVerifyEnabled,
    // Zero-Trust invariant: bank alerts alone never mark RECONCILED/SUCCESS
    fulfillOnObserved: false,
    imapHost,
    imapPort,
    imapUser,
    imapConfigured: Boolean(imapHost && imapUser && imapPass),
    hasImapPass: Boolean(imapPass),
    imapPassHint: maskSecret(imapPass),
    observerConfigured: Boolean(observerSecret),
    hasObserverSecret: Boolean(observerSecret),
    observerSecretHint: maskSecret(observerSecret),
    hasAndroidEnrollmentSecret: Boolean(androidEnrollmentSecret),
    androidEnrollmentSecretHint: maskSecret(androidEnrollmentSecret),
    activeWindowMs: envConfig.activeDurationMs,
    processingWindowMs: envConfig.processingDurationMs,
    gracePeriodMs: getGracePeriodMs(),
    lastPollAt: settingsDoc?.youpiLastPollAt || null,
    lastPollResult: settingsDoc?.youpiLastPollResult || null
  };

  if (includeSecrets) {
    return {
      ...base,
      imapPass,
      observerSecret,
      androidEnrollmentSecret
    };
  }
  return base;
}

// =============================================================================
// Android Native SMS & Notification Observer Device Management
// =============================================================================

async function buildSmsGatewayPairingQrData({ receivingAccountId = '', baseUrl = '' } = {}) {
  const cfg = getYoupiConfig();
  const recId = normalizeReceivingAccountId(receivingAccountId || cfg.defaultPayeeVpa);
  const token = await getOrCreateAndroidEnrollmentSecret();
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;
  const gatewayUrl = String(baseUrl || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, '');

  const pairingPayloadObj = {
    version: 'v1',
    type: 'YOUPI_SMS_GATEWAY_PAIR',
    serverUrl: gatewayUrl,
    gatewayUrl,
    apiBaseUrl: `${gatewayUrl}/api/payments/youpi`,
    sessionId,
    token,
    enrollmentToken: token,
    receivingAccountId: recId,
    merchantId: cfg.merchantId,
    createdAt: now,
    expiresAt
  };
  const pairingPayload = JSON.stringify(pairingPayloadObj);
  const qrSvg = await generateQrSvg(pairingPayload, { boxSize: 260, errorCorrection: 'M' });
  const devices = await listAndroidDevices();

  return {
    qrSvg,
    pairingQrSvg: qrSvg,
    pairingPayload,
    payload: pairingPayloadObj,
    sessionId,
    expiresAt,
    version: 'v1',
    token,
    enrollmentToken: token,
    receivingAccountId: recId,
    gatewayUrl,
    serverUrl: gatewayUrl,
    devices
  };
}

async function pairAndroidDevice({
  token = '',
  enrollmentToken = '',
  expiresAt = null,
  version = '',
  deviceName = 'Android SMS Gateway',
  deviceModel = 'Android Device',
  receivingAccountId = '',
  pairedBy = null
} = {}) {
  const provided = String(enrollmentToken || token || '').trim();
  const secret = await getOrCreateAndroidEnrollmentSecret();

  if (!provided || !safeEqual(provided, secret)) {
    throw createServiceError('Invalid or expired device pairing enrollment token.', 401, 'INVALID_ENROLLMENT_TOKEN');
  }
  if (expiresAt && Date.now() > Number(expiresAt)) {
    throw createServiceError('PAIRING QR EXPIRED', 400, 'PAIRING_QR_EXPIRED');
  }
  if (version && version !== 'v1') {
    throw createServiceError('INVALID YOUPI PAIRING QR', 400, 'INVALID_PAIRING_QR');
  }

  const cfg = getYoupiConfig();
  const recId = normalizeReceivingAccountId(receivingAccountId || cfg.defaultPayeeVpa);
  const deviceId = crypto.randomUUID();
  const signingKey = crypto.randomBytes(32).toString('hex');
  const now = new Date();

  const created = await YoupiAndroidDevice.create({
    deviceId,
    deviceName: sanitizePlainText(deviceName, 120) || 'Android SMS Gateway',
    deviceModel: sanitizePlainText(deviceModel, 120) || 'Android Device',
    signingKey,
    receivingAccountId: recId,
    isActive: true,
    lastHeartbeatAt: now,
    pairedBy: pairedBy || null
  });

  return {
    paired: true,
    deviceId: created.deviceId,
    signingKey: created.signingKey,
    receivingAccountId: created.receivingAccountId,
    merchantId: cfg.merchantId,
    message: 'Android SMS Gateway paired successfully.'
  };
}

async function verifyAndroidDeviceHmac({ deviceId, timestampHeader, signatureHeader, rawBodyText }) {
  if (!deviceId) {
    throw createServiceError('Missing required X-Device-Id header or deviceId.', 400, 'MISSING_DEVICE_ID');
  }

  const device = await YoupiAndroidDevice.findOne({ deviceId: String(deviceId).trim(), isActive: true });
  if (!device) {
    throw createServiceError('Device not authorized or inactive.', 403, 'DEVICE_UNAUTHORIZED');
  }

  if (!device.signingKey || !timestampHeader || !signatureHeader) {
    throw createServiceError('Missing X-Timestamp / X-Signature headers.', 401, 'MISSING_HMAC_HEADERS');
  }

  const ts = Number(timestampHeader);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > 60000) {
    throw createServiceError(
      'Timestamp drift exceeded validity window (replay protection triggered).',
      401,
      'TIMESTAMP_DRIFT'
    );
  }

  const cleanSig = String(signatureHeader).replace(/^sha256=/i, '').trim().toLowerCase();
  const expected = crypto
    .createHmac('sha256', device.signingKey)
    .update(`${rawBodyText}:${String(timestampHeader)}`)
    .digest('hex');

  if (!safeEqual(cleanSig, expected)) {
    throw createServiceError('Invalid cryptographic HMAC signature.', 401, 'INVALID_HMAC_SIGNATURE');
  }

  return device;
}

async function listAndroidDevices() {
  const rows = await YoupiAndroidDevice.find({})
    .select('deviceId deviceName deviceModel receivingAccountId isActive lastHeartbeatAt lastObservationAt revokedAt createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const now = Date.now();
  return rows.map(d => {
    const lastSeen = d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).getTime() : 0;
    const isConnected = Boolean(d.isActive) && lastSeen > 0 && now - lastSeen < 180000;
    return {
      id: d.deviceId,
      deviceId: d.deviceId,
      deviceName: d.deviceName || d.deviceModel || 'Android Observer',
      deviceModel: d.deviceModel || '',
      receivingAccountId: d.receivingAccountId || '',
      isActive: Boolean(d.isActive),
      connectionStatus: isConnected ? 'CONNECTED' : d.isActive ? 'STANDBY' : 'REVOKED',
      lastHeartbeatAt: d.lastHeartbeatAt,
      lastObservationAt: d.lastObservationAt,
      revokedAt: d.revokedAt,
      createdAt: d.createdAt,
      pairedAt: d.createdAt
    };
  });
}

async function revokeAndroidDevice(deviceId) {
  const doc = await YoupiAndroidDevice.findOneAndUpdate(
    { deviceId: String(deviceId).trim() },
    { $set: { isActive: false, revokedAt: new Date() } },
    { new: true }
  );
  if (!doc) {
    throw createServiceError('Android observer device not found.', 404, 'DEVICE_NOT_FOUND');
  }
  return {
    success: true,
    deviceId: doc.deviceId,
    isActive: false,
    revokedAt: doc.revokedAt
  };
}

async function deleteAndroidDevice(deviceId) {
  await YoupiAndroidDevice.deleteOne({ deviceId: String(deviceId).trim() });
  return { success: true, message: 'Device unlinked.' };
}

async function recordAndroidHeartbeat(deviceId) {
  if (deviceId) {
    await YoupiAndroidDevice.updateOne(
      { deviceId: String(deviceId).trim(), isActive: true },
      { $set: { lastHeartbeatAt: new Date() } }
    ).catch(() => {});
  }
  return { status: 'HEARTBEAT_ACK', timestamp: Date.now() };
}

async function getActivePollWindowStatus({ receivingAccountId = '' } = {}) {
  const cfg = getYoupiConfig();
  const filterAcc = receivingAccountId ? normalizeReceivingAccountId(receivingAccountId) : '';
  const sixtySecsAgo = new Date(Date.now() - 60000);

  const query = {
    gatewayMode: 'embedded',
    $or: [
      { status: { $in: [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING] } },
      {
        status: PaymentStatus.OBSERVED_SUCCESS,
        verificationLevel: { $lt: 2 },
        completedAt: { $gte: sixtySecsAgo }
      }
    ]
  };
  if (filterAcc) {
    query.receivingAccountId = filterAcc;
  }

  const sessions = await YoupiPaymentSession.find(query)
    .select(
      'paymentId orderId receivingAccountId payeeVpa amountPaise status verificationLevel expiresAt processingExpiresAt completedAt'
    )
    .sort({ createdAt: -1 })
    .lean();

  return {
    hasActivePayment: sessions.length > 0,
    receivingAccountId: filterAcc || normalizeReceivingAccountId(cfg.defaultPayeeVpa) || null,
    sessions: sessions.map(s => ({
      id: s.paymentId,
      paymentId: s.paymentId,
      orderId: s.orderId,
      receivingAccountId: s.receivingAccountId || normalizeReceivingAccountId(s.payeeVpa),
      amount: toRupeesString(s.amountPaise),
      amountPaise: String(s.amountPaise),
      status: s.status,
      verificationLevel: s.verificationLevel || 0,
      expiresAt: s.expiresAt,
      processingExpiresAt: s.processingExpiresAt
    }))
  };
}

// =============================================================================
// Pure-Node IMAP TLS Reader
// =============================================================================

function decodeMimeWord(str) {
  return String(str || '').replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, _charset, encoding, data) => {
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
  return `${dateObj.getUTCDate()}-${months[dateObj.getUTCMonth()]}-${dateObj.getUTCFullYear()}`;
}

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
        if (crlf === -1) return;

        const lineBuf = buf.slice(pos, crlf);
        const lineStr = lineBuf.toString('utf8');
        let nextPos = crlf + 2;

        const litMatch = lineStr.match(/\{(\d+)\}$/);
        if (litMatch) {
          const litLen = Number(litMatch[1]);
          if (nextPos + litLen > buf.length) return;
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

// =============================================================================
// Verification Pipeline (Stages 1-6) & Attribution Engine (Zero-Trust)
// =============================================================================

async function createSpoofOrRejectionObservation({
  fingerprint,
  channelFamily,
  source,
  receivingAccountId,
  sender,
  bankRef = '',
  amountPaise = 0,
  observedAt,
  rawSnippet,
  rawPayload,
  attributionStatus = 'REJECTED_SPOOF',
  matchedSessionId = null,
  matchedPaymentId = '',
  matchedOrderId = '',
  reason = ''
}) {
  return YoupiBankObservation.findOneAndUpdate(
    { fingerprint, channelFamily },
    {
      $setOnInsert: {
        fingerprint,
        channelFamily,
        source,
        receivingAccountId,
        sender: sanitizePlainText(sender, 160),
        bankRef,
        amountPaise,
        observedAt: new Date(observedAt || Date.now()),
        rawSnippet: sanitizePlainText(rawSnippet, 320),
        rawPayload: rawPayload || null,
        attributionStatus,
        matchedSessionId,
        matchedPaymentId,
        matchedOrderId,
        reason: sanitizePlainText(reason, 240)
      }
    },
    { upsert: true, new: true }
  );
}

function buildVerificationTag(sources, { finalizeObserved = false } = {}) {
  const familySet = new Set(sources.map(s => getChannelFamily(s)));
  const level = Math.min(2, familySet.size);
  const labels = Array.from(
    new Set(
      sources.map(s => {
        const fam = getChannelFamily(s);
        if (fam === 'GMAIL') return 'Gmail';
        if (fam === 'SMS') return 'SMS';
        return s;
      })
    )
  );
  const base =
    level >= 2 ? `Dual Verification (${labels.join(' + ')})` : `Single Verification (${labels.join(', ')})`;
  return {
    level,
    tag: finalizeObserved ? `${base} | OBSERVED_NOT_RECONCILED` : base
  };
}

async function applyFirstChannelPendingGrace(sessionDoc, obsDoc, obsDetails) {
  const sourceStr = String(obsDetails.source || 'SMS_GATEWAY').toUpperCase();
  const sourcesSet = new Set(Array.isArray(sessionDoc.verificationSources) ? sessionDoc.verificationSources : []);
  sourcesSet.add(sourceStr);
  const verificationSources = Array.from(sourcesSet);
  const { level, tag } = buildVerificationTag(verificationSources, { finalizeObserved: false });
  const bankRef = obsDetails.bankReferenceNumber || sessionDoc.utr || '';

  const updated = await YoupiPaymentSession.findByIdAndUpdate(
    sessionDoc._id,
    {
      $set: {
        verificationLevel: Math.max(sessionDoc.verificationLevel || 0, level),
        verificationSources,
        verificationTag: tag,
        observationSource: sourceStr,
        observedAt: obsDetails.observedAt || new Date(),
        observedAmountPaise: obsDetails.amountPaise || sessionDoc.amountPaise,
        observedSenderVpa: obsDetails.senderVpa || sessionDoc.observedSenderVpa || '',
        observedRawSnippet: obsDetails.rawSnippet || sessionDoc.observedRawSnippet || '',
        ...(bankRef ? { utr: bankRef, uniqueUtrClaim: bankRef.toUpperCase() } : {}),
        ...(obsDoc?._id && !sessionDoc.attributedObservationId ? { attributedObservationId: obsDoc._id } : {})
      }
    },
    { new: true }
  );
  const [evDoc, regDoc] = await Promise.all([
    updated?.event
      ? Event.findById(updated.event)
          .select('title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds')
          .lean()
          .catch(() => null)
      : null,
    updated?.registration ? Registration.findById(updated.registration).catch(() => null) : null
  ]);
  await emitSessionUpdate(updated, evDoc, regDoc).catch(() => {});
  return { session: serializeSessionDto(updated, evDoc, regDoc), level, tag, sources: verificationSources };
}

async function notifyAdminsLateObservation(sessionDoc, amountPaise, bankRef, reasonLabel) {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    const targetIds = Array.from(
      new Set([
        ...admins.map(a => a._id.toString()),
        ...(sessionDoc?.event?.organizer ? [sessionDoc.event.organizer.toString()] : [])
      ])
    );
    const amountRupees = toRupeesString(amountPaise);
    for (const uid of targetIds) {
      await Notification.create({
        user: uid,
        title: `[LATE PAYMENT DETECTED] Order #${sessionDoc.orderId}`,
        message: `A delayed bank credit of INR ${amountRupees} (${bankRef || 'N/A'}) arrived after session ${sessionDoc.paymentId} ended as ${sessionDoc.status} (${reasonLabel}). Hold for manual bank verification.`,
        type: 'general',
        relatedEvent: sessionDoc.event?._id || sessionDoc.event || null
      }).catch(() => {});
    }
  } catch {}
}

/**
 * 6-Stage Zero-Trust Verification Pipeline & 2-Layer Attribution Engine.
 * Never transitions to RECONCILED or SUCCESS automatically (requires Statement CSV or Admin approval).
 */
async function ingestBankObservation(input = {}) {
  const {
    source = 'IMAP_EMAIL',
    sender = '',
    subject = '',
    text = '',
    rawText: rawTextInput = '',
    observedAt = new Date(),
    receivedAt = null,
    messageKey = '',
    receivingAccountId: explicitReceivingAccountId = '',
    paymentSessionId: explicitPaymentSessionId = '',
    explicitAmountPaise = null,
    explicitBankRef = '',
    bankReferenceNumber = '',
    utr: inputUtr = '',
    explicitSenderVpa = '',
    customerId: explicitCustomerId = null,
    submissionIdentity = null,
    suppressBan = false,
    rawPayload = null
  } = input;

  // Stage 1: Canonical Source, Raw Text Bounds & Context Resolution
  const rawSourceUpper = String(source || 'IMAP_EMAIL').trim().toUpperCase();
  const allowedSources = [
    'GMAIL',
    'IMAP_EMAIL',
    'SMS',
    'SMS_GATEWAY',
    'SMS_OBSERVER',
    'GOOGLE_MESSAGES',
    'ANDROID_OBSERVER',
    'STATEMENT_CSV',
    'MANUAL'
  ];
  const cleanSource = allowedSources.includes(rawSourceUpper)
    ? rawSourceUpper
    : rawSourceUpper.includes('EMAIL') || rawSourceUpper.includes('MAIL')
      ? 'GMAIL'
      : 'SMS_GATEWAY';
  const channelFamily = getChannelFamily(cleanSource);

  const rawBodyStr = String(rawTextInput || text || '').trim();
  const combinedRaw = `${subject ? `${subject} ` : ''}${rawBodyStr}`.trim();

  if (rawBodyStr.length > MAX_SCAN_CHARS) {
    return {
      accepted: false,
      status: 'PAYLOAD_TOO_LARGE',
      failingStage: 1,
      reason: `Observation payload exceeds max length of ${MAX_SCAN_CHARS} characters.`
    };
  }

  const boundedRaw = combinedRaw.slice(0, MAX_SCAN_CHARS);
  const safeSnippet = sanitizePlainText(redactSensitiveData(boundedRaw.slice(0, 320)), 320);

  let obsDate = new Date(receivedAt || observedAt || Date.now());
  if (Number.isNaN(obsDate.getTime())) obsDate = new Date();

  const vpaMatchInText = boundedRaw.match(/[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9._-]{2,32}/);
  const observedVpa = vpaMatchInText ? vpaMatchInText[0].toLowerCase() : '';

  const config = getYoupiConfig();
  const explicitRecAccId = explicitReceivingAccountId
    ? normalizeReceivingAccountId(explicitReceivingAccountId)
    : '';
  const scopedRecId = explicitRecAccId || (observedVpa ? normalizeReceivingAccountId(observedVpa) : '');

  // Resolve target session BEFORE Stage 2 so attributable customer spoofing gets caught by Stage 5 Fraud Engine
  let targetSession = null;
  if (explicitPaymentSessionId) {
    targetSession = await YoupiPaymentSession.findOne({ paymentId: String(explicitPaymentSessionId).trim() });
  }
  if (!targetSession && scopedRecId) {
    targetSession = await YoupiPaymentSession.findOne({
      receivingAccountId: scopedRecId,
      status: { $in: [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING] }
    }).sort({ createdAt: -1 });
  }
  if (!targetSession && scopedRecId) {
    const sixtySecsAgo = new Date(Date.now() - 60000);
    targetSession = await YoupiPaymentSession.findOne({
      receivingAccountId: scopedRecId,
      status: { $in: [PaymentStatus.OBSERVED_SUCCESS, PaymentStatus.SUCCESS, PaymentStatus.RECONCILED] },
      completedAt: { $gte: sixtySecsAgo }
    }).sort({ completedAt: -1 });
  }

  let customerUser = null;
  if (targetSession?.user) {
    customerUser = await User.findById(targetSession.user);
  } else if (explicitCustomerId) {
    customerUser = await User.findById(explicitCustomerId);
  } else if (sender && sender.includes('@')) {
    customerUser = await User.findOne({ email: String(sender).trim().toLowerCase() });
  }

  let isAttributableToCustomer = false;
  let matchedCustomerChannel = '';
  const senderStr = String(sender || '').trim();
  if (customerUser) {
    const cleanSenderEmail = senderStr.toLowerCase();
    const cleanCustEmail = String(customerUser.email || '').trim().toLowerCase();
    if (cleanCustEmail.length > 3 && (cleanSenderEmail === cleanCustEmail || cleanSenderEmail.includes(cleanCustEmail))) {
      isAttributableToCustomer = true;
      matchedCustomerChannel = `EMAIL (${customerUser.email})`;
    }
    const cleanCustPhone = String(customerUser.phone || customerUser.mobileNumber || '').replace(/\D/g, '').slice(-10);
    const cleanSenderDigits = senderStr.replace(/\D/g, '').slice(-10);
    if (cleanCustPhone.length >= 10 && cleanSenderDigits === cleanCustPhone) {
      isAttributableToCustomer = true;
      matchedCustomerChannel = `PHONE (${cleanCustPhone})`;
    }
    if (submissionIdentity) {
      if (
        (submissionIdentity.userId && String(submissionIdentity.userId) === customerUser._id.toString()) ||
        (submissionIdentity.email &&
          cleanCustEmail.length > 3 &&
          String(submissionIdentity.email).trim().toLowerCase() === cleanCustEmail) ||
        (submissionIdentity.phone &&
          cleanCustPhone.length >= 10 &&
          String(submissionIdentity.phone).replace(/\D/g, '').slice(-10) === cleanCustPhone)
      ) {
        isAttributableToCustomer = true;
        matchedCustomerChannel = `SUBMISSION_IDENTITY (${customerUser._id.toString()})`;
      }
    }
  }

  // Stage 2: Source & Sender Filtering (allow attributable spoof to advance cleanly to Stage 5 Fraud Auto-Suspend)
  let stage2SenderFailed = false;
  let stage2Reason = '';

  if (channelFamily === 'GMAIL') {
    if (!isAuthorizedBankEmailSender(senderStr)) {
      if (!isAttributableToCustomer) {
        const fp = calculateObservationFingerprint({
          receivingAccountId: scopedRecId || normalizeReceivingAccountId(config.defaultPayeeVpa),
          amountPaise: 0,
          source: cleanSource,
          bankReferenceNumber: '',
          observedAt: obsDate,
          fallbackKey: messageKey || `${senderStr}:${safeSnippet.slice(0, 80)}`
        });
        const obs = await createSpoofOrRejectionObservation({
          fingerprint: fp,
          channelFamily,
          source: cleanSource,
          receivingAccountId: scopedRecId || normalizeReceivingAccountId(config.defaultPayeeVpa),
          sender: senderStr,
          observedAt: obsDate,
          rawSnippet: safeSnippet,
          rawPayload,
          attributionStatus: 'REJECTED_SPOOF',
          reason: 'Rejected: Email sender domain is not an authorized RBI/NPCI commercial bank domain (.bank.in / known bank).'
        });
        return { accepted: false, status: 'REJECTED_SPOOF', failingStage: 2, reason: 'INVALID_EMAIL_DOMAIN', observation: obs };
      }
      stage2SenderFailed = true;
      stage2Reason = 'INVALID_EMAIL_DOMAIN';
    }
  } else if (channelFamily === 'SMS') {
    if (isPureNumericSender(senderStr)) {
      if (!isAttributableToCustomer) {
        const fp = calculateObservationFingerprint({
          receivingAccountId: scopedRecId || normalizeReceivingAccountId(config.defaultPayeeVpa),
          amountPaise: 0,
          source: cleanSource,
          bankReferenceNumber: '',
          observedAt: obsDate,
          fallbackKey: messageKey || `${senderStr}:${safeSnippet.slice(0, 80)}`
        });
        const obs = await createSpoofOrRejectionObservation({
          fingerprint: fp,
          channelFamily,
          source: cleanSource,
          receivingAccountId: scopedRecId || normalizeReceivingAccountId(config.defaultPayeeVpa),
          sender: senderStr,
          observedAt: obsDate,
          rawSnippet: safeSnippet,
          rawPayload,
          attributionStatus: 'REJECTED_SPOOF',
          reason: 'Rejected: Personal SMS from numeric phone number rejected.'
        });
        return { accepted: false, status: 'REJECTED_SPOOF', failingStage: 2, reason: 'PERSONAL_SMS_REJECTED', observation: obs };
      }
      stage2SenderFailed = true;
      stage2Reason = 'PERSONAL_SMS_REJECTED';
    } else if (!isLikelyBankSmsSender(senderStr)) {
      if (!isAttributableToCustomer) {
        const fp = calculateObservationFingerprint({
          receivingAccountId: scopedRecId || normalizeReceivingAccountId(config.defaultPayeeVpa),
          amountPaise: 0,
          source: cleanSource,
          bankReferenceNumber: '',
          observedAt: obsDate,
          fallbackKey: messageKey || `${senderStr}:${safeSnippet.slice(0, 80)}`
        });
        const obs = await createSpoofOrRejectionObservation({
          fingerprint: fp,
          channelFamily,
          source: cleanSource,
          receivingAccountId: scopedRecId || normalizeReceivingAccountId(config.defaultPayeeVpa),
          sender: senderStr,
          observedAt: obsDate,
          rawSnippet: safeSnippet,
          rawPayload,
          attributionStatus: 'REJECTED_SPOOF',
          reason: 'Rejected: SMS sender ID did not pass TRAI DLT alphanumeric bank header verification.'
        });
        return { accepted: false, status: 'REJECTED_SPOOF', failingStage: 2, reason: 'INVALID_SMS_SENDER', observation: obs };
      }
      stage2SenderFailed = true;
      stage2Reason = 'INVALID_SMS_SENDER';
    }
  } else if (!['STATEMENT_CSV', 'MANUAL'].includes(cleanSource)) {
    return {
      accepted: false,
      status: 'REJECTED',
      failingStage: 2,
      reason: 'IRRELEVANT_SOURCE'
    };
  }

  // Stage 3: Payment Parser (credit indicator, INR currency, 12-digit UTR/RRN, exact paise amount)
  let amountPaise = Number.isSafeInteger(Number(explicitAmountPaise)) && Number(explicitAmountPaise) > 0
    ? Number(explicitAmountPaise)
    : 0;
  let bankRef = sanitizePlainText(explicitBankRef || bankReferenceNumber || inputUtr || '', 40).replace(/\s+/g, '');
  let parsedSenderVpa = sanitizePlainText(explicitSenderVpa || '', 120);
  let finalSnippet = safeSnippet;

  const creditKeywords = /(?:credited|credit|cr\b|deposit|deposited|received|transferred)/i;
  const currencyKeywords = /(?:\b(?:rs\.?|inr)\b|₹|(?:rs\.?|inr|₹)\s*\d|\d\s*(?:rs\.?|inr|₹))/i;

  if (amountPaise <= 0) {
    const parsed =
      channelFamily === 'GMAIL'
        ? BankEmailParser.parse({ from: senderStr, subject, body: rawBodyStr, date: obsDate })
        : BankSmsParser.parse({ sender: senderStr, text: boundedRaw, timestamp: obsDate });

    if (!parsed || !parsed.amountPaise || parsed.amountPaise <= 0) {
      // Allow attributable customer-originated payment-attempt messages to still hit Stage 5 fraud check!
      const intelAmt = extractIntelligentAmount(boundedRaw);
      const isCreditAttempt =
        creditKeywords.test(boundedRaw) && (Boolean(intelAmt?.amountPaise) || currencyKeywords.test(boundedRaw));
      if (!(stage2SenderFailed && isAttributableToCustomer && isCreditAttempt)) {
        return {
          accepted: false,
          status: 'IGNORED_NON_CREDIT',
          failingStage: 3,
          reason: 'Message did not match verified credit-first bank alert format.'
        };
      }
      amountPaise = intelAmt?.amountPaise || Number(targetSession?.amountPaise || 0);
    } else {
      amountPaise = parsed.amountPaise;
      bankRef = bankRef || parsed.bankReferenceNumber || '';
      parsedSenderVpa = parsedSenderVpa || parsed.senderVpa || '';
      if (parsed.observedAt) obsDate = parsed.observedAt;
      if (parsed.rawSnippet) finalSnippet = sanitizePlainText(parsed.rawSnippet, 320);
    }
  }

  // Require mandatory reference in SMS/Gmail automated alerts unless customer fraud check needs Stage 5
  if (!bankRef && !(stage2SenderFailed && isAttributableToCustomer)) {
    return {
      accepted: false,
      status: 'IGNORED_NON_CREDIT',
      failingStage: 3,
      reason: 'MISSING_12_DIGIT_REFERENCE'
    };
  }

  // Stage 5 Pre-Attribution Check (Customer-Attributable Fraud Injection & Existing Ban Enforcement)
  if (customerUser && customerUser.paymentSecurityStatus === 'SUSPENDED') {
    return {
      accepted: false,
      status: 'BANNED_IDENTITY',
      failingStage: 5,
      banned: true,
      reason: 'BANNED_IDENTITY'
    };
  }

  const isSessionActiveOrRecent = Boolean(
    targetSession && [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING].includes(targetSession.status)
  );
  const hasAssociatedCustomer = Boolean(customerUser && customerUser._id);
  const isAttemptingCreditMessage =
    creditKeywords.test(boundedRaw) &&
    (Boolean(bankRef) || amountPaise > 0 || currencyKeywords.test(boundedRaw));
  const isNotLegitimateBank =
    stage2SenderFailed ||
    isAttributableToCustomer ||
    (channelFamily === 'GMAIL' ? !isAuthorizedBankEmailSender(senderStr) : !isLikelyBankSmsSender(senderStr));
  const targetsCustomerSession = Boolean(
    targetSession &&
      (targetSession.user?.toString() === customerUser?._id?.toString() ||
        explicitPaymentSessionId === targetSession.paymentId ||
        (amountPaise > 0 && Number(targetSession.amountPaise) === Number(amountPaise)))
  );

  if (
    isSessionActiveOrRecent &&
    hasAssociatedCustomer &&
    isAttributableToCustomer &&
    isAttemptingCreditMessage &&
    isNotLegitimateBank &&
    targetsCustomerSession
  ) {
    const recId =
      targetSession.receivingAccountId ||
      scopedRecId ||
      normalizeReceivingAccountId(config.defaultPayeeVpa);
    const fraudFp = calculateObservationFingerprint({
      receivingAccountId: recId,
      amountPaise,
      source: cleanSource,
      bankReferenceNumber: bankRef,
      observedAt: obsDate,
      fallbackKey: messageKey || `FRAUD:${Date.now()}:${senderStr}`
    });
    const fraudObs = await createSpoofOrRejectionObservation({
      fingerprint: fraudFp,
      channelFamily,
      source: cleanSource,
      receivingAccountId: recId,
      sender: senderStr,
      bankRef,
      amountPaise,
      observedAt: obsDate,
      rawSnippet: finalSnippet,
      rawPayload,
      attributionStatus: 'REJECTED_FRAUD',
      matchedSessionId: targetSession._id,
      matchedPaymentId: targetSession.paymentId,
      matchedOrderId: targetSession.orderId,
      reason: `FRAUDULENT_PAYMENT_INJECTION: Customer '${customerUser.name}' injected spoofed credit observation via ${matchedCustomerChannel || senderStr} (${stage2Reason || 'UNAUTHORIZED_SENDER'}).`
    });

    if (!suppressBan) {
      await User.findByIdAndUpdate(customerUser._id, {
        $set: {
          paymentSecurityStatus: 'SUSPENDED',
          paymentSecurityReason: 'FRAUDULENT_PAYMENT_INJECTION'
        }
      });

      const wasSlot = Boolean(targetSession.slotLockActive);
      targetSession.status = PaymentStatus.FAILED;
      targetSession.settlementState = 'FAILED';
      targetSession.slotLockActive = false;
      targetSession.queuePosition = 0;
      targetSession.uniqueUtrClaim = undefined;
      targetSession.completedAt = new Date();
      targetSession.failureReason = 'Terminated due to FRAUDULENT_PAYMENT_INJECTION security violation.';
      await targetSession.save();

      if (wasSlot && recId) {
        await promoteNext(recId, config.activeDurationMs).catch(() => {});
      }

      PaymentEventBus.emit('session.update', {
        paymentId: targetSession.paymentId,
        orderId: targetSession.orderId,
        status: 'BLOCKED',
        settlementState: 'FAILED',
        isBanned: true,
        fraudDetected: true,
        reason: 'FRAUDULENT_PAYMENT_INJECTION',
        blockedNotice: {
          title: 'FRAUDULENT ACTIVITY DETECTED',
          subtitle: 'Payment Session Terminated & Account Suspended',
          message:
            'Our automated verification engine detected fraudulent payment activity associated with this account. Access has been immediately suspended while our security operations team investigates the issue.',
          investigating: true
        }
      });

      return {
        accepted: false,
        status: 'FRAUDULENT_PAYMENT_INJECTION',
        failingStage: 5,
        threatDetected: true,
        banned: true,
        observation: fraudObs,
        session: targetSession
      };
    }

    const held = await holdSessionManualReview(targetSession, 'FRAUDULENT_PAYMENT_INJECTION');
    return {
      accepted: false,
      status: PaymentStatus.MANUAL_REVIEW,
      failingStage: 5,
      threatDetected: true,
      banned: false,
      observation: fraudObs,
      session: held.session
    };
  }

  // Stage 4: Resolve exact scoped candidates by receivingAccountId / observedVpa / paymentSessionId
  let effectiveRecId =
    scopedRecId ||
    targetSession?.receivingAccountId ||
    normalizeReceivingAccountId(config.defaultPayeeVpa);

  if (explicitPaymentSessionId && targetSession) {
    effectiveRecId = targetSession.receivingAccountId || normalizeReceivingAccountId(targetSession.payeeVpa);
  } else {
    const liveMatches = await YoupiPaymentSession.find({
      receivingAccountId: effectiveRecId,
      status: { $in: [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING] },
      method: { $ne: PaymentMethod.MANUAL_UPI },
      amountPaise
    }).sort({ createdAt: -1 });

    if (liveMatches.length > 1) {
      const ambFp = calculateObservationFingerprint({
        receivingAccountId: effectiveRecId,
        amountPaise,
        source: cleanSource,
        bankReferenceNumber: bankRef,
        observedAt: obsDate,
        fallbackKey: messageKey
      });
      const ambObs = await createSpoofOrRejectionObservation({
        fingerprint: ambFp,
        channelFamily,
        source: cleanSource,
        receivingAccountId: effectiveRecId,
        sender: senderStr,
        bankRef,
        amountPaise,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        rawPayload,
        attributionStatus: 'AMBIGUOUS',
        reason: `Ambiguous credit: ${liveMatches.length} live sessions share ₹${toRupeesString(amountPaise)}.`
      });
      for (const ls of liveMatches) {
        await holdSessionManualReview(ls, 'MULTIPLE_LIVE_AMOUNT_MATCHES');
      }
      return {
        accepted: false,
        ambiguous: true,
        status: 'AMBIGUOUS',
        reason: 'MULTIPLE_LIVE_AMOUNT_MATCHES',
        observation: ambObs
      };
    }

    if (liveMatches.length === 1) {
      targetSession = liveMatches[0];
    } else if (!targetSession) {
      // Fallback: current slot holder on receivingAccountId
      targetSession = await YoupiPaymentSession.findOne({
        receivingAccountId: effectiveRecId,
        status: { $in: [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING] }
      }).sort({ createdAt: -1 });
    }
  }

  // Fingerprint deduplication within the SAME channel family
  const fingerprint = calculateObservationFingerprint({
    receivingAccountId: effectiveRecId,
    amountPaise,
    source: cleanSource,
    bankReferenceNumber: bankRef,
    observedAt: obsDate,
    fallbackKey: messageKey || finalSnippet.slice(0, 120)
  });

  const existingSameFamily = await YoupiBankObservation.findOne({ fingerprint, channelFamily });
  if (existingSameFamily) {
    return {
      accepted: false,
      duplicate: true,
      status: existingSameFamily.attributionStatus || 'DUPLICATE_IGNORED',
      observation: existingSameFamily
    };
  }

  // Global anti-replay UTR check across OTHER non-failed sessions & paid registrations
  if (bankRef && bankRef.length >= 6) {
    const utrRegex = new RegExp(`^${bankRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const [settledOtherSession, paidReg] = await Promise.all([
      YoupiPaymentSession.findOne({
        ...(targetSession?._id ? { _id: { $ne: targetSession._id } } : {}),
        utr: utrRegex,
        status: {
          $in: [
            PaymentStatus.RECONCILED,
            PaymentStatus.OBSERVED_SUCCESS,
            PaymentStatus.SUCCESS,
            PaymentStatus.MANUAL_REVIEW
          ]
        }
      }).select('paymentId orderId'),
      Registration.findOne({
        transactionId: utrRegex,
        paymentStatus: 'paid',
        ...(targetSession?.paymentId ? { youpiPaymentId: { $ne: targetSession.paymentId } } : {})
      }).select('_id youpiPaymentId')
    ]);

    if (settledOtherSession || paidReg) {
      const dupObs = await createSpoofOrRejectionObservation({
        fingerprint,
        channelFamily,
        source: cleanSource,
        receivingAccountId: effectiveRecId,
        sender: senderStr,
        bankRef,
        amountPaise,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        rawPayload,
        attributionStatus: 'DUPLICATE_UTR',
        matchedPaymentId: settledOtherSession?.paymentId || paidReg?.youpiPaymentId || '',
        matchedOrderId: settledOtherSession?.orderId || '',
        reason: 'REFERENCE_ALREADY_USED: Bank reference / UTR already consumed by another transaction.'
      });
      return { accepted: false, duplicate: true, status: 'DUPLICATE_UTR', reason: 'REFERENCE_ALREADY_USED', observation: dupObs };
    }
  }

  // Cross-family fingerprint check (L1 -> L2 upgrade on existing attributed payment session)
  const existingCrossFamily = await YoupiBankObservation.findOne({
    fingerprint,
    matchedSessionId: { $ne: null }
  });

  if (existingCrossFamily && getChannelFamily(existingCrossFamily.source) !== channelFamily) {
    const priorSession = await YoupiPaymentSession.findById(existingCrossFamily.matchedSessionId);
    if (priorSession) {
      if (priorSession.status === PaymentStatus.MANUAL_REVIEW) {
        return {
          accepted: false,
          ambiguous: true,
          status: PaymentStatus.MANUAL_REVIEW,
          reason: 'SESSION_HELD_IN_MANUAL_REVIEW',
          paymentSessionId: priorSession.paymentId
        };
      }
      if (
        Array.isArray(priorSession.verificationSources) &&
        priorSession.verificationSources.some(s => getChannelFamily(s) === channelFamily)
      ) {
        return {
          accepted: false,
          duplicate: true,
          status: 'DUPLICATE_IGNORED',
          observation: existingCrossFamily
        };
      }

      const deadTerminal = [PaymentStatus.FAILED, PaymentStatus.EXPIRED, PaymentStatus.CANCELLED].includes(priorSession.status);
      const upgradeObs = await YoupiBankObservation.create({
        fingerprint,
        channelFamily,
        source: cleanSource,
        receivingAccountId: effectiveRecId,
        sender: senderStr,
        bankRef,
        amountPaise,
        senderVpa: parsedSenderVpa,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        rawPayload,
        attributionStatus: deadTerminal ? 'LATE_UNMATCHED' : 'ATTRIBUTED',
        matchedSessionId: priorSession._id,
        matchedPaymentId: priorSession.paymentId,
        matchedOrderId: priorSession.orderId,
        reason: deadTerminal
          ? 'Delayed L2 observation arrived after session terminated.'
          : `Level 2 dual-channel corroboration via ${cleanSource}.`
      });

      if (deadTerminal) {
        await YoupiPaymentSession.findByIdAndUpdate(priorSession._id, {
          $set: { lateDetectedAt: obsDate }
        });
        await notifyAdminsLateObservation(priorSession, amountPaise, bankRef, 'CROSS_CHANNEL_AFTER_END');
        return {
          accepted: false,
          lateMatch: true,
          status: 'LATE_UNMATCHED',
          observation: upgradeObs
        };
      }

      const pendingTimer = pendingGraceTimers.get(priorSession.paymentId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingGraceTimers.delete(priorSession.paymentId);
      }

      const updatedSources = Array.from(new Set([...(priorSession.verificationSources || []), cleanSource]));
      const { level, tag } = buildVerificationTag(updatedSources, { finalizeObserved: true });
      const res = await markSessionObservedNotReconciled(priorSession, {
        source: cleanSource,
        verificationLevel: level,
        verificationTag: tag,
        bankReferenceNumber: bankRef,
        observedAt: obsDate,
        amountPaise,
        senderVpa: parsedSenderVpa,
        rawSnippet: finalSnippet
      });

      return {
        accepted: true,
        status: 'MATCHED_OBSERVED',
        verificationLevel: level,
        verificationTag: res.session.verificationTag,
        observation: upgradeObs,
        session: res.session,
        registration: res.registration
      };
    }
  }

  // Stage 6: Live Session Attribution (MANUAL_UPI exclusion, temporal bounds, amount, L1 + 5s grace)
  if (targetSession) {
    if (targetSession.method === PaymentMethod.MANUAL_UPI) {
      const obs = await YoupiBankObservation.create({
        fingerprint,
        channelFamily,
        source: cleanSource,
        receivingAccountId: effectiveRecId,
        sender: senderStr,
        bankRef,
        amountPaise,
        senderVpa: parsedSenderVpa,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        rawPayload,
        attributionStatus: 'OBSERVED_UNATTRIBUTED',
        reason: 'MANUAL_UPI_REQUIRES_ADMIN_BANK_VERIFICATION'
      });
      return {
        accepted: false,
        status: 'OBSERVED_UNATTRIBUTED',
        reason: 'MANUAL_UPI_REQUIRES_ADMIN_BANK_VERIFICATION',
        observation: obs
      };
    }

    if (targetSession.status === PaymentStatus.MANUAL_REVIEW) {
      const obs = await YoupiBankObservation.create({
        fingerprint,
        channelFamily,
        source: cleanSource,
        receivingAccountId: effectiveRecId,
        sender: senderStr,
        bankRef,
        amountPaise,
        senderVpa: parsedSenderVpa,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        rawPayload,
        attributionStatus: 'AMBIGUOUS',
        matchedPaymentId: targetSession.paymentId,
        matchedOrderId: targetSession.orderId,
        reason: 'SESSION_HELD_IN_MANUAL_REVIEW'
      });
      return {
        accepted: false,
        ambiguous: true,
        status: PaymentStatus.MANUAL_REVIEW,
        reason: 'SESSION_HELD_IN_MANUAL_REVIEW',
        observation: obs
      };
    }

    const isLive = [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING].includes(targetSession.status);

    // If explicitly targeting session, enforce exact amount check
    if (isLive && Number(targetSession.amountPaise) !== Number(amountPaise)) {
      if (explicitPaymentSessionId) {
        return {
          accepted: false,
          status: 'AMOUNT_MISMATCH',
          failingStage: 4,
          reason: `Expected ₹${toRupeesString(targetSession.amountPaise)}, observed ₹${toRupeesString(amountPaise)}.`
        };
      }
      targetSession = null;
    }

    if (targetSession && isLive) {
      // Check temporal start & activeDeadline (processingExpiresAt for PROCESSING, expiresAt for ACTIVE)
      const slotStartMs = targetSession.slotAcquiredAt
        ? new Date(targetSession.slotAcquiredAt).getTime() - 300000
        : new Date(targetSession.createdAt).getTime() - 300000;

      if (obsDate.getTime() < slotStartMs) {
        return {
          accepted: false,
          status: 'BEFORE_SESSION_CREATION',
          failingStage: 4,
          reason: 'Observation timestamp is before session slot acquisition window.'
        };
      }

      // Check hijacking of prior recently expired/failed/cancelled session with same amount
      if (targetSession.slotAcquiredAt && obsDate.getTime() < new Date(targetSession.slotAcquiredAt).getTime()) {
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
        const priorExpiredSameAmount = await YoupiPaymentSession.exists({
          receivingAccountId: effectiveRecId,
          _id: { $ne: targetSession._id },
          amountPaise,
          status: { $in: [PaymentStatus.EXPIRED, PaymentStatus.FAILED, PaymentStatus.CANCELLED] },
          updatedAt: { $gte: thirtyMinsAgo }
        });
        if (priorExpiredSameAmount) {
          const ambObs = await YoupiBankObservation.create({
            fingerprint,
            channelFamily,
            source: cleanSource,
            receivingAccountId: effectiveRecId,
            sender: senderStr,
            bankRef,
            amountPaise,
            senderVpa: parsedSenderVpa,
            observedAt: obsDate,
            rawSnippet: finalSnippet,
            rawPayload,
            attributionStatus: 'AMBIGUOUS',
            matchedPaymentId: targetSession.paymentId,
            matchedOrderId: targetSession.orderId,
            reason: 'LIVE_AND_RECENT_SAME_AMOUNT'
          });
          await holdSessionManualReview(targetSession, 'LIVE_AND_RECENT_SAME_AMOUNT');
          return {
            accepted: false,
            ambiguous: true,
            status: 'AMBIGUOUS',
            reason: 'LIVE_AND_RECENT_SAME_AMOUNT',
            observation: ambObs
          };
        }
      }

      const activeDeadline =
        targetSession.status === PaymentStatus.PROCESSING && targetSession.processingExpiresAt
          ? new Date(targetSession.processingExpiresAt)
          : targetSession.expiresAt
            ? new Date(targetSession.expiresAt)
            : null;

      if (activeDeadline && obsDate.getTime() > activeDeadline.getTime()) {
        // Past session active/processing window -> treat as unattributed/late instead of auto-attributing live slot
        targetSession = null;
      }
    }

    if (targetSession && [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING].includes(targetSession.status)) {
      // Conflicting UTR check on same session
      if (targetSession.attributedObservationId) {
        const primaryObs = await YoupiBankObservation.findById(targetSession.attributedObservationId);
        if (
          primaryObs?.bankRef &&
          bankRef &&
          primaryObs.bankRef.trim().toUpperCase() !== bankRef.trim().toUpperCase()
        ) {
          const pendingTimer = pendingGraceTimers.get(targetSession.paymentId);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingGraceTimers.delete(targetSession.paymentId);
          }
          const conflictObs = await YoupiBankObservation.create({
            fingerprint,
            channelFamily,
            source: cleanSource,
            receivingAccountId: effectiveRecId,
            sender: senderStr,
            bankRef,
            amountPaise,
            senderVpa: parsedSenderVpa,
            observedAt: obsDate,
            rawSnippet: finalSnippet,
            rawPayload,
            attributionStatus: 'AMBIGUOUS',
            matchedPaymentId: targetSession.paymentId,
            matchedOrderId: targetSession.orderId,
            reason: 'CONFLICTING_UTR_ON_SESSION'
          });
          await holdSessionManualReview(targetSession, 'CONFLICTING_UTR_ON_SESSION');
          return {
            accepted: false,
            ambiguous: true,
            status: 'AMBIGUOUS',
            reason: 'CONFLICTING_UTR_ON_SESSION',
            observation: conflictObs
          };
        }
        if (primaryObs && getChannelFamily(primaryObs.source) === channelFamily) {
          const dupObs = await createSpoofOrRejectionObservation({
            fingerprint,
            channelFamily,
            source: cleanSource,
            receivingAccountId: effectiveRecId,
            sender: senderStr,
            bankRef,
            amountPaise,
            observedAt: obsDate,
            rawSnippet: finalSnippet,
            rawPayload,
            attributionStatus: 'DUPLICATE_IGNORED',
            matchedPaymentId: targetSession.paymentId,
            matchedOrderId: targetSession.orderId,
            reason: 'Duplicate observation from same channel family.'
          });
          return { accepted: false, duplicate: true, status: 'DUPLICATE_IGNORED', observation: dupObs };
        }
      }

      const savedObs = await YoupiBankObservation.create({
        fingerprint,
        channelFamily,
        source: cleanSource,
        receivingAccountId: effectiveRecId,
        sender: senderStr,
        bankRef,
        amountPaise,
        senderVpa: parsedSenderVpa,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        rawPayload,
        attributionStatus: 'ATTRIBUTED',
        matchedSessionId: targetSession._id,
        matchedPaymentId: targetSession.paymentId,
        matchedOrderId: targetSession.orderId,
        reason: `Bank credit attributed via ${cleanSource} (Zero-Trust: awaiting statement reconciliation).`
      });

      const pendingTimer = pendingGraceTimers.get(targetSession.paymentId);
      const graceMs = getGracePeriodMs();

      // If 2nd independent channel arrives within 5s grace window OR graceMs <= 0 -> transition to OBSERVED_SUCCESS
      if (pendingTimer || (targetSession.verificationSources && targetSession.verificationSources.length > 0)) {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingGraceTimers.delete(targetSession.paymentId);
        }
        const combinedSources = Array.from(new Set([...(targetSession.verificationSources || []), cleanSource]));
        const { level, tag } = buildVerificationTag(combinedSources, { finalizeObserved: true });
        const settledObs = await markSessionObservedNotReconciled(targetSession, {
          source: cleanSource,
          verificationLevel: level,
          verificationTag: tag,
          bankReferenceNumber: bankRef,
          observedAt: obsDate,
          amountPaise,
          senderVpa: parsedSenderVpa,
          rawSnippet: finalSnippet,
          observationObjectId: savedObs._id
        });
        return {
          accepted: true,
          status: 'MATCHED_OBSERVED',
          verificationLevel: level,
          verificationTag: settledObs.session.verificationTag,
          observation: savedObs,
          session: settledObs.session,
          registration: settledObs.registration
        };
      }

      if (graceMs <= 0) {
        const { level, tag } = buildVerificationTag([cleanSource], { finalizeObserved: true });
        const settledObs = await markSessionObservedNotReconciled(targetSession, {
          source: cleanSource,
          verificationLevel: level,
          verificationTag: tag,
          bankReferenceNumber: bankRef,
          observedAt: obsDate,
          amountPaise,
          senderVpa: parsedSenderVpa,
          rawSnippet: finalSnippet,
          observationObjectId: savedObs._id
        });
        return {
          accepted: true,
          status: 'MATCHED_OBSERVED',
          verificationLevel: level,
          verificationTag: settledObs.session.verificationTag,
          observation: savedObs,
          session: settledObs.session,
          registration: settledObs.registration
        };
      }

      // Runtime L1 with 5-second grace period waiting for L2 corroboration
      const pendingInfo = await applyFirstChannelPendingGrace(targetSession, savedObs, {
        source: cleanSource,
        bankReferenceNumber: bankRef,
        observedAt: obsDate,
        amountPaise,
        senderVpa: parsedSenderVpa,
        rawSnippet: finalSnippet
      });

      const targetPaymentId = targetSession.paymentId;
      const timer = setTimeout(async () => {
        pendingGraceTimers.delete(targetPaymentId);
        try {
          const latest = await YoupiPaymentSession.findOne({ paymentId: targetPaymentId });
          if (!latest) return;
          if ([PaymentStatus.OBSERVED_SUCCESS, PaymentStatus.RECONCILED, PaymentStatus.SUCCESS].includes(latest.status)) {
            return;
          }
          if ([PaymentStatus.FAILED, PaymentStatus.EXPIRED, PaymentStatus.CANCELLED, PaymentStatus.MANUAL_REVIEW].includes(latest.status)) {
            await YoupiBankObservation.findByIdAndUpdate(savedObs._id, {
              $set: { attributionStatus: 'LATE_UNMATCHED' }
            }).catch(() => {});
            await notifyAdminsLateObservation(latest, amountPaise, bankRef, latest.status).catch(() => {});
            return;
          }
          const { level, tag } = buildVerificationTag(latest.verificationSources || [cleanSource], { finalizeObserved: true });
          await markSessionObservedNotReconciled(latest, {
            source: cleanSource,
            verificationLevel: level,
            verificationTag: tag,
            bankReferenceNumber: bankRef,
            observedAt: obsDate,
            amountPaise,
            senderVpa: parsedSenderVpa,
            rawSnippet: finalSnippet,
            observationObjectId: savedObs._id
          });
        } catch (err) {
          console.warn('YouPI L1 grace finalization warning:', err.message);
        }
      }, graceMs);
      if (timer.unref) timer.unref();
      pendingGraceTimers.set(targetPaymentId, timer);

      return {
        accepted: true,
        status: 'VERIFYING',
        verificationLevel: pendingInfo.level,
        verificationTag: pendingInfo.tag,
        observation: savedObs,
        session: pendingInfo.session
      };
    }
  }

  // Tier 2B: Recent 60s observed/settled session upgrade (or Duplicate UTR conflict detection)
  const sixtySecsAgo = new Date(Date.now() - 60000);
  const recentSession = await YoupiPaymentSession.findOne({
    receivingAccountId: effectiveRecId,
    status: { $in: [PaymentStatus.OBSERVED_SUCCESS, PaymentStatus.SUCCESS, PaymentStatus.RECONCILED] },
    amountPaise,
    completedAt: { $gte: sixtySecsAgo }
  }).sort({ completedAt: -1 });

  if (recentSession) {
    const isUtrConflict = Boolean(
      bankRef && recentSession.utr && bankRef.trim().toUpperCase() !== recentSession.utr.trim().toUpperCase()
    );
    if (isUtrConflict) {
      const conflictObs = await YoupiBankObservation.create({
        fingerprint,
        channelFamily,
        source: cleanSource,
        receivingAccountId: effectiveRecId,
        sender: senderStr,
        bankRef,
        amountPaise,
        senderVpa: parsedSenderVpa,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        rawPayload,
        attributionStatus: 'OBSERVED_UNATTRIBUTED',
        matchedPaymentId: recentSession.paymentId,
        matchedOrderId: recentSession.orderId,
        reason: `DUPLICATE_PAYMENT_UTR_CONFLICT: Received ${bankRef} within 60s of settled/observed ${recentSession.utr}.`
      });
      await notifyAdminsLateObservation(recentSession, amountPaise, bankRef, 'DUPLICATE_PAYMENT_UTR_CONFLICT');
      return {
        accepted: false,
        status: 'DUPLICATE_PAYMENT_UTR_CONFLICT',
        observation: conflictObs
      };
    }

    const slotStartMs =
      (recentSession.slotAcquiredAt ? new Date(recentSession.slotAcquiredAt).getTime() : new Date(recentSession.createdAt).getTime()) - 30000;
    const completedEndMs = (recentSession.completedAt ? new Date(recentSession.completedAt).getTime() : Date.now()) + 30000;

    if (obsDate.getTime() >= slotStartMs && obsDate.getTime() <= completedEndMs) {
      if (
        Array.isArray(recentSession.verificationSources) &&
        recentSession.verificationSources.some(s => getChannelFamily(s) === channelFamily)
      ) {
        const dupObs = await createSpoofOrRejectionObservation({
          fingerprint,
          channelFamily,
          source: cleanSource,
          receivingAccountId: effectiveRecId,
          sender: senderStr,
          bankRef,
          amountPaise,
          observedAt: obsDate,
          rawSnippet: finalSnippet,
          rawPayload,
          attributionStatus: 'DUPLICATE_IGNORED',
          matchedPaymentId: recentSession.paymentId,
          matchedOrderId: recentSession.orderId,
          reason: 'Duplicate observation from same channel family.'
        });
        return { accepted: false, duplicate: true, status: 'DUPLICATE_IGNORED', observation: dupObs };
      }

      const upgradeObs = await YoupiBankObservation.create({
        fingerprint,
        channelFamily,
        source: cleanSource,
        receivingAccountId: effectiveRecId,
        sender: senderStr,
        bankRef,
        amountPaise,
        senderVpa: parsedSenderVpa,
        observedAt: obsDate,
        rawSnippet: finalSnippet,
        rawPayload,
        attributionStatus: 'ATTRIBUTED',
        matchedSessionId: recentSession._id,
        matchedPaymentId: recentSession.paymentId,
        matchedOrderId: recentSession.orderId,
        reason: `Recent session upgraded with independent channel ${cleanSource}.`
      });

      const updatedSources = Array.from(new Set([...(recentSession.verificationSources || []), cleanSource]));
      const finalizeObserved = recentSession.status === PaymentStatus.OBSERVED_SUCCESS;
      const { level, tag } = buildVerificationTag(updatedSources, { finalizeObserved });
      recentSession.verificationSources = updatedSources;
      recentSession.verificationLevel = Math.max(recentSession.verificationLevel || 0, level);
      recentSession.verificationTag = tag;
      await recentSession.save();
      const [recentEventDoc, recentReg] = await Promise.all([
        recentSession.event
          ? Event.findById(recentSession.event)
              .select('title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds')
              .lean()
              .catch(() => null)
          : null,
        recentSession.registration ? Registration.findById(recentSession.registration).catch(() => null) : null
      ]);
      await emitSessionUpdate(recentSession, recentEventDoc, recentReg).catch(() => {});

      return {
        accepted: true,
        status: 'MATCHED_OBSERVED',
        verificationLevel: level,
        verificationTag: tag,
        observation: upgradeObs,
        session: serializeSessionDto(recentSession, recentEventDoc, recentReg),
        registration: recentReg
      };
    }
  }

  // Tier 3: Late Observation (<30m expired/failed/cancelled sessions)
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  const lateMatches = await YoupiPaymentSession.find({
    receivingAccountId: effectiveRecId,
    amountPaise,
    status: { $in: [PaymentStatus.EXPIRED, PaymentStatus.FAILED, PaymentStatus.CANCELLED] },
    updatedAt: { $gte: thirtyMinsAgo }
  })
    .sort({ updatedAt: -1 })
    .limit(10);

  if (lateMatches.length > 1) {
    const ambObs = await YoupiBankObservation.create({
      fingerprint,
      channelFamily,
      source: cleanSource,
      receivingAccountId: effectiveRecId,
      sender: senderStr,
      bankRef,
      amountPaise,
      senderVpa: parsedSenderVpa,
      observedAt: obsDate,
      rawSnippet: finalSnippet,
      rawPayload,
      attributionStatus: 'AMBIGUOUS',
      reason: 'MULTIPLE_LATE_AMOUNT_MATCHES'
    });
    return { accepted: false, ambiguous: true, status: 'AMBIGUOUS', reason: 'MULTIPLE_LATE_AMOUNT_MATCHES', observation: ambObs };
  }

  if (lateMatches.length === 1) {
    const lateSession = lateMatches[0];
    const lateObs = await YoupiBankObservation.create({
      fingerprint,
      channelFamily,
      source: cleanSource,
      receivingAccountId: effectiveRecId,
      sender: senderStr,
      bankRef,
      amountPaise,
      senderVpa: parsedSenderVpa,
      observedAt: obsDate,
      rawSnippet: finalSnippet,
      rawPayload: { ...(rawPayload || {}), lateMatchedSessionId: lateSession.paymentId },
      attributionStatus: 'LATE_UNMATCHED',
      matchedSessionId: lateSession._id,
      matchedPaymentId: lateSession.paymentId,
      matchedOrderId: lateSession.orderId,
      reason: `Delayed credit detected after session ended as ${lateSession.status}. Flagged for admin review.`
    });
    lateSession.lateDetectedAt = obsDate;
    await lateSession.save().catch(() => {});
    await notifyAdminsLateObservation(lateSession, amountPaise, bankRef, lateSession.status);

    PaymentEventBus.emit('PAYMENT.LATE_DETECTED', {
      paymentId: lateSession.paymentId,
      orderId: lateSession.orderId,
      amountPaise: String(amountPaise),
      observationId: lateObs._id.toString()
    });

    return {
      accepted: false,
      lateMatch: true,
      status: 'LATE_UNMATCHED',
      observation: lateObs
    };
  }

  // Fallback: Persist unattributed evidence (never settles any session)
  const unattrObs = await YoupiBankObservation.create({
    fingerprint,
    channelFamily,
    source: cleanSource,
    receivingAccountId: effectiveRecId,
    sender: senderStr,
    bankRef,
    amountPaise,
    senderVpa: parsedSenderVpa,
    observedAt: obsDate,
    rawSnippet: finalSnippet,
    rawPayload,
    attributionStatus: 'OBSERVED_UNATTRIBUTED',
    reason: 'NO_ACTIVE_SESSION: Stored in ledger for manual or CSV statement reconciliation.'
  });
  return {
    accepted: false,
    status: 'OBSERVED_UNATTRIBUTED',
    observation: unattrObs
  };
}

// =============================================================================
// Inbox Polling
// =============================================================================

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
      lateUnmatched: 0,
      ignored: 0,
      polledAt: new Date().toISOString()
    };

    for (const msg of emails) {
      const res = await ingestBankObservation({
        source: 'GMAIL',
        sender: msg.from,
        subject: msg.subject,
        text: msg.body,
        observedAt: msg.date || new Date(),
        messageKey: msg.messageId || msg.uid
      });
      if (res.duplicate) summary.duplicate += 1;
      else if (res.accepted) summary.matched += 1;
      else if (res.status === 'AMBIGUOUS') summary.ambiguous += 1;
      else if (res.status === 'LATE_UNMATCHED') summary.lateUnmatched += 1;
      else if (res.status === 'OBSERVED_UNATTRIBUTED') summary.unattributed += 1;
      else if (res.status === 'REJECTED_SPOOF' || res.status === 'FRAUDULENT_PAYMENT_INJECTION') summary.rejectedSpoof += 1;
      else summary.ignored += 1;
    }

    await SystemSetting.findOneAndUpdate(
      { key: 'global' },
      { $set: { youpiLastPollAt: new Date(), youpiLastPollResult: summary } },
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
      { $set: { youpiLastPollAt: new Date(), youpiLastPollResult: errSummary } },
      { upsert: true }
    ).catch(() => {});
    return errSummary;
  } finally {
    _isPolling = false;
  }
}

// =============================================================================
// Authoritative Statement CSV Reconciliation (Exact Upstream Zero-Trust)
// =============================================================================

function statementLineSourceHash(receivingAccountId, line) {
  return crypto
    .createHash('sha256')
    .update(
      [
        receivingAccountId,
        line.bookedOn || '',
        String(line.amountPaise),
        line.direction,
        line.utr || '',
        line.referenceCount,
        line.narration
      ].join('|')
    )
    .digest('hex');
}

function withinStatementPostingWindow(observedOn, bookedOn) {
  if (!observedOn || !bookedOn) return false;
  return bookedOn >= observedOn && bookedOn <= addCalendarDays(observedOn, STATEMENT_POSTING_DAYS);
}

async function resolveObservedCalendarDate(sessionDoc) {
  const obs = await YoupiBankObservation.findOne({
    $or: [
      ...(sessionDoc.attributedObservationId ? [{ _id: sessionDoc.attributedObservationId }] : []),
      { matchedSessionId: sessionDoc._id },
      { matchedPaymentId: sessionDoc.paymentId }
    ]
  })
    .sort({ observedAt: 1 })
    .select('observedAt')
    .lean();

  return calendarDateInIndia(obs?.observedAt || sessionDoc.observedAt || sessionDoc.completedAt || sessionDoc.createdAt);
}

async function finalizeReconcileFromStatement(lineDoc, sessionDoc, adminUser, matchedObs = null) {
  const beforeStatus = sessionDoc.status;
  if (matchedObs?._id) {
    await YoupiBankObservation.findByIdAndUpdate(matchedObs._id, {
      $set: {
        attributionStatus: 'ATTRIBUTED',
        matchedSessionId: sessionDoc._id,
        matchedPaymentId: sessionDoc.paymentId,
        matchedOrderId: sessionDoc.orderId
      }
    }).catch(() => {});
    if (!sessionDoc.attributedObservationId) {
      sessionDoc.attributedObservationId = matchedObs._id;
    }
  }

  const config = getYoupiConfig();
  const utrToUse = sessionDoc.utr || matchedObs?.bankRef || lineDoc.utr || sessionDoc.orderId;
  const signed = signWebhookPayload(
    {
      event: 'PAYMENT.RECONCILED',
      status: PaymentStatus.RECONCILED,
      settlementState: settlementStateFor(PaymentStatus.RECONCILED, sessionDoc.method),
      paymentId: sessionDoc.paymentId,
      orderId: sessionDoc.orderId,
      amount: toRupeesString(sessionDoc.amountPaise),
      amountPaise: String(sessionDoc.amountPaise),
      currency: sessionDoc.currency || 'INR',
      method: sessionDoc.method || 'UPI',
      bankRef: utrToUse,
      utr: utrToUse,
      observationSource: 'STATEMENT_CSV',
      verificationTag: adminUser?.email
        ? `STATEMENT_RECONCILED:${adminUser.email}`
        : 'BANK_STATEMENT_RECONCILED',
      verificationLevel: 3,
      completedAt: new Date().toISOString()
    },
    config.webhookSecret
  );

  const webhookRes = await processIncomingWebhook({
    rawBody: signed.rawBody,
    signatureHeader: signed.signatureHeader,
    timestampHeader: signed.timestamp,
    deliveryIdHeader: signed.deliveryId
  });

  await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
    $set: {
      matchStatus: 'RECONCILED',
      matchReason: 'BANK_STATEMENT_MATCH',
      paymentSessionId: sessionDoc._id,
      paymentId: sessionDoc.paymentId
    }
  });

  return {
    outcome: beforeStatus === PaymentStatus.RECONCILED ? 'DUPLICATE' : 'RECONCILED',
    matchStatus: 'RECONCILED',
    matchReason: 'BANK_STATEMENT_MATCH',
    paymentSessionId: sessionDoc.paymentId,
    statementLineId: lineDoc._id.toString(),
    utr: lineDoc.utr || null,
    bookedOn: lineDoc.bookedOn,
    amount: toRupeesString(lineDoc.amountPaise),
    matchedOrderId: sessionDoc.orderId,
    session: webhookRes.session,
    registration: webhookRes.registration
  };
}

/**
 * Applies operator-imported CSV bank statement lines (HDFC / SBI / ICICI / Axis / generic Indian CSV).
 * RECONCILED is written ONLY when one observed/held session on the same receiving account
 * has exact paise amount, matching 12-digit UTR, and bookedOn within [observedOn, observedOn + 2 days] IST.
 */
async function reconcileStatementCsv({ receivingAccountId = '', csvText, adminUser = null }) {
  const parsed = parseStatementCsv(csvText);
  if (parsed.error) {
    throw createServiceError(
      parsed.error === 'STATEMENT_TOO_LARGE'
        ? 'CSV statement exceeds the 2000-row limit.'
        : 'Unsupported bank CSV format. Expected Date, Narration/Description, and Credit/Deposit columns.',
      400,
      parsed.error
    );
  }

  const config = getYoupiConfig();
  const recId = normalizeReceivingAccountId(receivingAccountId || config.defaultPayeeVpa);
  const lineOutcomes = [];

  for (const line of parsed.lines) {
    const hash = statementLineSourceHash(recId, line);
    const existing = await YoupiStatementLine.findOne({ receivingAccountId: recId, sourceHash: hash });
    if (existing && existing.matchStatus === 'RECONCILED') {
      lineOutcomes.push({
        outcome: 'DUPLICATE',
        matchStatus: 'RECONCILED',
        matchReason: existing.matchReason || 'ALREADY_RECONCILED',
        paymentSessionId: existing.paymentId || null,
        statementLineId: existing._id.toString(),
        utr: existing.utr || null,
        bookedOn: existing.bookedOn,
        amount: toRupeesString(existing.amountPaise),
        status: 'DUPLICATE'
      });
      continue;
    }

    const lineDoc =
      existing ||
      (await YoupiStatementLine.create({
        receivingAccountId: recId,
        sourceHash: hash,
        bookedOn: line.bookedOn,
        amountPaise: line.amountPaise,
        currency: 'INR',
        direction: line.direction,
        utr: line.utr || '',
        referenceCount: line.referenceCount || 0,
        narration: line.narration || '',
        matchStatus: 'UNMATCHED',
        importedBy: adminUser?._id || null
      }));

    if (line.direction !== 'CREDIT') {
      await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
        $set: { matchStatus: 'IGNORED', matchReason: 'DEBIT', paymentSessionId: null, paymentId: '' }
      });
      lineOutcomes.push({
        outcome: 'IGNORED',
        matchStatus: 'IGNORED',
        matchReason: 'DEBIT',
        paymentSessionId: null,
        statementLineId: lineDoc._id.toString(),
        utr: line.utr || null,
        bookedOn: line.bookedOn,
        amount: toRupeesString(line.amountPaise),
        status: 'IGNORED'
      });
      continue;
    }

    if (!line.utr) {
      const reason = line.referenceCount > 1 ? 'AMBIGUOUS_REFERENCE' : 'MISSING_REFERENCE';
      await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
        $set: { matchStatus: 'CONFLICT', matchReason: reason, paymentSessionId: null, paymentId: '' }
      });
      lineOutcomes.push({
        outcome: 'CONFLICT',
        matchStatus: 'CONFLICT',
        matchReason: reason,
        paymentSessionId: null,
        statementLineId: lineDoc._id.toString(),
        utr: null,
        bookedOn: line.bookedOn,
        amount: toRupeesString(line.amountPaise),
        status: 'CONFLICT'
      });
      continue;
    }

    const utrRegex = new RegExp(`^${line.utr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    // Already reconciled?
    const alreadyObsIds = await YoupiBankObservation.find({
      receivingAccountId: recId,
      bankRef: utrRegex
    }).distinct('_id');
    const alreadyReconciled = await YoupiPaymentSession.findOne({
      receivingAccountId: recId,
      status: PaymentStatus.RECONCILED,
      amountPaise: line.amountPaise,
      $or: [
        { utr: utrRegex },
        ...(alreadyObsIds.length > 0 ? [{ attributedObservationId: { $in: alreadyObsIds } }] : [])
      ]
    });
    if (alreadyReconciled) {
      await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
        $set: {
          matchStatus: 'RECONCILED',
          matchReason: 'ALREADY_RECONCILED',
          paymentSessionId: alreadyReconciled._id,
          paymentId: alreadyReconciled.paymentId
        }
      });
      lineOutcomes.push({
        outcome: 'DUPLICATE',
        matchStatus: 'RECONCILED',
        matchReason: 'ALREADY_RECONCILED',
        paymentSessionId: alreadyReconciled.paymentId,
        statementLineId: lineDoc._id.toString(),
        utr: line.utr,
        bookedOn: line.bookedOn,
        amount: toRupeesString(line.amountPaise),
        status: 'DUPLICATE'
      });
      continue;
    }

    // Find attributed OBSERVED_SUCCESS or MANUAL_REVIEW sessions corroborated by observation or manual UTR
    const matchingObs = await YoupiBankObservation.find({
      receivingAccountId: recId,
      bankRef: utrRegex
    }).lean();
    const obsIds = matchingObs.map(o => o._id);
    const matchedSessIdsFromObs = matchingObs.map(o => o.matchedSessionId).filter(Boolean);

    const attributedSessions = await YoupiPaymentSession.find({
      receivingAccountId: recId,
      status: { $in: [PaymentStatus.OBSERVED_SUCCESS, PaymentStatus.MANUAL_REVIEW] },
      currency: 'INR',
      $or: [
        ...(matchedSessIdsFromObs.length > 0 ? [{ _id: { $in: matchedSessIdsFromObs } }] : []),
        ...(obsIds.length > 0 ? [{ attributedObservationId: { $in: obsIds } }] : []),
        // Support MANUAL_UPI UTR claims submitted cleanly by student when matching CSV statement credit
        { method: PaymentMethod.MANUAL_UPI, status: PaymentStatus.MANUAL_REVIEW, utr: utrRegex }
      ]
    });

    const exact = attributedSessions.filter(s => Number(s.amountPaise) === Number(line.amountPaise));
    const amountConflicts = attributedSessions.filter(s => Number(s.amountPaise) !== Number(line.amountPaise));

    if (exact.length > 1 || amountConflicts.length > 0) {
      for (const s of [...exact, ...amountConflicts]) {
        await holdSessionManualReview(s, 'STATEMENT_AMOUNT_OR_DUPLICATE');
      }
      const conflictReason = exact.length > 1 ? 'MULTIPLE_SESSIONS' : 'AMOUNT_MISMATCH';
      await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
        $set: { matchStatus: 'CONFLICT', matchReason: conflictReason, paymentSessionId: null, paymentId: '' }
      });
      lineOutcomes.push({
        outcome: 'CONFLICT',
        matchStatus: 'CONFLICT',
        matchReason: conflictReason,
        paymentSessionId: null,
        statementLineId: lineDoc._id.toString(),
        utr: line.utr,
        bookedOn: line.bookedOn,
        amount: toRupeesString(line.amountPaise),
        status: 'CONFLICT'
      });
      continue;
    }

    if (exact.length === 1) {
      const target = exact[0];
      const observedOn = await resolveObservedCalendarDate(target);
      if (!withinStatementPostingWindow(observedOn, line.bookedOn)) {
        await holdSessionManualReview(target, 'STATEMENT_DATE_OUTSIDE_WINDOW');
        await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
          $set: {
            matchStatus: 'CONFLICT',
            matchReason: 'STATEMENT_DATE_OUTSIDE_WINDOW',
            paymentSessionId: null,
            paymentId: ''
          }
        });
        lineOutcomes.push({
          outcome: 'CONFLICT',
          matchStatus: 'CONFLICT',
          matchReason: 'STATEMENT_DATE_OUTSIDE_WINDOW',
          paymentSessionId: null,
          statementLineId: lineDoc._id.toString(),
          utr: line.utr,
          bookedOn: line.bookedOn,
          amount: toRupeesString(line.amountPaise),
          status: 'CONFLICT'
        });
        continue;
      }

      const reconciledLine = await finalizeReconcileFromStatement(lineDoc, target, adminUser);
      lineOutcomes.push({ ...reconciledLine, status: 'RECONCILED' });
      continue;
    }

    // Fallback for held ambiguous MANUAL_REVIEW sessions matching exact amount + corroborated observation
    const heldByAmount = await YoupiPaymentSession.find({
      receivingAccountId: recId,
      status: PaymentStatus.MANUAL_REVIEW,
      amountPaise: line.amountPaise
    });
    const seenObs = await YoupiBankObservation.find({
      receivingAccountId: recId,
      bankRef: utrRegex,
      amountPaise: line.amountPaise
    }).sort({ observedAt: 1 });

    if (heldByAmount.length === 1 && seenObs.length >= 1) {
      const observedOn = calendarDateInIndia(seenObs[0].observedAt);
      if (!withinStatementPostingWindow(observedOn, line.bookedOn)) {
        await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
          $set: {
            matchStatus: 'CONFLICT',
            matchReason: 'STATEMENT_DATE_OUTSIDE_WINDOW',
            paymentSessionId: null,
            paymentId: ''
          }
        });
        lineOutcomes.push({
          outcome: 'CONFLICT',
          matchStatus: 'CONFLICT',
          matchReason: 'STATEMENT_DATE_OUTSIDE_WINDOW',
          paymentSessionId: null,
          statementLineId: lineDoc._id.toString(),
          utr: line.utr,
          bookedOn: line.bookedOn,
          amount: toRupeesString(line.amountPaise),
          status: 'CONFLICT'
        });
        continue;
      }
      const reconciledLine = await finalizeReconcileFromStatement(lineDoc, heldByAmount[0], adminUser, seenObs[0]);
      lineOutcomes.push({ ...reconciledLine, status: 'RECONCILED' });
      continue;
    }

    if (heldByAmount.length > 1 && seenObs.length >= 1) {
      await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
        $set: { matchStatus: 'CONFLICT', matchReason: 'MULTIPLE_SESSIONS', paymentSessionId: null, paymentId: '' }
      });
      lineOutcomes.push({
        outcome: 'CONFLICT',
        matchStatus: 'CONFLICT',
        matchReason: 'MULTIPLE_SESSIONS',
        paymentSessionId: null,
        statementLineId: lineDoc._id.toString(),
        utr: line.utr,
        bookedOn: line.bookedOn,
        amount: toRupeesString(line.amountPaise),
        status: 'CONFLICT'
      });
      continue;
    }

    if (seenObs.length >= 1) {
      const candidatePid =
        seenObs[0].matchedPaymentId ||
        seenObs[0].rawPayload?.lateMatchedSessionId ||
        seenObs[0].rawPayload?.targetSessionId ||
        null;
      PaymentEventBus.emit('PAYMENT.UNMATCHED_RECONCILIATION_NEEDED', {
        receivingAccountId: recId,
        observationId: seenObs[0]._id.toString(),
        candidatePaymentSessionId: candidatePid,
        utr: line.utr,
        amountPaise: String(line.amountPaise),
        statementLineId: lineDoc._id.toString()
      });
      await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
        $set: { matchStatus: 'UNMATCHED', matchReason: 'NO_OBSERVED_SESSION', paymentSessionId: null, paymentId: '' }
      });
      lineOutcomes.push({
        outcome: 'UNMATCHED',
        matchStatus: 'UNMATCHED',
        matchReason: 'NO_OBSERVED_SESSION',
        paymentSessionId: null,
        statementLineId: lineDoc._id.toString(),
        observationId: seenObs[0]._id.toString(),
        candidatePaymentSessionId: candidatePid,
        utr: line.utr,
        bookedOn: line.bookedOn,
        amount: toRupeesString(line.amountPaise),
        status: 'UNMATCHED'
      });
      continue;
    }

    await YoupiStatementLine.findByIdAndUpdate(lineDoc._id, {
      $set: { matchStatus: 'UNMATCHED', matchReason: 'NO_OBSERVED_SESSION', paymentSessionId: null, paymentId: '' }
    });
    lineOutcomes.push({
      outcome: 'UNMATCHED',
      matchStatus: 'UNMATCHED',
      matchReason: 'NO_OBSERVED_SESSION',
      paymentSessionId: null,
      statementLineId: lineDoc._id.toString(),
      utr: line.utr,
      bookedOn: line.bookedOn,
      amount: toRupeesString(line.amountPaise),
      status: 'UNMATCHED'
    });
  }

  const creditRows = parsed.lines.filter(l => l.direction === 'CREDIT').length;
  return {
    receivingAccountId: recId,
    totalRows: parsed.lines.length,
    creditRows,
    reconciled: lineOutcomes.filter(l => l.outcome === 'RECONCILED').length,
    matchedCount: lineOutcomes.filter(l => l.outcome === 'RECONCILED').length,
    conflicts: lineOutcomes.filter(l => l.outcome === 'CONFLICT').length,
    ambiguousCount: lineOutcomes.filter(l => l.outcome === 'CONFLICT').length,
    unmatched: lineOutcomes.filter(l => l.outcome === 'UNMATCHED').length,
    unattributedCount: lineOutcomes.filter(l => l.outcome === 'UNMATCHED').length,
    duplicateCount: lineOutcomes.filter(l => l.outcome === 'DUPLICATE').length,
    lines: lineOutcomes,
    details: lineOutcomes.slice(0, 50)
  };
}

// =============================================================================
// Periodic IMAP Scheduler
// =============================================================================

function startPaymentAutomationScheduler() {
  if (_schedulerTimer) return _schedulerTimer;

  _schedulerTimer = setInterval(async () => {
    try {
      const cfg = await getAutomationConfig({ includeSecrets: true });
      if (!cfg.autoVerifyEnabled || !cfg.imapConfigured) return;

      const hasOpenSession = await YoupiPaymentSession.exists({
        status: { $in: [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING] }
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
  getOrCreateAndroidEnrollmentSecret,
  buildSmsGatewayPairingQrData,
  pairAndroidDevice,
  verifyAndroidDeviceHmac,
  listAndroidDevices,
  revokeAndroidDevice,
  deleteAndroidDevice,
  recordAndroidHeartbeat,
  getActivePollWindowStatus,
  fetchRecentInboxEmails,
  decodeMimeBody,
  ingestBankObservation,
  runVerificationPipeline: ingestBankObservation,
  pollBankInboxOnce,
  reconcileStatementCsv,
  startPaymentAutomationScheduler,
  stopPaymentAutomationScheduler,
  destroyAttributionTimers
};
