const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { auth, optionalAuth, authorize } = require('../../middleware/auth');
const Event = require('../../models/events/Event');
const Club = require('../../models/feed/Club');
const FeedPost = require('../../models/feed/FeedPost');
const PostLike = require('../../models/feed/PostLike');
const PostSave = require('../../models/feed/PostSave');
const Comment = require('../../models/feed/Comment');
const ClubFollow = require('../../models/feed/ClubFollow');
const {
  sanitizePlainText,
  sanitizeTags,
  ALLOWED_IMAGE_MIME_TYPES,
  fileToDataUri,
  sanitizeMediaUrl
} = require('../../utils/sanitize');
const {
  PUBLISHED_EVENT_STATUSES,
  resolveClubForOrganizer,
  notifyFollowersOfClub,
  syncEventToFeed,
  ensureAllPublishedEventsSynced,
  hydrateFeedPosts
} = require('../../services/feed/feedService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    ALLOWED_IMAGE_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())
      ? cb(null, true)
      : cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'))
});

function matchesDateFilter(item, dateFilter, now) {
  if (!dateFilter || dateFilter === 'all') return true;
  if (item.type !== 'event' || !item.event) {
    // Announcements remain visible except when specifically filtering for past events only
    return dateFilter !== 'past';
  }

  const evDate = item.event.date ? new Date(item.event.date) : null;
  if (!evDate || Number.isNaN(evDate.getTime())) return false;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (dateFilter === 'past') {
    return item.isExpired;
  }
  if (dateFilter === 'upcoming') {
    return !item.isExpired;
  }
  if (dateFilter === 'today') {
    return !item.isExpired && evDate >= startOfToday && evDate <= endOfToday;
  }
  if (dateFilter === 'week') {
    const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    return !item.isExpired && evDate >= startOfToday && evDate <= endOfWeek;
  }
  if (dateFilter === 'month') {
    const endOfMonth = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);
    return !item.isExpired && evDate >= startOfToday && evDate <= endOfMonth;
  }
  return true;
}

function discoverRankScore(item, nowMs) {
  const isEvent = item.type === 'event' && item.event;
  const expiredPenalty = isEvent && item.isExpired ? 0 : 1;
  let tier = 2; // announcement default
  if (isEvent) {
    tier = item.isExpired ? 0 : item.isRegistrationOpen ? 3 : 1;
  }

  const publishedMs = new Date(item.publishedAt || item.createdAt).getTime();
  const hoursOld = Math.max(0, (nowMs - publishedMs) / (1000 * 60 * 60));
  const recencyBoost = Math.max(0, 72 - hoursOld) * 0.5;
  const attendeesCount = isEvent ? item.event.attendeesCount || 0 : 0;
  const popularityScore =
    (item.likesCount || 0) * 2 +
    (item.savesCount || 0) * 2 +
    (item.commentsCount || 0) +
    attendeesCount * 1.5;

  return {
    expiredPenalty,
    tier,
    composite: popularityScore + recencyBoost,
    publishedMs
  };
}

