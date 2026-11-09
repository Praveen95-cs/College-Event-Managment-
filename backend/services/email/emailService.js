const mongoose = require('mongoose');
const { sanitizePlainText, sanitizeEmailAddress } = require('../../utils/sanitize');

const SETTINGS_CACHE_TTL_MS = 15 * 1000;
let cachedTransporter = null;
let cachedConfigKey = '';
let cachedDbSettings = null;
let cachedDbFetchedAt = 0;
let lastRecordedEmailStatus = null;

function parseFromHeader(rawFrom, fallbackEmail = '') {
  const clean = String(rawFrom || '').trim();
  const match = clean.match(/^(.*?)\s*<([^<>]+)>\s*$/);
  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, '').trim() || 'Avenor Campus Events',
      email: sanitizeEmailAddress(match[2]) || fallbackEmail || 'no-reply@avenor.campus'
    };
  }
  const emailOnly = sanitizeEmailAddress(clean);
  if (emailOnly) {
    return { name: 'Avenor Campus Events', email: emailOnly };
  }
  return {
    name: 'Avenor Campus Events',
    email: sanitizeEmailAddress(fallbackEmail) || 'no-reply@avenor.campus'
  };
}

function maskEmail(email) {
  const clean = sanitizeEmailAddress(email);
  if (!clean) return '';
  const [local, domain] = clean.split('@');
  if (!local || !domain) return clean;
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function invalidateEmailSettingsCache() {
  cachedDbSettings = null;
  cachedDbFetchedAt = 0;
  cachedTransporter = null;
  cachedConfigKey = '';
}

async function loadDbEmailSettings(force = false) {
  if (process.env.DISABLE_DB_EMAIL_SETTINGS === 'true') {
    return null;
  }
  if (mongoose.connection.readyState !== 1) {
    return cachedDbSettings;
  }
  if (!force && cachedDbSettings !== null && Date.now() - cachedDbFetchedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedDbSettings;
  }
  try {
    const SystemSetting = require('../../models/system/SystemSetting');
    const doc = await SystemSetting.findOne({ key: 'global' })
      .select(
        'emailRelayProvider brevoApiKey resendApiKey emailWebhookUrl emailWebhookSecret smtpHostOverride smtpPortOverride smtpUserOverride smtpPassOverride smtpFromOverride lastEmailStatus'
      )
      .lean();
    cachedDbSettings = doc || {};
    cachedDbFetchedAt = Date.now();
    if (doc?.lastEmailStatus && !lastRecordedEmailStatus) {
      lastRecordedEmailStatus = doc.lastEmailStatus;
    }
    return cachedDbSettings;
  } catch {
    return cachedDbSettings || {};
  }
}

function buildEffectiveConfigFromDb(db = {}) {
  const useDb = process.env.DISABLE_DB_EMAIL_SETTINGS !== 'true' && db && typeof db === 'object';

  const user = String((useDb && db.smtpUserOverride) || process.env.SMTP_USER || '').trim();
  // Gmail/Google 16-char App Passwords copy with spaces (e.g. "abcd efgh ijkl mnop")
  const pass = String((useDb && db.smtpPassOverride) || process.env.SMTP_PASS || '')
    .replace(/\s+/g, '')
    .trim();
  let host = String((useDb && db.smtpHostOverride) || process.env.SMTP_HOST || '').trim();
  if (!host && user.toLowerCase().endsWith('@gmail.com')) {
    host = 'smtp.gmail.com';
  }
  const dbPort = useDb && Number(db.smtpPortOverride) > 0 ? Number(db.smtpPortOverride) : 0;
  const port = dbPort || Number(process.env.SMTP_PORT || (host === 'smtp.gmail.com' ? 465 : 587));
  const secure =
    dbPort > 0
      ? dbPort === 465
      : process.env.SMTP_SECURE !== undefined
        ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
        : port === 465;

  const from =
    String((useDb && db.smtpFromOverride) || process.env.SMTP_FROM || '').trim() ||
    (user ? `Avenor Campus Events <${user}>` : 'Avenor Campus Events <no-reply@avenor.campus>');

  const brevoApiKey = String((useDb && db.brevoApiKey) || process.env.BREVO_API_KEY || '').trim();
  const resendApiKey = String((useDb && db.resendApiKey) || process.env.RESEND_API_KEY || '').trim();
  const webhookUrl = String((useDb && db.emailWebhookUrl) || process.env.EMAIL_WEBHOOK_URL || '').trim();
  const webhookSecret = String(
    (useDb && db.emailWebhookSecret) || process.env.EMAIL_WEBHOOK_SECRET || ''
  ).trim();
  const relayProviderRaw = String(
    (useDb && db.emailRelayProvider) || process.env.EMAIL_RELAY_PROVIDER || 'auto'
  )
    .trim()
    .toLowerCase();
  const relayProvider = ['auto', 'brevo', 'resend', 'webhook', 'smtp'].includes(relayProviderRaw)
    ? relayProviderRaw
    : 'auto';

  const smtpConfigured = Boolean(host && user && pass);
  const httpConfigured = Boolean(brevoApiKey || resendApiKey || webhookUrl);

  return {
    configured: smtpConfigured || httpConfigured,
    smtpConfigured,
    httpConfigured,
    host,
    port,
    secure,
    user,
    pass,
    from,
    brevoApiKey,
    resendApiKey,
    webhookUrl,
    webhookSecret,
    relayProvider,
    lastEmailStatus: (useDb && db.lastEmailStatus) || lastRecordedEmailStatus || null
  };
}

function getSmtpConfig() {
  return buildEffectiveConfigFromDb(cachedDbSettings || {});
}

async function getEffectiveEmailConfig(force = false) {
  const db = await loadDbEmailSettings(force);
  return buildEffectiveConfigFromDb(db || {});
}

function isSmtpConfigured() {
  return getSmtpConfig().configured;
}

async function isEmailDeliveryConfigured() {
  const cfg = await getEffectiveEmailConfig();
  return cfg.configured;
}

function createNodemailerTransport({ host, port, secure, user, pass }) {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host,
    port,
    secure,
    family: 4, // Force IPv4 so cloud hosts (Render/Heroku/Docker) do not stall on unreachable IPv6 MX/SMTP records
    connectionTimeout: 7000,
    greetingTimeout: 7000,
    socketTimeout: 10000,
    auth: { user, pass }
  });
}

