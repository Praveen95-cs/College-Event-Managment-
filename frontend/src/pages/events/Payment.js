import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  BoltIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  CurrencyRupeeIcon,
  DevicePhoneMobileIcon,
  DocumentCheckIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  MapPinIcon,
  QrCodeIcon,
  QueueListIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  TicketIcon,
  TrophyIcon
} from '@heroicons/react/24/outline';

function formatCountdown(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const STEP_LABELS = ['Method & UPI', 'UPI transfer', 'Bank check', 'Pass issued'];

function computeCurrentStep(session, isExpired, isBlocked) {
  if (isBlocked) return 1;
  if (!session) return 0;
  if (session.settled) return 3;
  if (['PROCESSING', 'MANUAL_REVIEW', 'OBSERVED_SUCCESS'].includes(session.status)) return 2;
  if (isExpired) return 1;
  return 1;
}

const DEFAULT_BLOCKED_NOTICE = {
  title: 'Payment access suspended',
  subtitle: 'Session paused and account flagged for review',
  message:
    'Access is restricted due to unverified payment alert activity. Contact the campus administrator to review and clear your account.',
  investigating: true
};

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
  const [blockedNotice, setBlockedNotice] = useState(null);

  const [formData, setFormData] = useState({
    name: user?.name || '',
    regNo: accountEmail ? accountEmail.split('@')[0] : '',
    email: accountEmail,
    needsAccommodation: false,
    preferredVpa: '',
    method: 'UPI'
  });

  const [utr, setUtr] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [queueWaitSeconds, setQueueWaitSeconds] = useState(0);

  const [loading, setLoading] = useState(true);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [cancellingAction, setCancellingAction] = useState(false);
  const [verifyingNow, setVerifyingNow] = useState(false);
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [vpaCopied, setVpaCopied] = useState(false);
  const [orderCopied, setOrderCopied] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [showDayLimitGuide, setShowDayLimitGuide] = useState(false);
  const [showAllUpiApps, setShowAllUpiApps] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [error, setError] = useState('');

  const sseRef = useRef(null);

  const effectiveEmail = isStudentAccount
    ? accountEmail
    : formData.email.trim() || accountEmail;

  const availableVpaOptions = useMemo(() => {
    const raw = [
      eventDoc?.paymentUpiId,
      ...(Array.isArray(eventDoc?.backupPaymentUpiIds) ? eventDoc.backupPaymentUpiIds : []),
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
  }, [eventDoc?.backupPaymentUpiIds, eventDoc?.paymentUpiId, youpiConfig?.backupVpas, youpiConfig?.defaultPayeeVpa]);

  const effectivePreferredVpa =
    (formData.preferredVpa &&
    (availableVpaOptions.length === 0 ||
      availableVpaOptions.some((v) => v.toLowerCase() === formData.preferredVpa.toLowerCase()))
      ? formData.preferredVpa
      : availableVpaOptions[0]) || '';

  useEffect(() => {
    if (!session && youpiConfig?.defaultMethod) {
      setFormData((p) => ({ ...p, method: youpiConfig.defaultMethod }));
    }
  }, [session, youpiConfig?.defaultMethod]);

  const applySessionUpdate = useCallback((dto) => {
    if (!dto) return;
    if (dto.status === 'BLOCKED' || dto.isBanned || dto.fraudDetected) {
      setBlockedNotice(dto.blockedNotice || DEFAULT_BLOCKED_NOTICE);
    } else if (dto.status === 'FAILED' && String(dto.failureReason || '').includes('FRAUDULENT')) {
      setBlockedNotice(DEFAULT_BLOCKED_NOTICE);
    }
    setSession(dto);
    if (dto.utr) setUtr(dto.utr);
    if (dto.status === 'QUEUED') {
      setQueueWaitSeconds(Number(dto.estimatedWaitSeconds) || 0);
    }
  }, []);

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
          applySessionUpdate(nextSession);
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
        if (err.response?.data?.code === 'BANNED_IDENTITY' || err.response?.data?.isBanned) {
          setBlockedNotice(DEFAULT_BLOCKED_NOTICE);
        } else if (!silent) {
          setError(err.response?.data?.message || 'Unable to load payment session.');
        }
        return null;
      } finally {
        if (!silent) setSyncing(false);
      }
    },
    [applySessionUpdate, backendUrl, eventDoc, loadCompetitionsForEvent]
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

  // Dual timer countdown ticker: 300s ACTIVE window + strict 30s PROCESSING window + QUEUED ETA
  useEffect(() => {
    if (!session) {
      setSecondsLeft(0);
      return undefined;
    }

    if (session.status === 'QUEUED') {
      setQueueWaitSeconds(Number(session.estimatedWaitSeconds) || 0);
      const qTimer = setInterval(() => {
        setQueueWaitSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(qTimer);
    }

    const targetIso =
      session.status === 'PROCESSING' ? session.processingExpiresAt : session.expiresAt;
    if (!targetIso || !['ACTIVE', 'PROCESSING'].includes(session.status)) {
      setSecondsLeft(session.timeRemainingSeconds || 0);
      return undefined;
    }

    const tick = () => {
      const rem = Math.max(0, Math.ceil((new Date(targetIso).getTime() - Date.now()) / 1000));
      setSecondsLeft(rem);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session?.expiresAt, session?.processingExpiresAt, session?.status, session?.timeRemainingSeconds, session?.estimatedWaitSeconds, session]);

  // Real-time SSE stream + fallback poller
  useEffect(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setSseConnected(false);

    if (
      !session?.paymentId ||
      session.settled ||
      blockedNotice ||
      ['EXPIRED', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(session.status)
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
            applySessionUpdate(dto);
            if (dto.settled) {
              setBannerMessage('Statement reconciled. Event pass, WhatsApp group, and competitions unlocked');
            } else if (dto.status === 'OBSERVED_SUCCESS') {
              setBannerMessage(
                `Bank credit alert observed (${dto.verificationTag || 'awaiting match'}). Unlocks after bank statement reconciliation`
              );
            } else if (dto.status === 'ACTIVE' && session.status === 'QUEUED') {
              setBannerMessage('Your checkout slot is now active and your dynamic UPI QR is ready');
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

    const pollMs = ['QUEUED', 'PROCESSING'].includes(session.status) ? 2500 : 4500;
    const fallbackInterval = setInterval(() => {
      loadSessionById(session.paymentId, true);
    }, pollMs);

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      clearInterval(fallbackInterval);
    };
  }, [applySessionUpdate, backendUrl, blockedNotice, loadSessionById, session?.paymentId, session?.settled, session?.status]);

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
          preferredVpa: effectivePreferredVpa || undefined,
          method: formData.method || 'UPI',
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
        applySessionUpdate(created);
        if (routePaymentId !== created.paymentId) {
          navigate(`/payment/${created.paymentId}`, { replace: true });
        }
      }
    } catch (err) {
      if (err.response?.status === 403 && (err.response?.data?.isBanned || err.response?.data?.code === 'BANNED_IDENTITY')) {
        setBlockedNotice(DEFAULT_BLOCKED_NOTICE);
      } else {
        setError(err.response?.data?.message || 'Unable to start UPI payment session.');
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  const handlePaymentDone = async () => {
    if (!session?.paymentId) return;
    const token = localStorage.getItem('token');
    try {
      setError('');
      setBannerMessage('');
      setVerifyingNow(true);
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/payment-done`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.session) {
        applySessionUpdate(res.data.session);
        if (res.data.session.settled) {
          setBannerMessage('Payment reconciled and event pass unlocked');
        } else if (res.data.session.status === 'OBSERVED_SUCCESS') {
          setBannerMessage(
            `Bank alert observed (${res.data.session.verificationTag || 'awaiting match'}). Unlocks after bank statement import`
          );
        } else if (res.data.session.status === 'PROCESSING') {
          setBannerMessage(
            'Entered 30-second bank verification window. Listening for incoming SMS or Gmail bank alerts'
          );
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to enter 30s verification window');
    } finally {
      setVerifyingNow(false);
    }
  };

  const handleSubmitUtr = async (e) => {
    e.preventDefault();
    if (!session?.paymentId) return;
    const cleaned = utr.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9-]{6,35}$/.test(cleaned)) {
      setError('Enter a valid 6–35 character UPI / UTR reference number');
      return;
    }

    const token = localStorage.getItem('token');
    try {
      setError('');
      setBannerMessage('');
      setSubmittingUtr(true);
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/manual-utr`,
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
        applySessionUpdate(res.data.session);
        if (res.data.session.settled) {
          setBannerMessage('Payment verified and registration confirmed');
        } else {
          setBannerMessage(
            res.data.message ||
              'UTR submitted. Merchant reconciliation against the bank statement will unlock your pass'
          );
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'UTR submission failed. Check the reference ID.');
    } finally {
      setSubmittingUtr(false);
    }
  };

  const handleCancelAndChangeConfig = async () => {
    const returnEvId = session?.eventId || eventDoc?._id || activeEventId;
    if (session?.paymentId && session.status !== 'PROCESSING' && session.canCancel !== false) {
      const token = localStorage.getItem('token');
      try {
        setError('');
        setCancellingAction(true);
        await axios.post(
          `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/cancel`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err) {
        if (err.response?.status === 409) {
          setError(err.response?.data?.message || 'Cannot cancel during active verification.');
          setCancellingAction(false);
          return;
        }
      } finally {
        setCancellingAction(false);
      }
    }

    setFormData((prev) => ({
      ...prev,
      name: session?.customerName || prev.name,
      regNo: session?.customerRegNo || prev.regNo,
      preferredVpa: session?.payeeVpa || prev.preferredVpa,
      method: session?.method || prev.method || 'UPI'
    }));
    setSession(null);
    setUtr('');
    setBannerMessage('');
    setError('');
    if (returnEvId) {
      navigate(`/events/${returnEvId}/checkout`, { replace: true });
    }
  };

  const handleCancelAndExit = async () => {
    if (session?.paymentId && session.status !== 'PROCESSING' && session.canCancel !== false) {
      const token = localStorage.getItem('token');
      try {
        await axios.post(
          `${backendUrl}/api/payments/youpi/sessions/${session.paymentId}/cancel`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {
        // ignore cancel cleanup error
      }
    }
    const target = session?.eventId || eventDoc?._id || activeEventId;
    navigate(target ? `/events/${target}` : '/events');
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
        ((session.status === 'PROCESSING' ? session.processingExpiresAt : session.expiresAt) &&
          secondsLeft <= 0)));
  const isTerminalError = session && ['FAILED', 'CANCELLED'].includes(session.status);
  const isBlocked = Boolean(blockedNotice || session?.status === 'BLOCKED');
  const currentStep = computeCurrentStep(session, isExpired, isBlocked);

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

  const totalTimerSecs =
    session?.status === 'PROCESSING'
      ? Math.max(10, Math.round((youpiConfig?.processingWindowMs || 30000) / 1000))
      : Math.max(30, youpiConfig?.sessionTtlSeconds || 300);
  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringRatio = totalTimerSecs > 0 ? Math.max(0, Math.min(1, secondsLeft / totalTimerSecs)) : 0;
  const ringOffset = ringCircumference * (1 - ringRatio);

  if (loading) {
    return (
      <div className="min-h-[65vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="h-9 w-9 rounded-full border-2 border-[#e09132]/30 border-t-[#ebb05d] animate-spin" />
        <div>
          <p className="text-[15px] font-medium text-[#efe9de]">Preparing payment session</p>
          <p className="text-[12px] text-[#8a847a] mt-1">
            Locking payee VPA snapshot and live verification stream
          </p>
        </div>
      </div>
    );
  }

  const returnEventId = session?.eventId || eventDoc?._id || activeEventId;
  const upiApps = session?.upiAppIntents || [];
  const visibleApps = showAllUpiApps ? upiApps : upiApps.slice(0, 6);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* Top Gateway Header */}
      <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[14px] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Link
            to={returnEventId ? `/events/${returnEventId}` : '/events'}
            className="h-9 w-9 rounded-[8px] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/[0.08] flex items-center justify-center text-[#efe9de] shrink-0 transition-colors duration-150"
            title="Back to event"
          >
            <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.5} />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-mono">
              <span className="inline-flex items-center gap-1.5 font-medium px-2.5 py-0.5 rounded-[6px] bg-[#e09132]/15 text-[#ebb05d] border border-[#e09132]/30">
                <ShieldCheckIcon className="h-4 w-4" strokeWidth={1.5} />
                <span>YouPI-PG V2</span>
              </span>
              {session?.method && (
                <span className="text-[#aaa398]">
                  {session.method}
                </span>
              )}
              {session?.orderId && (
                <button
                  type="button"
                  onClick={() => handleCopyText(session.orderId, setOrderCopied)}
                  className="inline-flex items-center gap-1.5 text-[#aaa398] hover:text-[#efe9de] transition-colors duration-150"
                  title="Copy order reference"
                >
                  <span>·</span>
                  <span className="tabular-nums">{session.orderId}</span>
                  <ClipboardDocumentIcon className="h-3.5 w-3.5 text-[#ebb05d]" strokeWidth={1.5} />
                  {orderCopied && <span className="text-[#4cc38a]">Copied</span>}
                </button>
              )}
              {sseConnected && !session?.settled && !isBlocked && (
                <span className="inline-flex items-center gap-1.5 text-[#4cc38a]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4cc38a]" />
                  <span>Live stream</span>
                </span>
              )}
            </div>
            <h1 className="text-[20px] sm:text-[22px] font-medium text-[#efe9de] truncate mt-1">
              {session?.eventTitle || eventDoc?.title || 'Event pass checkout'}
            </h1>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 shrink-0">
          {STEP_LABELS.map((label, idx) => {
            const done = idx < currentStep || (idx === 3 && session?.settled);
            const active = idx === currentStep && !session?.settled;
            return (
              <div key={label} className="flex items-center gap-1.5 shrink-0">
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[12px] font-medium border transition-colors duration-150 ${
                    done
                      ? 'bg-[#4cc38a]/12 border-[#4cc38a]/30 text-[#4cc38a]'
                      : active
                        ? 'bg-[#e09132]/15 border-[#e09132]/35 text-[#ebb05d]'
                        : 'bg-[#161513] border-[#efe9de]/[0.06] text-[#8a847a]'
                  }`}
                >
                  <span className="font-mono tabular-nums">{idx + 1}.</span>
                  <span>{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-[10px] bg-[#e5484d]/10 border border-[#e5484d]/30 p-3.5 text-[13px] text-[#e5484d] flex items-start gap-2.5">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}

      {bannerMessage && (
        <div className="rounded-[10px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 p-3.5 text-[13px] text-[#efe9de] flex items-start gap-2.5">
          <CheckCircleIcon className="h-5 w-5 text-[#4cc38a] shrink-0 mt-0.5" strokeWidth={1.5} />
          <span>{bannerMessage}</span>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Summary, Fee Breakdown & Status */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[14px] p-5 space-y-4">
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
              <span className="text-[12px] text-[#8a847a]">
                Order summary
              </span>
              <h2 className="text-[18px] font-medium text-[#efe9de] mt-0.5">
                {session?.eventTitle || eventDoc?.title || 'Campus event pass'}
              </h2>
              <div className="mt-2 space-y-1 text-[12px] text-[#aaa398]">
                {formattedEventDate && (
                  <p className="flex items-center gap-1.5 font-mono tabular-nums">
                    <CalendarDaysIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                    <span>
                      {formattedEventDate} {eventDoc?.time ? `· ${eventDoc.time}` : ''}
                    </span>
                  </p>
                )}
                {eventDoc?.location && (
                  <p className="flex items-center gap-1.5">
                    <MapPinIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                    <span>{eventDoc.location}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[#efe9de]/[0.08] space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#8a847a]">Event pass amount</span>
                <span className="font-mono text-[#efe9de] tabular-nums">
                  {currencySymbol}
                  {Number(fee).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a847a]">YouPI-PG gateway fee</span>
                <span className="font-mono text-[#4cc38a] tabular-nums">₹0.00 (Free)</span>
              </div>
              <div className="pt-2 border-t border-[#efe9de]/[0.06] flex justify-between items-baseline">
                <span className="font-medium text-[#efe9de]">Total payable</span>
                <span className="text-[22px] font-mono font-medium text-[#ebb05d] tabular-nums">
                  {currencySymbol}
                  {session?.amountDisplay || Number(fee).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Countdown or Status Pill */}
            {session && !session.settled && (
              <div className="rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[12px] font-mono text-[#8a847a]">
                    Session status · {session.settlementState || 'PENDING'}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span
                      className={`text-[12px] font-mono font-medium px-2 py-0.5 rounded-[6px] border ${
                        isBlocked || isExpired || isTerminalError
                          ? 'bg-[#e5484d]/15 text-[#e5484d] border-[#e5484d]/30'
                          : ['PROCESSING', 'OBSERVED_SUCCESS', 'MANUAL_REVIEW', 'QUEUED'].includes(
                                session.status
                              )
                            ? 'bg-[#e09132]/15 text-[#ebb05d] border-[#e09132]/30'
                            : 'bg-[#4cc38a]/12 text-[#4cc38a] border-[#4cc38a]/25'
                      }`}
                    >
                      {isBlocked
                        ? 'BLOCKED'
                        : isExpired
                          ? 'EXPIRED'
                          : session.status}
                    </span>
                    {session.status === 'PROCESSING' && (
                      <span className="text-[12px] text-[#ebb05d]">
                        30s bank check in progress
                      </span>
                    )}
                    {session.status === 'QUEUED' && (
                      <span className="text-[12px] font-mono text-[#ebb05d] tabular-nums">
                        Queue #{session.queuePosition || 1}
                      </span>
                    )}
                  </div>
                </div>

                {['ACTIVE', 'PROCESSING'].includes(session.status) && !isExpired && !isBlocked && (
                  <div className="relative flex items-center justify-center shrink-0">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                      <circle
                        cx="32"
                        cy="32"
                        r={ringRadius}
                        fill="none"
                        stroke="rgba(239,233,222,0.1)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r={ringRadius}
                        fill="none"
                        stroke="#ebb05d"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                      />
                    </svg>
                    <span className="absolute text-[12px] font-mono font-medium text-[#efe9de] tabular-nums">
                      {formatCountdown(secondsLeft)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Attendee Summary */}
            <div className="rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.06] p-3.5 space-y-1.5 text-[12px]">
              <span className="text-[12px] text-[#8a847a] block">
                Attendee ticket holder
              </span>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Name</span>
                <span className="text-[#efe9de] font-medium truncate">
                  {session?.customerName || formData.name || user?.name}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Roll / reg no</span>
                <span className="font-mono text-[#ebb05d] tabular-nums">
                  {session?.customerRegNo || formData.regNo || '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8a847a]">Confirmation email</span>
                <span className="text-[#efe9de] truncate">
                  {session?.customerEmail || effectiveEmail}
                </span>
              </div>
              {session?.payeeVpa && (
                <div className="flex justify-between gap-2 pt-1.5 border-t border-[#efe9de]/[0.06]">
                  <span className="text-[#8a847a]">Locked receiver VPA</span>
                  <span className="font-mono text-[#ebb05d] truncate">{session.payeeVpa}</span>
                </div>
              )}
            </div>
          </div>

          {linkedCompetitions.length > 0 && !session?.settled && (
            <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[14px] p-4 space-y-2">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[#ebb05d]">
                <TrophyIcon className="h-4 w-4" strokeWidth={1.5} />
                <span>Included linked competitions ({linkedCompetitions.length})</span>
              </div>
              <p className="text-[12px] text-[#8a847a]">
                Bank statement reconciliation unlocks arena access for:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {linkedCompetitions.map((comp) => (
                  <span
                    key={comp._id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[#161513] border border-[#efe9de]/[0.08] text-[12px] text-[#efe9de]"
                  >
                    <LockClosedIcon className="h-3.5 w-3.5 text-[#ebb05d]" strokeWidth={1.5} />
                    <span>{comp.title}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Blocked / Pre-Checkout / Queue / Active / Processing / Observed / Review / Settled */}
        <div className="lg:col-span-7">
          {isBlocked ? (
            <div className="bg-[#1c1a18] border border-[#e5484d]/35 rounded-[14px] p-6 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-[10px] bg-[#e5484d]/15 border border-[#e5484d]/30 flex items-center justify-center text-[#e5484d] shrink-0">
                  <ShieldExclamationIcon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <span className="text-[12px] font-mono text-[#e5484d]">
                    Security engine · account suspended
                  </span>
                  <h2 className="text-[20px] font-medium text-[#efe9de] mt-0.5">
                    {blockedNotice?.title || DEFAULT_BLOCKED_NOTICE.title}
                  </h2>
                  <p className="text-[13px] font-medium text-[#e5484d] mt-0.5">
                    {blockedNotice?.subtitle || DEFAULT_BLOCKED_NOTICE.subtitle}
                  </p>
                  <p className="text-[13px] text-[#aaa398] mt-2 leading-relaxed">
                    {blockedNotice?.message || DEFAULT_BLOCKED_NOTICE.message}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[#efe9de]/[0.08] flex flex-wrap gap-3">
                <Link
                  to={returnEventId ? `/events/${returnEventId}` : '/events'}
                  className="btn-secondary h-10 px-5 text-[13px]"
                >
                  Return to event
                </Link>
              </div>
            </div>
          ) : !session ? (
            /* Step 1: Pre-checkout Attendee, Method (`UPI` vs `MANUAL_UPI`) & Receiver VPA Selection */
            <form
              onSubmit={(e) => handleStartCheckoutSession(e, false)}
              className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[14px] p-6 space-y-5"
            >
              <div>
                <h2 className="text-[19px] font-medium text-[#efe9de]">
                  Configure checkout method &amp; payee channel
                </h2>
                <p className="text-[13px] text-[#8a847a] mt-1">
                  Select verification mode and receiving UPI channel before locking your session snapshot
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#aaa398] mb-1.5">
                    Full name *
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
                    Roll / registration no. *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.regNo}
                    onChange={(e) => setFormData((p) => ({ ...p, regNo: e.target.value }))}
                    className="input-field font-mono tabular-nums"
                    placeholder="e.g. 2023503501"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[12px] font-medium text-[#aaa398]">
                    Confirmation email *
                  </label>
                  {isStudentAccount && (
                    <span className="text-[12px] font-mono px-2 py-0.5 rounded-[6px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25">
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
                  <EnvelopeIcon className="h-4 w-4 text-[#8a847a] absolute right-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
                </div>
              </div>

              {/* Verification Method Selection: UPI vs MANUAL_UPI */}
              <div className="space-y-2">
                <label className="block text-[12px] font-medium text-[#aaa398]">
                  Checkout verification method *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, method: 'UPI' }))}
                    className={`p-3.5 rounded-[10px] border text-left transition-colors duration-150 ${
                      formData.method === 'UPI'
                        ? 'bg-[#e09132]/12 border-[#e09132]/45 text-[#efe9de]'
                        : 'bg-[#161513] border-[#efe9de]/[0.08] text-[#aaa398] hover:border-[#efe9de]/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-[#efe9de] flex items-center gap-1.5">
                        <BoltIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                        <span>UPI Auto-Verify</span>
                      </span>
                      <span className="text-[12px] font-mono px-1.5 py-0.5 rounded-[6px] bg-[#262421] text-[#ebb05d]">
                        UPI
                      </span>
                    </div>
                    <p className="text-[12px] text-[#8a847a] mt-1 leading-relaxed">
                      Pay via QR or app, then trigger the 30s automated SMS/Gmail bank check
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, method: 'MANUAL_UPI' }))}
                    className={`p-3.5 rounded-[10px] border text-left transition-colors duration-150 ${
                      formData.method === 'MANUAL_UPI'
                        ? 'bg-[#e09132]/12 border-[#e09132]/45 text-[#efe9de]'
                        : 'bg-[#161513] border-[#efe9de]/[0.08] text-[#aaa398] hover:border-[#efe9de]/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-[#efe9de] flex items-center gap-1.5">
                        <DocumentCheckIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                        <span>Manual UTR Entry</span>
                      </span>
                      <span className="text-[12px] font-mono px-1.5 py-0.5 rounded-[6px] bg-[#262421] text-[#aaa398]">
                        MANUAL_UPI
                      </span>
                    </div>
                    <p className="text-[12px] text-[#8a847a] mt-1 leading-relaxed">
                      Pay and submit your 12-digit UTR reference for manual bank statement review
                    </p>
                  </button>
                </div>
              </div>

              {/* Receiving UPI Channel Pool (Pre-Checkout Only — Immutable Once Created) */}
              {availableVpaOptions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-[12px] font-medium text-[#aaa398]">
                      Receiving payee UPI channel ({availableVpaOptions.length} available)
                    </label>
                    <span className="inline-flex items-center gap-1 text-[12px] font-mono text-[#ebb05d]">
                      <LockClosedIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                      <span>Locked once session starts</span>
                    </span>
                  </div>
                  <select
                    value={effectivePreferredVpa}
                    onChange={(e) => setFormData((p) => ({ ...p, preferredVpa: e.target.value }))}
                    className="input-field font-mono text-[13px]"
                  >
                    {availableVpaOptions.map((vpa, index) => (
                      <option key={vpa} value={vpa}>
                        {index === 0 ? `Primary UPI · ${vpa}` : `Alternate UPI · ${vpa}`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[12px] text-[#8a847a]">
                    Payee VPA cannot change once the session starts; select your preferred handle first
                  </p>
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
                  className="btn-primary flex-1 h-11 text-[13px] tabular-nums"
                >
                  <CurrencyRupeeIcon className="h-4 w-4" strokeWidth={1.5} />
                  <span>
                    {submittingAction
                      ? 'Acquiring payment slot...'
                      : `Proceed to pay ${currencySymbol}${Number(fee).toFixed(2)}`}
                  </span>
                </button>
              </div>
            </form>
          ) : session.settled ? (
            /* Step 4: Verified Pass, WhatsApp Group & Unlocked Competitions */
            <div className="bg-[#1c1a18] border border-[#4cc38a]/35 rounded-[14px] p-6 space-y-6">
              <div className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-[10px] bg-[#4cc38a]/15 border border-[#4cc38a]/30 flex items-center justify-center text-[#4cc38a] shrink-0">
                  <CheckCircleIcon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <span className="text-[12px] font-mono text-[#4cc38a]">
                    Payment reconciled · seat confirmed
                  </span>
                  <h2 className="text-[22px] font-medium text-[#efe9de] mt-0.5">
                    Registration confirmed for {session.eventTitle}
                  </h2>
                  <p className="text-[13px] text-[#aaa398] mt-1">
                    Digital pass and receipt sent to{' '}
                    <span className="text-[#efe9de] font-medium">{session.customerEmail}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                <div>
                  <span className="block text-[12px] text-[#8a847a]">Registration number</span>
                  <span className="font-mono text-[#ebb05d] font-medium tabular-nums">
                    {session.registration?.regNo || session.customerRegNo}
                  </span>
                </div>
                <div>
                  <span className="block text-[12px] text-[#8a847a]">Amount paid</span>
                  <span className="font-mono text-[#4cc38a] font-medium tabular-nums">
                    {currencySymbol}
                    {session.amountDisplay} (0% fee)
                  </span>
                </div>
                <div>
                  <span className="block text-[12px] text-[#8a847a]">UTR / transaction ref</span>
                  <span className="font-mono text-[#efe9de] truncate block">
                    {session.utr || session.registration?.transactionId || session.orderId}
                  </span>
                </div>
                <div>
                  <span className="block text-[12px] text-[#8a847a]">Verification ledger</span>
                  <span className="font-mono text-[#4cc38a] text-[12px]">
                    {session.verificationTag || 'RECONCILED'}
                  </span>
                </div>
              </div>

              {session.whatsappGroupLink && (
                <div className="rounded-[10px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <ChatBubbleLeftRightIcon
                      className="h-5 w-5 text-[#4cc38a] shrink-0 mt-0.5"
                      strokeWidth={1.5}
                    />
                    <div>
                      <p className="text-[13px] font-medium text-[#efe9de]">
                        Official event WhatsApp group unlocked
                      </p>
                      <p className="text-[12px] text-[#aaa398]">
                        Schedule updates, coordinator alerts, and venue pins
                      </p>
                    </div>
                  </div>
                  <a
                    href={session.whatsappGroupLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[8px] text-[13px] font-medium bg-[#4cc38a] text-[#12110f] hover:bg-[#4cc38a]/90 transition-colors duration-150 shrink-0"
                  >
                    <span>Join WhatsApp group</span>
                    <ArrowUpRightIcon className="h-4 w-4" strokeWidth={1.5} />
                  </a>
                </div>
              )}

              {linkedCompetitions.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[13px] font-medium text-[#efe9de] flex items-center gap-2">
                    <TrophyIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                    <span>Unlocked competitions</span>
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
                        className="rounded-[10px] bg-[#161513] hover:bg-[#262421] border border-[#efe9de]/[0.08] p-3 flex items-center justify-between gap-2 transition-colors duration-150"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#efe9de] truncate">
                            {comp.title}
                          </p>
                          <p className="text-[12px] font-mono text-[#ebb05d] capitalize">
                            {comp.type} arena · enter
                          </p>
                        </div>
                        <ArrowUpRightIcon className="h-4 w-4 text-[#ebb05d] shrink-0" strokeWidth={1.5} />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2 border-t border-[#efe9de]/[0.08]">
                <Link to="/profile" className="btn-primary h-10 px-5 text-[13px]">
                  <TicketIcon className="h-4 w-4" strokeWidth={1.5} />
                  <span>View pass in profile</span>
                </Link>
                <Link
                  to={returnEventId ? `/events/${returnEventId}` : '/events'}
                  className="btn-secondary h-10 px-5 text-[13px]"
                >
                  Back to event page
                </Link>
              </div>
            </div>
          ) : session.status === 'QUEUED' ? (
            /* FIFO Single-Slot Queue Waiting Card (Zero-Trust: NO QR / VPA URI Revealed Yet!) */
            <div className="bg-[#1c1a18] border border-[#e09132]/35 rounded-[14px] p-6 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-[10px] bg-[#e09132]/15 border border-[#e09132]/30 flex items-center justify-center text-[#ebb05d] shrink-0">
                  <QueueListIcon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-mono px-2.5 py-0.5 rounded-[6px] bg-[#e09132]/15 text-[#ebb05d] border border-[#e09132]/30 tabular-nums">
                      Queue position #{session.queuePosition || 1} · FIFO
                    </span>
                    <span className="text-[12px] font-mono text-[#8a847a] tabular-nums">
                      Est. wait: {formatCountdown(queueWaitSeconds)}
                    </span>
                  </div>
                  <h2 className="text-[19px] font-medium text-[#efe9de] mt-2">
                    Exclusive checkout slot currently in use
                  </h2>
                  <p className="text-[13px] text-[#aaa398] mt-1 leading-relaxed">
                    To prevent ambiguous bank alert attribution on{' '}
                    <span className="font-mono text-[#efe9de]">{session.payeeVpa}</span>, only one payment runs per UPI ID at a time. Your QR code reveals automatically when your turn arrives.
                  </p>
                </div>
              </div>

              <div className="rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 flex items-center justify-between gap-3 text-[12px]">
                <span className="text-[#8a847a]">QR &amp; UPI deep links withheld while queued</span>
                <span className="font-mono text-[#4cc38a] shrink-0">Auto-promoting</span>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => loadSessionById(session.paymentId, false)}
                  disabled={syncing}
                  className="btn-primary h-10 px-5 text-[13px]"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  <span>{syncing ? 'Checking slot...' : 'Check slot status'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelAndChangeConfig}
                  disabled={cancellingAction}
                  className="btn-secondary h-10 px-5 text-[13px]"
                >
                  {cancellingAction ? 'Releasing...' : 'Cancel & pick another UPI ID'}
                </button>
              </div>
            </div>
          ) : session.status === 'OBSERVED_SUCCESS' ? (
            /* Zero-Trust OBSERVED_SUCCESS State (NOT_RECONCILED) */
            <div className="bg-[#1c1a18] border border-[#e09132]/35 rounded-[14px] p-6 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-[10px] bg-[#e09132]/15 border border-[#e09132]/30 flex items-center justify-center text-[#ebb05d] shrink-0">
                  <ClockIcon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <span className="text-[12px] font-mono px-2.5 py-0.5 rounded-[6px] bg-[#e09132]/15 text-[#ebb05d] border border-[#e09132]/30">
                    Alert observed · awaiting CSV match
                  </span>
                  <h2 className="text-[20px] font-medium text-[#efe9de] mt-2">
                    Payment observed — awaiting bank statement reconciliation
                  </h2>
                  <p className="text-[13px] text-[#aaa398] mt-1 leading-relaxed">
                    A live bank credit observation matched this session. Your pass, competitions, and WhatsApp group unlock once the admin imports the bank CSV or approves this transaction.
                  </p>
                </div>
              </div>

              <div className="rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                <div>
                  <span className="block text-[12px] text-[#8a847a]">Verification tag</span>
                  <span className="font-mono text-[#ebb05d] text-[12px]">
                    {session.verificationTag || 'OBSERVED_NOT_RECONCILED'}
                  </span>
                </div>
                <div>
                  <span className="block text-[12px] text-[#8a847a]">Level &amp; channels</span>
                  <span className="font-mono text-[#efe9de] text-[12px]">
                    L{session.verificationLevel || 1} ({(session.verificationSources || [session.observationSource]).filter(Boolean).join(' + ')})
                  </span>
                </div>
                {session.utr && (
                  <div>
                    <span className="block text-[12px] text-[#8a847a]">Observed bank ref / UTR</span>
                    <span className="font-mono text-[#4cc38a] text-[12px]">{session.utr}</span>
                  </div>
                )}
                <div>
                  <span className="block text-[12px] text-[#8a847a]">Observed amount</span>
                  <span className="font-mono text-[#efe9de] tabular-nums">
                    {currencySymbol}
                    {session.amountDisplay}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => loadSessionById(session.paymentId, false)}
                  disabled={syncing}
                  className="btn-primary h-10 px-5 text-[13px]"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  <span>{syncing ? 'Checking ledger...' : 'Sync settlement status'}</span>
                </button>
                <Link
                  to={returnEventId ? `/events/${returnEventId}` : '/events'}
                  className="btn-secondary h-10 px-5 text-[13px]"
                >
                  Back to event
                </Link>
              </div>
            </div>
          ) : session.status === 'MANUAL_REVIEW' ? (
            /* MANUAL_REVIEW / PENDING_VERIFICATION State */
            <div className="bg-[#1c1a18] border border-[#e09132]/35 rounded-[14px] p-6 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-[10px] bg-[#e09132]/15 border border-[#e09132]/30 flex items-center justify-center text-[#ebb05d] shrink-0">
                  <DocumentCheckIcon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <span className="text-[12px] font-mono px-2.5 py-0.5 rounded-[6px] bg-[#e09132]/15 text-[#ebb05d] border border-[#e09132]/30">
                    {session.settlementState === 'PENDING_VERIFICATION' || !session.settlementState
                      ? 'Pending bank verification'
                      : session.settlementState}
                  </span>
                  <h2 className="text-[20px] font-medium text-[#efe9de] mt-2">
                    {session.method === 'MANUAL_UPI'
                      ? 'UTR submitted — pending merchant bank verification'
                      : 'Payment held for manual bank review'}
                  </h2>
                  <p className="text-[13px] text-[#aaa398] mt-1 leading-relaxed">
                    {session.manualReviewNote ||
                      'Your payment details are recorded. Your Event Pass, WhatsApp group, and competitions unlock once verified against the merchant bank statement.'}
                  </p>
                </div>
              </div>

              <div className="rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                <div>
                  <span className="block text-[12px] text-[#8a847a]">Submitted UTR / reference</span>
                  <span className="font-mono text-[#ebb05d] text-[12px]">
                    {session.utr || 'Awaiting bank match'}
                  </span>
                </div>
                <div>
                  <span className="block text-[12px] text-[#8a847a]">Payee UPI snapshot</span>
                  <span className="font-mono text-[#efe9de] text-[12px] truncate block">{session.payeeVpa}</span>
                </div>
              </div>

              {session.canSubmitManualUtr && (
                <form onSubmit={handleSubmitUtr} className="space-y-3 pt-2 border-t border-[#efe9de]/[0.08]">
                  <label htmlFor="review-utr" className="block text-[12px] font-medium text-[#aaa398]">
                    Update 12-digit UPI / UTR reference
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      id="review-utr"
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
                      {submittingUtr ? 'Updating...' : 'Update UTR'}
                    </button>
                  </div>
                </form>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => loadSessionById(session.paymentId, false)}
                  disabled={syncing}
                  className="btn-primary h-10 px-5 text-[13px]"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  <span>{syncing ? 'Checking...' : 'Check settlement status'}</span>
                </button>
                <Link
                  to={returnEventId ? `/events/${returnEventId}` : '/events'}
                  className="btn-secondary h-10 px-5 text-[13px]"
                >
                  Back to event
                </Link>
              </div>
            </div>
          ) : session.status === 'PROCESSING' && !isExpired ? (
            /* Strict 30-Second PROCESSING Bank Observation Window */
            <div className="bg-[#1c1a18] border border-[#e09132]/35 rounded-[14px] p-6 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-[10px] bg-[#e09132]/15 border border-[#e09132]/30 flex items-center justify-center text-[#ebb05d] shrink-0">
                  <ClockIcon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <span className="text-[12px] font-mono px-2.5 py-0.5 rounded-[6px] bg-[#e09132]/15 text-[#ebb05d] border border-[#e09132]/30 tabular-nums">
                    Processing · {formatCountdown(secondsLeft)} remaining
                  </span>
                  <h2 className="text-[20px] font-medium text-[#efe9de] mt-2">
                    Listening for bank credit alert (30s window)
                  </h2>
                  <p className="text-[13px] text-[#aaa398] mt-1 leading-relaxed">
                    Scanning Android SMS Gateway &amp; bank Gmail IMAP alerts for an exact credit of{' '}
                    <strong className="font-mono font-medium text-[#ebb05d] tabular-nums">
                      {currencySymbol}
                      {session.amountDisplay}
                    </strong>{' '}
                    to <strong className="font-mono font-medium text-[#efe9de]">{session.payeeVpa}</strong>
                  </p>
                </div>
              </div>

              <div className="rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 flex items-center justify-between gap-3 text-[12px] text-[#aaa398]">
                <span className="flex items-center gap-2">
                  <LockClosedIcon className="h-4 w-4 text-[#ebb05d] shrink-0" strokeWidth={1.5} />
                  <span>Session cancel &amp; VPA switch locked during the 30s bank check</span>
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => loadSessionById(session.paymentId, false)}
                  disabled={syncing}
                  className="btn-primary h-10 px-5 text-[13px]"
                >
                  <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  <span>{syncing ? 'Checking...' : 'Check observation now'}</span>
                </button>
                <button
                  type="button"
                  disabled
                  title="Cannot cancel during 30s bank observation window"
                  className="btn-secondary h-10 px-4 text-[13px] opacity-40 cursor-not-allowed"
                >
                  Cancel locked · processing
                </button>
              </div>
            </div>
          ) : isExpired || isTerminalError ? (
            /* Expired / Failed / Cancelled Recovery Panel */
            <div className="bg-[#1c1a18] border border-[#e5484d]/35 rounded-[14px] p-6 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-[10px] bg-[#e5484d]/15 border border-[#e5484d]/30 flex items-center justify-center text-[#e5484d] shrink-0">
                  <ExclamationTriangleIcon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-[19px] font-medium text-[#efe9de]">
                    {isExpired
                      ? 'UPI checkout window expired'
                      : `Payment session ${session.status.toLowerCase()}`}
                  </h2>
                  <p className="text-[13px] text-[#aaa398] mt-1">
                    {session.failureReason ||
                      'Each UPI QR window remains open for 5 minutes for accurate bank matching.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleStartCheckoutSession(null, true)}
                  disabled={submittingAction}
                  className="btn-primary h-11 px-5 text-[13px]"
                >
                  <ArrowPathIcon
                    className={`h-4 w-4 ${submittingAction ? 'animate-spin' : ''}`}
                    strokeWidth={1.5}
                  />
                  <span>
                    {submittingAction ? 'Starting session...' : 'Retry same method & VPA'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelAndChangeConfig}
                  className="btn-secondary h-11 px-5 text-[13px]"
                >
                  Change UPI ID / method
                </button>
              </div>
            </div>
          ) : (
            /* Step 2: ACTIVE Session (`UPI` with I Have Paid -> 30s window, OR `MANUAL_UPI` with UTR form) */
            <div className="space-y-4">
              <div className="bg-[#1c1a18] border border-[#efe9de]/[0.08] rounded-[14px] p-5 sm:p-6 space-y-5">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                  {/* White-Backed Dynamic ISO UPI QR */}
                  <div className="flex flex-col items-center shrink-0">
                    <div className="bg-white p-3 rounded-[10px] border border-[#efe9de]/[0.12]">
                      {session.qrSvg ? (
                        <img
                          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(session.qrSvg)}`}
                          alt={`UPI QR for ${session.orderId}`}
                          className="w-44 h-44 block"
                        />
                      ) : (
                        <div className="w-44 h-44 flex items-center justify-center text-[#262421] text-[12px] font-mono">
                          QR unavailable
                        </div>
                      )}
                    </div>
                    <span className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-mono text-[#aaa398]">
                      <QrCodeIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                      <span>Scan with any UPI app</span>
                    </span>
                  </div>

                  {/* Immutable Payee Snapshot Details & 30 UPI Apps */}
                  <div className="flex-1 min-w-0 w-full space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[12px] font-mono text-[#8a847a]">
                          Receiving UPI snapshot
                        </span>
                        <span className="inline-flex items-center gap-1 text-[12px] font-mono px-2 py-0.5 rounded-[6px] bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08]">
                          <LockClosedIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                          <span>Locked</span>
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-[16px] font-medium text-[#efe9de]">
                          {session.payeeName || 'Avenor Campus Events'}
                        </span>
                        <span className="text-[12px] font-mono px-2 py-0.5 rounded-[6px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25">
                          Verified payee
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[8px] bg-[#12110f] border border-[#efe9de]/[0.1] px-3.5 py-2.5">
                        <span className="font-mono text-[13px] sm:text-[14px] text-[#ebb05d] truncate min-w-0 flex-1">
                          {session.payeeVpa}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(session.payeeVpa, setVpaCopied)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#262421] hover:bg-[#302d29] text-[12px] font-medium text-[#efe9de] border border-[#efe9de]/[0.08] shrink-0 transition-colors duration-150"
                        >
                          <ClipboardDocumentIcon className="h-3.5 w-3.5 text-[#ebb05d]" strokeWidth={1.5} />
                          <span>{vpaCopied ? 'Copied' : 'Copy VPA'}</span>
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#8a847a]">
                        <span>Need a backup UPI handle or manual UTR mode?</span>
                        <button
                          type="button"
                          onClick={handleCancelAndChangeConfig}
                          disabled={cancellingAction || !session.canCancel}
                          className="font-medium text-[#ebb05d] hover:underline disabled:opacity-40"
                        >
                          {cancellingAction ? 'Cancelling...' : 'Cancel & switch VPA / method'}
                        </button>
                      </div>
                    </div>

                    {/* All 30 UPI App Deep Links */}
                    {upiApps.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[12px] text-[#8a847a] whitespace-nowrap">
                            <DevicePhoneMobileIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                            <span>Quick-pay UPI apps ({upiApps.length})</span>
                          </span>
                          {upiApps.length > 6 && (
                            <button
                              type="button"
                              onClick={() => setShowAllUpiApps((v) => !v)}
                              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#ebb05d] hover:underline whitespace-nowrap shrink-0"
                            >
                              <span>{showAllUpiApps ? 'Show fewer' : `Show all ${upiApps.length}`}</span>
                              {showAllUpiApps ? (
                                <ChevronUpIcon className="h-4 w-4" strokeWidth={1.5} />
                              ) : (
                                <ChevronDownIcon className="h-4 w-4" strokeWidth={1.5} />
                              )}
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-0.5">
                          {visibleApps.map((app) => {
                            const svgDataUrl = app.svgLogo
                              ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(app.svgLogo)}`
                              : '';
                            return (
                              <a
                                key={app.id}
                                href={app.upiUri}
                                title={`Pay using ${app.name || app.shortName}`}
                                className="flex items-center gap-2.5 h-10 px-3 rounded-[8px] bg-[#161513] hover:bg-[#262421] border border-[#efe9de]/[0.08] text-[12px] text-[#efe9de] transition-colors duration-150"
                              >
                                {app.iconUrl || svgDataUrl ? (
                                  <img
                                    src={app.iconUrl || svgDataUrl}
                                    alt={app.shortName}
                                    onError={(e) => {
                                      if (svgDataUrl && e.currentTarget.src !== svgDataUrl) {
                                        e.currentTarget.src = svgDataUrl;
                                      } else {
                                        e.currentTarget.style.display = 'none';
                                      }
                                    }}
                                    className="h-5 w-5 rounded-[4px] object-contain shrink-0"
                                  />
                                ) : (
                                  <span
                                    className="h-3 w-3 rounded-full shrink-0"
                                    style={{ backgroundColor: app.brandColor || '#ebb05d' }}
                                  />
                                )}
                                <span className="truncate font-medium">
                                  {app.shortName}
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Google Pay "Day limit exceeded" Fix Banner */}
                <div className="rounded-[10px] bg-[#e09132]/[0.08] border border-[#e09132]/30 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[#ebb05d] text-[13px] font-medium">
                      <InformationCircleIcon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                      <span>
                        Google Pay &ldquo;Day limit exceeded for this transaction&rdquo; help
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDayLimitGuide((v) => !v)}
                      className="text-[12px] font-mono text-[#ebb05d] hover:underline shrink-0"
                    >
                      {showDayLimitGuide ? 'Hide steps' : 'How to fix'}
                    </button>
                  </div>
                  <p className="text-[12px] text-[#aaa398] leading-relaxed">
                    Google Pay caps scanned QR &amp; gallery intents at{' '}
                    <span className="text-[#efe9de] font-medium tabular-nums">₹2,000/day</span>. Workarounds:
                  </p>
                  <div
                    className={`grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[12px] text-[#aaa398] ${
                      showDayLimitGuide ? '' : 'hidden sm:grid'
                    }`}
                  >
                    <div className="rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.07] p-2.5">
                      <span className="block font-medium text-[#ebb05d] mb-0.5">
                        1. Copy &amp; pay manually
                      </span>
                      Click Copy VPA above, open GPay, choose &ldquo;Pay UPI ID or number&rdquo;, and send ₹{session.amountDisplay}
                    </div>
                    <div className="rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.07] p-2.5">
                      <span className="block font-medium text-[#ebb05d] mb-0.5">
                        2. Switch UPI pre-checkout
                      </span>
                      Use Cancel &amp; switch VPA above to pick an alternate merchant UPI handle
                    </div>
                    <div className="rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.07] p-2.5">
                      <span className="block font-medium text-[#ebb05d] mb-0.5">
                        3. Try PhonePe / Paytm / BHIM
                      </span>
                      Other UPI apps scan this same QR without Google Pay&apos;s QR cap
                    </div>
                  </div>
                </div>

                {session.paymentInstructions && (
                  <p className="text-[12px] text-[#aaa398] bg-[#161513] border border-[#efe9de]/[0.06] rounded-[10px] p-3">
                    <span className="font-medium text-[#efe9de]">Organizer note: </span>
                    {session.paymentInstructions}
                  </p>
                )}

                {/* Primary Verification Action (Strictly Method-Separated: UPI vs MANUAL_UPI) */}
                {session.method === 'MANUAL_UPI' ? (
                  <form onSubmit={handleSubmitUtr} className="pt-3 border-t border-[#efe9de]/[0.08] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-[14px] font-medium text-[#efe9de]">
                          Submit 12-digit UPI / UTR reference
                        </h3>
                        <p className="text-[12px] text-[#8a847a] tabular-nums">
                          After scanning the QR and paying ₹{session.amountDisplay}, enter your UPI reference number below
                        </p>
                      </div>
                      {session.allowDemoUtr && (
                        <button
                          type="button"
                          onClick={() => setUtr(`4128${Date.now().toString().slice(-8)}`)}
                          className="text-[12px] font-mono text-[#ebb05d] hover:underline shrink-0"
                        >
                          Fill test UTR
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
                        className="btn-primary h-10 px-5 text-[13px] shrink-0"
                      >
                        {submittingUtr ? 'Submitting UTR...' : 'Submit UTR for review'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="pt-2 border-t border-[#efe9de]/[0.08] space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={handlePaymentDone}
                        disabled={verifyingNow || !session.canClickPaymentDone}
                        className="btn-primary flex-1 h-11 text-[13px]"
                      >
                        <BoltIcon
                          className="h-4 w-4"
                          strokeWidth={1.5}
                        />
                        <span>
                          {verifyingNow
                            ? 'Entering 30s verification window...'
                            : 'I have paid — verify payment (30s window)'}
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
                          strokeWidth={1.5}
                        />
                        <span>Refresh</span>
                      </button>
                    </div>
                    <p className="text-[12px] text-[#8a847a]">
                      Want to enter a 12-digit UTR manually instead?{' '}
                      <button
                        type="button"
                        onClick={handleCancelAndChangeConfig}
                        className="text-[#ebb05d] hover:underline"
                      >
                        Cancel and switch to manual UTR mode
                      </button>
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-[#efe9de]/[0.06] flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#8a847a]">
                  {session.checkoutUrl ? (
                    <a
                      href={session.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-[#ebb05d] transition-colors duration-150"
                    >
                      <span>Standalone YouPI portal</span>
                      <ArrowUpRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </a>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={handleCancelAndExit}
                    disabled={session.status === 'PROCESSING' || session.canCancel === false}
                    className="hover:text-[#e5484d] transition-colors duration-150 disabled:opacity-40"
                  >
                    Cancel checkout &amp; return
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
