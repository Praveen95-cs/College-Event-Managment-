const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const { auth, optionalAuth, authorize } = require('../../middleware/auth');
const Event = require('../../models/events/Event');
const Notification = require('../../models/community/Notification');
const Registration = require('../../models/events/Registration');
const Competition = require('../../models/competitions/Competition');
const Club = require('../../models/feed/Club');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const {
  isSettledStatus,
  toPaise,
  isValidVpa
} = require('../../services/payments/youpiGatewayService');
const {
  sanitizePlainText,
  sanitizeTags,
  ALLOWED_IMAGE_MIME_TYPES,
  fileToDataUri,
  sanitizeMediaUrl,
  sanitizeWhatsAppUrl,
  sanitizeEmailAddress
} = require('../../utils/sanitize');
const {
  computeEventLifecycle,
  deriveEventCategory,
  syncEventToFeed
} = require('../../services/feed/feedService');
const {
  removeLocalUploadIfExists,
  cascadeDeleteEvent,
  updateCleanupPolicy,
  evaluateExpiredEvents,
  purgeExpiredEvents
} = require('../../services/events/eventCleanupService');
const { sendEventRegistrationEmail } = require('../../services/email/emailService');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, f, cb) =>
    ALLOWED_IMAGE_MIME_TYPES.has(String(f.mimetype || '').toLowerCase())
      ? cb(null, true)
      : cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'))
});

const list = v =>
  !v
    ? []
    : Array.isArray(v)
      ? v.map(String).map(x => x.trim()).filter(Boolean)
      : String(v).split(/\r?\n|,/).map(x => x.trim()).filter(Boolean);

const parseBool = (v, fallback = false) => {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 'on', '1', 'yes'].includes(s)) return true;
  if (['false', 'off', '0', 'no'].includes(s)) return false;
  return fallback;
};

const novelty = (b, prev = {}) => ({
  highlights: b.highlights !== undefined ? list(b.highlights) : (prev.highlights || []),
  perks: b.perks !== undefined ? list(b.perks) : (prev.perks || []),
  agenda: b.agenda !== undefined ? list(b.agenda) : (prev.agenda || []),
  certificateEnabled:
    b.certificateEnabled === undefined
      ? (prev.certificateEnabled ?? true)
      : parseBool(b.certificateEnabled, true)
});

function parseAutoDeleteRule(val, fallback = 'inherit') {
  if (val === undefined || val === null || val === '') return fallback;
  const s = String(val).trim().toLowerCase();
  if (['inherit', 'always', 'never'].includes(s)) return s;
  if (['true', 'on', '1', 'yes'].includes(s)) return 'always';
  if (['false', 'off', '0', 'no'].includes(s)) return 'inherit';
  return fallback;
}

function canRevealWhatsappLink(eventDoc, regDoc, userDoc) {
  if (!eventDoc?.whatsappGroupLink) return false;
  if (
    userDoc &&
    (userDoc.role === 'admin' ||
      (eventDoc.organizer?._id || eventDoc.organizer)?.toString() === userDoc._id?.toString())
  ) {
    return true;
  }
  if (!regDoc || regDoc.status === 'cancelled') return false;
  const isPaidEvent = Boolean(eventDoc.isPaid && Number(eventDoc.registrationFee || 0) > 0);
  if (isPaidEvent) return regDoc.paymentStatus === 'paid';
  return true;
}

