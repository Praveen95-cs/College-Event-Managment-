import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  useParams,
  useNavigate,
  useSearchParams,
  Link
} from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { getBackendUrl } from '../../utils/apiConfig';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUpRightIcon,
  ArrowsRightLeftIcon,
  BoltIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  CurrencyRupeeIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  MapPinIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TicketIcon,
  TrophyIcon
} from '@heroicons/react/24/outline';

function formatCountdown(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const STEP_LABELS = ['Attendee Pass', 'UPI Transfer', 'Bank Verify', 'Pass Unlocked'];

function computeCurrentStep(session, isExpired) {
  if (!session) return 0;
  if (session.settled) return 3;
  if (['PROCESSING', 'MANUAL_REVIEW', 'OBSERVED_SUCCESS'].includes(session.status)) return 2;
  if (isExpired) return 1;
  return 1;
}

const Payment = () => {
  const { paymentId: routePaymentId, id: routeEventId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const backendUrl = getBackendUrl();

  const queryPaymentId = searchParams.get('paymentId') || '';
  const queryEventId = searchParams.get('eventId') || '';
  const activePaymentId = routePaymentId || queryPaymentId;
  const activeEventId = routeEventId || queryEventId;

  const isStudentAccount = user?.role === 'student';
  const accountEmail = user?.email || '';

  const [youpiConfig, setYoupiConfig] = useState(null);
  const [eventDoc, setEventDoc] = useState(null);
  const [linkedCompetitions, setLinkedCompetitions] = useState([]);
  const [session, setSession] = useState(null);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    regNo: accountEmail ? accountEmail.split('@')[0] : '',
    email: accountEmail,
    needsAccommodation: false,
    preferredVpa: ''
  });

  const [utr, setUtr] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalWindowSeconds, setTotalWindowSeconds] = useState(300);

  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [switchingVpa, setSwitchingVpa] = useState(false);
  const [verifyingNow, setVerifyingNow] = useState(false);
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [vpaCopied, setVpaCopied] = useState(false);
  const [orderCopied, setOrderCopied] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [showDayLimitGuide, setShowDayLimitGuide] = useState(false);
  const [showManualUtrForm, setShowManualUtrForm] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [error, setError] = useState('');

  const sseRef = useRef(null);

  const effectiveEmail = isStudentAccount
    ? accountEmail
    : formData.email.trim() || accountEmail;

  const loadCompetitionsForEvent = useCallback(
    async (evId) => {
      if (!evId) return;
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${backendUrl}/api/competitions`, {
          params: { eventId: evId },
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setLinkedCompetitions(Array.isArray(res.data) ? res.data : res.data?.competitions || []);
      } catch {
        // Non-critical
      }
    },
    [backendUrl]
  );

  const loadSessionById = useCallback(
    async (pid, silent = false) => {
      if (!pid) return null;
      const token = localStorage.getItem('token');
      if (!silent) setSyncing(true);
      try {
        const res = await axios.get(`${backendUrl}/api/payments/youpi/sessions/${pid}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const nextSession = res.data?.session;
        if (nextSession) {
          setSession(nextSession);
          if (nextSession.utr) setUtr(nextSession.utr);
          if (nextSession.timeRemainingSeconds > totalWindowSeconds) {
            setTotalWindowSeconds(nextSession.timeRemainingSeconds);
          }
          if (nextSession.eventId && (!eventDoc || eventDoc._id !== nextSession.eventId)) {
            const evRes = await axios
              .get(`${backendUrl}/api/events/${nextSession.eventId}`, {
                headers: { Authorization: `Bearer ${token}` }
              })
              .catch(() => null);
            if (evRes?.data) {
              setEventDoc(evRes.data);
            }
            loadCompetitionsForEvent(nextSession.eventId);
          }
        }
        return nextSession;
      } catch (err) {
        if (!silent) {
          setError(err.response?.data?.message || 'Unable to load payment session.');
        }
        return null;
      } finally {
        if (!silent) setSyncing(false);
      }
    },
    [backendUrl, eventDoc, loadCompetitionsForEvent, totalWindowSeconds]
  );

  // Initial bootstrap: load by paymentId OR eventId
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!activePaymentId && !activeEventId) {
        navigate('/events', { replace: true });
        return;
      }

      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');

      try {
        const cfgRes = await axios
          .get(`${backendUrl}/api/payments/youpi/config`)
          .catch(() => null);
        if (!cancelled && cfgRes?.data) {
          setYoupiConfig(cfgRes.data);
          if (cfgRes.data.sessionTtlSeconds) {
            setTotalWindowSeconds(cfgRes.data.sessionTtlSeconds);
          }
        }

        if (activePaymentId) {
          const loaded = await loadSessionById(activePaymentId, true);
          if (!cancelled && !loaded) {
            setError('Payment session not found or you do not have access to it.');
          }
        } else if (activeEventId) {
          const evRes = await axios.get(`${backendUrl}/api/events/${activeEventId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (cancelled) return;
          const ev = evRes.data;
          setEventDoc(ev);
          loadCompetitionsForEvent(ev._id);

          if (!ev.isPaid || Number(ev.registrationFee || 0) <= 0) {
            navigate(`/events/${ev._id}`, { replace: true });
            return;
          }

          // If student already has a YouPI session for this event, resume it automatically
          if (ev.myRegistration?.youpiPaymentId) {
            const loaded = await loadSessionById(ev.myRegistration.youpiPaymentId, true);
            if (!cancelled && loaded) {
              navigate(`/payment/${loaded.paymentId}`, { replace: true });
              return;
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Failed to initialize payment gateway.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePaymentId, activeEventId]);

  // Real-time countdown ticker
  useEffect(() => {
    if (!session?.expiresAt || !['ACTIVE', 'PROCESSING'].includes(session.status)) {
      setSecondsLeft(session?.timeRemainingSeconds || 0);
      return undefined;
    }
    const tick = () => {
      const rem = Math.max(
        0,
        Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(rem);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session?.expiresAt, session?.status, session?.timeRemainingSeconds]);

  // Real-time SSE stream + fallback poller for instant automated reconciliation
  useEffect(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setSseConnected(false);

    if (
      !session?.paymentId ||
      session.settled ||
      ['EXPIRED', 'FAILED', 'CANCELLED'].includes(session.status)
    ) {
      return undefined;
    }

    const token = localStorage.getItem('token');
    if (token && typeof window !== 'undefined' && 'EventSource' in window) {
      const streamUrl = `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(streamUrl);
      sseRef.current = es;

      es.addEventListener('open', () => {
        setSseConnected(true);
      });

      es.addEventListener('session', (event) => {
        try {
          const dto = JSON.parse(event.data);
          if (dto && dto.paymentId === session.paymentId) {
            setSession(dto);
            if (dto.utr) setUtr(dto.utr);
            if (dto.settled) {
              setBannerMessage('Bank credit confirmed automatically. Pass & competitions unlocked.');
            }
          }
        } catch {
          // Ignore malformed chunk
        }
      });

      es.onerror = () => {
        setSseConnected(false);
      };
    }

    const fallbackInterval = setInterval(() => {
      loadSessionById(session.paymentId, true);
    }, 4500);

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      clearInterval(fallbackInterval);
    };
  }, [backendUrl, loadSessionById, session?.paymentId, session?.settled, session?.status]);

  const handleStartCheckoutSession = async (e, forceNew = false) => {
    if (e) e.preventDefault();
    const targetEvId = eventDoc?._id || session?.eventId || activeEventId;
    if (!targetEvId) return;

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      setError('');
      setBannerMessage('');
      setSubmittingAction(true);

      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions`,
        {
          eventId: targetEvId,
          name: formData.name.trim() || user?.name || 'Attendee',
          regNo: formData.regNo.trim(),
          email: effectiveEmail,
          needsAccommodation: formData.needsAccommodation,
          preferredVpa: formData.preferredVpa || undefined,
          forceNew
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const created = res.data?.session;
      if (created?.paymentId) {
        setSession(created);
        if (created.utr) setUtr(created.utr);
        if (routePaymentId !== created.paymentId) {
          navigate(`/payment/${created.paymentId}`, { replace: true });
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to start UPI payment session.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSwitchVpa = async (targetVpa = '') => {
    if (!session?.paymentId) return;
    const token = localStorage.getItem('token');
    try {
      setError('');
      setBannerMessage('');
      setSwitchingVpa(true);
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/switch-vpa`,
        { targetVpa },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      if (res.data?.session) {
        setSession(res.data.session);
        setBannerMessage(
          `Switched receiver UPI ID to ${res.data.session.payeeVpa} and regenerated QR code.`
        );
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to switch UPI ID.';
      setError(msg);
      if (err.response?.data?.code === 'NO_ALTERNATE_VPA') {
        setShowDayLimitGuide(true);
      }
    } finally {
      setSwitchingVpa(false);
    }
  };

  const handleVerifyNow = async () => {
    if (!session?.paymentId) return;
    const token = localStorage.getItem('token');
    try {
      setError('');
      setBannerMessage('');
      setVerifyingNow(true);
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/verify-now`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.session) {
        setSession(res.data.session);
        if (res.data.session.settled) {
          setBannerMessage('Bank credit confirmed automatically! Event pass unlocked.');
        } else if (res.data.pollSummary?.ok) {
          setBannerMessage(
            `Scanned ${res.data.pollSummary.scanned || 0} recent bank alerts. Live listener remains active — or submit your 12-digit UTR below for faster manual verification.`
          );
        } else {
          setBannerMessage(
            'Auto-verification listener active. If bank alerts take a moment, you can also enter your 12-digit UTR below.'
          );
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to start verification check.');
    } finally {
      setVerifyingNow(false);
    }
  };

  const handleSubmitUtr = async (e) => {
    e.preventDefault();
    if (!session?.paymentId) return;
    const cleaned = utr.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9-]{6,35}$/.test(cleaned)) {
      setError('Enter a valid 6–35 character UPI / UTR reference number.');
      return;
    }

    const token = localStorage.getItem('token');
    try {
      setError('');
      setBannerMessage('');
      setSubmittingUtr(true);
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/submit-utr`,
        {
          utr: cleaned,
          name: session.customerName || formData.name,
          regNo: session.customerRegNo || formData.regNo,
          email: effectiveEmail,
          needsAccommodation: session.needsAccommodation
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (res.data?.session) {
        setSession(res.data.session);
        if (res.data.session.settled) {
          setBannerMessage('Payment verified & registration confirmed!');
        } else {
          setBannerMessage(
            'UTR submitted. Auto-bank verifier & Admin reconciliation will unlock your pass shortly.'
          );
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'UTR verification failed. Check the reference ID.');
    } finally {
      setSubmittingUtr(false);
    }
  };

  const handleCancelSession = async () => {
    if (!session?.paymentId) return;
    const token = localStorage.getItem('token');
    try {
      await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      // ignore cancel errors
    }
    navigate(session.eventId ? `/events/${session.eventId}` : '/events');
  };

  const handleCopyText = async (text, setter) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 1800);
    } catch {
      window.prompt('Copy value:', text);
    }
  };

  const isExpired =
    session &&
    (session.status === 'EXPIRED' ||
      (['ACTIVE', 'PROCESSING'].includes(session.status) &&
        session.expiresAt &&
        secondsLeft <= 0));
  const isTerminalError = session && ['FAILED', 'CANCELLED'].includes(session.status);
  const currentStep = computeCurrentStep(session, isExpired);

  const fee = Number(session?.amount ?? eventDoc?.registrationFee ?? 0);
  const currency = session?.currency || eventDoc?.currency || 'INR';
  const currencySymbol = currency === 'INR' ? '₹' : `${currency} `;
  const formattedEventDate = eventDoc?.date
    ? new Date(eventDoc.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : '';

  const ringRadius = 22;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringRatio =
    totalWindowSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalWindowSeconds)) : 0;
  const ringOffset = ringCircumference * (1 - ringRatio);

  if (loading) {
    return (
      <div className="min-h-[65vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="h-10 w-10 rounded-full border-2 border-[#e09132]/30 border-t-[#ebb05d] animate-spin" />
        <div>
          <p className="text-[15px] font-medium text-[#efe9de]">Initializing YouPI-PG V2 Gateway</p>
          <p className="text-[12px] text-[#8a847a] mt-1">
            Preparing encrypted UPI checkout &amp; bank verification stream...
          </p>
        </div>
      </div>
    );
  }

  const returnEventId = session?.eventId || eventDoc?._id || activeEventId;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* Top Gateway Header */}
      <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[16px] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Link
            to={returnEventId ? `/events/${returnEventId}` : '/events'}
            className="h-9 w-9 rounded-[9px] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/[0.08] flex items-center justify-center text-[#efe9de] shrink-0 transition-colors"
            title="Back to event"
          >
            <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.75} />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[6px] bg-[#e09132]/15 text-[#ebb05d] border border-[#e09132]/30">
                <ShieldCheckIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Avenor Pay · YouPI-PG V2</span>
              </span>
              {session?.orderId && (
                <button
                  type="button"
                  onClick={() => handleCopyText(session.orderId, setOrderCopied)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-[6px] bg-[#161513] text-[#aaa398] hover:text-[#efe9de] border border-[#efe9de]/[0.08]"
                >
                  <span>{session.orderId}</span>
                  <ClipboardDocumentIcon className="h-3 w-3 text-[#ebb05d]" />
                  {orderCopied && <span className="text-[#4cc38a]">Copied</span>}
                </button>
              )}
              {sseConnected && !session?.settled && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#4cc38a]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4cc38a] animate-pulse" />
                  <span>LIVE STREAM</span>
                </span>
              )}
            </div>
            <h1 className="text-[19px] sm:text-[22px] font-medium text-[#efe9de] truncate mt-1">
              {session?.eventTitle || eventDoc?.title || 'Event Pass Checkout'}
            </h1>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
          {STEP_LABELS.map((label, idx) => {
            const done = idx < currentStep || (idx === 3 && session?.settled);
            const active = idx === currentStep && !session?.settled;
            return (
              <div key={label} className="flex items-center gap-1.5 shrink-0">
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] text-[11px] font-medium border ${
                    done
                      ? 'bg-[#4cc38a]/12 border-[#4cc38a]/30 text-[#4cc38a]'
                      : active
                        ? 'bg-[#e09132]/15 border-[#e09132]/35 text-[#ebb05d]'
                        : 'bg-[#161513] border-[#efe9de]/[0.06] text-[#8a847a]'
                  }`}
                >
                  <span className="font-mono text-[10px]">{idx + 1}.</span>
                  <span>{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-[12px] bg-[#e5484d]/10 border border-[#e5484d]/30 p-3.5 text-[13px] text-[#e5484d] flex items-start gap-2.5">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" strokeWidth={1.75} />
          <span>{error}</span>
        </div>
      )}

      {bannerMessage && (
        <div className="rounded-[12px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 p-3.5 text-[13px] text-[#efe9de] flex items-start gap-2.5">
          <SparklesIcon className="h-5 w-5 text-[#4cc38a] shrink-0 mt-0.5" strokeWidth={1.75} />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Summary, Fee Breakdown & Status */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[16px] p-5 space-y-4">
            {eventDoc?.photo && (
              <div className="rounded-[10px] overflow-hidden border border-[#efe9de]/[0.08] h-36 bg-[#12110f]">
                <img
                  src={eventDoc.photo}
                  alt={eventDoc.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a847a]">
                Order Summary
              </span>
              <h2 className="text-[17px] font-medium text-[#efe9de] mt-0.5">
                {session?.eventTitle || eventDoc?.title || 'Campus Event Pass'}
              </h2>
              <div className="mt-2 space-y-1 text-[12px] text-[#aaa398]">
                {formattedEventDate && (
                  <p className="flex items-center gap-1.5 font-mono">
                    <CalendarDaysIcon className="h-4 w-4 text-[#8a847a]" />
                    <span>
                      {formattedEventDate} {eventDoc?.time ? `· ${eventDoc.time}` : ''}
                    </span>
                  </p>
                )}
                {eventDoc?.location && (
                  <p className="flex items-center gap-1.5">
                    <MapPinIcon className="h-4 w-4 text-[#8a847a]" />
                    <span>{eventDoc.location}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[#efe9de]/[0.08] space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#8a847a]">Event pass amount</span>
                <span className="font-mono text-[#efe9de]">
                  {currencySymbol}
                  {Number(fee).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a847a]">YouPI-PG gateway fee</span>
                <span className="font-mono text-[#4cc38a]">₹0.00 (Free)</span>
              </div>
              <div className="pt-2 border-t border-[#efe9de]/[0.06] flex justify-between items-baseline">
                <span className="font-medium text-[#efe9de]">Total payable</span>
                <span className="text-[22px] font-mono font-semibold text-[#ebb05d]">
                  {currencySymbol}
                  {session?.amountDisplay || Number(fee).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Countdown or Status Pill */}
            {session && !session.settled && (
              <div className="rounded-[12px] bg-[#161513] border border-[#efe9de]/[0.08] p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[11px] font-mono text-[#8a847a] uppercase">
                    Session Status
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-[12px] font-mono font-semibold px-2 py-0.5 rounded-[5px] border ${
                        isExpired || isTerminalError
                          ? 'bg-[#e5484d]/15 text-[#e5484d] border-[#e5484d]/30'
                          : session.status === 'PROCESSING'
                            ? 'bg-[#e09132]/15 text-[#ebb05d] border-[#e09132]/30'
                            : 'bg-[#4cc38a]/12 text-[#4cc38a] border-[#4cc38a]/25'
                      }`}
                    >
                      {isExpired ? 'EXPIRED' : session.status}
                    </span>
                    {session.status === 'PROCESSING' && (
                      <span className="text-[11px] text-[#ebb05d] animate-pulse">
                        Verifying bank credit...
                      </span>
                    )}
                  </div>
                </div>

                {['ACTIVE', 'PROCESSING'].includes(session.status) && !isExpired && (
                  <div className="relative flex items-center justify-center shrink-0">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                      <circle
                        cx="28"
                        cy="28"
                        r={ringRadius}
                        fill="none"
                        stroke="rgba(239,233,222,0.1)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r={ringRadius}
                        fill="none"
                        stroke="#ebb05d"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                      />
                    </svg>
                    <span className="absolute text-[11px] font-mono font-semibold text-[#efe9de] tabular-nums">
                      {formatCountdown(secondsLeft)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Attendee Summary */}
            <div className="rounded-[12px] bg-[#161513] border border-[#efe9de]/[0.06] p-3.5 space-y-1.5 text-[12px]">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a847a]">
                Attendee Ticket Holder
              </span>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Name</span>
                <span className="text-[#efe9de] font-medium truncate">
                  {session?.customerName || formData.name || user?.name}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Roll / Reg No</span>
                <span className="font-mono text-[#ebb05d]">
                  {session?.customerRegNo || formData.regNo || '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Confirmation Email</span>
                <span className="text-[#efe9de] truncate">
                  {session?.customerEmail || effectiveEmail}
                </span>
              </div>
            </div>
          </div>

          {linkedCompetitions.length > 0 && !session?.settled && (
            <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[16px] p-4 space-y-2">
              <div className="flex items-center gap-2 text-[12px] font-medium text-[#ebb05d]">
                <TrophyIcon className="h-4 w-4" strokeWidth={1.75} />
                <span>Included Linked Competitions ({linkedCompetitions.length})</span>
              </div>
              <p className="text-[12px] text-[#8a847a]">
                Completing this payment automatically unlocks arena access for:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {linkedCompetitions.map((comp) => (
                  <span
                    key={comp._id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#161513] border border-[#efe9de]/[0.08] text-[11px] text-[#efe9de]"
                  >
                    <LockClosedIcon className="h-3 w-3 text-[#ebb05d]" />
                    <span>{comp.title}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Checkout Step / Active UPI Gateway / Verified Receipt */}
        <div className="lg:col-span-7">
          {!session ? (
            /* Step 1: Review Attendee Details & Launch UPI Session */
            <form
              onSubmit={(e) => handleStartCheckoutSession(e, false)}
              className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[16px] p-6 space-y-5"
            >
              <div>
                <h2 className="text-[19px] font-medium text-[#efe9de]">
                  Confirm Attendee &amp; Initialize UPI Checkout
                </h2>
                <p className="text-[13px] text-[#8a847a] mt-1">
                  Review your ticket details below before generating your live UPI QR &amp; automated verification session.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#aaa398] mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className="input-field"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#aaa398] mb-1.5">
                    Roll / Registration No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.regNo}
                    onChange={(e) => setFormData((p) => ({ ...p, regNo: e.target.value }))}
                    className="input-field font-mono"
                    placeholder="e.g. 2023503501"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[12px] font-medium text-[#aaa398]">
                    Confirmation Email *
                  </label>
                  {isStudentAccount && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25">
                      Locked to student account
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="email"
                    required
                    readOnly={isStudentAccount}
                    value={effectiveEmail}
                    onChange={(e) =>
                      !isStudentAccount &&
                      setFormData((p) => ({ ...p, email: e.target.value }))
                    }
                    className={`input-field pr-10 ${isStudentAccount ? 'opacity-80 bg-[#12110f] cursor-not-allowed' : ''}`}
                  />
                  <EnvelopeIcon className="h-4 w-4 text-[#8a847a] absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {youpiConfig?.backupVpas?.length > 0 && (
                <div>
                  <label className="block text-[12px] font-medium text-[#aaa398] mb-1.5">
                    Preferred Receiver UPI Channel (Optional)
                  </label>
                  <select
                    value={formData.preferredVpa}
                    onChange={(e) => setFormData((p) => ({ ...p, preferredVpa: e.target.value }))}
                    className="input-field font-mono text-[13px]"
                  >
                    <option value="">
                      Primary Event UPI ({eventDoc?.paymentUpiId || youpiConfig?.defaultPayeeVpa || 'Default'})
                    </option>
                    {youpiConfig.backupVpas.map((vpa) => (
                      <option key={vpa} value={vpa}>
                        Backup UPI · {vpa}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-2.5 text-[13px] text-[#aaa398] cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.needsAccommodation}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, needsAccommodation: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132]"
                />
                <span>I require campus accommodation assistance</span>
              </label>

              <div className="pt-3 border-t border-[#efe9de]/[0.08] flex flex-col sm:flex-row gap-3">
                <Link
                  to={returnEventId ? `/events/${returnEventId}` : '/events'}
                  className="btn-secondary h-11 px-5 text-[13px]"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="btn-primary flex-1 h-11 text-[13px]"
                >
                  <CurrencyRupeeIcon className="h-4 w-4" strokeWidth={1.75} />
                  <span>
                    {submittingAction
                      ? 'Generating YouPI Session...'
                      : `Proceed to Pay ${currencySymbol}${Number(fee).toFixed(2)}`}
                  </span>
                </button>
              </div>
            </form>
          ) : session.settled ? (
            /* Step 4: Verified Pass, WhatsApp Group & Unlocked Competitions */
            <div className="bg-[#1c1a18] border border-[#4cc38a]/35 rounded-[16px] p-6 space-y-6">
              <div className="flex items-start gap-3.5">
                <div className="h-12 w-12 rounded-[12px] bg-[#4cc38a]/15 border border-[#4cc38a]/30 flex items-center justify-center text-[#4cc38a] shrink-0">
                  <CheckCircleIcon className="h-7 w-7" strokeWidth={1.75} />
                </div>
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#4cc38a]">
                    Payment Reconciled · Seat Confirmed
                  </span>
                  <h2 className="text-[22px] font-medium text-[#efe9de] mt-0.5">
                    You&apos;re Registered for {session.eventTitle}!
                  </h2>
                  <p className="text-[13px] text-[#aaa398] mt-1">
                    Your digital pass and receipt have been mailed to{' '}
                    <span className="text-[#efe9de] font-medium">{session.customerEmail}</span>.
                  </p>
                </div>
              </div>

              <div className="rounded-[12px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                <div>
                  <span className="block text-[11px] text-[#8a847a]">Registration Number</span>
                  <span className="font-mono text-[#ebb05d] font-semibold">
                    {session.registration?.regNo || session.customerRegNo}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#8a847a]">Amount Paid</span>
                  <span className="font-mono text-[#4cc38a] font-semibold">
                    {currencySymbol}
                    {session.amountDisplay} (0% fee)
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#8a847a]">UTR / Transaction Ref</span>
                  <span className="font-mono text-[#efe9de]">
                    {session.utr || session.registration?.transactionId || session.orderId}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-[#8a847a]">Verification Channel</span>
                  <span className="font-mono text-[#aaa398]">
                    {session.observationSource && session.observationSource !== 'NONE'
                      ? `AUTO_${session.observationSource}`
                      : session.verificationTag || 'YOUPI_RECONCILED'}
                  </span>
                </div>
              </div>

              {session.whatsappGroupLink && (
                <div className="rounded-[12px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <ChatBubbleLeftRightIcon
                      className="h-5 w-5 text-[#4cc38a] shrink-0 mt-0.5"
                      strokeWidth={1.75}
                    />
                    <div>
                      <p className="text-[13px] font-medium text-[#efe9de]">
                        Official Event WhatsApp Group Unlocked
                      </p>
                      <p className="text-[12px] text-[#aaa398]">
                        Join for live schedule announcements, coordinator alerts, and venue pins.
                      </p>
                    </div>
                  </div>
                  <a
                    href={session.whatsappGroupLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[9px] text-[12px] font-semibold bg-[#4cc38a] text-[#12110f] hover:bg-[#5cd199] transition-colors shrink-0"
                  >
                    <span>Join WhatsApp Group</span>
                    <ArrowUpRightIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  </a>
                </div>
              )}

              {linkedCompetitions.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[13px] font-medium text-[#efe9de] flex items-center gap-2">
                    <TrophyIcon className="h-4 w-4 text-[#ebb05d]" />
                    <span>Unlocked Competitions</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {linkedCompetitions.map((comp) => (
                      <Link
                        key={comp._id}
                        to={
                          comp.type === 'coding'
                            ? `/competitions/${comp._id}/code`
                            : `/competitions/${comp._id}/quiz`
                        }
                        className="rounded-[10px] bg-[#161513] hover:bg-[#22201d] border border-[#efe9de]/[0.08] p-3 flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#efe9de] truncate">
                            {comp.title}
                          </p>
                          <p className="text-[11px] font-mono text-[#ebb05d] uppercase">
                            {comp.type} arena · Enter
                          </p>
                        </div>
                        <ArrowUpRightIcon className="h-4 w-4 text-[#ebb05d] shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2 border-t border-[#efe9de]/[0.08]">
                <Link to="/profile" className="btn-primary h-10 px-5 text-[13px]">
                  <TicketIcon className="h-4 w-4" />
                  <span>View Pass in Profile</span>
                </Link>
                <Link
                  to={returnEventId ? `/events/${returnEventId}` : '/events'}
                  className="btn-secondary h-10 px-5 text-[13px]"
                >
                  Back to Event Page
                </Link>
              </div>
            </div>
          ) : isExpired || isTerminalError ? (
            /* Expired / Failed / Cancelled Recovery Panel */
            <div className="bg-[#1c1a18] border border-[#e5484d]/35 rounded-[16px] p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-[10px] bg-[#e5484d]/15 border border-[#e5484d]/30 flex items-center justify-center text-[#e5484d] shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-[19px] font-medium text-[#efe9de]">
                    {isExpired
                      ? 'UPI Checkout Window Expired'
                      : `Payment Session ${session.status}`}
                  </h2>
                  <p className="text-[13px] text-[#aaa398] mt-1">
                    {session.failureReason ||
                      'For accurate bank transaction matching, each UPI QR window remains open for 5 minutes.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleStartCheckoutSession(null, true)}
                  disabled={submittingAction}
                  className="btn-primary h-11 px-6 text-[13px]"
                >
                  <ArrowPathIcon
                    className={`h-4 w-4 ${submittingAction ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {submittingAction ? 'Generating Session...' : 'Start Fresh UPI Session'}
                  </span>
                </button>
                <Link
                  to={returnEventId ? `/events/${returnEventId}` : '/events'}
                  className="btn-secondary h-11 px-5 text-[13px]"
                >
                  Return to Event
                </Link>
              </div>
            </div>
          ) : (
            /* Step 2 & 3: Active Fintech UPI Gateway (QR + Multi-VPA + GPay Limit Fix + Auto-Verify + UTR Fallback) */
            <div className="space-y-4">
              {/* Primary QR + VPA Rotation Card */}
              <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[16px] p-5 sm:p-6 space-y-5">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                  {/* White-Backed Dynamic ISO UPI QR */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="bg-white p-3.5 rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.45)] border-2 border-[#ebb05d]/40">
                      {session.qrSvg ? (
                        <img
                          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(session.qrSvg)}`}
                          alt={`UPI QR for ${session.orderId}`}
                          className="w-44 h-44 block"
                        />
                      ) : (
                        <div className="w-44 h-44 flex items-center justify-center text-slate-700 text-xs font-mono">
                          QR Unavailable
                        </div>
                      )}
                    </div>
                    <span className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-mono text-[#aaa398]">
                      <QrCodeIcon className="h-3.5 w-3.5 text-[#ebb05d]" />
                      <span>Scan live with any UPI app</span>
                    </span>
                  </div>

                  {/* Merchant VPA & Switching Panel */}
                  <div className="flex-1 min-w-0 w-full space-y-4">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#8a847a]">
                        Verified Payee Details
                      </span>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[16px] font-medium text-[#efe9de]">
                          {session.payeeName || 'Praveen S'}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25">
                          BANKING NAME
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.1] px-3.5 py-2.5">
                        <span className="font-mono text-[14px] text-[#ebb05d] break-all">
                          {session.payeeVpa}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(session.payeeVpa, setVpaCopied)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#262421] hover:bg-[#302d29] text-[11px] font-medium text-[#efe9de] border border-[#efe9de]/[0.08] shrink-0"
                        >
                          <ClipboardDocumentIcon className="h-3.5 w-3.5 text-[#ebb05d]" />
                          <span>{vpaCopied ? 'Copied!' : 'Copy VPA'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Alternate / Backup UPI VPA Switcher for Bank Daily Cap */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[#aaa398]">
                          Receiver UPI Channels ({(session.availableVpas || [session.payeeVpa]).length})
                        </span>
                        {(session.availableVpas || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleSwitchVpa('')}
                            disabled={switchingVpa}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#ebb05d] hover:text-[#f5c478] disabled:opacity-50"
                          >
                            <ArrowsRightLeftIcon
                              className={`h-3.5 w-3.5 ${switchingVpa ? 'animate-spin' : ''}`}
                            />
                            <span>
                              {switchingVpa
                                ? 'Rotating QR...'
                                : 'Rotate / Switch UPI ID'}
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {(session.availableVpas?.length
                          ? session.availableVpas
                          : [session.payeeVpa]
                        ).map((vpa) => {
                          const isCurrent =
                            vpa.toLowerCase() === String(session.payeeVpa || '').toLowerCase();
                          return (
                            <button
                              key={vpa}
                              type="button"
                              disabled={isCurrent || switchingVpa}
                              onClick={() => handleSwitchVpa(vpa)}
                              className={`px-2.5 py-1 rounded-[7px] text-[11px] font-mono border transition-colors ${
                                isCurrent
                                  ? 'bg-[#e09132]/15 border-[#e09132]/40 text-[#ebb05d]'
                                  : 'bg-[#161513] border-[#efe9de]/[0.08] text-[#aaa398] hover:text-[#efe9de] hover:border-[#efe9de]/25'
                              }`}
                            >
                              {isCurrent ? `Active · ${vpa}` : `Use ${vpa}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* App Deep Links */}
                    {session.upiAppIntents?.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className="flex items-center gap-1.5 text-[11px] text-[#8a847a]">
                          <DevicePhoneMobileIcon className="h-3.5 w-3.5" />
                          <span>Mobile Quick-Pay Apps (Tap on phone)</span>
                        </span>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {session.upiAppIntents.map((app) => (
                            <a
                              key={app.id}
                              href={app.upiUri}
                              className="flex flex-col items-center justify-center gap-1 py-2 px-1.5 rounded-[9px] bg-[#161513] hover:bg-[#262421] border border-[#efe9de]/[0.08] text-[11px] text-[#efe9de] transition-colors text-center"
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: app.brandColor }}
                              />
                              <span className="truncate max-w-full font-medium">
                                {app.shortName}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Google Pay "Day limit exceeded" Fix Banner */}
                <div className="rounded-[12px] bg-[#e09132]/[0.08] border border-[#e09132]/30 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[#ebb05d] text-[13px] font-medium">
                      <InformationCircleIcon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                      <span>
                        Seeing Google Pay &ldquo;Day limit exceeded for this transaction&rdquo;?
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDayLimitGuide((v) => !v)}
                      className="text-[11px] font-mono text-[#ebb05d] hover:underline shrink-0"
                    >
                      {showDayLimitGuide ? 'Hide steps' : 'How to fix'}
                    </button>
                  </div>
                  <p className="text-[12px] text-[#d9ceb8] leading-relaxed">
                    Google Pay enforces a <strong className="text-[#efe9de]">₹2,000/day cap on scanned QR codes &amp; app links</strong>, or the active UPI handle may have reached its daily peer limit. Fix it in seconds:
                  </p>
                  <div
                    className={`grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11.5px] text-[#d9ceb8] ${
                      showDayLimitGuide ? '' : 'hidden sm:grid'
                    }`}
                  >
                    <div className="rounded-[8px] bg-[#161513]/80 border border-[#efe9de]/[0.07] p-2.5">
                      <span className="block font-semibold text-[#ebb05d] mb-0.5">
                        1. Copy &amp; Pay Manually
                      </span>
                      Click <strong>Copy VPA</strong> above → Open GPay → tap{' '}
                      <em>Pay UPI ID or number</em> → paste VPA &amp; pay ₹{session.amountDisplay} directly (bypasses QR limit).
                    </div>
                    <div className="rounded-[8px] bg-[#161513]/80 border border-[#efe9de]/[0.07] p-2.5">
                      <span className="block font-semibold text-[#ebb05d] mb-0.5">
                        2. Switch Receiver UPI ID
                      </span>
                      Click <strong>Rotate / Switch UPI ID</strong> above to route to an alternate receiver bank handle instantly.
                    </div>
                    <div className="rounded-[8px] bg-[#161513]/80 border border-[#efe9de]/[0.07] p-2.5">
                      <span className="block font-semibold text-[#ebb05d] mb-0.5">
                        3. Try PhonePe / Paytm / BHIM
                      </span>
                      Other NPCI UPI apps let you scan this exact QR without Google Pay&apos;s ₹2,000 gallery/intent cap.
                    </div>
                  </div>
                </div>

                {session.paymentInstructions && (
                  <p className="text-[12px] text-[#aaa398] bg-[#161513] border border-[#efe9de]/[0.06] rounded-[10px] p-3">
                    <span className="font-medium text-[#efe9de]">Organizer note: </span>
                    {session.paymentInstructions}
                  </p>
                )}

                {/* Automated Bank Verification Primary CTA */}
                <div className="pt-2 border-t border-[#efe9de]/[0.08] space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={handleVerifyNow}
                      disabled={verifyingNow}
                      className="btn-primary flex-1 h-11 text-[13px]"
                    >
                      <BoltIcon
                        className={`h-4 w-4 ${verifyingNow ? 'animate-pulse' : ''}`}
                        strokeWidth={1.75}
                      />
                      <span>
                        {verifyingNow
                          ? 'Scanning Bank Alerts...'
                          : session.status === 'PROCESSING'
                            ? 'Re-Check Bank Confirmation Now'
                            : "I've Paid — Auto-Verify Payment"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => loadSessionById(session.paymentId, false)}
                      disabled={syncing}
                      className="btn-secondary h-11 px-4 text-[13px]"
                    >
                      <ArrowPathIcon
                        className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
                        strokeWidth={1.75}
                      />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {session.status === 'PROCESSING' && (
                    <div className="rounded-[10px] bg-[#161513] border border-[#e09132]/30 p-3 flex items-center gap-3 text-[12px] text-[#d9ceb8]">
                      <ClockIcon className="h-5 w-5 text-[#ebb05d] animate-spin shrink-0" />
                      <span>
                        Listening in real-time via bank email/SMS automation for exact credit of{' '}
                        <strong className="font-mono text-[#ebb05d]">
                          {currencySymbol}
                          {session.amountDisplay}
                        </strong>
                        . Keep this tab open — your pass will unlock automatically.
                      </span>
                    </div>
                  )}

                  {session.status === 'MANUAL_REVIEW' && (
                    <div className="rounded-[10px] bg-[#161513] border border-[#e09132]/35 p-3.5 text-[12px] text-[#d9ceb8] space-y-1">
                      <p className="font-medium text-[#ebb05d]">
                        UTR Recorded ({session.utr}) · Verification in Progress
                      </p>
                      <p className="text-[#aaa398]">
                        Automated bank reconciliation or your organizer will settle this UTR momentarily. Once verified, you will also receive a confirmation email with your pass.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Optional / Backup 12-Digit UTR Submission Card */}
              <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[16px] p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[14px] font-medium text-[#efe9de]">
                      {session.status === 'MANUAL_REVIEW'
                        ? 'Update 12-Digit UTR Reference'
                        : 'Have your 12-digit UPI / UTR reference? (Optional faster audit)'}
                    </h3>
                    <p className="text-[12px] text-[#8a847a]">
                      Submitting your UTR links directly to your bank statement &amp; organizer reconciliation ledger.
                    </p>
                  </div>
                  {!showManualUtrForm && session.status !== 'MANUAL_REVIEW' && (
                    <button
                      type="button"
                      onClick={() => setShowManualUtrForm(true)}
                      className="btn-secondary h-8 px-3 text-[12px] shrink-0"
                    >
                      Enter UTR
                    </button>
                  )}
                </div>

                {(showManualUtrForm || session.status === 'MANUAL_REVIEW' || youpiConfig?.verificationMode === 'manual') && (
                  <form onSubmit={handleSubmitUtr} className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="gateway-utr" className="text-[12px] text-[#aaa398]">
                        12-digit UPI Ref / UTR Number
                      </label>
                      {session.allowDemoUtr && (
                        <button
                          type="button"
                          onClick={() => setUtr(`4128${Date.now().toString().slice(-8)}`)}
                          className="text-[11px] font-mono text-[#ebb05d] hover:underline"
                        >
                          Fill dev test UTR
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        id="gateway-utr"
                        type="text"
                        required
                        value={utr}
                        onChange={(e) => setUtr(e.target.value)}
                        placeholder="e.g. 412895123456"
                        className="input-field font-mono text-[13px] flex-1"
                      />
                      <button
                        type="submit"
                        disabled={submittingUtr}
                        className="btn-secondary h-10 px-5 text-[13px] shrink-0 border-[#ebb05d]/35 text-[#ebb05d]"
                      >
                        {submittingUtr ? 'Submitting...' : 'Submit UTR'}
                      </button>
                    </div>
                  </form>
                )}

                <div className="pt-2 border-t border-[#efe9de]/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#8a847a]">
                  {session.checkoutUrl && (
                    <a
                      href={session.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-[#ebb05d]"
                    >
                      <span>Standalone YouPI portal</span>
                      <ArrowUpRightIcon className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleCancelSession}
                    className="hover:text-[#e5484d] transition-colors"
                  >
                    Cancel checkout session
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Payment;
