const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { auth, authorize } = require('../../middleware/auth');
const User = require('../../models/auth/User');
const SystemSetting = require('../../models/system/SystemSetting');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const YoupiBankObservation = require('../../models/payments/YoupiBankObservation');
const Event = require('../../models/events/Event');
const { sanitizePlainText } = require('../../utils/sanitize');
const {
  PaymentEventBus,
  UPI_PROVIDERS,
  getYoupiConfig,
  parseVpaList,
  createYoupiPaymentSession,
  syncAndGetYoupiSession,
  submitUtrAndProcessSession,
  switchSessionVpa,
  markSessionProcessing,
  cancelYoupiSession,
  reconcileSessionByAdmin,
  listAdminYoupiSessions,
  processIncomingWebhook,
  toRupeesString
} = require('../../services/payments/youpiGatewayService');
const {
  getAutomationConfig,
  ingestBankObservation,
  pollBankInboxOnce,
  reconcileStatementCsv
} = require('../../services/payments/paymentAutomationService');
const { generateQrSvg } = require('../../utils/qrGenerator');

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

router.get('/config', async (req, res) => {
  const cfg = getYoupiConfig();
  const autoCfg = await getAutomationConfig().catch(() => ({
    autoVerifyEnabled: false,
    autoReconcileObserved: true,
    backupVpas: cfg.backupPayeeVpas,
    imapConfigured: false,
    observerConfigured: false
  }));
  res.json({
    gateway: 'YouPI-PG V2',
    gatewayMode: cfg.gatewayMode,
    verificationMode: cfg.verificationMode,
    fulfillOnObserved: cfg.fulfillOnObserved,
    allowDemoUtr: cfg.allowDemoUtr,
    defaultMethod: cfg.defaultMethod,
    vpaConfigured: Boolean(cfg.defaultPayeeVpa),
    defaultPayeeVpa: cfg.defaultPayeeVpa,
    backupVpas: autoCfg.backupVpas || cfg.backupPayeeVpas,
    backupVpaCount: (autoCfg.backupVpas || cfg.backupPayeeVpas || []).length,
    defaultPayeeName: cfg.defaultPayeeName,
    autoVerifyEnabled: Boolean(autoCfg.autoVerifyEnabled),
    autoReconcileObserved: Boolean(autoCfg.autoReconcileObserved),
    automationActive: Boolean(autoCfg.imapConfigured || autoCfg.observerConfigured),
    sessionTtlSeconds: Math.round(cfg.sessionTtlMs / 1000),
    providers: UPI_PROVIDERS
  });
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
      if (evt === 'youpi.payment_reconciled' || evt === 'youpi.payment_success' || evt === 'youpi.payment_observed') {
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
    if (!session.qrSvg && session.upiUri) {
      session.qrSvg = await generateQrSvg(session.upiUri, { boxSize: 220 });
      await session.save();
    }

    const qrBase64 = session.qrSvg ? Buffer.from(session.qrSvg, 'utf8').toString('base64') : '';
    const amountStr = toRupeesString(session.amountPaise);
    const remainingSec =
      ['ACTIVE', 'PROCESSING'].includes(session.status) && session.expiresAt
        ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000))
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
      <div class="brand">AVENOR · YOUPI-PG V2</div>
      <span class="badge">${escapeHtml(session.status)}</span>
    </div>
    <div class="muted">${escapeHtml(eventDoc?.title || 'Avenor Event Pass')}</div>
    <div class="amt">₹${escapeHtml(amountStr)}</div>
    <div class="muted">Order: <code>${escapeHtml(session.orderId)}</code> · Remaining: <span id="timer">${escapeHtml(remainingSec)}s</span></div>
    ${
      qrBase64
        ? `<div class="qr-box"><img src="data:image/svg+xml;base64,${qrBase64}" alt="UPI QR" /><div style="color:#0f172a;font-size:11px;font-family:monospace;margin-top:6px;">Scan directly with GPay, PhonePe, Paytm or BHIM</div></div>`
        : ''
    }
    <div class="vpa">
      <span id="vpa-text">${escapeHtml(session.payeeVpa)}</span>
      <button type="button" class="copy-btn" onclick="navigator.clipboard && navigator.clipboard.writeText(${JSON.stringify(session.payeeVpa).replace(/</g, '\\u003c')}).then(function(){this.textContent='Copied';}.bind(this))">Copy VPA</button>
    </div>
    ${
      session.upiUri
        ? `<a class="btn" href="${escapeHtml(session.upiUri)}">Open UPI App to Pay ₹${escapeHtml(amountStr)}</a>`
        : ''
    }
    <div class="hint">Seeing GPay "Day limit exceeded"? Copy the UPI ID above, open Google Pay → <strong>Pay UPI ID or number</strong> manually, or switch to an alternate UPI ID inside Avenor Checkout.</div>
    <p class="muted" style="margin-top:12px;">Once paid, Avenor auto-verifies bank alerts or you can submit your 12-digit UTR to unlock your pass &amp; linked competitions.</p>
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
      } else if (status === 'MANUAL_REVIEW') {
        window.parent.postMessage({ event: 'youpi.payment_manual_review', data: payload }, '*');
      }
    }
  </script>