// GET /api/feed — paginated Discover / Following / Saved stream
router.get('/', optionalAuth, async (req, res) => {
  try {
    await ensureAllPublishedEventsSynced();

    const tab = ['discover', 'following', 'saved'].includes(req.query.tab)
      ? req.query.tab
      : 'discover';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const search = String(req.query.search || '').trim().toLowerCase();
    const category = String(req.query.category || 'All').trim();
    const clubId = String(req.query.clubId || '').trim();
    const department = String(req.query.department || '').trim();
    const includePast = req.query.includePast === 'true';
    const dateFilter = String(req.query.dateFilter || (tab === 'discover' && !includePast ? 'upcoming' : 'all')).trim();
    const regStatus = String(req.query.regStatus || 'all').trim();
    const eventType = String(req.query.eventType || 'all').trim();

    if ((tab === 'following' || tab === 'saved') && !req.user) {
      return res.status(401).json({ message: 'Please sign in to view this feed' });
    }

    let followedClubIds = [];
    if (req.user) {
      const follows = await ClubFollow.find({ user: req.user._id }).select('club').lean();
      followedClubIds = follows.map(f => f.club);
    }

    const baseQuery = { status: 'published' };

    if (tab === 'following') {
      if (followedClubIds.length === 0) {
        return res.json({
          items: [],
          page,
          limit,
          total: 0,
          hasMore: false,
          followedClubsCount: 0
        });
      }
      baseQuery.club = { $in: followedClubIds };
    }

    let savedOrderMap = null;
    if (tab === 'saved') {
      const savedRows = await PostSave.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .select('post createdAt')
        .lean();
      if (savedRows.length === 0) {
        return res.json({
          items: [],
          page,
          limit,
          total: 0,
          hasMore: false,
          followedClubsCount: followedClubIds.length
        });
      }
      baseQuery._id = { $in: savedRows.map(s => s.post) };
      savedOrderMap = new Map(savedRows.map((s, idx) => [s.post.toString(), idx]));
    }

    if (clubId && mongoose.Types.ObjectId.isValid(clubId)) {
      if (tab === 'following') {
        const isAllowed = followedClubIds.some(id => id.toString() === clubId);
        if (!isAllowed) {
          return res.json({
            items: [],
            page,
            limit,
            total: 0,
            hasMore: false,
            followedClubsCount: followedClubIds.length
          });
        }
      }
      baseQuery.club = clubId;
    }

    const rawPosts = await FeedPost.find(baseQuery)
      .populate({
        path: 'event',
        populate: { path: 'organizer', select: 'name email department' }
      })
      .populate('club', 'name slug description logo department followersCount verified admins')
      .populate('author', 'name role department')
      .populate('relatedEvent', 'title date time location')
      .sort({ publishedAt: -1 });

    const hydrated = await hydrateFeedPosts(rawPosts, req.user);
    const now = new Date();
    const nowMs = now.getTime();

    let filtered = hydrated.filter(item => {
      // Remove orphan or unpublished event posts
      if (item.type === 'event') {
        if (!item.event || !PUBLISHED_EVENT_STATUSES.includes(item.event.status)) {
          return false;
        }
      }

      // Expired-event protection on Discover (unless Past Events opted in)
      if (
        tab === 'discover' &&
        !includePast &&
        dateFilter !== 'past' &&
        dateFilter !== 'all' &&
        item.type === 'event' &&
        item.isExpired
      ) {
        return false;
      }

      if (!matchesDateFilter(item, dateFilter, now)) {
        return false;
      }

      if (category && category !== 'All') {
        if ((item.category || '').toLowerCase() !== category.toLowerCase()) {
          return false;
        }
      }

      if (department) {
        const evDept = (item.event?.department || '').toLowerCase();
        const clubDept = (item.club?.department || '').toLowerCase();
        if (evDept !== department.toLowerCase() && clubDept !== department.toLowerCase()) {
          return false;
        }
      }

      if (eventType && eventType !== 'all') {
        if (eventType === 'event' && item.type !== 'event') return false;
        if (eventType === 'announcement' && item.type !== 'announcement') return false;
        if (['tech', 'non-tech', 'special', 'workshop'].includes(eventType)) {
          if (item.type !== 'event' || item.event?.type !== eventType) return false;
        }
      }

      if (regStatus && regStatus !== 'all') {
        if (item.type !== 'event') return false;
        if (regStatus === 'open' && !item.isRegistrationOpen) return false;
        if (regStatus === 'registered' && !item.isRegistered) return false;
        if (regStatus === 'full' && item.registrationState !== 'EVENT FULL') return false;
      }

      if (search) {
        const haystack = [
          item.title,
          item.content,
          item.club?.name,
          item.club?.department,
          item.category,
          ...(item.tags || []),
          item.event?.department,
          item.event?.location,
          item.author?.name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      return true;
    });

    if (tab === 'saved' && savedOrderMap) {
      filtered.sort(
        (a, b) => (savedOrderMap.get(a._id.toString()) ?? 9999) - (savedOrderMap.get(b._id.toString()) ?? 9999)
      );
    } else if (tab === 'following') {
      filtered.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    } else {
      filtered.sort((a, b) => {
        const sa = discoverRankScore(a, nowMs);
        const sb = discoverRankScore(b, nowMs);
        if (sb.expiredPenalty !== sa.expiredPenalty) return sb.expiredPenalty - sa.expiredPenalty;
        if (sb.tier !== sa.tier) return sb.tier - sa.tier;
        if (Math.abs(sb.composite - sa.composite) > 0.01) return sb.composite - sa.composite;
        return sb.publishedMs - sa.publishedMs;
      });
    }

    const total = filtered.length;
    const startIdx = (page - 1) * limit;
    const items = filtered.slice(startIdx, startIdx + limit);

    res.json({
      items,
      page,
      limit,
      total,
      hasMore: startIdx + items.length < total,
      followedClubsCount: followedClubIds.length
    });
  } catch (err) {
    console.error('Error fetching campus feed:', err);
    res.status(500).json({ message: 'Failed to load Campus Feed' });
  }
});

// GET /api/feed/highlights — right-rail upcoming open events & filter options
router.get('/highlights', optionalAuth, async (req, res) => {
  try {
    await ensureAllPublishedEventsSynced();

    const [eventPosts, clubs, deptList] = await Promise.all([
      FeedPost.find({ status: 'published', type: 'event' })
        .populate({ path: 'event', select: 'title date time location department type capacity attendees status photo registrationDeadline registrationOpen isPaid registrationFee currency paymentUpiId paymentInstructions' })
        .populate('club', 'name slug logo department followersCount verified admins')
        .sort({ publishedAt: -1 })
        .limit(40),
      Club.find().sort({ followersCount: -1, name: 1 }).limit(8).lean(),
      Event.distinct('department', { status: { $in: PUBLISHED_EVENT_STATUSES } })
    ]);

    const hydratedEvents = await hydrateFeedPosts(eventPosts, req.user);
    const openEvents = hydratedEvents
      .filter(p => p.event && !p.isExpired && p.isRegistrationOpen)
      .sort((a, b) => new Date(a.event.date) - new Date(b.event.date))
      .slice(0, 4);

    let followedSet = new Set();
    if (req.user) {
      const follows = await ClubFollow.find({ user: req.user._id }).select('club').lean();
      followedSet = new Set(follows.map(f => f.club.toString()));
    }

    res.json({
      upcomingEvents: openEvents,
      clubs: clubs.map(c => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        logo: c.logo,
        department: c.department,
        followersCount: c.followersCount || 0,
        verified: c.verified !== false,
        isFollowing: followedSet.has(c._id.toString())
      })),
      departments: deptList.filter(Boolean).sort()
    });
  } catch (err) {
    console.error('Error loading feed highlights:', err);
    res.status(500).json({ message: 'Failed to load feed highlights' });
  }
});

