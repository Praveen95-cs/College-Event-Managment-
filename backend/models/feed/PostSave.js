const mongoose = require('mongoose');

const postSaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedPost', required: true }
  },
  { timestamps: true }
);

postSaveSchema.index({ user: 1, post: 1 }, { unique: true });
postSaveSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PostSave', postSaveSchema);