function getTransporterFromConfig(cfg) {
  if (!cfg.smtpConfigured) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}:${cfg.pass.length}`;
  if (cachedTransporter && cachedConfigKey === key) {
    return cachedTransporter;
  }
  cachedTransporter = createNodemailerTransport(cfg);
  cachedConfigKey = key;
  return cachedTransporter;
}

function classifyDeliveryError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '').toUpperCase();
  if (
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET' ||
    code === 'TIMEOUT' ||
    /timeout|timed out|aborted/i.test(msg)
  ) {
    return 'EMAIL_TIMEOUT';
  }
  if (code === 'EAUTH' || /535|Username and Password not accepted|Invalid login/i.test(msg)) {
    return 'SMTP_AUTH_FAILED';
  }
  if (code === 'ECONNREFUSED' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
    return 'SMTP_NETWORK_BLOCKED';
  }
  return 'EMAIL_DELIVERY_FAILED';
}

async function recordEmailStatus(statusObj) {
  lastRecordedEmailStatus = statusObj;
  if (
    process.env.DISABLE_DB_EMAIL_SETTINGS === 'true' ||
    mongoose.connection.readyState !== 1
  ) {
    return;
  }
  try {
    const SystemSetting = require('../../models/system/SystemSetting');
    await SystemSetting.findOneAndUpdate(
      { key: 'global' },
      { $set: { lastEmailStatus: statusObj } },
      { upsert: true }
    );
    if (cachedDbSettings) {
      cachedDbSettings.lastEmailStatus = statusObj;
    }
  } catch {
    // Non-critical diagnostic persistence
  }
}

async function sendViaBrevo({ cfg, to, subject, text, html }) {
  const sender = parseFromHeader(cfg.from, cfg.user);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': cfg.brevoApiKey
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text || '',
      htmlContent: html || text || ''
    }),
    signal: AbortSignal.timeout(9000)
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    const err = new Error(`Brevo API error (${res.status}): ${bodyText.slice(0, 180) || res.statusText}`);
    err.code = `BREVO_${res.status}`;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  return {
    delivered: true,
    provider: 'brevo',
    messageId: data.messageId || ''
  };
}

async function sendViaResend({ cfg, to, subject, text, html }) {
  const sender = parseFromHeader(cfg.from, cfg.user);
  const fromEmail =
    process.env.RESEND_FROM ||
    (sender.email.endsWith('@gmail.com') ? 'Avenor Campus Events <onboarding@resend.dev>' : `${sender.name} <${sender.email}>`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.resendApiKey}`
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      ...(sender.email ? { reply_to: sender.email } : {}),
      subject,
      text: text || '',
      html: html || text || ''
    }),
    signal: AbortSignal.timeout(9000)
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    const err = new Error(`Resend API error (${res.status}): ${bodyText.slice(0, 180) || res.statusText}`);
    err.code = `RESEND_${res.status}`;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  return {
    delivered: true,
    provider: 'resend',
    messageId: data.id || ''
  };
}