// GET /api/feed/event/:eventId — hydrated social & club metadata for EventDetails page
router.get('/event/:eventId', optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) {
      return res.status(400).json({ message: 'Invalid event ID' });
    }

    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (PUBLISHED_EVENT_STATUSES.includes(event.status)) {
      await syncEventToFeed(event, { notifyFollowers: false });
    }

    const post = await FeedPost.findOne({ event: event._id })
      .populate({
        path: 'event',
        populate: { path: 'organizer', select: 'name email department' }
      })
      .populate('club', 'name slug description logo department followersCount verified admins')
      .populate('author', 'name role department');

    if (!post) {
      return res.json({
        postId: null,
        likesCount: 0,
        savesCount: 0,
        commentsCount: 0,
        isLiked: false,
        isSaved: false,
        club: null
      });
    }

    const [hydrated] = await hydrateFeedPosts([post], req.user);
    res.json({
      postId: hydrated._id,
      likesCount: hydrated.likesCount,
      savesCount: hydrated.savesCount,
      commentsCount: hydrated.commentsCount,
      isLiked: hydrated.isLiked,
      isSaved: hydrated.isSaved,
      isRegistered: hydrated.isRegistered,
      isPaidRegistration: hydrated.event?.isPaidRegistration ?? true,
      registrationState: hydrated.registrationState,
      club: hydrated.club,
      availableSeats: hydrated.event?.availableSeats ?? 0
    });
  } catch (err) {
    console.error('Error fetching event feed metadata:', err);
    res.status(500).json({ message: 'Failed to load event social metadata' });
  }
});

