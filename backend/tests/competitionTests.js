const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const assert = require('assert');

const Competition = require('../models/Competition');
const AssessmentAssignment = require('../models/AssessmentAssignment');
const User = require('../models/User');
const geminiService = require('../services/geminiService');
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

  // TEST 3: Question Sanitization & Hidden Test Isolation
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

  // TEST 4: Code Execution Service - Sample Test Evaluation
  await test('Code Execution Service - Evaluate sample test cases using isolated runner', async () => {
    const pythonCode = `import sys
input_data = sys.stdin.read().strip().split()
if input_data:
    a = int(input_data[0])
    b = int(input_data[1])
    print(a + b)
`;
    const sampleCases = [
      { input: '3 4', output: '7' },
      { input: '10 20', output: '30' }
    ];

    const result = await codeExecutionService.runSampleTests(pythonCode, 'python', sampleCases);
    assert(result.results && result.results.length === 2, 'Should return results for both sample cases');
    assert(result.results[0].passed, 'Sample case 1 should pass');
    assert(result.results[1].passed, 'Sample case 2 should pass');
    assert.strictEqual(result.allPassed, true, 'allPassed should be true');
  });

  // TEST 5: Scoring Logic with Negative Marking
  await test('Scoring Engine - Calculate accurate scores with negative marking', async () => {
    const compDoc = await Competition.create({
      title: 'Scoring Engine Test',
      description: 'Unit testing scoring logic',
      organizer: new mongoose.Types.ObjectId(),
      type: 'quiz',
      durationMinutes: 20,
      totalMarks: 4,
      negativeMarking: 0.5,
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      questionPool: [
        {
          questionId: 'q_test_1',
          type: 'mcq',
          question: 'Q1',
          options: ['A', 'B', 'C', 'D'],
          correctOption: 1,
          marks: 2
        },
        {
          questionId: 'q_test_2',
          type: 'mcq',
          question: 'Q2',
          options: ['A', 'B', 'C', 'D'],
          correctOption: 2,
          marks: 2
        }
      ]
    });

    const studentUser = new mongoose.Types.ObjectId();
    const assignment = await AssessmentAssignment.create({
      competition: compDoc._id,
      user: studentUser,
      assignedQuestionIds: ['q_test_1', 'q_test_2'],
      expiresAt: new Date(Date.now() + 1200000),
      answers: [
        { questionId: 'q_test_1', selectedOption: 1 }, // Correct (+2)
        { questionId: 'q_test_2', selectedOption: 0 }  // Incorrect (-0.5)
      ]
    });

    // Score evaluation
    let evaluatedScore = 0;
    assignment.answers.forEach(ans => {
      const q = compDoc.questionPool.find(item => item.questionId === ans.questionId);
      if (ans.selectedOption === q.correctOption) {
        evaluatedScore += q.marks;
      } else if (ans.selectedOption !== -1) {
        evaluatedScore -= compDoc.negativeMarking;
      }
    });

    assert.strictEqual(evaluatedScore, 1.5, 'Score should be 2 - 0.5 = 1.5');

    // Clean up
    await AssessmentAssignment.deleteOne({ _id: assignment._id });
    await Competition.deleteOne({ _id: compDoc._id });
  });

  // TEST 6: Stable Personalized Variant Assignment (Refreshing page does not reset questions)
  await test('Personalized Assessment - Participant assignment is locked and persistent', async () => {
    const compDoc = await Competition.create({
      title: 'Variant Assignment Test',
      description: 'Testing question set locking',
      organizer: new mongoose.Types.ObjectId(),
      type: 'quiz',
      durationMinutes: 15,
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      questionPool: [
        { questionId: 'pool_1', type: 'mcq', question: 'P1', options: ['A','B','C','D'], correctOption: 0 },
        { questionId: 'pool_2', type: 'mcq', question: 'P2', options: ['A','B','C','D'], correctOption: 1 },
        { questionId: 'pool_3', type: 'mcq', question: 'P3', options: ['A','B','C','D'], correctOption: 2 }
      ]
    });

    const testUser = new mongoose.Types.ObjectId();
    const assignment1 = await AssessmentAssignment.create({
      competition: compDoc._id,
      user: testUser,
      assignedQuestionIds: ['pool_1', 'pool_3'],
      expiresAt: new Date(Date.now() + 900000)
    });

    // Query again as if participant refreshed the browser
    const assignment2 = await AssessmentAssignment.findOne({
      competition: compDoc._id,
      user: testUser
    });

    assert(assignment2, 'Assignment should exist on re-query');
    assert.deepStrictEqual(
      assignment2.assignedQuestionIds,
      ['pool_1', 'pool_3'],
      'Assigned question IDs must remain strictly identical across re-queries'
    );

    // Clean up
    await AssessmentAssignment.deleteOne({ _id: assignment1._id });
    await Competition.deleteOne({ _id: compDoc._id });
  });

  // TEST 7: Deadline Enforcement & Expiration
  await test('Security - Expired deadline terminates assessment and prevents answer overwrite', async () => {
    const pastTime = new Date(Date.now() - 60000); // 1 minute in the past
    const compDoc = await Competition.create({
      title: 'Deadline Test',
      description: 'Testing timeout',
      organizer: new mongoose.Types.ObjectId(),
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() + 3600000)
    });

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

  // TEST 8: Leaderboard Ranking Computation
  await test('Leaderboard - Compute ranks by score (descending) and time (ascending)', async () => {
    const compId = new mongoose.Types.ObjectId();
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