async function sendViaWebhook({ cfg, to, subject, text, html }) {
  const sender = parseFromHeader(cfg.from, cfg.user);
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (cfg.webhookSecret) {
    headers['X-Email-Webhook-Secret'] = cfg.webhookSecret;
    headers['Authorization'] = `Bearer ${cfg.webhookSecret}`;
  }

  const payload = {
    to,
    from: `${sender.name} <${sender.email}>`,
    replyTo: sender.email,
    subject,
    text: text || '',
    html: html || text || '',
    secret: cfg.webhookSecret || undefined
  };

  const res = await fetch(cfg.webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    redirect: 'follow',
    signal: AbortSignal.timeout(10000)
  });

  if (res.url && res.url.includes('accounts.google.com')) {
    const err = new Error(
      'Google Apps Script webhook requires authentication (redeploy Web App with access = "Anyone").'
    );
    err.code = 'WEBHOOK_AUTH_REQUIRED';
    throw err;
  }

  const rawText = await res.text().catch(() => '');
  let parsedJson = null;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    parsedJson = null;
  }

  if (!res.ok || parsedJson?.ok === false || parsedJson?.delivered === false || parsedJson?.error) {
    const reason = parsedJson?.error || parsedJson?.message || rawText.slice(0, 160) || res.statusText;
    const err = new Error(`Email webhook error (${res.status}): ${reason}`);
    err.code = 'WEBHOOK_FAILED';
    throw err;
  }

  return {
    delivered: true,
    provider: 'webhook',
    messageId: parsedJson?.messageId || ''
  };
}

async function sendViaSmtp({ cfg, to, subject, text, html }) {
  const primaryTransporter = getTransporterFromConfig(cfg);
  try {
    const info = await primaryTransporter.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
      html
    });
    return {
      delivered: true,
      provider: `smtp:${cfg.port}`,
      messageId: info.messageId || ''
    };
  } catch (primaryErr) {
    const canRetry587 =
      cfg.port === 465 &&
      ['ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'TIMEOUT'].includes(
        String(primaryErr?.code || '').toUpperCase()
      ) || (cfg.port === 465 && /timeout|timed out|ECONNREFUSED|ETIMEDOUT/i.test(primaryErr?.message || ''));

    if (!canRetry587) {
      throw primaryErr;
    }

    const fallbackTransporter = createNodemailerTransport({
      host: cfg.host,
      port: 587,
      secure: false,
      user: cfg.user,
      pass: cfg.pass
    });
    const info = await fallbackTransporter.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
      html
    });
    return {
      delivered: true,
      provider: 'smtp:587',
      messageId: info.messageId || ''
    };
  }
}

