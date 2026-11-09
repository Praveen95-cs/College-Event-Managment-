const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../../middleware/auth');
const YoupiPaymentSession = require('../../models/payments/YoupiPaymentSession');
const Event = require('../../models/events/Event');
const {
  UPI_PROVIDERS,
  getYoupiConfig,
  createYoupiPaymentSession,
  syncAndGetYoupiSession,
  submitUtrAndProcessSession,
  cancelYoupiSession,
  reconcileSessionByAdmin,
  listAdminYoupiSessions,
  processIncomingWebhook,
  toRupeesString
} = require('../../services/payments/youpiGatewayService');
const { generateQrSvg } = require('../../utils/qrGenerator');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.get('/config', (req, res) => {
  const cfg = getYoupiConfig();
  res.json({
    gateway: 'YouPI-PG V2',
    gatewayMode: cfg.gatewayMode,
    verificationMode: cfg.verificationMode,
    fulfillOnObserved: cfg.fulfillOnObserved,
    allowDemoUtr: cfg.allowDemoUtr,
    defaultMethod: cfg.defaultMethod,
    vpaConfigured: Boolean(cfg.defaultPayeeVpa),
    defaultPayeeVpa: cfg.defaultPayeeVpa,
    defaultPayeeName: cfg.defaultPayeeName,
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
      session.status === 'ACTIVE' && session.expiresAt
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
    .brand { font-weight:600; color:#ebb05d; font-size:14px; letter-spacing:0.03em; }
    .badge { font-family:monospace; font-size:12px; padding:4px 8px; border-radius:6px; background:#262421; border:1px solid rgba(239,233,222,0.1); color:#efe9de; }
    .amt { font-size:28px; font-weight:600; font-family:monospace; color:#ebb05d; margin:6px 0; }
    .qr-box { background:#ffffff; border-radius:12px; padding:14px; display:flex; flex-direction:column; align-items:center; margin:16px 0; }
    .qr-box img { width:200px; height:200px; display:block; }
    .vpa { font-family:monospace; font-size:13px; background:#161513; padding:10px 12px; border-radius:8px; border:1px solid rgba(239,233,222,0.08); display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .btn { display:inline-flex; align-items:center; justify-content:center; background:#e09132; color:#12110f; font-weight:600; border:none; border-radius:8px; padding:10px 14px; text-decoration:none; cursor:pointer; font-size:13px; width:100%; margin-top:12px; box-sizing:border-box; }
    .muted { font-size:12px; color:#aaa398; line-height:1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div class="brand">YOUPI-PG V2 GATEWAY</div>
      <span class="badge">${escapeHtml(session.status)}</span>
    </div>
    <div class="muted">${escapeHtml(eventDoc?.title || 'Avenor Event Pass')}</div>
    <div class="amt">${escapeHtml(session.currency)} ${escapeHtml(amountStr)}</div>
    <div class="muted">Order: <code>${escapeHtml(session.orderId)}</code> · Remaining: <span id="timer">${escapeHtml(remainingSec)}s</span></div>
    ${
      qrBase64
        ? `<div class="qr-box"><img src="data:image/svg+xml;base64,${qrBase64}" alt="UPI QR" /><div style="color:#0f172a;font-size:11px;font-family:monospace;margin-top:6px;">Scan with any UPI app</div></div>`
        : ''
    }
    <div class="vpa">
      <span>${escapeHtml(session.payeeVpa)}</span>
      <span class="muted">0% fee</span>
    </div>
    ${
      session.upiUri
        ? `<a class="btn" href="${escapeHtml(session.upiUri)}">Open UPI App to Pay ₹${escapeHtml(amountStr)}</a>`
        : ''
    }
    <p class="muted" style="margin-top:14px;">Return to your Avenor checkout modal and enter your 12-digit UTR to confirm registration &amp; unlock linked competitions.</p>
  </div>
  <script>
    var status = ${JSON.stringify(session.status).replace(/</g, '\\u003c')};
    var remaining = ${Number(remainingSec)};
    var timerEl = document.getElementById('timer');
    if (status === 'ACTIVE' && remaining > 0 && timerEl) {
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
