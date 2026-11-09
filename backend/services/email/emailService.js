const { sanitizePlainText, sanitizeEmailAddress } = require('../../utils/sanitize');

let cachedTransporter = null;
let cachedConfigKey = '';

function getSmtpConfig() {
  const user = String(process.env.SMTP_USER || '').trim();
  // Gmail/Google 16-char App Passwords copy with spaces (e.g. "abcd efgh ijkl mnop")
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();
  let host = String(process.env.SMTP_HOST || '').trim();
  if (!host && user.toLowerCase().endsWith('@gmail.com')) {
    host = 'smtp.gmail.com';
  }
  const port = Number(process.env.SMTP_PORT || (host === 'smtp.gmail.com' ? 465 : 587));
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
      : port === 465;
  const from =
    String(process.env.SMTP_FROM || '').trim() ||
    (user ? `Avenor Campus Events <${user}>` : 'Avenor Campus Events <no-reply@avenor.campus>');

  return {
    configured: Boolean(host && user && pass),
    host,
    port,
    secure,
    user,
    pass,
    from
  };
}

function isSmtpConfigured() {
  return getSmtpConfig().configured;
}

function getTransporter() {
  const cfg = getSmtpConfig();
  if (!cfg.configured) return null;

  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}:${cfg.pass.length}`;
  if (cachedTransporter && cachedConfigKey === key) {
    return cachedTransporter;
  }

  // Lazy load so tests without SMTP run cleanly
  const nodemailer = require('nodemailer');
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    }
  });
  cachedConfigKey = key;
  return cachedTransporter;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBrandedShell({ preheader = '', heading = '', bodyHtml = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:24px;background-color:#12110f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#efe9de;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#1c1a18;border:1px solid #2e2a25;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid #2e2a25;background:#161513;">
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#ebb05d;font-weight:700;">AVENOR · CAMPUS EVENTS</div>
        <h1 style="margin:8px 0 0 0;font-size:20px;line-height:1.3;color:#efe9de;font-weight:600;">${escapeHtml(heading)}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;font-size:14px;line-height:1.6;color:#d6cfc3;">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;border-top:1px solid #2e2a25;background:#161513;font-size:12px;color:#8a847a;">
        Automated notification from Avenor College Event Management System.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail({ to, subject, text, html }) {
  const cleanTo = sanitizeEmailAddress(to);
  if (!cleanTo) {
    return { delivered: false, provider: 'skipped', reason: 'Invalid or empty recipient email' };
  }

  const cfg = getSmtpConfig();
  if (!cfg.configured) {
    console.log(`[EmailService:console] To=${cleanTo} | Subject="${subject}"`);
    return {
      delivered: false,
      provider: 'console',
      reason: 'SMTP_HOST / SMTP_USER / SMTP_PASS not configured'
    };
  }

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: cfg.from,
      to: cleanTo,
      subject,
      text,
      html
    });
    return {
      delivered: true,
      provider: 'smtp',
      messageId: info.messageId || ''
    };
  } catch (err) {
    console.error(`[EmailService] SMTP send failed for ${cleanTo}:`, err.message);
    return {
      delivered: false,
      provider: 'smtp_error',
      reason: err.message
    };
  }
}

async function sendOtpEmail({ to, name = '', otp, expiresMinutes = 10, purpose = 'register' }) {
  const cleanName = sanitizePlainText(name, 80) || 'Student';
  const isReset = purpose === 'reset_password';
  const heading = isReset
    ? 'Reset your Avenor password'
    : purpose === 'register'
      ? 'Verify your email address'
      : 'Your Avenor email verification code';

  const introCopy = isReset
    ? 'Use the 6-digit verification code below to reset the password for your Avenor account:'
    : 'Use the 6-digit verification code below to verify your email and complete your student registration on Avenor:';

  const text = [
    `Hi ${cleanName},`,
    '',
    isReset
      ? `Your Avenor password reset OTP is: ${otp}`
      : `Your Avenor email verification OTP is: ${otp}`,
    `This code expires in ${expiresMinutes} minutes.`,
    '',
    'If you did not initiate this request, you can ignore this email safely.'
  ].join('\n');

  const html = buildBrandedShell({
    preheader: isReset ? `Your password reset OTP is ${otp}` : `Your verification OTP is ${otp}`,
    heading,
    bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi <strong style="color:#efe9de;">${escapeHtml(cleanName)}</strong>,</p>
      <p style="margin:0 0 18px 0;">${introCopy}</p>
      <div style="margin:18px 0;padding:18px;background:#161513;border:1px solid #e09132;border-radius:10px;text-align:center;">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8a847a;margin-bottom:6px;">${
          isReset ? 'PASSWORD RESET OTP' : 'VERIFICATION OTP'
        }</div>
        <div style="font-family:monospace;font-size:32px;letter-spacing:0.28em;font-weight:700;color:#ebb05d;">${escapeHtml(otp)}</div>
      </div>
      <p style="margin:0;font-size:13px;color:#8a847a;">Valid for <strong style="color:#efe9de;">${expiresMinutes} minutes</strong>. Never share this code with anyone.</p>
    `
  });

  const result = await sendEmail({
    to,
    subject: isReset ? `${otp} is your Avenor password reset code` : `${otp} is your Avenor verification code`,
    text,
    html
  });

  if (!result.delivered) {
    console.log(`[EmailOTP:${purpose}] OTP for ${to}: ${otp} (expires in ${expiresMinutes}m)`);
  }

  return result;
}

