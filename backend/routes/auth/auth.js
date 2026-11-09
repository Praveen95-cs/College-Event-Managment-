const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../../models/auth/User');
const EmailOtp = require('../../models/auth/EmailOtp');
const { auth } = require('../../middleware/auth');
const {
  sendOtpEmail,
  isEmailDeliveryConfigured
} = require('../../services/email/emailService');
const { resolveActiveDepartmentName } = require('../../services/system/departmentService');
const { sanitizePlainText } = require('../../utils/sanitize');

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 30;
const VALID_OTP_PURPOSES = new Set(['register', 'verify_email', 'reset_password']);
const EMAIL_NORMALIZE_OPTIONS = {
  all_lowercase: true,
  gmail_lowercase: true,
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  outlookdotcom_remove_subaddress: false,
  yahoo_remove_subaddress: false,
  icloud_remove_subaddress: false
};

const tokenFor = (user) => jwt.sign(
  { userId: user._id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

const safe = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  emailVerified: Boolean(user.emailVerified)
});

function getJwtSecret() {
  return process.env.JWT_SECRET || 'college_event_manager_production_jwt_secret_2026';
}

function normalizePurpose(raw) {
  const clean = String(raw || 'register').trim();
  return VALID_OTP_PURPOSES.has(clean) ? clean : 'register';
}

function hashOtp(email, otp, purpose = 'register') {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto
    .createHash('sha256')
    .update(`${salt}:${String(email).trim().toLowerCase()}:${purpose}:${String(otp).replace(/\s+/g, '')}`)
    .digest('hex');
  return `${salt}:${digest}`;
}

