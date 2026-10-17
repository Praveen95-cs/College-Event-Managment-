const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const User = require('../models/User');

const safe = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  createdAt: user.createdAt
});

router.get('/', auth, authorize('admin'), async (req, res) => {
  res.json(await User.find().select('-password').sort({ createdAt: -1 }));
});

router.post('/organizers', auth, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('department').trim().notEmpty().withMessage('Department is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  try {
    if (await User.findOne({ email: req.body.email })) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      department: req.body.department,
      role: 'organizer'
    });
    res.status(201).json(safe(user));
  } catch {
    res.status(500).json({ message: 'Failed to create organizer' });
  }
});

router.patch('/:id', auth, authorize('admin'), async (req, res) => {
  if (!['student', 'organizer'].includes(req.body.role)) {
    return res.status(400).json({ message: 'Role can only be student or organizer. Admin accounts cannot be created.' });
  }
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (target.role === 'admin') {
    return res.status(403).json({ message: 'Admin accounts cannot be changed' });
  }
  target.role = req.body.role;
  await target.save();
  res.json(safe(target));
});

module.exports = router;
