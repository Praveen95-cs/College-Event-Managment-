const crypto = require('crypto');
const { EventEmitter } = require('events');
const mongoose = require('mongoose');
const Event = require('../../models/events/Event');
const User = require('../../models/auth/User');
const Registration = require('../../models/events/Registration');
const Notification = require('../../models/community/Notification');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const YoupiWebhookReceipt = require('../../models/payments/YoupiWebhookReceipt');
const YoupiBankObservation = require('../../models/payments/YoupiBankObservation');
const SystemSetting = require('../../models/system/SystemSetting');
const { sanitizePlainText, sanitizeEmailAddress } = require('../../utils/sanitize');
const { computeEventLifecycle } = require('../feed/feedService');
const { generateQrSvg } = require('../../utils/qrGenerator');
const {
  sendEventRegistrationEmail,
  sendPaymentUnderReviewEmail
} = require('../email/emailService');
const {
  UPI_PROVIDERS,
  getUpiProviders,
  BANKING_AND_MESSAGING_PACKAGES,
  ALLOWED_NOTIFICATION_PACKAGES,
  isAllowedNotificationPackage
} = require('./bankAlertParserService');

const PaymentEventBus = new EventEmitter();
PaymentEventBus.setMaxListeners(100);

const PaymentStatus = Object.freeze({
  INITIATED: 'INITIATED',
  ACTIVE: 'ACTIVE',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  OBSERVED_SUCCESS: 'OBSERVED_SUCCESS',
  RECONCILED: 'RECONCILED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
});

const PaymentMethod = Object.freeze({
  UPI: 'UPI',
  MANUAL_UPI: 'MANUAL_UPI'
});

const VALID_TRANSITIONS = Object.freeze({
  [PaymentStatus.INITIATED]: [
    PaymentStatus.ACTIVE,
    PaymentStatus.QUEUED,
    PaymentStatus.CANCELLED,
    PaymentStatus.EXPIRED,
    PaymentStatus.MANUAL_REVIEW,
    PaymentStatus.SUCCESS
  ],
  [PaymentStatus.QUEUED]: [
    PaymentStatus.ACTIVE,
    PaymentStatus.CANCELLED,
    PaymentStatus.EXPIRED,
    PaymentStatus.MANUAL_REVIEW,
    PaymentStatus.SUCCESS
  ],
  [PaymentStatus.ACTIVE]: [
    PaymentStatus.PROCESSING,
    PaymentStatus.OBSERVED_SUCCESS,
    PaymentStatus.MANUAL_REVIEW,
    PaymentStatus.SUCCESS,
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED,
    PaymentStatus.CANCELLED
  ],
  [PaymentStatus.PROCESSING]: [
    PaymentStatus.OBSERVED_SUCCESS,
    PaymentStatus.MANUAL_REVIEW,
    PaymentStatus.SUCCESS,
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED
  ],
  [PaymentStatus.OBSERVED_SUCCESS]: [
    PaymentStatus.RECONCILED,
    PaymentStatus.MANUAL_REVIEW
  ],
  [PaymentStatus.MANUAL_REVIEW]: [
    PaymentStatus.RECONCILED
  ],
  [PaymentStatus.RECONCILED]: [],
  [PaymentStatus.SUCCESS]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.EXPIRED]: [],
  [PaymentStatus.CANCELLED]: []
});

const SLOT_RELEASE_STATES = Object.freeze([
  PaymentStatus.OBSERVED_SUCCESS,
  PaymentStatus.RECONCILED,
  PaymentStatus.MANUAL_REVIEW,
  PaymentStatus.SUCCESS,
  PaymentStatus.FAILED,
  PaymentStatus.EXPIRED,
  PaymentStatus.CANCELLED
]);

const TERMINAL_STATES = Object.freeze([...SLOT_RELEASE_STATES]);

const IMMUTABLE_STATES = Object.freeze([
  PaymentStatus.RECONCILED,
  PaymentStatus.SUCCESS,
  PaymentStatus.FAILED,
  PaymentStatus.EXPIRED,
  PaymentStatus.CANCELLED
]);

const SLOT_OCCUPYING_STATES = Object.freeze([
  PaymentStatus.ACTIVE,
  PaymentStatus.PROCESSING
]);

const FULFILLED_STATUSES = Object.freeze([PaymentStatus.RECONCILED, PaymentStatus.SUCCESS]);
const TERMINAL_FAILURE_STATUSES = Object.freeze([
  PaymentStatus.FAILED,
  PaymentStatus.EXPIRED,
  PaymentStatus.CANCELLED
]);

let reaperTimer = null;
let reaperInFlight = false;

function isValidTransition(currentState, nextState) {
  const allowed = VALID_TRANSITIONS[currentState];
  if (!allowed) return false;
  return allowed.includes(nextState);
}

function isTerminalStatus(status) {
  return TERMINAL_STATES.includes(status);
}

function holdsSlot(status) {
  return SLOT_OCCUPYING_STATES.includes(status);
}

function createHttpError(message, status = 400, code = 'YOUPI_ERROR', extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/**
 * Integer-paise conversion (YouPI-PG money precision discipline).
 * @param {number|string} amount
 * @returns {number}
 */
function toPaise(amount) {
  if (amount === null || amount === undefined || amount === '') {
    throw createHttpError('Amount is required.', 400, 'INVALID_AMOUNT');
  }
  const str = String(amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw createHttpError('Amount must be a non-negative number with at most 2 decimal places.', 400, 'INVALID_AMOUNT');
  }
  const [whole, frac = ''] = str.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw createHttpError('Amount out of valid range.', 400, 'INVALID_AMOUNT');
  }
  return paise;
}

/**
 * Converts integer paise back to 2-decimal rupee string (e.g. 19900 -> "199.00").
 * @param {number} amountPaise
 * @returns {string}
 */
function toRupeesString(amountPaise) {
  const clean = Math.max(0, Math.round(Number(amountPaise) || 0));
  return (clean / 100).toFixed(2);
}

function isValidVpa(vpa) {
  if (!vpa || typeof vpa !== 'string') return false;
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(vpa.trim());
}

function normalizeReceivingAccountId(vpa) {
  return String(vpa || '').trim().toLowerCase();
}

function parseVpaList(raw) {
  if (!raw) return [];
  const items = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(/[\r\n,;]+/)
        .map(s => s.trim());
  const seen = new Set();
  const valid = [];
  for (const candidate of items) {
    const clean = String(candidate || '').trim();
    if (!clean || !isValidVpa(clean)) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(clean);
  }
  return valid;
}

function getBackupVpaPool(eventDoc = null, settingsDoc = null, currentVpa = '') {
  const config = getYoupiConfig();
  const candidates = [
    currentVpa,
    eventDoc?.paymentUpiId,
    ...(Array.isArray(eventDoc?.backupPaymentUpiIds) ? eventDoc.backupPaymentUpiIds : []),
    config.defaultPayeeVpa,
    ...config.backupPayeeVpas,
    ...(Array.isArray(settingsDoc?.youpiBackupVpas) ? settingsDoc.youpiBackupVpas : [])
  ];
  return parseVpaList(candidates);
}

/**
 * Canonical upstream `youpi-pg/YouPI-PG` `buildUpiUri` (`packages/common/src/upi.js`):
 * Uses `URLSearchParams` with `pa`, `pn`, `am`, and optional `tn` derived from `transactionRef || transactionNote`.
 */
function buildUpiUri(options) {
  if (!options || !isValidVpa(options.payeeVpa)) {
    throw createHttpError(`Invalid payee VPA: ${options?.payeeVpa || ''}`, 400, 'INVALID_VPA');
  }
  const amountStr = toRupeesString(options.amountPaise);
  const params = new URLSearchParams();
  params.set('pa', options.payeeVpa.trim());
  params.set('pn', String(options.payeeName || 'Avenor Campus Events').trim());
  params.set('am', amountStr);
  const txnId = String(options.transactionRef || options.transactionNote || '').trim();
  if (txnId) {
    params.set('tn', txnId);
  }
  return `upi://pay?${params.toString()}`;
}

function buildUpiIntentUri(options) {
  if (!options?.packageName || !String(options.packageName).trim()) {
    throw createHttpError('Package name is required for Android UPI intent URI', 400, 'MISSING_PACKAGE');
  }
  const upiUri = buildUpiUri(options);
  const query = upiUri.split('?')[1] || '';
  const cleanPackage = String(options.packageName).trim();
  return `intent://pay?${query}#Intent;scheme=upi;package=${cleanPackage};end`;
}

/**
 * Canonical NPCI Bharat QR / UPI Stand QR URI (`packages/common/src/upi.js`):
 * Supports static (`mode='02'`, open amount) or dynamic (`mode='04'`, fixed `am`), `mc`, `tn`, `cu`.
 */
function buildStandUpiUri(options) {
  if (!options || !isValidVpa(options.payeeVpa)) {
    throw createHttpError(`Invalid payee VPA: ${options?.payeeVpa || ''}`, 400, 'INVALID_VPA');
  }
  const params = new URLSearchParams();
  params.set('pa', options.payeeVpa.trim());
  params.set('pn', String(options.payeeName || 'Avenor Campus Events').trim());

  const hasAmount =
    options.amountPaise !== undefined &&
    options.amountPaise !== null &&
    Number(options.amountPaise) > 0;
  if (hasAmount) {
    params.set('am', toRupeesString(options.amountPaise));
  }
  if (options.merchantCategoryCode && String(options.merchantCategoryCode).trim()) {
    params.set('mc', String(options.merchantCategoryCode).trim());
  }
  const mode = options.mode
    ? String(options.mode).trim()
    : (hasAmount ? '04' : '02');
  params.set('mode', mode);

  const txnId = String(options.transactionRef || options.transactionNote || '').trim();
  if (txnId) {
    params.set('tn', txnId);
  }
  params.set('cu', String(options.currency || 'INR').trim().toUpperCase());
  return `upi://pay?${params.toString()}`;
}

async function buildStandQrData({
  payeeVpa,
  payeeName,
  amountPaise = null,
  merchantCategoryCode = '',
  mode = '',
  transactionNote = '',
  transactionRef = '',
  currency = 'INR'
}) {
  const upiUri = buildStandUpiUri({
    payeeVpa,
    payeeName,
    amountPaise,
    merchantCategoryCode,
    mode,
    transactionNote,
    transactionRef,
    currency
  });
  const qrSvg = await generateQrSvg(upiUri, { boxSize: 260, errorCorrection: 'M' });
  return { upiUri, qrSvg };
}

function buildUpiAppIntents(upiUri) {
  if (!upiUri || !upiUri.startsWith('upi://pay?')) return [];
  const query = upiUri.split('?')[1] || '';
  return UPI_PROVIDERS.map(provider => ({
    ...provider,
    upiUri,
    intentUri: `intent://pay?${query}#Intent;scheme=upi;package=${provider.packageName};end`
  }));
}

function getYoupiConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const apiUrl = (process.env.YOUPI_API_URL || '').trim().replace(/\/+$/, '');
  const gatewayMode = apiUrl ? 'external' : 'embedded';
  const merchantId = (process.env.YOUPI_MERCHANT_ID || (isProduction ? '' : 'avenor-events')).trim();
  const merchantKey = (process.env.YOUPI_MERCHANT_KEY || '').trim();
  const webhookSecret = (
    gatewayMode === 'external'
      ? (process.env.YOUPI_WEBHOOK_SECRET || '')
      : (
          process.env.YOUPI_WEBHOOK_SECRET ||
          process.env.JWT_SECRET ||
          (isProduction ? '' : 'avenor_youpi_dev_secret_local_only')
        )
  ).trim();
  const rawDefaultVpa = (process.env.YOUPI_PAYEE_VPA || '').trim();
  const defaultPayeeVpa = isValidVpa(rawDefaultVpa) ? rawDefaultVpa : '';
  const backupPayeeVpas = parseVpaList(process.env.YOUPI_BACKUP_VPAS).filter(
    v => v.toLowerCase() !== defaultPayeeVpa.toLowerCase()
  );
  const defaultPayeeName = (process.env.YOUPI_PAYEE_NAME || 'Avenor Campus Events').trim();
  const rawMode = String(process.env.YOUPI_VERIFICATION_MODE || 'manual').trim().toLowerCase();
  const verificationMode = rawMode === 'instant' && !isProduction ? 'instant' : 'manual';
  // Zero-Trust: observers NEVER settle an unpaid order.
  const fulfillOnObserved = false;
  const allowDemoUtr = !isProduction && String(process.env.YOUPI_ALLOW_DEMO_UTR || 'false').trim().toLowerCase() === 'true';
  const defaultMethod = String(process.env.YOUPI_DEFAULT_METHOD || 'UPI').trim().toUpperCase() === 'MANUAL_UPI'
    ? 'MANUAL_UPI'
    : 'UPI';

  const rawActiveWindow = Number(
    process.env.PAYMENT_ACTIVE_WINDOW_MS ||
      (Number(process.env.YOUPI_SESSION_TTL_SECONDS || 300) * 1000)
  );
  const activeDurationMs = Number.isFinite(rawActiveWindow) && rawActiveWindow >= 5000 ? rawActiveWindow : 300000;

  const rawProcessingWindow = Number(process.env.PAYMENT_PROCESSING_WINDOW_MS || 30000);
  const processingDurationMs =
    Number.isFinite(rawProcessingWindow) && rawProcessingWindow >= 3000 ? rawProcessingWindow : 30000;

  const gracePeriodMs =
    process.env.PAYMENT_GRACE_PERIOD_MS !== undefined
      ? Math.max(0, Number(process.env.PAYMENT_GRACE_PERIOD_MS) || 0)
      : (process.env.NODE_ENV === 'test' ? 0 : 5000);

  return {
    isProduction,
    apiUrl,
    gatewayMode,
    merchantId,
    merchantKey,
    webhookSecret,
    defaultPayeeVpa,
    backupPayeeVpas,
    defaultPayeeName,
    verificationMode,
    fulfillOnObserved,
    allowDemoUtr,
    defaultMethod,
    sessionTtlMs: activeDurationMs,
    activeDurationMs,
    processingDurationMs,
    gracePeriodMs
  };
}

