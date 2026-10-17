const { GoogleGenAI } = require('@google/genai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let cachedVerifiedModel = null;
let lastModelCheckTime = 0;
const MODEL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Returns an instance of GoogleGenAI using GEMINI_API_KEY from environment.
 */
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend/.env');
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Verifies that the selected model is available on the user's account and free tier.
 * If the configured model is unavailable or deprecated, selects the best available
 * free-tier Flash model without incurring unexpected charges or paid upgrades.
 */
async function getVerifiedModel() {
  const now = Date.now();
  if (cachedVerifiedModel && (now - lastModelCheckTime < MODEL_CACHE_TTL)) {
    return cachedVerifiedModel;
  }

  const ai = getGenAIClient();
  const configuredModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();

  try {
    const modelListResponse = await ai.models.list();
    const availableModelNames = [];

    for await (const m of modelListResponse) {
      if (m && m.name) {
        // Model names can look like 'models/gemini-3.8-flash' or 'gemini-3.8-flash'
        const cleanName = m.name.replace(/^models\//, '');
        availableModelNames.push(cleanName);
      }
    }

    const cleanConfigured = configuredModel.replace(/^models\//, '');
    if (availableModelNames.includes(cleanConfigured)) {
      cachedVerifiedModel = cleanConfigured;
      lastModelCheckTime = now;
      return cachedVerifiedModel;
    }

    // Recommended free-tier / flash models ordered by preference
    const freeTierPreferences = [
      'gemini-3.8-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-flash-latest'
    ];

    const match = freeTierPreferences.find(m => availableModelNames.includes(m));
    if (match) {
      console.warn(`Configured model "${configuredModel}" was not found. Using verified available free-tier model: "${match}"`);
      cachedVerifiedModel = match;
    } else if (availableModelNames.length > 0) {
      // Pick first model that contains 'flash' or fallback to the first model
      const fallbackFlash = availableModelNames.find(m => m.includes('flash')) || availableModelNames[0];
      cachedVerifiedModel = fallbackFlash;
      console.warn(`Falling back to available model: "${cachedVerifiedModel}"`);
    } else {
      cachedVerifiedModel = cleanConfigured;
    }

    lastModelCheckTime = now;
    return cachedVerifiedModel;
  } catch (err) {
    console.error('Error verifying Gemini models with account:', err.message);
    // On listing error (e.g., transient network), use the configured model safely
    return configuredModel.replace(/^models\//, '');
  }
}

/**
 * Strips markdown code fences from JSON text if present.
 */
function cleanJsonOutput(raw) {
  if (!raw) return '';
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

/**
 * Generates Quiz MCQs using Google Gemini API.
 *
 * @param {Object} options
 * @param {string} options.prompt - Organizer custom prompt instructions
 * @param {string[]} options.topics - Target topics
 * @param {string} options.difficulty - 'easy', 'medium', 'hard', 'mixed'
 * @param {number} options.count - Number of questions to generate (e.g. 5, 10)
 * @param {number} [options.marksPerQuestion=1]
 */
async function generateQuizQuestions({ prompt, topics = [], difficulty = 'medium', count = 5, marksPerQuestion = 1 }) {
  const ai = getGenAIClient();
  const model = await getVerifiedModel();

  const systemPrompt = `You are an expert academic evaluator and competitive quiz creator for a college event.
Generate exactly ${count} high-quality, technically accurate multiple-choice questions (MCQs).
Difficulty: ${difficulty}.
Topics: ${topics.length > 0 ? topics.join(', ') : 'Computer Science and General Engineering Concepts'}.
Organizer Context: ${prompt || 'Standard college event competition'}.

STRICT FORMAT REQUIREMENTS:
Return ONLY a valid JSON array of objects. Do not wrap in markdown or include extra explanations.
Each object must follow this exact structure:
[
  {
    "question": "Clear and concise question text",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctOption": 0, // integer 0, 1, 2, or 3 representing the index of the correct option
    "explanation": "Clear explanation of why this is the correct answer",
    "topic": "Specific topic name",
    "difficulty": "${difficulty === 'mixed' ? 'easy/medium/hard' : difficulty}",
    "marks": ${marksPerQuestion}
  }
]

Quality Rules:
1. Ensure all 4 options are distinct, plausible, and grammatically consistent.
2. The correctOption MUST accurately match the index (0, 1, 2, or 3) of the correct choice in the options array.
3. No dummy or generic placeholder text. Use real technical questions with accurate facts.`;

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

      const rawText = cleanJsonOutput(response.text || '');
      const parsed = JSON.parse(rawText);

      const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);

      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Gemini returned an empty question list');
      }

      // Validate and sanitize each question
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
      console.warn(`Gemini quiz generation attempt ${attempts} failed:`, err.message);
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  throw new Error(`Failed to generate quiz questions with Gemini (${model}): ${lastError?.message || 'Unknown error'}`);
}

/**
 * Generates Coding Problems using Google Gemini API.
 *
 * @param {Object} options
 * @param {string} options.prompt - Organizer prompt instructions
 * @param {string[]} options.topics - e.g. ['Arrays', 'Dynamic Programming', 'Strings']
 * @param {string} options.difficulty - 'easy', 'medium', 'hard', 'mixed'
 * @param {number} options.count - Number of problems (e.g. 2, 3)
 * @param {string[]} [options.permittedLanguages] - ['cpp', 'python', 'java', 'javascript']
 * @param {number} [options.marksPerProblem=20]
 */
async function generateCodingProblems({
  prompt,
  topics = [],
  difficulty = 'medium',
  count = 2,
  permittedLanguages = ['cpp', 'python', 'java', 'javascript'],
  marksPerProblem = 20
}) {
  const ai = getGenAIClient();
  const model = await getVerifiedModel();

  const systemPrompt = `You are a professional competitive programming contest setter for college hackathons.
Generate exactly ${count} algorithmic coding problem(s).
Difficulty: ${difficulty}.
Topics: ${topics.length > 0 ? topics.join(', ') : 'Data Structures and Algorithms'}.
Organizer Context: ${prompt || 'Standard college coding competition'}.
Permitted Languages: ${permittedLanguages.join(', ')}.

STRICT FORMAT REQUIREMENTS:
Return ONLY a valid JSON array of objects.
Each object must follow this exact structure:
[
  {
    "title": "Clear Problem Title",
    "description": "Full problem statement describing the challenge.",
    "inputFormat": "Explanation of standard input format (stdin).",
    "outputFormat": "Explanation of standard output format (stdout).",
    "constraints": "e.g., 1 <= N <= 10^5, -10^9 <= A[i] <= 10^9",
    "difficulty": "${difficulty === 'mixed' ? 'easy/medium/hard' : difficulty}",
    "marks": ${marksPerProblem},
    "starterCode": {
      "cpp": "// C++ standard solution starter\\n#include <iostream>\\nusing namespace std;\\n\\nint main() {\\n    // Read input from cin\\n    return 0;\\n}",
      "python": "# Python 3 starter\\nimport sys\\n\\ndef main():\\n    pass\\n\\nif __name__ == '__main__':\\n    main()",
      "java": "// Java starter\\nimport java.util.Scanner;\\n\\npublic class Main {\\n    public static void main(String[] args) {\\n        Scanner sc = new Scanner(System.in);\\n    }\\n}",
      "javascript": "// JavaScript (Node.js) starter\\nconst fs = require('fs');\\nconst input = fs.readFileSync('/dev/stdin', 'utf-8').trim();\\n\\nfunction solve() {\\n    console.log('');\\n}\\nsolve();"
    },
    "sampleTestCases": [
      {
        "input": "Sample stdin string",
        "output": "Sample stdout string",
        "explanation": "Why this output is produced"
      }
    ],
    "hiddenTestCases": [
      {
        "input": "Hidden stdin string 1",
        "output": "Expected stdout string 1"
      },
      {
        "input": "Hidden stdin string 2",
        "output": "Expected stdout string 2"
      },
      {
        "input": "Hidden stdin string 3",
        "output": "Expected stdout string 3"
      }
    ]
  }
]

Important Rules:
1. All inputs and outputs must use standard I/O (stdin/stdout) trimmed cleanly.
2. Provide at least 1-2 sample test cases and at least 3-4 hidden evaluation test cases per problem.
3. Hidden test cases must include edge cases (e.g. empty, single element, negative numbers, boundary values).
4. No placeholder text like "TODO" in test cases. Use realistic concrete values.`;

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

      const rawText = cleanJsonOutput(response.text || '');
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
          constraints: String(p.constraints || 'Standard memory and time limits').trim(),
          difficulty: ['easy', 'medium', 'hard'].includes(String(p.difficulty).toLowerCase())
            ? String(p.difficulty).toLowerCase()
            : difficulty === 'mixed' ? (idx % 2 === 0 ? 'easy' : 'medium') : difficulty,
          marks: Number(p.marks) || marksPerProblem,
          starterCode: {
            cpp: p.starterCode?.cpp || '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your code here\n    return 0;\n}',
            python: p.starterCode?.python || 'import sys\n\ndef main():\n    # Write your code here\n    pass\n\nif __name__ == "__main__":\n    main()',
            java: p.starterCode?.java || 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your code here\n    }\n}',
            javascript: p.starterCode?.javascript || 'const fs = require("fs");\nconst input = fs.readFileSync(0, "utf-8").trim();\n\nfunction solve() {\n    // Write your code here\n}\nsolve();'
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
                { input: '5', output: '5' },
                { input: '10', output: '10' }
              ]
        };
      });

      return {
        modelUsed: model,
        problems: validated
      };
    } catch (err) {
      lastError = err;
      console.warn(`Gemini coding problem generation attempt ${attempts} failed:`, err.message);
      if (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  throw new Error(`Failed to generate coding problems with Gemini (${model}): ${lastError?.message || 'Unknown error'}`);
}

module.exports = {
  getVerifiedModel,
  generateQuizQuestions,
  generateCodingProblems
};
