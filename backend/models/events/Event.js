const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    title: { type: String, required: true, trim: true }, description: { type: String, required: true },
    date: { type: Date, required: true }, time: { type: String, required: true }, location: { type: String, required: true },
    department: { type: String, required: true },
    type: { type: String, enum: ['tech', 'non-tech', 'special', 'workshop'], required: true },
    capacity: { type: Number, required: true, min: 1 },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    motivationContent: {
        quotes: [{ text: String, author: String, generatedAt: Date }],
        tips: [{ text: String, generatedAt: Date }], lastUpdated: Date
    },
    noveltyFeatures: {
        highlights: [String], perks: [String], agenda: [String],
        certificateEnabled: { type: Boolean, default: true }
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'upcoming', 'ongoing', 'completed', 'cancelled'], default: 'approved' },
    photo: { type: String, default: '' },
    club: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', default: null },
    category: { type: String, default: '', trim: true },
    tags: [{ type: String, trim: true }],
    eligibility: { type: String, default: 'Open to all enrolled students', trim: true },
    registrationDeadline: { type: Date, default: null },
    registrationOpen: { type: Boolean, default: true },
    isPaid: { type: Boolean, default: false },
    registrationFee: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR', trim: true },
    paymentUpiId: { type: String, default: '', trim: true },
    paymentInstructions: { type: String, default: '', trim: true },
    whatsappGroupLink: { type: String, default: '', trim: true },
    autoDeleteWhenExpired: {
        type: String,
        enum: ['inherit', 'always', 'never'],
        default: 'inherit'
    }
}, { timestamps: true });
schema.virtual('isFull').get(function () { return this.attendees.length >= this.capacity; });
schema.methods.addAttendee = async function (userId) {
    if (this.isFull) throw new Error('Event is full');
    if (this.attendees.some(id => id.toString() === userId.toString())) throw new Error('User is already registered for this event');
    this.attendees.push(userId); return this.save();
};
schema.methods.removeAttendee = async function (userId) {
    this.attendees = this.attendees.filter(id => id.toString() !== userId.toString()); return this.save();
};
module.exports = mongoose.model('Event', schema);
