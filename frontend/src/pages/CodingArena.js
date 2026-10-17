import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { useAuth } from '../contexts/AuthContext';
import {
  ClockIcon,
  PlayIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CodeBracketIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { getBackendUrl } from '../utils/apiConfig';

const LANGUAGE_OPTIONS = [
  { key: 'python', label: 'Python 3', monaco: 'python' },
  { key: 'javascript', label: 'JavaScript (Node.js)', monaco: 'javascript' },
  { key: 'cpp', label: 'C++ (GCC)', monaco: 'cpp' },
  { key: 'java', label: 'Java (OpenJDK)', monaco: 'java' }
];

const CodingArena = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [competition, setCompetition] = useState(null);
  const [problems, setProblems] = useState([]);
  const [selectedProblemIdx, setSelectedProblemIdx] = useState(0);

  // Editor states: { [problemId]: { language: 'python', code: '...' } }
  const [codeBuffers, setCodeBuffers] = useState({});
  const [currentLang, setCurrentLang] = useState('python');

  // Execution states
  const [runningSample, setRunningSample] = useState(false);
  const [sampleResults, setSampleResults] = useState(null);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [evalResult, setEvalResult] = useState(null);

  // Active console tab: 'sample' | 'submission'
  const [consoleTab, setConsoleTab] = useState('sample');

  // Timer
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    startOrResumeAssessment();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  const startOrResumeAssessment = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const res = await axios.post(
        `${backendUrl}/api/competitions/${id}/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = res.data;
      if (data.status === 'submitted' || data.status === 'timed_out') {
        navigate(`/competitions/${id}/leaderboard`);
        return;
      }

      setCompetition(data);

      const codingProblems = (data.questions || []).filter(q => q.type === 'coding');
      setProblems(codingProblems);

      // Hydrate code buffers
      const buffers = {};
      const submissionsMap = {};
      (data.codingSubmissions || []).forEach(s => {
        submissionsMap[s.problemId] = s;
      });

      codingProblems.forEach(p => {
        const pId = p.problemId;
        const prevSub = submissionsMap[pId];
        const initialLang = prevSub?.language || 'python';
        const initialCode = prevSub?.code || (p.starterCode?.[initialLang] || p.starterCode?.python || '');

        buffers[pId] = {
          language: initialLang,
          code: initialCode
        };
      });

      setCodeBuffers(buffers);

      // Set initial language from first problem
      if (codingProblems[0]) {
        const initialPId = codingProblems[0].problemId;
        setCurrentLang(buffers[initialPId]?.language || 'python');
      }

      // Calculate remaining time
      const expiry = new Date(data.expiresAt).getTime();
      const remainingSeconds = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setTimeLeft(remainingSeconds);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleFinalSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Coding arena error:', err);
      setError(err.response?.data?.message || 'Failed to enter Coding Arena');
    } finally {
      setLoading(false);
    }
  };

  const currentProblem = problems[selectedProblemIdx];
  const currentBuffer = currentProblem ? (codeBuffers[currentProblem.problemId] || { language: 'python', code: '' }) : null;

  const handleLanguageChange = (newLang) => {
    setCurrentLang(newLang);
    if (!currentProblem) return;
    const pId = currentProblem.problemId;

    // Load starter code for new language if current code is empty or unchanged starter code
    const existingCode = currentBuffer?.code || '';
    const starterForCurrent = currentProblem.starterCode?.[currentBuffer?.language || 'python'] || '';
    const shouldResetToStarter = !existingCode || existingCode === starterForCurrent;

    const newCode = shouldResetToStarter
      ? (currentProblem.starterCode?.[newLang] || '')
      : existingCode;

    setCodeBuffers(prev => ({
      ...prev,
      [pId]: {
        language: newLang,
        code: newCode
      }
    }));
  };

  const handleCodeChange = (value) => {
    if (!currentProblem) return;
    const pId = currentProblem.problemId;
    setCodeBuffers(prev => ({
      ...prev,
      [pId]: {
        language: currentLang,
        code: value || ''
      }
    }));
  };

  const handleResetStarter = () => {
    if (!currentProblem) return;
    if (window.confirm('Reset code to starter template? Your current changes for this language will be replaced.')) {
      const starter = currentProblem.starterCode?.[currentLang] || '';
      handleCodeChange(starter);
    }
  };

  // Run sample tests (visible test cases only)
  const handleRunSampleTests = async () => {
    if (!currentProblem || runningSample) return;
    setRunningSample(true);
    setConsoleTab('sample');
    setSampleResults(null);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/competitions/${id}/run-code`,
        {
          problemId: currentProblem.problemId,
          language: currentLang,
          code: currentBuffer?.code || ''
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSampleResults(res.data);
    } catch (err) {
      setSampleResults({
        allPassed: false,
        results: [{ status: 'Error', error: err.response?.data?.message || 'Execution failed' }]
      });
    } finally {
      setRunningSample(false);
    }
  };

  // Submit code (evaluated against hidden test cases on backend)
  const handleSubmitCode = async () => {
    if (!currentProblem || submittingCode) return;
    setSubmittingCode(true);
    setConsoleTab('submission');
    setEvalResult(null);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/competitions/${id}/submit-code`,
        {
          problemId: currentProblem.problemId,
          language: currentLang,
          code: currentBuffer?.code || ''
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEvalResult(res.data);
    } catch (err) {
      setEvalResult({
        status: 'Error',
        error: err.response?.data?.message || 'Submission evaluation failed'
      });
    } finally {
      setSubmittingCode(false);
    }
  };

  // Finish entire contest
  const handleFinalSubmit = async () => {
    if (window.confirm('Are you ready to finalize your contest submission? Your latest evaluated code will be scored.')) {
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          `${backendUrl}/api/competitions/${id}/submit`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        navigate(`/competitions/${id}/leaderboard`);
      } catch (err) {
        console.error('Final submission error:', err);
      }
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-300 font-medium">Entering Coding Arena & Initializing Isolated Sandbox...</p>
      </div>
    );
  }

  if (error || !currentProblem) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-gray-900 border border-red-800 text-center space-y-4">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="text-lg font-bold text-gray-100">Unable to load Coding Arena</h3>
        <p className="text-sm text-gray-400">{error || 'No coding problems found in this contest.'}</p>
        <button
          onClick={() => navigate('/competitions')}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-violet-600 hover:bg-violet-700"
        >
          Back to Competitions
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] space-y-3">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 shadow shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
            <CodeBracketIcon className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {competition?.title || 'Coding Arena'}
            </span>
            <div className="flex items-center gap-2">
              {/* Problem switcher */}
              {problems.length > 1 ? (
                <select
                  value={selectedProblemIdx}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSelectedProblemIdx(idx);
                    const p = problems[idx];
                    if (p) setCurrentLang(codeBuffers[p.problemId]?.language || 'python');
                  }}
                  className="bg-gray-800 text-gray-100 font-bold text-sm rounded-lg px-2 py-1 border border-gray-700"
                >
                  {problems.map((p, i) => (
                    <option key={p.problemId} value={i}>
                      Problem {i + 1}: {p.title}
                    </option>
                  ))}
                </select>
              ) : (
                <h2 className="text-sm font-bold text-gray-100">{currentProblem.title}</h2>
              )}
            </div>
          </div>
        </div>

        {/* Live Timer and Action */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono font-bold text-xs ${
            timeLeft < 180
              ? 'bg-red-950/80 border-red-700 text-red-300 animate-pulse'
              : 'bg-gray-800 border-gray-700 text-gray-200'
          }`}>
            <ClockIcon className="h-4 w-4 text-cyan-400" />
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button
            onClick={handleFinalSubmit}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow"
          >
            Finish Contest
          </button>
        </div>
      </div>

      {/* Split Pane: Problem Spec (Left) and Monaco Editor + Console (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        {/* Left Pane: Problem Details (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col rounded-xl bg-gray-900 border border-gray-800 p-5 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-800">
            <h1 className="text-lg font-bold text-gray-100">{currentProblem.title}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-950 text-cyan-300 border border-cyan-800 capitalize">
              {currentProblem.difficulty} • {currentProblem.marks || 20} Marks
            </span>
          </div>

          <div className="space-y-4 text-sm text-gray-300">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Problem Statement</h4>
              <p className="whitespace-pre-wrap text-gray-200 leading-relaxed">{currentProblem.description}</p>
            </div>

            {currentProblem.inputFormat && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Input Format</h4>
                <p className="text-gray-300 text-xs font-mono bg-gray-800/60 p-2.5 rounded-lg border border-gray-700/50">
                  {currentProblem.inputFormat}
                </p>
              </div>
            )}

            {currentProblem.outputFormat && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Output Format</h4>
                <p className="text-gray-300 text-xs font-mono bg-gray-800/60 p-2.5 rounded-lg border border-gray-700/50">
                  {currentProblem.outputFormat}
                </p>
              </div>
            )}

            {currentProblem.constraints && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Constraints</h4>
                <p className="text-gray-300 text-xs font-mono bg-gray-800/60 p-2.5 rounded-lg border border-gray-700/50">
                  {currentProblem.constraints}
                </p>
              </div>
            )}

            {/* Sample Test Cases */}
            {currentProblem.sampleTestCases?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Sample Test Cases</h4>
                <div className="space-y-3">
                  {currentProblem.sampleTestCases.map((tc, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-gray-800/70 border border-gray-700/60 space-y-2 text-xs">
                      <span className="font-semibold text-gray-300">Sample {idx + 1}</span>
                      <div>
                        <span className="text-gray-500 block mb-0.5">Input:</span>
                        <pre className="p-2 rounded bg-gray-950 font-mono text-cyan-300 overflow-x-auto">{tc.input || '(empty)'}</pre>
                      </div>
                      <div>
                        <span className="text-gray-500 block mb-0.5">Output:</span>
                        <pre className="p-2 rounded bg-gray-950 font-mono text-emerald-300 overflow-x-auto">{tc.output || '(empty)'}</pre>
                      </div>
                      {tc.explanation && (
                        <p className="text-gray-400 italic text-[11px]">Explanation: {tc.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Monaco Code Editor + Evaluation Console (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
          {/* Editor Header Controls */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-950 border-b border-gray-800 shrink-0">
            <div className="flex items-center gap-3">
              <select
                value={currentLang}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-gray-800 text-gray-200 text-xs font-semibold rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:border-cyan-500"
              >
                {LANGUAGE_OPTIONS.map(l => (
                  <option key={l.key} value={l.key}>{l.label}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleResetStarter}
                className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
                title="Reset to starter code"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                Reset Starter
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunSampleTests}
                disabled={runningSample || submittingCode}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium text-cyan-300 bg-cyan-950/60 border border-cyan-800 hover:bg-cyan-900/60 transition-colors disabled:opacity-50"
              >
                {runningSample ? (
                  <>
                    <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mr-1.5"></div>
                    Executing...
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-3.5 w-3.5 mr-1" />
                    Run Sample Tests
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSubmitCode}
                disabled={submittingCode || runningSample}
                className="inline-flex items-center px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-600/30 transition-colors disabled:opacity-50"
              >
                {submittingCode ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5"></div>
                    Evaluating Hidden Tests...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="h-3.5 w-3.5 mr-1" />
                    Submit Solution
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Monaco Editor Component */}
          <div className="flex-1 min-h-[300px]">
            <Editor
              height="100%"
              theme="vs-dark"
              language={LANGUAGE_OPTIONS.find(l => l.key === currentLang)?.monaco || 'python'}
              value={currentBuffer?.code || ''}
              onChange={handleCodeChange}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: 4
              }}
            />
          </div>

          {/* Bottom Execution Console */}
          <div className="h-56 bg-gray-950 border-t border-gray-800 flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900/80 border-b border-gray-800 text-xs">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setConsoleTab('sample')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    consoleTab === 'sample'
                      ? 'bg-gray-800 text-cyan-300'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Sample Tests Output
                </button>
                <button
                  type="button"
                  onClick={() => setConsoleTab('submission')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    consoleTab === 'submission'
                      ? 'bg-gray-800 text-violet-300'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Hidden Evaluation Result
                </button>
              </div>

              <span className="text-[11px] text-gray-500 font-mono">
                Judge0 Isolated Execution
              </span>
            </div>

            {/* Console Content */}
            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-gray-300">
              {consoleTab === 'sample' && (
                sampleResults ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {sampleResults.allPassed ? (
                        <span className="inline-flex items-center text-emerald-400 font-bold gap-1">
                          <CheckCircleIcon className="h-4 w-4" /> All Sample Cases Passed!
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-amber-400 font-bold gap-1">
                          <XCircleIcon className="h-4 w-4" /> Sample Tests Mismatch
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {sampleResults.results?.map((r, i) => (
                        <div key={i} className={`p-2.5 rounded-lg border ${
                          r.passed ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-red-950/20 border-red-800/40'
                        }`}>
                          <div className="flex justify-between items-center text-[11px] text-gray-400 mb-1">
                            <span>Case {r.testCaseIndex || (i + 1)}</span>
                            <span className={r.passed ? 'text-emerald-400' : 'text-red-400 font-semibold'}>
                              {r.status || (r.passed ? 'Passed' : 'Failed')} ({r.time || 0}s)
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-gray-500">Expected:</span>
                              <pre className="text-gray-300">{r.expectedOutput || '(empty)'}</pre>
                            </div>
                            <div>
                              <span className="text-gray-500">Your Output:</span>
                              <pre className={r.passed ? 'text-emerald-300' : 'text-red-300'}>
                                {r.actualOutput || (r.error ? `Error: ${r.error}` : '(empty)')}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-6">
                    Click "Run Sample Tests" to execute your code against the visible sample cases.
                  </p>
                )
              )}

              {consoleTab === 'submission' && (
                evalResult ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-900 border border-gray-800">
                      <div>
                        <span className="text-[11px] text-gray-400 uppercase">Evaluation Status</span>
                        <p className={`text-base font-bold ${
                          evalResult.status === 'Accepted' ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {evalResult.status}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-gray-400 uppercase">Test Cases Passed</span>
                        <p className="text-base font-bold text-gray-100 font-mono">
                          {evalResult.passedTestCases} / {evalResult.totalTestCases}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-gray-400 uppercase">Awarded Score</span>
                        <p className="text-base font-bold text-cyan-400 font-mono">
                          +{evalResult.score} Marks
                        </p>
                      </div>
                    </div>

                    {evalResult.error && (
                      <div className="p-3 rounded-lg bg-red-950/30 border border-red-800/40 text-red-300 text-xs">
                        <span className="font-bold block mb-1">Compiler / Execution Diagnostics:</span>
                        <pre className="whitespace-pre-wrap">{evalResult.error}</pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-6">
                    Click "Submit Solution" to evaluate your solution against private evaluation test cases.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodingArena;
