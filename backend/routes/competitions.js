const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const ExcelJS = require('exceljs');
const { auth, optionalAuth, authorize } = require('../middleware/auth');
const Competition = require('../models/Competition');
const AssessmentAssignment = require('../models/AssessmentAssignment');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const geminiService = require('../services/geminiService');
const codeExecutionService = require('../services/codeExecutionService');
const { generateCompetitionCertificateStream } = require('../services/certificateService');

/**
 * Health and status check for Gemini integration
 */
router.get('/gemini-status', auth, async (req, res) => {
  try {
    const verifiedModel = await geminiService.getVerifiedModel();
    res.json({
      ok: true,
      provider: 'Google Gemini API',
      tier: 'Free Tier',
      verifiedModel,
      isConfigured: !!process.env.GEMINI_API_KEY
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

/**
 * List published/upcoming competitions
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.user?.role === 'student' || !req.user) {
      filter.status = { $in: ['published', 'active', 'completed'] };
    }
    if (req.query.type) {
      filter.type = req.query.type;
    }
    if (req.query.eventId) {
      filter.event = req.query.eventId;
    }

    const competitions = await Competition.find(filter)
      .populate('organizer', 'name email department')
      .populate('event', 'title date location department')
      .sort({ startTime: 1 });

    let userAssignments = {};
    if (req.user) {
      const assignments = await AssessmentAssignment.find({
        user: req.user._id,
        competition: { $in: competitions.map(c => c._id) }
      }).select('competition status score totalPossibleScore submitTime');

      assignments.forEach(a => {
        userAssignments[a.competition.toString()] = a;
      });
    }

    const result = competitions.map(comp => {
      const cObj = comp.toObject();
      delete cObj.questionPool; // Never expose question pool in public listings
      const assignment = userAssignments[comp._id.toString()] || null;
      return {
        ...cObj,
        questionCount: comp.questionPool?.length || 0,
        myAssignment: assignment ? {
          status: assignment.status,
          score: assignment.score,
          totalPossibleScore: assignment.totalPossibleScore,
          submitTime: assignment.submitTime
        } : null
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching competitions:', err);
    res.status(500).json({ message: 'Failed to fetch competitions' });
  }
});

/**
 * Organizer / Admin: List competitions they manage
 */
router.get('/manage', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== 'admin') {
      filter.organizer = req.user._id;
    }

    const competitions = await Competition.find(filter)
      .populate('event', 'title date department')
      .populate('organizer', 'name email')
      .sort({ createdAt: -1 });

    res.json(competitions);
  } catch (err) {
    console.error('Error in /manage:', err);
    res.status(500).json({ message: 'Failed to fetch competitions' });
  }
});

/**
 * Participant: Get all completed competition certificates with score & rank
 */
router.get('/my-certificates', auth, async (req, res) => {
  try {
    const assignments = await AssessmentAssignment.find({
      user: req.user._id,
      status: { $in: ['submitted', 'timed_out'] }
    })
      .populate({
        path: 'competition',
        select: 'title type event organizer startTime endTime description department',
        populate: [
          { path: 'organizer', select: 'name email' },
          { path: 'event', select: 'title date location department' }
        ]
      })
      .sort({ updatedAt: -1 });

    const certList = assignments
      .filter(a => a.competition)
      .map(a => {
        const comp = a.competition;
        return {
          assignmentId: a._id,
          competitionId: comp._id,
          title: comp.title,
          type: comp.type,
          score: a.score,
          totalPossibleScore: a.totalPossibleScore || 100,
          percentage: a.percentage || 0,
          rank: a.rank,
          status: a.status,
          timeTakenSeconds: a.timeTakenSeconds,
          submitTime: a.submitTime || a.updatedAt,
          organizerName: comp.organizer?.name || 'Faculty Technical Chair',
          department: comp.department || comp.event?.department || 'Computer Technology',
          certificateId: `CERT-COMP-${new Date(comp.startTime || a.createdAt).getFullYear()}-${comp._id.toString().slice(-4).toUpperCase()}-${a._id.toString().slice(-4).toUpperCase()}`
        };
      });

    res.json(certList);
  } catch (err) {
    console.error('Error in /my-certificates:', err);
    res.status(500).json({ message: 'Failed to fetch competition certificates' });
  }
});

/**
 * Get competition public info
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id)
      .populate('organizer', 'name email department')
      .populate('event', 'title date location department');

    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    let myAssignment = null;
    if (req.user) {
      myAssignment = await AssessmentAssignment.findOne({
        competition: comp._id,
        user: req.user._id
      });
    }

    const cObj = comp.toObject();
    delete cObj.questionPool; // Hidden from general view

    res.json({
      ...cObj,
      questionCount: comp.questionPool?.length || 0,
      myAssignment: myAssignment ? {
        _id: myAssignment._id,
        status: myAssignment.status,
        startTime: myAssignment.startTime,
        expiresAt: myAssignment.expiresAt,
        submitTime: myAssignment.submitTime,
        score: myAssignment.score,
        totalPossibleScore: myAssignment.totalPossibleScore,
        rank: myAssignment.rank
      } : null
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch competition' });
  }
});

/**
 * Organizer / Admin: Get full competition details including questions and answers
 */
router.get('/:id/manage', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id)
      .populate('organizer', 'name email')
      .populate('event', 'title date department');

    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (req.user.role !== 'admin' && comp.organizer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to manage this competition' });
    }

    const participantCount = await AssessmentAssignment.countDocuments({ competition: comp._id });
    const submittedCount = await AssessmentAssignment.countDocuments({
      competition: comp._id,
      status: { $in: ['submitted', 'timed_out'] }
    });

    res.json({
      ...comp.toObject(),
      stats: {
        participantCount,
        submittedCount
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch competition management details' });
  }
});

/**
 * Organizer / Admin: Create competition draft
 */
router.post('/', auth, authorize('admin', 'organizer'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('type').isIn(['quiz', 'coding', 'hybrid']).withMessage('Valid competition type required'),
  body('durationMinutes').isInt({ min: 1 }).withMessage('Duration must be at least 1 minute'),
  body('startTime').isISO8601().withMessage('Valid start time required'),
  body('endTime').isISO8601().withMessage('Valid end time required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const {
      title,
      description,
      event,
      type,
      prompt,
      topics,
      difficulty,
      durationMinutes,
      totalMarks,
      negativeMarking,
      startTime,
      endTime,
      participantLimit,
      permittedLanguages,
      questionsPerParticipant,
      settings
    } = req.body;

    const competition = new Competition({
      title,
      description,
      event: event || null,
      organizer: req.user._id,
      type,
      prompt: prompt || '',
      topics: Array.isArray(topics) ? topics : (topics ? String(topics).split(',').map(s => s.trim()) : []),
      difficulty: difficulty || 'medium',
      durationMinutes: Number(durationMinutes) || 30,
      totalMarks: Number(totalMarks) || 10,
      negativeMarking: Math.max(0, Number(negativeMarking) || 0),
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      participantLimit: Number(participantLimit) || 0,
      permittedLanguages: Array.isArray(permittedLanguages) && permittedLanguages.length > 0
        ? permittedLanguages
        : ['cpp', 'python', 'java', 'javascript'],
      questionsPerParticipant: Number(questionsPerParticipant) || 5,
      questionPool: [],
      settings: settings || {
        shuffleOptions: true,
        randomizeQuestionOrder: true,
        allowReview: true,
        showLeaderboard: true
      },
      status: 'draft'
    });

    await competition.save();
    res.status(201).json(competition);
  } catch (err) {
    console.error('Error creating competition:', err);
    res.status(500).json({ message: err.message || 'Error creating competition' });
  }
});

/**
 * Organizer / Admin: Update competition settings
 */
router.put('/:id', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id);
    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (req.user.role !== 'admin' && comp.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const updatable = [
      'title', 'description', 'event', 'type', 'prompt', 'topics',
      'difficulty', 'durationMinutes', 'totalMarks', 'negativeMarking',
      'startTime', 'endTime', 'participantLimit', 'permittedLanguages',
      'questionsPerParticipant', 'settings', 'status'
    ];

    updatable.forEach(field => {
      if (req.body[field] !== undefined) {
        comp[field] = req.body[field];
      }
    });

    await comp.save();
    res.json(comp);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Error updating competition' });
  }
});

