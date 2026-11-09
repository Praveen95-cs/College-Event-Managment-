const mongoose = require('mongoose');

const clubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    logo: { type: String, default: '' },
    department: { type: String, default: '', trim: true },
    tags: [{ type: String, trim: true }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    followersCount: { type: Number, default: 0, min: 0 },
    verified: { type: Boolean, default: true }
  },
  { timestamps: true }
);

clubSchema.index({ name: 1 });
clubSchema.index({ admins: 1 });
clubSchema.index({ department: 1 });

module.exports = mongoose.model('Club', clubSchema);

