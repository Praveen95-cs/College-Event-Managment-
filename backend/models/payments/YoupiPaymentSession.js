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
  'RECONCILED',
  'MANUAL_REVIEW',
  'FAILED',
  'EXPIRED',
  'CANCELLED'
];

const youpiPaymentSessionSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true, index: true, trim: true },
    orderId: { type: String, required: true, unique: true, index: true, trim: true },
    idempotencyKey: { type: String, default: '', index: true, trim: true },
    gatewayMode: { type: String, enum: ['embedded', 'external'], default: 'embedded' },
    merchantId: { type: String, default: '', trim: true },
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
    submittedAt: { type: Date, default: null },
    verificationTag: { type: String, default: 'UNVERIFIED', trim: true },
    verificationLevel: { type: Number, default: 0 },
    observationSource: {
      type: String,
      enum: ['', 'IMAP_EMAIL', 'SMS_OBSERVER', 'STATEMENT_CSV', 'ADMIN'],
      default: ''
    },
    observedAt: { type: Date, default: null },
    observedAmountPaise: { type: Number, default: 0 },
    observedSenderVpa: { type: String, default: '', trim: true },
    observedRawSnippet: { type: String, default: '' },
    processingStartedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastWebhookEvent: { type: String, default: '' },
    lastDeliveryId: { type: String, default: '' },
    failureReason: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

youpiPaymentSessionSchema.index({ user: 1, event: 1, status: 1 });
youpiPaymentSessionSchema.index({ payeeVpa: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('YoupiPaymentSession', youpiPaymentSessionSchema);
module.exports.YOUPI_STATUSES = YOUPI_STATUSES;
module.exports.SETTLEMENT_STATES = SETTLEMENT_STATES;