/**
 * Organizer / Admin: Delete competition
 */
router.delete('/:id', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id);
    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (req.user.role !== 'admin' && comp.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await AssessmentAssignment.deleteMany({ competition: comp._id });
    await comp.deleteOne();
    res.json({ message: 'Competition deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting competition' });
  }
});

/**
 * Organizer / Admin: Trigger Gemini AI to generate questions / coding problems
 */
router.post('/:id/generate-ai', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id);
    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (req.user.role !== 'admin' && comp.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const {
      prompt = comp.prompt,
      topics = comp.topics,
      difficulty = comp.difficulty,
      count = 5,
      type = comp.type
    } = req.body;

    const requestedCount = Math.min(Math.max(1, Number(count) || 5), 20);

    if (type === 'coding') {
      const generated = await geminiService.generateCodingProblems({
        prompt,
        topics,
        difficulty,
        count: Math.min(requestedCount, 5),
        permittedLanguages: comp.permittedLanguages,
        marksPerProblem: Math.round(comp.totalMarks / Math.min(requestedCount, 5)) || 20
      });

      return res.json({
        success: true,
        type: 'coding',
        modelUsed: generated.modelUsed,
        problems: generated.problems
      });
    }

    if (type === 'hybrid') {
      const mcqCount = Math.max(1, Math.floor(requestedCount * 0.7));
      const codingCount = Math.max(1, requestedCount - mcqCount);

      const [quizGen, codingGen] = await Promise.all([
        geminiService.generateQuizQuestions({
          prompt,
          topics,
          difficulty,
          count: mcqCount,
          marksPerQuestion: 2
        }),
        geminiService.generateCodingProblems({
          prompt,
          topics,
          difficulty,
          count: codingCount,
          permittedLanguages: comp.permittedLanguages,
          marksPerProblem: 10
        })
      ]);

      return res.json({
        success: true,
        type: 'hybrid',
        modelUsed: quizGen.modelUsed,
        questions: [...quizGen.questions, ...codingGen.problems]
      });
    }

    // Default: Quiz (MCQs)
    const marksPerQ = Math.round((comp.totalMarks / requestedCount) * 10) / 10 || 1;
    const generated = await geminiService.generateQuizQuestions({
      prompt,
      topics,
      difficulty,
      count: requestedCount,
      marksPerQuestion: marksPerQ
    });

    res.json({
      success: true,
      type: 'quiz',
      modelUsed: generated.modelUsed,
      questions: generated.questions
    });
  } catch (err) {
    console.error('AI generation error:', err);
    res.status(500).json({ message: err.message || 'AI generation failed' });
  }
});

