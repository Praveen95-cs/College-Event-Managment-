const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../../middleware/auth');
const User = require('../../models/auth/User');
const { cascadeDeleteUser } = require('../../services/auth/userDeletionService');
const { resolveActiveDepartmentName } = require('../../services/system/departmentService');
const { getSmtpConfig } = require('../../services/email/emailService');
const { sanitizePlainText } = require('../../utils/sanitize');

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

// Admin-only system status (exposes SMTP readiness only to administrators, never to students)
router.get('/admin/system-status', auth, authorize('admin'), (req, res) => {
  const smtp = getSmtpConfig();
  res.json({
    smtpConfigured: smtp.configured,
    smtpHost: smtp.host || '',
    smtpFrom: smtp.from || ''
  });
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