// POST /api/feed/announcements — create announcement post (organizers & admins only)
router.post(
  '/announcements',
  auth,
  authorize('organizer', 'admin'),
  upload.single('media'),
  [
    body('title').trim().isLength({ min: 2, max: 200 }).withMessage('Title must be 2–200 characters'),
    body('content').trim().isLength({ min: 2, max: 4000 }).withMessage('Announcement content is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }

    try {
      const title = sanitizePlainText(req.body.title, 200);
      const content = sanitizePlainText(req.body.content, 4000);
      if (!title || !content) {
        return res.status(400).json({ message: 'Title and content cannot be empty' });
      }

      let club = null;
      if (req.body.clubId && mongoose.Types.ObjectId.isValid(req.body.clubId)) {
        club = await Club.findById(req.body.clubId);
        if (!club) return res.status(404).json({ message: 'Club not found' });
        const uid = req.user._id.toString();
        const isAllowed = req.user.role === 'admin' || club.admins.some(a => a.toString() === uid);
        if (!isAllowed) {
          return res.status(403).json({ message: 'Not authorized to post announcements for this club' });
        }
      } else {
        club = await resolveClubForOrganizer(req.user._id, req.user.department);
      }

      let relatedEventId = null;
      if (req.body.relatedEventId && mongoose.Types.ObjectId.isValid(req.body.relatedEventId)) {
        const relEv = await Event.findById(req.body.relatedEventId).select('_id');
        if (relEv) relatedEventId = relEv._id;
      }

      const category = FeedPost.FEED_CATEGORIES.includes(req.body.category)
        ? req.body.category
        : 'Technical';

      const post = await FeedPost.create({
        type: 'announcement',
        club: club ? club._id : null,
        author: req.user._id,
        title,
        content,
        category,
        tags: sanitizeTags(req.body.tags),
        mediaUrl: req.file ? fileToDataUri(req.file) : sanitizeMediaUrl(req.body.mediaUrl) || '',
        relatedEvent: relatedEventId,
        status: 'published',
        publishedAt: new Date()
      });

      const populated = await FeedPost.findById(post._id)
        .populate('club', 'name slug description logo department followersCount verified admins')
        .populate('author', 'name role department')
        .populate('relatedEvent', 'title date time location');

      if (club) {
        await notifyFollowersOfClub({
          club,
          title: `${club.name}: ${title}`,
          message: content.slice(0, 180),
          type: 'club_announcement',
          relatedEvent: relatedEventId,
          excludeUserId: req.user._id
        });
      }

      const [hydrated] = await hydrateFeedPosts([populated], req.user);
      res.status(201).json(hydrated);
    } catch (err) {
      console.error('Error creating announcement:', err);
      res.status(500).json({ message: 'Failed to create announcement' });
    }
  }
);

// DELETE /api/feed/posts/:postId — delete an announcement post (author, club admin, or admin)
router.delete('/posts/:postId', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }

    const post = await FeedPost.findById(req.params.postId).populate('club', 'admins');
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (post.type === 'event') {
      return res.status(400).json({
        message: 'Event feed entries are synced from Events. Delete or cancel the event instead.'
      });
    }

    const uid = req.user._id.toString();
    const isAllowed =
      req.user.role === 'admin' ||
      post.author.toString() === uid ||
      (post.club?.admins || []).some(a => a.toString() === uid);

    if (!isAllowed) {
      return res.status(403).json({ message: 'Not authorized to delete this announcement' });
    }

    await Promise.all([
      PostLike.deleteMany({ post: post._id }),
      PostSave.deleteMany({ post: post._id }),
      Comment.deleteMany({ post: post._id }),
      post.deleteOne()
    ]);

    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    console.error('Error deleting announcement:', err);
    res.status(500).json({ message: 'Failed to delete announcement' });
  }
});