/**
 * Organizer / Admin: Save or update the approved question pool
 */
router.put('/:id/questions', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id);
    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (req.user.role !== 'admin' && comp.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { questionPool } = req.body;
    if (!Array.isArray(questionPool)) {
      return res.status(400).json({ message: 'questionPool must be an array' });
    }

    // Ensure all questions have unique IDs
    const normalizedPool = questionPool.map((q, idx) => ({
      ...q,
      questionId: q.questionId || q.problemId || `q_${Date.now()}_${idx}`
    }));

    comp.questionPool = normalizedPool;

    // Recalculate totalMarks if not explicitly provided
    const total = normalizedPool.reduce((acc, q) => acc + (Number(q.marks) || 0), 0);
    if (total > 0) {
      comp.totalMarks = total;
    }

    await comp.save();
    res.json({
      message: 'Question pool saved successfully',
      questionCount: comp.questionPool.length,
      totalMarks: comp.totalMarks
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Error saving question pool' });
  }
});

/**
 * Organizer / Admin: Publish competition
 */
router.post('/:id/publish', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id);
    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (req.user.role !== 'admin' && comp.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!comp.questionPool || comp.questionPool.length === 0) {
      return res.status(400).json({ message: 'Cannot publish competition with an empty question pool. Generate or add questions first.' });
    }

    comp.status = 'published';
    await comp.save();
    res.json({ message: 'Competition published successfully', status: comp.status });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to publish competition' });
  }
});

/**
 * Participant: Start assessment / Get existing assignment
 * Enforces registration, timing, participant limits, and stable personalized variant assignment.
 */
router.post('/:id/start', auth, async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id);
    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (comp.status !== 'published' && comp.status !== 'active') {
      return res.status(400).json({ message: `Competition is not open for participation (Status: ${comp.status})` });
    }

    const now = new Date();
    if (now < comp.startTime) {
      return res.status(400).json({ message: `Competition has not started yet. Starts at ${comp.startTime.toLocaleString()}` });
    }
    if (now > comp.endTime) {
      return res.status(400).json({ message: `Competition has already ended at ${comp.endTime.toLocaleString()}` });
    }

    // If competition is attached to an Event, verify event registration if required
    if (comp.event) {
      const reg = await Registration.findOne({ event: comp.event, user: req.user._id });
      if (!reg && req.user.role === 'student') {
        // Automatically link attendee if event is open or has capacity
        const eventDoc = await Event.findById(comp.event);
        if (eventDoc && !eventDoc.attendees.includes(req.user._id)) {
          if (!eventDoc.isFull) {
            await eventDoc.addAttendee(req.user._id);
            await Registration.create({
              event: eventDoc._id,
              user: req.user._id,
              name: req.user.name,
              regNo: req.user._id.toString().slice(-8),
              status: 'approved'
            });
          } else {
            return res.status(403).json({ message: 'Event is full. Cannot enter competition.' });
          }
        }
      }
    }

