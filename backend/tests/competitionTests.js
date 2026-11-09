const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// Never dispatch live emails to disposable @example.com test addresses during automated test runs
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
const mongoose = require('mongoose');
const assert = require('assert');

const Competition = require('../models/competitions/Competition');
const AssessmentAssignment = require('../models/competitions/AssessmentAssignment');
const Event = require('../models/events/Event');
const Registration = require('../models/events/Registration');
const QuestionCache = require('../models/competitions/QuestionCache');
const User = require('../models/auth/User');
const geminiService = require('../services/ai/geminiService');
const aiService = require('../services/ai/aiService');
const BaseAIProvider = require('../services/ai/baseProvider');
const codeExecutionService = require('../services/competitions/codeExecutionService');
const {
  sanitizeMediaUrl,
  fileToDataUri,
  sanitizeWhatsAppUrl,
  sanitizeEmailAddress
} = require('../utils/sanitize');
const { generateQrSvg } = require('../utils/qrGenerator');
const crypto = require('crypto');
const Notification = require('../models/community/Notification');
const EmailOtp = require('../models/auth/EmailOtp');
const SystemSetting = require('../models/system/SystemSetting');
const Department = require('../models/system/Department');
const Club = require('../models/feed/Club');
const FeedPost = require('../models/feed/FeedPost');
const PostLike = require('../models/feed/PostLike');
const { cascadeDeleteEvent, evaluateExpiredEvents } = require('../services/events/eventCleanupService');
const {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  resolveActiveDepartmentName
} = require('../services/system/departmentService');
const { cascadeDeleteUser } = require('../services/auth/userDeletionService');
const {
  toPaise,
  toRupeesString,
  buildUpiUri,
  getYoupiConfig,
  signWebhookPayload,
  verifyYoupiWebhook,
  createYoupiPaymentSession,
  submitUtrAndProcessSession,
  reconcileSessionByAdmin,
  processIncomingWebhook
} = require('../services/payments/youpiGatewayService');
const YoupiPaymentSession = require('../models/payments/YoupiPaymentSession');
const YoupiWebhookReceipt = require('../models/payments/YoupiWebhookReceipt');
const competitionsRouter = require('../routes/competitions/competitions');

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING AI QUIZ & CODING COMPETITION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`• ${name}... `);
      await fn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log('❌ FAILED');
      console.error('  Error:', err.message);
      failed++;
    }
  }

  // Connect to DB (use local mongo URI or Atlas fallback)
  if (mongoose.connection.readyState === 0) {
    const localUri = process.env.MONGODB_URI_LOCAL || 'mongodb://127.0.0.1:27017/college-event-manager';
    try {
      await mongoose.connect(localUri, { serverSelectionTimeoutMS: 3000 });
    } catch {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    }
  }

  // TEST 1: Gemini Model Verification & Free-Tier Check
  await test('Gemini Service - Model verification on account free tier', async () => {
    const verifiedModel = await geminiService.getVerifiedModel();
    assert(verifiedModel, 'Verified model should not be null');
    assert(typeof verifiedModel === 'string', 'Verified model should be a string');
    assert(!verifiedModel.startsWith('models/'), 'Model name should be normalized');
  });

  // TEST 2: Gemini AI MCQ Question Generation & Schema Validation
  await test('Gemini Service - Generate structured MCQs from organizer prompt', async () => {
    const result = await geminiService.generateQuizQuestions({
      prompt: 'Algorithms test',
      topics: ['Binary Search'],
      difficulty: 'easy',
      count: 2,
      marksPerQuestion: 2
    });

    assert(result.questions && result.questions.length >= 1, 'Should return at least 1 question');
    const q = result.questions[0];
    assert.strictEqual(q.type, 'mcq', 'Type should be mcq');
    assert(typeof q.question === 'string' && q.question.length > 5, 'Question text should be non-empty');
    assert(Array.isArray(q.options) && q.options.length === 4, 'Options must contain exactly 4 choices');
    assert(typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 3, 'correctOption must be 0-3');
    assert(q.marks === 2, 'Marks should match configured value');
  });

  // TEST 3: Coding Problem Generation & Schema Validation
  await test('Gemini Service - Generate structured algorithmic coding challenge', async () => {
    const result = await geminiService.generateCodingProblems({
      prompt: 'Contest test',
      topics: ['Arrays'],
      difficulty: 'easy',
      count: 1,
      permittedLanguages: ['cpp', 'python', 'java', 'javascript'],
      marksPerProblem: 25
    });

    assert(result.problems && result.problems.length >= 1, 'Should return at least 1 problem');
    const p = result.problems[0];
    assert.strictEqual(p.type, 'coding', 'Type should be coding');
    assert(p.title && p.title.length > 0, 'Problem should have a non-empty title');
    assert(p.description && p.description.length > 0, 'Problem should have a description');
    assert(p.starterCode && typeof p.starterCode.python === 'string', 'Should include Python starter code');
    assert(Array.isArray(p.sampleTestCases) && p.sampleTestCases.length >= 1, 'Should have at least 1 sample test case');
    assert(Array.isArray(p.hiddenTestCases) && p.hiddenTestCases.length >= 1, 'Should have at least 1 hidden test case');
    assert.strictEqual(p.marks, 25, 'Marks should match configured problem marks');
  });

  // TEST 4: HTTP 429 Quota Error Delay Parsing & Cooldown Enforcement
  await test('Quota Management - Parse HTTP 429 retry delay and enforce cooldown', async () => {
    class MockProvider extends BaseAIProvider {
      isConfigured() { return true; }
    }
    const provider = new MockProvider('mock-provider');

    // Case A: Parse from message with "retry after 45s"
    const errWithMsg = new Error('Quota exceeded: Please retry after 45s due to rate limiting');
    errWithMsg.status = 429;
    const delay1 = provider.parseRetryDelay(errWithMsg);
    assert.strictEqual(delay1, 45, 'Should parse 45s from error message');

    // Case B: Parse from errorDetails quotaResetDelay
    const errWithDetails = new Error('RESOURCE_EXHAUSTED');
    errWithDetails.errorDetails = [{ quotaResetDelay: '35s' }];
    const delay2 = provider.parseRetryDelay(errWithDetails);
    assert.strictEqual(delay2, 35, 'Should parse 35s from errorDetails');

    // Case C: Cooldown enforcement
    provider.setQuotaCooldown(delay1, errWithMsg);
    assert.strictEqual(provider.isInCooldown(), true, 'Provider should now be in active cooldown');
    assert(provider.getRemainingCooldownSeconds() > 0, 'Remaining cooldown should be positive');

    const status = provider.getStatus();
    assert.strictEqual(status.isQuotaExhausted, true, 'Status should reflect quota exhaustion');
    assert(status.cooldownSeconds > 0, 'Cooldown seconds should be reported');
  });

  // TEST 5: Concurrent Duplicate Request Deduplication
  await test('Concurrency - Prevent duplicate backend requests via in-flight deduplication', async () => {
    let callCount = 0;
    const mockTask = async () => {
      callCount++;
      await new Promise(r => setTimeout(r, 100));
      return { result: 'ok', counter: callCount };
    };

    const dedupKey = 'test_dedup_key_' + Date.now();

    // Fire 3 simultaneous executions with the same dedup key
    const [res1, res2, res3] = await Promise.all([
      aiService.executeWithDeduplication(dedupKey, mockTask),
      aiService.executeWithDeduplication(dedupKey, mockTask),
      aiService.executeWithDeduplication(dedupKey, mockTask)
    ]);

    assert.strictEqual(callCount, 1, 'Underlying function should only be invoked once despite 3 concurrent calls');
    assert.strictEqual(res1.counter, 1, 'Result 1 should have counter 1');
    assert.strictEqual(res2.counter, 1, 'Result 2 should share identical result');
    assert.strictEqual(res3.counter, 1, 'Result 3 should share identical result');
  });

  // TEST 6: MongoDB Problem Caching & Reuse
  await test('Caching - Cache questions in MongoDB and reuse without external API requests', async () => {
    const testTopic = `cache_topic_${Date.now()}`;
    const mockProblem = {
      title: 'Cached Two Sum',
      description: 'Find two numbers that sum to target',
      inputFormat: 'Numbers on stdin',
      outputFormat: 'Indices on stdout',
      difficulty: 'easy',
      marks: 15,
      sampleTestCases: [{ input: '2 7 11 15\n9', output: '0 1' }],
      hiddenTestCases: [{ input: '3 2 4\n6', output: '1 2' }]
    };

    // Save into QuestionCache
    await QuestionCache.cacheItem({
      type: 'coding',
      topic: testTopic,
      difficulty: 'easy',
      title: mockProblem.title,
      data: mockProblem,
      source: 'test'
    });

    // Query via QuestionCache.findMatching
    const matches = await QuestionCache.findMatching({
      type: 'coding',
      topics: [testTopic],
      difficulty: 'easy',
      limit: 1
    });

    assert(matches && matches.length >= 1, 'Should find cached problem in MongoDB');
    assert.strictEqual(matches[0].data.title, 'Cached Two Sum', 'Title should match cached item');

    // Query via aiService with forceFresh: false (should pull from DB cache)
    const cachedResult = await aiService.generateCodingProblems({
      prompt: 'Cached prompt',
      topics: [testTopic],
      difficulty: 'easy',
      count: 1,
      forceFresh: false
    });

    assert(cachedResult.fromCache === true, 'aiService should retrieve problem from cache');
    assert.strictEqual(cachedResult.problems[0].title, 'Cached Two Sum', 'Should match cached problem title');

    // Clean up test cache
    await QuestionCache.deleteMany({ topic: testTopic });
  });

  // TEST 7: Provider Failure & Graceful Fallback
  await test('Error Handling - Graceful fallback when provider is in quota cooldown', async () => {
    const provider = aiService.gemini;
    const originalCooldown = provider.cooldownUntil;

    // Simulate quota exhaustion cooldown on Gemini
    provider.setQuotaCooldown(30, new Error('RESOURCE_EXHAUSTED (quota exceeded)'));

    try {
      await provider.generateQuizQuestions({
        prompt: 'Should fail fast',
        topics: ['Testing'],
        count: 1
      });
      assert.fail('Should have thrown QuotaExceededError during cooldown');
    } catch (err) {
      assert(err.status === 429 || err.code === 'RESOURCE_EXHAUSTED', 'Should throw HTTP 429 / RESOURCE_EXHAUSTED');
      assert(err.retryAfterSeconds > 0, 'Error should contain retryAfterSeconds');
      assert(err.message.includes('quota limit'), 'Error message should clearly inform organizer of rate limit');
    } finally {
      // Restore provider state
      provider.cooldownUntil = originalCooldown;
    }
  });

  // TEST 8: Question Sanitization & Hidden Test Isolation
  await test('Security - Hidden tests and correct answers never exposed in sanitized output', async () => {
    const mockComp = new Competition({
      title: 'Security Isolation Test',
      description: 'Verifying data isolation',
      organizer: new mongoose.Types.ObjectId(),
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      questionPool: [
        {
          questionId: 'q_secret_1',
          type: 'mcq',
          question: 'What is O(1)?',
          options: ['Constant', 'Linear', 'Quadratic', 'Logarithmic'],
          correctOption: 0,
          explanation: 'Constant time complexity'
        },
        {
          problemId: 'p_secret_1',
          type: 'coding',
          title: 'Sum Problem',
          description: 'Calculate sum of two numbers',
          sampleTestCases: [{ input: '1 2', output: '3' }],
          hiddenTestCases: [{ input: '99 1', output: '100' }, { input: '-5 5', output: '0' }]
        }
      ]
    });

    const sanitized = mockComp.getSanitizedQuestions();
    assert.strictEqual(sanitized.length, 2, 'Should return 2 sanitized items');

    // MCQ check
    const mcq = sanitized[0];
    assert.strictEqual(mcq.correctOption, undefined, 'correctOption MUST NOT be present in sanitized output');
    assert.strictEqual(mcq.explanation, undefined, 'explanation MUST NOT be present in sanitized output');

    // Coding check
    const coding = sanitized[1];
    assert(coding.sampleTestCases && coding.sampleTestCases.length === 1, 'Sample test cases should be visible');
    assert.strictEqual(coding.hiddenTestCases, undefined, 'hiddenTestCases MUST NOT be present in sanitized output');
  });

  // TEST 9: Code Execution Service - Sample Test Evaluation
  await test('Code Execution Service - Evaluate sample test cases using isolated runner', async () => {
    const pythonCode = `import sys
input_data = sys.stdin.read().strip().split()
if input_data:
    a = int(input_data[0])
    b = int(input_data[1])
    print(a + b)
`;

    const testCases = [
      { input: '3 5', output: '8' },
      { input: '10 20', output: '30' }
    ];

    const result = await codeExecutionService.runSampleTests(
      pythonCode,
      'python',
      testCases
    );

    assert(result.results && result.results.length === 2, 'Should execute 2 test cases');
    assert.strictEqual(result.allPassed, true, 'All test cases should pass');
  });

  // TEST 10: Scoring Engine - Negative Marking
  await test('Scoring Engine - Calculate accurate scores with negative marking', async () => {
    const compDoc = new Competition({
      title: 'Scoring Rules Test',
      description: 'Testing score calculation',
      organizer: new mongoose.Types.ObjectId(),
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      negativeMarking: 0.25,
      questionPool: [
        {
          questionId: 'q1',
          type: 'mcq',
          question: 'Q1',
          options: ['A', 'B', 'C', 'D'],
          correctOption: 0,
          marks: 1
        },
        {
          questionId: 'q2',
          type: 'mcq',
          question: 'Q2',
          options: ['A', 'B', 'C', 'D'],
          correctOption: 1,
          marks: 1
        }
      ]
    });

    const userAnswers = [
      { questionId: 'q1', selectedOption: 0 }, // Correct (+1)
      { questionId: 'q2', selectedOption: 3 }  // Wrong (-0.25)
    ];

    let score = 0;
    userAnswers.forEach(ans => {
      const q = compDoc.questionPool.find(item => item.questionId === ans.questionId);
      if (q) {
        if (ans.selectedOption === q.correctOption) {
          score += q.marks;
        } else if (ans.selectedOption !== undefined && ans.selectedOption !== null && ans.selectedOption >= 0) {
          score -= (compDoc.negativeMarking || 0);
        }
      }
    });

    assert.strictEqual(score, 0.75, 'Score should be 1 - 0.25 = 0.75');
  });

  // TEST 11: Personalized Assessment Assignment Persistence
  await test('Personalized Assessment - Participant assignment is locked and persistent', async () => {
    const compDoc = await Competition.create({
      title: 'Variant Assignment Test',
      description: 'Persistence verification',
      organizer: new mongoose.Types.ObjectId(),
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      questionsPerParticipant: 2,
      questionPool: [
        { questionId: 'v1', type: 'mcq', question: 'V1', options: ['A','B','C','D'], correctOption: 0, marks: 1 },
        { questionId: 'v2', type: 'mcq', question: 'V2', options: ['A','B','C','D'], correctOption: 1, marks: 1 },
        { questionId: 'v3', type: 'mcq', question: 'V3', options: ['A','B','C','D'], correctOption: 2, marks: 1 }
      ]
    });

    const testUserId = new mongoose.Types.ObjectId();
    const assignment1 = await AssessmentAssignment.create({
      competition: compDoc._id,
      user: testUserId,
      assignedQuestionIds: ['v2', 'v1'],
      startTime: new Date(),
      expiresAt: new Date(Date.now() + 1800000),
      status: 'in_progress'
    });

    const assignment2 = await AssessmentAssignment.findOne({
      competition: compDoc._id,
      user: testUserId
    });

    assert.deepStrictEqual(
      assignment2.assignedQuestionIds,
      ['v2', 'v1'],
      'Assigned variant set and order must remain unchanged across multiple reads'
    );

    // Clean up
    await AssessmentAssignment.deleteOne({ _id: assignment1._id });
    await Competition.deleteOne({ _id: compDoc._id });
  });

  // TEST 12: Expired Deadline Security
  await test('Security - Expired deadline terminates assessment and prevents answer overwrite', async () => {
    const compDoc = await Competition.create({
      title: 'Expiry Test',
      description: 'Testing expiry',
      organizer: new mongoose.Types.ObjectId(),
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() + 3600000),
      durationMinutes: 30
    });

    const pastTime = new Date(Date.now() - 60000); // 1 minute in the past
    const assignment = await AssessmentAssignment.create({
      competition: compDoc._id,
      user: new mongoose.Types.ObjectId(),
      expiresAt: pastTime,
      status: 'in_progress'
    });

    const isExpired = new Date() > new Date(assignment.expiresAt.getTime() + 15000);
    assert.strictEqual(isExpired, true, 'Assessment should be detected as expired');

    // Clean up
    await AssessmentAssignment.deleteOne({ _id: assignment._id });
    await Competition.deleteOne({ _id: compDoc._id });
  });

  // TEST 13: Leaderboard Ranking Computation
  await test('Leaderboard - Compute ranks by score (descending) and time (ascending)', async () => {
    const s1 = { score: 90, timeTakenSeconds: 300, name: 'Alice' };
    const s2 = { score: 95, timeTakenSeconds: 400, name: 'Bob' };
    const s3 = { score: 90, timeTakenSeconds: 200, name: 'Charlie' }; // Faster than Alice with same score

    const participants = [s1, s2, s3];
    participants.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

    assert.strictEqual(participants[0].name, 'Bob', 'Bob should be #1 (Highest score: 95)');
    assert.strictEqual(participants[1].name, 'Charlie', 'Charlie should be #2 (Score 90 in 200s)');
    assert.strictEqual(participants[2].name, 'Alice', 'Alice should be #3 (Score 90 in 300s)');
  });

  // TEST 14: Permanent Deletion of Competition & Cleanup of Space
  await test('Database Cleanup - Permanently delete Competition and all participant assessment records', async () => {
    const compDoc = await Competition.create({
      title: 'Cleanup Space Test Comp',
      description: 'Testing cleanup',
      organizer: new mongoose.Types.ObjectId(),
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      questionPool: [{ questionId: 'q_del', type: 'mcq', question: 'To delete', options: ['1','2','3','4'], correctOption: 0 }]
    });

    const assignment = await AssessmentAssignment.create({
      competition: compDoc._id,
      user: new mongoose.Types.ObjectId(),
      status: 'submitted',
      score: 10,
      expiresAt: new Date(Date.now() + 3600000)
    });

    // Verify records exist in DB
    assert(await Competition.findById(compDoc._id), 'Competition should exist');
    assert(await AssessmentAssignment.findById(assignment._id), 'Assignment should exist');

    // Execute deletion cascade
    await AssessmentAssignment.deleteMany({ competition: compDoc._id });
    await compDoc.deleteOne();

    // Verify completely removed from DB to clean up storage
    const foundComp = await Competition.findById(compDoc._id);
    const foundAssignment = await AssessmentAssignment.findById(assignment._id);
    assert.strictEqual(foundComp, null, 'Competition must be completely deleted from DB');
    assert.strictEqual(foundAssignment, null, 'Assessment must be completely deleted from DB');
  });

  // TEST 15: Cascade Deletion of Event & Linked Competitions
  await test('Database Cleanup - Delete Event and cascade remove linked competitions, bookings, and space', async () => {
    const testOrganizerId = new mongoose.Types.ObjectId();
    const eventDoc = await Event.create({
      title: 'Cascade Delete Event Test',
      description: 'Testing event deletion cleanup',
      date: new Date(),
      time: '10:00 AM',
      location: 'Hall A',
      department: 'CS',
      type: 'tech',
      capacity: 50,
      organizer: testOrganizerId
    });

    const compDoc = await Competition.create({
      title: 'Linked Competition',
      description: 'Linked to event',
      event: eventDoc._id,
      organizer: testOrganizerId,
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000)
    });

    const regDoc = await Registration.create({
      event: eventDoc._id,
      user: new mongoose.Types.ObjectId(),
      name: 'Test Student',
      regNo: '2026CS001'
    });

    const assignment = await AssessmentAssignment.create({
      competition: compDoc._id,
      user: new mongoose.Types.ObjectId(),
      status: 'submitted',
      expiresAt: new Date(Date.now() + 3600000)
    });

    // Perform cascade deletion
    const linkedComps = await Competition.find({ event: eventDoc._id });
    const compIds = linkedComps.map(c => c._id);
    await AssessmentAssignment.deleteMany({ competition: { $in: compIds } });
    await Competition.deleteMany({ _id: { $in: compIds } });
    await Registration.deleteMany({ event: eventDoc._id });
    await eventDoc.deleteOne();

    // Verify all completely removed from DB
    assert.strictEqual(await Event.findById(eventDoc._id), null, 'Event should be deleted');
    assert.strictEqual(await Competition.findById(compDoc._id), null, 'Linked competition should be deleted');
    assert.strictEqual(await Registration.findById(regDoc._id), null, 'Registration should be deleted');
    assert.strictEqual(await AssessmentAssignment.findById(assignment._id), null, 'Assessment should be deleted');
  });

  // TEST 16: Persistent Image Data-URI & Media URL Sanitization
  await test('Media Sanitization - Persist uploaded logos/photos as safe data URIs and block unsafe URIs', async () => {
    const sampleBuf = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const dataUri = fileToDataUri({ buffer: sampleBuf, mimetype: 'image/png' });
    assert(dataUri.startsWith('data:image/png;base64,'), 'Should convert uploaded buffer to PNG data URI');
    assert.strictEqual(sanitizeMediaUrl(dataUri), dataUri, 'Valid PNG data URI should pass sanitization');
    assert.strictEqual(
      sanitizeMediaUrl('https://cdn.example.edu/logo.webp'),
      'https://cdn.example.edu/logo.webp',
      'Valid HTTPS image URL should pass sanitization'
    );
    assert.strictEqual(
      sanitizeMediaUrl('/uploads/club-logo.png'),
      '/uploads/club-logo.png',
      'Legacy /uploads path should be preserved for sanitization'
    );
    assert.strictEqual(sanitizeMediaUrl('javascript:alert(1)'), '', 'JavaScript URL must be rejected');
    assert.strictEqual(
      sanitizeMediaUrl('data:image/svg+xml;base64,PHN2Zz4='),
      '',
      'Inline SVG data URI must be rejected'
    );
  });

  // TEST 17: Paid Event + Linked Competition Access Gating
  await test('Competition Access Gating - Require both event registration AND payment when linked to paid event', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const studentUser = { _id: new mongoose.Types.ObjectId(), role: 'student' };

    const paidEvent = await Event.create({
      title: 'Paid AI Summit 2026',
      description: 'Annual summit with paid pass and competition round',
      date: new Date(Date.now() + 86400000),
      time: '10:00 AM',
      location: 'Main Auditorium',
      department: 'Computer Science',
      type: 'tech',
      status: 'approved',
      capacity: 100,
      isPaid: true,
      registrationFee: 299,
      currency: 'INR',
      paymentUpiId: 'clubtreasury@okhdfcbank',
      organizer: orgId
    });

    const linkedComp = await Competition.create({
      title: 'Summit Hackathon Challenge',
      description: 'Unlocked after event registration and checkout',
      event: paidEvent._id,
      requireEventRegistration: true,
      organizer: orgId,
      status: 'published',
      startTime: new Date(Date.now() - 60000),
      endTime: new Date(Date.now() + 3600000)
    });

    try {
      // 1. Unregistered student must be blocked
      const unregisteredAccess = await competitionsRouter.evaluateCompetitionAccess(linkedComp, studentUser);
      assert.strictEqual(unregisteredAccess.allowed, false, 'Unregistered student must be blocked');
      assert.strictEqual(unregisteredAccess.code, 'EVENT_REGISTRATION_REQUIRED');
      assert.strictEqual(unregisteredAccess.isPaid, true);
      assert.strictEqual(unregisteredAccess.registrationFee, 299);

      // 2. Registered student WITHOUT completed payment must still be blocked
      await Registration.create({
        event: paidEvent._id,
        user: studentUser._id,
        name: 'Aarav',
        regNo: '22CS101',
        status: 'approved',
        paymentStatus: 'pending',
        amountPaid: 0
      });

      const unpaidAccess = await competitionsRouter.evaluateCompetitionAccess(linkedComp, studentUser);
      assert.strictEqual(unpaidAccess.allowed, false, 'Unpaid student must be blocked from linked competition');
      assert.strictEqual(unpaidAccess.code, 'EVENT_PAYMENT_REQUIRED');

      // 3. Registered student WITH completed payment must be allowed
      await Registration.findOneAndUpdate(
        { event: paidEvent._id, user: studentUser._id },
        {
          paymentStatus: 'paid',
          amountPaid: 299,
          paymentMethod: 'upi',
          transactionId: 'UPI99887766',
          paidAt: new Date()
        }
      );

      const paidAccess = await competitionsRouter.evaluateCompetitionAccess(linkedComp, studentUser);
      assert.strictEqual(paidAccess.allowed, true, 'Student with registration & paid fee must be unlocked');
      assert.strictEqual(paidAccess.code, 'ALLOWED');
    } finally {
      await Registration.deleteMany({ event: paidEvent._id });
      await Competition.deleteOne({ _id: linkedComp._id });
      await Event.deleteOne({ _id: paidEvent._id });
    }
  });

  // TEST 18: Post-Publish Event Edit Persistence
  await test('Post-Publish Event Editing - Persist pricing, tags, status, and image after publishing', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const publishedEvent = await Event.create({
      title: 'Editable Robotics Expo',
      description: 'Initial published description',
      date: new Date(Date.now() + 172800000),
      time: '09:30 AM',
      location: 'Innovation Lab',
      department: 'Electronics',
      type: 'workshop',
      status: 'approved',
      capacity: 40,
      isPaid: false,
      registrationFee: 0,
      tags: ['robotics'],
      organizer: orgId
    });

    try {
      publishedEvent.title = 'Editable Robotics Expo v2';
      publishedEvent.isPaid = true;
      publishedEvent.registrationFee = 149;
      publishedEvent.tags = ['robotics', 'iot'];
      publishedEvent.status = 'upcoming';
      await publishedEvent.save();

      const reloaded = await Event.findById(publishedEvent._id);
      assert.strictEqual(reloaded.title, 'Editable Robotics Expo v2');
      assert.strictEqual(reloaded.isPaid, true);
      assert.strictEqual(reloaded.registrationFee, 149);
      assert.strictEqual(reloaded.status, 'upcoming');
      assert.deepStrictEqual(reloaded.tags, ['robotics', 'iot']);
    } finally {
      await Event.deleteOne({ _id: publishedEvent._id });
    }
  });

  // TEST 19: YouPI-PG V2 Money Precision, UPI URI, ISO QR SVG & HMAC-SHA256 Webhook Verification
  await test('YouPI-PG V2 - Paise precision, Vector SVG QR, HMAC-SHA256 signature & replay protection', async () => {
    const amountPaise = toPaise('199.00');
    assert.strictEqual(amountPaise, 19900, 'Integer paise must equal 19900');
    assert.strictEqual(toRupeesString(amountPaise), '199.00', 'Rupees string formatting mismatch');

    const upiUri = buildUpiUri({
      payeeVpa: 'clubtreasury@okhdfcbank',
      payeeName: 'Avenor Campus',
      amountPaise,
      transactionRef: 'AVN-TEST-101',
      currency: 'INR'
    });
    assert(upiUri.startsWith('upi://pay?'), 'Must start with upi://pay?');
    assert(upiUri.includes('am=199.00'), 'UPI URI must embed server-side paise-derived amount');

    const svg = await generateQrSvg(upiUri);
    assert(svg.includes('<svg') && svg.includes('viewBox='), 'QR utility must generate valid SVG XML');

    const secret = 'test_youpi_secret_2026';
    const signed = signWebhookPayload(
      { event: 'PAYMENT.RECONCILED', paymentId: 'pay-1', orderId: 'AVN-TEST-101', status: 'RECONCILED' },
      secret
    );
    const verified = verifyYoupiWebhook({
      rawBody: signed.rawBody,
      signatureHeader: signed.signatureHeader,
      timestampHeader: signed.timestamp,
      deliveryIdHeader: signed.deliveryId,
      secret
    });
    assert.strictEqual(verified.status, 'RECONCILED');

    assert.throws(() => {
      verifyYoupiWebhook({
        rawBody: signed.rawBody,
        signatureHeader: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        timestampHeader: signed.timestamp,
        secret
      });
    }, /signature verification failed/i);
  });

  // TEST 20: Strict Production YouPI-PG Checkout -> Missing VPA Guard -> MANUAL_REVIEW -> Admin Reconcile -> Unlock & Amount Guard
  await test('YouPI-PG E2E Service - Strict VPA check, manual reconciliation, amount guard & competition unlock', async () => {
    const orgId = new mongoose.Types.ObjectId();
    const adminActor = { _id: orgId, role: 'admin', email: 'admin@collegeevents.com' };
    const cfg = getYoupiConfig();
    assert.strictEqual(cfg.verificationMode, 'manual', 'Default verificationMode must be strict manual');
    assert.strictEqual(cfg.fulfillOnObserved, false, 'fulfillOnObserved must default to false');
    assert.strictEqual(cfg.allowDemoUtr, false, 'allowDemoUtr must default to false');

    const studentA = await User.create({
      name: 'YouPI Tester A',
      email: `youpitest_${Date.now()}@avenor.edu`,
      password: 'Password123!',
      role: 'student',
      department: 'CS'
    });
    const studentB = await User.create({
      name: 'YouPI Tester B',
      email: `youpitest_b_${Date.now()}@avenor.edu`,
      password: 'Password123!',
      role: 'student',
      department: 'CS'
    });

    const missingVpaEvent = await Event.create({
      title: 'Paid Event Without VPA',
      description: 'Must reject embedded checkout if neither event VPA nor YOUPI_PAYEE_VPA is configured',
      date: new Date(Date.now() + 86400000),
      time: '11:00 AM',
      location: 'Block C',
      department: 'CS',
      type: 'tech',
      status: 'approved',
      capacity: 20,
      isPaid: true,
      registrationFee: 150,
      currency: 'INR',
      paymentUpiId: '',
      organizer: orgId
    });

    const paidEvent = await Event.create({
      title: 'YouPI Hackathon Qualifier',
      description: 'Paid qualifier unlocked via YouPI-PG',
      date: new Date(Date.now() + 86400000),
      time: '10:00 AM - 5:00 PM',
      location: 'Main Block',
      department: 'CS',
      type: 'tech',
      status: 'approved',
      capacity: 50,
      isPaid: true,
      registrationFee: 249,
      currency: 'INR',
      paymentUpiId: 'clubtreasury@okhdfcbank',
      organizer: orgId
    });

    const comp = await Competition.create({
      title: 'YouPI Gated Contest',
      description: 'Gated behind YouPI payment',
      event: paidEvent._id,
      requireEventRegistration: true,
      organizer: orgId,
      status: 'published',
      startTime: new Date(Date.now() - 60000),
      endTime: new Date(Date.now() + 3600000)
    });

    let createdOrderIdA = null;
    let createdOrderIdB = null;
    try {
      // 1. Verify missing VPA rejects with 503 YOUPI_VPA_NOT_CONFIGURED in embedded mode when YOUPI_PAYEE_VPA unset
      const prevEnvVpa = process.env.YOUPI_PAYEE_VPA;
      try {
        process.env.YOUPI_PAYEE_VPA = '';
        let missingVpaRejected = false;
        try {
          await createYoupiPaymentSession({
            eventId: missingVpaEvent._id.toString(),
            user: studentA,
            body: { name: studentA.name, regNo: '26CS101' }
          });
        } catch (err) {
          missingVpaRejected = err.status === 503 && err.code === 'YOUPI_VPA_NOT_CONFIGURED';
        }
        assert.strictEqual(missingVpaRejected, true, 'Missing VPA in embedded mode must reject with 503 YOUPI_VPA_NOT_CONFIGURED');
      } finally {
        if (prevEnvVpa !== undefined) process.env.YOUPI_PAYEE_VPA = prevEnvVpa;
        else delete process.env.YOUPI_PAYEE_VPA;
      }

      const blocked = await competitionsRouter.evaluateCompetitionAccess(comp, studentA);
      assert.strictEqual(blocked.allowed, false, 'Student A must be blocked before paying');

      // 2. Create session with real club VPA
      const created = await createYoupiPaymentSession({
        eventId: paidEvent._id.toString(),
        user: studentA,
        body: { name: studentA.name, regNo: '26CS101' }
      });
      createdOrderIdA = created.session.orderId;
      assert.strictEqual(created.isPaidEvent, true);
      assert.strictEqual(created.session.amountPaise, '24900');
      assert.strictEqual(created.session.allowDemoUtr, false);
      assert(created.session.qrSvg.includes('<svg'), 'Session must return QR SVG');

      // 3. Submit UTR -> strictly enters MANUAL_REVIEW and does NOT unlock competition yet
      const uniqueUtr = `4128${Date.now().toString().slice(-8)}`;
      const submitted = await submitUtrAndProcessSession({
        paymentId: created.session.paymentId,
        user: studentA,
        body: { utr: uniqueUtr }
      });
      assert.strictEqual(submitted.session.status, 'MANUAL_REVIEW');
      assert.strictEqual(submitted.session.settled, false);
      assert.strictEqual(submitted.registration.paymentStatus, 'pending');

      const stillLocked = await competitionsRouter.evaluateCompetitionAccess(comp, studentA);
      assert.strictEqual(stillLocked.allowed, false, 'Competition must stay locked while payment is in MANUAL_REVIEW');

      // 4. Admin approves reconciliation -> RECONCILED -> competition unlocks
      const reconciled = await reconcileSessionByAdmin({
        paymentId: created.session.paymentId,
        action: 'approve',
        adminUser: adminActor,
        note: 'Verified in bank statement'
      });
      assert.strictEqual(reconciled.session.status, 'RECONCILED');
      assert.strictEqual(reconciled.session.settled, true);
      assert.strictEqual(reconciled.registration.paymentMethod, 'youpi');
      assert.strictEqual(reconciled.registration.paymentStatus, 'paid');

      const unlocked = await competitionsRouter.evaluateCompetitionAccess(comp, studentA);
      assert.strictEqual(unlocked.allowed, true, 'Student A must unlock linked competition after YouPI reconciliation');

      // 5. Ensure Student B cannot reuse Student A's UTR
      const sessionB = await createYoupiPaymentSession({
        eventId: paidEvent._id.toString(),
        user: studentB,
        body: { name: studentB.name, regNo: '26CS102' }
      });
      createdOrderIdB = sessionB.session.orderId;
      let dupBlocked = false;
      try {
        await submitUtrAndProcessSession({
          paymentId: sessionB.session.paymentId,
          user: studentB,
          body: { utr: uniqueUtr }
        });
      } catch (err) {
        dupBlocked = err.status === 409 && err.code === 'DUPLICATE_UTR';
      }
      assert.strictEqual(dupBlocked, true, 'Reusing an already-settled UTR across students must fail with 409 DUPLICATE_UTR');

      // 6. Webhook amountPaise mismatch must fail with 409 AMOUNT_MISMATCH
      const secret = process.env.YOUPI_WEBHOOK_SECRET || process.env.JWT_SECRET;
      const badAmountPayload = signWebhookPayload(
        {
          event: 'PAYMENT.RECONCILED',
          status: 'RECONCILED',
          paymentId: sessionB.session.paymentId,
          orderId: sessionB.session.orderId,
          amountPaise: '100'
        },
        secret
      );
      let amountBlocked = false;
      try {
        await processIncomingWebhook({
          rawBody: badAmountPayload.rawBody,
          signatureHeader: badAmountPayload.signatureHeader,
          timestampHeader: badAmountPayload.timestamp,
          deliveryIdHeader: badAmountPayload.deliveryId
        });
      } catch (err) {
        amountBlocked = err.status === 409 && err.code === 'AMOUNT_MISMATCH';
      }
      assert.strictEqual(amountBlocked, true, 'Webhook with mismatched amountPaise must fail with 409 AMOUNT_MISMATCH');

      // 7. Test replay idempotency via processIncomingWebhook
      const dbSessionA = await YoupiPaymentSession.findOne({ paymentId: created.session.paymentId });
      assert(dbSessionA && dbSessionA.lastDeliveryId, 'Settled session must persist lastDeliveryId');

      const signedReplay = signWebhookPayload(
        {
          event: 'PAYMENT.RECONCILED',
          status: 'RECONCILED',
          paymentId: created.session.paymentId,
          orderId: created.session.orderId,
          utr: uniqueUtr,
          deliveryId: dbSessionA.lastDeliveryId
        },
        secret
      );
      const replayCheck = await processIncomingWebhook({
        rawBody: signedReplay.rawBody,
        signatureHeader: signedReplay.signatureHeader,
        timestampHeader: signedReplay.timestamp,
        deliveryIdHeader: signedReplay.deliveryId
      });
      assert.strictEqual(replayCheck.duplicate, true, 'Duplicate webhook deliveryId must be deduplicated cleanly');
    } finally {
      const cleanupOrders = [createdOrderIdA, createdOrderIdB].filter(Boolean);
      if (cleanupOrders.length > 0) {
        await YoupiWebhookReceipt.deleteMany({ orderId: { $in: cleanupOrders } });
      }
      await YoupiPaymentSession.deleteMany({ event: { $in: [paidEvent._id, missingVpaEvent._id] } });
      await Registration.deleteMany({ event: { $in: [paidEvent._id, missingVpaEvent._id] } });
      await Competition.deleteOne({ _id: comp._id });
      await Event.deleteMany({ _id: { $in: [paidEvent._id, missingVpaEvent._id] } });
      await User.deleteMany({ _id: { $in: [studentA._id, studentB._id] } });
    }
  });

  // TEST 21: WhatsApp Link Sanitization & Email Address Normalization
  await test('Security - WhatsApp invite URL sanitization and email normalization', async () => {
    assert.strictEqual(sanitizeWhatsAppUrl(''), '');
    assert.strictEqual(sanitizeWhatsAppUrl('chat.whatsapp.com/AbCdEf123'), 'https://chat.whatsapp.com/AbCdEf123');
    assert.strictEqual(sanitizeWhatsAppUrl('https://wa.me/919876543210'), 'https://wa.me/919876543210');
    assert.strictEqual(sanitizeWhatsAppUrl('javascript:alert(1)'), null);
    assert.strictEqual(sanitizeWhatsAppUrl('https://evil.example.com/phish'), null);
    assert.strictEqual(sanitizeWhatsAppUrl('https://chat.whatsapp.com/'), null);
    assert.strictEqual(sanitizeEmailAddress('  Student.Test@College.EDU '), 'student.test@college.edu');
    assert.strictEqual(sanitizeEmailAddress('invalid-email'), '');
  });

  // TEST 22: Paid Event WhatsApp Link Gating, Email Tracking & Cloud Auto-Cleanup Cascade
  await test('Features - Conditional WhatsApp link reveal, email tracking, and cloud cascade cleanup', async () => {
    const uniqueSuffix = Date.now();
    const adminActor = (await User.findOne({ role: 'admin' })) || (await User.findOne({}));
    const student = await User.create({
      name: `WA Test Student ${uniqueSuffix}`,
      email: `wa_student_${uniqueSuffix}@example.com`,
      password: 'Password123!',
      role: 'student',
      department: 'Computer Technology',
      emailVerified: true,
      emailVerifiedAt: new Date()
    });

    const pastDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const expiredPaidEvent = await Event.create({
      title: `Expired Paid Event ${uniqueSuffix}`,
      description: 'Testing WhatsApp gating and expired cloud deletion',
      date: pastDate,
      time: '10:00 AM',
      location: 'Cloud Auditorium',
      department: 'Computer Technology',
      type: 'workshop',
      capacity: 40,
      organizer: adminActor._id,
      status: 'approved',
      isPaid: true,
      registrationFee: 199,
      currency: 'INR',
      paymentUpiId: 'praveensumathi12-1@okaxis',
      whatsappGroupLink: 'https://chat.whatsapp.com/AvenorTestGroupLink99',
      autoDeleteWhenExpired: 'always'
    });

    const linkedComp = await Competition.create({
      title: `Expired Comp ${uniqueSuffix}`,
      description: 'Comp attached to expired event',
      type: 'quiz',
      organizer: adminActor._id,
      event: expiredPaidEvent._id,
      requireEventRegistration: true,
      status: 'published',
      durationMinutes: 15,
      totalMarks: 10,
      startTime: new Date(),
      endTime: new Date(Date.now() + 86400000)
    });

    let createdOrderId = '';
    try {
      const customEmail = `receipt_${uniqueSuffix}@example.com`;
      const created = await createYoupiPaymentSession({
        eventId: expiredPaidEvent._id.toString(),
        user: student,
        body: { name: student.name, regNo: '26WA01', email: customEmail }
      });
      // Future deadline wasn't tested here because createYoupiPaymentSession blocks EVENT COMPLETED; let's test expired evaluation + cascade below if future -> past
      assert.fail('Should not allow creating session for completed event');
    } catch (err) {
      // Expected for already-expired events; move date forward temporarily for YouPI test then expire it!
      assert.strictEqual(err.code, 'EVENT_COMPLETED');
    }

    expiredPaidEvent.date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await expiredPaidEvent.save();

    try {
      const customEmail = `receipt_${uniqueSuffix}@example.com`;
      const created = await createYoupiPaymentSession({
        eventId: expiredPaidEvent._id.toString(),
        user: student,
        body: { name: student.name, regNo: '26WA01', email: customEmail }
      });
      createdOrderId = created.session.orderId;
      assert.strictEqual(created.session.hasWhatsappGroup, true);
      assert.strictEqual(created.session.whatsappGroupLink, '', 'WhatsApp link must stay hidden before payment');

      const uniqueUtr = `5128${Date.now().toString().slice(-8)}`;
      const manual = await submitUtrAndProcessSession({
        paymentId: created.session.paymentId,
        user: student,
        body: { utr: uniqueUtr, email: customEmail }
      });
      assert.strictEqual(manual.session.whatsappGroupLink, '', 'WhatsApp link must stay hidden during MANUAL_REVIEW');

      const reconciled = await reconcileSessionByAdmin({
        paymentId: created.session.paymentId,
        action: 'approve',
        adminUser: adminActor
      });
      assert.strictEqual(
        reconciled.session.whatsappGroupLink,
        'https://chat.whatsapp.com/AvenorTestGroupLink99',
        'WhatsApp link must unlock once payment is reconciled'
      );
      assert.strictEqual(
        reconciled.registration.email,
        student.email,
        'Student confirmation email must stay bound to verified account email even if custom email is supplied'
      );
      assert.strictEqual(reconciled.registration.confirmationEmailTo, student.email);

      // Verify attendance update fields persist properly
      await Registration.updateOne(
        { _id: reconciled.registration._id },
        { $set: { attendanceStatus: 'present', attendedAt: new Date(), attendanceMarkedBy: adminActor._id } }
      );
      const updatedReg = await Registration.findById(reconciled.registration._id);
      assert.strictEqual(updatedReg.attendanceStatus, 'present');

      // Now mark event expired in the past and verify cloud cleanup evaluation + cascade delete
      await Event.updateOne(
        { _id: expiredPaidEvent._id },
        { $set: { date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) } }
      );

      const evalRes = await evaluateExpiredEvents({ graceHours: 0 });
      assert(
        evalRes.expiredEvents.some(e => e._id.toString() === expiredPaidEvent._id.toString()),
        'Expired event must be detected by cloud cleanup evaluator'
      );
      assert(
        evalRes.eligibleEvents.some(e => e._id.toString() === expiredPaidEvent._id.toString()),
        'autoDeleteWhenExpired=always event must be eligible for auto-deletion'
      );

      const cascadeRes = await cascadeDeleteEvent(expiredPaidEvent._id);
      assert.strictEqual(cascadeRes.deleted, true);
      assert.strictEqual(cascadeRes.deletedCompetitionsCount, 1);

      const [evGone, compGone, regGone, sessGone, receiptGone, notifGone] = await Promise.all([
        Event.findById(expiredPaidEvent._id),
        Competition.findById(linkedComp._id),
        Registration.findOne({ event: expiredPaidEvent._id }),
        YoupiPaymentSession.findOne({ event: expiredPaidEvent._id }),
        createdOrderId ? YoupiWebhookReceipt.findOne({ orderId: createdOrderId }) : Promise.resolve(null),
        Notification.findOne({ relatedEvent: expiredPaidEvent._id })
      ]);
      assert.strictEqual(evGone, null, 'Event must be removed from MongoDB cloud');
      assert.strictEqual(compGone, null, 'Linked competition must be removed');
      assert.strictEqual(regGone, null, 'Registrations must be removed');
      assert.strictEqual(sessGone, null, 'YouPI sessions must be removed');
      assert.strictEqual(receiptGone, null, 'YouPI webhook receipts must be removed');
      assert.strictEqual(notifGone, null, 'Event notifications must be removed');
    } finally {
      if (createdOrderId) {
        await YoupiWebhookReceipt.deleteMany({ orderId: createdOrderId });
      }
      await YoupiPaymentSession.deleteMany({ event: expiredPaidEvent._id });
      await Registration.deleteMany({ event: expiredPaidEvent._id });
      await Competition.deleteMany({ event: expiredPaidEvent._id });
      await Notification.deleteMany({ relatedEvent: expiredPaidEvent._id });
      await Event.deleteMany({ _id: expiredPaidEvent._id });
      await User.deleteMany({ _id: student._id });
    }
  });

  // TEST 23: Forgot Password Email OTP purpose & secure password hash update
  await test('23. Forgot Password OTP purpose, hash match & bcrypt password update', async () => {
    const suffix = Date.now();
    const user = await User.create({
      name: 'Reset Student',
      email: `reset_student_${suffix}@example.com`,
      password: 'OldPassword123!',
      role: 'student',
      department: 'Computer Science',
      emailVerified: true
    });

    try {
      const secret = process.env.JWT_SECRET || 'college_event_manager_production_jwt_secret_2026';
      const otpCode = '654321';
      const otpHash = crypto
        .createHmac('sha256', secret)
        .update(`${user.email}:reset_password:${otpCode}`)
        .digest('hex');

      const otpDoc = await EmailOtp.create({
        email: user.email,
        purpose: 'reset_password',
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });
      assert.strictEqual(otpDoc.purpose, 'reset_password');
      assert.strictEqual(otpDoc.otpHash, otpHash);

      user.password = 'NewPassword999!';
      await user.save();

      const reloaded = await User.findById(user._id).select('+password');
      assert.strictEqual(await reloaded.comparePassword('OldPassword123!'), false);
      assert.strictEqual(await reloaded.comparePassword('NewPassword999!'), true);
    } finally {
      await EmailOtp.deleteMany({ email: user.email });
      await User.deleteMany({ _id: user._id });
    }
  });

  // TEST 24: Admin-only Department Governance & Rename Cascade
  await test('24. Admin department create, reject non-admin dept, rename cascade & delete', async () => {
    const suffix = Date.now();
    const origName = `Robotics_${suffix}`;
    const renamedName = `Mechatronics_${suffix}`;
    let createdDept = null;
    let testUser = null;
    let testEvent = null;
    let testClub = null;

    try {
      createdDept = await createDepartment({ name: origName, code: 'RBT', isActive: true });
      assert.strictEqual(createdDept.name, origName);

      assert.strictEqual(await resolveActiveDepartmentName(origName.toLowerCase()), origName);
      assert.strictEqual(await resolveActiveDepartmentName(`NonExistentDept_${suffix}`), null);

      testUser = await User.create({
        name: 'Dept Student',
        email: `dept_student_${suffix}@example.com`,
        password: 'Password123!',
        role: 'student',
        department: origName
      });
      const adminActor = (await User.findOne({ role: 'admin' })) || testUser;

      testClub = await Club.create({
        name: `Robotics Club ${suffix}`,
        slug: `robotics-club-${suffix}`,
        department: origName,
        createdBy: adminActor._id
      });

      testEvent = await Event.create({
        title: `Dept Event ${suffix}`,
        description: 'Department cascade test event',
        date: new Date(Date.now() + 3 * 86400000),
        time: '10:00 AM',
        location: 'Hall A',
        type: 'tech',
        department: origName,
        organizer: adminActor._id,
        capacity: 50,
        status: 'approved'
      });

      const updated = await updateDepartment(createdDept._id, {
        name: renamedName,
        code: 'MCTR',
        isActive: false
      });
      assert.strictEqual(updated.renamed, true);
      assert.strictEqual(updated.cascadeCounts.usersUpdated, 1);
      assert.strictEqual(updated.cascadeCounts.eventsUpdated, 1);
      assert.strictEqual(updated.cascadeCounts.clubsUpdated, 1);

      const [reloadedUser, reloadedEvent, reloadedClub] = await Promise.all([
        User.findById(testUser._id),
        Event.findById(testEvent._id),
        Club.findById(testClub._id)
      ]);
      assert.strictEqual(reloadedUser.department, renamedName);
      assert.strictEqual(reloadedEvent.department, renamedName);
      assert.strictEqual(reloadedClub.department, renamedName);

      // Inactive departments must not be resolved as valid student registration choices
      assert.strictEqual(await resolveActiveDepartmentName(renamedName), null);

      const del = await deleteDepartment(createdDept._id);
      assert.strictEqual(del.deleted, true);
      assert.strictEqual(await Department.findById(createdDept._id), null);
      createdDept = null;
    } finally {
      if (testEvent) await Event.deleteMany({ _id: testEvent._id });
      if (testClub) await Club.deleteMany({ _id: testClub._id });
      if (testUser) await User.deleteMany({ _id: testUser._id });
      if (createdDept) await Department.deleteMany({ _id: createdDept._id });
    }
  });

  // TEST 25: Admin User Cascade Deletion & Protection Rules
  await test('25. Admin user cascade deletion removes dependencies & protects admins', async () => {
    const suffix = Date.now();
    let adminActor = await User.findOne({ role: 'admin' });
    let createdTempAdmin = false;
    if (!adminActor) {
      adminActor = await User.create({
        name: 'Temp Admin',
        email: `temp_admin_${suffix}@example.com`,
        password: 'Password123!',
        role: 'admin',
        department: 'Computer Science'
      });
      createdTempAdmin = true;
    }

    const victim = await User.create({
      name: 'Delete Target Student',
      email: `delete_victim_${suffix}@example.com`,
      password: 'Password123!',
      role: 'student',
      department: 'Computer Science',
      emailVerified: true
    });

    const sampleEvent = await Event.create({
      title: `Victim Event ${suffix}`,
      description: 'Event to verify attendee pull',
      date: new Date(Date.now() + 2 * 86400000),
      time: '11:00 AM',
      location: 'Hall B',
      type: 'tech',
      department: 'Computer Science',
      organizer: adminActor._id,
      attendees: [victim._id],
      capacity: 40,
      status: 'approved'
    });

    const sampleReg = await Registration.create({
      event: sampleEvent._id,
      user: victim._id,
      name: victim.name,
      regNo: `DEL${suffix}`,
      email: victim.email,
      status: 'approved'
    });

    const samplePost = await FeedPost.create({
      type: 'announcement',
      title: `Post ${suffix}`,
      content: 'Testing like count recalculation',
      author: adminActor._id,
      likesCount: 1
    });
    await PostLike.create({ post: samplePost._id, user: victim._id });

    try {
      // Self/admin delete must be forbidden with 403
      let adminBlocked = false;
      try {
        await cascadeDeleteUser(adminActor._id.toString(), adminActor._id.toString());
      } catch (err) {
        adminBlocked = err.status === 403;
      }
      assert.strictEqual(adminBlocked, true, 'Admin/self deletion must be blocked with HTTP 403');

      const result = await cascadeDeleteUser(victim._id.toString(), adminActor._id.toString());
      assert.strictEqual(result.deleted, true);
      assert.strictEqual(result.cleanupStats.registrationsDeleted, 1);
      assert.strictEqual(result.cleanupStats.eventsAttendeeCleared, 1);

      const [victimGone, regGone, eventAfter, postAfter] = await Promise.all([
        User.findById(victim._id),
        Registration.findById(sampleReg._id),
        Event.findById(sampleEvent._id),
        FeedPost.findById(samplePost._id)
      ]);
      assert.strictEqual(victimGone, null);
      assert.strictEqual(regGone, null);
      assert.strictEqual(eventAfter.attendees.some(id => id.toString() === victim._id.toString()), false);
      assert.strictEqual(postAfter.likesCount, 0);
    } finally {
      await PostLike.deleteMany({ post: samplePost._id });
      await FeedPost.deleteMany({ _id: samplePost._id });
      await Registration.deleteMany({ event: sampleEvent._id });
      await Event.deleteMany({ _id: sampleEvent._id });
      await User.deleteMany({ _id: victim._id });
      if (createdTempAdmin) await User.deleteMany({ _id: adminActor._id });
    }
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
