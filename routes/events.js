const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Registration = require('../models/Registration');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

const parseListField = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  return String(value)
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
};

const buildNoveltyFeatures = (body = {}) => ({
  highlights: parseListField(body.highlights),
  perks: parseListField(body.perks),
  agenda: parseListField(body.agenda),
  certificateEnabled: body.certificateEnabled !== undefined
    ? body.certificateEnabled === true || body.certificateEnabled === 'true' || body.certificateEnabled === 'on'
    : true
});

// Get all events with filters
router.get('/', auth, async (req, res) => {
  try {
    const { department, type, search } = req.query;
    const filters = {};

    if (department) {
      filters.department = department;
    }

    if (type) {
      filters.type = type;
    }

    if (search) {
      filters.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('Fetching events with filters:', filters);
    const events = await Event.find(filters).sort({ date: 1 });
    console.log('Found', events.length, 'events');
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single event
router.get('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizer', 'name email')
      .populate('attendees', 'name email');

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create event (organizer/admin only)
router.post('/', [
  auth,
  authorize('admin', 'organizer'),
  upload.single('photo'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('time').trim().notEmpty().withMessage('Time is required'),
  body('location').trim().notEmpty().withMessage('Location is required'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be at least 1'),
  body('department').trim().notEmpty().withMessage('Department is required'),
  body('type').isIn(['tech', 'non-tech', 'special', 'workshop'])
    .withMessage('Invalid event type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const eventData = {
      ...req.body,
      organizer: req.user._id,
      photo: req.file ? `/uploads/${req.file.filename}` : '',
      noveltyFeatures: buildNoveltyFeatures(req.body)
    };

    const event = new Event(eventData);
    await event.save();

    res.status(201).json(event);
  } catch (error) {
    console.error('Error creating event:', error);
    // If there's an error and a file was uploaded, delete it
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    res.status(500).json({ message: 'Error creating event' });
  }
});

// Update event (organizer/admin only)
router.put('/:id', [
  auth,
  authorize('admin', 'organizer'),
  body('title').optional().trim().notEmpty(),
  body('description').optional().trim().notEmpty(),
  body('date').optional().isISO8601(),
  body('time').optional().trim().notEmpty(),
  body('location').optional().trim().notEmpty(),
  body('capacity').optional().isInt({ min: 1 }),
  body('department').optional().trim().notEmpty(),
  body('type').optional().isIn(['tech', 'non-tech', 'special', 'workshop']),
  body('status').optional().isIn(['upcoming', 'ongoing', 'completed', 'cancelled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user is organizer or admin
    if (event.organizer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    Object.assign(event, req.body);
    if (
      req.body.highlights !== undefined ||
      req.body.perks !== undefined ||
      req.body.agenda !== undefined ||
      req.body.certificateEnabled !== undefined
    ) {
      event.noveltyFeatures = buildNoveltyFeatures(req.body);
    }
    await event.save();

    res.json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete event (organizer/admin only)
router.delete('/:id', [auth, authorize('admin', 'organizer')], async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Allow any organizer or admin to delete events
    if (req.user.role !== 'admin' && req.user.role !== 'organizer') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Delete the event image if it exists
    if (event.photo) {
      const imagePath = path.join(__dirname, '..', event.photo);
      fs.unlink(imagePath, (err) => {
        if (err) console.error('Error deleting image:', err);
      });
    }

    // Delete the event
    await Event.deleteOne({ _id: req.params.id });
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Book event
router.post('/:id/book', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    await event.addAttendee(req.user._id);

    // Create notification
    const notification = new Notification({
      user: req.user._id,
      title: 'Event Booking Confirmation',
      message: `You have successfully booked for ${event.title}`,
      type: 'event_booking',
      relatedEvent: event._id
    });
    await notification.save();

    res.json({ message: 'Event booked successfully' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

// Cancel booking
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if user is already registered
    const isRegistered = event.attendees.some(attendee => attendee.toString() === req.user._id.toString());
    if (!isRegistered) {
      return res.status(400).json({ message: 'You are not registered for this event' });
    }

    // Remove user from attendees
    event.attendees = event.attendees.filter(attendee => attendee.toString() !== req.user._id.toString());
    await event.save();

    // Create notification
    const notification = new Notification({
      user: req.user._id,
      title: 'Booking Cancelled',
      message: `Your booking for ${event.title} has been cancelled`,
      type: 'event_cancellation',
      relatedEvent: event._id
    });
    await notification.save();

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Error cancelling booking' });
  }
});

// Register for event (student only)
router.post('/register', [
  auth,
  authorize('student'),
  body('eventId').notEmpty().withMessage('Event ID is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('regNo').trim().notEmpty().withMessage('Registration number is required'),
  body('needsAccommodation').isBoolean().withMessage('Accommodation field must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { eventId, name, regNo, needsAccommodation } = req.body;
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if event is full
    if (event.attendees.length >= event.capacity) {
      return res.status(400).json({ message: 'Event is full' });
    }

    // Check if user is already registered
    const isRegistered = event.attendees.some(attendee => attendee.toString() === req.user._id.toString());
    if (isRegistered) {
      return res.status(400).json({ message: 'You are already registered for this event' });
    }

    // Create registration record
    const registration = new Registration({
      event: eventId,
      user: req.user._id,
      name,
      regNo,
      needsAccommodation,
      status: 'pending'
    });

    await registration.save();

    res.json({
      message: 'Registration successful',
      registrationId: registration._id
    });
  } catch (error) {
    console.error('Error registering for event:', error);
    res.status(500).json({ message: 'Error registering for event' });
  }
});

module.exports = router; 