/**
 * Unbiased Fisher-Yates shuffle algorithm to guarantee uniform random permutations
 */
function fisherYatesShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

    // Check if participant ALREADY has an assignment
    let assignment = await AssessmentAssignment.findOne({
      competition: comp._id,
      user: req.user._id
    });

    if (assignment) {
      // If assignment is in_progress and user hasn't submitted any answers or code yet,
      // and their assigned questions are in the original pool order, randomize them now!
      if (
        assignment.status === 'in_progress' &&
        (!assignment.answers || assignment.answers.length === 0) &&
        (!assignment.codingSubmissions || assignment.codingSubmissions.length === 0)
      ) {
        const originalPoolIds = (comp.questionPool || []).map(q => q.questionId || q.problemId);
        const isOriginalOrder = assignment.assignedQuestionIds.length > 1 &&
          assignment.assignedQuestionIds.every((id, idx) => id === originalPoolIds[idx]);
        if (isOriginalOrder) {
          assignment.assignedQuestionIds = fisherYatesShuffle(assignment.assignedQuestionIds);
          await assignment.save();
        }
      }

      // Return existing assignment
      const sanitizedQuestions = comp.getSanitizedQuestions(assignment.assignedQuestionIds);
      return res.json({
        assignmentId: assignment._id,
        status: assignment.status,
        startTime: assignment.startTime,
        expiresAt: assignment.expiresAt,
        durationMinutes: comp.durationMinutes,
        questions: sanitizedQuestions,
        answers: assignment.answers || [],
        codingSubmissions: assignment.codingSubmissions || [],
        negativeMarking: comp.negativeMarking,
        totalMarks: comp.totalMarks,
        type: comp.type,
        permittedLanguages: comp.permittedLanguages
      });
    }

    // Check participant limit
    if (comp.participantLimit > 0) {
      const count = await AssessmentAssignment.countDocuments({ competition: comp._id });
      if (count >= comp.participantLimit) {
        return res.status(400).json({ message: 'Competition participant limit has been reached.' });
      }
    }

    // Generate balanced personalized randomized question set for this participant
    const pool = comp.questionPool || [];
    if (pool.length === 0) {
      return res.status(400).json({ message: 'No questions available in this competition.' });
    }

    const targetCount = Math.min(comp.questionsPerParticipant || pool.length, pool.length);
    // Use unbiased Fisher-Yates shuffle algorithm to guarantee every user receives a distinct randomized order and sample
    const shuffled = fisherYatesShuffle(pool);
    const selected = shuffled.slice(0, targetCount);
    const assignedIds = selected.map(q => q.questionId || q.problemId);

    // Calculate exact deadline: min(now + duration, comp.endTime)
    const durationMs = comp.durationMinutes * 60 * 1000;
    const potentialExpiry = new Date(now.getTime() + durationMs);
    const expiresAt = potentialExpiry < comp.endTime ? potentialExpiry : comp.endTime;

    assignment = new AssessmentAssignment({
      competition: comp._id,
      user: req.user._id,
      assignedQuestionIds: assignedIds,
      startTime: now,
      expiresAt,
      status: 'in_progress',
      answers: [],
      codingSubmissions: [],
      auditLog: [{
        action: 'contest_started',
        timestamp: now,
        details: { ip: req.ip, userAgent: req.get('User-Agent') }
      }]
    });

    try {
      await assignment.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        assignment = await AssessmentAssignment.findOne({
          competition: comp._id,
          user: req.user._id
        });
        if (assignment) {
          const sanitizedQuestions = comp.getSanitizedQuestions(assignment.assignedQuestionIds);
          return res.json({
            assignmentId: assignment._id,
            status: assignment.status,
            startTime: assignment.startTime,
            expiresAt: assignment.expiresAt,
            durationMinutes: comp.durationMinutes,
            questions: sanitizedQuestions,
            answers: assignment.answers || [],
            codingSubmissions: assignment.codingSubmissions || [],
            negativeMarking: comp.negativeMarking,
            totalMarks: comp.totalMarks,
            type: comp.type,
            permittedLanguages: comp.permittedLanguages
          });
        }
      }
      throw saveErr;
    }

    const sanitizedQuestions = comp.getSanitizedQuestions(assignedIds);

    res.json({
      assignmentId: assignment._id,
      status: assignment.status,
      startTime: assignment.startTime,
      expiresAt: assignment.expiresAt,
      durationMinutes: comp.durationMinutes,
      questions: sanitizedQuestions,
      answers: [],
      codingSubmissions: [],
      negativeMarking: comp.negativeMarking,
      totalMarks: comp.totalMarks,
      type: comp.type,
      permittedLanguages: comp.permittedLanguages
    });
  } catch (err) {
    console.error('Error starting assessment:', err);
    res.status(500).json({ message: err.message || 'Error starting assessment' });
  }
});

