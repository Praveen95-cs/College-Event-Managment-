const mongoose = require('mongoose');

const youpiAndroidDeviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    deviceName: {
      type: String,
      default: 'Android SMS Observer',
      trim: true
    },
    deviceModel: {
      type: String,
      default: '',
      trim: true
    },
    signingKey: {
      type: String,
      required: true,
      trim: true
    },
    receivingAccountId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    lastHeartbeatAt: {
      type: Date,
      default: null
    },
    lastObservationAt: {
      type: Date,
      default: null
    },
    revokedAt: {
      type: Date,
      default: null
    },
    pairedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

youpiAndroidDeviceSchema.index({ receivingAccountId: 1, isActive: 1 });

module.exports = mongoose.model('YoupiAndroidDevice', youpiAndroidDeviceSchema);