</body>
</html>`);
  } catch (err) {
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
      message: err.message || 'Unable to create YouPI payment session.'
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

router.post('/sessions/:paymentId/switch-vpa', auth, async (req, res) => {
  try {
    const session = await switchSessionVpa({
      paymentId: req.params.paymentId,
      user: req.user,
      targetVpa: req.body?.targetVpa || ''
    });
    res.json({ session });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_VPA_SWITCH_ERROR',
      message: err.message || 'Unable to switch merchant UPI VPA.'
    });
  }
});

router.post('/sessions/:paymentId/verify-now', auth, async (req, res) => {
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
      pollSummary
    });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_VERIFY_ERROR',
      message: err.message || 'Unable to start verification.'
    });
  }
});

router.post('/sessions/:paymentId/submit-utr', auth, async (req, res) => {
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
      message: err.message || 'Unable to verify UPI / UTR reference.'
    });
  }
});

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
      req.path.endsWith('/sms') || sourceHint === 'SMS_OBSERVER' ? 'SMS_OBSERVER' : 'IMAP_EMAIL';

    const result = await ingestBankObservation({
      source,
      sender: String(req.body?.sender || req.body?.from || '').trim(),
      subject: String(req.body?.subject || '').trim(),
      text: String(req.body?.text || req.body?.body || req.body?.message || '').trim(),
      observedAt: req.body?.timestamp || req.body?.observedAt || new Date(),
      messageKey: String(req.body?.messageKey || req.body?.id || '').trim()
    });

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

router.get('/admin/automation', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const [config, observations, openCount] = await Promise.all([
      getAutomationConfig({ includeSecrets: false }),
      YoupiBankObservation.find().sort({ createdAt: -1 }).limit(30).lean(),
      YoupiPaymentSession.countDocuments({ status: { $in: ['ACTIVE', 'PROCESSING', 'MANUAL_REVIEW'] } })
    ]);
    res.json({
      config,
      observations,
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
    if (body.autoReconcileObserved !== undefined) {
      updateFields.youpiAutoReconcileObserved = Boolean(body.autoReconcileObserved);
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

    await SystemSetting.findOneAndUpdate(
      { key: 'global' },
      { $set: updateFields },
      { upsert: true, new: true }
    );

    const config = await getAutomationConfig({ includeSecrets: false });
    res.json({
      message: 'YouPI payment automation & backup UPI settings saved.',
      config,
      ...(generatedObserverSecret ? { generatedObserverSecret } : {})
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

router.post('/admin/reconcile-csv', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    if (!csvText.trim()) {
      return res.status(400).json({ message: 'Please upload or paste a bank statement CSV.' });
    }
    const summary = await reconcileStatementCsv({ csvText, adminUser: req.user });
    const observations = await YoupiBankObservation.find().sort({ createdAt: -1 }).limit(30).lean();
    res.json({ summary, observations });
  } catch (err) {
    res.status(err.status || 400).json({
      code: err.code || 'YOUPI_CSV_RECONCILE_ERROR',
      message: err.message || 'Failed to reconcile CSV statement.'
    });
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