/**
 * Participant: Auto-save a quiz answer or update marked for review
 */
router.post('/:id/save-answer', auth, async (req, res) => {
  try {
    const { questionId, selectedOption, markedForReview } = req.body;
    if (!questionId) {
      return res.status(400).json({ message: 'questionId is required' });
    }

    const assignment = await AssessmentAssignment.findOne({
      competition: req.params.id,
      user: req.user._id
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found. Please start the competition first.' });
    }

    if (assignment.status !== 'in_progress') {
      return res.status(400).json({ message: 'Assessment is already submitted or timed out.' });
    }

    // Grace period of 15 seconds for network latency
    const now = new Date();
    if (now > new Date(assignment.expiresAt.getTime() + 15000)) {
      assignment.status = 'timed_out';
      await assignment.save();
      return res.status(400).json({ message: 'Time expired for this assessment.' });
    }

    let existingAnswer = assignment.answers.find(a => a.questionId === questionId);
    if (existingAnswer) {
      if (selectedOption !== undefined) existingAnswer.selectedOption = Number(selectedOption);
      if (markedForReview !== undefined) existingAnswer.markedForReview = !!markedForReview;
      existingAnswer.savedAt = now;
    } else {
      assignment.answers.push({
        questionId,
        selectedOption: selectedOption !== undefined ? Number(selectedOption) : -1,
        markedForReview: !!markedForReview,
        savedAt: now
      });
    }

    await assignment.save();
    res.json({ success: true, savedAt: now });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save answer' });
  }
});

/**
 * Participant: Run code against visible sample test cases only (via isolated Judge0 CE)
 */
router.post('/:id/run-code', auth, async (req, res) => {
  try {
    const { problemId, language, code } = req.body;
    if (!problemId || !code) {
      return res.status(400).json({ message: 'problemId and code are required' });
    }

    const comp = await Competition.findById(req.params.id);
    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const problem = comp.questionPool.find(q => (q.problemId === problemId || q.questionId === problemId));
    if (!problem || problem.type !== 'coding') {
      return res.status(404).json({ message: 'Coding problem not found' });
    }

    const result = await codeExecutionService.runSampleTests(code, language, problem.sampleTestCases || []);
    res.json(result);
  } catch (err) {
    console.error('Run code error:', err);
    res.status(500).json({ message: err.message || 'Error running sample test cases' });
  }
});

/**
 * Participant: Submit code solution for evaluation against hidden test cases
 */
router.post('/:id/submit-code', auth, async (req, res) => {
  try {
    const { problemId, language, code } = req.body;
    if (!problemId || !code) {
      return res.status(400).json({ message: 'problemId and code are required' });
    }

    const [comp, assignment] = await Promise.all([
      Competition.findById(req.params.id),
      AssessmentAssignment.findOne({ competition: req.params.id, user: req.user._id })
    ]);

    if (!comp || !assignment) {
      return res.status(404).json({ message: 'Competition or assignment not found' });
    }

    if (assignment.status !== 'in_progress') {
      return res.status(400).json({ message: 'Assessment is already submitted or timed out.' });
    }

    const now = new Date();
    if (now > new Date(assignment.expiresAt.getTime() + 15000)) {
      assignment.status = 'timed_out';
      await assignment.save();
      return res.status(400).json({ message: 'Time expired for this assessment.' });
    }

    const problem = comp.questionPool.find(q => (q.problemId === problemId || q.questionId === problemId));
    if (!problem || problem.type !== 'coding') {
      return res.status(404).json({ message: 'Coding problem not found' });
    }

    // Evaluate against hidden test cases securely on backend
    const evalResult = await codeExecutionService.evaluateSubmissionAgainstHiddenTests(
      code,
      language,
      problem.hiddenTestCases || [],
      problem.marks || 20
    );

    // Save coding submission in assignment
    let existingSub = assignment.codingSubmissions.find(s => s.problemId === problemId);
    if (existingSub) {
      existingSub.language = language;
      existingSub.code = code;
      existingSub.passedTestCases = evalResult.passedTestCases;
      existingSub.totalTestCases = evalResult.totalTestCases;
      existingSub.score = evalResult.score;
      existingSub.status = evalResult.status;
      existingSub.error = evalResult.error;
      existingSub.submittedAt = now;
    } else {
      assignment.codingSubmissions.push({
        problemId,
        language,
        code,
        passedTestCases: evalResult.passedTestCases,
        totalTestCases: evalResult.totalTestCases,
        score: evalResult.score,
        status: evalResult.status,
        error: evalResult.error,
        submittedAt: now
      });
    }

    assignment.auditLog.push({
      action: 'coding_submission',
      timestamp: now,
      details: {
        problemId,
        language,
        passedTestCases: evalResult.passedTestCases,
        totalTestCases: evalResult.totalTestCases,
        score: evalResult.score,
        status: evalResult.status
      }
    });

    await assignment.save();

    res.json({
      success: true,
      passedTestCases: evalResult.passedTestCases,
      totalTestCases: evalResult.totalTestCases,
      score: evalResult.score,
      status: evalResult.status,
      error: evalResult.error,
      executionTime: evalResult.executionTime
    });
  } catch (err) {
    console.error('Submit code error:', err);
    res.status(500).json({ message: err.message || 'Error evaluating code submission' });
  }
});

/**
 * Participant: Final submission (or auto-submitted by timer expiration)
 * Calculates scores independently on backend, applies negative marking, updates ranks.
 */
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const [comp, assignment] = await Promise.all([
      Competition.findById(req.params.id),
      AssessmentAssignment.findOne({ competition: req.params.id, user: req.user._id })
    ]);

    if (!comp || !assignment) {
      return res.status(404).json({ message: 'Competition or assignment not found' });
    }

    if (assignment.status === 'submitted') {
      return res.json({
        message: 'Assessment was already submitted',
        score: assignment.score,
        totalPossibleScore: assignment.totalPossibleScore,
        percentage: assignment.percentage
      });
    }

    const now = new Date();
    const isTimeout = now > new Date(assignment.expiresAt.getTime() + 15000);

    // If client sent remaining answers in final submission body, merge them
    if (Array.isArray(req.body.answers)) {
      req.body.answers.forEach(clientAns => {
        const existing = assignment.answers.find(a => a.questionId === clientAns.questionId);
        if (existing) {
          if (clientAns.selectedOption !== undefined) existing.selectedOption = Number(clientAns.selectedOption);
        } else {
          assignment.answers.push({
            questionId: clientAns.questionId,
            selectedOption: Number(clientAns.selectedOption),
            markedForReview: false,
            savedAt: now
          });
        }
      });
    }

    // Evaluate all assigned quiz questions against secret correct options
    const questionMap = new Map();
    comp.questionPool.forEach(q => {
      const qId = q.questionId || q.problemId;
      questionMap.set(qId, q);
    });

    let totalScore = 0;
    let maxPossible = 0;

    assignment.assignedQuestionIds.forEach(qId => {
      const qDoc = questionMap.get(qId);
      if (!qDoc) return;

      const marks = Number(qDoc.marks) || 1;
      maxPossible += marks;

      if (qDoc.type === 'coding') {
        const codeSub = assignment.codingSubmissions.find(s => s.problemId === qId);
        if (codeSub) {
          totalScore += Number(codeSub.score) || 0;
        }
      } else {
        // MCQ evaluation
        const answer = assignment.answers.find(a => a.questionId === qId);
        if (answer && answer.selectedOption !== undefined && answer.selectedOption !== -1) {
          if (answer.selectedOption === qDoc.correctOption) {
            answer.isCorrect = true;
            answer.scoreAwarded = marks;
            totalScore += marks;
          } else {
            answer.isCorrect = false;
            const deduction = Number(comp.negativeMarking) || 0;
            answer.scoreAwarded = -deduction;
            totalScore -= deduction;
          }
        } else {
          // Unattempted
          if (answer) {
            answer.isCorrect = false;
            answer.scoreAwarded = 0;
          }
        }
      }
    });

    // Floor score to zero if negative marking reduced it below 0
    totalScore = Math.max(0, Math.round(totalScore * 100) / 100);
    const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 1000) / 10 : 0;
    const timeTaken = Math.max(1, Math.round((now.getTime() - assignment.startTime.getTime()) / 1000));

    assignment.submitTime = now;
    assignment.status = isTimeout ? 'timed_out' : 'submitted';
    assignment.score = totalScore;
    assignment.totalPossibleScore = maxPossible;
    assignment.percentage = percentage;
    assignment.timeTakenSeconds = timeTaken;

    assignment.auditLog.push({
      action: isTimeout ? 'auto_submitted_timeout' : 'submitted_by_user',
      timestamp: now,
      details: { totalScore, percentage, timeTakenSeconds: timeTaken }
    });

    await assignment.save();

    // Recalculate ranks for all submitted assignments in this competition
    const allSubmitted = await AssessmentAssignment.find({
      competition: comp._id,
      status: { $in: ['submitted', 'timed_out'] }
    }).sort({ score: -1, timeTakenSeconds: 1 });

    for (let r = 0; r < allSubmitted.length; r++) {
      allSubmitted[r].rank = r + 1;
      await allSubmitted[r].save();
    }

    const currentRank = allSubmitted.findIndex(a => a._id.toString() === assignment._id.toString()) + 1;

    res.json({
      success: true,
      message: isTimeout ? 'Time expired. Assessment auto-submitted.' : 'Assessment submitted successfully.',
      score: totalScore,
      totalPossibleScore: maxPossible,
      percentage,
      timeTakenSeconds: timeTaken,
      rank: currentRank,
      status: assignment.status
    });
  } catch (err) {
    console.error('Submit assessment error:', err);
    res.status(500).json({ message: err.message || 'Error submitting assessment' });
  }
});

