const Event = require('../../models/events/Event');
const User = require('../../models/auth/User');
const Club = require('../../models/feed/Club');
const FeedPost = require('../../models/feed/FeedPost');
const PostLike = require('../../models/feed/PostLike');
const PostSave = require('../../models/feed/PostSave');
const Comment = require('../../models/feed/Comment');
const ClubFollow = require('../../models/feed/ClubFollow');
const Registration = require('../../models/events/Registration');
const Notification = require('../../models/community/Notification');
const { sanitizePlainText, sanitizeTags, slugify } = require('../../utils/sanitize');

const PUBLISHED_EVENT_STATUSES = ['approved', 'upcoming', 'ongoing', 'completed'];

function deriveEventCategory(event) {
  const existing = (event?.category || '').trim();
  if (FeedPost.FEED_CATEGORIES.includes(existing)) {
    return existing;
  }

  const text = `${event?.title || ''} ${event?.description || ''} ${(event?.tags || []).join(' ')}`.toLowerCase();
  if (text.includes('hackathon') || text.includes('hack ') || text.includes('codeathon')) return 'Hackathon';
  if (text.includes('seminar') || text.includes('colloquium') || text.includes('talk') || text.includes('webinar')) return 'Seminar';
  if (text.includes('sport') || text.includes('cricket') || text.includes('football') || text.includes('athletic')) return 'Sports';
  if (text.includes('cultural') || text.includes('music') || text.includes('dance') || text.includes('art')) return 'Cultural';
  if (text.includes('competition') || text.includes('contest') || text.includes('quiz') || text.includes('olympiad')) return 'Competition';
  if (event?.type === 'workshop' || text.includes('workshop') || text.includes('bootcamp') || text.includes('hands-on')) return 'Workshop';
  if (event?.type === 'non-tech') return 'Cultural';
  if (event?.type === 'special') return 'Competition';
  return 'Technical';
}

function parseClockToken(token) {
  const m = String(token || '').match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3] ? m[3].toLowerCase() : null;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function parseEventTimeWindow(event) {
  const rawDate = event?.date ? new Date(event.date) : null;
  if (!rawDate || Number.isNaN(rawDate.getTime())) {
    return { startsAt: null, endsAt: null, hasExplicitEnd: false };
  }

  const matches = String(event?.time || '').match(/\d{1,2}:\d{2}(?:\s*(?:am|pm))?/gi) || [];
  const startClock = matches[0] ? parseClockToken(matches[0]) : null;
  const endClock = matches[1] ? parseClockToken(matches[1]) : null;

  const year = rawDate.getFullYear();
  const month = rawDate.getMonth();
  const day = rawDate.getDate();

  const startsAt = startClock
    ? new Date(year, month, day, startClock.hours, startClock.minutes, 0, 0)
    : new Date(year, month, day, 0, 0, 0, 0);

  let endsAt;
  let hasExplicitEnd = false;
  if (endClock) {
    hasExplicitEnd = true;
    endsAt = new Date(year, month, day, endClock.hours, endClock.minutes, 59, 999);
    if (endsAt <= startsAt) {
      endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    }
  } else {
    endsAt = new Date(year, month, day, 23, 59, 59, 999);
  }

  return { startsAt, endsAt, hasExplicitEnd };
}

function computeEventLifecycle(event, now = new Date()) {
  if (!event) {
    return {
      startsAt: null,
      endsAt: null,
      registrationState: 'REGISTRATION CLOSED',
      isExpired: true,
      isRegistrationOpen: false,
      attendeesCount: 0,
      availableSeats: 0
    };
  }

  const attendeesCount = Array.isArray(event.attendees) ? event.attendees.length : 0;
  const capacity = Number(event.capacity || 0);
  const availableSeats = Math.max(0, capacity - attendeesCount);
  const { startsAt, endsAt, hasExplicitEnd } = parseEventTimeWindow(event);

  let isExpired = false;
  let registrationState = 'REGISTER NOW';

  if (event.status === 'completed') {
    isExpired = true;
    registrationState = 'EVENT COMPLETED';
  } else if (event.status === 'cancelled' || event.status === 'rejected') {
    isExpired = true;
    registrationState = 'REGISTRATION CLOSED';
  } else if (event.status === 'ongoing') {
    isExpired = false;
    registrationState = 'EVENT STARTED';
  } else if (endsAt && now > endsAt) {
    isExpired = true;
    registrationState = 'EVENT COMPLETED';
  } else if (
    hasExplicitEnd &&
    startsAt &&
    endsAt &&
    now >= startsAt &&
    now <= endsAt
  ) {
    isExpired = false;
    registrationState = 'EVENT STARTED';
  } else if (
    event.registrationOpen === false ||
    (event.registrationDeadline && now > new Date(event.registrationDeadline))
  ) {
    isExpired = false;
    registrationState = 'REGISTRATION CLOSED';
  } else if (capacity > 0 && attendeesCount >= capacity) {
    isExpired = false;
    registrationState = 'EVENT FULL';
  }

  const isRegistrationOpen = !isExpired && registrationState === 'REGISTER NOW';

  return {
    startsAt,
    endsAt,
    registrationState,
    isExpired,
    isRegistrationOpen,
    attendeesCount,
    availableSeats
  };
}

