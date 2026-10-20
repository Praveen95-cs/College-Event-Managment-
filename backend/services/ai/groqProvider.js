const BaseAIProvider = require('./baseProvider');

class GroqProvider extends BaseAIProvider {
  constructor() {
    super('groq');
    this.defaultModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  }

  isConfigured() {
    return !!process.env.GROQ_API_KEY;
  }

  async callGroq(messages, temperature = 0.3) {
    if (this.isInCooldown()) {
      const wait = this.getRemainingCooldownSeconds();
      const err = new Error(`Groq request quota limit is active. Please wait ${wait}s before retrying, or create questions manually.`);
      err.status = 429;
      err.code = 'RESOURCE_EXHAUSTED';
      err.retryAfterSeconds = wait;
      throw err;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured in backend/.env');
    }

    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const payload = {
      model: this.defaultModel,
      messages,
      temperature,
      response_format: { type: 'json_object' }
    };

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
    } catch (netErr) {
      throw new Error(`Groq connection failed: ${netErr.message}`);
    }

    if (!response.ok) {
      const status = response.status;
      let errBody = {};
      try {
        errBody = await response.json();
      } catch {}

      if (status === 429) {
        const retryHeader = response.headers.get('retry-after');
        const retrySec = retryHeader ? parseInt(retryHeader, 10) : 60;
        const err = new Error(errBody.error?.message || 'Groq rate limit exceeded');
        this.setQuotaCooldown(retrySec, err);
        const quotaErr = new Error(`Groq free-tier request quota limit reached. Please wait ${retrySec}s before retrying, or create questions manually.`);
        quotaErr.status = 429;
        quotaErr.code = 'RESOURCE_EXHAUSTED';
        quotaErr.retryAfterSeconds = retrySec;
        throw quotaErr;
      }

      throw new Error(`Groq API error (${status}): ${errBody.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async generateQuizQuestions({ prompt, topics = [], difficulty = 'medium', count = 5, marksPerQuestion = 1 }) {
    const systemPrompt = `You are an expert academic evaluator and competitive quiz creator for a college event.
Generate exactly ${count} high-quality, technically accurate multiple-choice questions (MCQs).
Difficulty: ${difficulty}.
Topics: ${topics.length > 0 ? topics.join(', ') : 'Computer Science and Engineering'}.
Organizer Context: ${prompt || 'Standard college event competition'}.

STRICT FORMAT REQUIREMENTS:
Return ONLY a JSON object containing a "questions" array:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "correctOption": 0,
      "explanation": "Why correct",
      "topic": "${topics[0] || 'General'}",
      "difficulty": "${difficulty === 'mixed' ? 'medium' : difficulty}",
      "marks": ${marksPerQuestion}
    }
  ]
}`;

    const raw = await this.callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate the quiz questions now.' }
    ], 0.4);

    const parsed = JSON.parse(this.cleanJsonOutput(raw));
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Groq returned an empty question list');
    }

    const validated = questions.map((q, idx) => {
      let correctOption = Number(q.correctOption);
      if (Number.isNaN(correctOption) || correctOption < 0 || correctOption > 3) {
        correctOption = 0;
      }

      return {
        questionId: `q_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        type: 'mcq',
        question: String(q.question).trim(),
        options: (q.options || []).map(opt => String(opt).trim()),
        correctOption,
        explanation: String(q.explanation || '').trim(),
        topic: String(q.topic || (topics[0] || 'General')).trim(),
        difficulty: ['easy', 'medium', 'hard'].includes(String(q.difficulty).toLowerCase())
          ? String(q.difficulty).toLowerCase()
          : 'medium',
        marks: Number(q.marks) || marksPerQuestion
      };
    });

    return {
      modelUsed: `groq/${this.defaultModel}`,
      questions: validated
    };
  }

  async generateCodingProblems({
    prompt,
    topics = [],
    difficulty = 'medium',
    count = 2,
    permittedLanguages = ['cpp', 'python', 'java', 'javascript'],
    marksPerProblem = 20
  }) {
    const systemPrompt = `You are a competitive programming contest setter for college hackathons.
Generate exactly ${count} algorithmic coding problem(s).
Difficulty: ${difficulty}.
Topics: ${topics.length > 0 ? topics.join(', ') : 'Data Structures and Algorithms'}.
Organizer Context: ${prompt || 'Standard college coding competition'}.
Permitted Languages: ${permittedLanguages.join(', ')}.

STRICT FORMAT REQUIREMENTS:
Return a JSON object with a "problems" array:
{
  "problems": [
    {
      "title": "Title",
      "description": "Full description",
      "inputFormat": "Input format",
      "outputFormat": "Output format",
      "constraints": "Constraints",
      "difficulty": "${difficulty === 'mixed' ? 'medium' : difficulty}",
      "marks": ${marksPerProblem},
      "starterCode": {
        "cpp": "#include <iostream>\\nusing namespace std;\\nint main() { return 0; }",
        "python": "import sys\\ndef main(): pass\\nif __name__ == '__main__': main()",
        "java": "public class Main { public static void main(String[] args) {} }",
        "javascript": "const fs = require('fs');\\nfunction solve() {}\\nsolve();"
      },
      "sampleTestCases": [{ "input": "1", "output": "1", "explanation": "Sample" }],
      "hiddenTestCases": [{ "input": "2", "output": "2" }, { "input": "5", "output": "5" }]
    }
  ]
}`;

    const raw = await this.callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Generate the coding problems now.' }
    ], 0.3);

    const parsed = JSON.parse(this.cleanJsonOutput(raw));
    const problems = Array.isArray(parsed) ? parsed : (parsed.problems || []);

    if (!Array.isArray(problems) || problems.length === 0) {
      throw new Error('Groq returned an empty problem list');
    }

    const validated = problems.map((p, idx) => ({
      problemId: `p_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'coding',
      title: String(p.title || `Coding Challenge ${idx + 1}`).trim(),
      description: String(p.description || '').trim(),
      inputFormat: String(p.inputFormat || 'Standard input').trim(),
      outputFormat: String(p.outputFormat || 'Standard output').trim(),
      constraints: String(p.constraints || 'Standard memory and time limits').trim(),
      difficulty: ['easy', 'medium', 'hard'].includes(String(p.difficulty).toLowerCase())
        ? String(p.difficulty).toLowerCase()
        : 'medium',
      marks: Number(p.marks) || marksPerProblem,
      starterCode: p.starterCode || {
        cpp: '#include <iostream>\nusing namespace std;\nint main() { return 0; }',
        python: 'def main():\n    pass\nif __name__ == "__main__":\n    main()',
        java: 'public class Main {\n    public static void main(String[] args) {}\n}',
        javascript: 'function solve() {}\nsolve();'
      },
      sampleTestCases: p.sampleTestCases || [{ input: '1', output: '1', explanation: 'Sample case' }],
      hiddenTestCases: p.hiddenTestCases || [{ input: '2', output: '2' }, { input: '5', output: '5' }]
    }));

    return {
      modelUsed: `groq/${this.defaultModel}`,
      problems: validated
    };
  }
}

module.exports = GroqProvider;
