const mongoose = require('mongoose');

const emailOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, enum: ['register', 'verify_email', 'reset_password'], default: 'register' },
    otpHash: { type: String, required: true },
    previousOtpHash: { type: String, default: '' },
    previousExpiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 5 },
    lastSentAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('EmailOtp', emailOtpSchema);

