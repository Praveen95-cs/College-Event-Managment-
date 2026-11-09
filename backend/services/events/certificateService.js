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

/**
 * Generates an executive, high-resolution landscape Competition Merit Certificate PDF
 * with Score Taken, Accuracy Percentage, Rank, and Performance Badges
 * @param {Object} data
 * @param {string} data.name - Participant full name
 * @param {string} data.regNo - Student Registration No / Roll No
 * @param {string} data.competitionTitle - Title of the competition
 * @param {string} [data.type] - quiz | coding | hybrid
 * @param {number} [data.score] - Score secured
 * @param {number} [data.totalPossibleScore] - Total possible score
 * @param {number} [data.percentage] - Percentage obtained
 * @param {number|null} [data.rank] - Leaderboard rank
 * @param {number} [data.timeTakenSeconds] - Duration in seconds
 * @param {string} [data.department] - Academic department
 * @param {Date|string} [data.date] - Competition date
 * @param {string} [data.certificateId] - Unique certificate ID
 * @param {string} [data.organizerName] - Name of organizer
 * @returns {PDFDocument}
 */
function generateCompetitionCertificateStream(data) {
  const {
    name = 'Participant Name',
    regNo = 'N/A',
    competitionTitle = 'AI Challenge & Coding Arena',
    type = 'quiz',
    score = 0,
    totalPossibleScore = 100,
    percentage = 0,
    rank = null,
    timeTakenSeconds = 0,
    department = 'Computer Science & Engineering',
    date = new Date(),
    certificateId = 'COMP-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
    organizerName = 'Faculty Convener'
  } = data;

  const width = 841.89;  // A4 Landscape Width in pt
  const height = 595.28; // A4 Landscape Height in pt

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: {
      Title: `Merit Certificate - ${name} - ${competitionTitle}`,
      Author: 'College Event Management System',
      Subject: 'Certificate of Merit & Achievement'
    }
  });

  const eventDateStr = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const typeLabel = type === 'coding' ? 'Algorithmic Coding Arena' : type === 'hybrid' ? 'Hybrid Technical Championship' : 'AI-Powered Quiz Competition';

  // 1. Premium Background Canvas
  doc.rect(0, 0, width, height).fill('#FAFAF9'); // Soft ivory

  // Subtle decorative geometric corner guides
  doc.save();
  doc.strokeColor('#E7E5E4').lineWidth(0.5);
  for (let i = 0; i < 6; i++) {
    const offset = i * 6;
    doc.moveTo(20 + offset, 20).lineTo(20, 20 + offset).stroke();
    doc.moveTo(width - 20 - offset, 20).lineTo(width - 20, 20 + offset).stroke();
    doc.moveTo(20 + offset, height - 20).lineTo(20, height - 20 - offset).stroke();
    doc.moveTo(width - 20 - offset, height - 20).lineTo(width - 20, height - 20 - offset).stroke();
  }
  doc.restore();

  // 2. Ornamental Border System
  // Outer Deep Midnight Navy Border
  doc.rect(24, 24, width - 48, height - 48).lineWidth(4).stroke('#0F172A');
  // Middle Emerald/Indigo Accent
  doc.rect(29, 29, width - 58, height - 58).lineWidth(0.75).stroke('#059669');
  // Inner Metallic Gold Border
  doc.rect(34, 34, width - 68, height - 68).lineWidth(1.5).stroke('#D97706');

  // Corner Cornerstones (Decorative squares with diamonds)
  const drawCorner = (cx, cy) => {
    doc.save();
    doc.rect(cx - 7, cy - 7, 14, 14).fillAndStroke('#0F172A', '#D97706');
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
     .text('COLLEGE EVENT MANAGEMENT SYSTEM  •  COMPETITIVE ARENA', 0, 48, { align: 'center', characterSpacing: 2.5 });

  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(8)
     .text('CENTRE FOR TECHNICAL EXCELLENCE & ARTIFICIAL INTELLIGENCE', 0, 63, { align: 'center', characterSpacing: 1.5 });

  // 4. Main Certificate Title
  doc.fillColor('#0F172A')
     .font('Helvetica-Bold')
     .fontSize(26)
     .text('CERTIFICATE OF MERIT & ACHIEVEMENT', 0, 82, { align: 'center', characterSpacing: 2 });

  // Decorative Golden Divider Line with Center Diamond
  doc.save();
  const lineY = 118;
  const lineW = 340;
  const lineStartX = (width - lineW) / 2;
  doc.strokeColor('#D97706').lineWidth(1.2)
     .moveTo(lineStartX, lineY)
     .lineTo(lineStartX + lineW, lineY)
     .stroke();

  const midX = width / 2;
  doc.polygon([midX, lineY - 4], [midX + 5, lineY], [midX, lineY + 4], [midX - 5, lineY])
     .fillAndStroke('#F59E0B', '#B45309');
  doc.restore();

  // 5. Presentation Line
  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(10.5)
     .text('THIS IS PROUDLY CONFERRED UPON', 0, 134, { align: 'center', characterSpacing: 2 });

  // 6. Recipient Name
  doc.fillColor('#0F172A')
     .font('Helvetica-Bold')
     .fontSize(27)
     .text(name, 0, 154, { align: 'center' });

  // Subtle underline under name
  const nameWidth = Math.min(doc.widthOfString(name) + 40, 480);
  doc.save()
     .strokeColor('#CBD5E1').lineWidth(1)
     .moveTo((width - nameWidth) / 2, 188)
     .lineTo((width + nameWidth) / 2, 188)
     .stroke()
     .restore();

  // Registration ID & Department Sub-badge
  const subText = `Student Roll No: ${regNo}  •  Department of ${department}`;
  doc.fillColor('#475569')
     .font('Helvetica-Bold')
     .fontSize(9.5)
     .text(subText, 0, 196, { align: 'center' });

  // 7. Competition Statement
  doc.fillColor('#475569')
     .font('Helvetica')
     .fontSize(10)
     .text(`for exemplary competitive aptitude and verified evaluation performance in the ${typeLabel}`, 0, 218, { align: 'center' });

  // Competition Title
  doc.fillColor('#4338CA')
     .font('Helvetica-Bold')
     .fontSize(18)
     .text(`"${competitionTitle}"`, 0, 236, { align: 'center' });

  // 8. SCORE TAKEN & PERFORMANCE METRICS SHOWCASE PANEL
  const boxW = 540;
  const boxH = 50;
  const boxX = (width - boxW) / 2;
  const boxY = 270;

  // Background card for score
  doc.save();
  doc.roundedRect(boxX, boxY, boxW, boxH, 8).fillAndStroke('#F8FAFC', '#E2E8F0');

  // 4 columns: Score Taken | Accuracy | Rank | Status
  const colW = boxW / 4;

  // Column 1: Score Taken
  doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5)
     .text('SCORE SECURED', boxX, boxY + 10, { width: colW, align: 'center', characterSpacing: 0.5 });
  doc.fillColor('#1E1B4B').font('Helvetica-Bold').fontSize(14)
     .text(`${score} / ${totalPossibleScore}`, boxX, boxY + 23, { width: colW, align: 'center' });

  // Column divider 1
  doc.strokeColor('#E2E8F0').lineWidth(0.8)
     .moveTo(boxX + colW, boxY + 8).lineTo(boxX + colW, boxY + boxH - 8).stroke();

  // Column 2: Accuracy Percentage
  doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5)
     .text('ACCURACY', boxX + colW, boxY + 10, { width: colW, align: 'center', characterSpacing: 0.5 });
  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(14)
     .text(`${percentage}%`, boxX + colW, boxY + 23, { width: colW, align: 'center' });

  // Column divider 2
  doc.strokeColor('#E2E8F0').lineWidth(0.8)
     .moveTo(boxX + colW * 2, boxY + 8).lineTo(boxX + colW * 2, boxY + boxH - 8).stroke();

  // Column 3: Rank
  doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5)
     .text('LEADERBOARD RANK', boxX + colW * 2, boxY + 10, { width: colW, align: 'center', characterSpacing: 0.5 });
  const rankStr = rank ? `#${rank}` : (percentage >= 80 ? 'Top Tier' : 'Certified');
  doc.fillColor('#D97706').font('Helvetica-Bold').fontSize(14)
     .text(rankStr, boxX + colW * 2, boxY + 23, { width: colW, align: 'center' });

  // Column divider 3
  doc.strokeColor('#E2E8F0').lineWidth(0.8)
     .moveTo(boxX + colW * 3, boxY + 8).lineTo(boxX + colW * 3, boxY + boxH - 8).stroke();

  // Column 4: Evaluation Status
  doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5)
     .text('EVALUATION', boxX + colW * 3, boxY + 10, { width: colW, align: 'center', characterSpacing: 0.5 });
  doc.fillColor('#4338CA').font('Helvetica-Bold').fontSize(12)
     .text('VERIFIED MERIT', boxX + colW * 3, boxY + 25, { width: colW, align: 'center' });

  doc.restore();

  // Distinction Pill / Sub-banner
  const distinctionText = rank === 1 ? '★ FIRST PLACE • GOLD DISTINCTION ★' :
                          rank === 2 ? '★ SECOND PLACE • SILVER DISTINCTION ★' :
                          rank === 3 ? '★ THIRD PLACE • BRONZE DISTINCTION ★' :
                          percentage >= 85 ? '★ HIGH DISTINCTION • EXCEPTIONAL MASTERY ★' :
                          percentage >= 60 ? '★ COMMENDABLE PERFORMANCE • VERIFIED MERIT ★' :
                          '★ CERTIFIED COMPETITIVE PARTICIPANT ★';

  doc.fillColor('#B45309')
     .font('Helvetica-Bold')
     .fontSize(8.5)
     .text(distinctionText, 0, 332, { align: 'center', characterSpacing: 1.2 });

  // 9. Signatures and Official Gold Seal Section
  const footerBaseY = 385;

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
     .fontSize(10.5)
     .text(organizerName, sigLeftX, footerBaseY + 58, { width: 150, align: 'center' });

  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(8)
     .text('Lead Competition Evaluator', sigLeftX, footerBaseY + 72, { width: 150, align: 'center' });

  doc.fillColor('#94A3B8')
     .font('Helvetica')
     .fontSize(7.5)
     .text('Academic Competitions Board', sigLeftX, footerBaseY + 84, { width: 150, align: 'center' });

  // Center Official Gold Seal / Medallion
  const sealCenterX = width / 2;
  const sealCenterY = footerBaseY + 48;
  const sealRadius = 36;

  doc.save();
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
     .fontSize(6.5)
     .text('OFFICIAL MERIT', sealCenterX - 30, sealCenterY - 14, { width: 60, align: 'center', characterSpacing: 0.5 });

  doc.fillColor('#D97706')
     .font('Helvetica-Bold')
     .fontSize(14)
     .text('★', sealCenterX - 10, sealCenterY - 6, { width: 20, align: 'center' });

  doc.fillColor('#92400E')
     .font('Helvetica-Bold')
     .fontSize(6)
     .text('VERIFIED SCORE', sealCenterX - 30, sealCenterY + 10, { width: 60, align: 'center', characterSpacing: 0.5 });
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
     .fontSize(10.5)
     .text('Dean of Academic Affairs', sigRightX, footerBaseY + 58, { width: 150, align: 'center' });

  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(8)
     .text(`Dept. of ${department}`, sigRightX, footerBaseY + 72, { width: 150, align: 'center' });

  doc.fillColor('#94A3B8')
     .font('Helvetica')
     .fontSize(7.5)
     .text('College Examination Council', sigRightX, footerBaseY + 84, { width: 150, align: 'center' });

  // 10. Verification Bar & Security Footer
  const barY = height - 52;
  doc.rect(45, barY, width - 90, 18).fill('#F1F5F9');

  doc.fillColor('#64748B')
     .font('Helvetica')
     .fontSize(7.5)
     .text(
       `Certificate ID: ${certificateId}   |   Score: ${score}/${totalPossibleScore} (${percentage}%)   |   Evaluated by AI Engine & College Event Management System`,
       45,
       barY + 5,
       { width: width - 90, align: 'center' }
     );

  return doc;
}

module.exports = {
  generateCertificateStream,
  generateEventCertificateStream: generateCertificateStream,
  generateCompetitionCertificateStream
};
