import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  BookmarkIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  UserGroupIcon,
  EllipsisHorizontalIcon,
  MegaphoneIcon,
  CheckBadgeIcon,
  TrashIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import {
  HeartIcon as HeartSolidIcon,
  BookmarkIcon as BookmarkSolidIcon
} from '@heroicons/react/24/solid';
import {
  resolveMediaUrl,
  formatEventDate,
  formatRelativeTime,
  formatCount,
  getEventLifecycle
} from '../../utils/eventLifecycle';

const EventFeedCard = ({
  item,
  currentUser,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onToggleFollowClub,
  onRegisterClick,
  onDeletePost
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const isEvent = item.type === 'event' && item.event;
  const event = item.event;
  const club = item.club;

  const targetHref = isEvent
    ? `/events/${event._id}`
    : item.relatedEvent?._id
      ? `/events/${item.relatedEvent._id}`
      : club
        ? `/clubs/${club._id}`
        : '/campus-feed';

  const mediaSrc = resolveMediaUrl(item.mediaUrl);
  const clubLogoSrc = resolveMediaUrl(club?.logo);

  const lifecycle = isEvent
    ? getEventLifecycle(event, item.isRegistered)
    : null;

  const handleShare = async () => {
    const sharePath = isEvent ? `/events/${event._id}` : `/clubs/${club?._id || ''}`;
    const fullUrl = `${window.location.origin}${sharePath}`;
    const title = item.title || 'Avenor Campus Event';

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `${title}${club?.name ? ` · ${club.name}` : ''}`,
          url: fullUrl
        });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    } catch {
      window.prompt('Copy link:', fullUrl);
    }
    setMenuOpen(false);
  };

  const renderRegisterButton = () => {
    if (!isEvent || !lifecycle) return null;

    if (lifecycle.state === 'REGISTERED ✓') {
      return (
        <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] text-[13px] font-medium bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/30 select-none shrink-0">
          <CheckIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span>Registered</span>
        </span>
      );
    }

    if (lifecycle.state !== 'REGISTER NOW') {
      return (
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center h-9 px-3.5 rounded-[8px] text-[12px] font-mono bg-[#262421] text-[#8a847a] border border-[#efe9de]/[0.08] cursor-not-allowed shrink-0"
        >
          {lifecycle.state}
        </button>
      );
    }

    if (!currentUser) {
      return (
        <Link to="/login" className="btn-primary h-9 px-4 text-[13px] shrink-0">
          Register now
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onRegisterClick?.(event, item)}
        className="btn-primary h-9 px-4 text-[13px] shrink-0"
      >
        Register now
      </button>
    );
  };

  return (
    <article
      className={`rounded-[14px] bg-[#1c1a18] border transition-colors duration-150 overflow-hidden ${
        !isEvent
          ? 'border-[#efe9de]/[0.1] border-l-2 border-l-[#e09132]'
          : 'border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16]'
      }`}
    >
      {/* Card Header: Club + Post metadata + Follow + Menu */}
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {club ? (
            <Link
              to={`/clubs/${club._id}`}
              className="h-10 w-10 rounded-[10px] bg-[#262421] border border-[#efe9de]/[0.1] flex items-center justify-center text-[#ebb05d] font-medium text-[15px] shrink-0 overflow-hidden hover:border-[#e09132]/50 transition-colors duration-150"
            >
              {clubLogoSrc ? (
                <img src={clubLogoSrc} alt={club.name} className="w-full h-full object-cover" />
              ) : (
                <span aria-hidden="true">{club.name.charAt(0).toUpperCase()}</span>
              )}
            </Link>
          ) : (
            <div className="h-10 w-10 rounded-[10px] bg-[#262421] border border-[#efe9de]/[0.1] flex items-center justify-center text-[#ebb05d] font-medium text-[15px] shrink-0">
              <span aria-hidden="true">{(item.author?.name || 'A').charAt(0).toUpperCase()}</span>
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {club ? (
                <Link
                  to={`/clubs/${club._id}`}
                  className="text-[14px] font-medium text-[#efe9de] hover:text-[#ebb05d] transition-colors duration-150 truncate"
                >
                  {club.name}
                </Link>
              ) : (
                <span className="text-[14px] font-medium text-[#efe9de] truncate">
                  {item.author?.name || 'Campus Organizer'}
                </span>
              )}
              {club?.verified && (
                <CheckBadgeIcon className="h-4 w-4 text-[#ebb05d] shrink-0" strokeWidth={1.75} title="Verified campus club" />
              )}
              {club && (
                <button
                  type="button"
                  onClick={() => onToggleFollowClub?.(club)}
                  className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-colors duration-150 ${
                    club.isFollowing
                      ? 'bg-[#262421] text-[#4cc38a] border border-[#4cc38a]/25'
                      : 'bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.1] hover:border-[#e09132]/40'
                  }`}
                >
                  {club.isFollowing ? 'Following ✓' : '+ Follow'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#8a847a] mt-0.5">
              {club && (
                <span className="font-mono tabular-nums">
                  {formatCount(club.followersCount)} {club.followersCount === 1 ? 'follower' : 'followers'}
                </span>
              )}
              <span>·</span>
              <span>{item.category || 'Technical'}</span>
              <span>·</span>
              <span className="font-mono tabular-nums">{formatRelativeTime(item.publishedAt)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" ref={menuRef}>
          {!isEvent && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-mono bg-[#e09132]/12 text-[#ebb05d] border border-[#e09132]/25">
              <MegaphoneIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Announcement</span>
            </span>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-[8px] text-[#8a847a] hover:text-[#efe9de] hover:bg-[#262421] transition-colors duration-150"
              aria-label="Post options"
            >
              <EllipsisHorizontalIcon className="h-5 w-5" strokeWidth={1.5} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-[10px] bg-[#262421] border border-[#efe9de]/[0.12] shadow-[0_12px_32px_rgba(0,0,0,0.45)] z-20 py-1 text-[13px]">
                {isEvent && (
                  <Link
                    to={`/events/${event._id}`}
                    onClick={() => setMenuOpen(false)}
                    className="block px-3.5 py-2 text-[#efe9de] hover:bg-[#1c1a18] transition-colors"
                  >
                    Open event page
                  </Link>
                )}
                {club && (
                  <Link
                    to={`/clubs/${club._id}`}
                    onClick={() => setMenuOpen(false)}
                    className="block px-3.5 py-2 text-[#efe9de] hover:bg-[#1c1a18] transition-colors"
                  >
                    View club profile
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleShare}
                  className="w-full text-left px-3.5 py-2 text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18] transition-colors"
                >
                  Copy share link
                </button>
                {item.canDelete && item.type === 'announcement' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeletePost?.(item._id);
                    }}
                    className="w-full text-left px-3.5 py-2 text-[#e5484d] hover:bg-[#e5484d]/10 flex items-center gap-2 transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" strokeWidth={1.5} />
                    <span>Delete post</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="px-5 pb-4 space-y-3.5">
        {isEvent ? (
          <Link to={targetHref} className="block group">
            <h2 className="text-[19px] font-medium text-[#efe9de] group-hover:text-[#ebb05d] transition-colors duration-150 leading-snug">
              {item.title}
            </h2>
          </Link>
        ) : (
          <h2 className="text-[18px] font-medium text-[#efe9de] leading-snug">{item.title}</h2>
        )}

        {mediaSrc && (
          <Link to={targetHref} className="block rounded-[10px] overflow-hidden border border-[#efe9de]/[0.08] bg-[#12110f] aspect-[16/9]">
            <img
              src={mediaSrc}
              alt={item.title}
              loading="lazy"
              className="w-full h-full object-cover object-center hover:scale-[1.01] transition-transform duration-300"
              onError={(e) => {
                e.target.onerror = null;
                e.target.parentElement.style.display = 'none';
              }}
            />
          </Link>
        )}

        <p className="text-[14px] text-[#aaa398] leading-relaxed whitespace-pre-line line-clamp-3">
          {item.content}
        </p>

        {!isEvent && item.relatedEvent && (
          <Link
            to={`/events/${item.relatedEvent._id}`}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] hover:border-[#e09132]/40 transition-colors duration-150"
          >
            <div className="min-w-0">
              <span className="text-[11px] font-mono text-[#ebb05d]">Linked event</span>
              <p className="text-[13px] font-medium text-[#efe9de] truncate">{item.relatedEvent.title}</p>
            </div>
            <span className="text-[12px] font-medium text-[#ebb05d] shrink-0">View details</span>
          </Link>
        )}

        {isEvent && event && (
          <div className="grid grid-cols-2 gap-2.5 pt-1 text-[12px] text-[#aaa398]">
            <div className="px-3 py-2 rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.06] flex items-center gap-2 font-mono tabular-nums">
              <CalendarIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
              <span className="truncate">{formatEventDate(event.date)}</span>
            </div>
            <div className="px-3 py-2 rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.06] flex items-center gap-2 font-mono tabular-nums">
              <ClockIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
              <span className="truncate">{event.time || 'TBD'}</span>
            </div>
            <div className="px-3 py-2 rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.06] flex items-center gap-2">
              <MapPinIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
              <span className="truncate">{event.location}</span>
            </div>
            <div className="px-3 py-2 rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.06] flex items-center gap-2 font-mono tabular-nums">
              <UserGroupIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
              <span className="truncate">
                {lifecycle.attendeesCount}/{event.capacity} joined
              </span>
            </div>
          </div>
        )}

        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-[6px] text-[11px] font-mono bg-[#262421] text-[#8a847a] border border-[#efe9de]/[0.06]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Bar: Like, Comment, Save, Share + Register CTA */}
      <div className="px-5 py-3.5 border-t border-[#efe9de]/[0.06] bg-[#161513]/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => onToggleLike?.(item)}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-[13px] font-mono tabular-nums transition-colors duration-150 ${
              item.isLiked
                ? 'bg-[#e5484d]/12 text-[#e5484d] border border-[#e5484d]/25'
                : 'text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421] border border-transparent'
            }`}
            aria-label={item.isLiked ? 'Unlike' : 'Like'}
          >
            {item.isLiked ? (
              <HeartSolidIcon className="h-4 w-4 shrink-0" />
            ) : (
              <HeartIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            )}
            <span>{formatCount(item.likesCount)}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenComments?.(item)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-[13px] font-mono tabular-nums text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421] transition-colors duration-150"
            aria-label="Open comments"
          >
            <ChatBubbleLeftIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{formatCount(item.commentsCount)}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleSave?.(item)}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] text-[12px] font-medium transition-colors duration-150 ${
              item.isSaved
                ? 'bg-[#e09132]/12 text-[#ebb05d] border border-[#e09132]/25'
                : 'text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421] border border-transparent'
            }`}
            aria-label={item.isSaved ? 'Saved' : 'Save post'}
          >
            {item.isSaved ? (
              <BookmarkSolidIcon className="h-4 w-4 shrink-0" />
            ) : (
              <BookmarkIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            )}
            <span>{item.isSaved ? 'Saved ✓' : 'Save'}</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-[8px] text-[12px] font-medium text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421] transition-colors duration-150"
            aria-label="Share event"
          >
            <ArrowUpRightIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{copiedNotice ? 'Copied ✓' : 'Share'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {isEvent && (
            <Link
              to={`/events/${event._id}`}
              className="btn-secondary h-9 px-3 text-[12px]"
            >
              Details
            </Link>
          )}
          {renderRegisterButton()}
        </div>
      </div>
    </article>
  );
};

export default EventFeedCard;
