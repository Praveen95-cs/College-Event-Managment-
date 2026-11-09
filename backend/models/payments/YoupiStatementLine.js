const mongoose = require('mongoose');

const youpiStatementLineSchema = new mongoose.Schema(
  {
    receivingAccountId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    sourceHash: {
      type: String,
      required: true,
      trim: true
    },
    bookedOn: {
      type: String,
      default: '',
      trim: true,
      index: true
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true
    },
    direction: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true
    },
    utr: {
      type: String,
      default: '',
      trim: true,
      index: true
    },
    referenceCount: {
      type: Number,
      default: 0
    },
    narration: {
      type: String,
      default: '',
      trim: true
    },
    matchStatus: {
      type: String,
      enum: ['UNMATCHED', 'RECONCILED', 'CONFLICT', 'IGNORED'],
      default: 'UNMATCHED',
      index: true
    },
    matchReason: {
      type: String,
      default: '',
      trim: true
    },
    paymentSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'YoupiPaymentSession',
      default: null,
      index: true
    },
    paymentId: {
      type: String,
      default: '',
      trim: true
    },
    importedAt: {
      type: Date,
      default: Date.now
    },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

youpiStatementLineSchema.index(
  { receivingAccountId: 1, sourceHash: 1 },
  { unique: true, name: 'idx_statement_unique_source_hash' }
);

module.exports = mongoose.model('YoupiStatementLine', youpiStatementLineSchema);

