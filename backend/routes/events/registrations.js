const router = require('express').Router();
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { generateCertificateStream } = require('../../services/events/certificateService');
const { auth, authorize } = require('../../middleware/auth');
const Registration = require('../../models/events/Registration');
const Event = require('../../models/events/Event');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const { sanitizePlainText, sanitizeEmailAddress } = require('../../utils/sanitize');
const { computeEventLifecycle } = require('../../services/feed/feedService');
const { isSettledStatus, toPaise } = require('../../services/payments/youpiGatewayService');
const { sendEventRegistrationEmail } = require('../../services/email/emailService');

const fmt = d => {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
};

function computeAttendanceSummary(registrations, eventDoc) {
  const isPaidEvent = Boolean(eventDoc?.isPaid && Number(eventDoc?.registrationFee || 0) > 0);
  const active = registrations.filter(r => r.status !== 'cancelled');
  const confirmed = active.filter(r => !isPaidEvent || r.paymentStatus === 'paid').length;
  const present = active.filter(r => r.attendanceStatus === 'present').length;
  const absent = active.filter(r => r.attendanceStatus === 'absent').length;
  const unmarked = active.filter(r => !r.attendanceStatus || r.attendanceStatus === 'unmarked').length;
  const total = active.length;
  return {
    total,
    confirmed,
    present,
    absent,
    unmarked,
    attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0
  };
}

router.post('/', auth, async (req, res) => {
  try {
    const e = await Event.findById(req.body.eventId);
    if (!e) return res.status(404).json({ message: 'Event not found' });

    const lc = computeEventLifecycle(e);
    if (['cancelled', 'rejected'].includes(e.status) || lc.registrationState === 'REGISTRATION CLOSED') {
      return res.status(400).json({ message: 'Registration is closed for this event' });
    }
    if (lc.registrationState === 'EVENT COMPLETED') {
      return res.status(400).json({ message: 'This event has already completed' });
    }

    const inAttendees = e.attendees.some(x => x.toString() === req.user._id.toString());
    if (!inAttendees && e.attendees.length >= e.capacity) {
      return res.status(400).json({ message: 'Event is full' });
    }

    const fee = Number(e.registrationFee || 0);
    const isPaidEvent = Boolean(e.isPaid && fee > 0);
    let paymentStatus = 'free';
    let amountPaid = 0;
    let paymentMethod = 'free';
    let transactionId = '';
    let youpiPaymentId = '';
    let youpiOrderId = '';
    let youpiStatus = '';
    let settlementState = '';
    let paidAt = null;

    if (isPaidEvent) {
      if (!req.body.youpiPaymentId) {
        return res.status(402).json({
          code: 'PAYMENT_REQUIRED',
          message: `Verified YouPI payment of ${e.currency || 'INR'} ${fee} is required before registering.`,
          registrationFee: fee,
          currency: e.currency || 'INR'
        });
      }

      const session = await YoupiPaymentSession.findOne({
        paymentId: sanitizePlainText(req.body.youpiPaymentId, 80),
        event: e._id,
        user: req.user._id
      });
      if (!session || !isSettledStatus(session.status) || Number(session.amountPaise || 0) < toPaise(fee)) {
        return res.status(402).json({
          code: session?.status === 'MANUAL_REVIEW' ? 'PAYMENT_MANUAL_REVIEW' : 'PAYMENT_REQUIRED',
          message:
            session?.status === 'MANUAL_REVIEW'
              ? 'Your YouPI payment is awaiting bank reconciliation before registration unlocks.'
              : `Verified YouPI payment of ${e.currency || 'INR'} ${fee} is required before registering.`,
          registrationFee: fee,
          currency: e.currency || 'INR'
        });
      }
      paymentStatus = 'paid';
      amountPaid = fee;
      paymentMethod = 'youpi';
      transactionId = session.utr || session.orderId;
      youpiPaymentId = session.paymentId;
      youpiOrderId = session.orderId;
      youpiStatus = session.status;
      settlementState = session.settlementState || 'RECONCILED';
      paidAt = session.completedAt || new Date();
    }

    // Always lock student registration confirmations to the student's verified account email ID
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
      return res.status(400).json({ message: 'Your account must have a verified student email address to register.' });
    }

    const r = await Registration.create({
      event: e._id,
      user: req.user._id,
      name: sanitizePlainText(req.body.name, 120) || req.user.name,
      regNo: sanitizePlainText(req.body.regNo, 60) || req.user._id.toString().slice(-8),
      email: attendeeEmail,
      needsAccommodation: !!req.body.needsAccommodation,
      status: 'approved',
      paymentStatus,
      amountPaid,
      currency: e.currency || 'INR',
      paymentMethod,
      transactionId,
      youpiPaymentId,
      youpiOrderId,
      youpiStatus,
      settlementState,
      paidAt
    });

    if (!inAttendees) {
      e.attendees.push(req.user._id);
      await e.save();
    }

    if (attendeeEmail) {
      await sendEventRegistrationEmail({
        to: attendeeEmail,
        attendeeName: r.name,
        event: e,
        registration: r,
        isPaidEvent,
        whatsappGroupLink: e.whatsappGroupLink || ''
      }).catch(err => console.warn('Registration confirmation email warning:', err.message));
    }

    res.status(201).json(r);
  } catch (e) {
    res.status(e.code === 11000 ? 409 : 500).json({ message: e.code === 11000 ? 'Already registered' : e.message });
  }
});

