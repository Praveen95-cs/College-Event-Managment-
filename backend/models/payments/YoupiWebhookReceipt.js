const mongoose = require('mongoose');

const youpiWebhookReceiptSchema = new mongoose.Schema(
  {
    deliveryId: { type: String, required: true, unique: true, index: true, trim: true },
    event: { type: String, required: true, trim: true },
    paymentId: { type: String, default: '', index: true, trim: true },
    orderId: { type: String, default: '', index: true, trim: true },
    signatureValid: { type: Boolean, default: false },
    rawTimestamp: { type: String, default: '' },
    payloadSummary: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model('YoupiWebhookReceipt', youpiWebhookReceiptSchema);

