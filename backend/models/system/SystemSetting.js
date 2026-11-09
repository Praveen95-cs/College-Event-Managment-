const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    autoDeleteExpiredEvents: { type: Boolean, default: false },
    expiredEventGraceHours: { type: Number, default: 24, min: 0, max: 720 },
    lastCleanupAt: { type: Date, default: null },
    lastDeletedCount: { type: Number, default: 0 },
    lastDeletedTitles: [{ type: String }],
    // Multi-channel Email Delivery & Admin Override Settings (port 443 HTTP relays bypass Render free SMTP block)
    emailRelayProvider: {
      type: String,
      enum: ['auto', 'brevo', 'resend', 'webhook', 'smtp'],
      default: 'auto'
    },
    brevoApiKey: { type: String, default: '', trim: true },
    resendApiKey: { type: String, default: '', trim: true },
    emailWebhookUrl: { type: String, default: '', trim: true },
    emailWebhookSecret: { type: String, default: '', trim: true },
    smtpHostOverride: { type: String, default: '', trim: true },
    smtpPortOverride: { type: Number, default: 0 },
    smtpUserOverride: { type: String, default: '', trim: true },
    smtpPassOverride: { type: String, default: '', trim: true },
    smtpFromOverride: { type: String, default: '', trim: true },
    lastEmailStatus: { type: mongoose.Schema.Types.Mixed, default: null },
    // YouPI-PG V2 Multi-VPA Pool, Android SMS Gateway & Bank Automation Controls
    youpiBackupVpas: [{ type: String, trim: true }],
    youpiAutoVerifyEnabled: { type: Boolean, default: false },
    youpiImapHost: { type: String, default: 'imap.gmail.com', trim: true },
    youpiImapPort: { type: Number, default: 993 },
    youpiImapUser: { type: String, default: '', trim: true },
    youpiImapPass: { type: String, default: '', trim: true },
    youpiObserverSecret: { type: String, default: '', trim: true },
    youpiAndroidEnrollmentSecret: { type: String, default: '', trim: true },
    youpiLastPollAt: { type: Date, default: null },
    youpiLastPollResult: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemSetting', systemSettingSchema);

