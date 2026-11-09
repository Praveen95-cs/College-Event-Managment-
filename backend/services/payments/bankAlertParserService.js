/**
 * Authentic YouPI-PG Bank Alert & Statement Parser Service
 * Zero external dependencies — parses Indian bank credit emails, DLT SMS alerts,
 * and operator-uploaded bank statement CSVs with strict credit-vs-debit ordering,
 * balance stripping, and RBI/NPCI bank domain & SMS sender spoof protection.
 */

const AUTHORIZED_BANK_EMAIL_DOMAINS = [
  'bank.in',
  'fin.in',
  'hdfcbank.net',
  'hdfcbank.com',
  'icicibank.com',
  'sbi.co.in',
  'axisbank.com',
  'kotak.com',
  'yesbank.in',
  'indusind.com',
  'pnb.co.in',
  'bankofbaroda.co.in',
  'canarabank.com',
  'unionbankofindia.co.in',
  'idfcfirstbank.com',
  'federalbank.co.in',
  'paytmbank.com'
];

function toPaiseSafe(amount) {
  if (amount === null || amount === undefined || amount === '') {
    throw new Error('Amount is required');
  }
  const str = String(amount).trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid monetary amount: ${amount}`);
  }
  const [whole, frac = ''] = str.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new Error(`Amount out of range: ${amount}`);
  }
  return paise;
}

function redactSensitiveData(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/\b(\d{4})\d{4}(\d{4})\b/g, '$1****$2')
    .replace(/(?:a\/c|account|acct)[\s:]*([xX]*\d{4}|\d{6,18})/gi, 'A/c ****')
    .replace(/\b([a-zA-Z0-9])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g, '$1***@$2')
    .replace(/\b(?:\+91|91)?([6-9]\d{1})\d{4}(\d{4})\b/g, '+91-$1****$2');
}

function isAuthorizedBankEmailSender(sender) {
  if (!sender || typeof sender !== 'string') return false;
  const match = sender.match(/<([^>]+)>/);
  const cleanEmail = (match ? match[1] : sender).trim().toLowerCase();
  if (cleanEmail.endsWith('.youpi.local')) {
    return true;
  }
  const domain = cleanEmail.includes('@') ? cleanEmail.split('@')[1] : cleanEmail;
  if (!domain) return false;
  return AUTHORIZED_BANK_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Validates Indian TRAI DLT SMS alphanumeric sender headers (e.g. VK-HDFCBK, AD-SBIUPI, HDFCBK)
 * and rejects 10-digit personal mobile numbers used to spoof payment SMS.
 */
function isLikelyBankSmsSender(sender) {
  if (!sender || typeof sender !== 'string') return false;
  const clean = sender.trim();
  if (!clean) return false;
  if (clean.toLowerCase().endsWith('.youpi.local')) return true;
  // Reject 10-13 digit mobile numbers (personal SIMs cannot send legitimate bank alerts)
  const digitsOnly = clean.replace(/[\s+\-()]/g, '');
  if (/^\d{7,15}$/.test(digitsOnly)) {
    return false;
  }
  // Standard DLT header: 2-char operator prefix + hyphen + 3-12 alphanumeric entity (e.g. VK-HDFCBK-S, AD-SBIUPI) or raw header (HDFCBK)
  return /^(?:[A-Z0-9]{2}-)?[A-Z][A-Z0-9]{2,11}(?:-[A-Z])?$/i.test(clean);
}

/**
 * Linear-time Indian currency amount extractor (strips balance/limit phrases first so
 * "Avl Bal Rs 25,000" never masquerades as the credited transaction amount).
 */
function extractIntelligentAmount(text) {
  if (!text || typeof text !== 'string') return null;

  const normalizedText = text.slice(0, 6000).replace(/\s+/g, ' ');

  const balancePattern =
    /(?:(?:avl|avail|available|tot|total|ledger|clear|curr|current)(?:\s+(?:bal|balance|limit))?|bal|balance)\b[\s:=-]*(?:(?:rs\.?|inr|₹)\s*)?\b\d[\d,]{0,15}(?:\.\d{1,2})?/gi;
  const sanitizedText = normalizedText.replace(balancePattern, ' ').trim();

  const directCreditMatch =
    sanitizedText.match(
      /(?:credited\s*(?:with|by|for)?|received|deposit(?:ed)?)\s*[:=-]?\s*(?:(?:rs\b\.?|inr\b)|₹)?[\s:=-]*([\d,]+(?:\.\d{1,2})?)/i
    ) ||
    sanitizedText.match(
      /(?:(?:rs\b\.?|inr\b)|₹)[\s:=-]*([\d,]+(?:\.\d{1,2})?)\s*(?:(?:has\s+been|is)\s+)?(?:credited|received|deposited)/i
    );
  if (directCreditMatch && (directCreditMatch[1] || directCreditMatch[2])) {
    const clean = (directCreditMatch[1] || directCreditMatch[2]).replace(/,/g, '');
    try {
      return { amountStr: clean, amountPaise: toPaiseSafe(clean) };
    } catch {}
  }

  const prefixMatch = sanitizedText.match(/(?:(?:rs\b\.?|inr\b)|₹)[\s:=-]*([\d,]+(?:\.\d{1,2})?)/i);
  if (prefixMatch && prefixMatch[1]) {
    const clean = prefixMatch[1].replace(/,/g, '');
    try {
      return { amountStr: clean, amountPaise: toPaiseSafe(clean) };
    } catch {}
  }

  const suffixMatch = sanitizedText.match(
    /(?:^|[^\w.])([\d,]+(?:\.\d{1,2})?)[\s:=-]*(?:(?:rs\b\.?|inr\b)|₹)/i
  );
  if (suffixMatch && suffixMatch[1]) {
    const clean = suffixMatch[1].replace(/,/g, '');
    try {
      return { amountStr: clean, amountPaise: toPaiseSafe(clean) };
    } catch {}
  }

  const creditProximityMatch = sanitizedText.match(
    /(?:credited|received|deposit|cr)[\s\w:]*?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)[\s\w:]*?(?:credited|received|deposit|cr)/i
  );
  if (creditProximityMatch) {
    const rawVal = creditProximityMatch[1] || creditProximityMatch[2];
    if (rawVal) {
      const clean = rawVal.replace(/,/g, '');
      if (/^\d+(\.\d{1,2})?$/.test(clean) && Number(clean) < 10000000 && Number(clean) > 0) {
        try {
          return { amountStr: clean, amountPaise: toPaiseSafe(clean) };
        } catch {}
      }
    }
  }

  const standaloneDecimal = sanitizedText.match(/\b(\d{1,6}\.\d{2})\b/);
  if (standaloneDecimal && standaloneDecimal[1]) {
    const clean = standaloneDecimal[1];
    try {
      return { amountStr: clean, amountPaise: toPaiseSafe(clean) };
    } catch {}
  }

  return null;
}

function trimTrailingPunctuation(str) {
  let s = String(str || '').trim();
  while (s.length > 0 && (s.endsWith('.') || s.endsWith(',') || s.endsWith(';'))) {
    s = s.slice(0, -1);
  }
  return s;
}

class BankEmailParser {
  static parse(email) {
    if (!email) return null;
    const combinedText = `${email.subject || ''} ${email.body || ''}`.trim().slice(0, 6000);
    if (!combinedText) return null;

    const creditKeywords = new RegExp(
      '\\b(?:credited|credit|received|deposit(?:ed)?|payment\\s+received|upi\\/cr' +
        '|transferred\\s+to\\s+(?:your\\s+)?(?:a\\/c|account|wallet)' +
        '|payment\\s+of\\s+(?:(?:rs\\b\\.?|inr\\b)\\s*)?[\\d,.]+\\s+(?:has\\s+been\\s+)?made\\s+to\\s+(?:your\\s+)?(?:a\\/c|account|wallet)' +
        '|added\\s+to\\s+(?:your\\s+)?(?:account|wallet))\\b',
      'i'
    );
    if (!creditKeywords.test(combinedText)) {
      return null;
    }

    const debitIdx = combinedText.search(/\b(?:debited|withdrawn|deducted|spent|paid rs|sent rs)\b/i);
    const creditIdx = combinedText.search(/\b(?:credited|credit|received|deposit|deposited)\b/i);
    if (debitIdx !== -1 && (creditIdx === -1 || debitIdx < creditIdx)) {
      return null;
    }

    const extractedAmount = extractIntelligentAmount(combinedText);
    if (!extractedAmount) return null;

    let bankReferenceNumber = '';
    const refMatch = combinedText.match(
      /(?:upi\s*ref(?:erence)?\s*(?:no\.?|num)?|utr(?:\s*no\.?)?|rrn(?:\s*no\.?)?|txn(?:\s*id|\s*ref)?|ref(?:\s*no\.?|\s*id)?)[:\s#=-]+([a-zA-Z0-9\-_]{6,35})/i
    );
    if (refMatch && refMatch[1]) {
      bankReferenceNumber = refMatch[1].trim();
    } else {
      const upiCrMatch = combinedText.match(/UPI\/CR\/([a-zA-Z0-9\-_]{6,35})/i);
      if (upiCrMatch && upiCrMatch[1]) {
        bankReferenceNumber = upiCrMatch[1].trim();
      } else {
        const d12Match = combinedText.match(/\b([0-9]{12})\b/);
        if (d12Match && d12Match[1]) {
          bankReferenceNumber = d12Match[1].trim();
        }
      }
    }

    let senderVpa = '';
    const vpaMatch = combinedText.match(/(?:from|by|vpa)\s+([a-zA-Z0-9.\-_]{2,100}@[a-zA-Z0-9.\-_]{2,64})/i);
    if (vpaMatch && vpaMatch[1]) {
      senderVpa = trimTrailingPunctuation(vpaMatch[1]);
    }

    let observedAt = new Date();
    if (email.date) {
      const parsedDate = new Date(email.date);
      if (!Number.isNaN(parsedDate.getTime())) {
        observedAt = parsedDate;
      }
    }

    return {
      amountPaise: extractedAmount.amountPaise,
      amount: extractedAmount.amountStr,
      bankReferenceNumber,
      senderVpa,
      observedAt,
      isBankDomain: email.from ? isAuthorizedBankEmailSender(email.from) : false,
      rawSnippet: redactSensitiveData(combinedText.substring(0, 280))
    };
  }
}

class BankSmsParser {
  static parse(sms) {
    if (!sms) return null;
    const text = String(sms.text || '').trim().slice(0, 4096);
    if (!text) return null;

    const creditKeywords = new RegExp(
      '\\b(?:credited|received|deposit(?:ed)?|payment\\s+received|money\\s+received|upi\\/cr' +
        '|transferred\\s+to\\s+(?:your\\s+)?(?:a\\/c|account|wallet)' +
        '|payment\\s+of\\s+(?:(?:rs\\b\\.?|inr\\b)\\s*)?[\\d,.]+\\s+(?:has\\s+been\\s+)?made\\s+to\\s+(?:your\\s+)?(?:a\\/c|account|wallet)' +
        '|added\\s+to\\s+(?:your\\s+)?(?:account|wallet))\\b',
      'i'
    );
    if (!creditKeywords.test(text)) {
      return null;
    }

    const debitIdx = text.search(/\b(?:debited|withdrawn|deducted|spent|paid rs|sent rs)\b/i);
    const creditIdx = text.search(/\b(?:credited|received|deposit|deposited)\b/i);
    if (debitIdx !== -1 && (creditIdx === -1 || debitIdx < creditIdx)) {
      return null;
    }

    const extractedAmount = extractIntelligentAmount(text);
    if (!extractedAmount) return null;

    let bankReferenceNumber = '';
    const utrPatterns = [
      /(?:upi\s*ref(?:erence)?\s*(?:no\.?|num)?|utr(?:\s*no\.?)?|rrn(?:\s*no\.?)?|txn\s*(?:id|ref|#)?|transaction\s*id|ref\s*no\.?)[\s:=-]+([a-zA-Z0-9\-_]{6,35})/i,
      /(?:upi\/(?:[0-9]+\/|cr\/)([a-zA-Z0-9\-_]{6,35}))/i,
      /\b(?:ref(?:\s*(?:no\.?|id|#))?)[:\s#=-]+([a-zA-Z0-9\-_]{6,35})/i,
      /\b([0-9]{12})\b/
    ];
    for (const pat of utrPatterns) {
      const m = text.match(pat);
      if (m && m[1]) {
        bankReferenceNumber = m[1].trim();
        break;
      }
    }

    let senderVpa = '';
    const vpaMatch = text.match(
      /(?:from|by|vpa|upi\s*id)[\s:]+(?:[a-zA-Z\s]+[\(\[])?([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9.\-_]{2,32})/i
    );
    if (vpaMatch && vpaMatch[1]) {
      senderVpa = trimTrailingPunctuation(vpaMatch[1]);
    }

    let observedAt = new Date();
    if (sms.timestamp) {
      const parsed = new Date(sms.timestamp);
      if (!Number.isNaN(parsed.getTime())) {
        observedAt = parsed;
      }
    }

    return {
      amountPaise: extractedAmount.amountPaise,
      amount: extractedAmount.amountStr,
      bankReferenceNumber,
      senderVpa,
      observedAt,
      rawSnippet: redactSensitiveData(text.substring(0, 280))
    };
  }
}

// ---------- Bank CSV Statement Parser (HDFC, SBI, ICICI, Axis, etc.) ----------
const MAX_STATEMENT_ROWS = 2000;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function headerKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function classifyHeader(value) {
  const h = headerKey(value);
  if (!h) return null;
  if (h === 'date' || h === 'txn date' || h === 'transaction date' || h === 'tran date') return 'date';
  if (h === 'value dt' || h === 'value date' || h.startsWith('value dt')) return 'valueDate';
  if (h === 'narration' || h === 'description' || h.includes('particular') || h.includes('remark')) {
    return 'narration';
  }
  if (h.includes('withdrawal') || h === 'debit' || h.startsWith('debit ')) return 'debit';
  if (h.includes('deposit') || h === 'credit' || h.startsWith('credit ')) return 'credit';
  if (h.includes('chq') || h.includes('ref')) return 'ref';
  return null;
}

function columnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const kind = classifyHeader(cell);
    if (kind && map[kind] === undefined) map[kind] = index;
  });
  if (map.date === undefined || map.narration === undefined || map.credit === undefined) return null;
  return map;
}

function rupeesToPaise(raw) {
  const text = String(raw ?? '').trim();
  if (!text || text === '-' || text === '0' || text === '0.00' || text === '0.0') return 0;
  const cleaned = text.replace(/[₹,\s]/g, '').replace(/(cr|dr)$/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

function parseStatementDate(raw) {
  const text = String(raw || '').trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = /^(\d{2})[/-](\d{2})[/-](\d{2})$/.exec(text);
  if (match) {
    const year = Number(match[3]) < 70 ? 2000 + Number(match[3]) : 1900 + Number(match[3]);
    return `${year}-${match[2]}-${match[1]}`;
  }
  return null;
}

function extractTwelveDigitReferences(narration, ref) {
  const found = `${ref || ''} ${narration || ''}`.match(/\d{12}/g) || [];
  return [...new Set(found)];
}

function parseStatementCsv(csvText) {
  const rows = parseCsv(csvText);
  let headerAt = -1;
  let columns = null;
  const scanLimit = Math.min(rows.length, 40);
  for (let i = 0; i < scanLimit; i++) {
    const mapped = columnMap(rows[i]);
    if (mapped) {
      headerAt = i;
      columns = mapped;
      break;
    }
  }
  if (!columns) {
    return { error: 'UNSUPPORTED_STATEMENT', lines: [] };
  }

  const lines = [];
  for (let i = headerAt + 1; i < rows.length; i++) {
    if (lines.length >= MAX_STATEMENT_ROWS) {
      return { error: 'STATEMENT_TOO_LARGE', lines: [] };
    }
    const row = rows[i];
    const bookedOn = parseStatementDate(row[columns.valueDate ?? columns.date] || row[columns.date]);
    const narration = String(row[columns.narration] || '').trim();
    const ref = columns.ref === undefined ? '' : String(row[columns.ref] || '').trim();
    if (!bookedOn && !narration) continue;
    const creditPaise = rupeesToPaise(row[columns.credit]);
    const debitPaise = columns.debit === undefined ? 0 : rupeesToPaise(row[columns.debit]);
    if (creditPaise === null || debitPaise === null || !bookedOn) continue;
    const credit = creditPaise > 0 ? creditPaise : 0;
    const debit = debitPaise > 0 ? debitPaise : 0;
    if (credit > 0 && debit > 0) continue;
    if (credit === 0 && debit === 0) continue;
    const references = extractTwelveDigitReferences(narration, ref);
    lines.push({
      bookedOn,
      amountPaise: credit > 0 ? credit : debit,
      direction: credit > 0 ? 'CREDIT' : 'DEBIT',
      utr: references.length === 1 ? references[0] : null,
      referenceCount: references.length,
      narration,
      ref
    });
  }
  return { lines };
}

module.exports = {
  AUTHORIZED_BANK_EMAIL_DOMAINS,
  redactSensitiveData,
  isAuthorizedBankEmailSender,
  isLikelyBankSmsSender,
  extractIntelligentAmount,
  BankEmailParser,
  BankSmsParser,
  rupeesToPaise,
  parseStatementDate,
  extractTwelveDigitReferences,
  parseStatementCsv
};

