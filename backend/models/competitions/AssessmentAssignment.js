const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  selectedOption: { type: Number, default: -1 }, // -1 = unselected
  markedForReview: { type: Boolean, default: false },
  savedAt: { type: Date, default: Date.now },
  isCorrect: { type: Boolean, default: null },
  scoreAwarded: { type: Number, default: 0 }
}, { _id: false });

const codingSubmissionSchema = new mongoose.Schema({
  problemId: { type: String, required: true },
  language: { type: String, required: true },
  code: { type: String, required: true },
  passedTestCases: { type: Number, default: 0 },
  totalTestCases: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  status: { type: String, default: 'Submitted' },
  error: { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now }
}, { _id: false });

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  details: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const assessmentAssignmentSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Fixed list of assigned question IDs for this participant to ensure stable variants across page refreshes
  assignedQuestionIds: [{ type: String }],

  startTime: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  submitTime: { type: Date, default: null },

  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'timed_out'],
    default: 'in_progress'
  },

  // MCQ answers
  answers: [answerSchema],

  // Coding submissions
  codingSubmissions: [codingSubmissionSchema],

  // Final evaluation metrics
  score: { type: Number, default: 0 },
  totalPossibleScore: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  timeTakenSeconds: { type: Number, default: 0 },
  rank: { type: Number, default: null },

  auditLog: [auditLogSchema]
}, { timestamps: true });

// Ensure one assignment per participant per competition
assessmentAssignmentSchema.index({ competition: 1, user: 1 }, { unique: true });
assessmentAssignmentSchema.index({ competition: 1, score: -1, timeTakenSeconds: 1 });

module.exports = mongoose.model('AssessmentAssignment', assessmentAssignmentSchema);