function isTimingSafeHexEqual(storedHex, candidateHex) {
  try {
    const a = Buffer.from(String(storedHex || ''), 'hex');
    const b = Buffer.from(String(candidateHex || ''), 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifyStoredOtpHash(storedValue, email, otp, purpose = 'register') {
  const raw = String(storedValue || '');
  if (!raw) return false;
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanOtp = String(otp || '').replace(/\s+/g, '');

  if (raw.includes(':')) {
    const [salt, expectedDigest] = raw.split(':');
    if (!salt || !expectedDigest) return false;
    const candidateDigest = crypto
      .createHash('sha256')
      .update(`${salt}:${cleanEmail}:${purpose}:${cleanOtp}`)
      .digest('hex');
    return isTimingSafeHexEqual(expectedDigest, candidateDigest);
  }

  // Legacy HMAC fallback
  const legacyHex = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${cleanEmail}:${purpose}:${cleanOtp}`)
    .digest('hex');
  return isTimingSafeHexEqual(raw, legacyHex);
}

async function verifyAndConsumeOtp({ email, otp, purpose = 'register', markOnly = false }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanOtp = String(otp || '').replace(/\s+/g, '');
  const doc = await EmailOtp.findOne({ email: cleanEmail, purpose });

  if (!doc) {
    const err = new Error('No active OTP found for this email. Please request a verification code.');
    err.status = 400;
    err.code = 'OTP_NOT_FOUND';
    throw err;
  }
  if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
    await EmailOtp.deleteOne({ _id: doc._id }).catch(() => {});
    const err = new Error('Verification OTP has expired. Please request a new code.');
    err.status = 400;
    err.code = 'OTP_EXPIRED';
    throw err;
  }
  if (doc.attempts >= (doc.maxAttempts || 5)) {
    const err = new Error('Too many incorrect OTP attempts. Please request a new verification code.');
    err.status = 429;
    err.code = 'OTP_LOCKED';
    throw err;
  }

  const matchedCurrent = verifyStoredOtpHash(doc.otpHash, cleanEmail, cleanOtp, purpose);
  const previousValid =
    doc.previousOtpHash &&
    doc.previousExpiresAt &&
    doc.previousExpiresAt.getTime() > Date.now() &&
    verifyStoredOtpHash(doc.previousOtpHash, cleanEmail, cleanOtp, purpose);

  if (!matchedCurrent && !previousValid) {
    doc.attempts += 1;
    await doc.save();
    const remaining = Math.max(0, (doc.maxAttempts || 5) - doc.attempts);
    const err = new Error(
      remaining > 0
        ? `Invalid verification OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many incorrect OTP attempts. Please request a new verification code.'
    );
    err.status = 400;
    err.code = 'OTP_INVALID';
    throw err;
  }

  if (markOnly) {
    doc.verifiedAt = new Date();
    await doc.save();
  } else {
    await EmailOtp.deleteOne({ _id: doc._id }).catch(() => {});
  }
  return true;
}

router.post('/send-otp', [
  body('email').isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS).withMessage('Valid email is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  try {
    const email = String(req.body.email).trim().toLowerCase();
    const purpose = normalizePurpose(req.body.purpose);
    let name = sanitizePlainText(req.body.name, 80);

    if (purpose === 'register') {
      const existingUser = await User.findOne({ email }).select('_id').lean();
      if (existingUser) {
        return res.status(409).json({
          message: 'This email is already registered. Please sign in instead.'
        });
      }
    } else if (purpose === 'reset_password') {
      const existingUser = await User.findOne({ email }).select('_id name').lean();
      if (!existingUser) {
        return res.status(404).json({
          message: 'No account found with that email address.'
        });
      }
      if (!name) name = existingUser.name || '';
    }

    const existingOtp = await EmailOtp.findOne({ email, purpose });
    if (existingOtp?.lastSentAt) {
      const elapsedSec = Math.floor((Date.now() - existingOtp.lastSentAt.getTime()) / 1000);
      if (elapsedSec < OTP_RESEND_COOLDOWN_SECONDS) {
        const waitSec = OTP_RESEND_COOLDOWN_SECONDS - elapsedSec;
        return res.status(429).json({
          message: `Please wait ${waitSec}s before requesting another OTP.`,
          retryAfterSeconds: waitSec
        });
      }
    }

    const allowDevPreview =
      process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP_PREVIEW === 'true';
    const emailConfigured = await isEmailDeliveryConfigured();
    if (!emailConfigured && !allowDevPreview) {
      return res.status(503).json({
        code: 'EMAIL_NOT_CONFIGURED',
        message: 'Email delivery is not configured on the server yet. Ask Admin to configure Brevo / Webhook / SMTP.'
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = hashOtp(email, otp, purpose);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);
    const keepPrevious =
      existingOtp?.otpHash &&
      existingOtp?.expiresAt &&
      existingOtp.expiresAt.getTime() > now.getTime();

    await EmailOtp.findOneAndUpdate(
      { email, purpose },
      {
        email,
        purpose,
        otpHash,
        previousOtpHash: keepPrevious ? existingOtp.otpHash : '',
        previousExpiresAt: keepPrevious ? existingOtp.expiresAt : null,
        attempts: 0,
        maxAttempts: 5,
        lastSentAt: now,
        verifiedAt: null,
        expiresAt
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const deliveryRes = await sendOtpEmail({
      to: email,
      name,
      otp,
      expiresMinutes: OTP_TTL_MINUTES,
      purpose
    });

    if (!deliveryRes.delivered && !allowDevPreview) {
      if (existingOtp) {
        await EmailOtp.findOneAndUpdate(
          { email, purpose },
          {
            otpHash: existingOtp.otpHash,
            previousOtpHash: existingOtp.previousOtpHash || '',
            previousExpiresAt: existingOtp.previousExpiresAt || null,
            attempts: existingOtp.attempts || 0,
            lastSentAt: existingOtp.lastSentAt || new Date(0),
            expiresAt: existingOtp.expiresAt
          }
        ).catch(() => {});
      } else {
        await EmailOtp.deleteOne({ email, purpose }).catch(() => {});
      }
      const isTimeoutOrBlocked = ['EMAIL_TIMEOUT', 'SMTP_NETWORK_BLOCKED'].includes(deliveryRes.code);
      return res.status(502).json({
        code: deliveryRes.code || 'EMAIL_DELIVERY_FAILED',
        provider: deliveryRes.provider || 'unknown',
        message: isTimeoutOrBlocked
          ? 'Email server connection timed out or blocked (Render free tier blocks SMTP ports 465/587). Ask Admin to enable an HTTPS Email Relay (Brevo / Apps Script Webhook) in Admin Dashboard.'
          : deliveryRes.code === 'SMTP_AUTH_FAILED'
            ? 'Email server authentication failed. Ask Admin to verify SMTP/Relay credentials.'
            : `Failed to send verification email (${deliveryRes.reason || 'delivery error'}). Please try again.`
      });
    }

    res.json({
      sent: true,
      email,
      purpose,
      delivery: deliveryRes.delivered ? deliveryRes.provider || 'smtp' : 'console',
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      message: deliveryRes.delivered
        ? `A 6-digit verification code has been sent to ${email}.`
        : `Verification code generated for ${email}. Check server console in local dev mode.`,
      ...(allowDevPreview && !deliveryRes.delivered ? { devOtp: otp } : {})
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ message: 'Failed to send verification OTP.' });
  }
});

router.post('/verify-otp', [
  body('email').isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS).withMessage('Valid email is required'),
  body('otp')
    .customSanitizer(v => String(v || '').replace(/\s+/g, ''))
    .matches(/^\d{6}$/)
    .withMessage('Please enter a valid 6-digit OTP')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  try {
    const email = String(req.body.email).trim().toLowerCase();
    const otp = String(req.body.otp).replace(/\s+/g, '');
    const purpose = normalizePurpose(req.body.purpose);

    await verifyAndConsumeOtp({ email, otp, purpose, markOnly: true });

    if (purpose === 'verify_email') {
      await User.updateOne(
        { email },
        { $set: { emailVerified: true, emailVerifiedAt: new Date() } }
      );
      await EmailOtp.deleteOne({ email, purpose }).catch(() => {});
    }

    const verificationToken = jwt.sign(
      { email, purpose, type: 'email_otp_verified' },
      getJwtSecret(),
      { expiresIn: '20m' }
    );

    res.json({
      verified: true,
      email,
      purpose,
      verificationToken,
      message: purpose === 'reset_password' ? 'OTP verified. Enter your new password.' : 'Email verified successfully.'
    });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'OTP_VERIFICATION_FAILED',
      message: err.message || 'OTP verification failed.'
    });
  }
});

router.post('/reset-password', [
  body('email').isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS).withMessage('Valid email is required'),
  body('password').optional().isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('newPassword').optional().isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  }

  const nextPassword = String(req.body.newPassword || req.body.password || '');
  if (nextPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  try {
    const email = String(req.body.email).trim().toLowerCase();
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'No account found with that email address.' });
    }

    let tokenVerified = false;
    if (req.body.verificationToken) {
      try {
        const decoded = jwt.verify(String(req.body.verificationToken), getJwtSecret());
        if (
          decoded?.type !== 'email_otp_verified' ||
          decoded?.purpose !== 'reset_password' ||
          String(decoded.email || '').toLowerCase() !== email
        ) {
          return res.status(400).json({
            code: 'INVALID_RESET_TOKEN',
            message: 'Password reset verification token is invalid or does not match this email.'
          });
        }
        tokenVerified = true;
        await EmailOtp.deleteMany({ email, purpose: 'reset_password' }).catch(() => {});
      } catch (tokenErr) {
        if (!req.body.otp) {
          return res.status(400).json({
            code: 'RESET_TOKEN_EXPIRED',
            message: 'Password reset verification expired. Please request a fresh OTP.'
          });
        }
      }
    }

    if (!tokenVerified) {
      if (req.body.otp) {
        await verifyAndConsumeOtp({ email, otp: req.body.otp, purpose: 'reset_password', markOnly: false });
      } else {
        return res.status(400).json({
          code: 'OTP_REQUIRED',
          message: 'Please verify your 6-digit password reset OTP first.'
        });
      }
    }

    user.password = nextPassword;
    if (!user.emailVerified) {
      user.emailVerified = true;
      user.emailVerifiedAt = new Date();
    }
    await user.save();
    await EmailOtp.deleteMany({ email, purpose: 'reset_password' }).catch(() => {});

    res.json({
      reset: true,
      message: 'Password reset successfully. You can now sign in with your new password.'
    });
  } catch (err) {
    res.status(err.status || 500).json({
      code: err.code || 'PASSWORD_RESET_FAILED',
      message: err.message || 'Failed to reset password.'
    });
  }
});

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS).withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('department').trim().notEmpty().withMessage('Department is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  try {
    const email = String(req.body.email).trim().toLowerCase();
    if (await User.findOne({ email })) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const canonicalDepartment = await resolveActiveDepartmentName(req.body.department);
    if (!canonicalDepartment) {
      return res.status(400).json({
        code: 'INVALID_DEPARTMENT',
        message: 'Please select an active department configured by the campus administrator.'
      });
    }

    const requireEmailOtp = String(process.env.REQUIRE_EMAIL_OTP || 'true').toLowerCase() !== 'false';
    let emailVerified = false;
    let emailVerifiedAt = null;

    if (req.body.verificationToken) {
      try {
        const decoded = jwt.verify(String(req.body.verificationToken), getJwtSecret());
        if (
          decoded?.type !== 'email_otp_verified' ||
          String(decoded.email || '').toLowerCase() !== email
        ) {
          return res.status(400).json({
            code: 'INVALID_OTP_TOKEN',
            message: 'Email verification token does not match this email address.'
          });
        }
        emailVerified = true;
        emailVerifiedAt = new Date();
        await EmailOtp.deleteMany({ email }).catch(() => {});
      } catch {
        if (!req.body.otp) {
          return res.status(400).json({
            code: 'OTP_TOKEN_EXPIRED',
            message: 'Email verification expired. Please request a fresh OTP.'
          });
        }
      }
    }

    if (!emailVerified) {
      if (req.body.otp) {
        await verifyAndConsumeOtp({ email, otp: req.body.otp, purpose: 'register', markOnly: false });
        emailVerified = true;
        emailVerifiedAt = new Date();
      } else if (requireEmailOtp) {
        return res.status(400).json({
          code: 'EMAIL_OTP_REQUIRED',
          message: 'Please verify your email with the 6-digit OTP before creating your account.'
        });
      }
    }

    const user = await User.create({
      name: sanitizePlainText(req.body.name, 120),
      email,
      password: req.body.password,
      department: canonicalDepartment,
      role: 'student',
      emailVerified,
      emailVerifiedAt
    });
    res.status(201).json({ token: tokenFor(user), user: safe(user) });
  } catch (err) {
    res.status(err.status || 500).json({
      code: err.code,
      message: err.message || 'Registration failed'
    });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(EMAIL_NORMALIZE_OPTIONS),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Valid email and password are required' });
  const user = await User.findOne({ email: req.body.email }).select('+password');
  if (!user || !(await user.comparePassword(req.body.password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  res.json({ token: tokenFor(user), user: safe(user) });
});

router.get('/me', auth, (req, res) => res.json(req.user));

router.EMAIL_NORMALIZE_OPTIONS = EMAIL_NORMALIZE_OPTIONS;
router.hashOtp = hashOtp;
router.verifyStoredOtpHash = verifyStoredOtpHash;
router.verifyAndConsumeOtp = verifyAndConsumeOtp;

module.exports = router;
