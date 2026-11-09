import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import {
  ClockIcon,
  PlayIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CodeBracketIcon,
  ArrowPathIcon,
  LockClosedIcon
} from '@heroicons/react/24/outline';
import { getBackendUrl } from '../../utils/apiConfig';
import EventRegistration from '../../components/events/EventRegistration';

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
  const [blockInfo, setBlockInfo] = useState(null);
  const [unlockEvent, setUnlockEvent] = useState(null);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [competition, setCompetition] = useState(null);
  const [problems, setProblems] = useState([]);
  const [selectedProblemIdx, setSelectedProblemIdx] = useState(0);

  const [codeBuffers, setCodeBuffers] = useState({});
  const [currentLang, setCurrentLang] = useState('python');

  const [runningSample, setRunningSample] = useState(false);
  const [sampleResults, setSampleResults] = useState(null);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [evalResult, setEvalResult] = useState(null);

  const [consoleTab, setConsoleTab] = useState('sample');

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
      setBlockInfo(null);
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

      const buffers = {};
      const submissionsMap = {};
      (data.codingSubmissions || []).forEach(s => {
        submissionsMap[s.problemId] = s;
      });

      codingProblems.forEach(p => {
        const pId = p.problemId;
        const prevSub = submissionsMap[pId];
        const initialLang = prevSub?.language || 'python';
        const initialCode = prevSub?.code || p.starterCode?.[initialLang] || p.starterCode?.python || '';

        buffers[pId] = {
          language: initialLang,
          code: initialCode
        };
      });

      setCodeBuffers(buffers);

      if (codingProblems[0]) {
        const initialPId = codingProblems[0].problemId;
        setCurrentLang(buffers[initialPId]?.language || 'python');
      }

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
      const data = err.response?.data;
      if (
        err.response?.status === 403 &&
        data?.eventId &&
        ['EVENT_REGISTRATION_REQUIRED', 'EVENT_PAYMENT_REQUIRED'].includes(data?.code)
      ) {
        setBlockInfo(data);
      }
      setError(data?.message || 'Failed to enter coding arena');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenUnlockModal = async () => {
    if (!blockInfo?.eventId) return;
    try {
      setLoadingEvent(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/events/${blockInfo.eventId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setUnlockEvent(res.data);
    } catch {
      navigate(`/events/${blockInfo.eventId}`);
    } finally {
      setLoadingEvent(false);
    }
  };

  const currentProblem = problems[selectedProblemIdx];
  const currentBuffer = currentProblem
    ? codeBuffers[currentProblem.problemId] || { language: 'python', code: '' }
    : null;

  const handleLanguageChange = (newLang) => {
    setCurrentLang(newLang);
    if (!currentProblem) return;
    const pId = currentProblem.problemId;

    const existingCode = currentBuffer?.code || '';
    const starterForCurrent = currentProblem.starterCode?.[currentBuffer?.language || 'python'] || '';
    const shouldResetToStarter = !existingCode || existingCode === starterForCurrent;

    const newCode = shouldResetToStarter ? currentProblem.starterCode?.[newLang] || '' : existingCode;

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
        <div className="w-8 h-8 border-2 border-[#e09132] border-t-transparent rounded-full animate-spin" />
        <p className="text-[14px] text-[#aaa398]">Loading coding arena...</p>
      </div>
    );
  }

  if (error || !currentProblem) {
    const feeCurrency = blockInfo?.currency && blockInfo.currency !== 'INR' ? `${blockInfo.currency} ` : '₹';
    return (
      <div className="max-w-lg mx-auto my-12 p-6 sm:p-7 rounded-[14px] bg-[#1c1a18] border border-[#e09132]/35 text-center space-y-4">
        {blockInfo ? (
          <LockClosedIcon className="mx-auto h-9 w-9 text-[#ebb05d]" strokeWidth={1.5} />
        ) : (
          <ExclamationTriangleIcon className="mx-auto h-8 w-8 text-[#e5484d]" strokeWidth={1.5} />
        )}
        <h3 className="text-[18px] font-medium text-[#efe9de]">
          {blockInfo ? 'Event registration & payment required' : 'Unable to load coding arena'}
        </h3>
        <p className="text-[13px] text-[#aaa398] leading-relaxed">
          {error || 'No coding problems found in this contest.'}
        </p>

        {blockInfo && (
          <div className="p-3.5 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] text-left space-y-1 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#8a847a]">Linked event</span>
              <span className="font-medium text-[#efe9de] truncate">{blockInfo.eventTitle}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#8a847a]">Entry requirement</span>
              <span className="font-mono text-[#ebb05d]">
                {blockInfo.isPaid
                  ? `${feeCurrency}${blockInfo.registrationFee} payment + registration`
                  : 'Free event registration'}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          {blockInfo?.eventId && (
            <>
              <button
                type="button"
                onClick={handleOpenUnlockModal}
                disabled={loadingEvent}
                className="btn-primary h-9 px-4 text-[13px]"
              >
                {loadingEvent
                  ? 'Opening checkout...'
                  : blockInfo.isPaid
                    ? `Pay ${feeCurrency}${blockInfo.registrationFee} & register`
                    : 'Register for event'}
              </button>
              <Link to={`/events/${blockInfo.eventId}`} className="btn-secondary h-9 px-4 text-[13px]">
                View event page
              </Link>
            </>
          )}
          <button onClick={() => navigate('/competitions')} className="btn-secondary h-9 px-4 text-[13px]">
            Back to competitions
          </button>
        </div>

        {unlockEvent && (
          <EventRegistration
            event={unlockEvent}
            onClose={() => setUnlockEvent(null)}
            onRegistered={() => {
              setUnlockEvent(null);
              startOrResumeAssessment();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:h-[calc(100vh-7rem)] lg:min-h-[580px] space-y-3">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-[12px] bg-[#1c1a18] border border-[#efe9de]/[0.08] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-[8px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center shrink-0">
            <CodeBracketIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <span className="block text-[11px] font-mono text-[#8a847a] truncate">
              {competition?.title || 'Coding arena'}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              {problems.length > 1 ? (
                <select
                  value={selectedProblemIdx}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSelectedProblemIdx(idx);
                    const p = problems[idx];
                    if (p) setCurrentLang(codeBuffers[p.problemId]?.language || 'python');
                  }}
                  className="bg-[#262421] text-[#efe9de] font-medium text-[13px] rounded-[6px] px-2.5 py-1 border border-[#efe9de]/[0.12] focus:outline-none focus:border-[#e09132]"
                >
                  {problems.map((p, i) => (
                    <option key={p.problemId} value={i}>
                      Problem {i + 1}: {p.title}
                    </option>
                  ))}
                </select>
              ) : (
                <h2 className="text-[14px] font-medium text-[#efe9de] truncate">{currentProblem.title}</h2>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] border font-mono text-[12px] font-medium tabular-nums ${
              timeLeft < 180
                ? 'bg-[#e5484d]/15 border-[#e5484d]/40 text-[#e5484d]'
                : 'bg-[#12110f] border-[#efe9de]/[0.08] text-[#efe9de]'
            }`}
          >
            <ClockIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button onClick={handleFinalSubmit} className="btn-primary h-8 px-3.5 text-[12px]">
            Finish contest
          </button>
        </div>
      </div>

      {/* Split Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        {/* Left Pane: Problem Details */}
        <div className="lg:col-span-5 flex flex-col rounded-[12px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-5 overflow-y-auto space-y-5">
          <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-[#efe9de]/[0.08]">
            <h1 className="text-[17px] font-medium text-[#efe9de] leading-snug">{currentProblem.title}</h1>
            <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08] capitalize shrink-0 tabular-nums">
              {currentProblem.difficulty} · {currentProblem.marks || 20} marks
            </span>
          </div>

          <div className="space-y-4 text-[14px] text-[#aaa398]">
            <div>
              <h4 className="text-[12px] font-mono text-[#8a847a] mb-1.5">Problem statement</h4>
              <p className="whitespace-pre-wrap text-[#efe9de]/90 leading-relaxed">{currentProblem.description}</p>
            </div>

            {currentProblem.inputFormat && (
              <div>
                <h4 className="text-[12px] font-mono text-[#8a847a] mb-1.5">Input format</h4>
                <p className="text-[#aaa398] text-[12px] font-mono bg-[#12110f] p-3 rounded-[8px] border border-[#efe9de]/[0.08]">
                  {currentProblem.inputFormat}
                </p>
              </div>
            )}

            {currentProblem.outputFormat && (
              <div>
                <h4 className="text-[12px] font-mono text-[#8a847a] mb-1.5">Output format</h4>
                <p className="text-[#aaa398] text-[12px] font-mono bg-[#12110f] p-3 rounded-[8px] border border-[#efe9de]/[0.08]">
                  {currentProblem.outputFormat}
                </p>
              </div>
            )}

            {currentProblem.constraints && (
              <div>
                <h4 className="text-[12px] font-mono text-[#8a847a] mb-1.5">Constraints</h4>
                <p className="text-[#aaa398] text-[12px] font-mono bg-[#12110f] p-3 rounded-[8px] border border-[#efe9de]/[0.08]">
                  {currentProblem.constraints}
                </p>
              </div>
            )}

            {currentProblem.sampleTestCases?.length > 0 && (
              <div>
                <h4 className="text-[12px] font-mono text-[#8a847a] mb-2">Sample test cases</h4>
                <div className="space-y-3">
                  {currentProblem.sampleTestCases.map((tc, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] space-y-2 text-[12px]"
                    >
                      <span className="font-mono text-[#efe9de]">Sample {idx + 1}</span>
                      <div>
                        <span className="text-[#8a847a] block mb-0.5">Input</span>
                        <pre className="p-2 rounded-[6px] bg-[#1c1a18] font-mono text-[#efe9de] overflow-x-auto border border-[#efe9de]/[0.06]">
                          {tc.input || '(empty)'}
                        </pre>
                      </div>
                      <div>
                        <span className="text-[#8a847a] block mb-0.5">Output</span>
                        <pre className="p-2 rounded-[6px] bg-[#1c1a18] font-mono text-[#4cc38a] overflow-x-auto border border-[#efe9de]/[0.06]">
                          {tc.output || '(empty)'}
                        </pre>
                      </div>
                      {tc.explanation && <p className="text-[#8a847a] text-[12px]">Note: {tc.explanation}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Monaco Editor + Evaluation Console */}
        <div className="lg:col-span-7 flex flex-col rounded-[12px] bg-[#1c1a18] border border-[#efe9de]/[0.08] overflow-hidden min-h-[520px] lg:min-h-0">
          {/* Editor Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-[#12110f] border-b border-[#efe9de]/[0.08] shrink-0">
            <div className="flex items-center gap-3">
              <select
                value={currentLang}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-[#262421] text-[#efe9de] text-[12px] font-medium rounded-[6px] px-3 py-1.5 border border-[#efe9de]/[0.12] focus:outline-none focus:border-[#e09132]"
              >
                {LANGUAGE_OPTIONS.map(l => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleResetStarter}
                className="text-[12px] text-[#8a847a] hover:text-[#efe9de] inline-flex items-center gap-1.5 transition-colors duration-150"
                title="Reset to starter code"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Reset starter</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunSampleTests}
                disabled={runningSample || submittingCode}
                className="btn-secondary h-8 px-3 text-[12px]"
              >
                {runningSample ? (
                  <>
                    <div className="w-3 h-3 border-2 border-[#efe9de] border-t-transparent rounded-full animate-spin" />
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-3.5 w-3.5 text-[#8a847a]" strokeWidth={1.5} />
                    <span>Run samples</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSubmitCode}
                disabled={submittingCode || runningSample}
                className="btn-primary h-8 px-3.5 text-[12px]"
              >
                {submittingCode ? (
                  <>
                    <div className="w-3 h-3 border-2 border-[#12110f] border-t-transparent rounded-full animate-spin" />
                    <span>Evaluating...</span>
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Submit solution</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 min-h-[280px]">
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
          <div className="h-52 bg-[#12110f] border-t border-[#efe9de]/[0.08] flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#1c1a18] border-b border-[#efe9de]/[0.08] text-[12px]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConsoleTab('sample')}
                  className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors duration-150 ${
                    consoleTab === 'sample' ? 'bg-[#262421] text-[#efe9de]' : 'text-[#8a847a] hover:text-[#efe9de]'
                  }`}
                >
                  Sample output
                </button>
                <button
                  type="button"
                  onClick={() => setConsoleTab('submission')}
                  className={`px-2.5 py-1 rounded-[6px] font-medium transition-colors duration-150 ${
                    consoleTab === 'submission' ? 'bg-[#262421] text-[#ebb05d]' : 'text-[#8a847a] hover:text-[#efe9de]'
                  }`}
                >
                  Evaluation result
                </button>
              </div>

              <span className="text-[11px] text-[#8a847a] font-mono">Judge0 isolated runner</span>
            </div>

            <div className="flex-1 p-3.5 overflow-y-auto font-mono text-[12px] text-[#aaa398]">
              {consoleTab === 'sample' &&
                (sampleResults ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {sampleResults.allPassed ? (
                        <span className="inline-flex items-center text-[#4cc38a] font-medium gap-1.5">
                          <CheckCircleIcon className="h-4 w-4" strokeWidth={1.5} />
                          <span>All sample cases passed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[#ebb05d] font-medium gap-1.5">
                          <XCircleIcon className="h-4 w-4" strokeWidth={1.5} />
                          <span>Sample test mismatch</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {sampleResults.results?.map((r, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-[8px] border ${
                            r.passed
                              ? 'bg-[#4cc38a]/[0.06] border-[#4cc38a]/25'
                              : 'bg-[#e5484d]/[0.06] border-[#e5484d]/25'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[11px] text-[#8a847a] mb-1.5 tabular-nums">
                            <span>Case {r.testCaseIndex || i + 1}</span>
                            <span className={r.passed ? 'text-[#4cc38a]' : 'text-[#e5484d]'}>
                              {r.status || (r.passed ? 'Passed' : 'Failed')} ({r.time || 0}s)
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div>
                              <span className="text-[#8a847a]">Expected:</span>
                              <pre className="text-[#efe9de] mt-0.5">{r.expectedOutput || '(empty)'}</pre>
                            </div>
                            <div>
                              <span className="text-[#8a847a]">Your output:</span>
                              <pre className={`mt-0.5 ${r.passed ? 'text-[#4cc38a]' : 'text-[#e5484d]'}`}>
                                {r.actualOutput || (r.error ? `Error: ${r.error}` : '(empty)')}
                              </pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[#8a847a] text-center py-6 font-sans text-[13px]">
                    Click Run samples to test against visible cases.
                  </p>
                ))}

              {consoleTab === 'submission' &&
                (evalResult ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4 p-3 rounded-[8px] bg-[#1c1a18] border border-[#efe9de]/[0.08] tabular-nums">
                      <div>
                        <span className="text-[11px] font-sans text-[#8a847a]">Status</span>
                        <p
                          className={`text-[15px] font-medium mt-0.5 ${
                            evalResult.status === 'Accepted' ? 'text-[#4cc38a]' : 'text-[#ebb05d]'
                          }`}
                        >
                          {evalResult.status}
                        </p>
                      </div>

                      <div>
                        <span className="text-[11px] font-sans text-[#8a847a]">Test cases</span>
                        <p className="text-[15px] font-medium text-[#efe9de] mt-0.5">
                          {evalResult.passedTestCases} / {evalResult.totalTestCases}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] font-sans text-[#8a847a]">Score awarded</span>
                        <p className="text-[15px] font-medium text-[#ebb05d] mt-0.5">+{evalResult.score} marks</p>
                      </div>
                    </div>

                    {evalResult.error && (
                      <div className="p-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[12px]">
                        <span className="font-medium block mb-1">Diagnostics</span>
                        <pre className="whitespace-pre-wrap">{evalResult.error}</pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[#8a847a] text-center py-6 font-sans text-[13px]">
                    Click Submit solution to evaluate against private test cases.
                  </p>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodingArena;
