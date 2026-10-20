const mongoose = require('mongoose');

const questionCacheSchema = new mongoose.Schema({
  cacheKey: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['mcq', 'coding'],
    required: true,
    index: true
  },
  topic: {
    type: String,
    required: true,
    index: true,
    trim: true,
    lowercase: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true,
    index: true
  },
  title: {
    type: String,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  source: {
    type: String,
    default: 'ai'
  },
  usageCount: {
    type: Number,
    default: 1
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

questionCacheSchema.index({ type: 1, topic: 1, difficulty: 1 });
questionCacheSchema.index({ type: 1, difficulty: 1 });

/**
 * Finds valid cached questions matching criteria.
 */
questionCacheSchema.statics.findMatching = async function({ type, topics = [], difficulty = 'medium', limit = 5 }) {
  const query = { type };
  if (difficulty && difficulty !== 'mixed') {
    query.difficulty = difficulty.toLowerCase();
  }

  // If specific topics provided, try topic match first
  if (Array.isArray(topics) && topics.length > 0) {
    const topicRegexes = topics.map(t => new RegExp(t.trim(), 'i'));
    const topicQuery = { ...query, topic: { $in: topicRegexes } };
    const topicMatches = await this.find(topicQuery).sort({ usageCount: -1, lastUsedAt: -1 }).limit(limit);
    if (topicMatches.length >= limit) {
      return topicMatches;
    }

    // Fallback: broaden to difficulty match
    const remaining = limit - topicMatches.length;
    const existingIds = topicMatches.map(m => m._id);
    const broadMatches = await this.find({
      ...query,
      _id: { $nin: existingIds }
    }).sort({ usageCount: -1, lastUsedAt: -1 }).limit(remaining);

    return [...topicMatches, ...broadMatches];
  }

  return this.find(query).sort({ usageCount: -1, lastUsedAt: -1 }).limit(limit);
};

/**
 * Saves or updates a question in cache.
 */
questionCacheSchema.statics.cacheItem = async function({ type, topic, difficulty, title, data, source = 'ai' }) {
  const normTopic = String(topic || 'general').trim().toLowerCase();
  const normDiff = ['easy', 'medium', 'hard'].includes(String(difficulty).toLowerCase())
    ? String(difficulty).toLowerCase()
    : 'medium';

  // Construct stable fingerprint from content
  const contentSnippet = type === 'coding'
    ? `${String(title || data.title).toLowerCase().trim()}_${String(data.description || '').slice(0, 50)}`
    : `${String(data.question || '').toLowerCase().trim().slice(0, 80)}`;

  const cacheKey = `${type}:${normTopic}:${normDiff}:${Buffer.from(contentSnippet).toString('base64').slice(0, 32)}`;

  return this.findOneAndUpdate(
    { cacheKey },
    {
      $set: {
        type,
        topic: normTopic,
        difficulty: normDiff,
        title: title || data.title || (data.question ? data.question.slice(0, 60) : 'Question'),
        data,
        source,
        lastUsedAt: new Date()
      },
      $inc: { usageCount: 1 }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('QuestionCache', questionCacheSchema);
