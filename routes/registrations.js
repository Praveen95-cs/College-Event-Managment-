const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { auth, authorize } = require('../middleware/auth');
const Registration = require('../models/Registration');
const Event = require('../models/Event');

const router = express.Router();

const formatDate = (date) => {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

router.get('/event/:eventId/export', [auth, authorize('admin', 'organizer')], async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId).populate('organizer', 'name email');
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (req.user.role !== 'admin' && event.organizer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const registrations = await Registration.find({ event: req.params.eventId })
      .populate('user', 'name email department')
      .sort({ createdAt: 1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'College Event Manager';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Registrations');
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Registration No.', key: 'regNo', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Department', key: 'department', width: 22 },
      { header: 'Accommodation', key: 'accommodation', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Registered At', key: 'registeredAt', width: 20 }
    ];

    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5B21B6' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    registrations.forEach((registration) => {
      worksheet.addRow({
        name: registration.name,
        regNo: registration.regNo,
        email: registration.user?.email || '',
        department: registration.user?.department || '',
        accommodation: registration.needsAccommodation ? 'Yes' : 'No',
        status: registration.status,
        registeredAt: formatDate(registration.createdAt)
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      row.alignment = { vertical: 'middle' };
      if (rowNumber > 1) {
        row.border = {
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_registrations.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting registrations:', error);
    res.status(500).json({ message: 'Error exporting registrations' });
  }
});

router.get('/event/:eventId/certificate', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId).populate('organizer', 'name email');
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const registration = await Registration.findOne({
      event: req.params.eventId,
      user: req.user._id
    }).populate('user', 'name email department');

    if (!registration) {
      return res.status(404).json({ message: 'Registration not found for current user' });
    }

    if (event.noveltyFeatures?.certificateEnabled === false) {
      return res.status(400).json({ message: 'Certificate generation is disabled for this event' });
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_certificate.pdf"`);

    doc.pipe(res);
    doc.rect(25, 25, 545, 770).lineWidth(4).stroke('#5B21B6');
    doc.rect(40, 40, 515, 740).lineWidth(1).stroke('#D1D5DB');

    doc.fontSize(26).fillColor('#111827').text('Certificate of Participation', { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(14).fillColor('#6B7280').text('This certificate is proudly presented to', { align: 'center' });
    doc.moveDown(1.2);
    doc.fontSize(28).fillColor('#5B21B6').text(registration.name, { align: 'center', underline: true });
    doc.moveDown(1);
    doc.fontSize(14).fillColor('#111827').text('for successfully participating in', { align: 'center' });
    doc.moveDown(0.8);
    doc.fontSize(24).fillColor('#111827').text(event.title, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(12).fillColor('#374151').text(`Department: ${event.department}`, { align: 'center' });
    doc.text(`Event Date: ${formatDate(event.date)}`, { align: 'center' });
    doc.text(`Venue: ${event.location}`, { align: 'center' });
    doc.text(`Registration No.: ${registration.regNo}`, { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(12).fillColor('#6B7280').text(`Issued on ${formatDate(new Date())}`, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(10).fillColor('#9CA3AF').text('College Event Manager', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating certificate:', error);
    res.status(500).json({ message: 'Error generating certificate' });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const registrations = await Registration.find({ user: req.user._id })
      .populate('event', 'title date location department type noveltyFeatures status')
      .sort({ createdAt: -1 });

    res.json(registrations);
  } catch (error) {
    console.error('Error fetching user registrations:', error);
    res.status(500).json({ message: 'Error fetching user registrations' });
  }
});

module.exports = router;