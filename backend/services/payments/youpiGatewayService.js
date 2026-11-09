const crypto = require('crypto');
const mongoose = require('mongoose');
const Event = require('../../models/events/Event');
const User = require('../../models/auth/User');
const Registration = require('../../models/events/Registration');
const Notification = require('../../models/community/Notification');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const YoupiWebhookReceipt = require('../../models/payments/YoupiWebhookReceipt');
const { sanitizePlainText, sanitizeEmailAddress } = require('../../utils/sanitize');
const { computeEventLifecycle } = require('../feed/feedService');
const { generateQrSvg } = require('../../utils/qrGenerator');
const {
  sendEventRegistrationEmail,
  sendPaymentUnderReviewEmail
} = require('../email/emailService');

const FULFILLED_STATUSES = ['RECONCILED', 'SUCCESS'];
const TERMINAL_FAILURE_STATUSES = ['FAILED', 'EXPIRED', 'CANCELLED'];

const UPI_PROVIDERS = [
  { id: 'google-pay', name: 'Google Pay', shortName: 'GPay', packageName: 'com.google.android.apps.nbu.paisa.user', brandColor: '#1a73e8' },
  { id: 'phonepe', name: 'PhonePe', shortName: 'PhonePe', packageName: 'com.phonepe.app', brandColor: '#5f259f' },
  { id: 'paytm', name: 'Paytm', shortName: 'Paytm', packageName: 'net.one97.paytm', brandColor: '#00b9f5' },
  { id: 'bhim', name: 'BHIM', shortName: 'BHIM', packageName: 'in.org.npci.upiapp', brandColor: '#00796b' },
  { id: 'amazon-pay', name: 'Amazon Pay', shortName: 'Amazon Pay', packageName: 'in.amazon.mShop.android.shopping', brandColor: '#ff9900' },
  { id: 'cred', name: 'CRED', shortName: 'CRED', packageName: 'com.dreamplug.androidapp', brandColor: '#3f3c37' }
];

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

function buildUpiUri({ payeeVpa, payeeName, amountPaise, transactionRef, currency = 'INR' }) {
  if (!isValidVpa(payeeVpa)) {
    throw createHttpError(`Invalid payee UPI VPA: ${payeeVpa}`, 400, 'INVALID_VPA');
  }
  const params = new URLSearchParams();
  params.set('pa', payeeVpa.trim());
  params.set('pn', String(payeeName || 'Avenor Campus Events').trim().slice(0, 50));
  params.set('am', toRupeesString(amountPaise));
  params.set('cu', String(currency || 'INR').trim().toUpperCase());
  const txnNote = String(transactionRef || '').trim().slice(0, 50);
  if (txnNote) {
    params.set('tn', txnNote);
  }
  return `upi://pay?${params.toString()}`;
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
  const defaultPayeeName = (process.env.YOUPI_PAYEE_NAME || 'Avenor Campus Events').trim();
  const rawMode = String(process.env.YOUPI_VERIFICATION_MODE || 'manual').trim().toLowerCase();
  const verificationMode = rawMode === 'instant' && !isProduction ? 'instant' : 'manual';
  const fulfillOnObserved = String(process.env.YOUPI_FULFILL_ON_OBSERVED || 'false').trim().toLowerCase() === 'true';
  const allowDemoUtr = !isProduction && String(process.env.YOUPI_ALLOW_DEMO_UTR || 'false').trim().toLowerCase() === 'true';
  const defaultMethod = String(process.env.YOUPI_DEFAULT_METHOD || 'UPI').trim().toUpperCase() === 'MANUAL_UPI'
    ? 'MANUAL_UPI'
    : 'UPI';
  const ttlSecondsRaw = Number(process.env.YOUPI_SESSION_TTL_SECONDS || 300);
  const sessionTtlMs = (Number.isFinite(ttlSecondsRaw) && ttlSecondsRaw >= 30 ? ttlSecondsRaw : 300) * 1000;

  return {
    isProduction,
    apiUrl,
    gatewayMode,
    merchantId,
    merchantKey,
    webhookSecret,
    defaultPayeeVpa,
    defaultPayeeName,
    verificationMode,
    fulfillOnObserved,
    allowDemoUtr,
    defaultMethod,
    sessionTtlMs
  };
}