function parsePaymentInputs(body, existing = null) {
  const hasIsPaid = body.isPaid !== undefined;
  const hasFee = body.registrationFee !== undefined;
  const isPaid = hasIsPaid
    ? parseBool(body.isPaid, false)
    : existing
      ? Boolean(existing.isPaid)
      : false;
  let registrationFee = hasFee
    ? Math.max(0, Number(body.registrationFee) || 0)
    : existing
      ? Number(existing.registrationFee || 0)
      : 0;
  if (!isPaid) registrationFee = 0;

  const cleanVpa =
    body.paymentUpiId !== undefined
      ? sanitizePlainText(body.paymentUpiId, 120)
      : existing?.paymentUpiId || '';

  if (cleanVpa && !isValidVpa(cleanVpa)) {
    const err = new Error('Please enter a valid UPI VPA (for example, clubtreasury@okicici).');
    err.status = 400;
    throw err;
  }

  let backupPaymentUpiIds = Array.isArray(existing?.backupPaymentUpiIds)
    ? existing.backupPaymentUpiIds
    : [];
  if (body.backupPaymentUpiIds !== undefined) {
    const rawBackups = list(body.backupPaymentUpiIds);
    for (const vpa of rawBackups) {
      if (!isValidVpa(vpa)) {
        const err = new Error(`Invalid backup UPI VPA: ${vpa}`);
        err.status = 400;
        throw err;
      }
    }
    backupPaymentUpiIds = [...new Set(rawBackups.filter(v => v !== cleanVpa))];
  }

  return {
    isPaid,
    registrationFee,
    currency:
      body.currency !== undefined
        ? sanitizePlainText(body.currency, 10) || 'INR'
        : existing?.currency || 'INR',
    paymentUpiId: cleanVpa,
    backupPaymentUpiIds,
    paymentInstructions:
      body.paymentInstructions !== undefined
        ? sanitizePlainText(body.paymentInstructions, 500)
        : existing?.paymentInstructions || ''
  };
}

async function verifyPaymentPayload(eventDoc, body = {}, user = null) {
  const fee = Number(eventDoc.registrationFee || 0);
  const isPaidEvent = Boolean(eventDoc.isPaid && fee > 0);
  if (!isPaidEvent) {
    return {
      isPaidEvent: false,
      paymentStatus: 'free',
      amountPaid: 0,
      currency: eventDoc.currency || 'INR',
      paymentMethod: 'free',
      transactionId: '',
      youpiPaymentId: '',
      youpiOrderId: '',
      youpiStatus: '',
      settlementState: '',
      paidAt: null
    };
  }

  // Paid events must always be backed by a settled YouPI-PG session
  if (!body.youpiPaymentId) {
    const err = new Error(
      `This is a paid event (${eventDoc.currency || 'INR'} ${fee}). Please complete YouPI-PG checkout before confirming registration.`
    );
    err.status = 402;
    err.code = 'PAYMENT_REQUIRED';
    throw err;
  }

  const paymentId = sanitizePlainText(body.youpiPaymentId, 80);
  const session = await YoupiPaymentSession.findOne({
    paymentId,
    event: eventDoc._id,
    ...(user?._id ? { user: user._id } : {})
  });
  if (!session) {
    const err = new Error('YouPI payment session was not found for this event.');
    err.status = 404;
    err.code = 'YOUPI_SESSION_NOT_FOUND';
    throw err;
  }
  if (!isSettledStatus(session.status)) {
    const isReview = session.status === 'MANUAL_REVIEW';
    const err = new Error(
      isReview
        ? 'Your YouPI payment is currently under review. It will unlock once reconciled.'
        : `YouPI payment is ${session.status.toLowerCase()}. Complete payment before confirming registration.`
    );
    err.status = 402;
    err.code = isReview ? 'PAYMENT_MANUAL_REVIEW' : 'PAYMENT_REQUIRED';
    throw err;
  }
  if (Number(session.amountPaise || 0) < toPaise(fee)) {
    const err = new Error('Paid YouPI session amount does not cover the current event fee.');
    err.status = 402;
    err.code = 'AMOUNT_MISMATCH';
    throw err;
  }
  return {
    isPaidEvent: true,
    paymentStatus: 'paid',
    amountPaid: fee,
    currency: eventDoc.currency || 'INR',
    paymentMethod: 'youpi',
    transactionId: session.utr || session.orderId,
    youpiPaymentId: session.paymentId,
    youpiOrderId: session.orderId,
    youpiStatus: session.status,
    settlementState: session.settlementState || 'RECONCILED',
    paidAt: session.completedAt || new Date()
  };
}