function buildTransportOrder(cfg) {
  const attempts = [];
  const addHttp = () => {
    if (cfg.brevoApiKey) attempts.push({ id: 'brevo', fn: sendViaBrevo });
    if (cfg.webhookUrl) attempts.push({ id: 'webhook', fn: sendViaWebhook });
    if (cfg.resendApiKey) attempts.push({ id: 'resend', fn: sendViaResend });
  };
  const addSmtp = () => {
    if (cfg.smtpConfigured) attempts.push({ id: 'smtp', fn: sendViaSmtp });
  };

  if (cfg.relayProvider === 'brevo') {
    if (cfg.brevoApiKey) attempts.push({ id: 'brevo', fn: sendViaBrevo });
    if (cfg.webhookUrl) attempts.push({ id: 'webhook', fn: sendViaWebhook });
    if (cfg.resendApiKey) attempts.push({ id: 'resend', fn: sendViaResend });
    addSmtp();
    return attempts;
  }
  if (cfg.relayProvider === 'resend') {
    if (cfg.resendApiKey) attempts.push({ id: 'resend', fn: sendViaResend });
    if (cfg.brevoApiKey) attempts.push({ id: 'brevo', fn: sendViaBrevo });
    if (cfg.webhookUrl) attempts.push({ id: 'webhook', fn: sendViaWebhook });
    addSmtp();
    return attempts;
  }
  if (cfg.relayProvider === 'webhook') {
    if (cfg.webhookUrl) attempts.push({ id: 'webhook', fn: sendViaWebhook });
    if (cfg.brevoApiKey) attempts.push({ id: 'brevo', fn: sendViaBrevo });
    if (cfg.resendApiKey) attempts.push({ id: 'resend', fn: sendViaResend });
    addSmtp();
    return attempts;
  }
  if (cfg.relayProvider === 'smtp') {
    addSmtp();
    addHttp();
    return attempts;
  }

  // 'auto': in production (e.g., Render free where outbound SMTP 465/587 often stalls), try HTTPS port 443 relays first if present!
  const isProd = process.env.NODE_ENV === 'production' || process.env.EMAIL_PREFER_HTTPS === 'true';
  if (isProd && cfg.httpConfigured) {
    addHttp();
    addSmtp();
  } else {
    addSmtp();
    addHttp();
  }
  return attempts;
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
    return {
      delivered: false,
      provider: 'skipped',
      code: 'INVALID_RECIPIENT',
      reason: 'Invalid or empty recipient email'
    };
  }

  const startedAt = Date.now();
  const cfg = await getEffectiveEmailConfig();
  if (!cfg.configured) {
    console.log(`[EmailService:console] To=${cleanTo} | Subject="${subject}"`);
    return {
      delivered: false,
      provider: 'console',
      code: 'EMAIL_NOT_CONFIGURED',
      reason: 'No SMTP credentials or HTTPS Email Relay (Brevo / Resend / Webhook) configured.'
    };
  }

  const attempts = buildTransportOrder(cfg);
  const errors = [];

  for (const attempt of attempts) {
    try {
      const res = await attempt.fn({ cfg, to: cleanTo, subject, text, html });
      const latencyMs = Date.now() - startedAt;
      await recordEmailStatus({
        delivered: true,
        provider: res.provider,
        toMasked: maskEmail(cleanTo),
        subject: sanitizePlainText(subject, 120),
        latencyMs,
        at: new Date().toISOString()
      });
      return {
        ...res,
        latencyMs
      };
    } catch (err) {
      const errCode = classifyDeliveryError(err);
      console.error(`[EmailService] ${attempt.id} failed for ${cleanTo}:`, err.message);
      errors.push({
        provider: attempt.id,
        code: errCode,
        message: err.message
      });
    }
  }

  const latencyMs = Date.now() - startedAt;
  const primaryError = errors[errors.length - 1] || {
    provider: 'none',
    code: 'EMAIL_DELIVERY_FAILED',
    message: 'All configured email delivery transports failed.'
  };
  const summaryReason = errors.map(e => `${e.provider}: ${e.message}`).join(' | ');

  await recordEmailStatus({
    delivered: false,
    provider: `${primaryError.provider}_error`,
    code: primaryError.code,
    reason: summaryReason.slice(0, 320),
    toMasked: maskEmail(cleanTo),
    subject: sanitizePlainText(subject, 120),
    latencyMs,
    at: new Date().toISOString()
  });

  return {
    delivered: false,
    provider: `${primaryError.provider}_error`,
    code: primaryError.code,
    reason: summaryReason,
    latencyMs
  };
}

async function getEmailDiagnostics({ mask = true } = {}) {
  const cfg = await getEffectiveEmailConfig(true);
  const activeChannels = [];
  if (cfg.brevoApiKey) activeChannels.push('brevo-https');
  if (cfg.webhookUrl) activeChannels.push('webhook-https');
  if (cfg.resendApiKey) activeChannels.push('resend-https');
  if (cfg.smtpConfigured) activeChannels.push(`smtp-${cfg.port}`);

  let webhookUrlHost = '';
  if (cfg.webhookUrl) {
    try {
      webhookUrlHost = new URL(cfg.webhookUrl).host;
    } catch {
      webhookUrlHost = 'invalid-url';
    }
  }

  return {
    configured: cfg.configured,
    smtpConfigured: cfg.smtpConfigured,
    httpConfigured: cfg.httpConfigured,
    smtpHost: cfg.host || '',
    smtpPort: cfg.port || 465,
    smtpFrom: cfg.from || '',
    smtpUserMasked: mask ? maskEmail(cfg.user) : cfg.user,
    relayProvider: cfg.relayProvider,
    brevoConfigured: Boolean(cfg.brevoApiKey),
    resendConfigured: Boolean(cfg.resendApiKey),
    webhookConfigured: Boolean(cfg.webhookUrl),
    webhookUrl: mask ? '' : cfg.webhookUrl,
    webhookUrlHost,
    webhookSecretConfigured: Boolean(cfg.webhookSecret),
    activeChannels,
    preferHttpsInProd: process.env.NODE_ENV === 'production',
    lastEmailStatus: cfg.lastEmailStatus || lastRecordedEmailStatus || null
  };
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
  getEffectiveEmailConfig,
  isSmtpConfigured,
  isEmailDeliveryConfigured,
  invalidateEmailSettingsCache,
  getEmailDiagnostics,
  sendEmail,
  sendOtpEmail,
  sendEventRegistrationEmail,
  sendPaymentUnderReviewEmail
};
