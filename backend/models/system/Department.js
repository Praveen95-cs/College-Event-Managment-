const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    normalizedName: { type: String, required: true, unique: true, lowercase: true, trim: true },
    code: { type: String, default: '', trim: true, uppercase: true, maxlength: 20 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

departmentSchema.pre('validate', function (next) {
  if (this.name) {
    this.name = String(this.name).trim().replace(/\s+/g, ' ');
    this.normalizedName = this.name.toLowerCase();
  }
  next();
});

module.exports = mongoose.model('Department', departmentSchema);

