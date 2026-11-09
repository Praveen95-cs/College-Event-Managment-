const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedPost', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 }
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);

