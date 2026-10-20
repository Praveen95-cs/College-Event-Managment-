const mongoose = require('mongoose');
const GeminiProvider = require('./geminiProvider');
const GroqProvider = require('./groqProvider');
const QuestionCache = require('../../models/QuestionCache');

class AIService {
  constructor() {
    this.gemini = new GeminiProvider();
    this.groq = new GroqProvider();
    // Map of in-flight promises to eliminate duplicate backend calls
    this.inFlightRequests = new Map();
  }

  /**
   * Returns current active provider instance based on AI_PROVIDER environment variable.
   * Default: gemini
   */
  getProvider(providerName = null) {
    const selected = (providerName || process.env.AI_PROVIDER || 'gemini').toLowerCase().trim();
    if (selected === 'groq') {
      return this.groq;
    }
    return this.gemini;
  }

  /**
   * Returns health / status check for AI integration without exposing sensitive keys.
   */
  async getStatus() {
    const provider = this.getProvider();
    let verifiedModel = null;
    try {
      if (typeof provider.getVerifiedModel === 'function') {
        verifiedModel = await provider.getVerifiedModel();
      } else {
        verifiedModel = provider.defaultModel;
      }
    } catch {}

    const status = provider.getStatus();
    return {
      ok: true,
      provider: provider.name === 'groq' ? 'Groq Cloud API' : 'Google Gemini API',
      configuredProvider: provider.name,
      tier: 'Free Tier',
      verifiedModel: verifiedModel || 'gemini-3.5-flash',
      isConfigured: status.isConfigured,
      isQuotaExhausted: status.isQuotaExhausted,
      cooldownSeconds: status.cooldownSeconds
    };
  }

  /**
   * Helper to execute with in-flight deduplication.
   * If a request with identical signature is already processing, joins the existing Promise.
   */
  async executeWithDeduplication(dedupKey, taskFn) {
    if (this.inFlightRequests.has(dedupKey)) {
      console.log(`[aiService] In-flight request deduplicated for key: ${dedupKey}`);
      return this.inFlightRequests.get(dedupKey);
    }

    const promise = (async () => {
      try {
        return await taskFn();
      } finally {
        this.inFlightRequests.delete(dedupKey);
      }
    })();

    this.inFlightRequests.set(dedupKey, promise);
    return promise;
  }

