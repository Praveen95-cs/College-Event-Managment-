const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { auth, optionalAuth, authorize } = require('../../middleware/auth');
const Club = require('../../models/feed/Club');
const ClubFollow = require('../../models/feed/ClubFollow');
const FeedPost = require('../../models/feed/FeedPost');
const Event = require('../../models/events/Event');
const {
  sanitizePlainText,
  sanitizeTags,
  escapeRegex,
  ALLOWED_IMAGE_MIME_TYPES,
  fileToDataUri,
  sanitizeMediaUrl
} = require('../../utils/sanitize');
const {
  PUBLISHED_EVENT_STATUSES,
  createUniqueSlug,
  ensureAllPublishedEventsSynced,
  hydrateFeedPosts
} = require('../../services/feed/feedService');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    ALLOWED_IMAGE_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())
      ? cb(null, true)
      : cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'))
});

async function findClubByParam(clubId) {
  if (mongoose.Types.ObjectId.isValid(clubId)) {
    const byId = await Club.findById(clubId);
    if (byId) return byId;
  }
  return Club.findOne({ slug: String(clubId || '').toLowerCase() });
}

// List clubs (supports optional search, department, followedOnly, mine)
router.get('/', optionalAuth, async (req, res) => {
  try {
    await ensureAllPublishedEventsSynced();

    const filter = {};
    if (req.query.department) {
      filter.department = req.query.department;
    }
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
      filter.$or = [{ name: rx }, { description: rx }, { department: rx }, { tags: rx }];
    }
    if (req.query.mine === 'true' && req.user) {
      filter.admins = req.user._id;
    }

    let clubs = await Club.find(filter).sort({ followersCount: -1, name: 1 }).lean();

    let followedSet = new Set();
    if (req.user) {
      const follows = await ClubFollow.find({ user: req.user._id }).select('club').lean();
      followedSet = new Set(follows.map(f => f.club.toString()));
      if (req.query.followedOnly === 'true') {
        clubs = clubs.filter(c => followedSet.has(c._id.toString()));
      }
    } else if (req.query.followedOnly === 'true') {
      return res.json([]);
    }

    const clubIds = clubs.map(c => c._id);
    const upcomingCounts = clubIds.length
      ? await Event.aggregate([
          {
            $match: {
              club: { $in: clubIds },
              status: { $in: ['approved', 'upcoming', 'ongoing'] },
              date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }
          },
          { $group: { _id: '$club', count: { $sum: 1 } } }
        ])
      : [];
    const upcomingMap = new Map(upcomingCounts.map(x => [x._id.toString(), x.count]));

    const uid = req.user?._id?.toString() || null;
    res.json(
      clubs.map(c => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        logo: c.logo,
        department: c.department,
        tags: c.tags || [],
        followersCount: c.followersCount || 0,
        verified: c.verified !== false,
        upcomingEventsCount: upcomingMap.get(c._id.toString()) || 0,
        isFollowing: followedSet.has(c._id.toString()),
        canManage:
          Boolean(uid) &&
          (req.user.role === 'admin' || (c.admins || []).some(a => a.toString() === uid))
      }))
    );
  } catch (err) {
    console.error('Error fetching clubs:', err);
    res.status(500).json({ message: 'Failed to load clubs' });
  }
});

// Create a club (organizers & admins only)
router.post(
  '/',
  auth,
  authorize('organizer', 'admin'),
  upload.single('logo'),
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Club name must be 2–100 characters'),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('department').optional().trim().isLength({ max: 100 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
    }
    try {
      const name = sanitizePlainText(req.body.name, 100);
      if (!name) return res.status(400).json({ message: 'Club name is required' });

      const existingName = await Club.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
      if (existingName) {
        return res.status(409).json({ message: 'A club with this name already exists' });
      }

      const slug = await createUniqueSlug(name);
      const logo = req.file ? fileToDataUri(req.file) : sanitizeMediaUrl(req.body.logoUrl);
      const club = await Club.create({
        name,
        slug,
        description: sanitizePlainText(req.body.description, 1000),
        department: sanitizePlainText(req.body.department, 100) || req.user.department || 'General',
        tags: sanitizeTags(req.body.tags),
        logo: logo || '',
        admins: [req.user._id],
        createdBy: req.user._id,
        followersCount: 0,
        verified: true
      });

      res.status(201).json({
        ...club.toObject(),
        isFollowing: false,
        canManage: true
      });
    } catch (err) {
      console.error('Error creating club:', err);
      res.status(500).json({ message: 'Failed to create club' });
    }
  }
);

