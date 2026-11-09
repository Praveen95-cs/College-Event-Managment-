import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { getBackendUrl } from '../../utils/apiConfig';
import {
  CheckCircleIcon,
  XMarkIcon,
  CalendarDaysIcon,
  MapPinIcon,
  TicketIcon,
  CurrencyRupeeIcon,
  ClipboardDocumentIcon,
  ShieldCheckIcon,
  ClockIcon,
  ArrowPathIcon,
  ArrowUpRightIcon,
  ExclamationTriangleIcon,
  QrCodeIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

function formatCountdown(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function buildExternalIframeUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    parsed.searchParams.set('embedded', '1');
    parsed.searchParams.set('youpiParentOrigin', window.location.origin);
    return parsed.toString();
  } catch {
    const sep = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${sep}embedded=1&youpiParentOrigin=${encodeURIComponent(window.location.origin)}`;
  }
}

const EventRegistration = ({ event, initialSession = null, onClose, onRegistered }) => {
  const { user } = useAuth();
  const backendUrl = getBackendUrl();

  const fee = Number(event?.registrationFee || 0);
  const currency = event?.currency || 'INR';
  const currencySymbol = currency === 'INR' ? '₹' : `${currency} `;
  const isPaidEvent = Boolean(event?.isPaid && fee > 0);

  const accountEmail = user?.email || '';
  const isStudentAccount = user?.role === 'student';

  const [formData, setFormData] = useState({
    name: initialSession?.customerName || user?.name || '',
    regNo: initialSession?.customerRegNo || (accountEmail ? accountEmail.split('@')[0] : ''),
    email: initialSession?.customerEmail || accountEmail,
    needsAccommodation: Boolean(initialSession?.needsAccommodation)
  });
  const [youpiSession, setYoupiSession] = useState(initialSession || null);
  const [gatewayConfig, setGatewayConfig] = useState(null);
  const [utr, setUtr] = useState(initialSession?.utr || '');
  const [upiCopied, setUpiCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(initialSession?.timeRemainingSeconds || 0);

  const [loading, setLoading] = useState(false);
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [pollingStatus, setPollingStatus] = useState(false);
  const [error, setError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(
    Boolean(initialSession?.settled && initialSession?.registration)
  );
  const [confirmedRegistration, setConfirmedRegistration] = useState(
    initialSession?.settled ? initialSession?.registration || null : null
  );
  const [confirmedWhatsappLink, setConfirmedWhatsappLink] = useState(
    initialSession?.settled ? initialSession?.whatsappGroupLink || event?.whatsappGroupLink || '' : ''
  );
  const [confirmedEmailTarget, setConfirmedEmailTarget] = useState(
    initialSession?.settled
      ? initialSession?.customerEmail || initialSession?.registration?.email || accountEmail || ''
      : ''
  );

  const effectiveEmail = isStudentAccount ? accountEmail : (formData.email.trim() || accountEmail);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'email' && isStudentAccount) return;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Fetch gateway mode config so pre-checkout UI accurately reflects external vs embedded mode
  useEffect(() => {
    if (!isPaidEvent || initialSession) return undefined;
    let active = true;
    axios
      .get(`${backendUrl}/api/payments/youpi/config`)
      .then((res) => {
        if (active && res.data) setGatewayConfig(res.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [backendUrl, initialSession, isPaidEvent]);

  // Apply resumed session (e.g. returned from external checkout ?youpiOrder= callback)
  useEffect(() => {
    if (!initialSession?.paymentId) return;
    setYoupiSession(initialSession);
    if (initialSession.utr) setUtr(initialSession.utr);
    if (initialSession.settled && initialSession.registration) {
      setConfirmedRegistration(initialSession.registration);
      setConfirmedWhatsappLink(initialSession.whatsappGroupLink || event?.whatsappGroupLink || '');
      setConfirmedEmailTarget(
        initialSession.customerEmail ||
          initialSession.registration?.email ||
          accountEmail ||
          ''
      );
      setBookingSuccess(true);
    }
  }, [accountEmail, event?.whatsappGroupLink, initialSession]);

  // Sync live countdown timer from server expiresAt
  useEffect(() => {
    if (!youpiSession?.expiresAt || youpiSession.status !== 'ACTIVE') {
      setSecondsLeft(youpiSession?.timeRemainingSeconds || 0);
      return undefined;
    }
    const updateRemaining = () => {
      const rem = Math.max(
        0,
        Math.ceil((new Date(youpiSession.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(rem);
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [youpiSession?.expiresAt, youpiSession?.status, youpiSession?.timeRemainingSeconds]);

  const handleRefreshStatus = useCallback(
    async (silent = false) => {
      if (!youpiSession?.paymentId) return;
      try {
        if (!silent) setPollingStatus(true);
        const token = localStorage.getItem('token');
        const res = await axios.get(
          `${backendUrl}/api/payments/youpi/sessions/${youpiSession.paymentId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const nextSession = res.data?.session;
        if (!nextSession) return;
        const prevStatus = youpiSession?.status;
        setYoupiSession(nextSession);
        if (nextSession.settled && nextSession.registration) {
          setConfirmedRegistration(nextSession.registration);
          setConfirmedWhatsappLink(nextSession.whatsappGroupLink || event?.whatsappGroupLink || '');
          setConfirmedEmailTarget(
            nextSession.customerEmail || nextSession.registration?.email || effectiveEmail || ''
          );
          setBookingSuccess(true);
          onRegistered?.(nextSession.registration);
        } else if (
          nextSession.status === 'MANUAL_REVIEW' &&
          nextSession.registration &&
          prevStatus !== 'MANUAL_REVIEW'
        ) {
          onRegistered?.(nextSession.registration);
        }
      } catch (err) {
        if (!silent) {
          setError(err.response?.data?.message || 'Unable to sync payment status with YouPI-PG.');
        }
      } finally {
        if (!silent) setPollingStatus(false);
      }
    },
    [
      backendUrl,
      effectiveEmail,
      event?.whatsappGroupLink,
      onRegistered,
      youpiSession?.paymentId,
      youpiSession?.status
    ]
  );

  // Listen for YouPI-PG portal postMessage & poll external gateway sessions automatically
  useEffect(() => {
    if (!youpiSession?.paymentId || bookingSuccess) return undefined;

    let expectedOrigin = '';
    if (youpiSession.checkoutUrl) {
      try {
        expectedOrigin = new URL(youpiSession.checkoutUrl, window.location.origin).origin;
      } catch {
        expectedOrigin = '';
      }
    }

    const onMessage = (e) => {
      if (expectedOrigin && e.origin && e.origin !== expectedOrigin) return;
      const evt = e?.data?.event;
      if (!evt || typeof evt !== 'string' || !evt.startsWith('youpi.')) return;
      if (
        [
          'youpi.payment_reconciled',
          'youpi.payment_success',
          'youpi.payment_observed',
          'youpi.payment_manual_review',
          'youpi.payment_failed',
          'youpi.payment_expired',
          'youpi.payment_cancelled',
          'youpi.payment_blocked'
        ].includes(evt)
      ) {
        handleRefreshStatus(false);
      } else if (
        ['youpi.cancel', 'youpi.modal_close', 'youpi.close', 'youpi.payment_blocked_exit'].includes(
          evt
        )
      ) {
        handleRefreshStatus(false);
      }
    };
    window.addEventListener('message', onMessage);

    let pollInterval;
    if (
      (youpiSession.gatewayMode === 'external' &&
        ['INITIATED', 'ACTIVE', 'QUEUED', 'PROCESSING'].includes(youpiSession.status)) ||
      youpiSession.status === 'MANUAL_REVIEW'
    ) {
      pollInterval = setInterval(() => {
        handleRefreshStatus(true);
      }, 5000);
    }

    return () => {
      window.removeEventListener('message', onMessage);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [
    bookingSuccess,
    handleRefreshStatus,
    youpiSession?.checkoutUrl,
    youpiSession?.gatewayMode,
    youpiSession?.paymentId,
    youpiSession?.status
  ]);

  const handleCopyUpi = async () => {
    const vpa = youpiSession?.payeeVpa || event?.paymentUpiId || '';
    if (!vpa) {
      setError('Merchant UPI ID is not configured for this event.');
      return;
    }
    try {
      await navigator.clipboard.writeText(vpa);
      setUpiCopied(true);
      setTimeout(() => setUpiCopied(false), 1800);
    } catch {
      window.prompt('Copy UPI ID:', vpa);
    }
  };

  const handleFillDemoUtr = () => {
    const suffix = Date.now().toString().slice(-8);
    setUtr(`4128${suffix}`);
    setError('');
  };

  const createOrRestartYoupiSession = async (forceNew = false) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please log in to register for events');
      return;
    }
    try {
      setError('');
      setLoading(true);
      const response = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions`,
        {
          eventId: event._id,
          name: formData.name.trim() || user?.name || 'Attendee',
          regNo: formData.regNo.trim(),
          email: effectiveEmail,
          needsAccommodation: formData.needsAccommodation,
          forceNew
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const session = response.data?.session;
      if (!session) {
        setError('Could not initialize YouPI-PG checkout session.');
        return;
      }

      setYoupiSession(session);
      if (session.utr) setUtr(session.utr);
      if (session.settled && session.registration) {
        setConfirmedRegistration(session.registration);
        setConfirmedWhatsappLink(session.whatsappGroupLink || event?.whatsappGroupLink || '');
        setConfirmedEmailTarget(
          session.customerEmail || session.registration?.email || effectiveEmail || ''
        );
        setBookingSuccess(true);
        onRegistered?.(session.registration);
      }
    } catch (err) {
      console.error('YouPI session initialization error:', err);
      setError(
        err.response?.data?.message ||
          'Failed to start YouPI-PG checkout session. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFreeSubmit = async (e) => {
    e.preventDefault();
    if (isPaidEvent) {
      await createOrRestartYoupiSession(false);
      return;
    }

    try {
      setError('');
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to register for events');
        return;
      }

      setLoading(true);
      const response = await axios.post(
        `${backendUrl}/api/events/${event._id}/pay-and-register`,
        {
          eventId: event._id,
          name: formData.name.trim() || user?.name || 'Attendee',
          regNo: formData.regNo.trim(),
          email: effectiveEmail,
          needsAccommodation: formData.needsAccommodation
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const reg = response.data.registration || response.data;
      setConfirmedRegistration(reg);
      setConfirmedWhatsappLink(response.data.whatsappGroupLink || event?.whatsappGroupLink || '');
      setConfirmedEmailTarget(response.data.emailRecipient || reg?.email || effectiveEmail || '');
      setBookingSuccess(true);
      onRegistered?.(reg);
    } catch (err) {
      console.error('Error registering for event:', err);
      setError(
        err.response?.data?.message ||
          'Failed to complete registration. Please check your details and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitUtr = async (e) => {
    e.preventDefault();
    if (!youpiSession?.paymentId) return;
    const cleaned = utr.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9-]{6,35}$/.test(cleaned)) {
      setError('Enter a valid 6–35 character UPI / UTR reference number.');
      return;
    }

    try {
      setError('');
      setSubmittingUtr(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${youpiSession.paymentId}/submit-utr`,
        {
          utr: cleaned,
          name: formData.name.trim(),
          regNo: formData.regNo.trim(),
          email: effectiveEmail,
          needsAccommodation: formData.needsAccommodation
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const nextSession = res.data?.session;
      const reg = res.data?.registration;
      if (nextSession) setYoupiSession(nextSession);

      if (nextSession?.settled && reg) {
        setConfirmedRegistration(reg);
        setConfirmedWhatsappLink(nextSession.whatsappGroupLink || event?.whatsappGroupLink || '');
        setConfirmedEmailTarget(
          nextSession.customerEmail || reg?.email || effectiveEmail || ''
        );
        setBookingSuccess(true);
        onRegistered?.(reg);
      } else if (nextSession?.status === 'MANUAL_REVIEW' && reg) {
        onRegistered?.(reg);
      }
    } catch (err) {
      console.error('YouPI UTR verification error:', err);
      setError(err.response?.data?.message || 'UTR verification failed. Check the reference ID.');
    } finally {
      setSubmittingUtr(false);
    }
  };

  const handleCancelSession = async () => {
    if (!youpiSession?.paymentId) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${youpiSession.paymentId}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      // Ignore cancel cleanup errors
    } finally {
      setYoupiSession(null);
      setUtr('');
      setError('');
      onRegistered?.(null);
    }
  };

  const formattedDate = event.date
    ? new Date(event.date).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '';

  const isSessionExpired =
    youpiSession &&
    (youpiSession.status === 'EXPIRED' ||
      (youpiSession.status === 'ACTIVE' && youpiSession.expiresAt && secondsLeft <= 0));
  const isSessionTerminalError =
    youpiSession && ['FAILED', 'CANCELLED'].includes(youpiSession.status);
  const isExternalIframeActive = Boolean(
    !bookingSuccess &&
      youpiSession?.gatewayMode === 'external' &&
      youpiSession?.checkoutUrl &&
      !isSessionExpired &&
      !isSessionTerminalError &&
      youpiSession?.status !== 'MANUAL_REVIEW'
  );
  const externalIframeSrc = isExternalIframeActive
    ? buildExternalIframeUrl(youpiSession.checkoutUrl)
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div
        className={`bg-[#1c1a18] border border-[#efe9de]/[0.12] rounded-[16px] p-6 sm:p-7 ${
          isExternalIframeActive ? 'max-w-3xl' : 'max-w-lg'
        } w-full shadow-[0_16px_48px_rgba(0,0,0,0.5)] relative my-auto transition-all`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-[8px] text-[#8a847a] hover:text-[#efe9de] hover:bg-[#262421] transition-colors duration-150"
          aria-label="Close modal"
        >
          <XMarkIcon className="h-5 w-5" strokeWidth={1.5} />
        </button>

        {bookingSuccess ? (
          <div className="py-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-[10px] bg-[#4cc38a]/15 border border-[#4cc38a]/30 text-[#4cc38a] shrink-0">
                <CheckCircleIcon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-[20px] font-medium text-[#efe9de]">
                  {isPaidEvent ? 'YouPI payment & registration confirmed' : 'Registration confirmed'}
                </h3>
                <p className="text-[13px] text-[#aaa398]">
                  Seat reserved for <span className="text-[#efe9de] font-medium">{event.title}</span>.
                </p>
              </div>
            </div>

            <div className="mt-5 bg-[#161513] border border-[#efe9de]/[0.08] rounded-[10px] p-4 space-y-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-2 text-[12px] text-[#8a847a] pb-2 border-b border-[#efe9de]/[0.06]">
                <span className="inline-flex items-center gap-2">
                  <TicketIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                  <span>Pass &amp; receipt details</span>
                </span>
                {isPaidEvent && (
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25">
                    YOUPI-PG VERIFIED
                  </span>
                )}
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Attendee</span>
                <span className="font-medium text-[#efe9de] text-right">{formData.name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Registration number</span>
                <span className="font-mono text-[#ebb05d] tabular-nums">
                  {confirmedRegistration?.regNo || formData.regNo || confirmedRegistration?._id || 'CONFIRMED'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Admission</span>
                {isPaidEvent ? (
                  <span className="font-mono font-medium text-[#4cc38a]">
                    Paid {currencySymbol}
                    {confirmedRegistration?.amountPaid || fee}
                  </span>
                ) : (
                  <span className="font-medium text-[#4cc38a]">Free</span>
                )}
              </div>
              {isPaidEvent && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#8a847a]">Gateway</span>
                    <span className="font-mono uppercase text-[#efe9de]">
                      {confirmedRegistration?.paymentMethod || 'youpi'}
                    </span>
                  </div>
                  {(confirmedRegistration?.youpiOrderId || youpiSession?.orderId) && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#8a847a]">YouPI Order ID</span>
                      <span className="font-mono text-[#efe9de] truncate max-w-[230px]">
                        {confirmedRegistration?.youpiOrderId || youpiSession?.orderId}
                      </span>
                    </div>
                  )}
                  {confirmedRegistration?.transactionId && (
                    <div className="flex justify-between gap-2">
                      <span className="text-[#8a847a]">UTR / Transaction Ref</span>
                      <span className="font-mono text-[#ebb05d] truncate max-w-[230px]">
                        {confirmedRegistration.transactionId}
                      </span>
                    </div>
                  )}
                </>
              )}
              {formData.needsAccommodation && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#8a847a]">Accommodation</span>
                  <span className="text-[#ebb05d]">Requested</span>
                </div>
              )}
              {(confirmedEmailTarget || confirmedRegistration?.email || effectiveEmail) && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#8a847a]">Confirmation email</span>
                  <span className="text-[#efe9de] truncate max-w-[230px]">
                    {confirmedEmailTarget || confirmedRegistration?.email || effectiveEmail}
                  </span>
                </div>
              )}
            </div>

            {confirmedWhatsappLink && (
              <div className="mt-4 rounded-[12px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-[#4cc38a] shrink-0 mt-0.5" strokeWidth={1.75} />
                  <div>
                    <p className="text-[13px] font-medium text-[#efe9de]">
                      Event WhatsApp group unlocked
                    </p>
                    <p className="text-[12px] text-[#aaa398]">
                      Join the official attendee group for venue updates and coordination.
                    </p>
                  </div>
                </div>
                <a
                  href={confirmedWhatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[8px] text-[12px] font-medium bg-[#4cc38a] text-[#12110f] hover:bg-[#5cd199] transition-colors shrink-0"
                >
                  <span>Join WhatsApp Group</span>
                  <ArrowUpRightIcon className="h-3.5 w-3.5" strokeWidth={2} />
                </a>
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link to="/profile" className="btn-primary flex-1 h-10 text-[13px]">
                View in profile
              </Link>
              <button type="button" onClick={onClose} className="btn-secondary flex-1 h-10 text-[13px]">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="pr-8 mb-5">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] text-[12px] font-medium border mb-2 ${
                  isPaidEvent
                    ? 'bg-[#e09132]/15 border-[#e09132]/30 text-[#ebb05d]'
                    : 'bg-[#262421] border-[#efe9de]/[0.08] text-[#4cc38a]'
                }`}
              >
                {isPaidEvent && <CurrencyRupeeIcon className="h-3.5 w-3.5" strokeWidth={1.75} />}
                <span>
                  {isPaidEvent
                    ? `YouPI-PG paid event pass · ${currencySymbol}${fee}`
                    : 'Free event registration'}
                </span>
              </span>
              <h2 className="text-[20px] font-medium text-[#efe9de] leading-snug">{event.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#aaa398] font-mono tabular-nums">
                {formattedDate && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDaysIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                    {formattedDate} {event.time && `· ${event.time}`}
                  </span>
                )}
                {event.location && (
                  <span className="flex items-center gap-1.5 font-sans">
                    <MapPinIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                    {event.location}
                  </span>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
                {error}
              </div>
            )}

            {!youpiSession ? (
              <form onSubmit={handleFreeSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5" htmlFor="name">
                      Full name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      placeholder="Your full name"
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5" htmlFor="regNo">
                      Registration / Roll no.
                    </label>
                    <input
                      type="text"
                      id="regNo"
                      name="regNo"
                      value={formData.regNo}
                      onChange={handleInputChange}
                      required
                      placeholder="e.g. 21CS045"
                      className="input-field font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="block text-[13px] font-medium text-[#aaa398]" htmlFor="regEmail">
                      Student confirmation email *
                    </label>
                    {isStudentAccount && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25">
                        Account email locked
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="email"
                      id="regEmail"
                      name="email"
                      value={effectiveEmail}
                      onChange={handleInputChange}
                      readOnly={isStudentAccount}
                      required
                      placeholder="student@college.edu"
                      className={`input-field pr-10 ${isStudentAccount ? 'opacity-80 cursor-not-allowed bg-[#12110f]' : ''}`}
                    />
                    <EnvelopeIcon className="h-4 w-4 text-[#8a847a] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.5} />
                  </div>
                  <p className="mt-1 text-[11px] text-[#8a847a]">
                    Your digital pass confirmation{isPaidEvent ? ', YouPI payment receipt,' : ''}{' '}
                    {event?.hasWhatsappGroup || event?.whatsappGroupLink ? 'and WhatsApp group invite ' : ''}will be mailed directly to your verified student email ID.
                  </p>
                </div>

                {isPaidEvent && (
                  <div className="rounded-[12px] bg-[#161513] border border-[#e09132]/30 p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheckIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.75} />
                        <span className="text-[13px] font-medium text-[#efe9de]">
                          Powered by YouPI-PG V2
                        </span>
                      </div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25">
                        0% transaction fee
                      </span>
                    </div>
                    <p className="text-[12px] text-[#aaa398] leading-relaxed">
                      {gatewayConfig?.gatewayMode === 'external' ? (
                        <>
                          Next step opens the dedicated YouPI-PG V2 checkout gateway for{' '}
                          <strong className="font-mono text-[#efe9de]">{currencySymbol}{fee}</strong>
                          . Complete your UPI payment and submit the transaction UTR inside the gateway to unlock this event pass and linked competitions.
                        </>
                      ) : (
                        <>
                          Next step generates a dynamic ISO/IEC 18004 UPI QR code, app intents, and cryptographic HMAC webhook session for{' '}
                          <strong className="font-mono text-[#efe9de]">{currencySymbol}{fee}</strong>{' '}
                          to unlock this event pass and linked competitions.
                        </>
                      )}
                    </p>
                    {gatewayConfig?.gatewayMode === 'external' && !gatewayConfig?.externalConfigured && (
                      <p className="text-[11px] text-[#ebb05d]">
                        Note: External YouPI-PG credentials (`YOUPI_API_URL`, `YOUPI_MERCHANT_ID`, `YOUPI_MERCHANT_KEY`, `YOUPI_WEBHOOK_SECRET`) must be configured on the backend before starting checkout.
                      </p>
                    )}
                    {(event?.hasWhatsappGroup || event?.whatsappGroupLink) && (
                      <p className="text-[12px] text-[#4cc38a] flex items-center gap-1.5 pt-0.5">
                        <ChatBubbleLeftRightIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        <span>Includes official event WhatsApp group link (revealed after payment verification).</span>
                      </p>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-[#aaa398] select-none pt-1">
                  <input
                    type="checkbox"
                    name="needsAccommodation"
                    checked={formData.needsAccommodation}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132] focus:ring-offset-[#1c1a18]"
                  />
                  <span>I require campus accommodation assistance</span>
                </label>

                <div className="pt-4 border-t border-[#efe9de]/[0.08] flex justify-end gap-3">
                  <button type="button" onClick={onClose} className="btn-secondary h-10 px-4 text-[13px]">
                    Cancel
                  </button>
                  <button type="submit" disabled={loading} className="btn-primary h-10 px-5 text-[13px]">
                    {loading
                      ? isPaidEvent
                        ? 'Initializing YouPI...'
                        : 'Confirming...'
                      : isPaidEvent
                        ? `Pay via YouPI-PG · ${currencySymbol}${fee}`
                        : 'Confirm registration'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {/* YouPI Session Status Bar */}
                <div className="rounded-[10px] bg-[#161513] border border-[#e09132]/30 p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <QrCodeIcon className="h-4 w-4 text-[#ebb05d] shrink-0" strokeWidth={1.75} />
                      <span className="text-[13px] font-medium text-[#efe9de]">YouPI-PG V2</span>
                      <span className="px-1.5 py-0.5 rounded-[5px] text-[10px] font-mono bg-[#262421] text-[#aaa398] border border-[#efe9de]/[0.08]">
                        {youpiSession.gatewayMode === 'external' ? 'GATEWAY' : 'UPI QR'}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[#8a847a] truncate mt-1">
                      Order: {youpiSession.orderId} · {currencySymbol}
                      {youpiSession.amountDisplay}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {youpiSession.status === 'ACTIVE' && !isSessionExpired && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-mono tabular-nums bg-[#262421] text-[#ebb05d] border border-[#e09132]/30">
                        <ClockIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        <span>{formatCountdown(secondsLeft)}</span>
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 rounded-[6px] text-[11px] font-mono border ${
                        youpiSession.status === 'MANUAL_REVIEW'
                          ? 'bg-[#e09132]/15 text-[#ebb05d] border-[#e09132]/35'
                          : isSessionExpired || isSessionTerminalError
                            ? 'bg-[#e5484d]/15 text-[#e5484d] border-[#e5484d]/35'
                            : 'bg-[#4cc38a]/12 text-[#4cc38a] border-[#4cc38a]/25'
                      }`}
                    >
                      {isSessionExpired ? 'EXPIRED' : youpiSession.status}
                    </span>
                  </div>
                </div>

                {/* Expired / Failed / Cancelled state */}
                {isSessionExpired || isSessionTerminalError ? (
                  <div className="rounded-[12px] bg-[#e5484d]/10 border border-[#e5484d]/30 p-4 space-y-3">
                    <div className="flex items-start gap-2.5 text-[#efe9de]">
                      <ExclamationTriangleIcon className="h-5 w-5 text-[#e5484d] shrink-0 mt-0.5" strokeWidth={1.75} />
                      <div className="text-[13px]">
                        <p className="font-medium text-[#e5484d]">
                          {isSessionExpired
                            ? 'YouPI checkout window timed out'
                            : `Session ${youpiSession.status.toLowerCase()}`}
                        </p>
                        <p className="text-[#aaa398] mt-1">
                          {youpiSession.failureReason ||
                            'UPI checkout sessions stay open for 5 minutes to keep transaction matching conflict-free.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => createOrRestartYoupiSession(true)}
                      disabled={loading}
                      className="btn-primary w-full h-10 text-[13px]"
                    >
                      {loading ? 'Creating session...' : 'Start fresh YouPI session'}
                    </button>
                  </div>
                ) : youpiSession.status === 'MANUAL_REVIEW' ? (
                  /* Manual Bank Review state */
                  <div className="rounded-[12px] bg-[#161513] border border-[#e09132]/35 p-4 space-y-3 text-[13px]">
                    <div className="flex items-start gap-2.5">
                      <ClockIcon className="h-5 w-5 text-[#ebb05d] shrink-0 mt-0.5" strokeWidth={1.75} />
                      <div>
                        <p className="font-medium text-[#efe9de]">
                          UTR submitted · awaiting reconciliation
                        </p>
                        <p className="text-[12px] text-[#aaa398] mt-1">
                          Reference <span className="font-mono text-[#ebb05d]">{youpiSession.utr}</span> has been recorded. Once an organizer or admin reconciles this payment, your pass and linked competitions unlock automatically.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleRefreshStatus(false)}
                        disabled={pollingStatus}
                        className="btn-primary flex-1 h-9 text-[12px]"
                      >
                        <ArrowPathIcon
                          className={`h-4 w-4 ${pollingStatus ? 'animate-spin' : ''}`}
                          strokeWidth={1.75}
                        />
                        <span>{pollingStatus ? 'Checking...' : 'Check verification status'}</span>
                      </button>
                      {youpiSession.gatewayMode === 'external' && youpiSession.checkoutUrl ? (
                        <a
                          href={youpiSession.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary h-9 px-3 text-[12px] inline-flex items-center gap-1"
                        >
                          <span>View portal status</span>
                          <ArrowUpRightIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => createOrRestartYoupiSession(true)}
                          className="btn-secondary h-9 px-3 text-[12px]"
                        >
                          Retry new UTR
                        </button>
                      )}
                    </div>
                  </div>
                ) : youpiSession.gatewayMode === 'external' && youpiSession.checkoutUrl ? (
                  /* External YouPI-PG Hosted Checkout Gateway */
                  <div className="space-y-3">
                    <div className="rounded-[12px] overflow-hidden border border-[#efe9de]/[0.12] bg-[#12110f] h-[520px] max-h-[62vh]">
                      <iframe
                        src={externalIframeSrc}
                        title="YouPI-PG Hosted Checkout"
                        className="w-full h-full border-0"
                        allow="payment"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <a
                          href={youpiSession.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary h-9 px-3 text-[12px] inline-flex items-center gap-1.5 text-[#ebb05d]"
                        >
                          <span>Open external checkout portal</span>
                          <ArrowUpRightIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </a>
                        <button
                          type="button"
                          onClick={handleCancelSession}
                          className="text-[12px] text-[#8a847a] hover:text-[#e5484d] transition-colors"
                        >
                          Cancel session &amp; edit details
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRefreshStatus(false)}
                        disabled={pollingStatus}
                        className="btn-primary h-9 px-4 text-[12px]"
                      >
                        <ArrowPathIcon
                          className={`h-3.5 w-3.5 ${pollingStatus ? 'animate-spin' : ''}`}
                          strokeWidth={1.75}
                        />
                        <span>{pollingStatus ? 'Syncing...' : 'Sync payment status'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Embedded YouPI-PG V2 QR + App Intents + UTR Webhook Verification */
                  <form onSubmit={handleSubmitUtr} className="space-y-3.5">
                    {youpiSession.qrSvg && (
                      <div className="rounded-[12px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 flex flex-col sm:flex-row items-center gap-4">
                        <div className="bg-white p-2.5 rounded-[10px] shrink-0 shadow-sm">
                          <img
                            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(youpiSession.qrSvg)}`}
                            alt={`YouPI UPI QR for ${youpiSession.orderId}`}
                            className="w-36 h-36 block"
                          />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2.5 text-[12px]">
                          <div>
                            <span className="block text-[11px] text-[#8a847a]">Pay to UPI ID (scan QR with any UPI app)</span>
                            {youpiSession.payeeName && (
                              <span className="block text-[12px] font-medium text-[#efe9de] mt-0.5">
                                Banking name: <span className="text-[#ebb05d]">{youpiSession.payeeName}</span>
                              </span>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono text-[13px] text-[#efe9de] break-all">
                                {youpiSession.payeeVpa}
                              </span>
                              <button
                                type="button"
                                onClick={handleCopyUpi}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-[#262421] hover:bg-[#302d29] text-[#efe9de] border border-[#efe9de]/[0.08] shrink-0"
                              >
                                <ClipboardDocumentIcon className="h-3.5 w-3.5 text-[#ebb05d]" strokeWidth={1.5} />
                                <span>{upiCopied ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          </div>

                          <div className="text-[11px] font-mono text-[#8a847a]">
                            Slot: {youpiSession.queuePosition === 0 ? 'Active immediate slot' : `Concurrent #${youpiSession.queuePosition + 1}`}
                          </div>

                          {youpiSession.upiAppIntents?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {youpiSession.upiAppIntents.slice(0, 4).map((app) => (
                                <a
                                  key={app.id}
                                  href={app.upiUri}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#262421] hover:bg-[#302d29] text-[#efe9de] border border-[#efe9de]/[0.08] text-[11px] transition-colors"
                                >
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: app.brandColor }}
                                  />
                                  <span>{app.shortName}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {youpiSession.paymentInstructions && (
                      <p className="text-[12px] text-[#aaa398] leading-relaxed">
                        {youpiSession.paymentInstructions}
                      </p>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="utr" className="text-[12px] font-medium text-[#aaa398]">
                          Enter real 12-digit UPI / UTR reference after paying *
                        </label>
                        {youpiSession?.allowDemoUtr && (
                          <button
                            type="button"
                            onClick={handleFillDemoUtr}
                            className="text-[11px] font-mono text-[#ebb05d] hover:underline"
                          >
                            Fill dev test UTR
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        id="utr"
                        value={utr}
                        onChange={(e) => setUtr(e.target.value)}
                        required
                        placeholder="e.g. 412895123456 (12-digit UTR)"
                        className="input-field font-mono text-[13px]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8a847a]">
                      {youpiSession.checkoutUrl ? (
                        <a
                          href={youpiSession.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#aaa398] hover:text-[#ebb05d] transition-colors"
                        >
                          <span>Hosted YouPI portal</span>
                          <ArrowUpRightIcon className="h-3 w-3" strokeWidth={1.75} />
                        </a>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={handleCancelSession}
                        className="text-[#8a847a] hover:text-[#e5484d] transition-colors"
                      >
                        Cancel session &amp; edit details
                      </button>
                    </div>

                    <div className="pt-3 border-t border-[#efe9de]/[0.08] flex justify-end gap-3">
                      <button type="button" onClick={onClose} className="btn-secondary h-10 px-4 text-[13px]">
                        Close
                      </button>
                      <button type="submit" disabled={submittingUtr} className="btn-primary h-10 px-5 text-[13px]">
                        {submittingUtr ? 'Verifying via YouPI...' : `Verify & confirm ${currencySymbol}${fee}`}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventRegistration;
