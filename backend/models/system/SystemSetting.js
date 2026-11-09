const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    autoDeleteExpiredEvents: { type: Boolean, default: false },
    expiredEventGraceHours: { type: Number, default: 24, min: 0, max: 720 },
    lastCleanupAt: { type: Date, default: null },
    lastDeletedCount: { type: Number, default: 0 },
    lastDeletedTitles: [{ type: String }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSetting', systemSettingSchema);

