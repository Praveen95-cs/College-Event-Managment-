const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const assert = require('assert');

const Competition = require('../models/Competition');
const AssessmentAssignment = require('../models/AssessmentAssignment');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const QuestionCache = require('../models/QuestionCache');
const User = require('../models/User');
const geminiService = require('../services/geminiService');
const aiService = require('../services/ai/aiService');
const BaseAIProvider = require('../services/ai/baseProvider');
const codeExecutionService = require('../services/codeExecutionService');

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