/**
 * Zero-Trust settlement check: ONLY RECONCILED or SUCCESS is settled/fulfilled.
 * OBSERVED_SUCCESS is NOT settled!
 */
function isSettledStatus(status) {
  return FULFILLED_STATUSES.includes(status);
}

function settlementStateFor(status, method = 'UPI') {
  switch (status) {
    case PaymentStatus.RECONCILED:
    case PaymentStatus.SUCCESS:
      return 'RECONCILED';
    case PaymentStatus.OBSERVED_SUCCESS:
      return 'NOT_RECONCILED';
    case PaymentStatus.MANUAL_REVIEW:
      return method === PaymentMethod.MANUAL_UPI ? 'PENDING_VERIFICATION' : 'MANUAL_REVIEW';
    case PaymentStatus.FAILED:
      return 'FAILED';
    case PaymentStatus.EXPIRED:
      return 'EXPIRED';
    case PaymentStatus.CANCELLED:
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

function normalizeUtr(utr) {
  return sanitizePlainText(String(utr || ''), 40).replace(/\s+/g, '');
}

function isValidUtr(utr) {
  return /^[A-Za-z0-9-]{6,35}$/.test(String(utr || ''));
}

function generateHmacHex(payload, secret) {
  return crypto.createHmac('sha256', String(secret)).update(payload).digest('hex');
}

function verifyHexHmac(payload, secret, actualHex) {
  if (!actualHex || !secret || !/^[a-f0-9]+$/i.test(actualHex)) return false;
  const expected = generateHmacHex(payload, secret);
  if (expected.length !== actualHex.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actualHex, 'hex'));
  } catch {
    return false;
  }
}

function signWebhookPayload(payloadObj, secret) {
  const deliveryId = payloadObj.deliveryId || crypto.randomUUID();
  const timestamp = String(payloadObj.timestamp || Date.now());
  const fullPayload = {
    ...payloadObj,
    deliveryId,
    timestamp: Number(timestamp)
  };
  const rawBody = JSON.stringify(fullPayload);
  const sigHex = generateHmacHex(`${timestamp}.${rawBody}`, secret);
  return {
    rawBody,
    timestamp,
    deliveryId,
    signatureHeader: `sha256=${sigHex}`
  };
}

function verifyYoupiWebhook({
  rawBody,
  signatureHeader,
  timestampHeader = null,
  deliveryIdHeader = null,
  secret = getYoupiConfig().webhookSecret,
  toleranceMs = 2 * 60 * 60 * 1000
}) {
  if (!secret) {
    throw createHttpError('Webhook verification failed: webhook secret not configured.', 500, 'WEBHOOK_CONFIG_ERROR');
  }
  const rawString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  if (!rawString) {
    throw createHttpError('Webhook payload body cannot be empty.', 400, 'EMPTY_WEBHOOK_BODY');
  }
  const sigHeader = String(signatureHeader || '').trim();
  if (!sigHeader.startsWith('sha256=')) {
    throw createHttpError(
      'Invalid X-Gateway-Signature format. Expected sha256=<hex>.',
      401,
      'INVALID_WEBHOOK_SIGNATURE'
    );
  }
  const actualHex = sigHeader.slice('sha256='.length).trim();

  if (timestampHeader !== null && timestampHeader !== undefined && timestampHeader !== '') {
    const tsNum = Number(timestampHeader);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > toleranceMs) {
      throw createHttpError(
        'Webhook timestamp is missing or outside replay tolerance window.',
        401,
        'STALE_WEBHOOK_TIMESTAMP'
      );
    }
  }

  const matchesRaw = verifyHexHmac(rawString, secret, actualHex);
  const matchesTimestamped =
    timestampHeader !== null &&
    timestampHeader !== undefined &&
    timestampHeader !== '' &&
    verifyHexHmac(`${String(timestampHeader).trim()}.${rawString}`, secret, actualHex);

  if (!matchesRaw && !matchesTimestamped) {
    throw createHttpError('Webhook HMAC-SHA256 signature verification failed.', 401, 'INVALID_WEBHOOK_SIGNATURE');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawString);
  } catch {
    throw createHttpError('Webhook body must be valid JSON.', 400, 'INVALID_WEBHOOK_JSON');
  }

  if (parsed && parsed.timestamp !== undefined && parsed.timestamp !== null) {
    const bodyTs = Number(parsed.timestamp);
    if (!Number.isFinite(bodyTs) || Math.abs(Date.now() - bodyTs) > toleranceMs) {
      throw createHttpError('Signed payload timestamp outside tolerance window.', 401, 'STALE_WEBHOOK_TIMESTAMP');
    }
    if (
      timestampHeader !== null &&
      timestampHeader !== undefined &&
      timestampHeader !== '' &&
      String(timestampHeader).trim() !== String(parsed.timestamp).trim()
    ) {
      throw createHttpError('Header timestamp mismatch with signed payload.', 401, 'TIMESTAMP_MISMATCH');
    }
  }

  if (
    deliveryIdHeader &&
    parsed?.deliveryId &&
    String(deliveryIdHeader).trim() !== String(parsed.deliveryId).trim()
  ) {
    throw createHttpError('Delivery ID header mismatch with signed payload.', 400, 'DELIVERY_ID_MISMATCH');
  }

  return parsed;
}

/**
 * Sanitizes legacy data and obsolete single-field indexes on startup before syncIndexes()
 * so existing Atlas/local records never cause E11000 during partial index creation.
 */
async function sanitizeLegacySlotLocks() {
  try {
    // 1. Backfill receivingAccountId for legacy docs missing it
    const missingAcc = await YoupiPaymentSession.find({
      $or: [{ receivingAccountId: { $exists: false } }, { receivingAccountId: '' }],
      payeeVpa: { $exists: true, $ne: '' }
    }).select('_id payeeVpa receivingAccountSnapshot payeeName');

    for (const doc of missingAcc) {
      const recId = normalizeReceivingAccountId(doc.payeeVpa);
      await YoupiPaymentSession.updateOne(
        { _id: doc._id },
        {
          $set: {
            receivingAccountId: recId,
            ...(doc.receivingAccountSnapshot
              ? {}
              : {
                  receivingAccountSnapshot: {
                    receivingAccountId: recId,
                    upiId: doc.payeeVpa,
                    payeeName: doc.payeeName || 'Avenor Campus Events',
                    isMerchantEnabled: true
                  }
                })
          }
        }
      );
    }

    // 2. Unset invalid or terminal uniqueUtrClaim values so partial unique index ignores them
    await YoupiPaymentSession.updateMany(
      {
        $or: [
          { uniqueUtrClaim: '' },
          { uniqueUtrClaim: null },
          { status: { $in: TERMINAL_FAILURE_STATUSES }, uniqueUtrClaim: { $exists: true } }
        ]
      },
      { $unset: { uniqueUtrClaim: 1 } }
    );

    // 3. Release any slotLockActive on non-slot states
    await YoupiPaymentSession.updateMany(
      { slotLockActive: true, status: { $nin: SLOT_OCCUPYING_STATES } },
      { $set: { slotLockActive: false, queuePosition: 0 } }
    );

    // 4. For any receivingAccountId holding multiple ACTIVE/PROCESSING docs from legacy runs,
    // keep only the single newest unexpired holder and expire the rest so idx_one_slot_per_receiving_account builds cleanly
    const activeByAcc = await YoupiPaymentSession.find({
      status: { $in: SLOT_OCCUPYING_STATES }
    })
      .sort({ createdAt: -1 })
      .select('_id receivingAccountId payeeVpa status expiresAt processingExpiresAt slotLockActive');

    const seenAccounts = new Set();
    const now = new Date();
    for (const s of activeByAcc) {
      const recId = s.receivingAccountId || normalizeReceivingAccountId(s.payeeVpa);
      const isExpiredActive = s.status === PaymentStatus.ACTIVE && s.expiresAt && s.expiresAt <= now;
      const isExpiredProc =
        s.status === PaymentStatus.PROCESSING &&
        (s.processingExpiresAt ? s.processingExpiresAt <= now : s.expiresAt && s.expiresAt <= now);

      if (!recId || isExpiredActive || isExpiredProc || seenAccounts.has(recId)) {
        const nextStatus = s.status === PaymentStatus.PROCESSING ? PaymentStatus.FAILED : PaymentStatus.EXPIRED;
        await YoupiPaymentSession.updateOne(
          { _id: s._id },
          {
            $set: {
              status: nextStatus,
              settlementState: nextStatus,
              slotLockActive: false,
              queuePosition: 0,
              completedAt: now,
              failureReason: 'Superseded stale slot during startup index sanitization.'
            },
            $unset: { uniqueUtrClaim: 1 }
          }
        );
      } else {
        seenAccounts.add(recId);
        if (!s.slotLockActive || s.receivingAccountId !== recId) {
          await YoupiPaymentSession.updateOne(
            { _id: s._id },
            { $set: { slotLockActive: true, receivingAccountId: recId, queuePosition: 0 } }
          );
        }
      }
    }

    // 5. Drop obsolete single-field unique index `fingerprint_1` on YoupiBankObservation if present
    try {
      const indexes = await YoupiBankObservation.collection.indexes();
      if (indexes.some(idx => idx.name === 'fingerprint_1' && idx.unique)) {
        await YoupiBankObservation.collection.dropIndex('fingerprint_1');
        await YoupiBankObservation.syncIndexes().catch(() => {});
      }
    } catch {
      // Collection may not exist yet on fresh DB
    }
  } catch (err) {
    console.warn('sanitizeLegacySlotLocks warning:', err.message);
  }
}

