const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const JUDGE0_BASE_URL = (process.env.JUDGE0_API_URL || 'https://ce.judge0.com').replace(/\/+$/, '');
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '';

// Language mappings for Judge0
const LANGUAGE_CONFIGS = {
  python: { id: 71, name: 'Python (3.8.1)', monaco: 'python', ext: 'py' },
  javascript: { id: 93, name: 'JavaScript (Node.js 18.15.0)', monaco: 'javascript', ext: 'js' },
  cpp: { id: 54, name: 'C++ (GCC 9.2.0)', monaco: 'cpp', ext: 'cpp' },
  java: { id: 62, name: 'Java (OpenJDK 13.0.1)', monaco: 'java', ext: 'java' }
};

/**
 * Normalizes language string to supported key ('python', 'javascript', 'cpp', 'java').
 */
function normalizeLanguage(lang) {
  if (!lang) return 'python';
  const clean = String(lang).trim().toLowerCase();
  if (clean === 'py' || clean === 'python' || clean === 'python3') return 'python';
  if (clean === 'js' || clean === 'javascript' || clean === 'node') return 'javascript';
  if (clean === 'c++' || clean === 'cpp') return 'cpp';
  if (clean === 'java') return 'java';
  return 'python';
}

/**
 * Trims and normalizes line endings for output comparison.
 */
function normalizeOutput(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Submits code to Judge0 for execution with a given input.
 */
async function executeSingleTestCase(sourceCode, language, stdin = '', expectedOutput = '') {
  const langKey = normalizeLanguage(language);
  const langConfig = LANGUAGE_CONFIGS[langKey];

  const payload = {
    source_code: sourceCode,
    language_id: langConfig.id,
    stdin: String(stdin ?? ''),
    expected_output: expectedOutput ? String(expectedOutput) : undefined,
    cpu_time_limit: 3.0,
    memory_limit: 128000
  };

  const headers = { 'Content-Type': 'application/json' };
  if (JUDGE0_API_KEY) {
    headers['X-RapidAPI-Key'] = JUDGE0_API_KEY;
    headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
  }

  try {
    const res = await fetch(`${JUDGE0_BASE_URL}/submissions?wait=true`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Judge0 responded with ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const statusDescription = data.status?.description || 'Unknown';
    const stdout = (data.stdout || '').trim();
    const stderr = (data.stderr || data.compile_output || '').trim();
    const time = parseFloat(data.time || '0');
    const memory = parseInt(data.memory || '0', 10);

    const normalizedActual = normalizeOutput(stdout);
    const normalizedExpected = normalizeOutput(expectedOutput);
    const passed = expectedOutput ? (normalizedActual === normalizedExpected) : true;

    return {
      passed,
      status: statusDescription,
      stdout,
      stderr,
      time,
      memory,
      token: data.token
    };
  } catch (err) {
    // If Judge0 is temporarily unavailable or network failed
    return {
      passed: false,
      status: 'Execution Service Error',
      stdout: '',
      stderr: err.message,
      time: 0,
      memory: 0
    };
  }
}

/**
 * Runs code against visible sample test cases.
 * Returns results including stdout and stderr for participant feedback.
 */
async function runSampleTests(sourceCode, language, sampleTestCases = []) {
  if (!Array.isArray(sampleTestCases) || sampleTestCases.length === 0) {
    return { success: true, results: [] };
  }

  const results = [];
  for (let i = 0; i < sampleTestCases.length; i++) {
    const tc = sampleTestCases[i];
    const exec = await executeSingleTestCase(sourceCode, language, tc.input, tc.output);
    results.push({
      testCaseIndex: i + 1,
      input: tc.input,
      expectedOutput: tc.output,
      actualOutput: exec.stdout,
      error: exec.stderr,
      status: exec.status,
      passed: exec.passed,
      time: exec.time
    });
  }

  const allPassed = results.every(r => r.passed);
  return {
    allPassed,
    results
  };
}

/**
 * Evaluates code against hidden evaluation test cases.
 * NEVER exposes the hidden inputs or outputs to the caller; only returns passed count,
 * score, compilation/runtime errors, and execution metrics.
 */
async function evaluateSubmissionAgainstHiddenTests(sourceCode, language, hiddenTestCases = [], totalMarks = 20) {
  if (!Array.isArray(hiddenTestCases) || hiddenTestCases.length === 0) {
    return {
      passedTestCases: 0,
      totalTestCases: 0,
      score: 0,
      status: 'No Test Cases',
      error: ''
    };
  }

  let passedCount = 0;
  let firstError = '';
  let overallStatus = 'Accepted';
  let totalTime = 0;

  for (let i = 0; i < hiddenTestCases.length; i++) {
    const tc = hiddenTestCases[i];
    const exec = await executeSingleTestCase(sourceCode, language, tc.input, tc.output);
    totalTime += exec.time || 0;

    if (exec.passed) {
      passedCount++;
    } else {
      if (!firstError && exec.stderr) {
        firstError = exec.stderr;
      }
      if (overallStatus === 'Accepted') {
        overallStatus = exec.status || 'Wrong Answer';
      }
    }
  }

  if (passedCount === hiddenTestCases.length) {
    overallStatus = 'Accepted';
  }

  const score = Math.round((passedCount / hiddenTestCases.length) * totalMarks * 100) / 100;

  return {
    passedTestCases: passedCount,
    totalTestCases: hiddenTestCases.length,
    score,
    status: overallStatus,
    error: firstError ? firstError.slice(0, 500) : '',
    executionTime: totalTime
  };
}

module.exports = {
  LANGUAGE_CONFIGS,
  normalizeLanguage,
  executeSingleTestCase,
  runSampleTests,
  evaluateSubmissionAgainstHiddenTests
};