/**
 * Leaderboard: Rankings, scores, completion status, time taken
 */
router.get('/:id/leaderboard', optionalAuth, async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id)
      .select('title type totalMarks startTime endTime status settings');

    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    const assignments = await AssessmentAssignment.find({
      competition: comp._id,
      status: { $in: ['submitted', 'timed_out'] }
    })
      .populate('user', 'name email department')
      .sort({ score: -1, timeTakenSeconds: 1 });

    const rankings = assignments.map((a, idx) => ({
      rank: idx + 1,
      userId: a.user?._id,
      name: a.user?.name || 'Anonymous Student',
      department: a.user?.department || 'General',
      score: a.score,
      totalPossibleScore: a.totalPossibleScore || comp.totalMarks,
      percentage: a.percentage,
      timeTakenSeconds: a.timeTakenSeconds,
      status: a.status,
      submittedAt: a.submitTime
    }));

    res.json({
      competitionTitle: comp.title,
      type: comp.type,
      totalParticipants: assignments.length,
      rankings
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch leaderboard' });
  }
});

/**
 * Participant: View own detailed results and feedback
 */
router.get('/:id/my-result', auth, async (req, res) => {
  try {
    const [comp, assignment] = await Promise.all([
      Competition.findById(req.params.id),
      AssessmentAssignment.findOne({ competition: req.params.id, user: req.user._id })
    ]);

    if (!comp || !assignment) {
      return res.status(404).json({ message: 'Competition or submission not found' });
    }

    if (assignment.status === 'in_progress') {
      return res.status(400).json({ message: 'Assessment is still in progress' });
    }

    // Once an assessment has been submitted, allow participants to preview answers and explanations
    const showSolutions = true;

    const questionMap = new Map();
    comp.questionPool.forEach(q => {
      questionMap.set(q.questionId || q.problemId, q);
    });

    const detailedQuestions = assignment.assignedQuestionIds.map(qId => {
      const qDoc = questionMap.get(qId);
      if (!qDoc) return null;

      if (qDoc.type === 'coding') {
        const codeSub = assignment.codingSubmissions.find(s => s.problemId === qId);
        return {
          problemId: qId,
          type: 'coding',
          title: qDoc.title,
          description: qDoc.description,
          topic: qDoc.topic || 'Algorithms',
          difficulty: qDoc.difficulty || 'medium',
          marks: qDoc.marks || 10,
          submission: codeSub ? {
            language: codeSub.language,
            code: codeSub.code,
            passedTestCases: codeSub.passedTestCases,
            totalTestCases: codeSub.totalTestCases,
            score: codeSub.score,
            status: codeSub.status,
            error: codeSub.error
          } : null
        };
      }

      const ans = assignment.answers.find(a => a.questionId === qId);
      const isAttempted = ans && ans.selectedOption !== undefined && ans.selectedOption !== -1 && ans.selectedOption !== null;
      const isCorrect = isAttempted && ans.selectedOption === qDoc.correctOption;

      let explanationText = qDoc.explanation;
      if (!explanationText && qDoc.options && qDoc.correctOption !== undefined && qDoc.options[qDoc.correctOption]) {
        explanationText = `The correct answer is Option ${String.fromCharCode(65 + qDoc.correctOption)}: "${qDoc.options[qDoc.correctOption]}".`;
      }

      return {
        questionId: qId,
        type: 'mcq',
        question: qDoc.question,
        options: qDoc.options,
        topic: qDoc.topic || 'General',
        difficulty: qDoc.difficulty || 'medium',
        marks: qDoc.marks || 1,
        selectedOption: isAttempted ? ans.selectedOption : -1,
        isAttempted,
        isCorrect: isAttempted ? isCorrect : false,
        scoreAwarded: ans?.scoreAwarded ?? 0,
        correctOption: showSolutions ? qDoc.correctOption : undefined,
        explanation: showSolutions ? (explanationText || 'No detailed explanation provided for this question.') : undefined
      };
    }).filter(Boolean);

    res.json({
      competitionTitle: comp.title,
      type: comp.type,
      score: assignment.score,
      totalPossibleScore: assignment.totalPossibleScore,
      percentage: assignment.percentage,
      rank: assignment.rank,
      timeTakenSeconds: assignment.timeTakenSeconds,
      status: assignment.status,
      submitTime: assignment.submitTime,
      negativeMarking: comp.negativeMarking,
      questions: detailedQuestions
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch personal result' });
  }
});

/**
 * Participant: Download or preview verified Competition Merit Certificate with score
 */
router.get('/:id/certificate', auth, async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id)
      .populate('organizer', 'name email department')
      .populate('event', 'title date location department');

    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    let assignment = await AssessmentAssignment.findOne({
      competition: comp._id,
      user: req.user._id
    });

    // If user is admin/organizer and hasn't participated, allow preview
    if (!assignment && ['admin', 'organizer'].includes(req.user.role)) {
      const maxScore = comp.questionPool?.reduce((sum, q) => sum + (q.marks || 1), 0) || 100;
      assignment = {
        _id: 'PREVIEW',
        score: maxScore,
        totalPossibleScore: maxScore,
        percentage: 100,
        rank: 1,
        timeTakenSeconds: 420,
        submitTime: new Date(),
        status: 'submitted'
      };
    }

    if (!assignment) {
      return res.status(404).json({ message: 'No assessment record found for this competition.' });
    }

    if (assignment.status === 'in_progress') {
      return res.status(400).json({ message: 'Assessment is still in progress. Please submit before downloading certificate.' });
    }

    const regNo = req.user.email?.split('@')[0] || req.user._id.toString().slice(-8).toUpperCase();
    const certificateId = `CERT-COMP-${new Date(comp.startTime || comp.createdAt || Date.now()).getFullYear()}-${comp._id.toString().slice(-4).toUpperCase()}-${(assignment._id || req.user._id).toString().slice(-4).toUpperCase()}`;

    const doc = generateCompetitionCertificateStream({
      name: req.user.name,
      regNo,
      competitionTitle: comp.title,
      type: comp.type,
      score: assignment.score,
      totalPossibleScore: assignment.totalPossibleScore || 100,
      percentage: assignment.percentage || 0,
      rank: assignment.rank,
      timeTakenSeconds: assignment.timeTakenSeconds,
      department: comp.department || comp.event?.department || req.user.department || 'Technical Department',
      date: assignment.submitTime || comp.endTime || new Date(),
      certificateId,
      organizerName: comp.organizer?.name || 'Faculty Technical Chair'
    });

    const safeTitle = (comp.title || 'competition').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    if (req.query.inline === 'true') {
      res.setHeader('Content-Disposition', `inline; filename="${safeTitle}_merit_certificate.pdf"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_merit_certificate.pdf"`);
    }

    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error('Error generating competition certificate:', err);
    res.status(500).json({ message: 'Failed to generate competition certificate' });
  }
});

