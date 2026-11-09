import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  MegaphoneIcon,
  BookmarkIcon,
  SparklesIcon,
  UserGroupIcon,
  PlusIcon,
  CalendarIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';
import EventFeedCard from '../../components/feed/EventFeedCard';
import CommentsModal from '../../components/feed/CommentsModal';
import AnnouncementModal from '../../components/feed/AnnouncementModal';
import CreateClubModal from '../../components/feed/CreateClubModal';
import EventRegistration from '../../components/events/EventRegistration';
import { resolveMediaUrl, formatEventDate, formatCount } from '../../utils/eventLifecycle';

const CATEGORIES = [
  'All',
  'Technical',
  'Hackathon',
  'Workshop',
  'Seminar',
  'Cultural',
  'Sports',
  'Competition'
];

const INITIAL_FILTERS = {
  clubId: '',
  dateFilter: 'upcoming',
  department: '',
  regStatus: 'all',
  eventType: 'all',
  includePast: false
};

const FeedSkeletonCard = () => (
  <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-5 space-y-4 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-[10px] bg-[#262421]" />
      <div className="space-y-2 flex-1">
        <div className="h-3.5 w-36 rounded bg-[#262421]" />
        <div className="h-2.5 w-48 rounded bg-[#262421]" />
      </div>
    </div>
    <div className="h-5 w-3/4 rounded bg-[#262421]" />
    <div className="aspect-[16/9] w-full rounded-[10px] bg-[#262421]" />
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="h-8 rounded-[8px] bg-[#262421]" />
      <div className="h-8 rounded-[8px] bg-[#262421]" />
      <div className="h-8 rounded-[8px] bg-[#262421]" />
      <div className="h-8 rounded-[8px] bg-[#262421]" />
    </div>
  </div>
);

const CampusFeed = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = ['discover', 'following', 'saved'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'discover';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Draft filters (in sidebar/mobile drawer) and applied filters (trigger API fetch)
  const [draftFilters, setDraftFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [followedClubsCount, setFollowedClubsCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [clubs, setClubs] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [highlights, setHighlights] = useState([]);

  // Interactive modals
  const [commentsTarget, setCommentsTarget] = useState(null);
  const [registerTarget, setRegisterTarget] = useState(null);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [createClubOpen, setCreateClubOpen] = useState(false);

  const clubsSectionRef = useRef(null);
  const sentinelRef = useRef(null);
  const activeFeedRequestRef = useRef(0);
  const feedAbortRef = useRef(null);

  // Sync URL query param on tab switch cleanly
  const switchTab = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'discover' ? {} : { tab }, { replace: true });
  };

  useEffect(() => {
    return () => {
      feedAbortRef.current?.abort();
    };
  }, []);

  // Debounced search (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchHighlightsAndClubs = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [hlRes, clubsRes] = await Promise.allSettled([
        axios.get('/api/feed/highlights', { headers }),
        axios.get('/api/clubs', { headers })
      ]);

      if (hlRes.status === 'fulfilled') {
        setHighlights(hlRes.value.data?.upcomingEvents || []);
        setDepartments(hlRes.value.data?.departments || []);
      }
      if (clubsRes.status === 'fulfilled') {
        setClubs(clubsRes.value.data || []);
      }
    } catch {
      // Non-blocking secondary panel
    }
  }, []);

  useEffect(() => {
    fetchHighlightsAndClubs();
  }, [fetchHighlightsAndClubs, user]);

  const fetchFeed = useCallback(
    async (targetPage = 1, append = false) => {
      if ((activeTab === 'following' || activeTab === 'saved') && !isAuthenticated) {
        activeFeedRequestRef.current += 1;
        feedAbortRef.current?.abort();
        setItems([]);
        setTotal(0);
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      if (!append) {
        feedAbortRef.current?.abort();
      }
      const controller = new AbortController();
      if (!append) {
        feedAbortRef.current = controller;
      }
      const reqId = ++activeFeedRequestRef.current;

      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        setError('');

        const token = localStorage.getItem('token');
        const res = await axios.get('/api/feed', {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          params: {
            tab: activeTab,
            category: selectedCategory,
            search: debouncedSearch || undefined,
            clubId: appliedFilters.clubId || undefined,
            dateFilter: appliedFilters.includePast ? 'past' : appliedFilters.dateFilter,
            includePast: appliedFilters.includePast ? 'true' : 'false',
            department: appliedFilters.department || undefined,
            regStatus: appliedFilters.regStatus,
            eventType: appliedFilters.eventType,
            page: targetPage,
            limit: 8
          }
        });

        if (reqId !== activeFeedRequestRef.current) return;

        const incoming = res.data?.items || [];
        setItems(prev => (append ? [...prev, ...incoming] : incoming));
        setPage(res.data?.page || targetPage);
        setHasMore(Boolean(res.data?.hasMore));
        setTotal(Number(res.data?.total ?? incoming.length));
        if (typeof res.data?.followedClubsCount === 'number') {
          setFollowedClubsCount(res.data.followedClubsCount);
        }
      } catch (err) {
        if (
          axios.isCancel?.(err) ||
          err.name === 'CanceledError' ||
          err.name === 'AbortError' ||
          reqId !== activeFeedRequestRef.current
        ) {
          return;
        }
        setError(err.response?.data?.message || 'Unable to load Campus Feed right now.');
      } finally {
        if (reqId === activeFeedRequestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [activeTab, selectedCategory, debouncedSearch, appliedFilters, isAuthenticated]
  );

  useEffect(() => {
    fetchFeed(1, false);
  }, [fetchFeed]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchFeed(page + 1, true);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, fetchFeed]);

  const handleApplyFilters = (e) => {
    e?.preventDefault();
    setAppliedFilters({ ...draftFilters });
    setMobileFiltersOpen(false);
  };

  const handleResetFilters = () => {
    setSelectedCategory('All');
    setSearchInput('');
    setDebouncedSearch('');
    setDraftFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setMobileFiltersOpen(false);
  };

  const handleToggleLike = async (item) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const nextLiked = !item.isLiked;
    const prevLikes = item.likesCount;

    setItems(prev =>
      prev.map(p =>
        p._id === item._id
          ? { ...p, isLiked: nextLiked, likesCount: Math.max(0, prevLikes + (nextLiked ? 1 : -1)) }
          : p
      )
    );

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextLiked
        ? await axios.post(`/api/feed/posts/${item._id}/like`, {}, { headers })
        : await axios.delete(`/api/feed/posts/${item._id}/like`, { headers });

      setItems(prev =>
        prev.map(p =>
          p._id === item._id
            ? { ...p, isLiked: res.data.liked, likesCount: res.data.likesCount }
            : p
        )
      );
    } catch {
      // Revert optimistic state
      setItems(prev =>
        prev.map(p =>
          p._id === item._id ? { ...p, isLiked: item.isLiked, likesCount: prevLikes } : p
        )
      );
    }
  };

  const handleToggleSave = async (item) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const nextSaved = !item.isSaved;
    const prevSaves = item.savesCount;

    if (activeTab === 'saved' && !nextSaved) {
      setItems(prev => prev.filter(p => p._id !== item._id));
      setTotal(prev => Math.max(0, prev - 1));
    } else {
      setItems(prev =>
        prev.map(p =>
          p._id === item._id
            ? { ...p, isSaved: nextSaved, savesCount: Math.max(0, prevSaves + (nextSaved ? 1 : -1)) }
            : p
        )
      );
    }

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextSaved
        ? await axios.post(`/api/feed/posts/${item._id}/save`, {}, { headers })
        : await axios.delete(`/api/feed/posts/${item._id}/save`, { headers });

      if (!(activeTab === 'saved' && !nextSaved)) {
        setItems(prev =>
          prev.map(p =>
            p._id === item._id
              ? { ...p, isSaved: res.data.saved, savesCount: res.data.savesCount }
              : p
          )
        );
      }
    } catch {
      fetchFeed(1, false);
    }
  };

  const handleToggleFollowClub = async (club) => {
    if (!club?._id) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const nextFollow = !club.isFollowing;
    const delta = nextFollow ? 1 : -1;

    const applyLocal = (followingVal, countVal) => {
      setClubs(prev =>
        prev.map(c =>
          c._id === club._id ? { ...c, isFollowing: followingVal, followersCount: countVal } : c
        )
      );
      setItems(prev =>
        prev.map(p =>
          p.club?._id === club._id
            ? { ...p, club: { ...p.club, isFollowing: followingVal, followersCount: countVal } }
            : p
        )
      );
    };

    const optimisticCount = Math.max(0, Number(club.followersCount || 0) + delta);
    applyLocal(nextFollow, optimisticCount);
    setFollowedClubsCount(prev => Math.max(0, prev + delta));

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const res = nextFollow
        ? await axios.post(`/api/clubs/${club._id}/follow`, {}, { headers })
        : await axios.delete(`/api/clubs/${club._id}/follow`, { headers });

      applyLocal(res.data.following, res.data.followersCount);
      if (activeTab === 'following' && !res.data.following) {
        fetchFeed(1, false);
      }
    } catch {
      applyLocal(club.isFollowing, club.followersCount);
      setFollowedClubsCount(prev => Math.max(0, prev - delta));
    }
  };

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this announcement from Campus Feed?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/feed/posts/${postId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(prev => prev.filter(p => p._id !== postId));
      setTotal(prev => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete post.');
    }
  };

  const handleRegisteredSuccess = (eventObj) => {
    if (!eventObj?._id) return;
    setItems(prev =>
      prev.map(p => {
        if (p.type === 'event' && p.event?._id === eventObj._id) {
          const nextCount = (p.event.attendeesCount || 0) + 1;
          return {
            ...p,
            isRegistered: true,
            registrationState: 'REGISTERED ✓',
            event: {
              ...p.event,
              attendeesCount: nextCount,
              availableSeats: Math.max(0, (p.event.capacity || 0) - nextCount),
              isRegistered: true,
              registrationState: 'REGISTERED ✓'
            }
          };
        }
        return p;
      })
    );
    fetchHighlightsAndClubs();
  };

  const isOrganizerOrAdmin = user && (user.role === 'organizer' || user.role === 'admin');
  const myManagedClubs = clubs.filter(c => c.canManage);

  const hasActiveFilters =
    selectedCategory !== 'All' ||
    debouncedSearch !== '' ||
    appliedFilters.clubId !== '' ||
    appliedFilters.dateFilter !== 'upcoming' ||
    appliedFilters.department !== '' ||
    appliedFilters.regStatus !== 'all' ||
    appliedFilters.eventType !== 'all' ||
    appliedFilters.includePast;

  const renderFilterForm = () => (
    <form onSubmit={handleApplyFilters} className="space-y-3.5 text-[13px]">
      <div>
        <label className="block text-[12px] text-[#8a847a] mb-1">Category</label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="input-field h-8 py-0 leading-tight text-[12px]"
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[12px] text-[#8a847a] mb-1">Club</label>
        <select
          value={draftFilters.clubId}
          onChange={(e) => setDraftFilters({ ...draftFilters, clubId: e.target.value })}
          className="input-field h-8 py-0 leading-tight text-[12px]"
        >
          <option value="">All clubs</option>
          {clubs.map(c => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[12px] text-[#8a847a] mb-1">Date range</label>
        <select
          value={draftFilters.dateFilter}
          onChange={(e) =>
            setDraftFilters({
              ...draftFilters,
              dateFilter: e.target.value,
              includePast: e.target.value === 'past' ? true : draftFilters.includePast
            })
          }
          className="input-field h-8 py-0 leading-tight text-[12px]"
        >
          <option value="upcoming">Upcoming</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="past">Past Events</option>
          <option value="all">All Dates</option>
        </select>
      </div>

      <div>
        <label className="block text-[12px] text-[#8a847a] mb-1">Department</label>
        <select
          value={draftFilters.department}
          onChange={(e) => setDraftFilters({ ...draftFilters, department: e.target.value })}
          className="input-field h-8 py-0 leading-tight text-[12px]"
        >
          <option value="">All departments</option>
          {departments.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[12px] text-[#8a847a] mb-1">Registration status</label>
        <select
          value={draftFilters.regStatus}
          onChange={(e) => setDraftFilters({ ...draftFilters, regStatus: e.target.value })}
          className="input-field h-8 py-0 leading-tight text-[12px]"
        >
          <option value="all">Any status</option>
          <option value="open">Registration Open</option>
          <option value="registered">Registered</option>
          <option value="full">Event Full</option>
        </select>
      </div>

      <div>
        <label className="block text-[12px] text-[#8a847a] mb-1">Post &amp; event type</label>
        <select
          value={draftFilters.eventType}
          onChange={(e) => setDraftFilters({ ...draftFilters, eventType: e.target.value })}
          className="input-field h-8 py-0 leading-tight text-[12px]"
        >
          <option value="all">Events &amp; announcements</option>
          <option value="event">Events only</option>
          <option value="announcement">Announcements only</option>
          <option value="workshop">Workshop</option>
          <option value="tech">Tech</option>
          <option value="non-tech">Non-tech</option>
          <option value="special">Special</option>
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer pt-1 text-[12px] text-[#aaa398]">
        <input
          type="checkbox"
          checked={draftFilters.includePast}
          onChange={(e) =>
            setDraftFilters({
              ...draftFilters,
              includePast: e.target.checked,
              dateFilter: e.target.checked ? 'past' : 'upcoming'
            })
          }
          className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132] focus:ring-offset-[#1c1a18]"
        />
        <span>Include Past Events</span>
      </label>

      <div className="pt-2 flex items-center gap-2">
        <button type="submit" className="btn-primary flex-1 h-8 text-[12px]">
          Apply
        </button>
        <button
          type="button"
          onClick={handleResetFilters}
          className="btn-secondary h-8 px-3 text-[12px]"
        >
          Reset
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6 pb-20 md:pb-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#efe9de]/[0.08]">
        <div>
          <div className="inline-flex items-center gap-2 text-[12px] font-mono text-[#ebb05d] mb-1">
            <MegaphoneIcon className="h-4 w-4" strokeWidth={1.5} />
            <span>Avenor Stream</span>
          </div>
          <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15]">
            Campus Feed
          </h1>
          <p className="mt-1 text-[14px] text-[#aaa398]">
            Discover upcoming events, club announcements, discussions, and open registrations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isOrganizerOrAdmin && (
            <>
              <button
                type="button"
                onClick={() => setCreateClubOpen(true)}
                className="btn-secondary h-9 px-3.5 text-[13px]"
              >
                <PlusIcon className="h-4 w-4 text-[#aaa398]" strokeWidth={1.5} />
                <span>New club</span>
              </button>
              <button
                type="button"
                onClick={() => setAnnouncementOpen(true)}
                className="btn-primary h-9 px-4 text-[13px]"
              >
                <MegaphoneIcon className="h-4 w-4" strokeWidth={1.5} />
                <span>Post announcement</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Responsive 3-column Desktop / Clean Mobile Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar (Desktop): Feed Switcher + Filter Controls */}
        <aside className="hidden lg:block lg:col-span-3 space-y-5 sticky top-20">
          <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-2 space-y-1">
            {[
              { id: 'discover', label: 'Discover', icon: SparklesIcon },
              { id: 'following', label: 'Following', icon: UserGroupIcon, count: followedClubsCount },
              { id: 'saved', label: 'Saved', icon: BookmarkIcon }
            ].map((tabItem) => {
              const IconComp = tabItem.icon;
              const isActive = activeTab === tabItem.id;
              return (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => switchTab(tabItem.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-[14px] font-medium transition-colors duration-150 ${isActive
                      ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.1]'
                      : 'text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421]/40 border border-transparent'
                    }`}
                >
                  <span className="flex items-center gap-2.5">
                    <IconComp
                      className={`h-4 w-4 ${isActive ? 'text-[#ebb05d]' : 'text-[#8a847a]'}`}
                      strokeWidth={1.5}
                    />
                    <span>{tabItem.label}</span>
                  </span>
                  {typeof tabItem.count === 'number' && isAuthenticated && (
                    <span className="text-[11px] font-mono text-[#8a847a] tabular-nums">
                      {tabItem.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FunnelIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                <h2 className="text-[14px] font-medium text-[#efe9de]">Filters</h2>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-[11px] font-mono text-[#ebb05d] hover:text-[#efe9de]"
                >
                  Clear
                </button>
              )}
            </div>
            {renderFilterForm()}
          </div>
        </aside>

        {/* Center Main Feed */}
        <section className="lg:col-span-6 space-y-4 min-w-0">
          {/* Search + Mobile Filter Trigger */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              <MagnifyingGlassIcon
                className="h-4 w-4 text-[#8a847a] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search events, clubs, announcements..."
                className="input-field h-10 py-0 pl-10 pr-8 text-[13px] leading-tight"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8a847a] hover:text-[#efe9de]"
                  aria-label="Clear search"
                >
                  <XMarkIcon className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className="lg:hidden btn-secondary h-10 px-3 text-[13px] shrink-0"
            >
              <FunnelIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
              <span>Filters</span>
            </button>
          </div>

          {/* Mobile Expandable Filter Panel */}
          {mobileFiltersOpen && (
            <div className="lg:hidden rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.1] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-medium text-[#efe9de]">Filter Campus Feed</h2>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="text-[#8a847a] hover:text-[#efe9de]"
                >
                  <XMarkIcon className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
              {renderFilterForm()}
            </div>
          )}

          {/* Top Feed Tabs */}
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex p-1 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] gap-1 w-full sm:w-auto">
              {[
                { id: 'discover', label: 'Discover' },
                { id: 'following', label: 'Following' },
                { id: 'saved', label: 'Saved' }
              ].map((tabItem) => (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => switchTab(tabItem.id)}
                  className={`flex-1 sm:flex-initial h-8 px-4 rounded-[6px] text-[13px] font-medium transition-colors duration-150 ${activeTab === tabItem.id
                      ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                      : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
                    }`}
                >
                  {tabItem.label}
                </button>
              ))}
            </div>

            {!loading && (
              <span className="hidden sm:inline-block text-[12px] font-mono text-[#8a847a] tabular-nums shrink-0">
                {total} {total === 1 ? 'post' : 'posts'}
              </span>
            )}
          </div>

          {/* Horizontal Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1 no-scrollbar">
            {CATEGORIES.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`h-8 px-3.5 rounded-[8px] text-[12px] font-medium whitespace-nowrap shrink-0 transition-colors duration-150 border ${active
                      ? 'bg-[#e09132] text-[#12110f] border-[#e09132]'
                      : 'bg-[#1c1a18] text-[#aaa398] border-[#efe9de]/[0.08] hover:text-[#efe9de] hover:border-[#efe9de]/[0.16]'
                    }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          {/* Auth Required Guard for Following / Saved */}
          {(activeTab === 'following' || activeTab === 'saved') && !isAuthenticated ? (
            <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-8 text-center space-y-3">
              <UserGroupIcon className="h-8 w-8 text-[#8a847a] mx-auto" strokeWidth={1.5} />
              <h3 className="text-[17px] font-medium text-[#efe9de]">
                {activeTab === 'following'
                  ? 'Sign in to view followed clubs'
                  : 'Sign in to view your saved events'}
              </h3>
              <p className="text-[13px] text-[#aaa398] max-w-sm mx-auto">
                Keep track of your favorite campus chapters, announcements, and bookmarked events in one place.
              </p>
              <div className="pt-1 flex justify-center gap-2.5">
                <Link to="/login" className="btn-primary h-9 px-5 text-[13px]">
                  Sign in
                </Link>
                <button
                  type="button"
                  onClick={() => switchTab('discover')}
                  className="btn-secondary h-9 px-4 text-[13px]"
                >
                  Explore Discover
                </button>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[14px] bg-[#1c1a18] border border-[#e5484d]/30 p-6 text-center space-y-3">
              <ExclamationTriangleIcon className="h-7 w-7 text-[#e5484d] mx-auto" strokeWidth={1.5} />
              <p className="text-[14px] text-[#efe9de]">{error}</p>
              <button
                type="button"
                onClick={() => fetchFeed(1, false)}
                className="btn-secondary h-9 px-4 text-[13px]"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-4">
              <FeedSkeletonCard />
              <FeedSkeletonCard />
              <FeedSkeletonCard />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-10 text-center space-y-3">
              {activeTab === 'following' && followedClubsCount === 0 ? (
                <>
                  <UserGroupIcon className="h-8 w-8 text-[#8a847a] mx-auto" strokeWidth={1.5} />
                  <h3 className="text-[17px] font-medium text-[#efe9de]">No clubs followed yet.</h3>
                  <p className="text-[13px] text-[#8a847a] max-w-sm mx-auto">
                    Follow campus clubs to see their upcoming workshops, hackathons, and announcements here.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => switchTab('discover')}
                      className="btn-primary h-9 px-5 text-[13px]"
                    >
                      Discover Clubs
                    </button>
                  </div>
                </>
              ) : activeTab === 'saved' ? (
                <>
                  <BookmarkIcon className="h-8 w-8 text-[#8a847a] mx-auto" strokeWidth={1.5} />
                  <h3 className="text-[17px] font-medium text-[#efe9de]">No saved events yet.</h3>
                  <p className="text-[13px] text-[#8a847a] max-w-sm mx-auto">
                    Click Save on any event or announcement in Discover to bookmark it for later.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => switchTab('discover')}
                      className="btn-secondary h-9 px-4 text-[13px]"
                    >
                      Browse Discover
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <CalendarIcon className="h-8 w-8 text-[#8a847a] mx-auto" strokeWidth={1.5} />
                  <h3 className="text-[17px] font-medium text-[#efe9de]">
                    {hasActiveFilters ? 'No matching results found.' : 'No upcoming events found.'}
                  </h3>
                  <p className="text-[13px] text-[#8a847a] max-w-sm mx-auto">
                    {hasActiveFilters
                      ? 'Try clearing your search query or adjusting the active category and date filters.'
                      : 'Check back soon or include Past Events in filters to browse earlier sessions.'}
                  </p>
                  {hasActiveFilters && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="btn-secondary h-9 px-4 text-[13px]"
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <EventFeedCard
                  key={item._id}
                  item={item}
                  currentUser={user}
                  onToggleLike={handleToggleLike}
                  onToggleSave={handleToggleSave}
                  onOpenComments={(target) => setCommentsTarget(target)}
                  onToggleFollowClub={handleToggleFollowClub}
                  onRegisterClick={(ev) => setRegisterTarget(ev)}
                  onDeletePost={handleDeletePost}
                />
              ))}

              {/* Infinite scroll sentinel & manual load more */}
              {hasMore && (
                <div ref={sentinelRef} className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => fetchFeed(page + 1, true)}
                    disabled={loadingMore}
                    className="btn-secondary h-9 px-5 text-[13px]"
                  >
                    {loadingMore ? 'Loading more...' : 'Load more posts'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Sidebar: Campus Clubs & Open Highlights */}
        <aside ref={clubsSectionRef} className="lg:col-span-3 space-y-5 lg:sticky lg:top-20">
          {/* Clubs Directory Widget */}
          <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-medium text-[#efe9de]">Campus clubs</h2>
              <span className="text-[11px] font-mono text-[#8a847a] tabular-nums">
                {clubs.length} active
              </span>
            </div>

            {clubs.length === 0 ? (
              <p className="text-[12px] text-[#8a847a] py-2">
                No clubs registered yet. Organizers can add chapters anytime.
              </p>
            ) : (
              <div className="space-y-2.5">
                {clubs.slice(0, 6).map((club) => {
                  const logoSrc = resolveMediaUrl(club.logo);
                  return (
                    <div
                      key={club._id}
                      className="flex items-center justify-between gap-2.5 p-2 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.06]"
                    >
                      <Link
                        to={`/clubs/${club._id}`}
                        className="flex items-center gap-2.5 min-w-0 group"
                      >
                        <div className="h-8 w-8 rounded-[8px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center text-[12px] font-medium text-[#ebb05d] shrink-0 overflow-hidden">
                          {logoSrc ? (
                            <img src={logoSrc} alt={club.name} className="w-full h-full object-cover" />
                          ) : (
                            <span aria-hidden="true">{club.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[13px] font-medium text-[#efe9de] group-hover:text-[#ebb05d] truncate transition-colors">
                              {club.name}
                            </span>
                            {club.verified && (
                              <CheckBadgeIcon className="h-3.5 w-3.5 text-[#ebb05d] shrink-0" strokeWidth={1.75} />
                            )}
                          </div>
                          <span className="block text-[11px] font-mono text-[#8a847a] tabular-nums">
                            {formatCount(club.followersCount)} {club.followersCount === 1 ? 'follower' : 'followers'}
                          </span>
                        </div>
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleToggleFollowClub(club)}
                        className={`h-7 px-2.5 rounded-[6px] text-[11px] font-medium shrink-0 transition-colors duration-150 ${club.isFollowing
                            ? 'bg-[#262421] text-[#4cc38a] border border-[#4cc38a]/25'
                            : 'bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.1] hover:border-[#e09132]/40'
                          }`}
                      >
                        {club.isFollowing ? 'Following ✓' : '+ Follow'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Open Registration Highlights */}
          {highlights.length > 0 && (
            <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-medium text-[#efe9de]">Open for registration</h2>
                <Link to="/events" className="text-[12px] text-[#ebb05d] hover:text-[#efe9de]">
                  All
                </Link>
              </div>
              <div className="space-y-2.5">
                {highlights.map((hl) => (
                  <Link
                    key={hl._id}
                    to={`/events/${hl.event._id}`}
                    className="block p-3 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.06] hover:border-[#efe9de]/[0.16] transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#8a847a] tabular-nums">
                      <span className="text-[#ebb05d]">{hl.club?.name || hl.event.department}</span>
                      <span>{formatEventDate(hl.event.date)}</span>
                    </div>
                    <p className="text-[13px] font-medium text-[#efe9de] line-clamp-1 mt-1">
                      {hl.event.title}
                    </p>
                    <p className="text-[11px] font-mono text-[#8a847a] mt-1 tabular-nums">
                      {hl.event.availableSeats} seats left
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#12110f]/95 backdrop-blur border-t border-[#efe9de]/[0.08] px-2 py-1.5 grid grid-cols-4 gap-1">
        <button
          type="button"
          onClick={() => switchTab('discover')}
          className={`flex flex-col items-center justify-center py-1 rounded-[8px] text-[11px] font-medium ${activeTab === 'discover' ? 'text-[#ebb05d] bg-[#262421]' : 'text-[#8a847a]'
            }`}
        >
          <SparklesIcon className="h-4 w-4 mb-0.5" strokeWidth={1.5} />
          <span>Discover</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('following')}
          className={`flex flex-col items-center justify-center py-1 rounded-[8px] text-[11px] font-medium ${activeTab === 'following' ? 'text-[#ebb05d] bg-[#262421]' : 'text-[#8a847a]'
            }`}
        >
          <UserGroupIcon className="h-4 w-4 mb-0.5" strokeWidth={1.5} />
          <span>Following</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('saved')}
          className={`flex flex-col items-center justify-center py-1 rounded-[8px] text-[11px] font-medium ${activeTab === 'saved' ? 'text-[#ebb05d] bg-[#262421]' : 'text-[#8a847a]'
            }`}
        >
          <BookmarkIcon className="h-4 w-4 mb-0.5" strokeWidth={1.5} />
          <span>Saved</span>
        </button>
        <button
          type="button"
          onClick={() => clubsSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="flex flex-col items-center justify-center py-1 rounded-[8px] text-[11px] font-medium text-[#8a847a] hover:text-[#efe9de]"
        >
          <CalendarIcon className="h-4 w-4 mb-0.5" strokeWidth={1.5} />
          <span>Clubs</span>
        </button>
      </div>

      {/* Lazy-Loaded Comments Modal */}
      {commentsTarget && (
        <CommentsModal
          item={commentsTarget}
          onClose={() => setCommentsTarget(null)}
          onCommentsCountChange={(postId, nextCount) => {
            setItems(prev =>
              prev.map(p => (p._id === postId ? { ...p, commentsCount: nextCount } : p))
            );
          }}
        />
      )}

      {/* Existing Event Registration Flow Modal */}
      {registerTarget && (
        <EventRegistration
          event={registerTarget}
          onRegistered={() => handleRegisteredSuccess(registerTarget)}
          onClose={() => {
            setRegisterTarget(null);
            fetchFeed(1, false);
          }}
        />
      )}

      {/* Organizer / Admin Announcement Composer Modal */}
      <AnnouncementModal
        isOpen={announcementOpen}
        onClose={() => setAnnouncementOpen(false)}
        clubs={user?.role === 'admin' ? clubs : myManagedClubs}
        onCreated={(newPost) => {
          if (newPost) {
            setItems(prev => [newPost, ...prev]);
            setTotal(prev => prev + 1);
          }
        }}
      />

      {/* Organizer / Admin Create Club Modal */}
      <CreateClubModal
        isOpen={createClubOpen}
        onClose={() => setCreateClubOpen(false)}
        onCreated={(newClub) => {
          if (newClub) {
            setClubs(prev => [newClub, ...prev]);
          }
        }}
      />
    </div>
  );
};

export default CampusFeed;
