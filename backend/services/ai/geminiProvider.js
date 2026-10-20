const { GoogleGenAI } = require('@google/genai');
const BaseAIProvider = require('./baseProvider');

class GeminiProvider extends BaseAIProvider {
  constructor() {
    super('gemini');
    this.cachedVerifiedModel = null;
    this.lastModelCheck = 0;
    this.MODEL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  }

  isConfigured() {
    return !!process.env.GEMINI_API_KEY;
  }

  getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in backend/.env');
    }
    return new GoogleGenAI({ apiKey });
  }

  /**
   * Resolves the best working free-tier Flash model.
   * Priority: GEMINI_MODEL env (if valid) -> gemini-3.5-flash -> gemini-3.8-flash -> gemini-3.5-flash-lite
   */
  async getVerifiedModel() {
    const now = Date.now();
    if (this.cachedVerifiedModel && (now - this.lastModelCheck < this.MODEL_CACHE_TTL)) {
      return this.cachedVerifiedModel;
    }

    const envModel = (process.env.GEMINI_MODEL || '').trim().replace(/^models\//, '');
    const preferredOrder = [
      envModel === 'gemini-3.8-flash' ? 'gemini-3.5-flash' : envModel,
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite'
    ].filter(Boolean);

    this.cachedVerifiedModel = preferredOrder[0] || 'gemini-3.5-flash';
    this.lastModelCheck = now;
    return this.cachedVerifiedModel;
  }

  /**
   * Switches to backup model when one hits 503 demand spikes
   */
  switchFallbackModel(currentModel) {
    const candidates = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    const next = candidates.find(m => m !== currentModel);
    if (next) {
      console.warn(`[gemini] Switching active model from ${currentModel} to ${next} due to demand spike.`);
      this.cachedVerifiedModel = next;
      return next;
    }
    return currentModel;
  }

  /**
   * Generates MCQs using Gemini.
   */
  async generateQuizQuestions({ prompt, topics = [], difficulty = 'medium', count = 5, marksPerQuestion = 1 }) {
    if (this.isInCooldown()) {
      const wait = this.getRemainingCooldownSeconds();
      const err = new Error(`Gemini free-tier request quota limit is active. Please wait ${wait}s before retrying, or create questions manually.`);
      err.status = 429;
      err.code = 'RESOURCE_EXHAUSTED';
      err.retryAfterSeconds = wait;
      throw err;
    }

    const ai = this.getClient();
    let model = await this.getVerifiedModel();

    const systemPrompt = `You are an expert academic evaluator and competitive quiz creator for a college event.
Generate exactly ${count} high-quality, technically accurate multiple-choice questions (MCQs).
Difficulty: ${difficulty}.
Topics: ${topics.length > 0 ? topics.join(', ') : 'Computer Science and Engineering'}.
Organizer Context: ${prompt || 'Standard college event competition'}.

STRICT FORMAT REQUIREMENTS:
Return ONLY a valid JSON array of objects. Do not wrap in markdown or include extra explanations.
[
  {
    "question": "Clear and concise question text",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctOption": 0, // integer 0, 1, 2, or 3
    "explanation": "Clear explanation of why this is the correct answer",
    "topic": "${topics[0] || 'General'}",
    "difficulty": "${difficulty === 'mixed' ? 'medium' : difficulty}",
    "marks": ${marksPerQuestion}
  }
]`;

    let attempts = 0;
    const maxAttempts = 2;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: systemPrompt,
          config: {
            temperature: 0.4,
            responseMimeType: 'application/json'
          }
        });

        const rawText = this.cleanJsonOutput(response.text || '');
        const parsed = JSON.parse(rawText);
        const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);

        if (!Array.isArray(questions) || questions.length === 0) {
          throw new Error('Gemini returned an empty question list');
        }

        const validated = questions.map((q, idx) => {
          if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) {
            throw new Error(`Question ${idx + 1} does not have exactly 4 options`);
          }
          let correctOption = Number(q.correctOption);
          if (Number.isNaN(correctOption) || correctOption < 0 || correctOption > 3) {
            correctOption = 0;
          }

          return {
            questionId: `q_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
            type: 'mcq',
            question: String(q.question).trim(),
            options: q.options.map(opt => String(opt).trim()),
            correctOption,
            explanation: String(q.explanation || '').trim(),
            topic: String(q.topic || (topics[0] || 'General')).trim(),
            difficulty: ['easy', 'medium', 'hard'].includes(String(q.difficulty).toLowerCase())
              ? String(q.difficulty).toLowerCase()
              : difficulty === 'mixed' ? (idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard') : difficulty,
            marks: Number(q.marks) || marksPerQuestion
          };
        });

        return {
          modelUsed: model,
          questions: validated
        };
      } catch (err) {
        lastError = err;
        const is429 = err.status === 429 || String(err.message).includes('429') || String(err.message).includes('RESOURCE_EXHAUSTED');
        const is503 = err.status === 503 || String(err.message).includes('503') || String(err.message).includes('UNAVAILABLE');

        if (is429) {
          const retrySec = this.parseRetryDelay(err);
          this.setQuotaCooldown(retrySec, err);
          const quotaErr = new Error(`Gemini free-tier request quota limit reached. Please wait ${retrySec}s before retrying, or create questions manually.`);
          quotaErr.status = 429;
          quotaErr.code = 'RESOURCE_EXHAUSTED';
          quotaErr.retryAfterSeconds = retrySec;
          throw quotaErr;
        }

        if (is503 && attempts < maxAttempts) {
          model = this.switchFallbackModel(model);
          continue;
        }

        if (attempts >= maxAttempts) {
          break;
        }
      }
    }

    throw new Error(`Gemini quiz generation failed (${model}): ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Generates Algorithmic Coding Problems using Gemini.
   */
  async generateCodingProblems({
    prompt,
    topics = [],
    difficulty = 'medium',
    count = 2,
    permittedLanguages = ['cpp', 'python', 'java', 'javascript'],
    marksPerProblem = 20
  }) {
    if (this.isInCooldown()) {
      const wait = this.getRemainingCooldownSeconds();
      const err = new Error(`Gemini free-tier request quota limit is active. Please wait ${wait}s before retrying, or create questions manually.`);
      err.status = 429;
      err.code = 'RESOURCE_EXHAUSTED';
      err.retryAfterSeconds = wait;
      throw err;
    }

    const ai = this.getClient();
    let model = await this.getVerifiedModel();

    const systemPrompt = `You are a professional competitive programming contest setter for college hackathons.
Generate exactly ${count} algorithmic coding problem(s).
Difficulty: ${difficulty}.
Topics: ${topics.length > 0 ? topics.join(', ') : 'Data Structures and Algorithms'}.
Organizer Context: ${prompt || 'Standard college coding competition'}.
Permitted Languages: ${permittedLanguages.join(', ')}.

STRICT FORMAT REQUIREMENTS:
Return ONLY a valid JSON array of objects.
[
  {
    "title": "Clear Problem Title",
    "description": "Full problem statement describing the challenge.",
    "inputFormat": "Explanation of standard input format (stdin).",
    "outputFormat": "Explanation of standard output format (stdout).",
    "constraints": "e.g., 1 <= N <= 10^5",
    "difficulty": "${difficulty === 'mixed' ? 'medium' : difficulty}",
    "marks": ${marksPerProblem},
    "starterCode": {
      "cpp": "// C++ starter\\n#include <iostream>\\nusing namespace std;\\n\\nint main() {\\n    return 0;\\n}",
      "python": "# Python 3 starter\\nimport sys\\n\\ndef main():\\n    pass\\n\\nif __name__ == '__main__':\\n    main()",
      "java": "// Java starter\\nimport java.util.Scanner;\\n\\npublic class Main {\\n    public static void main(String[] args) {\\n        Scanner sc = new Scanner(System.in);\\n    }\\n}",
      "javascript": "// JavaScript starter\\nconst fs = require('fs');\\nconst input = fs.readFileSync(0, 'utf-8').trim();\\n\\nfunction solve() {}\\nsolve();"
    },
    "sampleTestCases": [
      {
        "input": "Sample stdin",
        "output": "Sample stdout",
        "explanation": "Explanation"
      }
    ],
    "hiddenTestCases": [
      {
        "input": "Hidden stdin 1",
        "output": "Hidden stdout 1"
      },
      {
        "input": "Hidden stdin 2",
        "output": "Hidden stdout 2"
      }
    ]
  }
]`;

    let attempts = 0;
    const maxAttempts = 2;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: systemPrompt,
          config: {
            temperature: 0.3,
            responseMimeType: 'application/json'
          }
        });

        const rawText = this.cleanJsonOutput(response.text || '');
        const parsed = JSON.parse(rawText);
        const problems = Array.isArray(parsed) ? parsed : (parsed.problems || []);

        if (!Array.isArray(problems) || problems.length === 0) {
          throw new Error('Gemini returned an empty problem list');
        }

        const validated = problems.map((p, idx) => {
          const problemId = `p_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          return {
            problemId,
            type: 'coding',
            title: String(p.title || `Coding Challenge ${idx + 1}`).trim(),
            description: String(p.description || '').trim(),
            inputFormat: String(p.inputFormat || 'Read from standard input').trim(),
            outputFormat: String(p.outputFormat || 'Print to standard output').trim(),
            constraints: String(p.constraints || 'Standard limits').trim(),
            difficulty: ['easy', 'medium', 'hard'].includes(String(p.difficulty).toLowerCase())
              ? String(p.difficulty).toLowerCase()
              : difficulty === 'mixed' ? (idx % 2 === 0 ? 'easy' : 'medium') : difficulty,
            marks: Number(p.marks) || marksPerProblem,
            starterCode: {
              cpp: p.starterCode?.cpp || '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}',
              python: p.starterCode?.python || 'import sys\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()',
              java: p.starterCode?.java || 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n    }\n}',
              javascript: p.starterCode?.javascript || 'const fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\n\nfunction solve() {}\nsolve();'
            },
            sampleTestCases: Array.isArray(p.sampleTestCases) && p.sampleTestCases.length > 0
              ? p.sampleTestCases.map(tc => ({
                  input: String(tc.input ?? '').trim(),
                  output: String(tc.output ?? '').trim(),
                  explanation: String(tc.explanation ?? '').trim()
                }))
              : [{ input: '1', output: '1', explanation: 'Sample case' }],
            hiddenTestCases: Array.isArray(p.hiddenTestCases) && p.hiddenTestCases.length > 0
              ? p.hiddenTestCases.map(tc => ({
                  input: String(tc.input ?? '').trim(),
                  output: String(tc.output ?? '').trim()
                }))
              : [
                  { input: '2', output: '2' },
                  { input: '5', output: '5' }
                ]
          };
        });

        return {
          modelUsed: model,
          problems: validated
        };
      } catch (err) {
        lastError = err;
        const is429 = err.status === 429 || String(err.message).includes('429') || String(err.message).includes('RESOURCE_EXHAUSTED');
        const is503 = err.status === 503 || String(err.message).includes('503') || String(err.message).includes('UNAVAILABLE');

        if (is429) {
          const retrySec = this.parseRetryDelay(err);
          this.setQuotaCooldown(retrySec, err);
          const quotaErr = new Error(`Gemini free-tier request quota limit reached. Please wait ${retrySec}s before retrying, or create questions manually.`);
          quotaErr.status = 429;
          quotaErr.code = 'RESOURCE_EXHAUSTED';
          quotaErr.retryAfterSeconds = retrySec;
          throw quotaErr;
        }

        if (is503 && attempts < maxAttempts) {
          model = this.switchFallbackModel(model);
          continue;
        }

        if (attempts >= maxAttempts) {
          break;
        }
      }
    }

    throw new Error(`Gemini coding problem generation failed (${model}): ${lastError?.message || 'Unknown error'}`);
  }
}

module.exports = GeminiProvider;
