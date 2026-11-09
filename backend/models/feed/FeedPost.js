const mongoose = require('mongoose');

const FEED_CATEGORIES = [
  'Technical',
  'Hackathon',
  'Workshop',
  'Seminar',
  'Cultural',
  'Sports',
  'Competition',
  'General'
];

const feedPostSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['event', 'announcement'],
      required: true,
      default: 'event'
    },
    // For type === 'event', links cleanly to Event without duplicating event fields.
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: undefined
    },
    club: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Club',
      default: null
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Fields below are primarily for 'announcement' posts (or searchable metadata)
    title: { type: String, default: '', trim: true, maxlength: 200 },
    content: { type: String, default: '', trim: true, maxlength: 4000 },
    category: {
      type: String,
      enum: FEED_CATEGORIES,
      default: 'Technical'
    },
    tags: [{ type: String, trim: true }],
    mediaUrl: { type: String, default: '' },
    relatedEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      default: null
    },
    likesCount: { type: Number, default: 0, min: 0 },
    savesCount: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['published', 'hidden'],
      default: 'published'
    },
    publishedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Enforce at most 1 FeedPost per Event document
feedPostSchema.index(
  { event: 1 },
  {
    unique: true,
    partialFilterExpression: { event: { $type: 'objectId' } }
  }
);
feedPostSchema.index({ status: 1, publishedAt: -1 });
feedPostSchema.index({ club: 1, status: 1, publishedAt: -1 });
feedPostSchema.index({ category: 1, status: 1 });

const FeedPost = mongoose.model('FeedPost', feedPostSchema);
FeedPost.FEED_CATEGORIES = FEED_CATEGORIES;

module.exports = FeedPost;