async function syncPendingRegistrationStatus(sessionDoc, { statusLabel, settlementLabel, utr = '' }) {
  if (!sessionDoc) return null;
  const eventDoc = await Event.findById(sessionDoc.event).select('title currency').lean().catch(() => null);
  const reg = await Registration.findOneAndUpdate(
    { event: sessionDoc.event, user: sessionDoc.user },
    {
      event: sessionDoc.event,
      user: sessionDoc.user,
      name: sessionDoc.customerName || 'Student Attendee',
      regNo: sessionDoc.customerRegNo || sessionDoc.user.toString().slice(-8).toUpperCase(),
      email: sessionDoc.customerEmail || '',
      needsAccommodation: Boolean(sessionDoc.needsAccommodation),
      status: 'pending',
      paymentStatus: 'pending',
      amountPaid: 0,
      currency: sessionDoc.currency || eventDoc?.currency || 'INR',
      paymentMethod: 'youpi',
      transactionId: utr || sessionDoc.utr || sessionDoc.orderId,
      youpiPaymentId: sessionDoc.paymentId,
      youpiOrderId: sessionDoc.orderId,
      youpiStatus: statusLabel,
      settlementState: settlementLabel
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!sessionDoc.registration || sessionDoc.registration.toString() !== reg._id.toString()) {
    sessionDoc.registration = reg._id;
    await YoupiPaymentSession.updateOne({ _id: sessionDoc._id }, { $set: { registration: reg._id } });
  }
  return reg;
}

/**
 * Re-indexes remaining QUEUED sessions for a receiving account in strict FIFO order (1..N).
 */
async function reindexQueue(receivingAccountId) {
  const cleanAcc = normalizeReceivingAccountId(receivingAccountId);
  if (!cleanAcc) return 0;
  const queuedDocs = await YoupiPaymentSession.find({
    receivingAccountId: cleanAcc,
    status: PaymentStatus.QUEUED
  })
    .sort({ queuePosition: 1, createdAt: 1, _id: 1 })
    .select('_id queuePosition');

  for (let i = 0; i < queuedDocs.length; i += 1) {
    const expectedPos = i + 1;
    if (queuedDocs[i].queuePosition !== expectedPos) {
      await YoupiPaymentSession.updateOne({ _id: queuedDocs[i]._id }, { $set: { queuePosition: expectedPos } });
    }
  }
  return queuedDocs.length;
}

/**
 * Expires any timed-out ACTIVE (expiresAt <= now) or PROCESSING (processingExpiresAt <= now)
 * sessions for a receiving account and releases their slot locks.
 */
async function expireStaleSessionsForVpa(payeeVpaOrAccountId) {
  const recId = normalizeReceivingAccountId(payeeVpaOrAccountId);
  if (!recId) return [];
  const now = new Date();
  const staleDocs = await YoupiPaymentSession.find({
    $or: [{ receivingAccountId: recId }, { payeeVpa: payeeVpaOrAccountId }],
    $or: [
      { status: PaymentStatus.ACTIVE, expiresAt: { $lte: now } },
      { status: PaymentStatus.INITIATED, expiresAt: { $lte: now } },
      { status: PaymentStatus.PROCESSING, processingExpiresAt: { $lte: now } },
      {
        status: PaymentStatus.PROCESSING,
        processingExpiresAt: null,
        expiresAt: { $lte: now }
      }
    ]
  });

  if (staleDocs.length === 0) return [];

  const transitioned = [];
  for (const s of staleDocs) {
    const nextStatus = s.status === PaymentStatus.PROCESSING ? PaymentStatus.FAILED : PaymentStatus.EXPIRED;
    const reason =
      s.status === PaymentStatus.PROCESSING
        ? 'Bank verification window (30s) elapsed without receiving bank observation.'
        : 'Payment checkout session timed out after 5 minutes.';
    const updated = await YoupiPaymentSession.findOneAndUpdate(
      { _id: s._id, status: s.status },
      {
        $set: {
          status: nextStatus,
          settlementState: nextStatus,
          slotLockActive: false,
          queuePosition: 0,
          completedAt: now,
          failureReason: reason
        },
        $unset: { uniqueUtrClaim: 1 }
      },
      { new: true }
    );
    if (updated) {
      if (updated.registration) {
        await Registration.findByIdAndUpdate(updated.registration, {
          paymentStatus: 'failed',
          youpiStatus: updated.status,
          settlementState: updated.settlementState
        }).catch(() => {});
      }
      transitioned.push(updated);
      await emitSessionUpdate(updated).catch(() => {});
    }
  }
  return transitioned;
}

/**
 * Clean fixed query in expireStaleSessionsForVpa (Node doesn't allow duplicate $or keys in JS object literals cleanly).
 */
async function expireStaleSlots(receivingAccountId) {
  const recId = normalizeReceivingAccountId(receivingAccountId);
  if (!recId) return [];
  const now = new Date();
  const staleDocs = await YoupiPaymentSession.find({
    receivingAccountId: recId,
    $or: [
      { status: { $in: [PaymentStatus.ACTIVE, PaymentStatus.INITIATED] }, expiresAt: { $lte: now } },
      { status: PaymentStatus.PROCESSING, processingExpiresAt: { $lte: now } },
      { status: PaymentStatus.PROCESSING, processingExpiresAt: null, expiresAt: { $lte: now } }
    ]
  });

  const transitioned = [];
  for (const s of staleDocs) {
    const nextStatus = s.status === PaymentStatus.PROCESSING ? PaymentStatus.FAILED : PaymentStatus.EXPIRED;
    const reason =
      s.status === PaymentStatus.PROCESSING
        ? 'Bank verification window (30s) elapsed without receiving bank observation.'
        : 'Payment checkout session timed out after 5 minutes.';

    const updated = await YoupiPaymentSession.findOneAndUpdate(
      { _id: s._id, status: s.status },
      {
        $set: {
          status: nextStatus,
          settlementState: nextStatus,
          slotLockActive: false,
          queuePosition: 0,
          completedAt: now,
          failureReason: reason
        },
        $unset: { uniqueUtrClaim: 1 }
      },
      { new: true }
    );
    if (updated) {
      if (updated.registration) {
        await Registration.findByIdAndUpdate(updated.registration, {
          paymentStatus: 'failed',
          youpiStatus: updated.status,
          settlementState: updated.settlementState
        }).catch(() => {});
      }
      transitioned.push(updated);
      await emitSessionUpdate(updated).catch(() => {});
    }
  }
  return transitioned;
}

/**
 * Generates fresh upiUri & qrSvg from the session's immutable receivingAccountSnapshot
 * and tries to atomically acquire the single active slot for `receivingAccountId`.
 * Places in `QUEUED` (with empty upiUri / qrSvg) if the slot is occupied.
 */
async function acquireSlotAtomic(sessionDoc, receivingAccountId, activeDurationMs = getYoupiConfig().activeDurationMs) {
  const recId = normalizeReceivingAccountId(receivingAccountId || sessionDoc.payeeVpa);
  await expireStaleSlots(recId);

  const snapshot = sessionDoc.receivingAccountSnapshot || {
    receivingAccountId: recId,
    upiId: sessionDoc.payeeVpa,
    payeeName: sessionDoc.payeeName,
    isMerchantEnabled: true
  };
  const vpa = snapshot.upiId || sessionDoc.payeeVpa;
  const pName = snapshot.payeeName || sessionDoc.payeeName;

  const existingHolder = await YoupiPaymentSession.findOne({
    receivingAccountId: recId,
    slotLockActive: true,
    _id: { $ne: sessionDoc._id }
  }).select('_id paymentId status');

  const enqueueSession = async () => {
    const highestQueued = await YoupiPaymentSession.findOne({
      receivingAccountId: recId,
      status: PaymentStatus.QUEUED,
      _id: { $ne: sessionDoc._id }
    })
      .sort({ queuePosition: -1 })
      .select('queuePosition')
      .lean();
    const nextPos = (highestQueued?.queuePosition || 0) + 1;
    const queuedDoc = await YoupiPaymentSession.findByIdAndUpdate(
      sessionDoc._id,
      {
        $set: {
          receivingAccountId: recId,
          status: PaymentStatus.QUEUED,
          settlementState: 'PENDING',
          slotLockActive: false,
          queuePosition: nextPos,
          slotAcquiredAt: null,
          expiresAt: null,
          upiUri: '',
          qrSvg: ''
        }
      },
      { new: true }
    );
    await reindexQueue(recId);
    const refreshed = await YoupiPaymentSession.findById(sessionDoc._id);
    return {
      status: PaymentStatus.QUEUED,
      queuePosition: refreshed?.queuePosition || nextPos,
      expiresAt: null,
      session: refreshed || queuedDoc
    };
  };

  if (existingHolder) {
    return enqueueSession();
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + activeDurationMs);
  const upiUri = buildUpiUri({
    payeeVpa: vpa,
    payeeName: pName,
    amountPaise: sessionDoc.amountPaise,
    transactionRef: sessionDoc.orderId
  });
  const qrSvg = await generateQrSvg(upiUri, { boxSize: 220, errorCorrection: 'M' });

  try {
    const activated = await YoupiPaymentSession.findOneAndUpdate(
      {
        _id: sessionDoc._id,
        status: { $in: [PaymentStatus.INITIATED, PaymentStatus.QUEUED, PaymentStatus.ACTIVE] }
      },
      {
        $set: {
          receivingAccountId: recId,
          status: PaymentStatus.ACTIVE,
          settlementState: 'PENDING',
          slotLockActive: true,
          queuePosition: 0,
          slotAcquiredAt: now,
          expiresAt,
          upiUri,
          qrSvg
        }
      },
      { new: true }
    );
    if (!activated) {
      return { status: sessionDoc.status, queuePosition: sessionDoc.queuePosition || 0, expiresAt: sessionDoc.expiresAt, session: sessionDoc };
    }
    PaymentEventBus.emit('SESSION.ACTIVATED', {
      paymentId: activated.paymentId,
      receivingAccountId: recId,
      expiresAt
    });
    return { status: PaymentStatus.ACTIVE, queuePosition: 0, expiresAt, session: activated };
  } catch (err) {
    if (err && err.code === 11000) {
      // Another session acquired idx_one_slot_per_receiving_account concurrently
      return enqueueSession();
    }
    throw err;
  }
}

/**
 * Promotes the oldest QUEUED session to ACTIVE if no session currently holds `slotLockActive: true`
 * for `receivingAccountId`. Re-indexes remaining queued sessions and broadcasts SSE updates.
 */
async function promoteNext(receivingAccountId, activeDurationMs = getYoupiConfig().activeDurationMs) {
  const recId = normalizeReceivingAccountId(receivingAccountId);
  if (!recId) return null;

  await expireStaleSlots(recId);

  const holder = await YoupiPaymentSession.findOne({
    receivingAccountId: recId,
    slotLockActive: true
  }).select('_id');
  if (holder) return null;

  const nextQueued = await YoupiPaymentSession.findOne({
    receivingAccountId: recId,
    status: PaymentStatus.QUEUED
  }).sort({ queuePosition: 1, createdAt: 1, _id: 1 });

  if (!nextQueued) {
    return null;
  }

  const res = await acquireSlotAtomic(nextQueued, recId, activeDurationMs);
  await reindexQueue(recId);

  if (res.status === PaymentStatus.ACTIVE && res.session) {
    await emitSessionUpdate(res.session).catch(() => {});
    PaymentEventBus.emit('QUEUE.PROMOTED', {
      receivingAccountId: recId,
      promotedPaymentId: res.session.paymentId
    });
    return res.session;
  }
  return null;
}

/**
 * Exact formula from upstream QueueEngine:
 * currentSlotRemaining + (queuePosition - 1) * Math.round((activeDurationMs + processingDurationMs) / 1000)
 */
async function calculateEstimatedWaitSeconds(receivingAccountId, queuePosition) {
  if (!queuePosition || queuePosition <= 0) return 0;
  const recId = normalizeReceivingAccountId(receivingAccountId);
  const config = getYoupiConfig();
  let currentSlotRemaining = 0;

  if (recId) {
    const holder = await YoupiPaymentSession.findOne({
      receivingAccountId: recId,
      slotLockActive: true
    })
      .select('status expiresAt processingExpiresAt')
      .lean();

    if (holder) {
      const now = Date.now();
      if (holder.status === PaymentStatus.PROCESSING && holder.processingExpiresAt) {
        currentSlotRemaining = Math.max(0, Math.ceil((new Date(holder.processingExpiresAt).getTime() - now) / 1000));
      } else if (holder.status === PaymentStatus.ACTIVE && holder.expiresAt) {
        currentSlotRemaining = Math.max(0, Math.ceil((new Date(holder.expiresAt).getTime() - now) / 1000));
      }
    }
  }

  const cycleSeconds = Math.round((config.activeDurationMs + config.processingDurationMs) / 1000);
  const precedingQueuedWait = Math.max(0, queuePosition - 1) * cycleSeconds;
  return currentSlotRemaining + precedingQueuedWait;
}

/**
 * Transitions a slot (ACTIVE or PROCESSING) -> OBSERVED_SUCCESS (`NOT_RECONCILED`),
 * releases the exclusive slot lock, promotes the next queued student, and updates
 * the linked Registration to `pending` (Zero-Trust: NEVER unlocks pass/WhatsApp/email!).
 */
async function markSessionObservedNotReconciled(sessionDoc, obsDetails = {}) {
  const config = getYoupiConfig();
  const sourceStr = String(obsDetails.source || 'SMS_OBSERVER').toUpperCase();
  const sourcesSet = new Set(Array.isArray(sessionDoc.verificationSources) ? sessionDoc.verificationSources : []);
  sourcesSet.add(sourceStr);
  const verificationSources = Array.from(sourcesSet);
  const level = obsDetails.verificationLevel !== undefined ? Number(obsDetails.verificationLevel) : verificationSources.length;
  const baseTag =
    obsDetails.verificationTag ||
    (level >= 2 ? `DUAL_CHANNEL_L${level}` : `${sourceStr}_L1`);
  const verificationTag = baseTag.includes('OBSERVED_NOT_RECONCILED')
    ? baseTag
    : `${baseTag} | OBSERVED_NOT_RECONCILED`;

  const recId = sessionDoc.receivingAccountId || normalizeReceivingAccountId(sessionDoc.payeeVpa);
  const now = new Date();
  const bankRef = obsDetails.bankReferenceNumber || sessionDoc.utr || '';
  const alreadyCompleted = Boolean(sessionDoc.completedAt);

  const updated = await YoupiPaymentSession.findByIdAndUpdate(
    sessionDoc._id,
    {
      $set: {
        status: PaymentStatus.OBSERVED_SUCCESS,
        settlementState: 'NOT_RECONCILED',
        slotLockActive: false,
        queuePosition: 0,
        verificationLevel: Math.max(sessionDoc.verificationLevel || 0, level),
        verificationSources,
        verificationTag,
        observationSource: sourceStr,
        observedAt: obsDetails.observedAt || sessionDoc.observedAt || now,
        observedAmountPaise: obsDetails.amountPaise || sessionDoc.amountPaise,
        observedSenderVpa: obsDetails.senderVpa || sessionDoc.observedSenderVpa || '',
        observedRawSnippet: obsDetails.rawSnippet || sessionDoc.observedRawSnippet || '',
        ...(bankRef ? { utr: bankRef, uniqueUtrClaim: bankRef.toUpperCase() } : {}),
        ...(obsDetails.observationObjectId && !sessionDoc.attributedObservationId
          ? { attributedObservationId: obsDetails.observationObjectId }
          : {}),
        ...(alreadyCompleted ? {} : { completedAt: now }),
        lastWebhookEvent: 'PAYMENT.OBSERVED_SUCCESS'
      }
    },
    { new: true }
  );

  // Release FIFO slot and promote next queued checkout
  await promoteNext(recId, config.activeDurationMs).catch(() => {});

  // Keep Registration strictly pending until bank statement CSV or Admin confirms reconciliation
  const reg = await syncPendingRegistrationStatus(updated, {
    statusLabel: PaymentStatus.OBSERVED_SUCCESS,
    settlementLabel: 'NOT_RECONCILED',
    utr: bankRef
  });

  const eventDoc = updated?.event
    ? await Event.findById(updated.event)
        .select('title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds')
        .lean()
        .catch(() => null)
    : null;
  const dto = serializeSessionDto(updated, eventDoc, reg);
  await emitSessionUpdate(updated, eventDoc, reg).catch(() => {});
  return { session: dto, registration: reg };
}

/**
 * Transitions ACTIVE/PROCESSING session -> MANUAL_REVIEW (on ambiguity or manual hold),
 * releases slot lock, and promotes next queued session.
 */
async function holdSessionManualReview(sessionDoc, reason = 'AMBIGUOUS_MATCH') {
  const recId = sessionDoc.receivingAccountId || normalizeReceivingAccountId(sessionDoc.payeeVpa);
  const updated = await YoupiPaymentSession.findByIdAndUpdate(
    sessionDoc._id,
    {
      $set: {
        status: PaymentStatus.MANUAL_REVIEW,
        settlementState: 'MANUAL_REVIEW',
        slotLockActive: false,
        queuePosition: 0,
        flaggedForReview: true,
        manualReviewNote: sanitizePlainText(reason, 240),
        verificationTag: sanitizePlainText(reason, 80),
        lastWebhookEvent: 'PAYMENT.MANUAL_REVIEW'
      }
    },
    { new: true }
  );
  if (recId) {
    await promoteNext(recId).catch(() => {});
  }
  const reg = await syncPendingRegistrationStatus(updated, {
    statusLabel: PaymentStatus.MANUAL_REVIEW,
    settlementLabel: 'MANUAL_REVIEW'
  });
  await emitSessionUpdate(updated, null, reg).catch(() => {});
  return { session: updated, registration: reg };
}

async function finalizePaidRegistrationFromSession(sessionDoc, opts = {}) {
  const eventDoc = await Event.findById(sessionDoc.event);
  if (!eventDoc) {
    throw createHttpError('Associated event no longer exists.', 404, 'EVENT_NOT_FOUND');
  }

  const inAttendees = eventDoc.attendees.some(id => id.toString() === sessionDoc.user.toString());
  if (!inAttendees && eventDoc.attendees.length >= eventDoc.capacity) {
    throw createHttpError('Event reached full capacity before payment completed.', 409, 'EVENT_FULL');
  }

  if (!inAttendees) {
    eventDoc.attendees.push(sessionDoc.user);
    await eventDoc.save();
  }

  const existingReg = await Registration.findOne({ event: eventDoc._id, user: sessionDoc.user });
  const wasAlreadyPaid =
    existingReg &&
    existingReg.paymentStatus === 'paid' &&
    existingReg.youpiPaymentId === sessionDoc.paymentId;

  const finalTransactionId = opts.utr || sessionDoc.utr || sessionDoc.orderId;
  const completedAt = sessionDoc.completedAt || new Date();

  const userDoc = await User.findById(sessionDoc.user).select('email role').lean();
  const userAccountEmail = sanitizeEmailAddress(userDoc?.email) || '';
  let attendeeEmail = '';
  if (userDoc?.role === 'student' && userAccountEmail) {
    attendeeEmail = userAccountEmail;
  } else {
    attendeeEmail =
      sanitizeEmailAddress(sessionDoc.customerEmail) ||
      sanitizeEmailAddress(existingReg?.email) ||
      userAccountEmail ||
      '';
  }

  const reg = await Registration.findOneAndUpdate(
    { event: eventDoc._id, user: sessionDoc.user },
    {
      event: eventDoc._id,
      user: sessionDoc.user,
      name: sessionDoc.customerName || existingReg?.name || 'Student Attendee',
      regNo:
        sessionDoc.customerRegNo ||
        existingReg?.regNo ||
        sessionDoc.user.toString().slice(-8).toUpperCase(),
      email: attendeeEmail,
      needsAccommodation: Boolean(sessionDoc.needsAccommodation),
      status: 'approved',
      paymentStatus: 'paid',
      amountPaid: sessionDoc.amount,
      currency: sessionDoc.currency || eventDoc.currency || 'INR',
      paymentMethod: 'youpi',
      transactionId: finalTransactionId,
      youpiPaymentId: sessionDoc.paymentId,
      youpiOrderId: sessionDoc.orderId,
      youpiStatus: sessionDoc.status,
      settlementState: sessionDoc.settlementState,
      paidAt: completedAt
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  sessionDoc.registration = reg._id;
  if (attendeeEmail && !sessionDoc.customerEmail) {
    sessionDoc.customerEmail = attendeeEmail;
  }
  await sessionDoc.save();

  if (!wasAlreadyPaid) {
    await Notification.create({
      user: sessionDoc.user,
      title: 'YouPI Payment & Event Booking Confirmed',
      message: `Payment of ${sessionDoc.currency} ${sessionDoc.amount} via YouPI-PG (${finalTransactionId}) confirmed for ${eventDoc.title}.`,
      type: 'event_booking',
      relatedEvent: eventDoc._id
    }).catch(err => console.warn('Notification insert warning:', err.message));

    if (attendeeEmail) {
      await sendEventRegistrationEmail({
        to: attendeeEmail,
        attendeeName: reg.name,
        event: eventDoc,
        registration: reg,
        isPaidEvent: true,
        whatsappGroupLink: eventDoc.whatsappGroupLink || ''
      }).catch(err => console.warn('Paid registration email warning:', err.message));
    }
  }

  return { session: sessionDoc, registration: reg };
}

/**
 * Processes an incoming or self-dispatched YouPI-PG webhook payload through
 * cryptographic HMAC-SHA256 verification and deliveryId deduplication.
 */
async function processIncomingWebhook({
  rawBody,
  signatureHeader,
  timestampHeader = null,
  deliveryIdHeader = null
}) {
  const config = getYoupiConfig();
  const payload = verifyYoupiWebhook({
    rawBody,
    signatureHeader,
    timestampHeader,
    deliveryIdHeader,
    secret: config.webhookSecret
  });

  const deliveryId = String(deliveryIdHeader || payload.deliveryId || '').trim();
  const eventName = String(payload.event || payload.status || 'PAYMENT.UPDATE').trim().toUpperCase();
  const targetPaymentId = String(payload.paymentId || payload.id || '').trim();
  const targetOrderId = String(payload.orderId || '').trim();

  if (deliveryId) {
    const existingReceipt = await YoupiWebhookReceipt.findOne({ deliveryId });
    if (existingReceipt) {
      const existingSession = await YoupiPaymentSession.findOne({
        $or: [
          ...(targetPaymentId ? [{ paymentId: targetPaymentId }, { externalPaymentId: targetPaymentId }] : []),
          ...(targetOrderId ? [{ orderId: targetOrderId }] : [])
        ]
      });
      return {
        duplicate: true,
        deliveryId,
        event: eventName,
        session: existingSession,
        registration: existingSession?.registration
          ? await Registration.findById(existingSession.registration)
          : null
      };
    }
  }

  const queryClauses = [];
  if (targetPaymentId) {
    queryClauses.push({ paymentId: targetPaymentId }, { externalPaymentId: targetPaymentId });
  }
  if (targetOrderId) {
    queryClauses.push({ orderId: targetOrderId });
  }
  if (queryClauses.length === 0) {
    throw createHttpError('Webhook payload must identify paymentId or orderId.', 400, 'MISSING_PAYMENT_ID');
  }

  const session = await YoupiPaymentSession.findOne({ $or: queryClauses });
  if (!session) {
    throw createHttpError(
      `No matching YouPI payment session found for ${targetPaymentId || targetOrderId}.`,
      404,
      'SESSION_NOT_FOUND'
    );
  }

  let nextStatus = String(payload.status || '').trim().toUpperCase();
  if (!nextStatus) {
    if (eventName.includes('RECONCILED')) nextStatus = PaymentStatus.RECONCILED;
    else if (eventName.includes('OBSERVED_SUCCESS')) nextStatus = PaymentStatus.OBSERVED_SUCCESS;
    else if (eventName.includes('MANUAL_REVIEW')) nextStatus = PaymentStatus.MANUAL_REVIEW;
    else if (eventName.includes('SUCCESS')) nextStatus = PaymentStatus.SUCCESS;
    else if (eventName.includes('FAILED')) nextStatus = PaymentStatus.FAILED;
    else if (eventName.includes('EXPIRED')) nextStatus = PaymentStatus.EXPIRED;
    else if (eventName.includes('CANCELLED')) nextStatus = PaymentStatus.CANCELLED;
  }

  if (payload.amountPaise !== undefined && payload.amountPaise !== null && payload.amountPaise !== '') {
    const webhookPaise = Number(payload.amountPaise);
    if (!Number.isFinite(webhookPaise) || webhookPaise !== Number(session.amountPaise)) {
      throw createHttpError(
        `Webhook amount mismatch (expected ${session.amountPaise} paise, got ${payload.amountPaise}).`,
        409,
        'AMOUNT_MISMATCH'
      );
    }
  }

  if (nextStatus === PaymentStatus.SUCCESS && String(payload.method || '').trim().toUpperCase() === 'COD') {
    throw createHttpError('Cash-on-delivery SUCCESS event cannot fulfill a UPI event pass.', 400, 'METHOD_MISMATCH');
  }

  const incomingUtr = normalizeUtr(payload.utr || payload.bankRef || payload.reference || session.utr);
  if (incomingUtr) {
    session.utr = incomingUtr;
    if (!TERMINAL_FAILURE_STATUSES.includes(nextStatus)) {
      session.uniqueUtrClaim = incomingUtr.toUpperCase();
    }
    if (!session.submittedAt) session.submittedAt = new Date();
  }

  const previousStatus = session.status;
  if (nextStatus) {
    session.status = nextStatus;
    session.settlementState = settlementStateFor(nextStatus, session.method);
  }
  if (SLOT_RELEASE_STATES.includes(session.status)) {
    session.slotLockActive = false;
    session.queuePosition = 0;
  }
  if (TERMINAL_FAILURE_STATUSES.includes(session.status)) {
    session.uniqueUtrClaim = undefined;
  }
  if (payload.verificationTag) {
    session.verificationTag = sanitizePlainText(payload.verificationTag, 80);
  }
  if (Number.isFinite(Number(payload.verificationLevel))) {
    session.verificationLevel = Number(payload.verificationLevel);
  }
  if (payload.observationSource) {
    session.observationSource = String(payload.observationSource).toUpperCase();
  }
  if (payload.reason || payload.failureReason) {
    session.failureReason = sanitizePlainText(payload.reason || payload.failureReason, 240);
  }
  if ((isSettledStatus(session.status) || session.status === PaymentStatus.OBSERVED_SUCCESS) && !session.completedAt) {
    session.completedAt = payload.completedAt ? new Date(payload.completedAt) : new Date();
  }
  session.lastWebhookEvent = eventName;
  if (deliveryId) session.lastDeliveryId = deliveryId;
  await session.save();

  if (deliveryId) {
    await YoupiWebhookReceipt.create({
      deliveryId,
      event: eventName,
      paymentId: session.paymentId,
      orderId: session.orderId,
      signatureValid: true,
      rawTimestamp: String(timestampHeader || payload.timestamp || ''),
      payloadSummary: {
        status: session.status,
        settlementState: session.settlementState,
        utr: incomingUtr || ''
      }
    }).catch(err => {
      if (err?.code !== 11000) throw err;
    });
  }

  let registration = null;
  if (isSettledStatus(session.status)) {
    const fulfilled = await finalizePaidRegistrationFromSession(session, { utr: incomingUtr });
    registration = fulfilled.registration;
  } else if (session.status === PaymentStatus.OBSERVED_SUCCESS) {
    // Zero-Trust: OBSERVED_SUCCESS never settles the registration
    registration = await syncPendingRegistrationStatus(session, {
      statusLabel: PaymentStatus.OBSERVED_SUCCESS,
      settlementLabel: 'NOT_RECONCILED',
      utr: incomingUtr
    });
  } else if (session.status === PaymentStatus.MANUAL_REVIEW) {
    registration = await syncPendingRegistrationStatus(session, {
      statusLabel: PaymentStatus.MANUAL_REVIEW,
      settlementLabel: settlementStateFor(PaymentStatus.MANUAL_REVIEW, session.method),
      utr: incomingUtr
    });
  } else if (TERMINAL_FAILURE_STATUSES.includes(session.status) && session.registration) {
    registration = await Registration.findByIdAndUpdate(
      session.registration,
      {
        paymentStatus: 'failed',
        youpiStatus: session.status,
        settlementState: session.settlementState
      },
      { new: true }
    );
  }

  // If transitioning out of an occupied slot, promote the next queued checkout
  const recId = session.receivingAccountId || normalizeReceivingAccountId(session.payeeVpa);
  if (SLOT_OCCUPYING_STATES.includes(previousStatus) && SLOT_RELEASE_STATES.includes(session.status) && recId) {
    await promoteNext(recId, config.activeDurationMs).catch(() => {});
  }

  let emitEventDoc = null;
  if (session.event) {
    emitEventDoc = await Event.findById(session.event)
      .select('title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds')
      .lean()
      .catch(() => null);
  }
  await emitSessionUpdate(session, emitEventDoc, registration).catch(() => {});

  return {
    duplicate: false,
    deliveryId,
    event: eventName,
    session,
    registration
  };
}

async function emitSessionUpdate(sessionDoc, eventDoc = null, registrationDoc = null, availableVpas = null) {
  if (!sessionDoc) return null;
  let resolvedEvent = eventDoc;
  if (!resolvedEvent && sessionDoc.event) {
    resolvedEvent = await Event.findById(sessionDoc.event?._id || sessionDoc.event)
      .select('title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds')
      .lean()
      .catch(() => null);
  }
  let resolvedPool = availableVpas;
  if (!Array.isArray(resolvedPool)) {
    const settingsDoc = await SystemSetting.findOne({ key: 'global' })
      .select('youpiBackupVpas')
      .lean()
      .catch(() => null);
    resolvedPool = getBackupVpaPool(resolvedEvent, settingsDoc, sessionDoc.payeeVpa);
  }
  const estimatedWaitSeconds =
    sessionDoc.status === PaymentStatus.QUEUED
      ? await calculateEstimatedWaitSeconds(
          sessionDoc.receivingAccountId || sessionDoc.payeeVpa,
          sessionDoc.queuePosition || 0
        )
      : null;

  const dto = serializeSessionDto(sessionDoc, resolvedEvent, registrationDoc, resolvedPool, estimatedWaitSeconds);
  PaymentEventBus.emit('session.update', dto);
  return dto;
}

function buildPublicOrigin(req) {
  const frontendUrl = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)[0];

  if (req) {
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    if (host) return `${proto}://${host}`;
  }
  return frontendUrl || `http://localhost:${process.env.PORT || 5000}`;
}

function serializeSessionDto(
  sessionDoc,
  eventDoc = null,
  registrationDoc = null,
  availableVpas = null,
  estimatedWaitSeconds = null
) {
  const config = getYoupiConfig();
  const obj = sessionDoc.toObject ? sessionDoc.toObject() : sessionDoc;
  const now = Date.now();
  const isQueued = obj.status === PaymentStatus.QUEUED;
  const isSettled = isSettledStatus(obj.status);

  let timeRemainingSeconds = 0;
  if (obj.status === PaymentStatus.PROCESSING && obj.processingExpiresAt) {
    timeRemainingSeconds = Math.max(0, Math.ceil((new Date(obj.processingExpiresAt).getTime() - now) / 1000));
  } else if (obj.status === PaymentStatus.ACTIVE && obj.expiresAt) {
    timeRemainingSeconds = Math.max(0, Math.ceil((new Date(obj.expiresAt).getTime() - now) / 1000));
  } else if (isQueued) {
    timeRemainingSeconds =
      typeof estimatedWaitSeconds === 'number'
        ? Math.max(0, estimatedWaitSeconds)
        : Math.max(0, Number(obj.queuePosition || 1) * Math.round((config.activeDurationMs + config.processingDurationMs) / 1000));
  }

  const vpaList =
    Array.isArray(availableVpas) && availableVpas.length > 0
      ? availableVpas
      : getBackupVpaPool(eventDoc, null, obj.payeeVpa);

  // Queued Security Invariant: NEVER leak UPI URI or QR SVG while session is waiting in QUEUED!
  const visibleUpiUri = !isQueued && obj.upiUri ? obj.upiUri : '';
  const visibleQrSvg = !isQueued && obj.qrSvg ? obj.qrSvg : '';

  return {
    paymentId: obj.paymentId,
    externalPaymentId: obj.externalPaymentId || '',
    orderId: obj.orderId,
    attemptId: obj.attemptId || 1,
    gatewayMode: obj.gatewayMode,
    verificationMode: config.verificationMode,
    allowDemoUtr: Boolean(config.allowDemoUtr),
    eventId: obj.event?._id || obj.event,
    eventTitle: eventDoc?.title || obj.event?.title || obj.metadata?.eventTitle || 'Campus Event',
    paymentInstructions: eventDoc?.paymentInstructions || obj.metadata?.paymentInstructions || '',
    amount: obj.amount,
    amountDisplay: toRupeesString(obj.amountPaise),
    amountPaise: String(obj.amountPaise),
    currency: obj.currency || 'INR',
    method: obj.method || 'UPI',
    status: obj.status,
    settlementState: obj.settlementState || settlementStateFor(obj.status, obj.method),
    settled: isSettled,
    slotLockActive: Boolean(obj.slotLockActive),
    queuePosition: obj.queuePosition || 0,
    estimatedWaitSeconds: isQueued ? timeRemainingSeconds : 0,
    receivingAccountId: obj.receivingAccountId || normalizeReceivingAccountId(obj.payeeVpa),
    receivingAccountSnapshot: obj.receivingAccountSnapshot || {
      receivingAccountId: normalizeReceivingAccountId(obj.payeeVpa),
      upiId: obj.payeeVpa || '',
      payeeName: obj.payeeName || config.defaultPayeeName,
      isMerchantEnabled: true
    },
    payeeVpa: obj.payeeVpa || '',
    payeeName: obj.payeeName || config.defaultPayeeName,
    availableVpas: vpaList,
    vpaHistory:
      Array.isArray(obj.vpaHistory) && obj.vpaHistory.length > 0
        ? obj.vpaHistory
        : obj.payeeVpa
          ? [obj.payeeVpa]
          : [],
    upiUri: visibleUpiUri,
    upiAppIntents: buildUpiAppIntents(visibleUpiUri),
    qrSvg: visibleQrSvg,
    providers: UPI_PROVIDERS,
    checkoutUrl: obj.checkoutUrl || '',
    utr: obj.utr || '',
    utrSubmittedAt: obj.utrSubmittedAt || null,
    verificationTag: obj.verificationTag || 'UNVERIFIED',
    verificationLevel: obj.verificationLevel || 0,
    verificationSources: Array.isArray(obj.verificationSources) ? obj.verificationSources : [],
    observationSource: obj.observationSource || 'NONE',
    observedAt: obj.observedAt || null,
    observedSenderVpa: obj.observedSenderVpa || '',
    slotAcquiredAt: obj.slotAcquiredAt || null,
    processingStartedAt: obj.processingStartedAt || null,
    processingExpiresAt: obj.processingExpiresAt || null,
    failureReason: obj.failureReason || '',
    flaggedForReview: Boolean(obj.flaggedForReview),
    manualReviewNote: obj.manualReviewNote || '',
    expiresAt: obj.expiresAt || null,
    completedAt: obj.completedAt || null,
    timeRemainingSeconds,
    canClickPaymentDone: obj.status === PaymentStatus.ACTIVE && obj.method !== PaymentMethod.MANUAL_UPI,
    canSubmitManualUtr:
      obj.method === PaymentMethod.MANUAL_UPI &&
      [PaymentStatus.ACTIVE, PaymentStatus.MANUAL_REVIEW].includes(obj.status),
    canCancel: ![PaymentStatus.PROCESSING, ...IMMUTABLE_STATES].includes(obj.status),
    customerName: obj.customerName || '',
    customerRegNo: obj.customerRegNo || '',
    customerEmail: obj.customerEmail || '',
    needsAccommodation: Boolean(obj.needsAccommodation),
    hasWhatsappGroup: Boolean(eventDoc?.whatsappGroupLink),
    whatsappGroupLink: isSettled && eventDoc?.whatsappGroupLink ? eventDoc.whatsappGroupLink : '',
    registration: registrationDoc || null,
    createdAt: obj.createdAt
  };
}

/**
 * Initiates or resumes a YouPI-PG V2 payment session for a paid event.
 */
async function createYoupiPaymentSession({ eventId, user, body = {}, req = null }) {
  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    throw createHttpError('Valid eventId is required.', 400, 'INVALID_EVENT_ID');
  }

  // Enforce Fraud Security Engine suspension check
  const freshUser = await User.findById(user._id).select('paymentSecurityStatus paymentSecurityReason email role name').lean();
  if (freshUser && freshUser.paymentSecurityStatus === 'SUSPENDED') {
    throw createHttpError(
      'ACCESS BLOCKED: Account suspended due to fraudulent payment notification activity. Contact Administrator to review.',
      403,
      'BANNED_IDENTITY',
      { isBanned: true, reason: freshUser.paymentSecurityReason || 'FRAUDULENT_PAYMENT_INJECTION' }
    );
  }

  const eventDoc = await Event.findById(eventId).populate('club', 'name');
  if (!eventDoc) {
    throw createHttpError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  const lc = computeEventLifecycle(eventDoc);
  if (['cancelled', 'rejected'].includes(eventDoc.status) || lc.registrationState === 'REGISTRATION CLOSED') {
    throw createHttpError('Registration is closed for this event.', 400, 'REGISTRATION_CLOSED');
  }
  if (lc.registrationState === 'EVENT COMPLETED') {
    throw createHttpError('This event has already completed.', 400, 'EVENT_COMPLETED');
  }

  const existingReg = await Registration.findOne({ event: eventDoc._id, user: user._id });
  const inAttendees = eventDoc.attendees.some(id => id.toString() === user._id.toString());
  const isPaidEvent = Boolean(eventDoc.isPaid && Number(eventDoc.registrationFee || 0) > 0);

  if (!isPaidEvent) {
    return { isPaidEvent: false, session: null };
  }

  if (existingReg && existingReg.status !== 'cancelled' && existingReg.paymentStatus === 'paid') {
    throw createHttpError('You have already completed payment and registration for this event.', 400, 'ALREADY_PAID');
  }

  if (!inAttendees && eventDoc.attendees.length >= eventDoc.capacity) {
    throw createHttpError('Event is full.', 400, 'EVENT_FULL');
  }

  const config = getYoupiConfig();
  if (!config.webhookSecret) {
    throw createHttpError(
      'YouPI webhook secret is not configured. Set YOUPI_WEBHOOK_SECRET on the server.',
      503,
      'YOUPI_CONFIG_ERROR'
    );
  }
  if (config.gatewayMode === 'external' && (!config.merchantId || !config.merchantKey)) {
    throw createHttpError(
      'External YouPI-PG credentials missing. Set YOUPI_MERCHANT_ID and YOUPI_MERCHANT_KEY on the server.',
      503,
      'YOUPI_CONFIG_ERROR'
    );
  }

  const rawEventVpa = String(eventDoc.paymentUpiId || '').trim();
  if (rawEventVpa && !isValidVpa(rawEventVpa)) {
    throw createHttpError(`Invalid event Payee UPI VPA: ${rawEventVpa}`, 400, 'INVALID_VPA');
  }
  const primaryVpa = rawEventVpa || config.defaultPayeeVpa;
  if (config.gatewayMode === 'embedded' && !primaryVpa) {
    throw createHttpError(
      'Merchant UPI VPA is not configured. Add a valid Payee UPI VPA on this event or set YOUPI_PAYEE_VPA on the server.',
      503,
      'YOUPI_VPA_NOT_CONFIGURED'
    );
  }

  const settingsDoc = await SystemSetting.findOne({ key: 'global' })
    .select('youpiBackupVpas')
    .lean()
    .catch(() => null);
  const availableVpas = getBackupVpaPool(eventDoc, settingsDoc, primaryVpa);

  const requestedPreferred = String(body.preferredVpa || '').trim();
  let payeeVpa = primaryVpa;
  if (requestedPreferred) {
    if (!isValidVpa(requestedPreferred)) {
      throw createHttpError(`Invalid preferred UPI VPA: ${requestedPreferred}`, 400, 'INVALID_VPA');
    }
    const matched = availableVpas.find(v => v.toLowerCase() === requestedPreferred.toLowerCase());
    if (matched) {
      payeeVpa = matched;
    } else if (['admin', 'organizer'].includes(user.role)) {
      payeeVpa = requestedPreferred;
      availableVpas.push(requestedPreferred);
    } else {
      throw createHttpError(
        'Selected UPI ID is not in the authorized merchant UPI pool for this event.',
        403,
        'UNAUTHORIZED_VPA'
      );
    }
  }

  const receivingAccountId = normalizeReceivingAccountId(payeeVpa);
  const payeeName =
    rawEventVpa && payeeVpa === rawEventVpa && rawEventVpa !== config.defaultPayeeVpa && eventDoc.club?.name
      ? `${eventDoc.club.name} · Avenor`
      : config.defaultPayeeName;
  const amountPaise = toPaise(eventDoc.registrationFee);
  const amount = Number(eventDoc.registrationFee);
  const currency = (eventDoc.currency || 'INR').toUpperCase();

  const method = body.method
    ? String(body.method).toUpperCase() === PaymentMethod.MANUAL_UPI
      ? PaymentMethod.MANUAL_UPI
      : PaymentMethod.UPI
    : config.defaultMethod;

  await expireStaleSlots(receivingAccountId);

  const customerName = sanitizePlainText(body.name, 120) || user.name || 'Student Attendee';
  const customerRegNo =
    sanitizePlainText(body.regNo, 60) ||
    existingReg?.regNo ||
    user._id.toString().slice(-8).toUpperCase();
  const accountEmail = sanitizeEmailAddress(freshUser?.email || user.email) || '';
  let customerEmail = accountEmail;
  if (user.role !== 'student' && body.email !== undefined && String(body.email).trim() !== '') {
    const cleanEmail = sanitizeEmailAddress(String(body.email).trim());
    if (!cleanEmail) {
      throw createHttpError('Please enter a valid confirmation email address.', 400, 'INVALID_EMAIL');
    }
    customerEmail = cleanEmail;
  }
  if (!customerEmail) {
    customerEmail = sanitizeEmailAddress(existingReg?.email) || '';
  }
  const needsAccommodation = Boolean(body.needsAccommodation);

  // Reuse an active/queued/processing/pending-review session if amount, immutable VPA, method, and gatewayMode match
  if (!body.forceNew) {
    const activeExisting = await YoupiPaymentSession.findOne({
      user: user._id,
      event: eventDoc._id,
      status: {
        $in: [
          PaymentStatus.ACTIVE,
          PaymentStatus.INITIATED,
          PaymentStatus.PROCESSING,
          PaymentStatus.QUEUED,
          PaymentStatus.OBSERVED_SUCCESS,
          PaymentStatus.MANUAL_REVIEW
        ]
      }
    }).sort({ createdAt: -1 });

    if (activeExisting) {
      const vpaMatches =
        normalizeReceivingAccountId(activeExisting.payeeVpa) === receivingAccountId;
      const methodMatches = !body.method || activeExisting.method === method;
      const stillValid =
        activeExisting.amountPaise === amountPaise &&
        vpaMatches &&
        methodMatches &&
        activeExisting.gatewayMode === config.gatewayMode &&
        (activeExisting.status === PaymentStatus.QUEUED ||
          activeExisting.status === PaymentStatus.MANUAL_REVIEW ||
          activeExisting.status === PaymentStatus.OBSERVED_SUCCESS ||
          (activeExisting.status === PaymentStatus.PROCESSING &&
            (!activeExisting.processingExpiresAt || activeExisting.processingExpiresAt.getTime() > Date.now())) ||
          (!activeExisting.expiresAt || activeExisting.expiresAt.getTime() > Date.now()));

      if (stillValid) {
        activeExisting.customerName = customerName;
        activeExisting.customerRegNo = customerRegNo;
        if (customerEmail) activeExisting.customerEmail = customerEmail;
        activeExisting.needsAccommodation = needsAccommodation;
        if (activeExisting.status === PaymentStatus.ACTIVE && !activeExisting.qrSvg && activeExisting.upiUri) {
          activeExisting.qrSvg = await generateQrSvg(activeExisting.upiUri, { boxSize: 220, errorCorrection: 'M' });
        }
        await activeExisting.save();
        const estWait =
          activeExisting.status === PaymentStatus.QUEUED
            ? await calculateEstimatedWaitSeconds(receivingAccountId, activeExisting.queuePosition)
            : null;
        return {
          isPaidEvent: true,
          reused: true,
          session: serializeSessionDto(activeExisting, eventDoc, existingReg, availableVpas, estWait)
        };
      }

      if (activeExisting.status === PaymentStatus.PROCESSING) {
        throw createHttpError(
          'Your current session is actively waiting for bank verification (30s window). Please wait for it to finish.',
          409,
          'SESSION_PROCESSING'
        );
      }

      if ([PaymentStatus.ACTIVE, PaymentStatus.INITIATED, PaymentStatus.QUEUED].includes(activeExisting.status)) {
        const wasSlotHolder = Boolean(activeExisting.slotLockActive);
        activeExisting.status = PaymentStatus.CANCELLED;
        activeExisting.settlementState = 'CANCELLED';
        activeExisting.slotLockActive = false;
        activeExisting.queuePosition = 0;
        activeExisting.uniqueUtrClaim = undefined;
        activeExisting.failureReason = 'Superseded by new checkout configuration.';
        await activeExisting.save();
        if (wasSlotHolder) {
          await promoteNext(activeExisting.receivingAccountId || receivingAccountId, config.activeDurationMs).catch(() => {});
        } else if (activeExisting.receivingAccountId) {
          await reindexQueue(activeExisting.receivingAccountId).catch(() => {});
        }
      }
    }
  } else {
    // Even if forceNew is requested, refuse to cancel a live PROCESSING session
    const processingExisting = await YoupiPaymentSession.findOne({
      user: user._id,
      event: eventDoc._id,
      status: PaymentStatus.PROCESSING
    });
    if (processingExisting) {
      throw createHttpError(
        'Cannot restart payment while bank verification is in progress (PROCESSING).',
        409,
        'SESSION_PROCESSING'
      );
    }
    const cancellable = await YoupiPaymentSession.find({
      user: user._id,
      event: eventDoc._id,
      status: { $in: [PaymentStatus.ACTIVE, PaymentStatus.INITIATED, PaymentStatus.QUEUED] }
    });
    for (const prev of cancellable) {
      const wasSlot = Boolean(prev.slotLockActive);
      const prevRec = prev.receivingAccountId || normalizeReceivingAccountId(prev.payeeVpa);
      prev.status = PaymentStatus.CANCELLED;
      prev.settlementState = 'CANCELLED';
      prev.slotLockActive = false;
      prev.queuePosition = 0;
      prev.uniqueUtrClaim = undefined;
      prev.failureReason = 'Restarted by student.';
      await prev.save();
      if (wasSlot) {
        await promoteNext(prevRec, config.activeDurationMs).catch(() => {});
      }
    }
  }

  const priorAttempts = await YoupiPaymentSession.countDocuments({
    user: user._id,
    event: eventDoc._id
  });
  const attemptId = priorAttempts + 1;
  const paymentId = crypto.randomUUID();
  const orderId = `AVN-${eventDoc._id.toString().slice(-5).toUpperCase()}-${user._id
    .toString()
    .slice(-4)
    .toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const baseUrl = buildPublicOrigin(req);
  const receivingAccountSnapshot = {
    receivingAccountId,
    upiId: payeeVpa,
    payeeName,
    isMerchantEnabled: true
  };

  if (config.gatewayMode === 'external') {
    const returnUrl = `${baseUrl}/events/${eventDoc._id}?youpiOrder=${encodeURIComponent(orderId)}`;
    const response = await fetch(`${config.apiUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Id': config.merchantId,
        'X-Merchant-Key': config.merchantKey,
        'Idempotency-Key': orderId
      },
      body: JSON.stringify({
        orderId,
        amount: toRupeesString(amountPaise),
        currency,
        method,
        returnUrl,
        customer: {
          fullName: customerName,
          name: customerName,
          email: customerEmail || user.email || ''
        },
        metadata: {
          eventId: eventDoc._id.toString(),
          eventTitle: eventDoc.title,
          userId: user._id.toString(),
          regNo: customerRegNo,
          needsAccommodation
        }
      }),
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw createHttpError(
        `External YouPI-PG gateway error (${response.status}): ${errText || response.statusText}`,
        502,
        'YOUPI_EXTERNAL_ERROR'
      );
    }

    const gwData = await response.json();
    const session = await YoupiPaymentSession.create({
      paymentId: gwData.paymentId || paymentId,
      externalPaymentId: gwData.paymentId || '',
      orderId: gwData.orderId || orderId,
      attemptId,
      idempotencyKey: orderId,
      gatewayMode: 'external',
      merchantId: config.merchantId,
      receivingAccountId,
      slotLockActive: false,
      receivingAccountSnapshot,
      event: eventDoc._id,
      user: user._id,
      amount,
      amountPaise,
      currency,
      method,
      status: String(gwData.status || PaymentStatus.INITIATED).toUpperCase(),
      settlementState: 'PENDING',
      queuePosition: Number(gwData.queuePosition || 0),
      payeeVpa,
      payeeName,
      vpaHistory: [payeeVpa],
      checkoutUrl: gwData.checkoutUrl || `${config.apiUrl}/checkout/${gwData.paymentId || paymentId}`,
      customerName,
      customerRegNo,
      customerEmail: customerEmail || user.email || '',
      needsAccommodation,
      expiresAt: new Date(Date.now() + config.activeDurationMs),
      metadata: {
        eventTitle: eventDoc.title,
        paymentInstructions: eventDoc.paymentInstructions || ''
      }
    });

    return {
      isPaidEvent: true,
      reused: false,
      session: serializeSessionDto(session, eventDoc, null, availableVpas)
    };
  }

  // Embedded YouPI-PG V2 Engine with exclusive single-slot FIFO queue
  const checkoutUrl = `${baseUrl}/api/payments/youpi/portal/${paymentId}`;
  const createdSession = await YoupiPaymentSession.create({
    paymentId,
    orderId,
    attemptId,
    idempotencyKey: orderId,
    gatewayMode: 'embedded',
    merchantId: config.merchantId,
    receivingAccountId,
    slotLockActive: false,
    receivingAccountSnapshot,
    event: eventDoc._id,
    user: user._id,
    amount,
    amountPaise,
    currency,
    method,
    status: PaymentStatus.INITIATED,
    settlementState: 'PENDING',
    queuePosition: 0,
    payeeVpa,
    payeeName,
    vpaHistory: [payeeVpa],
    upiUri: '',
    qrSvg: '',
    checkoutUrl,
    customerName,
    customerRegNo,
    customerEmail: customerEmail || user.email || '',
    needsAccommodation,
    metadata: {
      eventTitle: eventDoc.title,
      paymentInstructions: eventDoc.paymentInstructions || ''
    }
  });

  const activeWindowMs =
    Number(body.activeDurationMs) >= 5000 ? Number(body.activeDurationMs) : config.activeDurationMs;
  const slotResult = await acquireSlotAtomic(createdSession, receivingAccountId, activeWindowMs);
  const estWait =
    slotResult.status === PaymentStatus.QUEUED
      ? await calculateEstimatedWaitSeconds(receivingAccountId, slotResult.queuePosition)
      : null;

  await emitSessionUpdate(slotResult.session, eventDoc, existingReg, availableVpas).catch(() => {});

  return {
    isPaidEvent: true,
    reused: false,
    session: serializeSessionDto(slotResult.session, eventDoc, existingReg, availableVpas, estWait)
  };
}

