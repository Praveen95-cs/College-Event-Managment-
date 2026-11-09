const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { auth, authorize } = require('../../middleware/auth');
const User = require('../../models/auth/User');
const SystemSetting = require('../../models/system/SystemSetting');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const YoupiBankObservation = require('../../models/payments/YoupiBankObservation');
const YoupiStatementLine = require('../../models/payments/YoupiStatementLine');
const YoupiAndroidDevice = require('../../models/payments/YoupiAndroidDevice');
const Event = require('../../models/events/Event');
const { sanitizePlainText } = require('../../utils/sanitize');
const {
  PaymentEventBus,
  PaymentStatus,
  UPI_PROVIDERS,
  ALLOWED_NOTIFICATION_PACKAGES,
  isAllowedNotificationPackage,
  getYoupiConfig,
  parseVpaList,
  isValidVpa,
  normalizeReceivingAccountId,
  buildStandQrData,
  createYoupiPaymentSession,
  syncAndGetYoupiSession,
  submitUtrAndProcessSession,
  switchSessionVpa,
  markSessionProcessing,
  cancelYoupiSession,
  reconcileSessionByAdmin,
  listAdminYoupiSessions,
  processIncomingWebhook,
  toPaise,
  toRupeesString
} = require('../../services/payments/youpiGatewayService');
const {
  getAutomationConfig,
  buildSmsGatewayPairingQrData,
  pairAndroidDevice,
  verifyAndroidDeviceHmac,
  listAndroidDevices,
  revokeAndroidDevice,
  deleteAndroidDevice,
  recordAndroidHeartbeat,
  getActivePollWindowStatus,
  ingestBankObservation,
  pollBankInboxOnce,
  reconcileStatementCsv
} = require('../../services/payments/paymentAutomationService');
const { generateQrSvg } = require('../../utils/qrGenerator');
const { MAX_SCAN_CHARS } = require('../../services/payments/bankAlertParserService');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function constantTimeSecretEqual(expected, actual) {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(actual || ''), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function buildPublicOrigin(req) {
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  if (host) return `${proto}://${host}`;
  return `http://localhost:${process.env.PORT || 5000}`;
}

async function authStream(req, res, next) {
  try {
    const header = req.header('Authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const token = bearer || String(req.query.token || '').trim();
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

async function tryAuthenticateAdminOrObserver(req) {
  const cfg = await getAutomationConfig({ includeSecrets: true });
  const authHeader = String(req.headers.authorization || '').trim();
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const suppliedSecret = String(req.headers['x-youpi-observer-secret'] || bearer || '').trim();

  if (cfg.observerSecret && suppliedSecret && constantTimeSecretEqual(cfg.observerSecret, suppliedSecret)) {
    return { authorized: true, kind: 'OBSERVER_SECRET' };
  }

  if (bearer) {
    try {
      const decoded = jwt.verify(bearer, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('role email name');
      if (user && ['admin', 'organizer'].includes(user.role)) {
        return { authorized: true, kind: 'ADMIN_JWT', user };
      }
    } catch {}
  }

  return { authorized: false, cfg };
}

router.get('/config', async (req, res) => {
  const cfg = getYoupiConfig();
  const autoCfg = await getAutomationConfig().catch(() => ({
    autoVerifyEnabled: false,
    fulfillOnObserved: false,
    backupVpas: cfg.backupPayeeVpas,
    imapConfigured: false,
    observerConfigured: false,
    activeWindowMs: cfg.activeDurationMs,
    processingWindowMs: cfg.processingDurationMs,
    gracePeriodMs: 5000
  }));
  res.json({
    gateway: 'YouPI-PG V2',
    gatewayMode: cfg.gatewayMode,
    verificationMode: cfg.verificationMode,
    fulfillOnObserved: false,
    allowDemoUtr: cfg.allowDemoUtr,
    defaultMethod: cfg.defaultMethod,
    vpaConfigured: Boolean(cfg.defaultPayeeVpa),
    defaultPayeeVpa: cfg.defaultPayeeVpa,
    backupVpas: autoCfg.backupVpas || cfg.backupPayeeVpas,
    backupVpaCount: (autoCfg.backupVpas || cfg.backupPayeeVpas || []).length,
    defaultPayeeName: cfg.defaultPayeeName,
    autoVerifyEnabled: Boolean(autoCfg.autoVerifyEnabled),
    automationActive: Boolean(autoCfg.imapConfigured || autoCfg.observerConfigured),
    sessionTtlSeconds: Math.round(cfg.activeDurationMs / 1000),
    activeWindowMs: cfg.activeDurationMs,
    processingWindowMs: cfg.processingDurationMs,
    gracePeriodMs: autoCfg.gracePeriodMs,
    providers: UPI_PROVIDERS,
    allowedNotificationPackagesCount: ALLOWED_NOTIFICATION_PACKAGES.length
  });
});

// NPCI Static (`mode=02`) or Fixed-Amount (`mode=04`) Stand QR Endpoint
router.get('/stand-qr', async (req, res) => {
  try {
    const cfg = getYoupiConfig();
    let vpa = String(req.query.preferredVpa || req.query.vpa || '').trim();
    let payeeName = cfg.defaultPayeeName;
    let tn = sanitizePlainText(req.query.tn || req.query.note || '', 80);

    if (req.query.eventId) {
      const ev = await Event.findById(req.query.eventId)
        .populate('club', 'name')
        .select('title paymentUpiId backupPaymentUpiIds');
      if (ev) {
        if (!vpa && ev.paymentUpiId) vpa = ev.paymentUpiId;
        if (!tn) tn = sanitizePlainText(ev.title, 60);
        if (ev.paymentUpiId && vpa === ev.paymentUpiId && ev.club?.name) {
          payeeName = `${ev.club.name} · Avenor`;
        }
      }
    }

    if (!vpa) vpa = cfg.defaultPayeeVpa;
    if (!vpa || !isValidVpa(vpa)) {
      return res.status(400).json({ code: 'INVALID_VPA', message: 'A valid payee UPI VPA is required for Stand QR.' });
    }

    let amountPaise = null;
    if (req.query.amount !== undefined && String(req.query.amount).trim() !== '') {
      amountPaise = toPaise(req.query.amount);
    }
    const mode = req.query.mode ? String(req.query.mode).trim() : (amountPaise ? '04' : '02');
    const mc = sanitizePlainText(req.query.mc || '', 12);

    const data = await buildStandQrData({
      payeeVpa: vpa,
      payeeName,
      amountPaise,
      merchantCategoryCode: mc,
      mode,
      transactionNote: tn,
      currency: 'INR'
    });

    res.json({
      payeeVpa: vpa,
      payeeName,
      mode,
      amountPaise: amountPaise !== null ? String(amountPaise) : null,
      amount: amountPaise !== null ? toRupeesString(amountPaise) : null,
      upiUri: data.upiUri,
      qrSvg: data.qrSvg
    });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'STAND_QR_ERROR',
      message: err.message || 'Unable to generate Stand QR.'
    });
  }
});

router.get('/youpi.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(`(function (globalScope) {
  'use strict';
  if (globalScope.__AVENOR_YOUPI_SDK__) return;
  globalScope.__AVENOR_YOUPI_SDK__ = true;

  class YoupiCheckout {
    constructor(options) {
      this.options = Object.assign({ checkoutUrl: '', paymentId: '', onSuccess: null, onClose: null }, options || {});
      this._handler = this._onMessage.bind(this);
      this.backdrop = null;
      this.iframe = null;
    }
    static pay(options) {
      var inst = new YoupiCheckout(options);
      inst.open();
      return inst;
    }
    open() {
      var url = this.options.checkoutUrl || ('/api/payments/youpi/portal/' + encodeURIComponent(this.options.paymentId || ''));
      var sep = url.indexOf('?') === -1 ? '?' : '&';
      var iframeUrl = url + sep + 'embedded=1';
      var backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(12,11,9,0.78);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
      var box = document.createElement('div');
      box.style.cssText = 'position:relative;width:460px;max-width:100%;height:640px;max-height:92vh;background:#1c1a18;border:1px solid rgba(239,233,222,0.14);border-radius:16px;overflow:hidden;';
      var iframe = document.createElement('iframe');
      iframe.src = iframeUrl;
      iframe.style.cssText = 'width:100%;height:100%;border:0;background:#161513;';
      box.appendChild(iframe);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);
      this.backdrop = backdrop;
      this.iframe = iframe;
      window.addEventListener('message', this._handler);
    }
    close() {
      window.removeEventListener('message', this._handler);
      if (this.backdrop && this.backdrop.parentNode) this.backdrop.parentNode.removeChild(this.backdrop);
      this.backdrop = null;
      this.iframe = null;
      if (typeof this.options.onClose === 'function') this.options.onClose();
    }
    _onMessage(e) {
      if (!this.iframe || e.source !== this.iframe.contentWindow) return;
      var evt = e.data && e.data.event;
      if (!evt) return;
      if (evt === 'youpi.payment_reconciled' || evt === 'youpi.payment_success') {
        if (typeof this.options.onSuccess === 'function') this.options.onSuccess(e.data.data || e.data);
      } else if (evt === 'youpi.modal_close' || evt === 'youpi.cancel') {
        this.close();
      }
    }
  }
  globalScope.YoupiCheckout = YoupiCheckout;
  globalScope.Youpi = YoupiCheckout;
})(window);`);
});

router.get('/portal/:paymentId', async (req, res) => {
  try {
    const session = await YoupiPaymentSession.findOne({ paymentId: req.params.paymentId });
    if (!session) {
      return res.status(404).send('<h1>YouPI Payment Session Not Found</h1>');
    }

    const eventDoc = await Event.findById(session.event).select('title location date time').lean();
    const isQueued = session.status === PaymentStatus.QUEUED;

    if (!isQueued && !session.qrSvg && session.upiUri) {
      session.qrSvg = await generateQrSvg(session.upiUri, { boxSize: 220 });
      await session.save();
    }

    const qrBase64 = !isQueued && session.qrSvg ? Buffer.from(session.qrSvg, 'utf8').toString('base64') : '';
    const amountStr = toRupeesString(session.amountPaise);
    const nowMs = Date.now();
    const remainingSec =
      session.status === PaymentStatus.PROCESSING && session.processingExpiresAt
        ? Math.max(0, Math.ceil((new Date(session.processingExpiresAt).getTime() - nowMs) / 1000))
        : session.status === PaymentStatus.ACTIVE && session.expiresAt
          ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - nowMs) / 1000))
          : 0;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>YouPI-PG Checkout · ${escapeHtml(session.orderId)}</title>
  <style>
    body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#12110f; color:#efe9de; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; }
    .card { width:100%; max-width:440px; background:#1c1a18; border:1px solid rgba(239,233,222,0.12); border-radius:16px; padding:24px; box-shadow:0 20px 50px rgba(0,0,0,0.45); }
    .top { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(239,233,222,0.08); padding-bottom:14px; margin-bottom:16px; }
    .brand { font-weight:600; color:#ebb05d; font-size:13px; letter-spacing:0.06em; }
    .badge { font-family:monospace; font-size:11px; padding:4px 8px; border-radius:999px; background:#262421; border:1px solid rgba(239,233,222,0.12); color:#efe9de; }
    .amt { font-size:30px; font-weight:700; font-family:monospace; color:#ebb05d; margin:6px 0; }
    .qr-box { background:#ffffff; border-radius:14px; padding:16px; display:flex; flex-direction:column; align-items:center; margin:16px 0; }
    .qr-box img { width:200px; height:200px; display:block; }
    .vpa { font-family:monospace; font-size:13px; background:#161513; padding:10px 12px; border-radius:10px; border:1px solid rgba(239,233,222,0.08); display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .copy-btn { background:#2a2723; color:#ebb05d; border:1px solid rgba(235,176,93,0.35); border-radius:6px; padding:4px 9px; font-size:11px; cursor:pointer; }
    .btn { display:inline-flex; align-items:center; justify-content:center; background:#e09132; color:#12110f; font-weight:600; border:none; border-radius:10px; padding:11px 14px; text-decoration:none; cursor:pointer; font-size:13px; width:100%; margin-top:12px; box-sizing:border-box; }
    .hint { background:rgba(224,145,50,0.08); border:1px solid rgba(224,145,50,0.22); border-radius:10px; padding:10px 12px; font-size:11.5px; color:#d9ceb8; margin-top:12px; line-height:1.45; }
    .muted { font-size:12px; color:#aaa398; line-height:1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div class="brand">AVENOR · YOUPI-PG V2 (${escapeHtml(session.method || 'UPI')})</div>
      <span class="badge">${escapeHtml(session.status)}</span>
    </div>
    <div class="muted">${escapeHtml(eventDoc?.title || 'Avenor Event Pass')}</div>
    <div class="amt">₹${escapeHtml(amountStr)}</div>
    <div class="muted">Order: <code>${escapeHtml(session.orderId)}</code> · Remaining: <span id="timer">${escapeHtml(remainingSec)}s</span></div>
    ${
      isQueued
        ? `<div class="hint"><strong>Queued in FIFO Payment Slot #${escapeHtml(session.queuePosition || 1)}</strong><br/>Another checkout currently holds the exclusive payment slot for this UPI ID. Keep this window open—QR code will reveal automatically as soon as your turn arrives.</div>`
        : session.status === PaymentStatus.OBSERVED_SUCCESS
          ? `<div class="hint"><strong>Bank Alert Observed (NOT_RECONCILED)</strong><br/>UTR: <code>${escapeHtml(session.utr || 'Recorded')}</code>. Awaiting bank statement CSV import or admin reconciliation to unlock your pass.</div>`
          : session.status === PaymentStatus.PROCESSING
            ? `<div class="hint"><strong>Verifying Bank Alert (30s Window)</strong><br/>Listening for official bank SMS/email alert. Do not close this page.</div>`
            : ''
    }
    ${
      qrBase64 && [PaymentStatus.ACTIVE, PaymentStatus.PROCESSING].includes(session.status)
        ? `<div class="qr-box"><img src="data:image/svg+xml;base64,${qrBase64}" alt="UPI QR" /><div style="color:#0f172a;font-size:11px;font-family:monospace;margin-top:6px;">Scan directly with GPay, PhonePe, Paytm or BHIM</div></div>`
        : ''
    }
    ${
      !isQueued
        ? `<div class="vpa">
      <span id="vpa-text">${escapeHtml(session.payeeVpa)}</span>
      <button type="button" class="copy-btn" onclick="navigator.clipboard && navigator.clipboard.writeText(${JSON.stringify(session.payeeVpa).replace(/</g, '\\u003c')}).then(function(){this.textContent='Copied';}.bind(this))">Copy VPA</button>
    </div>`
        : ''
    }
    ${
      !isQueued && session.upiUri && session.status === PaymentStatus.ACTIVE
        ? `<a class="btn" href="${escapeHtml(session.upiUri)}">Open UPI App to Pay ₹${escapeHtml(amountStr)}</a>`
        : ''
    }
    <div class="hint">Pay exact amount <strong>₹${escapeHtml(amountStr)}</strong> using <strong>${escapeHtml(session.payeeVpa)}</strong> before the window closes.</div>
  </div>
  <script>
    var status = ${JSON.stringify(session.status).replace(/</g, '\\u003c')};
    var remaining = ${Number(remainingSec)};
    var timerEl = document.getElementById('timer');
    if ((status === 'ACTIVE' || status === 'PROCESSING') && remaining > 0 && timerEl) {
      setInterval(function () {
        if (remaining > 0) {
          remaining -= 1;
          timerEl.textContent = remaining + 's';
        }
      }, 1000);
    }
    var payload = {
      paymentId: ${JSON.stringify(session.paymentId).replace(/</g, '\\u003c')},
      orderId: ${JSON.stringify(session.orderId).replace(/</g, '\\u003c')},
      amount: ${JSON.stringify(amountStr).replace(/</g, '\\u003c')},
      status: status
    };
    if (window.parent && window.parent !== window) {
      if (status === 'RECONCILED' || status === 'SUCCESS') {
        window.parent.postMessage({ event: 'youpi.payment_reconciled', data: payload }, '*');
      } else if (status === 'OBSERVED_SUCCESS') {
        window.parent.postMessage({ event: 'youpi.payment_observed', data: payload }, '*');
      } else if (status === 'MANUAL_REVIEW') {
        window.parent.postMessage({ event: 'youpi.payment_manual_review', data: payload }, '*');
      }
    }
  </script>
