const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['tech', 'non-tech', 'special', 'workshop', 'tech_events', 'non_tech_events', 'fun_tech_events', 'special_events', 'workshops'],
    required: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attendees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  motivationContent: {
    quotes: [{
      text: String,
      author: String,
      generatedAt: Date
    }],
    tips: [{
      text: String,
      generatedAt: Date
    }],
    lastUpdated: Date
  },
  noveltyFeatures: {
    highlights: [{
      type: String,
      trim: true
    }],
    perks: [{
      type: String,
      trim: true
    }],
    agenda: [{
      type: String,
      trim: true
    }],
    certificateEnabled: {
      type: Boolean,
      default: true
    }
  },
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  photo: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual for checking if event is full
eventSchema.virtual('isFull').get(function() {
  return this.attendees.length >= this.capacity;
});

// Method to add attendee
eventSchema.methods.addAttendee = async function(userId) {
  if (this.isFull) {
    throw new Error('Event is full');
  }
  if (this.attendees.includes(userId)) {
    throw new Error('User is already registered for this event');
  }
  this.attendees.push(userId);
  return this.save();
};

// Method to remove attendee
eventSchema.methods.removeAttendee = async function(userId) {
  this.attendees = this.attendees.filter(id => id.toString() !== userId.toString());
  return this.save();
};

// Pre-save middleware to convert old event types to new ones
eventSchema.pre('save', function(next) {
  const typeMapping = {
    'tech_events': 'tech',
    'non_tech_events': 'non-tech',
    'fun_tech_events': 'tech',
    'special_events': 'special',
    'workshops': 'workshop'
  };

  if (typeMapping[this.type]) {
    this.type = typeMapping[this.type];
  }
  next();
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event; 