/**
 * Fetches and synchronizes session status (enforces dual timers + external gateway polling).
 */
async function syncAndGetYoupiSession({ paymentId, user }) {
  const session = await YoupiPaymentSession.findOne({ paymentId });
  if (!session) {
    throw createHttpError('YouPI payment session not found.', 404, 'SESSION_NOT_FOUND');
  }

  const isPrivileged = ['admin', 'organizer'].includes(user.role);
  if (!isPrivileged && session.user.toString() !== user._id.toString()) {
    throw createHttpError('Not authorized to view this payment session.', 403, 'FORBIDDEN');
  }

  const config = getYoupiConfig();
  const recId = session.receivingAccountId || normalizeReceivingAccountId(session.payeeVpa);
  if (session.gatewayMode === 'embedded' && recId) {
    const expired = await expireStaleSlots(recId);
    if (expired.length > 0) {
      await promoteNext(recId, config.activeDurationMs).catch(() => {});
    }
  }

  let current = await YoupiPaymentSession.findById(session._id);

  if (current && current.gatewayMode === 'external' && config.apiUrl && !isSettledStatus(current.status)) {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/v1/payments/${current.externalPaymentId || current.paymentId}`,
        {
          headers: {
            'X-Merchant-Id': config.merchantId,
            'X-Merchant-Key': config.merchantKey
          },
          signal: AbortSignal.timeout(8000)
        }
      );
      if (response.ok) {
        const gw = await response.json();
        const gwStatus = String(gw.status || current.status).toUpperCase();
        current.status = gwStatus;
        current.settlementState = gw.settlementState || settlementStateFor(gwStatus, current.method);
        if (gw.verificationTag) current.verificationTag = gw.verificationTag;
        if (gw.verificationLevel !== undefined) current.verificationLevel = Number(gw.verificationLevel);
        if (gw.completedAt) current.completedAt = new Date(gw.completedAt);
        await current.save();

        if (isSettledStatus(current.status)) {
          await finalizePaidRegistrationFromSession(current, { utr: gw.bankRef || gw.utr || current.utr });
        }
      }
    } catch (err) {
      console.warn('External YouPI poll skipped:', err.message);
    }
  }

  const [eventDoc, regDoc, settingsDoc] = await Promise.all([
    Event.findById(current.event).select('title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds'),
    current.registration
      ? Registration.findById(current.registration)
      : Registration.findOne({ event: current.event, user: current.user }),
    SystemSetting.findOne({ key: 'global' }).select('youpiBackupVpas').lean().catch(() => null)
  ]);

  const availableVpas = getBackupVpaPool(eventDoc, settingsDoc, current.payeeVpa);
  const estWait =
    current.status === PaymentStatus.QUEUED
      ? await calculateEstimatedWaitSeconds(recId, current.queuePosition)
      : null;

  return serializeSessionDto(current, eventDoc, regDoc, availableVpas, estWait);
}

/**
 * Manual UTR submission strictly for `MANUAL_UPI` checkouts (`/manual-utr` and `/submit-utr`).
 * Releases the receiving account slot lock, moves session to `MANUAL_REVIEW` (`PENDING_VERIFICATION`),
 * promotes next queued checkout, and holds Registration as pending until bank reconciliation.
 */
async function submitUtrAndProcessSession({ paymentId, user, body = {} }) {
  const session = await YoupiPaymentSession.findOne({ paymentId });
  if (!session) {
    throw createHttpError('YouPI payment session not found.', 404, 'SESSION_NOT_FOUND');
  }

  if (session.user.toString() !== user._id.toString() && !['admin', 'organizer'].includes(user.role)) {
    throw createHttpError('Not authorized to verify this payment session.', 403, 'FORBIDDEN');
  }

  if (session.method !== PaymentMethod.MANUAL_UPI) {
    throw createHttpError(
      'Transaction reference submission is only available for Manual UPI checkouts. Use automatic verification ("I Have Paid") for standard UPI.',
      409,
      'AUTOMATIC_UPI_ONLY'
    );
  }

  const recId = session.receivingAccountId || normalizeReceivingAccountId(session.payeeVpa);
  if (recId) {
    await expireStaleSlots(recId);
  }
  const fresh = await YoupiPaymentSession.findById(session._id);

  if (isSettledStatus(fresh.status)) {
    const reg =
      (fresh.registration && (await Registration.findById(fresh.registration))) ||
      (await Registration.findOne({ event: fresh.event, user: fresh.user }));
    const ev = await Event.findById(fresh.event).select('title paymentInstructions whatsappGroupLink');
    return {
      paymentId: fresh.paymentId,
      orderId: fresh.orderId,
      status: fresh.status,
      settlementState: fresh.settlementState,
      customerUtr: fresh.utr,
      utrSubmittedAt: fresh.utrSubmittedAt,
      session: serializeSessionDto(fresh, ev, reg),
      registration: reg,
      alreadySettled: true
    };
  }

  if (![PaymentStatus.ACTIVE, PaymentStatus.MANUAL_REVIEW].includes(fresh.status)) {
    throw createHttpError('This checkout is no longer accepting a transaction reference.', 409, 'SESSION_NOT_ACCEPTING_UTR');
  }

  const utr = normalizeUtr(body.utr || body.reference || body.transactionId);
  if (!isValidUtr(utr)) {
    throw createHttpError('Enter a valid UPI reference (6–35 letters or digits).', 400, 'INVALID_UTR');
  }

  // Anti-replay duplicate UTR check
  const utrRegex = new RegExp(`^${utr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const [duplicateSession, duplicateReg] = await Promise.all([
    YoupiPaymentSession.findOne({
      paymentId: { $ne: fresh.paymentId },
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
      youpiPaymentId: { $ne: fresh.paymentId },
      $or: [{ event: { $ne: fresh.event } }, { user: { $ne: fresh.user } }]
    }).select('_id')
  ]);

  if (duplicateSession || duplicateReg) {
    throw createHttpError('This UPI reference has already been submitted.', 409, 'DUPLICATE_UTR');
  }

  if (body.name) fresh.customerName = sanitizePlainText(body.name, 120) || fresh.customerName;
  if (body.regNo) fresh.customerRegNo = sanitizePlainText(body.regNo, 60) || fresh.customerRegNo;
  const userAccountEmail = sanitizeEmailAddress(user?.email) || '';
  if (user?.role === 'student' && userAccountEmail) {
    fresh.customerEmail = userAccountEmail;
  } else if (body.email) {
    const cleanEmail = sanitizeEmailAddress(body.email);
    if (!cleanEmail) {
      throw createHttpError('Please enter a valid confirmation email address.', 400, 'INVALID_EMAIL');
    }
    fresh.customerEmail = cleanEmail;
  } else if (!fresh.customerEmail && userAccountEmail) {
    fresh.customerEmail = userAccountEmail;
  }
  if (body.needsAccommodation !== undefined) {
    fresh.needsAccommodation = Boolean(body.needsAccommodation);
  }

  const now = new Date();
  const wasHoldingSlot = Boolean(fresh.slotLockActive);
  fresh.utr = utr;
  fresh.uniqueUtrClaim = utr.toUpperCase();
  fresh.utrSubmittedAt = now;
  fresh.submittedAt = fresh.submittedAt || now;
  fresh.status = PaymentStatus.MANUAL_REVIEW;
  fresh.settlementState = 'PENDING_VERIFICATION';
  fresh.verificationTag = 'CUSTOMER_UTR_SUBMITTED';
  fresh.verificationLevel = 1;
  fresh.slotLockActive = false;
  fresh.queuePosition = 0;
  fresh.lastWebhookEvent = 'PAYMENT.MANUAL_REVIEW';

  try {
    await fresh.save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw createHttpError('This UPI reference has already been submitted.', 409, 'DUPLICATE_UTR');
    }
    throw err;
  }

  if (wasHoldingSlot && recId) {
    await promoteNext(recId).catch(() => {});
  }

  const [eventDoc, settingsDoc] = await Promise.all([
    Event.findById(fresh.event).select(
      'title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds date time location currency registrationFee'
    ),
    SystemSetting.findOne({ key: 'global' }).select('youpiBackupVpas').lean().catch(() => null)
  ]);

  const reg = await syncPendingRegistrationStatus(fresh, {
    statusLabel: PaymentStatus.MANUAL_REVIEW,
    settlementLabel: 'PENDING_VERIFICATION',
    utr
  });

  const availableVpas = getBackupVpaPool(eventDoc, settingsDoc, fresh.payeeVpa);
  if (fresh.customerEmail) {
    await sendPaymentUnderReviewEmail({
      to: fresh.customerEmail,
      attendeeName: fresh.customerName,
      event: eventDoc,
      session: fresh
    }).catch(err => console.warn('Manual review email warning:', err.message));
  }

  const dto = serializeSessionDto(fresh, eventDoc, reg, availableVpas);
  await emitSessionUpdate(fresh, eventDoc, reg, availableVpas).catch(() => {});

  return {
    paymentId: fresh.paymentId,
    orderId: fresh.orderId,
    status: 'PENDING_VERIFICATION',
    settlementState: 'PENDING_VERIFICATION',
    customerUtr: fresh.utr,
    utrSubmittedAt: fresh.utrSubmittedAt ? fresh.utrSubmittedAt.toISOString() : null,
    message: 'Payment submitted. The merchant must verify it in the bank account.',
    session: dto,
    registration: reg,
    alreadySettled: false
  };
}

/**
 * Upstream invariant (`checkout.routes.js` / `receivingAccountSnapshot`):
 * Payee VPA is immutable once the checkout session is created.
 * Rejects post-creation VPA switching with HTTP 409 IMMUTABLE_RECEIVING_ACCOUNT.
 */
async function switchSessionVpa({ paymentId, user }) {
  const session = await YoupiPaymentSession.findOne({ paymentId }).select('user');
  if (!session) {
    throw createHttpError('YouPI payment session not found.', 404, 'SESSION_NOT_FOUND');
  }
  if (session.user.toString() !== user._id.toString() && !['admin', 'organizer'].includes(user.role)) {
    throw createHttpError('Not authorized to modify this payment session.', 403, 'FORBIDDEN');
  }
  throw createHttpError(
    'Receiving VPA snapshot is immutable once the session is created. Select your preferred UPI ID before starting checkout, or cancel this session and start a new one.',
    409,
    'IMMUTABLE_RECEIVING_ACCOUNT'
  );
}

/**
 * Transitions an ACTIVE `UPI` checkout session to strict 30-second `PROCESSING`
 * (`PAYMENT_PROCESSING_WINDOW_MS`) waiting for automated bank observation (`/payment-done` & `/verify-now`).
 */
async function markSessionProcessing({ paymentId, user }) {
  const session = await YoupiPaymentSession.findOne({ paymentId });
  if (!session) {
    throw createHttpError('YouPI payment session not found.', 404, 'SESSION_NOT_FOUND');
  }
  if (session.user.toString() !== user._id.toString() && !['admin', 'organizer'].includes(user.role)) {
    throw createHttpError('Not authorized to update this payment session.', 403, 'FORBIDDEN');
  }

  if (session.method === PaymentMethod.MANUAL_UPI) {
    throw createHttpError(
      'Manual UPI checkouts require a transaction reference; automatic observer verification is disabled.',
      409,
      'MANUAL_UPI_ONLY'
    );
  }

  const config = getYoupiConfig();
  const recId = session.receivingAccountId || normalizeReceivingAccountId(session.payeeVpa);
  if (recId) {
    await expireStaleSlots(recId);
  }
  const fresh = await YoupiPaymentSession.findById(session._id);

  const [eventDoc, settingsDoc, regDoc] = await Promise.all([
    Event.findById(fresh.event).select('title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds'),
    SystemSetting.findOne({ key: 'global' }).select('youpiBackupVpas').lean().catch(() => null),
    fresh.registration ? Registration.findById(fresh.registration) : null
  ]);
  const pool = getBackupVpaPool(eventDoc, settingsDoc, fresh.payeeVpa);

  if (fresh.status === PaymentStatus.PROCESSING) {
    return {
      changed: false,
      status: PaymentStatus.PROCESSING,
      processingExpiresAt: fresh.processingExpiresAt,
      session: serializeSessionDto(fresh, eventDoc, regDoc, pool)
    };
  }

  if (
    [PaymentStatus.OBSERVED_SUCCESS, PaymentStatus.RECONCILED, PaymentStatus.SUCCESS, PaymentStatus.MANUAL_REVIEW].includes(
      fresh.status
    )
  ) {
    return {
      changed: false,
      status: fresh.status,
      processingExpiresAt: fresh.processingExpiresAt,
      session: serializeSessionDto(fresh, eventDoc, regDoc, pool)
    };
  }

  if (TERMINAL_FAILURE_STATUSES.includes(fresh.status)) {
    throw createHttpError(
      `Cannot start verification: payment session is '${fresh.status}'. Please start a fresh session.`,
      400,
      'SESSION_TERMINAL'
    );
  }

  if (fresh.status !== PaymentStatus.ACTIVE) {
    throw createHttpError(
      `Cannot start verification: session is in status '${fresh.status}', must be 'ACTIVE'.`,
      409,
      fresh.status === PaymentStatus.QUEUED ? 'SESSION_QUEUED' : 'INVALID_STATE'
    );
  }

  const now = new Date();
  const processingExpiresAt = new Date(now.getTime() + config.processingDurationMs);

  fresh.status = PaymentStatus.PROCESSING;
  fresh.processingStartedAt = now;
  fresh.processingExpiresAt = processingExpiresAt;
  fresh.slotLockActive = true;
  await fresh.save();

  await emitSessionUpdate(fresh, eventDoc, regDoc, pool).catch(() => {});

  return {
    changed: true,
    status: PaymentStatus.PROCESSING,
    processingExpiresAt,
    session: serializeSessionDto(fresh, eventDoc, regDoc, pool)
  };
}

/**
 * Cancels a live/queued payment session. Blocked during PROCESSING (HTTP 409 SESSION_PROCESSING).
 */
async function cancelYoupiSession({ paymentId, user }) {
  const session = await YoupiPaymentSession.findOne({ paymentId });
  if (!session) {
    throw createHttpError('YouPI payment session not found.', 404, 'SESSION_NOT_FOUND');
  }
  if (session.user.toString() !== user._id.toString() && !['admin', 'organizer'].includes(user.role)) {
    throw createHttpError('Not authorized to cancel this session.', 403, 'FORBIDDEN');
  }

  if (session.status === PaymentStatus.PROCESSING) {
    throw createHttpError(
      'Cannot cancel a payment session while bank verification is in progress (PROCESSING).',
      409,
      'SESSION_PROCESSING'
    );
  }

  const [eventDoc, settingsDoc] = await Promise.all([
    Event.findById(session.event).select('title paymentInstructions paymentUpiId backupPaymentUpiIds'),
    SystemSetting.findOne({ key: 'global' }).select('youpiBackupVpas').lean().catch(() => null)
  ]);
  const pool = getBackupVpaPool(eventDoc, settingsDoc, session.payeeVpa);

  if (IMMUTABLE_STATES.includes(session.status)) {
    return serializeSessionDto(session, eventDoc, null, pool);
  }

  if (session.status === PaymentStatus.OBSERVED_SUCCESS || session.status === PaymentStatus.MANUAL_REVIEW) {
    throw createHttpError(
      `Cannot cancel a session in '${session.status}' status; awaiting bank reconciliation.`,
      409,
      'SESSION_UNDER_REVIEW'
    );
  }

  const wasSlotHolder = Boolean(session.slotLockActive);
  const recId = session.receivingAccountId || normalizeReceivingAccountId(session.payeeVpa);

  session.status = PaymentStatus.CANCELLED;
  session.settlementState = 'CANCELLED';
  session.slotLockActive = false;
  session.queuePosition = 0;
  session.uniqueUtrClaim = undefined;
  session.failureReason = 'Cancelled by student before completion.';
  await session.save();

  if (session.registration) {
    await Registration.findByIdAndUpdate(session.registration, {
      paymentStatus: 'failed',
      youpiStatus: PaymentStatus.CANCELLED,
      settlementState: 'CANCELLED'
    }).catch(() => {});
  }

  if (wasSlotHolder && recId) {
    await promoteNext(recId).catch(() => {});
  } else if (recId) {
    await reindexQueue(recId).catch(() => {});
  }

  await emitSessionUpdate(session, eventDoc, null, pool).catch(() => {});
  return serializeSessionDto(session, eventDoc, null, pool);
}

/**
 * Admin / Organizer reconciliation for YouPI sessions:
 * - approve: OBSERVED_SUCCESS | MANUAL_REVIEW -> RECONCILED; ACTIVE | PROCESSING | QUEUED -> SUCCESS
 * - reject: OBSERVED_SUCCESS -> MANUAL_REVIEW (flagged); ACTIVE | PROCESSING | MANUAL_REVIEW -> FAILED
 */
async function reconcileSessionByAdmin({ paymentId, action, adminUser, note = '' }) {
  const session = await YoupiPaymentSession.findOne({ paymentId }).populate('event', 'organizer title');
  if (!session) {
    throw createHttpError('YouPI payment session not found.', 404, 'SESSION_NOT_FOUND');
  }

  const isEventOwner = session.event?.organizer?.toString() === adminUser._id.toString();
  if (adminUser.role !== 'admin' && !isEventOwner) {
    throw createHttpError('Not authorized to reconcile payments for this event.', 403, 'FORBIDDEN');
  }

  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!['approve', 'reject'].includes(normalizedAction)) {
    throw createHttpError('Action must be either "approve" or "reject".', 400, 'INVALID_ACTION');
  }

  if (IMMUTABLE_STATES.includes(session.status)) {
    throw createHttpError(`Cannot modify an immutable terminal payment in status '${session.status}'.`, 409, 'IMMUTABLE_STATE');
  }

  const config = getYoupiConfig();
  const isApprove = normalizedAction === 'approve';
  let targetStatus;
  if (isApprove) {
    targetStatus =
      session.status === PaymentStatus.OBSERVED_SUCCESS || session.status === PaymentStatus.MANUAL_REVIEW
        ? PaymentStatus.RECONCILED
        : PaymentStatus.SUCCESS;
  } else {
    targetStatus = session.status === PaymentStatus.OBSERVED_SUCCESS ? PaymentStatus.MANUAL_REVIEW : PaymentStatus.FAILED;
  }

  session.manualReviewedBy = adminUser._id;
  session.manualReviewedAt = new Date();
  if (!isApprove) {
    session.flaggedForReview = true;
    session.manualReviewNote = sanitizePlainText(note, 240) || 'Rejected during admin bank verification.';
  }
  await session.save();

  const signed = signWebhookPayload(
    {
      event: `PAYMENT.${targetStatus}`,
      status: targetStatus,
      settlementState: settlementStateFor(targetStatus, session.method),
      paymentId: session.paymentId,
      orderId: session.orderId,
      amount: toRupeesString(session.amountPaise),
      amountPaise: String(session.amountPaise),
      currency: session.currency,
      method: session.method,
      bankRef: session.utr || session.orderId,
      utr: session.utr || session.orderId,
      verificationTag: isApprove ? `ADMIN_RECONCILED:${adminUser.email || adminUser._id}` : 'ADMIN_REJECTED',
      verificationLevel: isApprove ? 3 : 0,
      reason: !isApprove ? sanitizePlainText(note, 200) || 'Payment rejected during bank verification review.' : '',
      completedAt: isApprove ? new Date().toISOString() : null
    },
    config.webhookSecret
  );

  const result = await processIncomingWebhook({
    rawBody: signed.rawBody,
    signatureHeader: signed.signatureHeader,
    timestampHeader: signed.timestamp,
    deliveryIdHeader: signed.deliveryId
  });

  if (!isApprove) {
    await Notification.create({
      user: session.user,
      title: targetStatus === PaymentStatus.MANUAL_REVIEW ? 'Payment Flagged for Bank Review' : 'YouPI Payment Verification Failed',
      message:
        sanitizePlainText(note, 200) ||
        `Your payment verification for ${session.event?.title || 'event'} (${session.orderId}) could not be confirmed.`,
      type: 'event_cancellation',
      relatedEvent: session.event?._id || session.event
    }).catch(() => {});
  }

  const [eventDoc, settingsDoc] = await Promise.all([
    Event.findById(session.event?._id || session.event).select(
      'title paymentInstructions whatsappGroupLink paymentUpiId backupPaymentUpiIds'
    ),
    SystemSetting.findOne({ key: 'global' }).select('youpiBackupVpas').lean().catch(() => null)
  ]);
  const pool = getBackupVpaPool(eventDoc, settingsDoc, result.session.payeeVpa);
  return {
    session: serializeSessionDto(result.session, eventDoc, result.registration, pool),
    registration: result.registration
  };
}

