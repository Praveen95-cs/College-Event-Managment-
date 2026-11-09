const mongoose = require('mongoose');

const YOUPI_STATUSES = [
  'INITIATED',
  'ACTIVE',
  'QUEUED',
  'PROCESSING',
  'OBSERVED_SUCCESS',
  'RECONCILED',
  'MANUAL_REVIEW',
  'SUCCESS',
  'FAILED',
  'EXPIRED',
  'CANCELLED'
];

const SETTLEMENT_STATES = [
  'PENDING',
  'NOT_RECONCILED',
  'PENDING_VERIFICATION',
  'RECONCILED',
  'MANUAL_REVIEW',
  'FAILED',
  'EXPIRED',
  'CANCELLED'
];

const OBSERVATION_SOURCES = [
  '',
  'GMAIL',
  'IMAP_EMAIL',
  'GOOGLE_MESSAGES',
  'ANDROID_OBSERVER',
  'SMS_GATEWAY',
  'SMS_OBSERVER',
  'STATEMENT_CSV',
  'ADMIN'
];

const youpiPaymentSessionSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true, index: true, trim: true },
    orderId: { type: String, required: true, unique: true, index: true, trim: true },
    attemptId: { type: Number, default: 1, min: 1 },
    idempotencyKey: { type: String, default: '', index: true, trim: true },
    gatewayMode: { type: String, enum: ['embedded', 'external'], default: 'embedded' },
    merchantId: { type: String, default: '', trim: true },
    receivingAccountId: { type: String, default: '', lowercase: true, trim: true, index: true },
    slotLockActive: { type: Boolean, default: false, index: true },
    receivingAccountSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    registration: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', default: null },
    amount: { type: Number, required: true, min: 0 },
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', trim: true, uppercase: true },
    method: { type: String, enum: ['UPI', 'MANUAL_UPI'], default: 'UPI' },
    status: { type: String, enum: YOUPI_STATUSES, default: 'ACTIVE', index: true },
    settlementState: { type: String, enum: SETTLEMENT_STATES, default: 'PENDING' },
    queuePosition: { type: Number, default: 0, min: 0 },
    payeeVpa: { type: String, default: '', trim: true },
    vpaHistory: [{ type: String, trim: true }],
    payeeName: { type: String, default: 'Avenor Campus Events', trim: true },
    upiUri: { type: String, default: '' },
    qrSvg: { type: String, default: '' },
    checkoutUrl: { type: String, default: '' },
    externalPaymentId: { type: String, default: '', trim: true },
    customerName: { type: String, default: '', trim: true },
    customerRegNo: { type: String, default: '', trim: true },
    customerEmail: { type: String, default: '', trim: true },
    needsAccommodation: { type: Boolean, default: false },
    utr: { type: String, default: '', trim: true, index: true },
    // Do NOT set default: '' — omitted unless claiming a UTR so partial unique index ignores empty docs.
    uniqueUtrClaim: { type: String, trim: true },
    utrSubmittedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    verificationTag: { type: String, default: 'UNVERIFIED', trim: true },
    verificationLevel: { type: Number, default: 0 },
    verificationSources: [{ type: String, trim: true }],
    attributedObservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'YoupiBankObservation', default: null },
    observationSource: {
      type: String,
      enum: OBSERVATION_SOURCES,
      default: ''
    },
    observedAt: { type: Date, default: null },
    observedAmountPaise: { type: Number, default: 0 },
    observedSenderVpa: { type: String, default: '', trim: true },
    observedRawSnippet: { type: String, default: '' },
    slotAcquiredAt: { type: Date, default: null },
    processingStartedAt: { type: Date, default: null },
    processingExpiresAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lateDetectedAt: { type: Date, default: null },
    flaggedForReview: { type: Boolean, default: false },
    manualReviewNote: { type: String, default: '', trim: true },
    manualReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    manualReviewedAt: { type: Date, default: null },
    lastPollTriggeredAt: { type: Date, default: null },
    lastWebhookEvent: { type: String, default: '' },
    lastDeliveryId: { type: String, default: '' },
    failureReason: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

youpiPaymentSessionSchema.index({ user: 1, event: 1, status: 1 });
youpiPaymentSessionSchema.index({ payeeVpa: 1, status: 1, createdAt: 1 });
youpiPaymentSessionSchema.index({ receivingAccountId: 1, status: 1, queuePosition: 1, createdAt: 1 });
youpiPaymentSessionSchema.index(
  { receivingAccountId: 1 },
  {
    unique: true,
    partialFilterExpression: { slotLockActive: true },
    name: 'idx_one_slot_per_receiving_account'
  }
);
youpiPaymentSessionSchema.index(
  { receivingAccountId: 1, uniqueUtrClaim: 1 },
  {
    unique: true,
    partialFilterExpression: { uniqueUtrClaim: { $type: 'string' } },
    name: 'idx_unique_utr_per_receiving_account'
  }
);

module.exports = mongoose.model('YoupiPaymentSession', youpiPaymentSessionSchema);
module.exports.YOUPI_STATUSES = YOUPI_STATUSES;
module.exports.SETTLEMENT_STATES = SETTLEMENT_STATES;
module.exports.OBSERVATION_SOURCES = OBSERVATION_SOURCES;