async function createUniqueSlug(baseName) {
  const base = slugify(baseName, 'campus-club');
  let candidate = base;
  let counter = 1;
  while (await Club.exists({ slug: candidate })) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

async function resolveClubForOrganizer(organizerId, fallbackDepartment = '') {
  if (!organizerId) return null;
  const existing = await Club.findOne({ admins: organizerId }).sort({ createdAt: 1 });
  if (existing) return existing;

  const user = await User.findById(organizerId).select('name department role');
  const dept = (fallbackDepartment || user?.department || '').trim();
  const baseName =
    user?.role === 'organizer'
      ? (user.name || `${dept || 'Campus'} Club`).trim()
      : `${dept || user?.name || 'Campus'} Chapter`.trim();

  // Check if a club already exists with same name
  const slugCandidate = slugify(baseName, 'campus-club');
  const bySlug = await Club.findOne({ slug: slugCandidate });
  if (bySlug) {
    if (!bySlug.admins.some(a => a.toString() === organizerId.toString())) {
      bySlug.admins.push(organizerId);
      await bySlug.save();
    }
    return bySlug;
  }

  const uniqueSlug = await createUniqueSlug(baseName);
  const club = await Club.create({
    name: baseName,
    slug: uniqueSlug,
    description: dept
      ? `Official ${dept} student chapter hosting workshops, seminars, and campus events.`
      : 'Verified campus club hosting student workshops and technical sessions.',
    department: dept || 'General',
    tags: dept ? [dept, 'Campus'] : ['Campus'],
    admins: [organizerId],
    createdBy: organizerId,
    followersCount: 0,
    verified: true
  });
  return club;
}

async function notifyFollowersOfClub({ club, title, message, type, relatedEvent = null, excludeUserId = null }) {
  if (!club) return;
  try {
    const follows = await ClubFollow.find({ club: club._id }).select('user').lean();
    const userIds = follows
      .map(f => f.user)
      .filter(uid => !excludeUserId || uid.toString() !== excludeUserId.toString());

    if (userIds.length === 0) return;

    await Notification.insertMany(
      userIds.map(uid => ({
        user: uid,
        title: sanitizePlainText(title, 120),
        message: sanitizePlainText(message, 400),
        type,
        relatedEvent: relatedEvent || undefined
      }))
    );
  } catch (err) {
    console.warn('Follower notification dispatch failed:', err.message);
  }
}

async function syncEventToFeed(eventDoc, { notifyFollowers = false } = {}) {
  if (!eventDoc) return null;

  let clubId = eventDoc.club;
  if (!clubId && eventDoc.organizer) {
    const club = await resolveClubForOrganizer(eventDoc.organizer, eventDoc.department);
    if (club) {
      clubId = club._id;
      eventDoc.club = clubId;
    }
  }

  const derivedCategory = deriveEventCategory(eventDoc);
  let shouldSaveEvent = false;
  if (!eventDoc.category && derivedCategory) {
    eventDoc.category = derivedCategory;
    shouldSaveEvent = true;
  }
  if (eventDoc.isModified('club') || shouldSaveEvent) {
    await eventDoc.save();
  }

  const isPublished = PUBLISHED_EVENT_STATUSES.includes(eventDoc.status);
  let post = await FeedPost.findOne({ event: eventDoc._id });

  const wasHiddenOrNew = !post || post.status !== 'published';

  if (!post) {
    if (!isPublished) {
      return null;
    }
    post = await FeedPost.create({
      type: 'event',
      event: eventDoc._id,
      club: clubId || null,
      author: eventDoc.organizer,
      category: derivedCategory,
      tags: sanitizeTags(eventDoc.tags || []),
      status: 'published',
      publishedAt: eventDoc.createdAt || new Date()
    });
  } else {
    post.club = clubId || post.club;
    post.category = derivedCategory;
    if (Array.isArray(eventDoc.tags) && eventDoc.tags.length > 0) {
      post.tags = sanitizeTags(eventDoc.tags);
    }
    post.status = isPublished ? 'published' : 'hidden';
    if (isPublished && wasHiddenOrNew) {
      post.publishedAt = new Date();
    }
    await post.save();
  }

  if (notifyFollowers && isPublished && wasHiddenOrNew && clubId) {
    const club = await Club.findById(clubId).select('name');
    if (club) {
      await notifyFollowersOfClub({
        club,
        title: `${club.name} published an event`,
        message: `${eventDoc.title} on ${new Date(eventDoc.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        type: 'club_event',
        relatedEvent: eventDoc._id,
        excludeUserId: eventDoc.organizer
      });
    }
  }

  return post;
}

let lastFullSyncAt = 0;
async function ensureAllPublishedEventsSynced(force = false) {
  const nowMs = Date.now();
  if (!force && nowMs - lastFullSyncAt < 30 * 1000) {
    return;
  }
  lastFullSyncAt = nowMs;

  const events = await Event.find({
    status: { $in: PUBLISHED_EVENT_STATUSES }
  });
  if (events.length === 0) return;

  const existingPosts = await FeedPost.find({
    event: { $in: events.map(e => e._id) }
  }).select('event club status').lean();

  const postMap = new Map(existingPosts.map(p => [p.event.toString(), p]));
  for (const ev of events) {
    const existing = postMap.get(ev._id.toString());
    if (!existing || !ev.club || existing.status !== 'published') {
      await syncEventToFeed(ev, { notifyFollowers: false });
    }
  }
}

async function cleanupFeedForEvent(eventId) {
  if (!eventId) return;
  const posts = await FeedPost.find({ $or: [{ event: eventId }, { relatedEvent: eventId }] }).select('_id event').lean();
  const directEventPostIds = posts.filter(p => p.event && p.event.toString() === eventId.toString()).map(p => p._id);

  if (directEventPostIds.length > 0) {
    await PostLike.deleteMany({ post: { $in: directEventPostIds } });
    await PostSave.deleteMany({ post: { $in: directEventPostIds } });
    await Comment.deleteMany({ post: { $in: directEventPostIds } });
    await FeedPost.deleteMany({ _id: { $in: directEventPostIds } });
  }

  // Unlink any announcements that merely referenced the deleted event
  await FeedPost.updateMany(
    { relatedEvent: eventId },
    { $set: { relatedEvent: null } }
  );
  await Comment.deleteMany({ event: eventId });
}

async function hydrateFeedPosts(posts, currentUser = null) {
  if (!Array.isArray(posts) || posts.length === 0) return [];

  const postIds = posts.map(p => p._id);
  const clubIds = [
    ...new Set(
      posts
        .map(p => (p.club?._id ? p.club._id.toString() : p.club ? p.club.toString() : null))
        .filter(Boolean)
    )
  ];
  const eventIds = [
    ...new Set(
      posts
        .filter(p => p.type === 'event' && p.event)
        .map(p => (p.event._id ? p.event._id.toString() : p.event.toString()))
    )
  ];

  let likedSet = new Set();
  let savedSet = new Set();
  let followedClubSet = new Set();
  let activeRegMap = new Map();

  if (currentUser?._id) {
    const [likes, saves, follows, regs] = await Promise.all([
      PostLike.find({ user: currentUser._id, post: { $in: postIds } }).select('post').lean(),
      PostSave.find({ user: currentUser._id, post: { $in: postIds } }).select('post').lean(),
      clubIds.length > 0
        ? ClubFollow.find({ user: currentUser._id, club: { $in: clubIds } }).select('club').lean()
        : Promise.resolve([]),
      eventIds.length > 0
        ? Registration.find({
            user: currentUser._id,
            event: { $in: eventIds },
            status: { $in: ['approved', 'pending'] }
          })
            .select('event status regNo')
            .lean()
        : Promise.resolve([])
    ]);

    likedSet = new Set(likes.map(l => l.post.toString()));
    savedSet = new Set(saves.map(s => s.post.toString()));
    followedClubSet = new Set(follows.map(f => f.club.toString()));
    activeRegMap = new Map(regs.map(r => [r.event.toString(), r]));
  }

  const now = new Date();
  const uid = currentUser?._id?.toString() || null;

  return posts.map(raw => {
    const post = typeof raw.toObject === 'function' ? raw.toObject() : raw;
    const clubObj = post.club && typeof post.club === 'object' ? post.club : null;
    const clubIdStr = clubObj?._id ? clubObj._id.toString() : post.club ? post.club.toString() : null;
    const eventObj = post.event && typeof post.event === 'object' ? post.event : null;

    let eventMeta = null;
    let isRegistered = false;
    let registrationButtonState = null;
    let isExpired = false;
    let isRegistrationOpen = false;

    if (post.type === 'event' && eventObj) {
      const lifecycle = computeEventLifecycle(eventObj, now);
      const inAttendees =
        uid && Array.isArray(eventObj.attendees)
          ? eventObj.attendees.some(a => (a._id ? a._id.toString() : a.toString()) === uid)
          : false;
      const hasReg = activeRegMap.has(eventObj._id.toString());
      isRegistered = Boolean(inAttendees || hasReg);

      registrationButtonState = isRegistered ? 'REGISTERED ✓' : lifecycle.registrationState;
      isExpired = lifecycle.isExpired;
      isRegistrationOpen = lifecycle.isRegistrationOpen;

      eventMeta = {
        _id: eventObj._id,
        title: eventObj.title,
        description: eventObj.description,
        date: eventObj.date,
        time: eventObj.time,
        location: eventObj.location,
        department: eventObj.department,
        type: eventObj.type,
        category: deriveEventCategory(eventObj),
        tags: eventObj.tags || [],
        capacity: eventObj.capacity,
        attendeesCount: lifecycle.attendeesCount,
        availableSeats: lifecycle.availableSeats,
        photo: eventObj.photo,
        status: eventObj.status,
        eligibility: eventObj.eligibility || 'Open to all enrolled students',
        registrationDeadline: eventObj.registrationDeadline || null,
        registrationOpen: eventObj.registrationOpen !== false,
        noveltyFeatures: eventObj.noveltyFeatures || {},
        organizer: eventObj.organizer || post.author,
        startsAt: lifecycle.startsAt,
        endsAt: lifecycle.endsAt,
        isExpired,
        isRegistrationOpen,
        isRegistered,
        registrationState: registrationButtonState
      };
    }

    const canModerate =
      Boolean(uid) &&
      (currentUser.role === 'admin' ||
        (post.author?._id ? post.author._id.toString() : post.author?.toString()) === uid ||
        (clubObj?.admins || []).some(a => a.toString() === uid));

    return {
      _id: post._id,
      type: post.type,
      status: post.status,
      publishedAt: post.publishedAt || post.createdAt,
      createdAt: post.createdAt,
      category: post.type === 'event' && eventMeta ? eventMeta.category : post.category || 'General',
      tags: post.type === 'event' && eventMeta?.tags?.length ? eventMeta.tags : post.tags || [],
      title: post.type === 'event' && eventMeta ? eventMeta.title : post.title,
      content: post.type === 'event' && eventMeta ? eventMeta.description : post.content,
      mediaUrl: post.type === 'event' && eventMeta ? eventMeta.photo : post.mediaUrl,
      relatedEvent: post.relatedEvent || null,
      author: post.author,
      club: clubObj
        ? {
            _id: clubObj._id,
            name: clubObj.name,
            slug: clubObj.slug,
            description: clubObj.description,
            logo: clubObj.logo,
            department: clubObj.department,
            followersCount: clubObj.followersCount || 0,
            verified: clubObj.verified !== false,
            isFollowing: followedClubSet.has(clubIdStr)
          }
        : null,
      event: eventMeta,
      likesCount: post.likesCount || 0,
      savesCount: post.savesCount || 0,
      commentsCount: post.commentsCount || 0,
      isLiked: likedSet.has(post._id.toString()),
      isSaved: savedSet.has(post._id.toString()),
      isRegistered,
      registrationState: registrationButtonState,
      isExpired,
      isRegistrationOpen,
      canDelete: canModerate
    };
  });
}

module.exports = {
  PUBLISHED_EVENT_STATUSES,
  deriveEventCategory,
  computeEventLifecycle,
  createUniqueSlug,
  resolveClubForOrganizer,
  notifyFollowersOfClub,
  syncEventToFeed,
  ensureAllPublishedEventsSynced,
  cleanupFeedForEvent,
  hydrateFeedPosts
};

