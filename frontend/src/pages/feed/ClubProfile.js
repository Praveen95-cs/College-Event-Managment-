import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeftIcon,
  CheckBadgeIcon,
  CheckIcon,
  PlusIcon,
  MegaphoneIcon,
  CalendarIcon,
  ClockIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import EventFeedCard from '../../components/feed/EventFeedCard';
import CommentsModal from '../../components/feed/CommentsModal';
import AnnouncementModal from '../../components/feed/AnnouncementModal';
import CreateClubModal from '../../components/feed/CreateClubModal';
import ClubLogo from '../../components/feed/ClubLogo';
import EventRegistration from '../../components/events/EventRegistration';
import AvenorLoader from '../../components/common/AvenorLoader';
import { formatCount } from '../../utils/eventLifecycle';

const ClubProfile = () => {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [club, setClub] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'past' | 'announcements'

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [commentsTarget, setCommentsTarget] = useState(null);
  const [registerTarget, setRegisterTarget] = useState(null);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [editClubOpen, setEditClubOpen] = useState(false);

  const fetchClubProfile = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/clubs/${clubId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setClub(res.data.club);
      setUpcomingEvents(res.data.upcomingEvents || []);
      setPastEvents(res.data.pastEvents || []);
      setAnnouncements(res.data.announcements || []);
    } catch (err) {
      if (!silent) setError(err.response?.data?.message || 'Failed to load club profile');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    fetchClubProfile(false);
  }, [fetchClubProfile]);

  const updateListItem = (postId, updater) => {
    const apply = list => list.map(p => (p._id === postId ? updater(p) : p));
    setUpcomingEvents(apply);
    setPastEvents(apply);
    setAnnouncements(apply);
  };

  const handleToggleFollow = async () => {
    if (!club) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const nextFollow = !club.isFollowing;
    const prevCount = club.followersCount || 0;
    const nextCount = Math.max(0, prevCount + (nextFollow ? 1 : -1));
    setClub(prev => ({ ...prev, isFollowing: nextFollow, followersCount: nextCount }));

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextFollow
        ? await axios.post(`/api/clubs/${club._id}/follow`, {}, { headers })
        : await axios.delete(`/api/clubs/${club._id}/follow`, { headers });

      setClub(prev => ({
        ...prev,
        isFollowing: res.data.following,
        followersCount: res.data.followersCount
      }));
    } catch {
      setClub(prev => ({ ...prev, isFollowing: club.isFollowing, followersCount: prevCount }));
    }
  };

  const handleToggleLike = async (item) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const nextLiked = !item.isLiked;
    updateListItem(item._id, p => ({
      ...p,
      isLiked: nextLiked,
      likesCount: Math.max(0, (p.likesCount || 0) + (nextLiked ? 1 : -1))
    }));
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextLiked
        ? await axios.post(`/api/feed/posts/${item._id}/like`, {}, { headers })
        : await axios.delete(`/api/feed/posts/${item._id}/like`, { headers });
      updateListItem(item._id, p => ({
        ...p,
        isLiked: res.data.liked,
        likesCount: res.data.likesCount
      }));
    } catch {
      fetchClubProfile();
    }
  };

  const handleToggleSave = async (item) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const nextSaved = !item.isSaved;
    updateListItem(item._id, p => ({
      ...p,
      isSaved: nextSaved,
      savesCount: Math.max(0, (p.savesCount || 0) + (nextSaved ? 1 : -1))
    }));
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextSaved
        ? await axios.post(`/api/feed/posts/${item._id}/save`, {}, { headers })
        : await axios.delete(`/api/feed/posts/${item._id}/save`, { headers });
      updateListItem(item._id, p => ({
        ...p,
        isSaved: res.data.saved,
        savesCount: res.data.savesCount
      }));
    } catch {
      fetchClubProfile();
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/feed/posts/${postId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnnouncements(prev => prev.filter(p => p._id !== postId));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete announcement');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <AvenorLoader variant="section" label="Loading club profile..." />
      </div>
    );
  }

  if (error || !club) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-4">
        <p className="text-[14px] text-[#e5484d]">{error || 'Club not found'}</p>
        <Link to="/campus-feed" className="btn-secondary h-9 px-4 text-[13px]">
          <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.5} />
          <span>Back to Campus Feed</span>
        </Link>
      </div>
    );
  }

  const currentList =
    activeTab === 'upcoming'
      ? upcomingEvents
      : activeTab === 'past'
        ? pastEvents
        : announcements;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        type="button"
        onClick={() => navigate('/campus-feed')}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#aaa398] hover:text-[#efe9de] transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.5} />
        <span>Back to Campus Feed</span>
      </button>

      {/* Club Header Card */}
      <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <ClubLogo club={club} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] sm:text-[28px] font-medium text-[#efe9de] tracking-[-0.02em] leading-tight">
                  {club.name}
                </h1>
                {club.verified && (
                  <CheckBadgeIcon className="h-5 w-5 text-[#ebb05d]" strokeWidth={1.5} title="Verified club" />
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[13px] text-[#aaa398]">
                {club.department && (
                  <span className="px-2 py-0.5 rounded-[6px] text-[12px] bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08]">
                    {club.department}
                  </span>
                )}
                <span className="font-mono text-[13px] text-[#efe9de] tabular-nums">
                  {formatCount(club.followersCount)} {club.followersCount === 1 ? 'follower' : 'followers'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleFollow}
              className={
                club.isFollowing
                  ? 'inline-flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-[13px] font-medium bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/30 hover:bg-[#4cc38a]/20 transition-colors'
                  : 'btn-primary h-9 px-4 text-[13px]'
              }
            >
              {club.isFollowing ? (
                <>
                  <CheckIcon className="h-4 w-4" strokeWidth={1.5} />
                  <span>Following</span>
                </>
              ) : (
                <>
                  <PlusIcon className="h-4 w-4" strokeWidth={1.5} />
                  <span>Follow</span>
                </>
              )}
            </button>

            {club.canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setEditClubOpen(true)}
                  className="btn-secondary h-9 px-3.5 text-[13px]"
                >
                  <PencilIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                  <span>Edit club &amp; logo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAnnouncementOpen(true)}
                  className="btn-secondary h-9 px-3.5 text-[13px]"
                >
                  <MegaphoneIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                  <span>Post announcement</span>
                </button>
              </>
            )}
          </div>
        </div>

        {club.description && (
          <p className="text-[14px] text-[#aaa398] leading-relaxed">{club.description}</p>
        )}

        {club.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {club.tags.map(tag => (
              <span
                key={tag}
                className="px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#8a847a] border border-[#efe9de]/[0.06]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs: Upcoming Events | Past Events | Announcements */}
      <div className="inline-flex max-w-full overflow-x-auto p-1 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`h-8 px-3.5 rounded-[6px] text-[13px] font-medium whitespace-nowrap shrink-0 tabular-nums transition-colors ${
            activeTab === 'upcoming'
              ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
              : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
          }`}
        >
          Upcoming Events ({upcomingEvents.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('past')}
          className={`h-8 px-3.5 rounded-[6px] text-[13px] font-medium whitespace-nowrap shrink-0 tabular-nums transition-colors ${
            activeTab === 'past'
              ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
              : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
          }`}
        >
          Past Events ({pastEvents.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('announcements')}
          className={`h-8 px-3.5 rounded-[6px] text-[13px] font-medium whitespace-nowrap shrink-0 tabular-nums transition-colors ${
            activeTab === 'announcements'
              ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
              : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
          }`}
        >
          Announcements ({announcements.length})
        </button>
      </div>

      {/* Tab Content */}
      {currentList.length === 0 ? (
        <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-10 text-center space-y-2">
          {activeTab === 'upcoming' ? (
            <CalendarIcon className="h-7 w-7 text-[#8a847a] mx-auto" strokeWidth={1.5} />
          ) : activeTab === 'past' ? (
            <ClockIcon className="h-7 w-7 text-[#8a847a] mx-auto" strokeWidth={1.5} />
          ) : (
            <MegaphoneIcon className="h-7 w-7 text-[#8a847a] mx-auto" strokeWidth={1.5} />
          )}
          <p className="text-[15px] font-medium text-[#efe9de]">
            {activeTab === 'upcoming'
              ? 'No upcoming events scheduled'
              : activeTab === 'past'
                ? 'No past events recorded'
                : 'No announcements yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {currentList.map(item => (
            <EventFeedCard
              key={item._id}
              item={item}
              currentUser={user}
              onToggleLike={handleToggleLike}
              onToggleSave={handleToggleSave}
              onOpenComments={(target) => setCommentsTarget(target)}
              onToggleFollowClub={handleToggleFollow}
              onRegisterClick={(ev) => setRegisterTarget(ev)}
              onDeletePost={handleDeletePost}
            />
          ))}
        </div>
      )}

      {commentsTarget && (
        <CommentsModal
          item={commentsTarget}
          onClose={() => setCommentsTarget(null)}
          onCommentsCountChange={(postId, count) =>
            updateListItem(postId, p => ({ ...p, commentsCount: count }))
          }
        />
      )}

      {registerTarget && (
        <EventRegistration
          event={registerTarget}
          onRegistered={() => fetchClubProfile(true)}
          onClose={() => {
            setRegisterTarget(null);
            fetchClubProfile(true);
          }}
        />
      )}

      <AnnouncementModal
        isOpen={announcementOpen}
        onClose={() => setAnnouncementOpen(false)}
        clubs={[club]}
        initialClubId={club._id}
        onCreated={(newPost) => {
          if (newPost) {
            setAnnouncements(prev => [newPost, ...prev]);
            setActiveTab('announcements');
          }
        }}
      />

      <CreateClubModal
        isOpen={editClubOpen}
        onClose={() => setEditClubOpen(false)}
        clubToEdit={club}
        onUpdated={() => {
          fetchClubProfile(true);
        }}
      />
    </div>
  );
};

export default ClubProfile;