router.get('/my', auth, async (req, res) => {
  const rows = await Registration.find({ user: req.user._id, status: { $ne: 'cancelled' } })
    .populate(
      'event',
      'title date time location department type noveltyFeatures status isPaid registrationFee currency whatsappGroupLink'
    )
    .sort({ createdAt: -1 })
    .lean();

  const sanitized = rows.map(row => {
    const ev = row.event ? { ...row.event } : null;
    if (ev) {
      const isPaid = Boolean(ev.isPaid && Number(ev.registrationFee || 0) > 0);
      const unlocked = !isPaid || row.paymentStatus === 'paid';
      ev.hasWhatsappGroup = Boolean(ev.whatsappGroupLink);
      if (!unlocked) {
        ev.whatsappGroupLink = '';
      }
    }
    return { ...row, event: ev };
  });

  res.json(sanitized);
});

router.get('/event/:eventId', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const e = await Event.findById(req.params.eventId).select(
      'title organizer date time location department isPaid registrationFee currency capacity'
    );
    if (!e) return res.status(404).json({ message: 'Event not found' });
    if (req.user.role !== 'admin' && e.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view attendees for this event' });
    }

    const registrations = await Registration.find({ event: e._id, status: { $ne: 'cancelled' } })
      .populate('user', 'name email department')
      .populate('attendanceMarkedBy', 'name email')
      .sort({ createdAt: 1 })
      .lean();

    const summary = computeAttendanceSummary(registrations, e);
    res.json({
      event: e,
      summary,
      registrations
    });
  } catch (err) {
    console.error('Error fetching event registrations/attendance:', err);
    res.status(500).json({ message: 'Failed to load event attendee roster' });
  }
});

router.patch('/:registrationId/attendance', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.registrationId)) {
      return res.status(404).json({ message: 'Registration not found' });
    }
    const reg = await Registration.findById(req.params.registrationId).populate(
      'event',
      'organizer title isPaid registrationFee'
    );
    if (!reg || !reg.event) {
      return res.status(404).json({ message: 'Registration not found' });
    }
    if (req.user.role !== 'admin' && reg.event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to mark attendance for this event' });
    }
    if (reg.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot mark attendance on a cancelled registration' });
    }

    let nextStatus = String(req.body.attendanceStatus || '').trim().toLowerCase();
    if (!nextStatus && req.body.attended !== undefined) {
      nextStatus = req.body.attended ? 'present' : 'absent';
    }
    if (!['present', 'absent', 'unmarked'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Attendance status must be present, absent, or unmarked.' });
    }

    const isPaidEvent = Boolean(reg.event.isPaid && Number(reg.event.registrationFee || 0) > 0);
    if (isPaidEvent && reg.paymentStatus !== 'paid' && nextStatus === 'present') {
      return res.status(400).json({
        message: 'Cannot mark attendee present before YouPI payment is reconciled/paid.'
      });
    }

    reg.attendanceStatus = nextStatus;
    reg.attendedAt = nextStatus === 'present' ? new Date() : null;
    reg.attendanceMarkedBy = nextStatus === 'unmarked' ? null : req.user._id;
    await reg.save();

    const populated = await Registration.findById(reg._id)
      .populate('user', 'name email department')
      .populate('attendanceMarkedBy', 'name email')
      .lean();

    const allRegs = await Registration.find({ event: reg.event._id, status: { $ne: 'cancelled' } }).lean();
    res.json({
      registration: populated,
      summary: computeAttendanceSummary(allRegs, reg.event)
    });
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ message: 'Failed to update attendance' });
  }
});