function isSettledStatus(status, config = getYoupiConfig()) {
  if (FULFILLED_STATUSES.includes(status)) return true;
  if (status === 'OBSERVED_SUCCESS' && config.fulfillOnObserved) return true;
  return false;
}

function settlementStateFor(status) {
  switch (status) {
    case 'RECONCILED':
    case 'SUCCESS':
      return 'RECONCILED';
    case 'OBSERVED_SUCCESS':
      return 'NOT_RECONCILED';
    case 'MANUAL_REVIEW':
      return 'MANUAL_REVIEW';
    case 'FAILED':
      return 'FAILED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'CANCELLED':
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

/**
 * Signs an outgoing/embedded YouPI-PG webhook payload using `${timestamp}.${rawBody}`.
 * @param {object} payloadObj
 * @param {string} secret
 * @returns {{ rawBody: string, timestamp: string, deliveryId: string, signatureHeader: string }}
 */
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

/**
 * Cryptographically verifies an incoming YouPI-PG webhook on raw unparsed bytes.
 * Supports both `HMAC(secret, "${timestamp}.${rawBody}")` and `HMAC(secret, rawBody)`.
 */
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

async function expireStaleSessionsForVpa(payeeVpa) {
  if (!payeeVpa) return;
  const now = new Date();
  await YoupiPaymentSession.updateMany(
    {
      payeeVpa,
      status: { $in: ['ACTIVE', 'INITIATED', 'PROCESSING'] },
      expiresAt: { $lte: now }
    },
    {
      $set: {
        status: 'EXPIRED',
        settlementState: 'EXPIRED',
        failureReason: 'Payment checkout session timed out after 5 minutes.'
      }
    }
  );
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
    if (eventName.includes('RECONCILED')) nextStatus = 'RECONCILED';
    else if (eventName.includes('OBSERVED_SUCCESS')) nextStatus = 'OBSERVED_SUCCESS';
    else if (eventName.includes('MANUAL_REVIEW')) nextStatus = 'MANUAL_REVIEW';
    else if (eventName.includes('SUCCESS')) nextStatus = 'SUCCESS';
    else if (eventName.includes('FAILED')) nextStatus = 'FAILED';
    else if (eventName.includes('EXPIRED')) nextStatus = 'EXPIRED';
    else if (eventName.includes('CANCELLED')) nextStatus = 'CANCELLED';
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

  // Per YouPI-PG merchant spec: COD 'SUCCESS' never unlocks a UPI event pass
  if (nextStatus === 'SUCCESS' && String(payload.method || '').trim().toUpperCase() === 'COD') {
    throw createHttpError('Cash-on-delivery SUCCESS event cannot fulfill a UPI event pass.', 400, 'METHOD_MISMATCH');
  }

  const incomingUtr = normalizeUtr(payload.utr || payload.bankRef || payload.reference || session.utr);
  if (incomingUtr) {
    session.utr = incomingUtr;
    if (!session.submittedAt) session.submittedAt = new Date();
  }

  if (nextStatus) {
    session.status = nextStatus;
    session.settlementState = settlementStateFor(nextStatus);
  }
  if (payload.verificationTag) {
    session.verificationTag = sanitizePlainText(payload.verificationTag, 80);
  }
  if (Number.isFinite(Number(payload.verificationLevel))) {
    session.verificationLevel = Number(payload.verificationLevel);
  }
  if (payload.reason || payload.failureReason) {
    session.failureReason = sanitizePlainText(payload.reason || payload.failureReason, 240);
  }
  if (isSettledStatus(session.status, config) && !session.completedAt) {
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
  if (isSettledStatus(session.status, config)) {
    const fulfilled = await finalizePaidRegistrationFromSession(session, { utr: incomingUtr });
    registration = fulfilled.registration;
  } else if (session.status === 'MANUAL_REVIEW') {
    const eventDoc = await Event.findById(session.event).select('title currency');
    registration = await Registration.findOneAndUpdate(
      { event: session.event, user: session.user },
      {
        event: session.event,
        user: session.user,
        name: session.customerName || 'Student Attendee',
        regNo: session.customerRegNo || session.user.toString().slice(-8).toUpperCase(),
        email: session.customerEmail || '',
        needsAccommodation: Boolean(session.needsAccommodation),
        status: 'pending',
        paymentStatus: 'pending',
        amountPaid: 0,
        currency: session.currency || eventDoc?.currency || 'INR',
        paymentMethod: 'youpi',
        transactionId: incomingUtr || session.orderId,
        youpiPaymentId: session.paymentId,
        youpiOrderId: session.orderId,
        youpiStatus: 'MANUAL_REVIEW',
        settlementState: 'MANUAL_REVIEW'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    session.registration = registration._id;
    await session.save();
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

  return {
    duplicate: false,
    deliveryId,
    event: eventName,
    session,
    registration
  };
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

function serializeSessionDto(sessionDoc, eventDoc = null, registrationDoc = null) {
  const config = getYoupiConfig();
  const obj = sessionDoc.toObject ? sessionDoc.toObject() : sessionDoc;
  const now = Date.now();
  const timeRemainingSeconds =
    obj.status === 'ACTIVE' && obj.expiresAt
      ? Math.max(0, Math.ceil((new Date(obj.expiresAt).getTime() - now) / 1000))
      : 0;

  return {
    paymentId: obj.paymentId,
    externalPaymentId: obj.externalPaymentId || '',
    orderId: obj.orderId,
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
    settlementState: obj.settlementState,
    settled: isSettledStatus(obj.status, config),
    queuePosition: obj.queuePosition || 0,
    payeeVpa: obj.payeeVpa || '',
    payeeName: obj.payeeName || config.defaultPayeeName,
    upiUri: obj.upiUri || '',
    upiAppIntents: buildUpiAppIntents(obj.upiUri),
    qrSvg: obj.qrSvg || '',
    checkoutUrl: obj.checkoutUrl || '',
    utr: obj.utr || '',
    verificationTag: obj.verificationTag || 'UNVERIFIED',
    verificationLevel: obj.verificationLevel || 0,
    failureReason: obj.failureReason || '',
    expiresAt: obj.expiresAt || null,
    completedAt: obj.completedAt || null,
    timeRemainingSeconds,
    customerName: obj.customerName || '',
    customerRegNo: obj.customerRegNo || '',
    customerEmail: obj.customerEmail || '',
    needsAccommodation: Boolean(obj.needsAccommodation),
    hasWhatsappGroup: Boolean(eventDoc?.whatsappGroupLink),
    whatsappGroupLink:
      isSettledStatus(obj.status, config) && eventDoc?.whatsappGroupLink
        ? eventDoc.whatsappGroupLink
        : '',
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
  const payeeVpa = rawEventVpa || config.defaultPayeeVpa;
  if (config.gatewayMode === 'embedded' && !payeeVpa) {
    throw createHttpError(
      'Merchant UPI VPA is not configured. Add a valid Payee UPI VPA on this event or set YOUPI_PAYEE_VPA on the server.',
      503,
      'YOUPI_VPA_NOT_CONFIGURED'
    );
  }
  const payeeName =
    rawEventVpa && rawEventVpa !== config.defaultPayeeVpa && eventDoc.club?.name
      ? `${eventDoc.club.name} · Avenor`
      : config.defaultPayeeName;
  const amountPaise = toPaise(eventDoc.registrationFee);
  const amount = Number(eventDoc.registrationFee);
  const currency = (eventDoc.currency || 'INR').toUpperCase();

  await expireStaleSessionsForVpa(payeeVpa);

  const customerName = sanitizePlainText(body.name, 120) || user.name || 'Student Attendee';
  const customerRegNo =
    sanitizePlainText(body.regNo, 60) ||
    existingReg?.regNo ||
    user._id.toString().slice(-8).toUpperCase();
  const accountEmail = sanitizeEmailAddress(user.email) || '';
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

  // Reuse an active/pending-review session if amount, VPA, and gatewayMode match
  if (!body.forceNew) {
    const activeExisting = await YoupiPaymentSession.findOne({
      user: user._id,
      event: eventDoc._id,
      status: { $in: ['ACTIVE', 'INITIATED', 'QUEUED', 'MANUAL_REVIEW'] }
    }).sort({ createdAt: -1 });

    if (activeExisting) {
      const stillValid =
        activeExisting.amountPaise === amountPaise &&
        activeExisting.payeeVpa === payeeVpa &&
        activeExisting.gatewayMode === config.gatewayMode &&
        (!activeExisting.expiresAt || activeExisting.expiresAt.getTime() > Date.now() || activeExisting.status === 'MANUAL_REVIEW');

      if (stillValid) {
        activeExisting.customerName = customerName;
        activeExisting.customerRegNo = customerRegNo;
        if (customerEmail) activeExisting.customerEmail = customerEmail;
        activeExisting.needsAccommodation = needsAccommodation;
        if (!activeExisting.qrSvg && activeExisting.upiUri) {
          activeExisting.qrSvg = await generateQrSvg(activeExisting.upiUri, { boxSize: 220 });
        }
        await activeExisting.save();
        return {
          isPaidEvent: true,
          reused: true,
          session: serializeSessionDto(activeExisting, eventDoc, existingReg)
        };
      }

      if (['ACTIVE', 'INITIATED', 'QUEUED'].includes(activeExisting.status)) {
        activeExisting.status = 'CANCELLED';
        activeExisting.settlementState = 'CANCELLED';
        activeExisting.failureReason = 'Superseded by new checkout attempt.';
        await activeExisting.save();
      }
    }
  }

  const paymentId = crypto.randomUUID();
  const orderId = `AVN-${eventDoc._id.toString().slice(-5).toUpperCase()}-${user._id
    .toString()
    .slice(-4)
    .toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const method = body.method
    ? String(body.method).toUpperCase() === 'MANUAL_UPI'
      ? 'MANUAL_UPI'
      : 'UPI'
    : config.defaultMethod;
  const baseUrl = buildPublicOrigin(req);

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
      idempotencyKey: orderId,
      gatewayMode: 'external',
      merchantId: config.merchantId,
      event: eventDoc._id,
      user: user._id,
      amount,
      amountPaise,
      currency,
      method,
      status: String(gwData.status || 'INITIATED').toUpperCase(),
      settlementState: 'PENDING',
      queuePosition: Number(gwData.queuePosition || 0),
      payeeVpa,
      payeeName,
      checkoutUrl: gwData.checkoutUrl || `${config.apiUrl}/checkout/${gwData.paymentId || paymentId}`,
      customerName,
      customerRegNo,
      customerEmail: customerEmail || user.email || '',
      needsAccommodation,
      expiresAt: new Date(Date.now() + config.sessionTtlMs),
      metadata: {
        eventTitle: eventDoc.title,
        paymentInstructions: eventDoc.paymentInstructions || ''
      }
    });

    return {
      isPaidEvent: true,
      reused: false,
      session: serializeSessionDto(session, eventDoc, null)
    };
  }

  // Embedded YouPI-PG V2 Engine
  const activePeers = await YoupiPaymentSession.countDocuments({
    payeeVpa,
    status: { $in: ['ACTIVE', 'PROCESSING'] },
    expiresAt: { $gt: new Date() }
  });

  const upiUri = buildUpiUri({
    payeeVpa,
    payeeName,
    amountPaise,
    transactionRef: orderId,
    currency
  });
  const qrSvg = await generateQrSvg(upiUri, { boxSize: 220, errorCorrection: 'M' });
  const expiresAt = new Date(Date.now() + config.sessionTtlMs);
  const checkoutUrl = `${baseUrl}/api/payments/youpi/portal/${paymentId}`;

  const session = await YoupiPaymentSession.create({
    paymentId,
    orderId,
    idempotencyKey: orderId,
    gatewayMode: 'embedded',
    merchantId: config.merchantId,
    event: eventDoc._id,
    user: user._id,
    amount,
    amountPaise,
    currency,
    method,
    status: 'ACTIVE',
    settlementState: 'PENDING',
    queuePosition: activePeers,
    payeeVpa,
    payeeName,
    upiUri,
    qrSvg,
    checkoutUrl,
    customerName,
    customerRegNo,
    customerEmail: customerEmail || user.email || '',
    needsAccommodation,
    expiresAt,
    metadata: {
      eventTitle: eventDoc.title,
      paymentInstructions: eventDoc.paymentInstructions || ''
    }
  });

  return {
    isPaidEvent: true,
    reused: false,
    session: serializeSessionDto(session, eventDoc, null)
  };
}

/**
 * Fetches and synchronizes session status (handles timeout + external gateway polling).
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
  if (
    session.gatewayMode === 'embedded' &&
    ['ACTIVE', 'INITIATED', 'PROCESSING'].includes(session.status) &&
    session.expiresAt &&
    Date.now() > session.expiresAt.getTime()
  ) {
    session.status = 'EXPIRED';
    session.settlementState = 'EXPIRED';
    session.failureReason = 'Payment session expired before UTR verification.';
    await session.save();
  }

  if (session.gatewayMode === 'external' && config.apiUrl && !isSettledStatus(session.status, config)) {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/v1/payments/${session.externalPaymentId || session.paymentId}`,
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
        const gwStatus = String(gw.status || session.status).toUpperCase();
        session.status = gwStatus;
        session.settlementState = gw.settlementState || settlementStateFor(gwStatus);
        if (gw.verificationTag) session.verificationTag = gw.verificationTag;
        if (gw.verificationLevel !== undefined) session.verificationLevel = Number(gw.verificationLevel);
        if (gw.completedAt) session.completedAt = new Date(gw.completedAt);
        await session.save();

        if (isSettledStatus(session.status, config)) {
          await finalizePaidRegistrationFromSession(session, { utr: gw.bankRef || gw.utr || session.utr });
        }
      }
    } catch (err) {
      console.warn('External YouPI poll skipped:', err.message);
    }
  }

  const [eventDoc, regDoc] = await Promise.all([
    Event.findById(session.event).select('title paymentInstructions whatsappGroupLink'),
    session.registration
      ? Registration.findById(session.registration)
      : Registration.findOne({ event: session.event, user: session.user })
  ]);

  return serializeSessionDto(session, eventDoc, regDoc);
}

/**
 * Validates submitted UPI/UTR reference, enforces global duplicate-UTR blocking,
 * and dispatches a signed YouPI-PG HMAC-SHA256 webhook through the verification pipeline.
 */
async function submitUtrAndProcessSession({ paymentId, user, body = {} }) {
  const session = await YoupiPaymentSession.findOne({ paymentId });
  if (!session) {
    throw createHttpError('YouPI payment session not found.', 404, 'SESSION_NOT_FOUND');
  }

  if (session.user.toString() !== user._id.toString() && !['admin', 'organizer'].includes(user.role)) {
    throw createHttpError('Not authorized to verify this payment session.', 403, 'FORBIDDEN');
  }

  const config = getYoupiConfig();
  if (isSettledStatus(session.status, config)) {
    const reg =
      (session.registration && (await Registration.findById(session.registration))) ||
      (await Registration.findOne({ event: session.event, user: session.user }));
    const ev = await Event.findById(session.event).select('title paymentInstructions whatsappGroupLink');
    return {
      session: serializeSessionDto(session, ev, reg),
      registration: reg,
      alreadySettled: true
    };
  }

  if (
    ['ACTIVE', 'INITIATED', 'PROCESSING'].includes(session.status) &&
    session.expiresAt &&
    Date.now() > session.expiresAt.getTime()
  ) {
    session.status = 'EXPIRED';
    session.settlementState = 'EXPIRED';
    session.failureReason = 'Checkout session expired. Please initiate a fresh session.';
    await session.save();
  }

  if (TERMINAL_FAILURE_STATUSES.includes(session.status)) {
    throw createHttpError(
      `This payment session is ${session.status.toLowerCase()}. Please start a new YouPI checkout session.`,
      400,
      'SESSION_TERMINAL'
    );
  }

  const utr = normalizeUtr(body.utr || body.transactionId);
  if (!isValidUtr(utr)) {
    throw createHttpError(
      'Please enter a valid UPI / UTR reference (6–35 alphanumeric characters).',
      400,
      'INVALID_UTR'
    );
  }

  // Enforce unique UTR across other sessions and registrations (anti-replay / anti-spoof)
  const utrRegex = new RegExp(`^${utr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const [duplicateSession, duplicateReg] = await Promise.all([
    YoupiPaymentSession.findOne({
      paymentId: { $ne: session.paymentId },
      utr: utrRegex,
      status: { $in: ['RECONCILED', 'OBSERVED_SUCCESS', 'SUCCESS', 'MANUAL_REVIEW'] }
    }).select('paymentId orderId'),
    Registration.findOne({
      transactionId: utrRegex,
      paymentStatus: 'paid',
      youpiPaymentId: { $ne: session.paymentId },
      $or: [{ event: { $ne: session.event } }, { user: { $ne: session.user } }]
    }).select('_id')
  ]);

  if (duplicateSession || duplicateReg) {
    throw createHttpError(
      'This UPI / UTR transaction reference has already been used for another registration.',
      409,
      'DUPLICATE_UTR'
    );
  }

  if (body.name) session.customerName = sanitizePlainText(body.name, 120) || session.customerName;
  if (body.regNo) session.customerRegNo = sanitizePlainText(body.regNo, 60) || session.customerRegNo;
  const userAccountEmail = sanitizeEmailAddress(user?.email) || '';
  if (user?.role === 'student' && userAccountEmail) {
    session.customerEmail = userAccountEmail;
  } else if (body.email) {
    const cleanEmail = sanitizeEmailAddress(body.email);
    if (!cleanEmail) {
      throw createHttpError('Please enter a valid confirmation email address.', 400, 'INVALID_EMAIL');
    }
    session.customerEmail = cleanEmail;
  } else if (!session.customerEmail && userAccountEmail) {
    session.customerEmail = userAccountEmail;
  }
  if (body.needsAccommodation !== undefined) {
    session.needsAccommodation = Boolean(body.needsAccommodation);
  }
  session.utr = utr;
  session.submittedAt = new Date();
  await session.save();

  const isManual = config.verificationMode === 'manual';
  const eventType = isManual ? 'PAYMENT.MANUAL_REVIEW' : 'PAYMENT.RECONCILED';
  const targetStatus = isManual ? 'MANUAL_REVIEW' : 'RECONCILED';

  const signed = signWebhookPayload(
    {
      event: eventType,
      status: targetStatus,
      settlementState: settlementStateFor(targetStatus),
      paymentId: session.paymentId,
      orderId: session.orderId,
      amount: toRupeesString(session.amountPaise),
      amountPaise: String(session.amountPaise),
      currency: session.currency,
      method: session.method,
      bankRef: utr,
      utr,
      verificationTag: isManual ? 'UTR_SUBMITTED_MANUAL_REVIEW' : 'YOUPI_HMAC_RECONCILED',
      verificationLevel: isManual ? 1 : 2,
      completedAt: isManual ? null : new Date().toISOString()
    },
    config.webhookSecret
  );

  const result = await processIncomingWebhook({
    rawBody: signed.rawBody,
    signatureHeader: signed.signatureHeader,
    timestampHeader: signed.timestamp,
    deliveryIdHeader: signed.deliveryId
  });

  const eventDoc = await Event.findById(session.event).select(
    'title paymentInstructions whatsappGroupLink date time location currency registrationFee'
  );
  if (isManual && session.customerEmail) {
    await sendPaymentUnderReviewEmail({
      to: session.customerEmail,
      attendeeName: session.customerName,
      event: eventDoc,
      session
    }).catch(err => console.warn('Manual review email warning:', err.message));
  }
  return {
    session: serializeSessionDto(result.session, eventDoc, result.registration),
    registration: result.registration,
    alreadySettled: false
  };
}

/**
 * Cancels an active/queued payment session and returns its updated DTO.
 */
async function cancelYoupiSession({ paymentId, user }) {
  const session = await YoupiPaymentSession.findOne({ paymentId });
  if (!session) {
    throw createHttpError('YouPI payment session not found.', 404, 'SESSION_NOT_FOUND');
  }
  if (session.user.toString() !== user._id.toString() && !['admin', 'organizer'].includes(user.role)) {
    throw createHttpError('Not authorized to cancel this session.', 403, 'FORBIDDEN');
  }
  if (isSettledStatus(session.status)) {
    throw createHttpError('Cannot cancel a settled payment session.', 400, 'ALREADY_SETTLED');
  }

  session.status = 'CANCELLED';
  session.settlementState = 'CANCELLED';
  session.failureReason = 'Cancelled by student before completion.';
  await session.save();

  const eventDoc = await Event.findById(session.event).select('title paymentInstructions');
  return serializeSessionDto(session, eventDoc, null);
}

/**
 * Admin / Organizer reconciliation for YouPI sessions (approve -> RECONCILED, reject -> FAILED).
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

  const config = getYoupiConfig();
  const isApprove = normalizedAction === 'approve';
  const targetStatus = isApprove ? 'RECONCILED' : 'FAILED';
  const eventType = isApprove ? 'PAYMENT.RECONCILED' : 'PAYMENT.FAILED';

  const signed = signWebhookPayload(
    {
      event: eventType,
      status: targetStatus,
      settlementState: settlementStateFor(targetStatus),
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
      title: 'YouPI Payment Verification Failed',
      message:
        sanitizePlainText(note, 200) ||
        `Your payment verification for ${session.event?.title || 'event'} (${session.orderId}) could not be confirmed. Please retry with a valid UTR.`,
      type: 'event_cancellation',
      relatedEvent: session.event?._id || session.event
    }).catch(() => {});
  }

  const eventDoc = await Event.findById(session.event?._id || session.event).select(
    'title paymentInstructions whatsappGroupLink'
  );
  return {
    session: serializeSessionDto(result.session, eventDoc, result.registration),
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
    .populate('event', 'title date registrationFee currency')
    .populate('user', 'name email department')
    .sort({ createdAt: -1 })
    .limit(100);

  return sessions.map(s => ({
    ...serializeSessionDto(s, s.event, null),
    student: s.user
      ? {
          _id: s.user._id,
          name: s.user.name,
          email: s.user.email,
          department: s.user.department || ''
        }
      : null
  }));
}

module.exports = {
  UPI_PROVIDERS,
  toPaise,
  toRupeesString,
  isValidVpa,
  buildUpiUri,
  buildUpiAppIntents,
  getYoupiConfig,
  isSettledStatus,
  settlementStateFor,
  normalizeUtr,
  isValidUtr,
  signWebhookPayload,
  verifyYoupiWebhook,
  processIncomingWebhook,
  finalizePaidRegistrationFromSession,
  createYoupiPaymentSession,
  syncAndGetYoupiSession,
  submitUtrAndProcessSession,
  cancelYoupiSession,
  reconcileSessionByAdmin,
  listAdminYoupiSessions,
  serializeSessionDto
};

