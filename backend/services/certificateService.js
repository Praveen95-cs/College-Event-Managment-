const PDFDocument = require('pdfkit');

/**
 * Generates an executive, high-resolution landscape certificate PDF
 * @param {Object} data
 * @param {string} data.name - Participant full name
 * @param {string} data.regNo - Student Registration No / Roll No
 * @param {string} data.eventTitle - Title of the event
 * @param {string} data.department - Academic Department
 * @param {string} data.location - Event location / venue
 * @param {Date|string} data.date - Event Date
 * @param {string} [data.certificateId] - Unique certificate ID
 * @param {string} [data.organizerName] - Name of organizer
 * @returns {PDFDocument}
 */
function generateCertificateStream(data) {
  const {
    name = 'Participant Name',
    regNo = 'N/A',
    eventTitle = 'Campus Championship',
    department = 'Engineering & Technology',
    location = 'Main Campus Auditorium',
    date = new Date(),
    certificateId = 'CERT-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
    organizerName = 'Faculty Coordinator'
  } = data;

  const width = 841.89;  // A4 Landscape Width in pt
  const height = 595.28; // A4 Landscape Height in pt

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: {
      Title: `Certificate - ${name} - ${eventTitle}`,
      Author: 'College Event Management System',
      Subject: 'Certificate of Participation'
    }
  });

  const eventDateStr = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // 1. Premium Background Canvas
  doc.rect(0, 0, width, height).fill('#FAF8F5'); // Soft antique cream

  // Subtle decorative geometric background lines in corners
  doc.save();
  doc.strokeColor('#E2D9CE').lineWidth(0.5);
  for (let i = 0; i < 6; i++) {
    const offset = i * 6;
    doc.moveTo(20 + offset, 20).lineTo(20, 20 + offset).stroke();
    doc.moveTo(width - 20 - offset, 20).lineTo(width - 20, 20 + offset).stroke();
    doc.moveTo(20 + offset, height - 20).lineTo(20, height - 20 - offset).stroke();
    doc.moveTo(width - 20 - offset, height - 20).lineTo(width - 20, height - 20 - offset).stroke();
  }
  doc.restore();

  // 2. Ornamental Border System
  // Outer Deep Navy Border
  doc.rect(24, 24, width - 48, height - 48).lineWidth(4).stroke('#1E1B4B');
  // Middle Thin Accent
  doc.rect(29, 29, width - 58, height - 58).lineWidth(0.75).stroke('#C2410C');
  // Inner Metallic Gold Border
  doc.rect(34, 34, width - 68, height - 68).lineWidth(1.5).stroke('#D97706');

  // Corner Cornerstones (Decorative squares with diamonds)
  const drawCorner = (cx, cy) => {
    doc.save();
    doc.rect(cx - 7, cy - 7, 14, 14).fillAndStroke('#1E1B4B', '#D97706');
    doc.polygon([cx, cy - 4], [cx + 4, cy], [cx, cy + 4], [cx - 4, cy]).fill('#F59E0B');
    doc.restore();
  };

  drawCorner(34, 34);
  drawCorner(width - 34, 34);
  drawCorner(34, height - 34);
  drawCorner(width - 34, height - 34);

  // 3. Top Institution Header
  doc.fillColor('#4338CA')
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('COLLEGE EVENT MANAGEMENT SYSTEM', 0, 52, { align: 'center', characterSpacing: 3 });

  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(8.5)
     .text('CENTRE FOR ACADEMIC EXCELLENCE & STUDENT AFFAIRS', 0, 68, { align: 'center', characterSpacing: 1.5 });

  // 4. Main Certificate Title
  doc.fillColor('#1E1B4B')
     .font('Helvetica-Bold')
     .fontSize(28)
     .text('CERTIFICATE OF PARTICIPATION', 0, 92, { align: 'center', characterSpacing: 2.5 });

  // Decorative Golden Divider Line with Center Diamond
  doc.save();
  const lineY = 132;
  const lineW = 320;
  const lineStartX = (width - lineW) / 2;
  doc.strokeColor('#D97706').lineWidth(1.2)
     .moveTo(lineStartX, lineY)
     .lineTo(lineStartX + lineW, lineY)
     .stroke();

  // Diamond in center of divider
  const midX = width / 2;
  doc.polygon([midX, lineY - 4], [midX + 5, lineY], [midX, lineY + 4], [midX - 5, lineY])
     .fillAndStroke('#F59E0B', '#B45309');
  doc.restore();

  // 5. Presentation Line
  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(11)
     .text('THIS IS TO PROUDLY CERTIFY THAT', 0, 150, { align: 'center', characterSpacing: 2 });

  // 6. Recipient Name (Prominent & Elegant)
  doc.fillColor('#0F172A')
     .font('Helvetica-Bold')
     .fontSize(28)
     .text(name, 0, 174, { align: 'center' });

  // Subtle underline under name
  const nameWidth = Math.min(doc.widthOfString(name) + 40, 480);
  doc.save()
     .strokeColor('#E2E8F0').lineWidth(1)
     .moveTo((width - nameWidth) / 2, 210)
     .lineTo((width + nameWidth) / 2, 210)
     .stroke()
     .restore();

  // Registration ID & Department Sub-badge
  const subText = `Student ID: ${regNo}  •  Department of ${department}`;
  doc.fillColor('#4B5563')
     .font('Helvetica-Bold')
     .fontSize(9.5)
     .text(subText, 0, 218, { align: 'center' });

  // 7. Event Participation Statement
  doc.fillColor('#475569')
     .font('Helvetica')
     .fontSize(11)
     .text('has successfully attended, participated, and demonstrated commendable enthusiasm in the campus event', 0, 246, { align: 'center' });

  // 8. Event Title (Bold Accent)
  doc.fillColor('#4338CA')
     .font('Helvetica-Bold')
     .fontSize(20)
     .text(`"${eventTitle}"`, 0, 268, { align: 'center' });

  // Event Context Details
  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(10)
     .text(`Conducted on ${eventDateStr} at ${location}`, 0, 298, { align: 'center' });

  // 9. Signatures and Official Gold Seal Section
  const footerBaseY = 380;

  // Left Signature Block
  const sigLeftX = 110;
  doc.save();
  // Simulated signature flourish
  doc.strokeColor('#374151').lineWidth(1.2)
     .moveTo(sigLeftX, footerBaseY + 45)
     .bezierCurveTo(sigLeftX + 35, footerBaseY + 20, sigLeftX + 70, footerBaseY + 55, sigLeftX + 110, footerBaseY + 30)
     .stroke();
  doc.restore();

  doc.strokeColor('#94A3B8').lineWidth(1)
     .moveTo(sigLeftX, footerBaseY + 52)
     .lineTo(sigLeftX + 150, footerBaseY + 52)
     .stroke();

  doc.fillColor('#1E293B')
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(organizerName, sigLeftX, footerBaseY + 58, { width: 150, align: 'center' });

  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(8.5)
     .text('Faculty Event Coordinator', sigLeftX, footerBaseY + 72, { width: 150, align: 'center' });

  doc.fillColor('#94A3B8')
     .font('Helvetica')
     .fontSize(7.5)
     .text('Campus Events Directorate', sigLeftX, footerBaseY + 84, { width: 150, align: 'center' });

  // Center Official Gold Seal / Medallion
  const sealCenterX = width / 2;
  const sealCenterY = footerBaseY + 48;
  const sealRadius = 36;

  doc.save();
  // Outer decorative sunburst/scalloped border effect
  doc.circle(sealCenterX, sealCenterY, sealRadius + 4).lineWidth(1.5).strokeColor('#F59E0B').stroke();
  doc.circle(sealCenterX, sealCenterY, sealRadius).lineWidth(2).strokeColor('#D97706').fillColor('#FEF3C7').fillAndStroke();
  doc.circle(sealCenterX, sealCenterY, sealRadius - 4).lineWidth(0.75).strokeColor('#B45309').stroke();

  // Seal Ribbons hanging down
  doc.polygon(
    [sealCenterX - 14, sealCenterY + sealRadius - 2],
    [sealCenterX - 24, sealCenterY + sealRadius + 22],
    [sealCenterX - 12, sealCenterY + sealRadius + 18],
    [sealCenterX - 6, sealCenterY + sealRadius + 24],
    [sealCenterX - 4, sealCenterY + sealRadius - 2]
  ).fillAndStroke('#D97706', '#B45309');

  doc.polygon(
    [sealCenterX + 4, sealCenterY + sealRadius - 2],
    [sealCenterX + 6, sealCenterY + sealRadius + 24],
    [sealCenterX + 12, sealCenterY + sealRadius + 18],
    [sealCenterX + 24, sealCenterY + sealRadius + 22],
    [sealCenterX + 14, sealCenterY + sealRadius - 2]
  ).fillAndStroke('#D97706', '#B45309');

  // Seal Inner Text
  doc.fillColor('#92400E')
     .font('Helvetica-Bold')
     .fontSize(7)
     .text('OFFICIAL SEAL', sealCenterX - 30, sealCenterY - 14, { width: 60, align: 'center', characterSpacing: 0.5 });

  doc.fillColor('#D97706')
     .font('Helvetica-Bold')
     .fontSize(14)
     .text('★', sealCenterX - 10, sealCenterY - 6, { width: 20, align: 'center' });

  doc.fillColor('#92400E')
     .font('Helvetica-Bold')
     .fontSize(6.5)
     .text('VERIFIED & VALID', sealCenterX - 30, sealCenterY + 10, { width: 60, align: 'center', characterSpacing: 0.5 });
  doc.restore();

  // Right Signature Block
  const sigRightX = width - 110 - 150;
  doc.save();
  // Simulated signature flourish
  doc.strokeColor('#374151').lineWidth(1.2)
     .moveTo(sigRightX + 10, footerBaseY + 40)
     .bezierCurveTo(sigRightX + 45, footerBaseY + 15, sigRightX + 80, footerBaseY + 50, sigRightX + 130, footerBaseY + 28)
     .stroke();
  doc.restore();

  doc.strokeColor('#94A3B8').lineWidth(1)
     .moveTo(sigRightX, footerBaseY + 52)
     .lineTo(sigRightX + 150, footerBaseY + 52)
     .stroke();

  doc.fillColor('#1E293B')
     .font('Helvetica-Bold')
     .fontSize(11)
     .text('Head of Department', sigRightX, footerBaseY + 58, { width: 150, align: 'center' });

  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(8.5)
     .text(`Dept. of ${department}`, sigRightX, footerBaseY + 72, { width: 150, align: 'center' });

  doc.fillColor('#94A3B8')
     .font('Helvetica')
     .fontSize(7.5)
     .text('College Academic Council', sigRightX, footerBaseY + 84, { width: 150, align: 'center' });

  // 10. Verification Bar & Security Footer
  const barY = height - 52;
  doc.rect(45, barY, width - 90, 18).fill('#F1F5F9');

  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(7.5)
     .text(
       `Certificate ID: ${certificateId}   |   Issued: ${eventDateStr}   |   Digitally Certified by College Event Management System`,
       45,
       barY + 5,
       { width: width - 90, align: 'center' }
     );

  return doc;
}

module.exports = { generateCertificateStream };