</body>
</html>`);
  } catch {
    res.status(500).send('<h1>Failed to load YouPI checkout portal</h1>');
  }
});

router.post('/sessions', auth, async (req, res) => {
  try {
    const result = await createYoupiPaymentSession({
      eventId: req.body.eventId,
      user: req.user,
      body: req.body,
      req
    });
    res.status(result.reused ? 200 : 201).json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_SESSION_ERROR',
      message: err.message || 'Unable to create YouPI payment session.',
      ...(err.isBanned ? { isBanned: true } : {})
    });
  }
});

router.get('/sessions/:paymentId', auth, async (req, res) => {
  try {
    const session = await syncAndGetYoupiSession({
      paymentId: req.params.paymentId,
      user: req.user
    });
    res.json({ session });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_STATUS_ERROR',
      message: err.message || 'Unable to fetch payment status.'
    });
  }
});

router.get('/sessions/:paymentId/stream', authStream, async (req, res) => {
  try {
    const initial = await syncAndGetYoupiSession({
      paymentId: req.params.paymentId,
      user: req.user
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const sendSessionEvent = dto => {
      try {
        res.write(`event: session\ndata: ${JSON.stringify(dto)}\n\n`);
      } catch {}
    };

    sendSessionEvent(initial);

    const onSessionUpdate = dto => {
      if (dto && dto.paymentId === req.params.paymentId) {
        sendSessionEvent(dto);
      }
    };

    PaymentEventBus.on('session.update', onSessionUpdate);
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {}
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      PaymentEventBus.removeListener('session.update', onSessionUpdate);
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  } catch (err) {
    if (!res.headersSent) {
      res.status(err.status || 400).json({
        code: err.code || 'YOUPI_STREAM_ERROR',
        message: err.message || 'Unable to open live payment stream.'
      });
    }
  }
});

// Immutable receiving account: post-creation VPA switching returns 409 IMMUTABLE_RECEIVING_ACCOUNT
router.post('/sessions/:paymentId/switch-vpa', auth, async (req, res) => {
  try {
    const session = await switchSessionVpa({
      paymentId: req.params.paymentId,
      user: req.user,
      targetVpa: req.body?.targetVpa || ''
    });
    res.json({ session });
  } catch (err) {
    res.status(err.status || 409).json({
      code: err.code || 'IMMUTABLE_RECEIVING_ACCOUNT',
      message: err.message || 'Receiving VPA cannot be changed after checkout session creation.'
    });
  }
});

async function handlePaymentDone(req, res) {
  try {
    const marked = await markSessionProcessing({
      paymentId: req.params.paymentId,
      user: req.user
    });

    let pollSummary = null;
    const autoCfg = await getAutomationConfig();
    if (autoCfg.autoVerifyEnabled && autoCfg.imapConfigured && !marked.session.settled) {
      pollSummary = await pollBankInboxOnce();
    }

    const latestSession = await syncAndGetYoupiSession({
      paymentId: req.params.paymentId,
      user: req.user
    });

    res.json({
      session: latestSession,
      processingExpiresAt: latestSession.processingExpiresAt || marked.processingExpiresAt || null,
      pollSummary
    });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_VERIFY_ERROR',
      message: err.message || 'Unable to start verification.'
    });
  }
}

router.post('/sessions/:paymentId/payment-done', auth, handlePaymentDone);
router.post('/sessions/:paymentId/verify-now', auth, handlePaymentDone);

async function handleManualUtr(req, res) {
  try {
    const result = await submitUtrAndProcessSession({
      paymentId: req.params.paymentId,
      user: req.user,
      body: req.body
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_UTR_ERROR',
      message: err.message || 'Unable to submit UPI / UTR reference.'
    });
  }
}

router.post('/sessions/:paymentId/manual-utr', auth, handleManualUtr);
router.post('/sessions/:paymentId/submit-utr', auth, handleManualUtr);

router.post('/sessions/:paymentId/cancel', auth, async (req, res) => {
  try {
    const session = await cancelYoupiSession({
      paymentId: req.params.paymentId,
      user: req.user
    });
    res.json({ session });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_CANCEL_ERROR',
      message: err.message || 'Unable to cancel session.'
    });
  }
});

// =============================================================================
// Pollers, Android SMS Gateway & Observer Ingest Routes (Exact Upstream Spec)
// =============================================================================

async function handleAndroidPair(req, res) {
  try {
    const result = await pairAndroidDevice({
      token: req.body?.token,
      enrollmentToken: req.body?.enrollmentToken,
      expiresAt: req.body?.expiresAt,
      version: req.body?.version,
      deviceName: req.body?.deviceName,
      deviceModel: req.body?.deviceModel,
      receivingAccountId: req.body?.receivingAccountId || ''
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'ANDROID_PAIR_ERROR',
      message: err.message || 'Failed to pair Android SMS Gateway.'
    });
  }
}

router.post('/pollers/android/pair', handleAndroidPair);
router.post('/observers/sms/pair', handleAndroidPair);

async function handleAndroidEvents(req, res, { requirePackage = false } = {}) {
  try {
    const rawBodyText =
      typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || {});
    const deviceId = req.headers['x-device-id'] || req.body?.deviceId;
    const device = await verifyAndroidDeviceHmac({
      deviceId,
      timestampHeader: req.headers['x-timestamp'],
      signatureHeader: req.headers['x-signature'],
      rawBodyText
    });

    const clientMessageEcho = req.body?.clientMessageId
      ? { clientMessageId: String(req.body.clientMessageId) }
      : {};
    const rawPkg = req.body?.rawNotification?.package || req.body?.packageName;

    if (requirePackage) {
      if (!rawPkg || typeof rawPkg !== 'string' || !rawPkg.trim()) {
        return res.status(400).json({
          accepted: false,
          ...clientMessageEcho,
          error: 'Android notification observation must specify a valid package name in rawNotification.package'
        });
      }
    }

    if (rawPkg && typeof rawPkg === 'string' && rawPkg.trim()) {
      const cleanPkg = rawPkg.trim().toLowerCase();
      if (!isAllowedNotificationPackage(cleanPkg)) {
        return res.status(400).json({
          accepted: false,
          ...clientMessageEcho,
          error: `Untrusted Android notification package: ${cleanPkg}`
        });
      }
    }

    const rawText =
      req.body?.body ||
      req.body?.sms ||
      req.body?.rawSms ||
      req.body?.message ||
      req.body?.text ||
      req.body?.rawText ||
      req.body?.rawNotification?.text ||
      '';

    if (!rawText || !String(rawText).trim()) {
      return res.status(400).json({
        accepted: false,
        ...clientMessageEcho,
        status: 'REJECTED',
        reason: 'MISSING_RAW_TEXT',
        error: 'Observation rawText is required for verification.'
      });
    }

    if (String(rawText).length > MAX_SCAN_CHARS) {
      return res.status(413).json({
        ...clientMessageEcho,
        error: `Observation body too large (max ${MAX_SCAN_CHARS} characters).`
      });
    }

    const recAccId = req.body?.receivingAccountId || device.receivingAccountId || '';
    const sender =
      req.body?.sender ||
      req.headers['x-sender'] ||
      req.body?.rawNotification?.package ||
      '';

    const result = await ingestBankObservation({
      source: requirePackage ? 'ANDROID_OBSERVER' : req.body?.source || 'SMS_GATEWAY',
      sender,
      rawText: String(rawText),
      observedAt: req.body?.observedAt || req.body?.timestamp || new Date(),
      receivingAccountId: recAccId,
      paymentSessionId: req.body?.paymentSessionId || '',
      bankReferenceNumber: req.body?.bankReferenceNumber || req.body?.utr || '',
      explicitAmountPaise: req.body?.amountPaise ? Number(req.body.amountPaise) : null,
      rawPayload: req.body?.rawNotification || { text: rawText, deviceId: device.deviceId }
    });

    await YoupiAndroidDevice.updateOne(
      { _id: device._id },
      { $set: { lastObservationAt: new Date() } }
    ).catch(() => {});

    if (result.status === 'FRAUDULENT_PAYMENT_INJECTION' || result.status === 'BANNED_IDENTITY') {
      return res.status(403).json({
        accepted: false,
        ...clientMessageEcho,
        status: 'REJECTED',
        reason: result.status,
        threatDetected: true,
        banned: true,
        error: 'FRAUDULENT_PAYMENT_INJECTION: Fake bank observation detected. Customer identity suspended.'
      });
    }

    if (result.accepted) {
      return res.json({
        accepted: true,
        ...clientMessageEcho,
        status: result.status,
        verificationLevel: result.verificationLevel || 1,
        verificationTag: result.verificationTag || '',
        observationId: result.observation?._id?.toString(),
        matchedOrderId: result.observation?.matchedOrderId || ''
      });
    }

    if (result.status === 'AMBIGUOUS' || result.status === 'MANUAL_REVIEW') {
      return res.json({
        accepted: false,
        ...clientMessageEcho,
        status: 'MANUAL_REVIEW',
        reason: result.reason || 'AMBIGUOUS_SESSION_MATCH',
        observationId: result.observation?._id?.toString()
      });
    }

    if (result.status === 'LATE_UNMATCHED') {
      return res.json({
        accepted: false,
        ...clientMessageEcho,
        status: 'LATE_UNMATCHED',
        reason: 'LATE_OBSERVATION_NO_ACTIVE_SESSION',
        observationId: result.observation?._id?.toString()
      });
    }

    if (result.status === 'IGNORED_NON_CREDIT') {
      return res.json({
        accepted: true,
        ...clientMessageEcho,
        status: 'PROCESSED_NON_BANK',
        bankMatch: false,
        message: 'Raw SMS observation ingested and evaluated by server pipeline.'
      });
    }

    return res.status(400).json({
      accepted: false,
      ...clientMessageEcho,
      status: result.status || 'REJECTED',
      reason: result.reason || result.observation?.reason || 'UNRESOLVED_OBSERVATION'
    });
  } catch (err) {
    res.status(err.status || 400).json({
      accepted: false,
      code: err.code || 'ANDROID_EVENT_ERROR',
      error: err.message || 'Failed to process Android SMS Gateway observation.'
    });
  }
}

router.post('/pollers/android/events', (req, res) =>
  handleAndroidEvents(req, res, { requirePackage: true })
);
router.post('/observers/sms', (req, res) =>
  handleAndroidEvents(req, res, { requirePackage: false })
);

router.post('/pollers/events', async (req, res) => {
  try {
    const deviceIdHeader = req.headers['x-device-id'];
    if (deviceIdHeader) {
      return handleAndroidEvents(req, res, { requirePackage: false });
    }

    const authCheck = await tryAuthenticateAdminOrObserver(req);
    if (!authCheck.authorized) {
      return res.status(401).json({
        accepted: false,
        code: 'AUTH_REQUIRED',
        message: 'Observer secret, admin token, or paired Android device HMAC signature is required.'
      });
    }

    const rawText =
      req.body?.rawText ||
      req.body?.text ||
      req.body?.message ||
      req.body?.sms ||
      req.body?.body ||
      '';
    if (!rawText || !String(rawText).trim()) {
      return res.status(400).json({
        accepted: false,
        status: 'REJECTED',
        reason: 'MISSING_RAW_TEXT'
      });
    }
    if (String(rawText).length > MAX_SCAN_CHARS) {
      return res.status(413).json({
        accepted: false,
        reason: 'PAYLOAD_TOO_LARGE',
        error: `Observation body exceeds max ${MAX_SCAN_CHARS} characters.`
      });
    }

    const result = await ingestBankObservation({
      source: req.body?.source || 'GMAIL',
      sender: req.body?.sender || req.body?.from || '',
      subject: req.body?.subject || '',
      rawText: String(rawText),
      observedAt: req.body?.observedAt || req.body?.receivedAt || new Date(),
      receivingAccountId: req.body?.receivingAccountId || '',
      paymentSessionId: req.body?.paymentSessionId || '',
      bankReferenceNumber: req.body?.bankReferenceNumber || req.body?.utr || '',
      messageKey: req.body?.messageKey || req.body?.clientMessageId || '',
      suppressBan: Boolean(req.body?.suppressBan && authCheck.kind === 'ADMIN_JWT'),
      rawPayload: req.body?.rawPayload || null
    });

    if (result.status === 'FRAUDULENT_PAYMENT_INJECTION' || result.status === 'BANNED_IDENTITY') {
      return res.status(403).json({
        accepted: false,
        status: 'REJECTED',
        reason: result.status,
        threatDetected: true,
        banned: true
      });
    }

    if (result.accepted || ['MANUAL_REVIEW', 'AMBIGUOUS', 'LATE_UNMATCHED'].includes(result.status)) {
      return res.json({
        accepted: Boolean(result.accepted),
        status: result.status,
        reason: result.reason || result.observation?.reason || '',
        verificationLevel: result.verificationLevel || null,
        verificationTag: result.verificationTag || '',
        observationId: result.observation?._id?.toString()
      });
    }

    return res.status(400).json({
      accepted: false,
      status: result.status,
      reason: result.reason || result.observation?.reason || 'UNRESOLVED_OBSERVATION'
    });
  } catch (err) {
    res.status(err.status || 400).json({
      accepted: false,
      code: err.code || 'POLLER_EVENT_ERROR',
      message: err.message || 'Failed to ingest poller event.'
    });
  }
});

async function handleHeartbeat(req, res) {
  const result = await recordAndroidHeartbeat(req.headers['x-device-id'] || req.body?.deviceId || '');
  res.json(result);
}

router.post('/pollers/android/heartbeat', handleHeartbeat);
router.post('/pollers/heartbeat', handleHeartbeat);
router.post('/observers/heartbeat', handleHeartbeat);

router.get('/pollers/active-window', async (req, res) => {
  try {
    const authCheck = await tryAuthenticateAdminOrObserver(req);
    const deviceId = req.headers['x-device-id'];
    let boundRecId = '';

    if (deviceId) {
      const device = await YoupiAndroidDevice.findOne({ deviceId: String(deviceId).trim(), isActive: true }).lean();
      if (!device) {
        return res.status(403).json({ code: 'DEVICE_UNAUTHORIZED', error: 'Device not authorized or inactive.' });
      }
      boundRecId = device.receivingAccountId || '';
    } else if (!authCheck.authorized) {
      return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Unauthorized' });
    }

    const requestedAcc = req.query.receivingAccountId
      ? normalizeReceivingAccountId(req.query.receivingAccountId)
      : '';
    if (boundRecId && requestedAcc && requestedAcc !== boundRecId) {
      return res.status(403).json({ code: 'CROSS_ACCOUNT_FORBIDDEN', error: 'Cross-account query forbidden.' });
    }

    const windowData = await getActivePollWindowStatus({
      receivingAccountId: requestedAcc || boundRecId
    });
    res.json(windowData);
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'ACTIVE_WINDOW_ERROR',
      message: err.message || 'Failed to inspect active poll window.'
    });
  }
});

async function handleObserverWebhook(req, res) {
  try {
    const cfg = await getAutomationConfig({ includeSecrets: true });
    if (!cfg.observerSecret) {
      return res.status(503).json({
        received: false,
        code: 'OBSERVER_SECRET_NOT_CONFIGURED',
        message: 'Bank observer secret is not configured. Generate one in Admin → YouPI Payments.'
      });
    }

    const authHeader = String(req.headers.authorization || '').trim();
    const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const suppliedSecret = String(req.headers['x-youpi-observer-secret'] || bearerSecret || '').trim();

    if (!constantTimeSecretEqual(cfg.observerSecret, suppliedSecret)) {
      return res.status(401).json({
        received: false,
        code: 'INVALID_OBSERVER_SECRET',
        message: 'Invalid YouPI bank observer secret.'
      });
    }

    const sourceHint = String(req.body?.source || '').toUpperCase();
    const source =
      req.path.endsWith('/sms') || sourceHint === 'SMS_OBSERVER' ? 'SMS_OBSERVER' : 'GMAIL';

    const result = await ingestBankObservation({
      source,
      sender: String(req.body?.sender || req.body?.from || '').trim(),
      subject: String(req.body?.subject || '').trim(),
      text: String(req.body?.text || req.body?.body || req.body?.message || '').trim(),
      observedAt: req.body?.timestamp || req.body?.observedAt || new Date(),
      receivingAccountId: String(req.body?.receivingAccountId || '').trim(),
      paymentSessionId: String(req.body?.paymentSessionId || '').trim(),
      messageKey: String(req.body?.messageKey || req.body?.id || '').trim()
    });

    if (result.status === 'FRAUDULENT_PAYMENT_INJECTION' || result.status === 'BANNED_IDENTITY') {
      return res.status(403).json({
        received: true,
        accepted: false,
        status: result.status,
        threatDetected: true,
        banned: true,
        reason: result.reason || 'FRAUDULENT_PAYMENT_INJECTION'
      });
    }

    res.status(200).json({
      received: true,
      accepted: Boolean(result.accepted),
      duplicate: Boolean(result.duplicate),
      status: result.status,
      reason: result.reason || result.observation?.reason || '',
      matchedOrderId: result.observation?.matchedOrderId || ''
    });
  } catch (err) {
    res.status(err.status || 400).json({
      received: false,
      code: err.code || 'OBSERVER_INGEST_ERROR',
      message: err.message || 'Failed to ingest bank alert.'
    });
  }
}

router.post('/observer/alert', handleObserverWebhook);
router.post('/observer/sms', handleObserverWebhook);

// =============================================================================
// Admin Ledger, Queue Monitor, SMS Gateway Devices, Statement CSV & Fraud Unban
// =============================================================================

router.get('/admin/sessions', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const sessions = await listAdminYoupiSessions({
      user: req.user,
      statusFilter: req.query.status || ''
    });
    res.json({ sessions });
  } catch (err) {
    res.status(err.status || 500).json({
      code: err.code || 'YOUPI_ADMIN_LIST_ERROR',
      message: err.message || 'Failed to load YouPI payment ledger.'
    });
  }
});

router.get('/admin/queue', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const cfg = getYoupiConfig();
    const recAcc = normalizeReceivingAccountId(req.query.receivingAccountId || cfg.defaultPayeeVpa);
    const [activeHolder, queued] = await Promise.all([
      YoupiPaymentSession.findOne({
        ...(recAcc ? { receivingAccountId: recAcc } : {}),
        slotLockActive: true
      })
        .populate('event', 'title')
        .select('paymentId orderId amountPaise status method payeeVpa slotAcquiredAt expiresAt processingExpiresAt')
        .lean(),
      YoupiPaymentSession.find({
        ...(recAcc ? { receivingAccountId: recAcc } : {}),
        status: PaymentStatus.QUEUED
      })
        .populate('event', 'title')
        .sort({ queuePosition: 1, createdAt: 1 })
        .select('paymentId orderId amountPaise method payeeVpa queuePosition createdAt')
        .lean()
    ]);

    res.json({
      receivingAccountId: recAcc,
      currentSlot: activeHolder || null,
      queue: queued
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to load FIFO payment queue.' });
  }
});

router.get('/admin/automation', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const [config, observations, openCount, devices, suspendedCount, statementLineCount] = await Promise.all([
      getAutomationConfig({ includeSecrets: false }),
      YoupiBankObservation.find().sort({ createdAt: -1 }).limit(30).lean(),
      YoupiPaymentSession.countDocuments({
        status: { $in: ['ACTIVE', 'PROCESSING', 'QUEUED', 'OBSERVED_SUCCESS', 'MANUAL_REVIEW'] }
      }),
      listAndroidDevices(),
      User.countDocuments({ paymentSecurityStatus: 'SUSPENDED' }),
      YoupiStatementLine.countDocuments({})
    ]);
    res.json({
      config,
      observations,
      devices,
      suspendedCount,
      statementLineCount,
      openSessionCount: openCount
    });
  } catch (err) {
    res.status(err.status || 500).json({
      code: err.code || 'YOUPI_AUTOMATION_STATUS_ERROR',
      message: err.message || 'Failed to load automation settings.'
    });
  }
});

router.put('/admin/automation', auth, authorize('admin'), async (req, res) => {
  try {
    const body = req.body || {};
    const updateFields = {};

    if (body.backupVpas !== undefined) {
      updateFields.youpiBackupVpas = parseVpaList(body.backupVpas);
    }
    if (body.autoVerifyEnabled !== undefined) {
      updateFields.youpiAutoVerifyEnabled = Boolean(body.autoVerifyEnabled);
    }
    if (body.imapHost !== undefined) {
      updateFields.youpiImapHost = sanitizePlainText(body.imapHost, 120) || 'imap.gmail.com';
    }
    if (body.imapPort !== undefined) {
      const p = Number(body.imapPort);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return res.status(400).json({ message: 'IMAP port must be between 1 and 65535.' });
      }
      updateFields.youpiImapPort = p;
    }
    if (body.imapUser !== undefined) {
      updateFields.youpiImapUser = String(body.imapUser || '').trim().toLowerCase();
    }
    if (body.clearImapPass) {
      updateFields.youpiImapPass = '';
    } else if (typeof body.imapPass === 'string' && body.imapPass.trim() !== '') {
      updateFields.youpiImapPass = body.imapPass.trim();
    }

    let generatedObserverSecret = '';
    if (body.generateObserverSecret) {
      generatedObserverSecret = crypto.randomBytes(24).toString('hex');
      updateFields.youpiObserverSecret = generatedObserverSecret;
    } else if (body.clearObserverSecret) {
      updateFields.youpiObserverSecret = '';
    } else if (typeof body.observerSecret === 'string' && body.observerSecret.trim() !== '') {
      updateFields.youpiObserverSecret = body.observerSecret.trim();
    }

    let generatedEnrollmentSecret = '';
    if (body.generateAndroidEnrollmentSecret) {
      generatedEnrollmentSecret = crypto.randomBytes(24).toString('hex');
      updateFields.youpiAndroidEnrollmentSecret = generatedEnrollmentSecret;
    } else if (typeof body.androidEnrollmentSecret === 'string' && body.androidEnrollmentSecret.trim() !== '') {
      updateFields.youpiAndroidEnrollmentSecret = body.androidEnrollmentSecret.trim();
    }

    await SystemSetting.findOneAndUpdate(
      { key: 'global' },
      { $set: updateFields },
      { upsert: true, new: true }
    );

    const config = await getAutomationConfig({ includeSecrets: false });
    res.json({
      message: 'YouPI payment automation & Zero-Trust settings saved.',
      config,
      ...(generatedObserverSecret ? { generatedObserverSecret } : {}),
      ...(generatedEnrollmentSecret ? { generatedEnrollmentSecret } : {})
    });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_AUTOMATION_SAVE_ERROR',
      message: err.message || 'Failed to save automation settings.'
    });
  }
});

router.post('/admin/poll-now', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const summary = await pollBankInboxOnce({ force: true });
    const [config, observations] = await Promise.all([
      getAutomationConfig({ includeSecrets: false }),
      YoupiBankObservation.find().sort({ createdAt: -1 }).limit(30).lean()
    ]);
    res.json({ summary, config, observations });
  } catch (err) {
    res.status(err.status || 500).json({
      code: err.code || 'YOUPI_POLL_ERROR',
      message: err.message || 'Failed to poll bank alert inbox.'
    });
  }
});

async function handleStatementImport(req, res) {
  try {
    const csvText =
      typeof req.body?.csv === 'string'
        ? req.body.csv
        : typeof req.body?.csvText === 'string'
          ? req.body.csvText
          : '';
    if (!csvText.trim()) {
      return res.status(400).json({ message: 'Please upload or paste a bank statement CSV.' });
    }
    const receivingAccountId = String(req.body?.receivingAccountId || '').trim();
    const summary = await reconcileStatementCsv({
      receivingAccountId,
      csvText,
      adminUser: req.user
    });
    const observations = await YoupiBankObservation.find().sort({ createdAt: -1 }).limit(30).lean();
    res.json({
      summary,
      reconciled: summary.reconciled,
      conflicts: summary.conflicts,
      unmatched: summary.unmatched,
      lines: summary.lines,
      observations
    });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_CSV_RECONCILE_ERROR',
      message: err.message || 'Failed to reconcile CSV statement.'
    });
  }
}

router.post('/admin/reconcile-csv', auth, authorize('admin', 'organizer'), handleStatementImport);
router.post('/admin/statements/import', auth, authorize('admin', 'organizer'), handleStatementImport);

// Android SMS Gateway Admin Routes
router.get('/admin/sms-gateway/pair-qr', auth, authorize('admin'), async (req, res) => {
  try {
    const data = await buildSmsGatewayPairingQrData({
      receivingAccountId: req.query.receivingAccountId || '',
      baseUrl: buildPublicOrigin(req)
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate pairing QR.' });
  }
});

router.get('/admin/sms-gateway/devices', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const devices = await listAndroidDevices();
    res.json({ devices });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to load paired Android observers.' });
  }
});

router.post('/admin/sms-gateway/devices/:deviceId/revoke', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await revokeAndroidDevice(req.params.deviceId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to revoke device.' });
  }
});

router.delete('/admin/sms-gateway/devices/:deviceId', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await deleteAndroidDevice(req.params.deviceId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to delete device.' });
  }
});

// Fraud Security & Account Unban Routes
router.get('/admin/security/suspended', auth, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find({ paymentSecurityStatus: { $in: ['SUSPENDED', 'FLAGGED'] } })
      .select('name email role department paymentSecurityStatus paymentSecurityReason updatedAt')
      .sort({ updatedAt: -1 })
      .lean();
    const recentFraudObs = await YoupiBankObservation.find({ attributionStatus: 'REJECTED_FRAUD' })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json({ suspendedUsers: users, recentFraudObservations: recentFraudObs });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to load suspended payment identities.' });
  }
});

router.post('/admin/security/unban', auth, authorize('admin'), async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ message: 'userId is required to lift payment security suspension.' });
    }
    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { paymentSecurityStatus: 'CLEAR', paymentSecurityReason: '' } },
      { new: true }
    ).select('name email role paymentSecurityStatus');
    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ success: true, user: updated, message: `Cleared security suspension for ${updated.email}.` });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Failed to unban user.' });
  }
});

router.post('/admin/sessions/:paymentId/reconcile', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const result = await reconcileSessionByAdmin({
      paymentId: req.params.paymentId,
      action: req.body.action,
      adminUser: req.user,
      note: req.body.note || ''
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_RECONCILE_ERROR',
      message: err.message || 'Failed to reconcile YouPI session.'
    });
  }
});

async function handleYoupiWebhook(req, res) {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {});

    const result = await processIncomingWebhook({
      rawBody,
      signatureHeader: req.headers['x-gateway-signature-v2'] || req.headers['x-gateway-signature'],
      timestampHeader: req.headers['x-gateway-timestamp'] || null,
      deliveryIdHeader: req.headers['x-gateway-delivery-id'] || null
    });

    res.status(200).json({
      received: true,
      duplicate: Boolean(result.duplicate),
      deliveryId: result.deliveryId,
      event: result.event,
      status: result.session?.status || null
    });
  } catch (err) {
    res.status(err.status || 400).json({
      received: false,
      code: err.code || 'WEBHOOK_VERIFICATION_FAILED',
      message: err.message || 'Invalid webhook delivery'
    });
  }
}

module.exports = router;
module.exports.handleYoupiWebhook = handleYoupiWebhook;