router.post('/event/:eventId/attendance/bulk', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const e = await Event.findById(req.params.eventId).select('organizer isPaid registrationFee');
    if (!e) return res.status(404).json({ message: 'Event not found' });
    if (req.user.role !== 'admin' && e.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to manage attendance for this event' });
    }

    const nextStatus = String(req.body.attendanceStatus || '').trim().toLowerCase();
    if (!['present', 'absent', 'unmarked'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Attendance status must be present, absent, or unmarked.' });
    }

    const isPaidEvent = Boolean(e.isPaid && Number(e.registrationFee || 0) > 0);
    const filter = {
      event: e._id,
      status: { $ne: 'cancelled' }
    };
    if (Array.isArray(req.body.registrationIds) && req.body.registrationIds.length > 0) {
      filter._id = {
        $in: req.body.registrationIds.filter(rid => mongoose.Types.ObjectId.isValid(rid))
      };
    }
    if (isPaidEvent && nextStatus === 'present') {
      filter.paymentStatus = 'paid';
    }

    const updateResult = await Registration.updateMany(filter, {
      $set: {
        attendanceStatus: nextStatus,
        attendedAt: nextStatus === 'present' ? new Date() : null,
        attendanceMarkedBy: nextStatus === 'unmarked' ? null : req.user._id
      }
    });

    const registrations = await Registration.find({ event: e._id, status: { $ne: 'cancelled' } })
      .populate('user', 'name email department')
      .populate('attendanceMarkedBy', 'name email')
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      updatedCount: updateResult.modifiedCount || 0,
      attendanceStatus: nextStatus,
      summary: computeAttendanceSummary(registrations, e),
      registrations
    });
  } catch (err) {
    console.error('Bulk attendance update error:', err);
    res.status(500).json({ message: 'Failed to update bulk attendance' });
  }
});

router.post('/:registrationId/resend-email', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.registrationId)) {
      return res.status(404).json({ message: 'Registration not found' });
    }
    const reg = await Registration.findById(req.params.registrationId).populate('user', 'email name');
    if (!reg) {
      return res.status(404).json({ message: 'Registration not found' });
    }
    const eventDoc = await Event.findById(reg.event);
    if (!eventDoc) {
      return res.status(404).json({ message: 'Associated event not found' });
    }
    if (req.user.role !== 'admin' && eventDoc.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to resend confirmation emails for this event' });
    }

    const targetEmail = sanitizeEmailAddress(reg.email || reg.user?.email);
    if (!targetEmail) {
      return res.status(400).json({ message: 'No valid student email address is recorded for this registration.' });
    }

    const isPaidEvent = Boolean(eventDoc.isPaid && Number(eventDoc.registrationFee || 0) > 0);
    const result = await sendEventRegistrationEmail({
      to: targetEmail,
      attendeeName: reg.name || reg.user?.name,
      event: eventDoc,
      registration: reg,
      isPaidEvent,
      whatsappGroupLink: eventDoc.whatsappGroupLink || ''
    });

    if (!result.delivered) {
      return res.status(502).json({
        delivered: false,
        code: result.code || 'EMAIL_DELIVERY_FAILED',
        provider: result.provider,
        message: result.reason || 'Email delivery failed. Check Admin Email Relay / SMTP settings.'
      });
    }

    res.json({
      delivered: true,
      provider: result.provider,
      latencyMs: result.latencyMs,
      to: targetEmail,
      message: `Confirmation email resent to ${targetEmail} via ${result.provider}.`
    });
  } catch (err) {
    console.error('Resend registration email error:', err);
    res.status(500).json({ message: err.message || 'Failed to resend registration confirmation email' });
  }
});