/**
 * Organizer / Admin: Export results to Excel
 */
router.get('/:id/export', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id)
      .populate('organizer', 'name email');

    if (!comp) {
      return res.status(404).json({ message: 'Competition not found' });
    }

    if (req.user.role !== 'admin' && comp.organizer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const assignments = await AssessmentAssignment.find({
      competition: comp._id,
      status: { $in: ['submitted', 'timed_out'] }
    })
      .populate('user', 'name email department')
      .sort({ score: -1, timeTakenSeconds: 1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'College Event Manager';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Leaderboard');
    worksheet.columns = [
      { header: 'Rank', key: 'rank', width: 10 },
      { header: 'Student Name', key: 'name', width: 26 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Department', key: 'department', width: 22 },
      { header: 'Score', key: 'score', width: 14 },
      { header: 'Max Score', key: 'totalPossibleScore', width: 14 },
      { header: 'Percentage (%)', key: 'percentage', width: 16 },
      { header: 'Time Taken (s)', key: 'timeTaken', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Submitted At', key: 'submittedAt', width: 22 }
    ];

    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF6D28D9' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    assignments.forEach((a, idx) => {
      worksheet.addRow({
        rank: idx + 1,
        name: a.user?.name || '',
        email: a.user?.email || '',
        department: a.user?.department || 'General',
        score: a.score,
        totalPossibleScore: a.totalPossibleScore,
        percentage: `${a.percentage}%`,
        timeTaken: a.timeTakenSeconds,
        status: a.status,
        submittedAt: a.submitTime ? new Date(a.submitTime).toLocaleString() : ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${comp.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_results.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: 'Failed to export results' });
  }
});

module.exports = router;