async function listAdminYoupiSessions({ user, statusFilter = '' }) {
  const query = {};
  if (statusFilter && statusFilter !== 'ALL') {
    query.status = String(statusFilter).toUpperCase();
  }

  if (user.role !== 'admin') {
    const ownedEventIds = await Event.find({ organizer: user._id }).distinct('_id');
    query.event = { $in: ownedEventIds };
  }

  const sessions = await YoupiPaymentSession.find(query)
    .populate('event', 'title date registrationFee currency paymentUpiId backupPaymentUpiIds')
    .populate('user', 'name email department paymentSecurityStatus')
    .sort({ createdAt: -1 })
    .limit(100);

  return sessions.map(s => ({
    ...serializeSessionDto(s, s.event, null),
    student: s.user
      ? {
          _id: s.user._id,
          name: s.user.name,
          email: s.user.email,
          department: s.user.department || '',
          paymentSecurityStatus: s.user.paymentSecurityStatus || 'CLEAR'
        }
      : null
  }));
}

/**
 * 1-second background reaper daemon enforcing exact dual windows:
 * - ACTIVE with expiresAt <= now -> EXPIRED
 * - PROCESSING with processingExpiresAt <= now -> FAILED
 * Always releases exclusive slot locks and promotes next queued session.
 */
async function runReaperTick() {
  if (reaperInFlight || mongoose.connection.readyState !== 1) return;
  reaperInFlight = true;
  try {
    const now = new Date();
    const expiredDocs = await YoupiPaymentSession.find({
      gatewayMode: 'embedded',
      $or: [
        { status: { $in: [PaymentStatus.ACTIVE, PaymentStatus.INITIATED] }, expiresAt: { $lte: now } },
        { status: PaymentStatus.PROCESSING, processingExpiresAt: { $lte: now } },
        { status: PaymentStatus.PROCESSING, processingExpiresAt: null, expiresAt: { $lte: now } }
      ]
    })
      .select('receivingAccountId payeeVpa')
      .lean();

    if (expiredDocs.length > 0) {
      const affectedAccounts = Array.from(
        new Set(expiredDocs.map(d => d.receivingAccountId || normalizeReceivingAccountId(d.payeeVpa)).filter(Boolean))
      );
      for (const accId of affectedAccounts) {
        await expireStaleSlots(accId);
        await promoteNext(accId).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('YouPI reaper tick warning:', err.message);
  } finally {
    reaperInFlight = false;
  }
}

function startYoupiReaperDaemon() {
  if (reaperTimer) return;
  reaperTimer = setInterval(() => {
    runReaperTick().catch(() => {});
  }, 1000);
  if (reaperTimer.unref) reaperTimer.unref();
}

function stopYoupiReaperDaemon() {
  if (reaperTimer) {
    clearInterval(reaperTimer);
    reaperTimer = null;
  }
}

module.exports = {
  PaymentEventBus,
  PaymentStatus,
  PaymentMethod,
  VALID_TRANSITIONS,
  SLOT_RELEASE_STATES,
  TERMINAL_STATES,
  IMMUTABLE_STATES,
  SLOT_OCCUPYING_STATES,
  FULFILLED_STATUSES,
  UPI_PROVIDERS,
  BANKING_AND_MESSAGING_PACKAGES,
  ALLOWED_NOTIFICATION_PACKAGES,
  getUpiProviders,
  isAllowedNotificationPackage,
  isValidTransition,
  isTerminalStatus,
  holdsSlot,
  toPaise,
  toRupeesString,
  isValidVpa,
  normalizeReceivingAccountId,
  parseVpaList,
  getBackupVpaPool,
  buildUpiUri,
  buildUpiIntentUri,
  buildStandUpiUri,
  buildStandQrData,
  buildUpiAppIntents,
  getYoupiConfig,
  isSettledStatus,
  settlementStateFor,
  normalizeUtr,
  isValidUtr,
  signWebhookPayload,
  verifyYoupiWebhook,
  sanitizeLegacySlotLocks,
  expireStaleSessionsForVpa,
  expireStaleSlots,
  acquireSlotAtomic,
  promoteNext,
  reindexQueue,
  calculateEstimatedWaitSeconds,
  markSessionObservedNotReconciled,
  holdSessionManualReview,
  processIncomingWebhook,
  finalizePaidRegistrationFromSession,
  createYoupiPaymentSession,
  syncAndGetYoupiSession,
  submitUtrAndProcessSession,
  switchSessionVpa,
  markSessionProcessing,
  cancelYoupiSession,
  reconcileSessionByAdmin,
  listAdminYoupiSessions,
  serializeSessionDto,
  emitSessionUpdate,
  startYoupiReaperDaemon,
  stopYoupiReaperDaemon,
  runReaperTick
};