async function sendEventRegistrationEmail({
  to,
  attendeeName,
  event,
  registration,
  isPaidEvent = false,
  whatsappGroupLink = ''
}) {
  const cleanTo = sanitizeEmailAddress(to || registration?.email);
  if (!cleanTo) {
    return { delivered: false, provider: 'skipped', reason: 'No valid email address on registration' };
  }

  const cleanName = sanitizePlainText(attendeeName || registration?.name, 100) || 'Attendee';
  const eventTitle = sanitizePlainText(event?.title, 180) || 'Campus Event';
  const location = sanitizePlainText(event?.location, 180) || 'College Campus';
  const eventDate = event?.date
    ? new Date(event.date).toLocaleDateString('en-IN', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : 'Scheduled Date';
  const eventTime = sanitizePlainText(event?.time, 60) || '';
  const currency = registration?.currency || event?.currency || 'INR';
  const currencySymbol = currency === 'INR' ? '₹' : `${currency} `;
  const feePaid = Number(registration?.amountPaid || event?.registrationFee || 0);
  const regNo = registration?.regNo || 'CONFIRMED';

  // Reveal WhatsApp link only when registration is confirmed (for paid events, only when paymentStatus === 'paid')
  const paymentConfirmed = !isPaidEvent || registration?.paymentStatus === 'paid';
  const allowedWhatsappLink = paymentConfirmed ? String(whatsappGroupLink || '').trim() : '';

  const textLines = [
    `Hi ${cleanName},`,
    '',
    `Your registration is confirmed for "${eventTitle}"!`,
    '',
    `Registration No.: ${regNo}`,
    `Date & Time: ${eventDate}${eventTime ? ` · ${eventTime}` : ''}`,
    `Venue: ${location}`,
    `Admission: ${isPaidEvent ? `Paid ${currencySymbol}${feePaid} via YouPI-PG` : 'Free Entry'}`
  ];

  if (isPaidEvent && registration?.transactionId) {
    textLines.push(`UTR / Transaction Ref: ${registration.transactionId}`);
  }
  if (isPaidEvent && registration?.youpiOrderId) {
    textLines.push(`YouPI Order ID: ${registration.youpiOrderId}`);
  }
  if (allowedWhatsappLink) {
    textLines.push('', `Join Event WhatsApp Group: ${allowedWhatsappLink}`);
  }
  textLines.push('', 'Show your registration number at the venue check-in desk for attendance.', '— Avenor Campus Events');

  const whatsappHtmlBlock = allowedWhatsappLink
    ? `<div style="margin:20px 0 4px 0;padding:16px;background:#14231c;border:1px solid #2b6e4e;border-radius:10px;">
        <div style="font-size:12px;font-weight:600;color:#4cc38a;margin-bottom:6px;">OFFICIAL EVENT WHATSAPP GROUP UNLOCKED</div>
        <p style="margin:0 0 12px 0;font-size:13px;color:#c9ddd3;">Join the attendee WhatsApp group for schedule updates, venue coordinates, and coordinator announcements.</p>
        <a href="${escapeHtml(allowedWhatsappLink)}" style="display:inline-block;padding:10px 16px;background:#4cc38a;color:#0d1912;text-decoration:none;font-weight:600;border-radius:8px;font-size:13px;">Join WhatsApp Group</a>
      </div>`
    : '';

  const html = buildBrandedShell({
    preheader: `Booking confirmed for ${eventTitle}`,
    heading: isPaidEvent ? 'Payment & Event Booking Confirmed' : 'Event Registration Confirmed',
    bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi <strong style="color:#efe9de;">${escapeHtml(cleanName)}</strong>,</p>
      <p style="margin:0 0 16px 0;">Your seat has been reserved for <strong style="color:#efe9de;">${escapeHtml(eventTitle)}</strong>.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#161513;border:1px solid #2e2a25;border-radius:10px;padding:14px 16px;">
        <tr><td style="padding:6px 0;color:#8a847a;font-size:13px;">Registration No.</td><td align="right" style="padding:6px 0;color:#ebb05d;font-family:monospace;font-weight:600;font-size:13px;">${escapeHtml(regNo)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a847a;font-size:13px;">Date &amp; Time</td><td align="right" style="padding:6px 0;color:#efe9de;font-size:13px;">${escapeHtml(eventDate)}${eventTime ? ` · ${escapeHtml(eventTime)}` : ''}</td></tr>
        <tr><td style="padding:6px 0;color:#8a847a;font-size:13px;">Venue</td><td align="right" style="padding:6px 0;color:#efe9de;font-size:13px;">${escapeHtml(location)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a847a;font-size:13px;">Admission</td><td align="right" style="padding:6px 0;color:#4cc38a;font-weight:600;font-size:13px;">${isPaidEvent ? `Paid ${escapeHtml(currencySymbol + feePaid)} (YouPI-PG)` : 'Free Pass'}</td></tr>
        ${
          isPaidEvent && registration?.transactionId
            ? `<tr><td style="padding:6px 0;color:#8a847a;font-size:13px;">UTR / Reference</td><td align="right" style="padding:6px 0;color:#ebb05d;font-family:monospace;font-size:12px;">${escapeHtml(registration.transactionId)}</td></tr>`
            : ''
        }
      </table>
      ${whatsappHtmlBlock}
      <p style="margin:18px 0 0 0;font-size:12px;color:#8a847a;">Please keep this confirmation email handy for event check-in &amp; attendance marking.</p>
    `
  });

  const result = await sendEmail({
    to: cleanTo,
    subject: `Registration Confirmed: ${eventTitle}`,
    text: textLines.join('\n'),
    html
  });

  if (registration?._id) {
    const sentTimestamp = result.delivered ? new Date() : null;
    if (typeof registration === 'object') {
      registration.confirmationEmailTo = cleanTo;
      if (sentTimestamp) {
        registration.confirmationEmailSentAt = sentTimestamp;
      }
    }
    const Registration = require('../../models/events/Registration');
    await Registration.updateOne(
      { _id: registration._id },
      {
        $set: {
          confirmationEmailTo: cleanTo,
          ...(sentTimestamp ? { confirmationEmailSentAt: sentTimestamp } : {})
        }
      }
    ).catch(() => {});
  }

  return result;
}

async function sendPaymentUnderReviewEmail({ to, attendeeName, event, session }) {
  const cleanTo = sanitizeEmailAddress(to || session?.customerEmail);
  if (!cleanTo) return { delivered: false, provider: 'skipped' };

  const cleanName = sanitizePlainText(attendeeName || session?.customerName, 100) || 'Attendee';
  const eventTitle = sanitizePlainText(event?.title, 180) || 'Campus Event';
  const amountDisplay = session?.amount || event?.registrationFee || 0;
  const currency = session?.currency || event?.currency || 'INR';

  const text = [
    `Hi ${cleanName},`,
    '',
    `We received your UTR reference (${session?.utr || 'Submitted'}) for ${eventTitle} (${currency} ${amountDisplay}).`,
    'Your payment is under bank reconciliation by the event organizer/admin.',
    'Once approved, you will receive your final confirmation email with your unlocked pass and event group links.'
  ].join('\n');

  const html = buildBrandedShell({
    preheader: `Payment verification pending for ${eventTitle}`,
    heading: 'YouPI Payment Under Verification',
    bodyHtml: `
      <p style="margin:0 0 14px 0;">Hi <strong style="color:#efe9de;">${escapeHtml(cleanName)}</strong>,</p>
      <p style="margin:0 0 14px 0;">We received your UPI / UTR submission for <strong style="color:#efe9de;">${escapeHtml(eventTitle)}</strong>.</p>
      <div style="padding:14px 16px;background:#161513;border:1px solid #2e2a25;border-radius:10px;font-size:13px;">
        <div><strong>Order ID:</strong> <span style="font-family:monospace;color:#efe9de;">${escapeHtml(session?.orderId || '')}</span></div>
        <div style="margin-top:6px;"><strong>UTR Reference:</strong> <span style="font-family:monospace;color:#ebb05d;">${escapeHtml(session?.utr || '')}</span></div>
        <div style="margin-top:6px;"><strong>Amount:</strong> <span style="font-family:monospace;color:#efe9de;">${escapeHtml(currency)} ${escapeHtml(amountDisplay)}</span></div>
      </div>
      <p style="margin:16px 0 0 0;font-size:13px;color:#aaa398;">Once verified against bank statements, your confirmed ticket email and WhatsApp group link (if applicable) will be sent automatically.</p>
    `
  });

  return sendEmail({
    to: cleanTo,
    subject: `Payment Received (Pending Verification): ${eventTitle}`,
    text,
    html
  });
}

module.exports = {
  getSmtpConfig,
  isSmtpConfigured,
  sendEmail,
  sendOtpEmail,
  sendEventRegistrationEmail,
  sendPaymentUnderReviewEmail
};