// Get full club profile with upcomingEvents, pastEvents, and announcements
router.get('/:clubId', optionalAuth, async (req, res) => {
  try {
    await ensureAllPublishedEventsSynced();
    const club = await findClubByParam(req.params.clubId);
    if (!club) return res.status(404).json({ message: 'Club not found' });

    const [followersCount, followDoc, rawPosts] = await Promise.all([
      ClubFollow.countDocuments({ club: club._id }),
      req.user ? ClubFollow.findOne({ user: req.user._id, club: club._id }).lean() : Promise.resolve(null),
      FeedPost.find({ club: club._id, status: 'published' })
        .populate({
          path: 'event',
          populate: { path: 'organizer', select: 'name email department' }
        })
        .populate('club', 'name slug description logo department followersCount verified admins')
        .populate('author', 'name role department')
        .populate('relatedEvent', 'title date time location')
        .sort({ publishedAt: -1 })
    ]);

    if (club.followersCount !== followersCount) {
      await Club.updateOne({ _id: club._id }, { $set: { followersCount } });
    }

    const hydrated = await hydrateFeedPosts(rawPosts, req.user);
    const validPosts = hydrated.filter(item => {
      if (item.type === 'event') {
        return item.event && PUBLISHED_EVENT_STATUSES.includes(item.event.status);
      }
      return true;
    });

    const upcomingEvents = validPosts
      .filter(p => p.type === 'event' && !p.isExpired)
      .sort((a, b) => new Date(a.event.date) - new Date(b.event.date));

    const pastEvents = validPosts
      .filter(p => p.type === 'event' && p.isExpired)
      .sort((a, b) => new Date(b.event.date) - new Date(a.event.date));

    const announcements = validPosts
      .filter(p => p.type === 'announcement')
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    const uid = req.user?._id?.toString() || null;

    res.json({
      club: {
        _id: club._id,
        name: club.name,
        slug: club.slug,
        description: club.description,
        logo: club.logo,
        department: club.department,
        tags: club.tags || [],
        followersCount,
        verified: club.verified !== false,
        isFollowing: Boolean(followDoc),
        canManage:
          Boolean(uid) &&
          (req.user.role === 'admin' || (club.admins || []).some(a => a.toString() === uid))
      },
      upcomingEvents,
      pastEvents,
      announcements
    });
  } catch (err) {
    console.error('Error loading club profile:', err);
    res.status(500).json({ message: 'Failed to load club profile' });
  }
});

// Update club details
router.patch('/:clubId', auth, authorize('organizer', 'admin'), upload.single('logo'), async (req, res) => {
  try {
    const club = await findClubByParam(req.params.clubId);
    if (!club) return res.status(404).json({ message: 'Club not found' });

    const uid = req.user._id.toString();
    const isAdminOrOwner = req.user.role === 'admin' || club.admins.some(a => a.toString() === uid);
    if (!isAdminOrOwner) {
      return res.status(403).json({ message: 'Not authorized to edit this club' });
    }

    if (req.body.name !== undefined) {
      const cleanName = sanitizePlainText(req.body.name, 100);
      if (!cleanName) return res.status(400).json({ message: 'Club name cannot be empty' });
      club.name = cleanName;
    }
    if (req.body.description !== undefined) {
      club.description = sanitizePlainText(req.body.description, 1000);
    }
    if (req.body.department !== undefined) {
      club.department = sanitizePlainText(req.body.department, 100);
    }
    if (req.body.tags !== undefined) {
      club.tags = sanitizeTags(req.body.tags);
    }

    if (req.file) {
      club.logo = fileToDataUri(req.file);
    } else if (req.body.removeLogo === 'true' || req.body.removeLogo === true) {
      club.logo = '';
    } else if (req.body.logoUrl !== undefined && String(req.body.logoUrl).trim() !== '') {
      const sanitizedUrl = sanitizeMediaUrl(req.body.logoUrl);
      if (!sanitizedUrl) {
        return res.status(400).json({ message: 'Please provide a valid HTTP(S) or image data URL for the club logo.' });
      }
      club.logo = sanitizedUrl;
    }

    await club.save();
    const isFollowing = Boolean(await ClubFollow.exists({ user: req.user._id, club: club._id }));
    res.json({
      ...club.toObject(),
      isFollowing,
      canManage: true
    });
  } catch (err) {
    console.error('Error updating club:', err);
    res.status(500).json({ message: 'Failed to update club' });
  }
});

// Follow a club (idempotent, duplicate-safe)
router.post('/:clubId/follow', auth, async (req, res) => {
  try {
    const club = await findClubByParam(req.params.clubId);
    if (!club) return res.status(404).json({ message: 'Club not found' });

    try {
      await ClubFollow.updateOne(
        { user: req.user._id, club: club._id },
        { $setOnInsert: { user: req.user._id, club: club._id } },
        { upsert: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
    }

    const followersCount = await ClubFollow.countDocuments({ club: club._id });
    await Club.updateOne({ _id: club._id }, { $set: { followersCount } });

    res.json({ following: true, followersCount });
  } catch (err) {
    console.error('Error following club:', err);
    res.status(500).json({ message: 'Failed to follow club' });
  }
});

// Unfollow a club
router.delete('/:clubId/follow', auth, async (req, res) => {
  try {
    const club = await findClubByParam(req.params.clubId);
    if (!club) return res.status(404).json({ message: 'Club not found' });

    await ClubFollow.deleteOne({ user: req.user._id, club: club._id });
    const followersCount = await ClubFollow.countDocuments({ club: club._id });
    await Club.updateOne({ _id: club._id }, { $set: { followersCount } });

    res.json({ following: false, followersCount });
  } catch (err) {
    console.error('Error unfollowing club:', err);
    res.status(500).json({ message: 'Failed to unfollow club' });
  }
});

module.exports = router;

