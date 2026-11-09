import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  ShieldExclamationIcon,
  ClockIcon,
  ArrowPathIcon,
  ArrowUpRightIcon,
  ExclamationTriangleIcon,
  QrCodeIcon,
  QueueListIcon,
  LockClosedIcon,
  BoltIcon,
  DocumentCheckIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline';
import { Link, useNavigate } from 'react-router-dom';

function formatCountdown(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const EventRegistration = ({ event, onClose, onRegistered }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();

  const fee = Number(event?.registrationFee || 0);
  const currency = event?.currency || 'INR';
  const currencySymbol = currency === 'INR' ? '₹' : `${currency} `;
  const isPaidEvent = Boolean(event?.isPaid && fee > 0);

  const accountEmail = user?.email || '';
  const isStudentAccount = user?.role === 'student';

  const [youpiConfig, setYoupiConfig] = useState(null);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    regNo: accountEmail ? accountEmail.split('@')[0] : '',
    email: accountEmail,
    needsAccommodation: false,
    method: 'UPI',
    preferredVpa: ''
  });
  const [youpiSession, setYoupiSession] = useState(null);
  const [bannedError, setBannedError] = useState('');
  const [utr, setUtr] = useState('');
  const [upiCopied, setUpiCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [loading, setLoading] = useState(false);
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [verifyingNow, setVerifyingNow] = useState(false);
  const [pollingStatus, setPollingStatus] = useState(false);
  const [error, setError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [confirmedRegistration, setConfirmedRegistration] = useState(null);
  const [confirmedWhatsappLink, setConfirmedWhatsappLink] = useState('');
  const [confirmedEmailTarget, setConfirmedEmailTarget] = useState('');

  const effectiveEmail = isStudentAccount ? accountEmail : (formData.email.trim() || accountEmail);

  useEffect(() => {
    if (!isPaidEvent) return undefined;
    let cancelled = false;
    axios
      .get(`${backendUrl}/api/payments/youpi/config`)
      .then((res) => {
        if (!cancelled && res.data) {
          setYoupiConfig(res.data);
          if (res.data.defaultMethod) {
            setFormData((p) => ({ ...p, method: res.data.defaultMethod }));
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [backendUrl, isPaidEvent]);

  const availableVpaOptions = useMemo(() => {
    const raw = [
      event?.paymentUpiId,
      ...(Array.isArray(event?.backupPaymentUpiIds) ? event.backupPaymentUpiIds : []),
      youpiConfig?.defaultPayeeVpa,
      ...(Array.isArray(youpiConfig?.backupVpas) ? youpiConfig.backupVpas : [])
    ];
    const seen = new Set();
    const list = [];
    for (const item of raw) {
      const clean = String(item || '').trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(clean);
    }
    return list;
  }, [event?.backupPaymentUpiIds, event?.paymentUpiId, youpiConfig?.backupVpas, youpiConfig?.defaultPayeeVpa]);

  const effectivePreferredVpa =
    (formData.preferredVpa &&
    (availableVpaOptions.length === 0 ||
      availableVpaOptions.some((v) => v.toLowerCase() === formData.preferredVpa.toLowerCase()))
      ? formData.preferredVpa
      : availableVpaOptions[0]) || '';

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'email' && isStudentAccount) return;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Sync live countdown timer from server expiresAt / processingExpiresAt
  useEffect(() => {
    const targetIso =
      youpiSession?.status === 'PROCESSING'
        ? youpiSession?.processingExpiresAt
        : youpiSession?.expiresAt;
    if (!targetIso || !['ACTIVE', 'PROCESSING'].includes(youpiSession?.status)) {
      setSecondsLeft(youpiSession?.timeRemainingSeconds || 0);
      return undefined;
    }
    const updateRemaining = () => {
      const rem = Math.max(0, Math.ceil((new Date(targetIso).getTime() - Date.now()) / 1000));
      setSecondsLeft(rem);
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [youpiSession?.expiresAt, youpiSession?.processingExpiresAt, youpiSession?.status, youpiSession?.timeRemainingSeconds]);

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
        if (nextSession.status === 'BLOCKED' || nextSession.isBanned || nextSession.fraudDetected) {
          setBannedError(
            nextSession.blockedNotice?.message ||
              'Access restricted due to suspicious payment observation activity. Contact Admin.'
          );
        }
        setYoupiSession(nextSession);
        if (nextSession.settled && nextSession.registration) {
          setConfirmedRegistration(nextSession.registration);
          setConfirmedWhatsappLink(nextSession.whatsappGroupLink || event?.whatsappGroupLink || '');
          setConfirmedEmailTarget(
            nextSession.customerEmail || nextSession.registration?.email || effectiveEmail || ''
          );
          setBookingSuccess(true);
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
    [backendUrl, effectiveEmail, event?.whatsappGroupLink, onRegistered, youpiSession?.paymentId]
  );

  // Listen for YouPI-PG portal postMessage & poll inline sessions
  useEffect(() => {
    if (!youpiSession?.paymentId || bookingSuccess) return undefined;

    const onMessage = (e) => {
      const evt = e?.data?.event;
      if (!evt || typeof evt !== 'string' || !evt.startsWith('youpi.')) return;
      if (
        [
          'youpi.payment_reconciled',
          'youpi.payment_success',
          'youpi.payment_observed',
          'youpi.payment_manual_review',
          'youpi.payment_failed',
          'youpi.payment_expired'
        ].includes(evt)
      ) {
        handleRefreshStatus(false);
      }
    };
    window.addEventListener('message', onMessage);

    let pollInterval;
    if (
      (youpiSession.gatewayMode === 'external' &&
        ['INITIATED', 'ACTIVE', 'QUEUED', 'PROCESSING'].includes(youpiSession.status)) ||
      ['MANUAL_REVIEW', 'OBSERVED_SUCCESS', 'QUEUED', 'PROCESSING'].includes(youpiSession.status)
    ) {
      pollInterval = setInterval(() => {
        handleRefreshStatus(true);
      }, 4500);
    }

    return () => {
      window.removeEventListener('message', onMessage);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [
    bookingSuccess,
    handleRefreshStatus,
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

  const createOrRestartYoupiSession = async (forceNew = false) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please log in to register for events');
      return;
    }
    try {
      setError('');
      setBannedError('');
      setLoading(true);
      const response = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions`,
        {
          eventId: event._id,
          name: formData.name.trim() || user?.name || 'Attendee',
          regNo: formData.regNo.trim(),
          email: effectiveEmail,
          needsAccommodation: formData.needsAccommodation,
          method: formData.method || 'UPI',
          preferredVpa: effectivePreferredVpa || undefined,
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
      } else if (session.paymentId) {
        onClose?.();
        navigate(`/payment/${session.paymentId}`);
      }
    } catch (err) {
      console.error('YouPI session initialization error:', err);
      if (err.response?.status === 403 && (err.response?.data?.isBanned || err.response?.data?.code === 'BANNED_IDENTITY')) {
        setBannedError(
          err.response?.data?.message ||
            'Account suspended due to fraudulent payment notification activity. Contact Administrator.'
        );
      } else {
        setError(
          err.response?.data?.message ||
            'Failed to start YouPI-PG checkout session. Please try again.'
        );
      }
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

  const handlePaymentDoneInline = async () => {
    if (!youpiSession?.paymentId) return;
    try {
      setError('');
      setVerifyingNow(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${youpiSession.paymentId}/payment-done`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.session) setYoupiSession(res.data.session);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to enter 30s verification window.');
    } finally {
      setVerifyingNow(false);
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
        `${backendUrl}/api/payments/youpi/sessions/${youpiSession.paymentId}/manual-utr`,
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
      console.error('YouPI UTR submission error:', err);
      setError(err.response?.data?.message || 'UTR submission failed. Check the reference ID.');
    } finally {
      setSubmittingUtr(false);
    }
  };

  const handleCancelSession = async () => {
    if (!youpiSession?.paymentId) return;
    if (youpiSession.status === 'PROCESSING' || youpiSession.canCancel === false) {
      setError('Cannot cancel while 30-second bank verification is in progress.');
      return;
    }
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
      (['ACTIVE', 'PROCESSING'].includes(youpiSession.status) &&
        ((youpiSession.status === 'PROCESSING'
          ? youpiSession.processingExpiresAt
          : youpiSession.expiresAt) &&
          secondsLeft <= 0)));
  const isSessionTerminalError =
    youpiSession && ['FAILED', 'CANCELLED'].includes(youpiSession.status);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#1c1a18] border border-[#efe9de]/[0.12] rounded-[16px] p-6 sm:p-7 max-w-lg w-full shadow-[0_16px_48px_rgba(0,0,0,0.5)] relative my-auto">
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
                    RECONCILED
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

            {bannedError && (
              <div className="mb-4 p-4 rounded-[10px] bg-[#e5484d]/12 border border-[#e5484d]/35 text-[#efe9de] space-y-1.5">
                <div className="flex items-center gap-2 text-[#e5484d] font-medium text-[13px]">
                  <ShieldExclamationIcon className="h-5 w-5 shrink-0" />
                  <span>ACCOUNT SUSPENDED (BANNED_IDENTITY)</span>
                </div>
                <p className="text-[12px] text-[#d9ceb8] leading-relaxed">{bannedError}</p>
              </div>
            )}

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
                    {event?.hasWhatsappGroup || event?.whatsappGroupLink ? 'and WhatsApp group invite ' : ''}will be mailed directly once verified.
                  </p>
                </div>

                {isPaidEvent && (
                  <div className="rounded-[12px] bg-[#161513] border border-[#e09132]/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheckIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.75} />
                        <span className="text-[13px] font-medium text-[#efe9de]">
                          YouPI-PG V2 Method &amp; Payee Channel
                        </span>
                      </div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25">
                        0% fee
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, method: 'UPI' }))}
                        className={`p-2.5 rounded-[9px] border text-left text-[12px] transition-colors ${
                          formData.method === 'UPI'
                            ? 'bg-[#e09132]/15 border-[#e09132]/45 text-[#efe9de]'
                            : 'bg-[#12110f] border-[#efe9de]/[0.08] text-[#aaa398]'
                        }`}
                      >
                        <div className="font-medium flex items-center gap-1.5">
                          <BoltIcon className="h-3.5 w-3.5 text-[#ebb05d]" />
                          <span>UPI Auto-Verify</span>
                        </div>
                        <span className="block text-[10.5px] text-[#8a847a] mt-0.5">
                          QR + 30s auto listener
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, method: 'MANUAL_UPI' }))}
                        className={`p-2.5 rounded-[9px] border text-left text-[12px] transition-colors ${
                          formData.method === 'MANUAL_UPI'
                            ? 'bg-[#e09132]/15 border-[#e09132]/45 text-[#efe9de]'
                            : 'bg-[#12110f] border-[#efe9de]/[0.08] text-[#aaa398]'
                        }`}
                      >
                        <div className="font-medium flex items-center gap-1.5">
                          <DocumentCheckIcon className="h-3.5 w-3.5 text-[#ebb05d]" />
                          <span>Manual UTR</span>
                        </div>
                        <span className="block text-[10.5px] text-[#8a847a] mt-0.5">
                          Submit 12-digit UTR
                        </span>
                      </button>
                    </div>

                    {availableVpaOptions.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-[#aaa398] mb-1">
                          <span>Payee UPI Channel (locks when session starts)</span>
                          <LockClosedIcon className="h-3 w-3 text-[#ebb05d]" />
                        </div>
                        <select
                          value={effectivePreferredVpa}
                          onChange={(e) => setFormData((p) => ({ ...p, preferredVpa: e.target.value }))}
                          className="input-field h-9 py-0 font-mono text-[12px]"
                        >
                          {availableVpaOptions.map((vpa, idx) => (
                            <option key={vpa} value={vpa}>
                              {idx === 0 ? `Primary · ${vpa}` : `Backup · ${vpa}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(event?.hasWhatsappGroup || event?.whatsappGroupLink) && (
                      <p className="text-[11.5px] text-[#4cc38a] flex items-center gap-1.5 pt-0.5">
                        <ChatBubbleLeftRightIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        <span>Includes official WhatsApp group link (revealed after bank reconciliation).</span>
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
                  <button type="submit" disabled={loading || Boolean(bannedError)} className="btn-primary h-10 px-5 text-[13px]">
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
                <div className="rounded-[10px] bg-[#161513] border border-[#e09132]/30 p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <QrCodeIcon className="h-4 w-4 text-[#ebb05d] shrink-0" strokeWidth={1.75} />
                      <span className="text-[13px] font-medium text-[#efe9de]">YouPI-PG V2</span>
                      <span className="px-1.5 py-0.5 rounded-[5px] text-[10px] font-mono bg-[#262421] text-[#aaa398] border border-[#efe9de]/[0.08]">
                        {youpiSession.method || 'UPI'}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[#8a847a] truncate mt-1">
                      Order: {youpiSession.orderId} · {currencySymbol}
                      {youpiSession.amountDisplay}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {['ACTIVE', 'PROCESSING'].includes(youpiSession.status) && !isSessionExpired && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-mono tabular-nums bg-[#262421] text-[#ebb05d] border border-[#e09132]/30">
                        <ClockIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        <span>{formatCountdown(secondsLeft)}</span>
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 rounded-[6px] text-[11px] font-mono border ${
                        ['MANUAL_REVIEW', 'OBSERVED_SUCCESS', 'QUEUED', 'PROCESSING'].includes(
                          youpiSession.status
                        )
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

                {youpiSession.status === 'QUEUED' ? (
                  <div className="rounded-[12px] bg-[#161513] border border-[#e09132]/35 p-4 space-y-3 text-[13px]">
                    <div className="flex items-start gap-2.5">
                      <QueueListIcon className="h-5 w-5 text-[#ebb05d] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-[#efe9de]">
                          Queued in FIFO Slot #{youpiSession.queuePosition || 1}
                        </p>
                        <p className="text-[12px] text-[#aaa398] mt-1">
                          Exclusive slot in use for <span className="font-mono text-[#efe9de]">{youpiSession.payeeVpa}</span>. QR code is withheld until active.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRefreshStatus(false)}
                        disabled={pollingStatus}
                        className="btn-primary flex-1 h-9 text-[12px]"
                      >
                        {pollingStatus ? 'Checking...' : 'Check Slot'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelSession}
                        className="btn-secondary h-9 px-3 text-[12px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : youpiSession.status === 'OBSERVED_SUCCESS' ? (
                  <div className="rounded-[12px] bg-[#161513] border border-[#e09132]/35 p-4 space-y-3 text-[13px]">
                    <p className="font-medium text-[#ebb05d]">
                      Bank Alert Observed (NOT_RECONCILED)
                    </p>
                    <p className="text-[12px] text-[#aaa398]">
                      Tag: <span className="font-mono text-[#efe9de]">{youpiSession.verificationTag}</span>. Your pass &amp; WhatsApp group unlock after bank CSV statement import or Admin reconciliation.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRefreshStatus(false)}
                      disabled={pollingStatus}
                      className="btn-primary w-full h-9 text-[12px]"
                    >
                      {pollingStatus ? 'Checking...' : 'Sync Settlement Status'}
                    </button>
                  </div>
                ) : isSessionExpired || isSessionTerminalError ? (
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
                            'UPI checkout sessions stay open for 5 minutes.'}
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
                  <div className="rounded-[12px] bg-[#161513] border border-[#e09132]/35 p-4 space-y-3 text-[13px]">
                    <div className="flex items-start gap-2.5">
                      <ClockIcon className="h-5 w-5 text-[#ebb05d] shrink-0 mt-0.5" strokeWidth={1.75} />
                      <div>
                        <p className="font-medium text-[#efe9de]">
                          {youpiSession.settlementState || 'PENDING_VERIFICATION'} · awaiting bank reconciliation
                        </p>
                        <p className="text-[12px] text-[#aaa398] mt-1">
                          Reference <span className="font-mono text-[#ebb05d]">{youpiSession.utr || 'Pending'}</span> has been recorded. Pass unlocks after merchant reconciliation.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRefreshStatus(false)}
                      disabled={pollingStatus}
                      className="btn-primary w-full h-9 text-[12px]"
                    >
                      {pollingStatus ? 'Checking...' : 'Check verification status'}
                    </button>
                  </div>
                ) : youpiSession.status === 'PROCESSING' ? (
                  <div className="rounded-[12px] bg-[#161513] border border-[#e09132]/35 p-4 space-y-3 text-[13px]">
                    <p className="font-medium text-[#ebb05d]">
                      30s Bank Alert Listener Active ({formatCountdown(secondsLeft)})
                    </p>
                    <p className="text-[12px] text-[#aaa398]">
                      Listening for SMS/Email bank credit confirmation. Cancel is locked during active verification.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRefreshStatus(false)}
                      disabled={pollingStatus}
                      className="btn-primary w-full h-9 text-[12px]"
                    >
                      {pollingStatus ? 'Checking...' : 'Refresh Status'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {youpiSession.qrSvg && (
                      <div className="rounded-[12px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 flex flex-col sm:flex-row items-center gap-4">
                        <div className="bg-white p-2.5 rounded-[10px] shrink-0 shadow-sm">
                          <img
                            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(youpiSession.qrSvg)}`}
                            alt={`YouPI UPI QR for ${youpiSession.orderId}`}
                            className="w-36 h-36 block"
                          />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2 text-[12px]">
                          <div>
                            <span className="block text-[11px] text-[#8a847a]">Pay to locked UPI ID</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono text-[13px] text-[#efe9de] break-all">
                                {youpiSession.payeeVpa}
                              </span>
                              <button
                                type="button"
                                onClick={handleCopyUpi}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08] shrink-0"
                              >
                                <ClipboardDocumentIcon className="h-3.5 w-3.5 text-[#ebb05d]" />
                                <span>{upiCopied ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {youpiSession.method === 'MANUAL_UPI' ? (
                      <form onSubmit={handleSubmitUtr} className="space-y-3">
                        <input
                          type="text"
                          value={utr}
                          onChange={(e) => setUtr(e.target.value)}
                          required
                          placeholder="e.g. 412895123456 (12-digit UTR)"
                          className="input-field font-mono text-[13px]"
                        />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCancelSession} className="btn-secondary h-10 px-4 text-[13px]">
                            Cancel
                          </button>
                          <button type="submit" disabled={submittingUtr} className="btn-primary flex-1 h-10 text-[13px]">
                            {submittingUtr ? 'Submitting UTR...' : 'Submit UTR'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCancelSession} className="btn-secondary h-10 px-4 text-[13px]">
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handlePaymentDoneInline}
                          disabled={verifyingNow}
                          className="btn-primary flex-1 h-10 text-[13px]"
                        >
                          {verifyingNow ? 'Starting 30s Check...' : 'I Have Paid — Verify (30s)'}
                        </button>
                      </div>
                    )}
                  </div>
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