// POST /api/feed/posts/:postId/like — idempotent single like per user
router.post('/posts/:postId/like', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }
    const post = await FeedPost.findById(req.params.postId).select('_id status');
    if (!post || post.status !== 'published') {
      return res.status(404).json({ message: 'Post not found' });
    }

    try {
      await PostLike.updateOne(
        { user: req.user._id, post: post._id },
        { $setOnInsert: { user: req.user._id, post: post._id } },
        { upsert: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
    }

    const likesCount = await PostLike.countDocuments({ post: post._id });
    await FeedPost.updateOne({ _id: post._id }, { $set: { likesCount } });

    res.json({ liked: true, likesCount });
  } catch (err) {
    console.error('Error liking post:', err);
    res.status(500).json({ message: 'Failed to like post' });
  }
});

// DELETE /api/feed/posts/:postId/like — unlike
router.delete('/posts/:postId/like', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }
    const post = await FeedPost.findById(req.params.postId).select('_id');
    if (!post) return res.status(404).json({ message: 'Post not found' });

    await PostLike.deleteOne({ user: req.user._id, post: post._id });
    const likesCount = await PostLike.countDocuments({ post: post._id });
    await FeedPost.updateOne({ _id: post._id }, { $set: { likesCount } });

    res.json({ liked: false, likesCount });
  } catch (err) {
    console.error('Error unliking post:', err);
    res.status(500).json({ message: 'Failed to unlike post' });
  }
});

// POST /api/feed/posts/:postId/save — idempotent bookmark
router.post('/posts/:postId/save', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }
    const post = await FeedPost.findById(req.params.postId).select('_id status');
    if (!post || post.status !== 'published') {
      return res.status(404).json({ message: 'Post not found' });
    }

    try {
      await PostSave.updateOne(
        { user: req.user._id, post: post._id },
        { $setOnInsert: { user: req.user._id, post: post._id } },
        { upsert: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
    }

    const savesCount = await PostSave.countDocuments({ post: post._id });
    await FeedPost.updateOne({ _id: post._id }, { $set: { savesCount } });

    res.json({ saved: true, savesCount });
  } catch (err) {
    console.error('Error saving post:', err);
    res.status(500).json({ message: 'Failed to save post' });
  }
});

// DELETE /api/feed/posts/:postId/save — remove bookmark
router.delete('/posts/:postId/save', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }
    const post = await FeedPost.findById(req.params.postId).select('_id');
    if (!post) return res.status(404).json({ message: 'Post not found' });

    await PostSave.deleteOne({ user: req.user._id, post: post._id });
    const savesCount = await PostSave.countDocuments({ post: post._id });
    await FeedPost.updateOne({ _id: post._id }, { $set: { savesCount } });

    res.json({ saved: false, savesCount });
  } catch (err) {
    console.error('Error unsaving post:', err);
    res.status(500).json({ message: 'Failed to remove saved post' });
  }
});

