const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    default: function() {
      return this.problemId || `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
  },
  problemId: { type: String },
  type: { type: String, enum: ['mcq', 'coding'], default: 'mcq' },

  // MCQ specific fields
  question: { type: String },
  options: [{ type: String }],
  correctOption: { type: Number }, // 0-3 (kept secret on server)
  explanation: { type: String },

  // Coding specific fields
  title: { type: String },
  description: { type: String },
  inputFormat: { type: String },
  outputFormat: { type: String },
  constraints: { type: String },
  starterCode: {
    cpp: { type: String },
    python: { type: String },
    java: { type: String },
    javascript: { type: String }
  },
  sampleTestCases: [{
    input: { type: String },
    output: { type: String },
    explanation: { type: String }
  }],
  hiddenTestCases: [{
    input: { type: String },
    output: { type: String }
  }], // kept secret on server

  // Common metadata
  topic: { type: String, default: 'General' },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  marks: { type: Number, default: 1 }
}, { _id: false });

const competitionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  type: {
    type: String,
    enum: ['quiz', 'coding', 'hybrid'],
    required: true,
    default: 'quiz'
  },

  prompt: { type: String, default: '' },
  topics: [{ type: String }],
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'mixed'],
    default: 'medium'
  },

  durationMinutes: { type: Number, required: true, min: 1, default: 30 },
  totalMarks: { type: Number, default: 1 },
  negativeMarking: { type: Number, default: 0, min: 0 }, // Deduction per wrong answer (e.g. 0.25)

  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  participantLimit: { type: Number, default: 0 }, // 0 = unlimited

  permittedLanguages: {
    type: [String],
    default: ['cpp', 'python', 'java', 'javascript']
  },

  status: {
    type: String,
    enum: ['draft', 'published', 'active', 'completed', 'archived'],
    default: 'draft'
  },

  // Number of questions/problems selected for each participant from questionPool
  questionsPerParticipant: { type: Number, default: 5 },

  // Full pool of approved questions
  questionPool: [questionSchema],

  settings: {
    shuffleOptions: { type: Boolean, default: true },
    randomizeQuestionOrder: { type: Boolean, default: true },
    allowReview: { type: Boolean, default: true },
    showLeaderboard: { type: Boolean, default: true }
  }
}, { timestamps: true });

// Virtual to determine if competition is currently active
competitionSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.status === 'published' && now >= this.startTime && now <= this.endTime;
});

// Helper method to sanitize question pool for participants (never expose answers or hidden tests)
// Preserves the exact randomized assigned order of questionIds for each individual participant
competitionSchema.methods.getSanitizedQuestions = function(questionIds = null) {
  let pool = [];
  if (Array.isArray(questionIds) && questionIds.length > 0) {
    const qMap = new Map();
    (this.questionPool || []).forEach(q => {
      qMap.set(String(q.questionId || q.problemId), q);
    });
    // Preserve the exact randomized sequence assigned to this participant
    pool = questionIds.map(id => qMap.get(String(id))).filter(Boolean);
  } else {
    pool = this.questionPool || [];
  }

  return pool.map(q => {
    if (q.type === 'coding') {
      return {
        problemId: q.problemId || q.questionId,
        type: 'coding',
        title: q.title,
        description: q.description,
        inputFormat: q.inputFormat,
        outputFormat: q.outputFormat,
        constraints: q.constraints,
        difficulty: q.difficulty,
        marks: q.marks,
        starterCode: q.starterCode,
        sampleTestCases: q.sampleTestCases || []
        // Note: hiddenTestCases is deliberately omitted
      };
    }

    return {
      questionId: q.questionId,
      type: 'mcq',
      question: q.question,
      options: q.options,
      topic: q.topic,
      difficulty: q.difficulty,
      marks: q.marks
      // Note: correctOption and explanation are deliberately omitted
    };
  });
};

module.exports = mongoose.model('Competition', competitionSchema);