async function syncLinkedCompetitionsForEvent(eventDoc, user, body) {
  if (
    body.connectedCompetitionId === undefined &&
    body.connectedCompetitionIds === undefined
  ) {
    return;
  }

  const rawList =
    body.connectedCompetitionIds !== undefined
      ? Array.isArray(body.connectedCompetitionIds)
        ? body.connectedCompetitionIds
        : String(body.connectedCompetitionIds || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
      : body.connectedCompetitionId
        ? [String(body.connectedCompetitionId).trim()]
        : [];

  const validIds = rawList.filter(id => mongoose.Types.ObjectId.isValid(id));
  const ownerFilter = user.role === 'admin' ? {} : { organizer: user._id };
  const requireReg =
    body.requireEventRegistration !== undefined
      ? parseBool(body.requireEventRegistration, true)
      : true;

  if (parseBool(body.replaceCompetitionLinks, false)) {
    await Competition.updateMany(
      {
        ...ownerFilter,
        event: eventDoc._id,
        ...(validIds.length > 0 ? { _id: { $nin: validIds } } : {})
      },
      { $set: { event: null } }
    );
  }

  if (validIds.length > 0) {
    await Competition.updateMany(
      { ...ownerFilter, _id: { $in: validIds } },
      { $set: { event: eventDoc._id, requireEventRegistration: requireReg } }
    );
  }
}

router.get('/public', async (req, res) => {
  try {
    const f = { status: { $nin: ['rejected', 'cancelled'] } };
    if (req.query.department) f.department = req.query.department;
    if (req.query.type) f.type = req.query.type;
    if (req.query.search) {
      f.$or = ['title', 'description'].map(k => ({ [k]: { $regex: req.query.search, $options: 'i' } }));
    }
    res.json(
      await Event.find(f)
        .populate('club', 'name slug logo')
        .select(
          'title description date time location department type category tags eligibility registrationDeadline registrationOpen isPaid registrationFee currency paymentUpiId backupPaymentUpiIds paymentInstructions capacity attendees photo status club'
        )
        .sort({ date: 1 })
        .limit(50)
    );
  } catch (e) {
    res.status(500).json({ message: 'Failed to load events' });
  }
});

// Admin Expired Events & Cloud Auto-Cleanup Controls
router.get('/admin/cleanup-policy', auth, authorize('admin'), async (req, res) => {
  try {
    const summary = await evaluateExpiredEvents();
    res.json({
      policy: summary.policy,
      totalExpiredCount: summary.totalExpiredCount,
      eligibleAutoDeleteCount: summary.eligibleEvents.length,
      expiredEvents: summary.expiredEvents
    });
  } catch (err) {
    console.error('Cleanup policy fetch error:', err);
    res.status(500).json({ message: 'Failed to load expired event cleanup policy' });
  }
});

router.put('/admin/cleanup-policy', auth, authorize('admin'), async (req, res) => {
  try {
    await updateCleanupPolicy({
      autoDeleteExpiredEvents: req.body.autoDeleteExpiredEvents,
      expiredEventGraceHours: req.body.expiredEventGraceHours
    });
    const summary = await evaluateExpiredEvents();
    res.json({
      message: 'Cloud expired-event cleanup policy updated.',
      policy: summary.policy,
      totalExpiredCount: summary.totalExpiredCount,
      eligibleAutoDeleteCount: summary.eligibleEvents.length,
      expiredEvents: summary.expiredEvents
    });
  } catch (err) {
    console.error('Cleanup policy update error:', err);
    res.status(500).json({ message: 'Failed to update cleanup policy' });
  }
});

router.post('/admin/purge-expired', auth, authorize('admin'), async (req, res) => {
  try {
    const graceOverride =
      req.body.graceHours !== undefined && req.body.graceHours !== null
        ? Number(req.body.graceHours)
        : 0;
    const result = await purgeExpiredEvents({
      forceAllExpired: true,
      graceHoursOverride: graceOverride
    });
    res.json({
      message:
        result.deletedCount > 0
          ? `Deleted ${result.deletedCount} expired event(s) and freed associated cloud records.`
          : 'No expired events matched for cleanup.',
      deletedCount: result.deletedCount,
      deletedEvents: result.deletedEvents,
      totalExpiredRemaining: result.totalExpiredRemaining,
      policy: result.policy
    });
  } catch (err) {
    console.error('Manual purge expired error:', err);
    res.status(500).json({ message: 'Failed to purge expired events from cloud' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const f = {};
    if (req.user.role === 'student') f.status = { $nin: ['rejected', 'cancelled'] };
    if (req.query.department) f.department = req.query.department;
    if (req.query.type) f.type = req.query.type;
    if (req.query.search) {
      f.$or = ['title', 'description'].map(k => ({ [k]: { $regex: req.query.search, $options: 'i' } }));
    }
    const listRows = await Event.find(f)
      .populate('organizer', 'name email')
      .populate('club', 'name slug logo')
      .sort({ date: 1 });

    const sanitized = listRows.map(ev => {
      const obj = ev.toObject();
      const canManage =
        req.user.role === 'admin' ||
        (obj.organizer?._id || obj.organizer)?.toString() === req.user._id.toString();
      const hasWhatsappGroup = Boolean(obj.whatsappGroupLink);
      if (!canManage) {
        obj.whatsappGroupLink = '';
      }
      obj.hasWhatsappGroup = hasWhatsappGroup;
      return obj;
    });
    res.json(sanitized);
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch events' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const e = await Event.findById(req.params.id)
      .populate('organizer', 'name email')
      .populate('attendees', 'name email')
      .populate('club', 'name slug logo description followersCount verified');

    if (!e) return res.status(404).json({ message: 'Event not found' });
    const hidden = ['rejected', 'cancelled'];
    if (hidden.includes(e.status) && req.user?.role === 'student') {
      return res.status(404).json({ message: 'Event not found' });
    }

    const [linkedCompetitions, myRegistration] = await Promise.all([
      Competition.find({ event: e._id })
        .select('title description type status durationMinutes totalMarks startTime endTime requireEventRegistration')
        .lean(),
      req.user
        ? Registration.findOne({ event: e._id, user: req.user._id, status: { $ne: 'cancelled' } }).lean()
        : Promise.resolve(null)
    ]);

    const obj = e.toObject();
    const hasWhatsappGroup = Boolean(obj.whatsappGroupLink);
    if (!canRevealWhatsappLink(obj, myRegistration, req.user)) {
      obj.whatsappGroupLink = '';
    }

    res.json({
      ...obj,
      hasWhatsappGroup,
      linkedCompetitions,
      myRegistration
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load event details' });
  }
});

router.post(
  '/',
  auth,
  authorize('admin', 'organizer'),
  upload.single('photo'),
  [
    body('title').trim().notEmpty(),
    body('description').trim().notEmpty(),
    body('date').isISO8601(),
    body('time').trim().notEmpty(),
    body('location').trim().notEmpty(),
    body('capacity').isInt({ min: 1 }),
    body('department').trim().notEmpty(),
    body('type').isIn(['tech', 'non-tech', 'special', 'workshop'])
  ],
  async (req, res) => {
    const er = validationResult(req);
    if (!er.isEmpty()) return res.status(400).json({ errors: er.array(), message: er.array()[0]?.msg || 'Validation error' });
    try {
      let clubId = null;
      if (req.body.club && mongoose.Types.ObjectId.isValid(req.body.club)) {
        const clubDoc = await Club.findById(req.body.club);
        if (
          clubDoc &&
          (req.user.role === 'admin' || clubDoc.admins.some(a => a.toString() === req.user._id.toString()))
        ) {
          clubId = clubDoc._id;
        }
      }

      const paymentFields = parsePaymentInputs(req.body);
      if (paymentFields.isPaid && paymentFields.registrationFee <= 0) {
        return res.status(400).json({ message: 'Paid events must have a registration fee greater than 0.' });
      }

      let whatsappGroupLink = '';
      if (req.body.whatsappGroupLink !== undefined && String(req.body.whatsappGroupLink).trim() !== '') {
        const cleanWa = sanitizeWhatsAppUrl(req.body.whatsappGroupLink);
        if (cleanWa === null) {
          return res.status(400).json({
            message: 'Please enter a valid WhatsApp link (e.g. https://chat.whatsapp.com/... or https://wa.me/...).'
          });
        }
        whatsappGroupLink = cleanWa;
      }

      const tags = sanitizeTags(req.body.tags);
      const category = req.body.category
        ? sanitizePlainText(req.body.category, 40)
        : deriveEventCategory({ ...req.body, tags });
      const eligibility = req.body.eligibility
        ? sanitizePlainText(req.body.eligibility, 300)
        : 'Open to all enrolled students';
      const photo = req.file ? fileToDataUri(req.file) : sanitizeMediaUrl(req.body.photoUrl) || '';

      const e = await Event.create({
        title: sanitizePlainText(req.body.title, 200),
        description: sanitizePlainText(req.body.description, 5000),
        date: new Date(req.body.date),
        time: sanitizePlainText(req.body.time, 80),
        location: sanitizePlainText(req.body.location, 200),
        department: sanitizePlainText(req.body.department, 100),
        type: req.body.type,
        status: req.body.status || 'approved',
        capacity: Number(req.body.capacity),
        organizer: req.user._id,
        club: clubId,
        category,
        tags,
        eligibility,
        registrationDeadline: req.body.registrationDeadline ? new Date(req.body.registrationDeadline) : null,
        registrationOpen:
          req.body.registrationOpen !== undefined ? parseBool(req.body.registrationOpen, true) : true,
        ...paymentFields,
        whatsappGroupLink,
        autoDeleteWhenExpired: parseAutoDeleteRule(req.body.autoDeleteWhenExpired, 'inherit'),
        photo,
        noveltyFeatures: novelty(req.body)
      });

      await syncLinkedCompetitionsForEvent(e, req.user, req.body);
      await syncEventToFeed(e, { notifyFollowers: true });
      res.status(201).json(e);
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message || 'Failed to create event' });
    }
  }
);

async function update(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const e = await Event.findById(req.params.id);
    if (!e) return res.status(404).json({ message: 'Event not found' });
    if (req.user.role !== 'admin' && e.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (req.body.title !== undefined) {
      const clean = sanitizePlainText(req.body.title, 200);
      if (!clean) return res.status(400).json({ message: 'Event title cannot be empty' });
      e.title = clean;
    }
    if (req.body.description !== undefined) {
      const clean = sanitizePlainText(req.body.description, 5000);
      if (!clean) return res.status(400).json({ message: 'Description cannot be empty' });
      e.description = clean;
    }
    if (req.body.date !== undefined && req.body.date !== '') {
      const d = new Date(req.body.date);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid event date' });
      e.date = d;
    }
    if (req.body.time !== undefined) e.time = sanitizePlainText(req.body.time, 80);
    if (req.body.location !== undefined) e.location = sanitizePlainText(req.body.location, 200);
    if (req.body.department !== undefined) e.department = sanitizePlainText(req.body.department, 100);
    if (req.body.type !== undefined && ['tech', 'non-tech', 'special', 'workshop'].includes(req.body.type)) {
      e.type = req.body.type;
    }
    if (
      req.body.status !== undefined &&
      ['pending', 'approved', 'rejected', 'upcoming', 'ongoing', 'completed', 'cancelled'].includes(req.body.status)
    ) {
      e.status = req.body.status;
    }
    if (req.body.capacity !== undefined && req.body.capacity !== '') {
      const cap = Number(req.body.capacity);
      if (!Number.isFinite(cap) || cap < 1) {
        return res.status(400).json({ message: 'Capacity must be at least 1' });
      }
      e.capacity = cap;
    }
    if (req.body.tags !== undefined) {
      e.tags = sanitizeTags(req.body.tags);
    }
    if (req.body.category !== undefined) {
      e.category = req.body.category
        ? sanitizePlainText(req.body.category, 40)
        : deriveEventCategory(e);
    }
    if (req.body.eligibility !== undefined) {
      e.eligibility = sanitizePlainText(req.body.eligibility, 300) || 'Open to all enrolled students';
    }
    if (req.body.club !== undefined) {
      if (!req.body.club || req.body.club === 'null') {
        e.club = null;
      } else if (mongoose.Types.ObjectId.isValid(req.body.club)) {
        const clubDoc = await Club.findById(req.body.club);
        if (
          clubDoc &&
          (req.user.role === 'admin' || clubDoc.admins.some(a => a.toString() === req.user._id.toString()))
        ) {
          e.club = clubDoc._id;
        }
      }
    }
    if (req.body.registrationDeadline !== undefined) {
      e.registrationDeadline = req.body.registrationDeadline ? new Date(req.body.registrationDeadline) : null;
    }
    if (req.body.registrationOpen !== undefined) {
      e.registrationOpen = parseBool(req.body.registrationOpen, true);
    }

    if (
      ['isPaid', 'registrationFee', 'currency', 'paymentUpiId', 'backupPaymentUpiIds', 'paymentInstructions'].some(
        k => req.body[k] !== undefined
      )
    ) {
      const paymentFields = parsePaymentInputs(req.body, e);
      if (paymentFields.isPaid && paymentFields.registrationFee <= 0) {
        return res.status(400).json({ message: 'Paid events must have a registration fee greater than 0.' });
      }
      Object.assign(e, paymentFields);
    }

    if (req.body.whatsappGroupLink !== undefined) {
      const cleanWa = sanitizeWhatsAppUrl(req.body.whatsappGroupLink);
      if (cleanWa === null) {
        return res.status(400).json({
          message: 'Please enter a valid WhatsApp link (e.g. https://chat.whatsapp.com/... or https://wa.me/...).'
        });
      }
      e.whatsappGroupLink = cleanWa;
    }

    if (req.body.autoDeleteWhenExpired !== undefined) {
      e.autoDeleteWhenExpired = parseAutoDeleteRule(
        req.body.autoDeleteWhenExpired,
        e.autoDeleteWhenExpired || 'inherit'
      );
    }

    if (req.file) {
      removeLocalUploadIfExists(e.photo);
      e.photo = fileToDataUri(req.file);
    } else if (parseBool(req.body.removePhoto, false)) {
      removeLocalUploadIfExists(e.photo);
      e.photo = '';
    } else if (req.body.photoUrl !== undefined && String(req.body.photoUrl).trim() !== '') {
      const sanitizedUrl = sanitizeMediaUrl(req.body.photoUrl);
      if (sanitizedUrl) {
        removeLocalUploadIfExists(e.photo);
        e.photo = sanitizedUrl;
      }
    }

    if (['highlights', 'perks', 'agenda', 'certificateEnabled'].some(k => req.body[k] !== undefined)) {
      e.noveltyFeatures = novelty(req.body, e.noveltyFeatures?.toObject?.() || e.noveltyFeatures || {});
    }

    await e.save();
    await syncLinkedCompetitionsForEvent(e, req.user, req.body);
    await syncEventToFeed(e, { notifyFollowers: true });
    res.json(e);
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to update event' });
  }
}

router.put('/:id', auth, authorize('admin', 'organizer'), upload.single('photo'), update);
router.patch('/:id', auth, authorize('admin', 'organizer'), upload.single('photo'), update);
router.delete('/:id', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const e = await Event.findById(req.params.id);
    if (!e) return res.status(404).json({ message: 'Event not found' });
    if (req.user.role !== 'admin' && e.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this event' });
    }

    const result = await cascadeDeleteEvent(e);
    res.json({
      message: 'Event and all associated competitions, bookings, and files deleted successfully to clean up space',
      deletedCompetitionsCount: result.deletedCompetitionsCount
    });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ message: err.message || 'Error deleting event' });
  }
});
async function processEventRegistration(req, res, eventId, successStatus = 200) {
  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ message: 'Valid eventId is required' });
  }
  const e = await Event.findById(eventId);
  if (!e) return res.status(404).json({ message: 'Event not found' });

  const lc = computeEventLifecycle(e);
  if (['cancelled', 'rejected'].includes(e.status) || lc.registrationState === 'REGISTRATION CLOSED') {
    return res.status(400).json({ message: 'Registration is closed for this event' });
  }
  if (lc.registrationState === 'EVENT COMPLETED') {
    return res.status(400).json({ message: 'This event has already completed' });
  }

  const existingReg = await Registration.findOne({ event: e._id, user: req.user._id });
  const inAttendees = e.attendees.some(id => id.toString() === req.user._id.toString());
  const isPaidEvent = Boolean(e.isPaid && Number(e.registrationFee || 0) > 0);
  const alreadyFullyRegistered =
    (inAttendees || (existingReg && existingReg.status !== 'cancelled')) &&
    (!isPaidEvent || existingReg?.paymentStatus === 'paid');

  if (!inAttendees && e.attendees.length >= e.capacity) {
    return res.status(400).json({ message: 'Event is full' });
  }

  if (alreadyFullyRegistered) {
    return res.status(400).json({ message: 'User is already registered for this event' });
  }

  let paymentMeta;
  try {
    paymentMeta = await verifyPaymentPayload(e, req.body, req.user);
  } catch (payErr) {
    return res.status(payErr.status || 402).json({
      code: payErr.code || 'PAYMENT_REQUIRED',
      message: payErr.message,
      registrationFee: Number(e.registrationFee || 0),
      currency: e.currency || 'INR',
      paymentUpiId: e.paymentUpiId || '',
      paymentInstructions: e.paymentInstructions || ''
    });
  }

  // Always mail confirmation strictly to the student's verified account email ID
  const accountEmail = sanitizeEmailAddress(req.user.email) || '';
  let attendeeEmail = accountEmail;
  if (req.user.role !== 'student' && req.body.email !== undefined && String(req.body.email).trim() !== '') {
    const parsedBodyEmail = sanitizeEmailAddress(String(req.body.email).trim());
    if (!parsedBodyEmail) {
      return res.status(400).json({ message: 'Please enter a valid confirmation email address.' });
    }
    attendeeEmail = parsedBodyEmail;
  }
  if (!attendeeEmail) {
    return res.status(400).json({ message: 'Your account must have a valid email address to register.' });
  }

  if (!inAttendees) {
    e.attendees.push(req.user._id);
    await e.save();
  }

  const r = await Registration.findOneAndUpdate(
    { event: e._id, user: req.user._id },
    {
      event: e._id,
      user: req.user._id,
      name: sanitizePlainText(req.body.name, 120) || req.user.name,
      regNo: sanitizePlainText(req.body.regNo, 60) || existingReg?.regNo || req.user._id.toString().slice(-8),
      email: attendeeEmail,
      needsAccommodation: Boolean(req.body.needsAccommodation),
      status: 'approved',
      paymentStatus: paymentMeta.paymentStatus,
      amountPaid: paymentMeta.amountPaid,
      currency: paymentMeta.currency,
      paymentMethod: paymentMeta.paymentMethod,
      transactionId: paymentMeta.transactionId,
      youpiPaymentId: paymentMeta.youpiPaymentId || '',
      youpiOrderId: paymentMeta.youpiOrderId || '',
      youpiStatus: paymentMeta.youpiStatus || '',
      settlementState: paymentMeta.settlementState || '',
      paidAt: paymentMeta.paidAt
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Notification.create({
    user: req.user._id,
    title: paymentMeta.isPaidEvent ? 'Payment & Event Booking Confirmed' : 'Event Booking Confirmation',
    message: paymentMeta.isPaidEvent
      ? `Payment of ${paymentMeta.currency} ${paymentMeta.amountPaid} (${paymentMeta.transactionId}) confirmed for ${e.title}.`
      : `You have successfully booked for ${e.title}`,
    type: 'event_booking',
    relatedEvent: e._id
  });

  const emailResult = attendeeEmail
    ? await sendEventRegistrationEmail({
        to: attendeeEmail,
        attendeeName: r.name,
        event: e,
        registration: r,
        isPaidEvent: paymentMeta.isPaidEvent,
        whatsappGroupLink: e.whatsappGroupLink || ''
      }).catch(err => ({ delivered: false, reason: err.message }))
    : { delivered: false };

  return res.status(successStatus).json({
    message: paymentMeta.isPaidEvent ? 'Payment verified and event booked successfully' : 'Event booked successfully',
    registrationId: r._id,
    registration: r,
    emailSent: Boolean(emailResult?.delivered),
    emailRecipient: attendeeEmail,
    whatsappGroupLink:
      (!paymentMeta.isPaidEvent || r.paymentStatus === 'paid') && e.whatsappGroupLink
        ? e.whatsappGroupLink
        : ''
  });
}

router.post('/register', auth, async (req, res) => {
  try {
    return await processEventRegistration(req, res, req.body.eventId || req.body.id, 201);
  } catch (e) {
    return res.status(e.status || 400).json({ code: e.code, message: e.message || 'Registration failed' });
  }
});

router.post('/:id/book', auth, async (req, res) => {
  try {
    return await processEventRegistration(req, res, req.params.id, 200);
  } catch (e) {
    return res.status(e.status || 400).json({ code: e.code, message: e.message || 'Booking failed' });
  }
});

router.post('/:id/pay-and-register', auth, async (req, res) => {
  try {
    return await processEventRegistration(req, res, req.params.id, 200);
  } catch (e) {
    return res.status(e.status || 400).json({ code: e.code, message: e.message || 'Payment verification failed' });
  }
});

router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const e = await Event.findById(req.params.id);
    if (!e) return res.status(404).json({ message: 'Event not found' });
    await e.removeAttendee(req.user._id);
    await Registration.findOneAndUpdate({ event: e._id, user: req.user._id }, { status: 'cancelled' });
    await Notification.create({
      user: req.user._id,
      title: 'Booking Cancelled',
      message: `Your booking for ${e.title} has been cancelled`,
      type: 'event_cancellation',
      relatedEvent: e._id
    });
    res.json({ message: 'Booking cancelled successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to cancel booking' });
  }
});

router.post('/verify-payment', auth, async (req, res) => {
  try {
    const eventId = req.body.eventId;
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ success: false, message: 'Valid eventId is required' });
    }
    const e = await Event.findById(eventId);
    if (!e) return res.status(404).json({ success: false, message: 'Event not found' });
    const paymentMeta = await verifyPaymentPayload(e, req.body, req.user);
    res.json({
      success: true,
      status: paymentMeta.paymentStatus === 'paid' ? 'succeeded' : 'free',
      ...paymentMeta
    });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      code: err.code || 'PAYMENT_VERIFICATION_FAILED',
      message: err.message || 'Payment verification failed'
    });
  }
});

module.exports = router;
