import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { format } from 'date-fns';
import {
  CalendarIcon,
  MapPinIcon,
  UserGroupIcon,
  PencilIcon,
  TrashIcon,
  ArrowLeftIcon,
  TrophyIcon,
  AcademicCapIcon,
  HeartIcon,
  BookmarkIcon,
  ArrowUpRightIcon,
  CheckBadgeIcon,
  ChatBubbleLeftIcon,
  CurrencyRupeeIcon,
  LockClosedIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentCheckIcon,
  MagnifyingGlassIcon,
  EnvelopeIcon,
  CheckIcon,
  PlusIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import {
  HeartIcon as HeartSolidIcon,
  BookmarkIcon as BookmarkSolidIcon
} from '@heroicons/react/24/solid';
import { getBackendUrl } from '../../utils/apiConfig';
import CommentsSection from '../../components/feed/CommentsSection';
import ClubLogo from '../../components/feed/ClubLogo';
import EventRegistration from '../../components/events/EventRegistration';
import AvenorLoader from '../../components/common/AvenorLoader';
import { getEventLifecycle, formatCount, resolveMediaUrl } from '../../utils/eventLifecycle';

const EventDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState('');
  const [eventCompetitions, setEventCompetitions] = useState([]);
  const [feedMeta, setFeedMeta] = useState(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [roster, setRoster] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({
    total: 0,
    confirmed: 0,
    present: 0,
    absent: 0,
    unmarked: 0,
    attendanceRate: 0
  });
  const [rosterLoading, setRosterLoading] = useState(false);
  const [attendanceFilter, setAttendanceFilter] = useState('all');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [markingRegId, setMarkingRegId] = useState('');
  const [resendingRegId, setResendingRegId] = useState('');
  const [resendNotice, setResendNotice] = useState('');
  const [bulkMarking, setBulkMarking] = useState(false);
  const backendUrl = getBackendUrl();

  const fetchFeedMeta = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/feed/event/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setFeedMeta(res.data);
    } catch {
      // Non-critical
    }
  }, [backendUrl, id]);

  const fetchEventCompetitions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/competitions?eventId=${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setEventCompetitions(res.data || []);
    } catch (err) {
      // Non-critical
    }
  }, [backendUrl, id]);

  const fetchEventDetails = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/events/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setEvent(response.data);
      if (Array.isArray(response.data?.linkedCompetitions)) {
        setEventCompetitions(prev => (prev.length > 0 ? prev : response.data.linkedCompetitions));
      }
    } catch (error) {
      if (!silent) setError('Error fetching event details');
      console.error('Error:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [backendUrl, id]);

  const fetchAttendanceRoster = useCallback(async (silent = false) => {
    const token = localStorage.getItem('token');
    if (!token || !user || !['admin', 'organizer'].includes(user.role)) return;
    try {
      if (!silent) setRosterLoading(true);
      const res = await axios.get(`${backendUrl}/api/registrations/event/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoster(res.data?.registrations || []);
      if (res.data?.summary) {
        setAttendanceSummary(res.data.summary);
      }
    } catch {
      // Non-owner organizers return 403 silently
    } finally {
      if (!silent) setRosterLoading(false);
    }
  }, [backendUrl, id, user]);

  useEffect(() => {
    fetchEventDetails(false);
    fetchEventCompetitions();
    fetchFeedMeta();
  }, [fetchEventDetails, fetchEventCompetitions, fetchFeedMeta]);

  const canManageEvent = Boolean(
    event &&
      user &&
      (user.role === 'admin' || event.organizer?._id === user._id || event.organizer === user._id)
  );

  useEffect(() => {
    if (canManageEvent) {
      fetchAttendanceRoster(false);
    }
  }, [canManageEvent, fetchAttendanceRoster]);

  const handleMarkAttendance = async (registrationId, attendanceStatus) => {
    try {
      setActionError('');
      setMarkingRegId(registrationId);
      const token = localStorage.getItem('token');
      const res = await axios.patch(
        `${backendUrl}/api/registrations/${registrationId}/attendance`,
        { attendanceStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.registration) {
        setRoster(prev => prev.map(r => (r._id === registrationId ? res.data.registration : r)));
      }
      if (res.data?.summary) {
        setAttendanceSummary(res.data.summary);
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to update attendance status.');
    } finally {
      setMarkingRegId('');
    }
  };

  const handleBulkAttendance = async (attendanceStatus) => {
    try {
      setActionError('');
      setBulkMarking(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/registrations/event/${id}/attendance/bulk`,
        { attendanceStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.registrations) {
        setRoster(res.data.registrations);
      }
      if (res.data?.summary) {
        setAttendanceSummary(res.data.summary);
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to run bulk attendance update.');
    } finally {
      setBulkMarking(false);
    }
  };

  const handleResendEmail = async (registrationId) => {
    try {
      setActionError('');
      setResendNotice('');
      setResendingRegId(registrationId);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/registrations/${registrationId}/resend-email`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResendNotice(res.data?.message || 'Confirmation email dispatched.');
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to resend confirmation email.');
    } finally {
      setResendingRegId('');
    }
  };

  const handleOpenRegistrationModal = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setActionError('');
    if (event?.myRegistration?.youpiPaymentId && event?.myRegistration?.paymentStatus !== 'paid') {
      navigate(`/payment/${event.myRegistration.youpiPaymentId}`);
      return;
    }
    setShowRegisterModal(true);
  };

  const handleCancelBooking = async () => {
    try {
      setBookingBusy(true);
      setActionError('');
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/events/${id}/cancel`,
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await Promise.all([fetchEventDetails(true), fetchEventCompetitions(), fetchFeedMeta()]);
    } catch (error) {
      console.error('Error cancelling booking:', error);
      setActionError(error.response?.data?.message || 'Failed to cancel booking.');
    } finally {
      setBookingBusy(false);
    }
  };

  const handleToggleLike = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!feedMeta?.postId) return;
    const nextLiked = !feedMeta.isLiked;
    setFeedMeta(prev => ({
      ...prev,
      isLiked: nextLiked,
      likesCount: Math.max(0, (prev.likesCount || 0) + (nextLiked ? 1 : -1))
    }));
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextLiked
        ? await axios.post(`${backendUrl}/api/feed/posts/${feedMeta.postId}/like`, {}, { headers })
        : await axios.delete(`${backendUrl}/api/feed/posts/${feedMeta.postId}/like`, { headers });
      setFeedMeta(prev => ({ ...prev, isLiked: res.data.liked, likesCount: res.data.likesCount }));
    } catch {
      fetchFeedMeta();
    }
  };

  const handleToggleSave = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!feedMeta?.postId) return;
    const nextSaved = !feedMeta.isSaved;
    setFeedMeta(prev => ({
      ...prev,
      isSaved: nextSaved,
      savesCount: Math.max(0, (prev.savesCount || 0) + (nextSaved ? 1 : -1))
    }));
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextSaved
        ? await axios.post(`${backendUrl}/api/feed/posts/${feedMeta.postId}/save`, {}, { headers })
        : await axios.delete(`${backendUrl}/api/feed/posts/${feedMeta.postId}/save`, { headers });
      setFeedMeta(prev => ({ ...prev, isSaved: res.data.saved, savesCount: res.data.savesCount }));
    } catch {
      fetchFeedMeta();
    }
  };

  const handleToggleFollowClub = async () => {
    const club = feedMeta?.club || event?.club;
    if (!club?._id) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const nextFollow = !club.isFollowing;
    const nextCount = Math.max(0, Number(club.followersCount || 0) + (nextFollow ? 1 : -1));
    setFeedMeta(prev => ({
      ...prev,
      club: { ...(prev?.club || club), isFollowing: nextFollow, followersCount: nextCount }
    }));
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextFollow
        ? await axios.post(`${backendUrl}/api/clubs/${club._id}/follow`, {}, { headers })
        : await axios.delete(`${backendUrl}/api/clubs/${club._id}/follow`, { headers });
      setFeedMeta(prev => ({
        ...prev,
        club: { ...(prev?.club || club), isFollowing: res.data.following, followersCount: res.data.followersCount }
      }));
    } catch {
      fetchFeedMeta();
    }
  };

  const handleShare = async () => {
    const fullUrl = `${window.location.origin}/events/${id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: event?.title || 'Avenor Event',
          text: event?.title || 'Check out this campus event on Avenor',
          url: fullUrl
        });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      window.prompt('Copy event link:', fullUrl);
    }
  };

  const handleDeleteEvent = async () => {
    if (
      window.confirm(
        'Are you sure you want to permanently delete this event? This will remove all bookings, linked competitions, and photos to clean up database space.'
      )
    ) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${backendUrl}/api/events/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        navigate('/events');
      } catch (error) {
        console.error('Error deleting event:', error);
        alert(error.response?.data?.message || 'Failed to delete event');
      }
    }
  };

  const handleDownloadRegistrations = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/registrations/event/${id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute(
        'download',
        `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_registrations.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading registrations:', error);
    }
  };

  const handleDownloadCertificate = async () => {
    try {
      setActionError('');
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/registrations/event/${id}/certificate`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute(
        'download',
        `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_certificate.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading certificate:', error);
      setActionError('Complete event payment and registration before downloading your certificate.');
    }
  };

  if (loading) {
    return <AvenorLoader variant="section" label="Loading event details..." />;
  }

  if (error || !event) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-[#e5484d] text-[14px]">{error || 'Event not found'}</p>
        <button onClick={() => navigate('/events')} className="btn-secondary h-9 px-4 text-[13px]">
          <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.5} />
          <span>Back to events</span>
        </button>
      </div>
    );
  }

  const attendees = event.attendees || [];
  const isAttending =
    attendees.some(a => (a._id || a) === user?._id) ||
    Boolean(feedMeta?.isRegistered) ||
    Boolean(event.myRegistration && event.myRegistration.status !== 'cancelled');
  const isOrganizer = event.organizer?._id === user?._id || event.organizer === user?._id;
  const isAdmin = user?.role === 'admin';
  const clubInfo = feedMeta?.club || event.club;
  const lifecycle = getEventLifecycle(event, isAttending);
  const availableSeats = Math.max(0, Number(event.capacity || 0) - attendees.length);
  const fee = Number(event.registrationFee || 0);
  const isPaidEvent = Boolean(event.isPaid && fee > 0);
  const currencySymbol = event.currency && event.currency !== 'INR' ? `${event.currency} ` : '₹';
  const feeLabel = isPaidEvent ? `${currencySymbol}${fee}` : 'Free';
  const isPaidRegistration = Boolean(
    event.myRegistration?.paymentStatus === 'paid' || feedMeta?.isPaidRegistration
  );
  const myYoupiStatus =
    event.myRegistration?.youpiStatus || feedMeta?.event?.youpiStatus || '';
  const isObservedPending = Boolean(
    isPaidEvent && !isPaidRegistration && myYoupiStatus === 'OBSERVED_SUCCESS'
  );
  const isManualReview = Boolean(
    isPaidEvent && !isPaidRegistration && myYoupiStatus === 'MANUAL_REVIEW'
  );
  const isProcessingOrQueued = Boolean(
    isPaidEvent && !isPaidRegistration && ['PROCESSING', 'QUEUED'].includes(myYoupiStatus)
  );
  const needsPaymentCompletion = Boolean(isAttending && isPaidEvent && !isPaidRegistration);
  const isStudent = user?.role === 'student' || !isAuthenticated;

  const photoSrc = resolveMediaUrl(event.photo);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate('/events')}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#aaa398] hover:text-[#efe9de] transition-colors duration-150"
        >
          <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.5} />
          <span>Back to events</span>
        </button>

        <Link
          to="/campus-feed"
          className="text-[13px] font-medium text-[#ebb05d] hover:text-[#efe9de] transition-colors duration-150"
        >
          Open Campus Feed
        </Link>
      </div>

      <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] overflow-hidden">
        {photoSrc && (
          <div className="aspect-[21/9] bg-[#12110f] border-b border-[#efe9de]/[0.08] overflow-hidden">
            <img
              src={photoSrc}
              alt={event.title}
              className="w-full h-full object-cover object-center"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
        )}

        <div className="p-6 sm:p-8 border-b border-[#efe9de]/[0.08] flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex px-2.5 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08]">
                {event.department}
              </span>
              {event.category && (
                <span className="inline-flex px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#161513] text-[#aaa398] border border-[#efe9de]/[0.08]">
                  {event.category}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono border ${
                  isPaidEvent
                    ? 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/30'
                    : 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                }`}
              >
                {isPaidEvent && <CurrencyRupeeIcon className="h-3.5 w-3.5" strokeWidth={1.5} />}
                <span>{feeLabel}</span>
              </span>
            </div>
            <h1 className="text-[24px] sm:text-[28px] font-medium text-[#efe9de] tracking-[-0.015em] leading-[1.2]">
              {event.title}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#aaa398]">
              {clubInfo && (
                <span className="inline-flex items-center gap-2">
                  <Link
                    to={`/clubs/${clubInfo._id}`}
                    className="inline-flex items-center gap-2 font-medium text-[#efe9de] hover:text-[#ebb05d] transition-colors"
                  >
                    <ClubLogo club={clubInfo} size="sm" />
                    <span>{clubInfo.name}</span>
                    {clubInfo.verified !== false && (
                      <CheckBadgeIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={handleToggleFollowClub}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] font-medium transition-colors ${
                      clubInfo.isFollowing
                        ? 'bg-[#262421] text-[#4cc38a] border border-[#4cc38a]/25'
                        : 'bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.1]'
                    }`}
                  >
                    {clubInfo.isFollowing ? (
                      <>
                        <CheckIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <PlusIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        <span>Follow</span>
                      </>
                    )}
                  </button>
                </span>
              )}
              <span>Organized by {event.organizer?.name || 'Department coordinator'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {feedMeta?.postId && (
              <>
                <button
                  type="button"
                  onClick={handleToggleLike}
                  className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-[8px] text-[13px] font-mono tabular-nums border transition-colors ${
                    feedMeta.isLiked
                      ? 'bg-[#e5484d]/12 text-[#e5484d] border-[#e5484d]/30'
                      : 'bg-[#262421] text-[#aaa398] hover:text-[#efe9de] border-[#efe9de]/10'
                  }`}
                >
                  {feedMeta.isLiked ? (
                    <HeartSolidIcon className="h-4 w-4" />
                  ) : (
                    <HeartIcon className="h-4 w-4" strokeWidth={1.5} />
                  )}
                  <span>{formatCount(feedMeta.likesCount)}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleSave}
                  className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-[8px] text-[13px] font-medium border transition-colors ${
                    feedMeta.isSaved
                      ? 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/30'
                      : 'bg-[#262421] text-[#aaa398] hover:text-[#efe9de] border-[#efe9de]/10'
                  }`}
                >
                  {feedMeta.isSaved ? (
                    <BookmarkSolidIcon className="h-4 w-4" />
                  ) : (
                    <BookmarkIcon className="h-4 w-4" strokeWidth={1.5} />
                  )}
                  <span>{feedMeta.isSaved ? 'Saved' : 'Save'}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleShare}
              className="btn-secondary h-9 px-3 text-[13px]"
            >
              <ArrowUpRightIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
              <span>{copiedShare ? 'Link copied' : 'Share'}</span>
            </button>

            {(isOrganizer || isAdmin) && (
              <>
                <button
                  onClick={() => navigate(`/events/${id}/edit`)}
                  className="btn-secondary h-9 px-3.5 text-[13px]"
                >
                  <PencilIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                  <span>Edit</span>
                </button>
                <button
                  onClick={handleDeleteEvent}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-[8px] text-[13px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 transition-colors duration-150"
                >
                  <TrashIcon className="h-4 w-4" strokeWidth={1.5} />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="p-6 sm:p-8 border-b border-[#efe9de]/[0.08]">
          {actionError && (
            <div className="mb-5 px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
              {actionError}
            </div>
          )}

          {isAttending && !needsPaymentCompletion && (
            <div className="mb-5 px-4 py-3.5 rounded-[10px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 text-[#4cc38a] text-[13px] flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {isPaidEvent
                      ? `Registration & ${feeLabel} YouPI-PG payment verified`
                      : 'Event registration confirmed'}
                  </span>
                  {event.myRegistration?.attendanceStatus && (
                    <span
                      className={`px-2 py-0.5 rounded-[6px] text-[12px] font-mono border ${
                        event.myRegistration.attendanceStatus === 'present'
                          ? 'bg-[#4cc38a]/15 text-[#4cc38a] border-[#4cc38a]/35'
                          : event.myRegistration.attendanceStatus === 'absent'
                            ? 'bg-[#e5484d]/15 text-[#e5484d] border-[#e5484d]/35'
                            : 'bg-[#161513] text-[#aaa398] border-[#efe9de]/[0.1]'
                      }`}
                    >
                      Attendance:{' '}
                      {event.myRegistration.attendanceStatus === 'present'
                        ? 'Present'
                        : event.myRegistration.attendanceStatus === 'absent'
                          ? 'Absent'
                          : 'Pending check-in'}
                    </span>
                  )}
                </div>
                {(event.myRegistration?.transactionId || event.myRegistration?.youpiOrderId) && (
                  <div className="font-mono text-[12px] text-[#4cc38a]/90 tabular-nums">
                    {event.myRegistration?.youpiOrderId ? `${event.myRegistration.youpiOrderId} · ` : ''}
                    UTR / txn: {event.myRegistration.transactionId}
                  </div>
                )}
              </div>

              {event.whatsappGroupLink && (
                <a
                  href={event.whatsappGroupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] text-[12px] font-medium bg-[#4cc38a] text-[#12110f] hover:bg-[#4cc38a]/90 transition-colors duration-150 shrink-0"
                >
                  <ChatBubbleLeftRightIcon className="h-4 w-4" strokeWidth={1.5} />
                  <span>Join WhatsApp group</span>
                  <ArrowUpRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                </a>
              )}
            </div>
          )}

          {needsPaymentCompletion && (
            <div className="mb-5 px-4 py-3 rounded-[10px] bg-[#e09132]/12 border border-[#e09132]/30 text-[#ebb05d] text-[13px] flex flex-wrap items-center justify-between gap-3">
              <span>
                {isObservedPending ? (
                  <>
                    Bank credit alert observed
                    {event.myRegistration?.transactionId ? ` (UTR: ${event.myRegistration.transactionId})` : ''}. Your pass{event.hasWhatsappGroup ? ', WhatsApp group,' : ''} and competitions unlock once the organizer reconciles the bank statement.
                  </>
                ) : isManualReview ? (
                  <>
                    Your YouPI payment (<span className="font-mono">{event.myRegistration?.transactionId || 'UTR submitted'}</span>) is pending merchant bank verification.
                  </>
                ) : isProcessingOrQueued ? (
                  <>
                    Your YouPI payment session is active ({myYoupiStatus.toLowerCase()}). Return to checkout to check live status.
                  </>
                ) : (
                  <>
                    Your seat reservation requires YouPI-PG payment of <strong className="font-mono">{feeLabel}</strong> to confirm attendance{event.hasWhatsappGroup ? ', unlock the attendee WhatsApp group,' : ''} and unlock linked competitions.
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={handleOpenRegistrationModal}
                className="btn-primary h-8 px-3 text-[12px]"
              >
                {isObservedPending || isManualReview || isProcessingOrQueued
                  ? 'Check YouPI status'
                  : `Pay ${feeLabel} via YouPI`}
              </button>
            </div>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            <div>
              <dt className="text-[12px] text-[#8a847a]">Date and time</dt>
              <dd className="mt-1.5 text-[14px] text-[#efe9de] flex items-center gap-2 font-mono tabular-nums">
                <CalendarIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                <span>{event.date ? `${format(new Date(event.date), 'MMM d, yyyy')} · ${event.time}` : event.time}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#8a847a]">Venue</dt>
              <dd className="mt-1.5 text-[14px] text-[#efe9de] flex items-center gap-2">
                <MapPinIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                <span>{event.location}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#8a847a]">Available seats</dt>
              <dd className="mt-1.5 text-[14px] text-[#efe9de] flex items-center gap-2 font-mono tabular-nums">
                <UserGroupIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                <span>{availableSeats} left ({attendees.length}/{event.capacity})</span>
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#8a847a]">Entry fee</dt>
              <dd className="mt-1.5 text-[14px] font-mono tabular-nums text-[#ebb05d]">
                {feeLabel}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#8a847a]">Eligibility</dt>
              <dd className="mt-1.5 text-[14px] text-[#efe9de]">
                {event.eligibility || 'Open to all enrolled students'}
              </dd>
            </div>
          </dl>

          <div className="mt-6 pt-6 border-t border-[#efe9de]/[0.06]">
            <dt className="text-[12px] text-[#8a847a]">About this event</dt>
            <dd className="mt-2 text-[14px] text-[#aaa398] leading-relaxed whitespace-pre-line">
              {event.description}
            </dd>
          </div>
        </div>

        {/* Highlights, Perks, Agenda */}
        <div className="p-6 sm:p-8 border-b border-[#efe9de]/[0.08]">
          <h2 className="text-[16px] font-medium text-[#efe9de] mb-4">Schedule and highlights</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-[#262421] border border-[#efe9de]/[0.06] rounded-[10px] p-4">
              <h3 className="text-[13px] font-medium text-[#efe9de] mb-2.5">Highlights</h3>
              <ul className="space-y-1.5 text-[13px] text-[#aaa398] list-disc list-inside">
                {(event.noveltyFeatures?.highlights?.length
                  ? event.noveltyFeatures.highlights
                  : ['Hands-on campus session', 'Department participation', 'Verified attendance record']
                ).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="bg-[#262421] border border-[#efe9de]/[0.06] rounded-[10px] p-4">
              <h3 className="text-[13px] font-medium text-[#efe9de] mb-2.5">Perks</h3>
              <ul className="space-y-1.5 text-[13px] text-[#aaa398] list-disc list-inside">
                {(event.noveltyFeatures?.perks?.length
                  ? event.noveltyFeatures.perks
                  : ['Peer networking', 'Practical workshop materials', 'Participation certificate']
                ).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="bg-[#262421] border border-[#efe9de]/[0.06] rounded-[10px] p-4">
              <h3 className="text-[13px] font-medium text-[#efe9de] mb-2.5">Agenda</h3>
              <ul className="space-y-1.5 text-[13px] text-[#aaa398] list-disc list-inside">
                {(event.noveltyFeatures?.agenda?.length
                  ? event.noveltyFeatures.agenda
                  : ['Check-in and introduction', 'Main technical session', 'Closing and Q&A']
                ).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Linked Competitions */}
        <div className="p-6 sm:p-8 border-b border-[#efe9de]/[0.08]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <TrophyIcon className="h-[18px] w-[18px] text-[#8a847a]" strokeWidth={1.5} />
              <h2 className="text-[16px] font-medium text-[#efe9de]">Linked competitions</h2>
            </div>
            {(isOrganizer || isAdmin) && (
              <button
                onClick={() => navigate(`/competitions/create?eventId=${id}`)}
                className="btn-secondary h-8 px-3 text-[12px]"
              >
                Add competition
              </button>
            )}
          </div>

          {eventCompetitions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eventCompetitions.map(comp => {
                const requiresGate = comp.requireEventRegistration !== false;
                const accessAllowed = comp.accessStatus
                  ? comp.accessStatus.allowed
                  : !requiresGate || !isStudent || (isAttending && (!isPaidEvent || isPaidRegistration));
                const gated = isStudent && requiresGate && !accessAllowed;

                return (
                  <div
                    key={comp._id}
                    className="p-4 rounded-[10px] bg-[#262421] border border-[#efe9de]/[0.08] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="px-2 py-0.5 rounded-[6px] font-mono bg-[#1c1a18] text-[#ebb05d] border border-[#efe9de]/[0.08] capitalize">
                          {comp.type}
                        </span>
                        <span className="text-[#8a847a] font-mono tabular-nums">
                          {comp.durationMinutes} min · {comp.totalMarks} marks
                        </span>
                      </div>
                      <h3 className="text-[15px] font-medium text-[#efe9de] mt-2.5">{comp.title}</h3>
                      <p className="text-[13px] text-[#aaa398] line-clamp-2 mt-1">{comp.description}</p>

                      {requiresGate && (
                        <div className="mt-3">
                          {accessAllowed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25">
                              <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                              <span>Unlocked</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[12px] bg-[#e09132]/10 text-[#ebb05d] border border-[#e09132]/25">
                              <LockClosedIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                              <span>
                                {isPaidEvent
                                  ? `Locked · Register & pay ${feeLabel} for event to attend`
                                  : 'Locked · Register for this event to attend'}
                              </span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#efe9de]/[0.06] flex items-center justify-between gap-2">
                      <button
                        onClick={() => navigate(`/competitions/${comp._id}/leaderboard`)}
                        className="text-[13px] font-medium text-[#aaa398] hover:text-[#efe9de] transition-colors duration-150"
                      >
                        Leaderboard
                      </button>
                      {gated ? (
                        !isAuthenticated ? (
                          <Link to="/login" className="btn-primary h-8 px-3 text-[12px]">
                            Sign in to unlock
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={handleOpenRegistrationModal}
                            className="btn-primary h-8 px-3 text-[12px]"
                          >
                            {isPaidEvent ? `Pay ${feeLabel} & unlock` : 'Register to unlock'}
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() =>
                            navigate(
                              comp.type === 'coding' ? `/competitions/${comp._id}/code` : `/competitions/${comp._id}/quiz`
                            )
                          }
                          className="btn-primary h-8 px-3 text-[12px]"
                        >
                          Enter arena
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.06] text-center text-[13px] text-[#8a847a]">
              No online competitions attached to this event.
            </div>
          )}
        </div>

        {/* Organizer / Admin Attendance Management */}
        {(isOrganizer || isAdmin) && (
          <div className="p-6 sm:p-8 border-b border-[#efe9de]/[0.08] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardDocumentCheckIcon className="h-[18px] w-[18px] text-[#ebb05d]" strokeWidth={1.5} />
                  <h2 className="text-[16px] font-medium text-[#efe9de]">Event Attendance Roster</h2>
                </div>
                <p className="text-[12px] text-[#8a847a] mt-0.5">
                  Mark check-in attendance for registered participants or mark all confirmed students present.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bulkMarking || roster.length === 0}
                  onClick={() => handleBulkAttendance('present')}
                  className="btn-secondary h-8 px-3 text-[12px]"
                >
                  {bulkMarking ? 'Updating...' : 'Mark all confirmed present'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRegistrations}
                  className="btn-secondary h-8 px-3 text-[12px]"
                >
                  Export (.xlsx)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08]">
                <span className="text-[12px] text-[#8a847a]">Registered</span>
                <p className="text-[20px] font-mono font-medium text-[#efe9de] mt-0.5 tabular-nums">
                  {attendanceSummary.total}
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-[#161513] border border-[#4cc38a]/25">
                <span className="text-[12px] text-[#8a847a]">Present</span>
                <p className="text-[20px] font-mono font-medium text-[#4cc38a] mt-0.5 tabular-nums">
                  {attendanceSummary.present}
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-[#161513] border border-[#e5484d]/25">
                <span className="text-[12px] text-[#8a847a]">Absent</span>
                <p className="text-[20px] font-mono font-medium text-[#e5484d] mt-0.5 tabular-nums">
                  {attendanceSummary.absent}
                </p>
              </div>
              <div className="p-3 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08]">
                <span className="text-[12px] text-[#8a847a]">Attendance rate</span>
                <p className="text-[20px] font-mono font-medium text-[#ebb05d] mt-0.5 tabular-nums">
                  {attendanceSummary.attendanceRate}%
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[200px] w-full sm:w-auto max-w-sm">
                <MagnifyingGlassIcon className="h-4 w-4 text-[#8a847a] absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
                <input
                  type="text"
                  value={attendanceSearch}
                  onChange={(e) => setAttendanceSearch(e.target.value)}
                  placeholder="Search attendee, roll no., email..."
                  className="input-field h-9 pl-9 text-[13px]"
                />
              </div>

              <div className="inline-flex max-w-full overflow-x-auto p-1 rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.08] gap-1">
                {['all', 'present', 'absent', 'unmarked'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setAttendanceFilter(tab)}
                    className={`h-7 px-2.5 rounded-[6px] text-[12px] capitalize whitespace-nowrap shrink-0 transition-colors ${
                      attendanceFilter === tab
                        ? 'bg-[#262421] text-[#efe9de]'
                        : 'text-[#8a847a] hover:text-[#efe9de]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {resendNotice && (
              <div className="px-4 py-2.5 rounded-[8px] bg-[#4cc38a]/12 border border-[#4cc38a]/30 text-[#4cc38a] text-[12px]">
                {resendNotice}
              </div>
            )}

            {rosterLoading ? (
              <div className="py-6 flex justify-center">
                <AvenorLoader variant="compact" label="Loading attendance roster..." />
              </div>
            ) : (
              (() => {
                const q = attendanceSearch.trim().toLowerCase();
                const filtered = roster.filter((r) => {
                  const st = r.attendanceStatus || 'unmarked';
                  if (attendanceFilter !== 'all' && st !== attendanceFilter) return false;
                  if (!q) return true;
                  return [r.name, r.regNo, r.email, r.user?.email, r.user?.department]
                    .filter(Boolean)
                    .some((v) => String(v).toLowerCase().includes(q));
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-6 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.06] text-center text-[13px] text-[#8a847a]">
                      No matching registrations found.
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto rounded-[10px] border border-[#efe9de]/[0.08] bg-[#161513]">
                    <table className="min-w-full divide-y divide-[#efe9de]/[0.06] text-[13px]">
                      <thead className="bg-[#12110f]/70 text-[#8a847a] text-[12px]">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Attendee</th>
                          <th className="px-4 py-3 text-left font-medium">Reg no</th>
                          <th className="px-4 py-3 text-left font-medium">Payment</th>
                          <th className="px-4 py-3 text-left font-medium">Attendance</th>
                          <th className="px-4 py-3 text-right font-medium">Check-in</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#efe9de]/[0.06]">
                        {filtered.map((reg) => {
                          const st = reg.attendanceStatus || 'unmarked';
                          const busy = markingRegId === reg._id;
                          const paymentOk = !isPaidEvent || reg.paymentStatus === 'paid';
                          return (
                            <tr key={reg._id} className="hover:bg-[#262421]/40 transition-colors duration-150">
                              <td className="px-4 py-3">
                                <div className="font-medium text-[#efe9de]">{reg.name}</div>
                                <div className="text-[12px] text-[#8a847a]">
                                  {reg.email || reg.user?.email || 'No email'}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-[12px] text-[#ebb05d] tabular-nums">
                                {reg.regNo}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-[6px] text-[12px] font-mono tabular-nums border ${
                                    paymentOk
                                      ? 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                                      : 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/30'
                                  }`}
                                >
                                  {isPaidEvent
                                    ? reg.paymentStatus === 'paid'
                                      ? `Paid ${currencySymbol}${Number(reg.amountPaid || fee).toFixed(2)}`
                                      : reg.youpiStatus === 'OBSERVED_SUCCESS'
                                        ? 'Alert observed · awaiting match'
                                        : reg.youpiStatus || 'Pending'
                                    : 'Free'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-[6px] text-[12px] font-mono capitalize border ${
                                    st === 'present'
                                      ? 'bg-[#4cc38a]/15 text-[#4cc38a] border-[#4cc38a]/30'
                                      : st === 'absent'
                                        ? 'bg-[#e5484d]/15 text-[#e5484d] border-[#e5484d]/30'
                                        : 'bg-[#262421] text-[#8a847a] border-[#efe9de]/[0.08]'
                                  }`}
                                >
                                  {st}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busy || !paymentOk}
                                    onClick={() => handleMarkAttendance(reg._id, 'present')}
                                    className={`h-8 px-3 rounded-[6px] text-[12px] font-medium border transition-colors duration-150 ${
                                      st === 'present'
                                        ? 'bg-[#4cc38a] text-[#12110f] border-[#4cc38a]'
                                        : 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/30 hover:bg-[#4cc38a]/20 disabled:opacity-40'
                                    }`}
                                    title={paymentOk ? 'Mark present' : 'Payment confirmation required before check-in'}
                                  >
                                    Present
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleMarkAttendance(reg._id, 'absent')}
                                    className={`h-8 px-3 rounded-[6px] text-[12px] font-medium border transition-colors duration-150 ${
                                      st === 'absent'
                                        ? 'bg-[#e5484d] text-[#efe9de] border-[#e5484d]'
                                        : 'bg-[#e5484d]/10 text-[#e5484d] border-[#e5484d]/30 hover:bg-[#e5484d]/20'
                                    }`}
                                  >
                                    Absent
                                  </button>
                                  {st !== 'unmarked' && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleMarkAttendance(reg._id, 'unmarked')}
                                      className="h-8 px-2.5 rounded-[6px] text-[12px] text-[#8a847a] bg-[#262421] hover:text-[#efe9de] border border-[#efe9de]/[0.08]"
                                    >
                                      Reset
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={resendingRegId === reg._id}
                                    onClick={() => handleResendEmail(reg._id)}
                                    title="Resend registration confirmation email"
                                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] text-[12px] text-[#ebb05d] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/[0.08] disabled:opacity-50"
                                  >
                                    <EnvelopeIcon className="h-4 w-4" strokeWidth={1.5} />
                                    <span>{resendingRegId === reg._id ? 'Sending...' : 'Email'}</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* Comments Section */}
        {feedMeta?.postId && (
          <div className="p-6 sm:p-8 border-b border-[#efe9de]/[0.08]">
            <div className="flex items-center gap-2 mb-4">
              <ChatBubbleLeftIcon className="h-[18px] w-[18px] text-[#8a847a]" strokeWidth={1.5} />
              <h2 className="text-[16px] font-medium text-[#efe9de]">
                Comments ({formatCount(feedMeta.commentsCount)})
              </h2>
            </div>
            <CommentsSection
              postId={feedMeta.postId}
              onCommentsCountChange={(count) =>
                setFeedMeta(prev => (prev ? { ...prev, commentsCount: count } : prev))
              }
            />
          </div>
        )}

        {/* Footer Actions */}
        {(isAuthenticated && user?.role === 'student') || isOrganizer || isAdmin || !isAuthenticated ? (
          <div className="p-6 sm:p-8 flex flex-wrap items-center justify-end gap-3 bg-[#12110f]/40">
            {!isAuthenticated && (
              <Link to="/login" className="btn-primary h-10 px-5 text-[13px]">
                {isPaidEvent ? `Sign in to pay ${feeLabel} & register` : 'Sign in to register'}
              </Link>
            )}
            {isAuthenticated && user?.role === 'student' && (
              <>
                {isAttending && !needsPaymentCompletion && (
                  <button
                    onClick={handleDownloadCertificate}
                    className="btn-secondary h-10 px-4 text-[13px]"
                  >
                    <AcademicCapIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                    <span>Download certificate</span>
                  </button>
                )}
                {isAttending ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    {needsPaymentCompletion ? (
                      <button
                        type="button"
                        onClick={handleOpenRegistrationModal}
                        className="btn-primary h-10 px-5 text-[13px]"
                      >
                        {isObservedPending || isManualReview || isProcessingOrQueued
                          ? 'Check payment status'
                          : `Pay ${feeLabel} & confirm`}
                      </button>
                    ) : (
                      <span className="inline-flex items-center px-3 h-10 rounded-[8px] text-[13px] font-medium bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/30 tabular-nums">
                        {isPaidEvent ? `Registered · Paid ${feeLabel}` : 'Registered'}
                      </span>
                    )}
                    <button
                      onClick={handleCancelBooking}
                      disabled={bookingBusy}
                      className="h-10 px-4 rounded-[8px] text-[13px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 transition-colors duration-150"
                    >
                      Cancel registration
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleOpenRegistrationModal}
                    disabled={bookingBusy || lifecycle.state !== 'REGISTER NOW'}
                    className="btn-primary h-10 px-5 text-[13px]"
                  >
                    {lifecycle.state === 'REGISTER NOW'
                      ? isPaidEvent
                        ? `Pay ${feeLabel} & register`
                        : 'Register now'
                      : lifecycle.state}
                  </button>
                )}
              </>
            )}

            {(isOrganizer || isAdmin) && (
              <button
                onClick={handleDownloadRegistrations}
                className="btn-secondary h-10 px-4 text-[13px]"
              >
                Export registrations (.xlsx)
              </button>
            )}
          </div>
        ) : null}
      </div>

      {showRegisterModal && (
        <EventRegistration
          event={event}
          onClose={() => setShowRegisterModal(false)}
          onRegistered={() => {
            Promise.all([
              fetchEventDetails(true),
              fetchEventCompetitions(),
              fetchFeedMeta(),
              canManageEvent ? fetchAttendanceRoster(true) : Promise.resolve()
            ]);
          }}
        />
      )}
    </div>
  );
};

export default EventDetails;
