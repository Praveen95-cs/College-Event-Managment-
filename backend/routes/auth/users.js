const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../../middleware/auth');
const User = require('../../models/auth/User');
const { cascadeDeleteUser } = require('../../services/auth/userDeletionService');
const { resolveActiveDepartmentName } = require('../../services/system/departmentService');
const {
  getEmailDiagnostics,
  invalidateEmailSettingsCache,
  sendEmail
} = require('../../services/email/emailService');
const SystemSetting = require('../../models/system/SystemSetting');
const { sanitizePlainText, sanitizeEmailAddress } = require('../../utils/sanitize');

const safe = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  emailVerified: Boolean(user.emailVerified),
  createdAt: user.createdAt
});

router.get('/', auth, authorize('admin'), async (req, res) => {
  res.json(await User.find().select('-password').sort({ createdAt: -1 }));
});

// Admin-only system status & email delivery diagnostics (exposes status only to administrators)
router.get('/admin/system-status', auth, authorize('admin'), async (req, res) => {
  try {
    const diag = await getEmailDiagnostics({ mask: true });
    res.json(diag);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to read system email diagnostics' });
  }
});

router.put('/admin/email-settings', auth, authorize('admin'), async (req, res) => {
  try {
    const existing = await SystemSetting.findOne({ key: 'global' });
    const updateFields = {};

    if (req.body.emailRelayProvider !== undefined) {
      const rp = String(req.body.emailRelayProvider || 'auto').trim().toLowerCase();
      if (!['auto', 'brevo', 'resend', 'webhook', 'smtp'].includes(rp)) {
        return res.status(400).json({ message: 'Invalid email relay provider selected.' });
      }
      updateFields.emailRelayProvider = rp;
    }

    if (req.body.clearBrevoApiKey) {
      updateFields.brevoApiKey = '';
    } else if (req.body.brevoApiKey !== undefined && String(req.body.brevoApiKey).trim() !== '') {
      updateFields.brevoApiKey = String(req.body.brevoApiKey).trim();
    }

    if (req.body.clearResendApiKey) {
      updateFields.resendApiKey = '';
    } else if (req.body.resendApiKey !== undefined && String(req.body.resendApiKey).trim() !== '') {
      updateFields.resendApiKey = String(req.body.resendApiKey).trim();
    }

    if (req.body.clearEmailWebhook) {
      updateFields.emailWebhookUrl = '';
      updateFields.emailWebhookSecret = '';
    } else {
      if (req.body.emailWebhookUrl !== undefined && String(req.body.emailWebhookUrl).trim() !== '') {
        const rawUrl = String(req.body.emailWebhookUrl).trim();
        let parsed;
        try {
          parsed = new URL(rawUrl);
        } catch {
          return res.status(400).json({ message: 'Email Webhook URL must be a valid https:// URL.' });
        }
        if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
          return res.status(400).json({ message: 'Email Webhook URL must use https://.' });
        }
        updateFields.emailWebhookUrl = rawUrl;
      }
      if (req.body.emailWebhookSecret !== undefined && String(req.body.emailWebhookSecret).trim() !== '') {
        updateFields.emailWebhookSecret = String(req.body.emailWebhookSecret).trim();
      }
    }

    if (req.body.clearSmtpOverrides) {
      updateFields.smtpHostOverride = '';
      updateFields.smtpPortOverride = 0;
      updateFields.smtpUserOverride = '';
      updateFields.smtpPassOverride = '';
      updateFields.smtpFromOverride = '';
    } else {
      if (req.body.smtpHostOverride !== undefined) {
        updateFields.smtpHostOverride = sanitizePlainText(req.body.smtpHostOverride, 120);
      }
      if (req.body.smtpPortOverride !== undefined && req.body.smtpPortOverride !== '') {
        const portNum = Number(req.body.smtpPortOverride);
        updateFields.smtpPortOverride = Number.isFinite(portNum) && portNum > 0 ? portNum : 0;
      }
      if (req.body.smtpUserOverride !== undefined) {
        updateFields.smtpUserOverride = String(req.body.smtpUserOverride).trim();
      }
      if (req.body.smtpPassOverride !== undefined && String(req.body.smtpPassOverride).trim() !== '') {
        updateFields.smtpPassOverride = String(req.body.smtpPassOverride).replace(/\s+/g, '').trim();
      } else if (!existing?.smtpPassOverride && req.body.smtpPassOverride === undefined) {
        // leave existing untouched
      }
      if (req.body.smtpFromOverride !== undefined) {
        updateFields.smtpFromOverride = sanitizePlainText(req.body.smtpFromOverride, 160);
      }
    }

    await SystemSetting.findOneAndUpdate(
      { key: 'global' },
      { $set: updateFields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    invalidateEmailSettingsCache();

    const diag = await getEmailDiagnostics({ mask: true });
    res.json({
      message: 'Email delivery settings saved and activated across server instances.',
      status: diag
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update email delivery settings' });
  }
});

router.post('/admin/test-email', auth, authorize('admin'), async (req, res) => {
  try {
    const recipient = sanitizeEmailAddress(req.body.to || req.user.email);
    if (!recipient) {
      return res.status(400).json({ message: 'Enter a valid destination email address for the test.' });
    }

    const result = await sendEmail({
      to: recipient,
      subject: `Avenor Email Delivery Test (${new Date().toLocaleTimeString('en-IN')})`,
      text: `This is a live test email from Avenor Campus Events sent at ${new Date().toISOString()}. Email OTPs and event confirmations are working cleanly.`,
      html: `<p>This is a live diagnostic email from <strong>Avenor Campus Events</strong> sent at <code>${new Date().toISOString()}</code>.</p><p>If you received this, Student OTP verification and registration confirmations are operational.</p>`
    });

    const diag = await getEmailDiagnostics({ mask: true });
    if (!result.delivered) {
      return res.status(502).json({
        delivered: false,
        code: result.code || 'EMAIL_DELIVERY_FAILED',
        provider: result.provider,
        latencyMs: result.latencyMs,
        message: result.reason || 'Test email delivery failed.',
        status: diag
      });
    }

    res.json({
      delivered: true,
      provider: result.provider,
      latencyMs: result.latencyMs,
      to: recipient,
      message: `Test email delivered to ${recipient} via ${result.provider} in ${result.latencyMs}ms.`,
      status: diag
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Test email failed' });
  }
});

router.post('/organizers', auth, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail({
    all_lowercase: true,
    gmail_lowercase: true,
    gmail_remove_dots: false,
    gmail_remove_subaddress: false,
    outlookdotcom_remove_subaddress: false,
    yahoo_remove_subaddress: false,
    icloud_remove_subaddress: false
  }).withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('department').trim().notEmpty().withMessage('Department is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  try {
    if (await User.findOne({ email: req.body.email })) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    const cleanDept =
      (await resolveActiveDepartmentName(req.body.department)) ||
      sanitizePlainText(req.body.department, 100);
    const user = await User.create({
      name: sanitizePlainText(req.body.name, 120),
      email: req.body.email,
      password: req.body.password,
      department: cleanDept,
      role: 'organizer',
      emailVerified: true,
      emailVerifiedAt: new Date()
    });
    res.status(201).json(safe(user));
  } catch {
    res.status(500).json({ message: 'Failed to create organizer' });
  }
});

router.patch('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be changed' });
    }

    if (req.body.role !== undefined) {
      if (!['student', 'organizer'].includes(req.body.role)) {
        return res.status(400).json({ message: 'Role can only be student or organizer. Admin accounts cannot be created.' });
      }
      target.role = req.body.role;
    }

    if (req.body.department !== undefined) {
      const cleanDept =
        (await resolveActiveDepartmentName(req.body.department)) ||
        sanitizePlainText(req.body.department, 100);
      if (!cleanDept) {
        return res.status(400).json({ message: 'Department cannot be empty' });
      }
      target.department = cleanDept;
    }

    await target.save();
    res.json(safe(target));
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update user' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await cascadeDeleteUser(req.params.id, req.user._id);
    res.json({
      message: `User "${result.deletedUser.name}" (${result.deletedUser.email}) deleted permanently.`,
      ...result
    });
  } catch (err) {
    res.status(err.status || 500).json({
      code: err.code || 'USER_DELETE_FAILED',
      message: err.message || 'Failed to delete user'
    });
  }
});

module.exports = router;