function formatComment(comment, post, currentUser) {
  const uid = currentUser?._id?.toString() || null;
  const authorId = comment.user?._id ? comment.user._id.toString() : comment.user?.toString();
  const postAuthorId = post?.author?._id ? post.author._id.toString() : post?.author?.toString();
  const eventOrganizerId = post?.event?.organizer?._id
    ? post.event.organizer._id.toString()
    : post?.event?.organizer?.toString();
  const clubAdminIds = (post?.club?.admins || []).map(a => a.toString());

  const isCommentAuthorOrganizer =
    comment.user?.role === 'admin' ||
    comment.user?.role === 'organizer' ||
    authorId === postAuthorId ||
    authorId === eventOrganizerId ||
    clubAdminIds.includes(authorId);

  const canDelete =
    Boolean(uid) &&
    (authorId === uid ||
      currentUser.role === 'admin' ||
      postAuthorId === uid ||
      eventOrganizerId === uid ||
      clubAdminIds.includes(uid));

  return {
    _id: comment._id,
    post: comment.post,
    content: comment.content,
    createdAt: comment.createdAt,
    user: comment.user
      ? {
          _id: comment.user._id,
          name: comment.user.name,
          role: comment.user.role,
          department: comment.user.department
        }
      : { name: 'Student', role: 'student' },
    isOrganizerBadge: isCommentAuthorOrganizer,
    canDelete
  };
}

// GET /api/feed/posts/:postId/comments — lazy paginated comments
router.get('/posts/:postId/comments', optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }
    const post = await FeedPost.findById(req.params.postId)
      .populate('event', 'organizer')
      .populate('club', 'admins');
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const [total, rows] = await Promise.all([
      Comment.countDocuments({ post: post._id }),
      Comment.find({ post: post._id })
        .populate('user', 'name role department')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      comments: rows.map(c => formatComment(c, post, req.user)),
      page,
      limit,
      total,
      hasMore: skip + rows.length < total
    });
  } catch (err) {
    console.error('Error loading comments:', err);
    res.status(500).json({ message: 'Failed to load comments' });
  }
});

// POST /api/feed/posts/:postId/comments — create sanitized comment
router.post('/posts/:postId/comments', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }

    const content = sanitizePlainText(req.body.content, 1000);
    if (!content) {
      return res.status(400).json({ message: 'Comment cannot be empty' });
    }

    const post = await FeedPost.findById(req.params.postId)
      .populate('event', 'organizer')
      .populate('club', 'admins');
    if (!post || post.status !== 'published') {
      return res.status(404).json({ message: 'Post not found' });
    }

    const created = await Comment.create({
      post: post._id,
      event: post.event?._id || post.relatedEvent || null,
      user: req.user._id,
      content
    });

    await created.populate('user', 'name role department');

    const commentsCount = await Comment.countDocuments({ post: post._id });
    await FeedPost.updateOne({ _id: post._id }, { $set: { commentsCount } });

    res.status(201).json({
      comment: formatComment(created, post, req.user),
      commentsCount
    });
  } catch (err) {
    console.error('Error creating comment:', err);
    res.status(500).json({ message: 'Failed to post comment' });
  }
});

// DELETE /api/feed/comments/:commentId — delete own comment or moderate
router.delete('/comments/:commentId', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.commentId)) {
      return res.status(400).json({ message: 'Invalid comment ID' });
    }

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const post = await FeedPost.findById(comment.post)
      .populate('event', 'organizer')
      .populate('club', 'admins');

    const uid = req.user._id.toString();
    const isCommentOwner = comment.user.toString() === uid;
    const isAdmin = req.user.role === 'admin';
    const isPostOrEventOrganizer =
      post &&
      (post.author?.toString() === uid ||
        post.event?.organizer?.toString() === uid ||
        (post.club?.admins || []).some(a => a.toString() === uid));

    if (!isCommentOwner && !isAdmin && !isPostOrEventOrganizer) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    await comment.deleteOne();

    let commentsCount = 0;
    if (post) {
      commentsCount = await Comment.countDocuments({ post: post._id });
      await FeedPost.updateOne({ _id: post._id }, { $set: { commentsCount } });
    }

    res.json({ message: 'Comment deleted', commentsCount });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ message: 'Failed to delete comment' });
  }
});

module.exports = router;