  /**
   * Generates or fetches cached Quiz MCQs.
   */
  async generateQuizQuestions({
    prompt,
    topics = [],
    difficulty = 'medium',
    count = 5,
    marksPerQuestion = 1,
    forceFresh = false,
    competitionId = null
  }) {
    const targetCount = Math.min(Math.max(1, Number(count) || 5), 20);
    const dedupKey = `quiz_${competitionId || 'global'}_${(topics || []).sort().join('_')}_${difficulty}_${targetCount}`;

    return this.executeWithDeduplication(dedupKey, async () => {
      let finalQuestions = [];

      // Step 1: Check MongoDB QuestionCache unless forceFresh is requested
      if (!forceFresh && mongoose.connection.readyState === 1) {
        try {
          const cached = await QuestionCache.findMatching({
            type: 'mcq',
            topics,
            difficulty,
            limit: targetCount
          });

          if (cached && cached.length > 0) {
            finalQuestions = cached.map((c, idx) => ({
              ...c.data,
              questionId: `q_cached_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
              marks: marksPerQuestion
            }));
            console.log(`[aiService] Reused ${finalQuestions.length} cached MCQs from MongoDB.`);
          }
        } catch (dbErr) {
          console.warn('[aiService] Cache read error, continuing to AI generation:', dbErr.message);
        }
      }

      // If cache satisfied the entire requested count, return immediately without touching external AI!
      if (finalQuestions.length >= targetCount) {
        return {
          modelUsed: 'MongoDB QuestionBank (Cached)',
          questions: finalQuestions.slice(0, targetCount),
          fromCache: true
        };
      }

      // Step 2: Query AI provider for missing count
      const neededFromAI = targetCount - finalQuestions.length;
      const provider = this.getProvider();

      let aiResult;
      try {
        aiResult = await provider.generateQuizQuestions({
          prompt,
          topics,
          difficulty,
          count: neededFromAI,
          marksPerQuestion
        });
      } catch (primaryErr) {
        // Fallback to secondary provider if primary fails or quota is exhausted
        if (provider === this.gemini && this.groq.isConfigured() && !this.groq.isInCooldown()) {
          console.warn('[aiService] Gemini hit error/cooldown. Failing over to Groq provider...');
          aiResult = await this.groq.generateQuizQuestions({
            prompt,
            topics,
            difficulty,
            count: neededFromAI,
            marksPerQuestion
          });
        } else if (finalQuestions.length > 0) {
          // If we had some cached questions, return them rather than failing completely!
          console.warn('[aiService] Provider failed but partial cached questions exist. Returning cached questions.');
          return {
            modelUsed: 'MongoDB QuestionBank (Partial Cache)',
            questions: finalQuestions,
            fromCache: true,
            warning: primaryErr.message
          };
        } else {
          throw primaryErr;
        }
      }

      // Step 3: Save newly generated questions into MongoDB QuestionCache asynchronously
      if (mongoose.connection.readyState === 1 && aiResult.questions && aiResult.questions.length > 0) {
        aiResult.questions.forEach(q => {
          QuestionCache.cacheItem({
            type: 'mcq',
            topic: q.topic || topics[0] || 'General',
            difficulty: q.difficulty || difficulty,
            title: q.question?.slice(0, 80),
            data: q,
            source: provider.name
          }).catch(err => console.warn('[aiService] Cache save error:', err.message));
        });
      }

      const combined = [...finalQuestions, ...(aiResult.questions || [])];
      return {
        modelUsed: aiResult.modelUsed,
        questions: combined.slice(0, targetCount),
        fromCache: finalQuestions.length > 0
      };
    });
  }

  /**
   * Generates or fetches cached Algorithmic Coding Problems.
   */
  async generateCodingProblems({
    prompt,
    topics = [],
    difficulty = 'medium',
    count = 2,
    permittedLanguages = ['cpp', 'python', 'java', 'javascript'],
    marksPerProblem = 20,
    forceFresh = false,
    competitionId = null
  }) {
    const targetCount = Math.min(Math.max(1, Number(count) || 2), 5);
    const dedupKey = `coding_${competitionId || 'global'}_${(topics || []).sort().join('_')}_${difficulty}_${targetCount}`;

    return this.executeWithDeduplication(dedupKey, async () => {
      let finalProblems = [];

      // Step 1: Check MongoDB QuestionCache unless forceFresh
      if (!forceFresh && mongoose.connection.readyState === 1) {
        try {
          const cached = await QuestionCache.findMatching({
            type: 'coding',
            topics,
            difficulty,
            limit: targetCount
          });

          if (cached && cached.length > 0) {
            finalProblems = cached.map((c, idx) => ({
              ...c.data,
              problemId: `p_cached_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
              marks: marksPerProblem
            }));
            console.log(`[aiService] Reused ${finalProblems.length} cached Coding Problems from MongoDB.`);
          }
        } catch (dbErr) {
          console.warn('[aiService] Cache read error, continuing to AI generation:', dbErr.message);
        }
      }

      // If cache completely satisfied request, return immediately
      if (finalProblems.length >= targetCount) {
        return {
          modelUsed: 'MongoDB ProblemBank (Cached)',
          problems: finalProblems.slice(0, targetCount),
          fromCache: true
        };
      }

      // Step 2: Query AI provider for missing count
      const neededFromAI = targetCount - finalProblems.length;
      const provider = this.getProvider();

      let aiResult;
      try {
        aiResult = await provider.generateCodingProblems({
          prompt,
          topics,
          difficulty,
          count: neededFromAI,
          permittedLanguages,
          marksPerProblem
        });
      } catch (primaryErr) {
        // Fallback to secondary provider if primary fails or quota is exhausted
        if (provider === this.gemini && this.groq.isConfigured() && !this.groq.isInCooldown()) {
          console.warn('[aiService] Gemini hit error/cooldown. Failing over to Groq provider...');
          aiResult = await this.groq.generateCodingProblems({
            prompt,
            topics,
            difficulty,
            count: neededFromAI,
            permittedLanguages,
            marksPerProblem
          });
        } else if (finalProblems.length > 0) {
          console.warn('[aiService] Provider failed but partial cached problems exist. Returning cached problems.');
          return {
            modelUsed: 'MongoDB ProblemBank (Partial Cache)',
            problems: finalProblems,
            fromCache: true,
            warning: primaryErr.message
          };
        } else {
          throw primaryErr;
        }
      }

      // Step 3: Save newly generated coding problems to MongoDB cache asynchronously
      if (mongoose.connection.readyState === 1 && aiResult.problems && aiResult.problems.length > 0) {
        aiResult.problems.forEach(p => {
          QuestionCache.cacheItem({
            type: 'coding',
            topic: topics[0] || 'Algorithms',
            difficulty: p.difficulty || difficulty,
            title: p.title,
            data: p,
            source: provider.name
          }).catch(err => console.warn('[aiService] Cache save error:', err.message));
        });
      }

      const combined = [...finalProblems, ...(aiResult.problems || [])];
      return {
        modelUsed: aiResult.modelUsed,
        problems: combined.slice(0, targetCount),
        fromCache: finalProblems.length > 0
      };
    });
  }

  /**
   * Helper to seed questions manually saved by organizer into the cache for future competitions.
   */
  async indexQuestionsIntoCache(questions, source = 'manual') {
    if (!Array.isArray(questions) || mongoose.connection.readyState !== 1) return;
    for (const q of questions) {
      try {
        if (q.type === 'coding' && q.title && q.description) {
          await QuestionCache.cacheItem({
            type: 'coding',
            topic: q.topic || 'General',
            difficulty: q.difficulty || 'medium',
            title: q.title,
            data: q,
            source
          });
        } else if (q.type === 'mcq' && q.question && Array.isArray(q.options) && q.options.length === 4) {
          await QuestionCache.cacheItem({
            type: 'mcq',
            topic: q.topic || 'General',
            difficulty: q.difficulty || 'medium',
            title: q.question.slice(0, 80),
            data: q,
            source
          });
        }
      } catch {}
    }
  }
}

module.exports = new AIService();
