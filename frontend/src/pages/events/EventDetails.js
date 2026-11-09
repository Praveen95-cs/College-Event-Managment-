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
  ChatBubbleLeftIcon
} from '@heroicons/react/24/outline';
import {
  HeartIcon as HeartSolidIcon,
  BookmarkIcon as BookmarkSolidIcon
} from '@heroicons/react/24/solid';
import { getBackendUrl } from '../../utils/apiConfig';
import CommentsSection from '../../components/feed/CommentsSection';
import { getEventLifecycle, formatCount } from '../../utils/eventLifecycle';

const EventDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventCompetitions, setEventCompetitions] = useState([]);
  const [feedMeta, setFeedMeta] = useState(null);
  const [copiedShare, setCopiedShare] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
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

  useEffect(() => {
    fetchEventDetails();
    fetchEventCompetitions();
    fetchFeedMeta();
  }, [id, fetchFeedMeta]);

  const fetchEventCompetitions = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/competitions?eventId=${id}`);
      setEventCompetitions(res.data);
    } catch (err) {
      // Non-critical
    }
  };

  const fetchEventDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/events/${id}`);
      setEvent(response.data);
    } catch (error) {
      setError('Error fetching event details');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookEvent = async () => {
    try {
      setBookingBusy(true);
      await axios.post(`/api/events/${id}/book`);
      await Promise.all([fetchEventDetails(), fetchFeedMeta()]);
    } catch (error) {
      console.error('Error booking event:', error);
    } finally {
      setBookingBusy(false);
    }
  };

  const handleCancelBooking = async () => {
    try {
      setBookingBusy(true);
      await axios.post(`/api/events/${id}/cancel`);
      await Promise.all([fetchEventDetails(), fetchFeedMeta()]);
    } catch (error) {
      console.error('Error cancelling booking:', error);
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
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-7 h-7 border-2 border-[#e09132] border-t-transparent rounded-full animate-spin" />
      </div>
    );
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
  const isAttending = attendees.some(a => (a._id || a) === user?._id) || Boolean(feedMeta?.isRegistered);
  const isOrganizer = event.organizer?._id === user?._id || event.organizer === user?._id;
  const isAdmin = user?.role === 'admin';
  const clubInfo = feedMeta?.club || event.club;
  const lifecycle = getEventLifecycle(event, isAttending);
  const availableSeats = Math.max(0, Number(event.capacity || 0) - attendees.length);

  const photoSrc = event.photo ? (event.photo.startsWith('http') ? event.photo : `${backendUrl}${event.photo}`) : '';

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

      <div className="rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] overflow-hidden">
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
            </div>
            <h1 className="text-[24px] sm:text-[28px] font-medium text-[#efe9de] tracking-[-0.015em] leading-[1.2]">
              {event.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[#aaa398]">
              {clubInfo && (
                <span className="inline-flex items-center gap-2">
                  <Link
                    to={`/clubs/${clubInfo._id}`}
                    className="inline-flex items-center gap-1 font-medium text-[#efe9de] hover:text-[#ebb05d] transition-colors"
                  >
                    <span>{clubInfo.name}</span>
                    {clubInfo.verified !== false && (
                      <CheckBadgeIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.75} />
                    )}
                  </Link>
                  <button
                    type="button"
                    onClick={handleToggleFollowClub}
                    className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-colors ${
                      clubInfo.isFollowing
                        ? 'bg-[#262421] text-[#4cc38a] border border-[#4cc38a]/25'
                        : 'bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.1]'
                    }`}
                  >
                    {clubInfo.isFollowing ? 'Following ✓' : '+ Follow'}
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
                  <span>{feedMeta.isSaved ? 'Saved ✓' : 'Save'}</span>
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
              <dt className="text-[12px] text-[#8a847a]">Department</dt>
              <dd className="mt-1.5 text-[14px] text-[#efe9de]">{event.department}</dd>
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
                onClick={() => navigate('/competitions/create')}
                className="btn-secondary h-8 px-3 text-[12px]"
              >
                Add competition
              </button>
            )}
          </div>

          {eventCompetitions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eventCompetitions.map(comp => (
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
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#efe9de]/[0.06] flex items-center justify-between">
                    <button
                      onClick={() => navigate(`/competitions/${comp._id}/leaderboard`)}
                      className="text-[13px] font-medium text-[#aaa398] hover:text-[#efe9de] transition-colors duration-150"
                    >
                      Leaderboard
                    </button>
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.06] text-center text-[13px] text-[#8a847a]">
              No online competitions attached to this event.
            </div>
          )}
        </div>

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
                Sign in to register
              </Link>
            )}
            {isAuthenticated && user?.role === 'student' && (
              <>
                {isAttending && (
                  <button
                    onClick={handleDownloadCertificate}
                    className="btn-secondary h-10 px-4 text-[13px]"
                  >
                    <AcademicCapIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                    <span>Download certificate</span>
                  </button>
                )}
                {isAttending ? (
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center px-3 h-10 rounded-[8px] text-[13px] font-medium bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/30">
                      Registered ✓
                    </span>
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
                    onClick={handleBookEvent}
                    disabled={bookingBusy || lifecycle.state !== 'REGISTER NOW'}
                    className="btn-primary h-10 px-5 text-[13px]"
                  >
                    {lifecycle.state === 'REGISTER NOW'
                      ? bookingBusy
                        ? 'Reserving...'
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
    </div>
  );
};

export default EventDetails;