router.get('/event/:eventId/export', auth, authorize('admin', 'organizer'), async (req, res) => {
  const e = await Event.findById(req.params.eventId);
  if (!e) return res.status(404).json({ message: 'Event not found' });
  if (req.user.role !== 'admin' && e.organizer.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Not authorized' });
  }
  const rs = await Registration.find({ event: e._id }).populate('user', 'email department').sort({ createdAt: 1 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Registrations');
  ws.columns = [
    ['Name', 'name', 24],
    ['Registration No.', 'regNo', 20],
    ['Email', 'email', 30],
    ['Department', 'department', 22],
    ['Accommodation', 'accommodation', 16],
    ['Status', 'status', 14],
    ['Attendance', 'attendanceStatus', 14],
    ['Checked In At', 'attendedAt', 22],
    ['Payment Status', 'paymentStatus', 16],
    ['Amount Paid', 'amountPaid', 14],
    ['Payment Method', 'paymentMethod', 16],
    ['Transaction / UTR ID', 'transactionId', 24],
    ['YouPI Order ID', 'youpiOrderId', 28],
    ['Settlement State', 'settlementState', 18],
    ['Registered At', 'registeredAt', 20]
  ].map(([header, key, width]) => ({ header, key, width }));

  rs.forEach(r =>
    ws.addRow({
      name: r.name,
      regNo: r.regNo,
      email: r.email || r.user?.email || '',
      department: r.user?.department || '',
      accommodation: r.needsAccommodation ? 'Yes' : 'No',
      status: r.status,
      attendanceStatus: (r.attendanceStatus || 'unmarked').toUpperCase(),
      attendedAt: r.attendedAt ? new Date(r.attendedAt).toLocaleString('en-IN') : '',
      paymentStatus: r.paymentStatus || (e.isPaid ? 'pending' : 'free'),
      amountPaid: r.amountPaid || 0,
      paymentMethod: r.paymentMethod || 'free',
      transactionId: r.transactionId || '',
      youpiOrderId: r.youpiOrderId || '',
      settlementState: r.settlementState || '',
      registeredAt: fmt(r.createdAt)
    })
  );

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${e.title.replace(/[^a-z0-9]/gi, '_')}_registrations.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get('/event/:eventId/certificate', auth, async (req, res) => {
  try {
    const e = await Event.findById(req.params.eventId).populate('organizer', 'name email');
    if (!e) return res.status(404).json({ message: 'Event not found' });
    if (e.noveltyFeatures?.certificateEnabled === false) {
      return res.status(403).json({ message: 'Certificate disabled for this event' });
    }
    let r = await Registration.findOne({ event: e._id, user: req.user._id, status: { $ne: 'cancelled' } });
    if (!r && ['admin', 'organizer'].includes(req.user.role)) {
      r = {
        name: req.user.name || 'Faculty Member',
        regNo: 'FAC-' + req.user._id.toString().slice(-6).toUpperCase(),
        _id: 'ADMIN',
        paymentStatus: 'paid'
      };
    }
    if (!r) return res.status(404).json({ message: 'Registration not found' });
    if (e.isPaid && Number(e.registrationFee || 0) > 0 && req.user.role === 'student' && r.paymentStatus !== 'paid') {
      return res.status(402).json({
        code: 'PAYMENT_REQUIRED',
        message: 'Complete event payment before downloading your certificate.'
      });
    }
    const certificateId = `CERT-${new Date(e.date).getFullYear()}-${e._id.toString().slice(-4).toUpperCase()}-${r._id.toString().slice(-4).toUpperCase()}`;
    const doc = generateCertificateStream({
      name: r.name || req.user.name,
      regNo: r.regNo || 'N/A',
      eventTitle: e.title,
      department: e.department || 'Academic Department',
      location: e.location || 'College Campus',
      date: e.date,
      certificateId,
      organizerName: e.organizer?.name || 'Faculty Coordinator'
    });
    const safeTitle = e.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_certificate.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error('Error generating certificate:', err);
    res.status(500).json({ message: 'Failed to generate certificate' });
  }
});

module.exports = router;
