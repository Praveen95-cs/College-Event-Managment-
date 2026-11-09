const mongoose = require('mongoose');

const youpiBankObservationSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, unique: true, index: true, trim: true },
    source: {
      type: String,
      enum: ['IMAP_EMAIL', 'SMS_OBSERVER', 'STATEMENT_CSV'],
      required: true,
      index: true
    },
    sender: { type: String, default: '', trim: true },
    bankRef: { type: String, default: '', index: true, trim: true },
    amountPaise: { type: Number, required: true, min: 0, index: true },
    senderVpa: { type: String, default: '', trim: true },
    observedAt: { type: Date, default: Date.now, index: true },
    rawSnippet: { type: String, default: '' },
    attributionStatus: {
      type: String,
      enum: [
        'MATCHED_RECONCILED',
        'OBSERVED_UNATTRIBUTED',
        'AMBIGUOUS',
        'DUPLICATE_UTR',
        'REJECTED_SPOOF'
      ],
      default: 'OBSERVED_UNATTRIBUTED',
      index: true
    },
    matchedPaymentId: { type: String, default: '', index: true, trim: true },
    matchedOrderId: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true }
  },
  { timestamps: true }
);

youpiBankObservationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('YoupiBankObservation', youpiBankObservationSchema);

