const mongoose = require('mongoose');

const OBSERVATION_SOURCE_ENUM = [
  'GMAIL',
  'IMAP_EMAIL',
  'GOOGLE_MESSAGES',
  'ANDROID_OBSERVER',
  'SMS_GATEWAY',
  'SMS_OBSERVER',
  'SMS',
  'STATEMENT_CSV'
];

const ATTRIBUTION_STATUS_ENUM = [
  'UNATTRIBUTED',
  'ATTRIBUTED',
  'DUPLICATE_IGNORED',
  'DUPLICATE_UTR',
  'AMBIGUOUS',
  'LATE_UNMATCHED',
  'MATCHED_RECONCILED',
  'OBSERVED_UNATTRIBUTED',
  'REJECTED_SPOOF'
];

const youpiBankObservationSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, index: true, trim: true },
    receivingAccountId: { type: String, default: '', lowercase: true, trim: true, index: true },
    source: {
      type: String,
      enum: OBSERVATION_SOURCE_ENUM,
      required: true,
      index: true
    },
    channelFamily: {
      type: String,
      enum: ['GMAIL', 'SMS', 'STATEMENT_CSV'],
      default: 'SMS',
      index: true
    },
    sender: { type: String, default: '', trim: true },
    bankRef: { type: String, default: '', index: true, trim: true },
    amountPaise: { type: Number, required: true, min: 0, index: true },
    senderVpa: { type: String, default: '', trim: true },
    observedAt: { type: Date, default: Date.now, index: true },
    rawSnippet: { type: String, default: '' },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    attributionStatus: {
      type: String,
      enum: ATTRIBUTION_STATUS_ENUM,
      default: 'UNATTRIBUTED',
      index: true
    },
    matchedPaymentId: { type: String, default: '', index: true, trim: true },
    matchedOrderId: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true }
  },
  { timestamps: true }
);

youpiBankObservationSchema.index({ createdAt: -1 });
youpiBankObservationSchema.index({ receivingAccountId: 1, bankRef: 1, amountPaise: 1 });
youpiBankObservationSchema.index(
  { fingerprint: 1, channelFamily: 1 },
  { unique: true, name: 'idx_obs_fingerprint_family' }
);

module.exports = mongoose.model('YoupiBankObservation', youpiBankObservationSchema);
module.exports.OBSERVATION_SOURCE_ENUM = OBSERVATION_SOURCE_ENUM;
module.exports.ATTRIBUTION_STATUS_ENUM = ATTRIBUTION_STATUS_ENUM;
