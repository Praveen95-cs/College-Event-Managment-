import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  TrophyIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  AcademicCapIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  MinusCircleIcon,
  LightBulbIcon,
  CodeBracketIcon,
  DocumentCheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import { getBackendUrl } from '../../utils/apiConfig';

const Leaderboard = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const backendUrl = getBackendUrl();

  const [leaderboard, setLeaderboard] = useState(null);
  const [myResult, setMyResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [answerFilter, setAnswerFilter] = useState('all'); // 'all' | 'correct' | 'incorrect' | 'skipped'
  const [showAnswerPreview, setShowAnswerPreview] = useState(true);
  const [downloadingCert, setDownloadingCert] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
    if (user) {
      fetchMyResult();
    }
  }, [id, user]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${backendUrl}/api/competitions/${id}/leaderboard`);
      setLeaderboard(res.data);
    } catch (err) {
      setError('Failed to load competition leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyResult = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await axios.get(`${backendUrl}/api/competitions/${id}/my-result`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMyResult(res.data);
    } catch (err) {
      // User might not have participated yet
    }
  };

  const handleExportExcel = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${backendUrl}/api/competitions/${id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${leaderboard?.competitionTitle?.replace(/[^a-z0-9]/gi, '_') || 'competition'}_leaderboard.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleDownloadCertificate = async (openInTab = false) => {
    try {
      setDownloadingCert(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/competitions/${id}/certificate`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);

      if (openInTab) {
        window.open(downloadUrl, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute(
          'download',
          `${(leaderboard?.competitionTitle || 'competition').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_merit_certificate.pdf`
        );
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 60000);
    } catch (err) {
      console.error('Error downloading certificate:', err);
      alert('Failed to generate competition certificate. Please ensure your assessment has been submitted.');
    } finally {
      setDownloadingCert(false);
    }
  };

  const rankings = leaderboard?.rankings || [];
  const filteredRankings = rankings.filter(
    r =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.department && r.department.toLowerCase().includes(search.toLowerCase()))
  );

  const top3 = rankings.slice(0, 3);

  const questionsList = myResult?.questions || [];
  const totalQuestions = questionsList.length;

  const correctCount = questionsList.filter(q => {
    if (q.type === 'coding') {
      return q.submission && q.submission.status === 'passed';
    }
    return q.isCorrect;
  }).length;

  const incorrectCount = questionsList.filter(q => {
    if (q.type === 'coding') {
      return q.submission && q.submission.status !== 'passed' && q.submission.code;
    }
    return q.isAttempted && !q.isCorrect;
  }).length;

  const skippedCount = questionsList.filter(q => {
    if (q.type === 'coding') {
      return !q.submission || !q.submission.code;
    }
    return !q.isAttempted;
  }).length;

  const filteredQuestions = questionsList.filter(q => {
    if (answerFilter === 'correct') {
      if (q.type === 'coding') return q.submission && q.submission.status === 'passed';
      return q.isCorrect;
    }
    if (answerFilter === 'incorrect') {
      if (q.type === 'coding') return q.submission && q.submission.status !== 'passed' && q.submission.code;
      return q.isAttempted && !q.isCorrect;
    }
    if (answerFilter === 'skipped') {
      if (q.type === 'coding') return !q.submission || !q.submission.code;
      return !q.isAttempted;
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[#efe9de]/[0.08]">
        <div>
          <Link
            to="/competitions"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#aaa398] hover:text-[#efe9de] transition-colors duration-150 mb-3"
          >
            <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.5} />
            <span>Back to competitions</span>
          </Link>
          <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15]">
            {leaderboard?.competitionTitle || 'Competition leaderboard'}
          </h1>
          <p className="text-[14px] text-[#aaa398] mt-1.5">
            Evaluated participant standings, submission times, and score review.
          </p>
        </div>

        {user && (user.role === 'admin' || user.role === 'organizer') && (
          <button
            onClick={handleExportExcel}
            className="btn-secondary h-9 px-4 text-[13px] self-start sm:self-auto shrink-0"
          >
            <ArrowDownTrayIcon className="h-4 w-4 text-[#aaa398]" strokeWidth={1.5} />
            <span>Export Excel</span>
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
          {error}
        </div>
      )}

      {/* Participant Performance Summary */}
      {myResult && (
        <div className="rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TrophyIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
              <h2 className="text-[16px] font-medium text-[#efe9de]">Your performance</h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25 capitalize">
              {myResult.status.replace('_', ' ')}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.06]">
              <span className="text-[12px] text-[#8a847a]">Score</span>
              <p className="text-[22px] font-medium text-[#efe9de] font-mono tabular-nums mt-1 leading-none">
                {myResult.score} / {myResult.totalPossibleScore}
              </p>
            </div>
            <div className="p-4 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.06]">
              <span className="text-[12px] text-[#8a847a]">Accuracy</span>
              <p className="text-[22px] font-medium text-[#4cc38a] font-mono tabular-nums mt-1 leading-none">
                {myResult.percentage}%
              </p>
            </div>
            <div className="p-4 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.06]">
              <span className="text-[12px] text-[#8a847a]">Rank</span>
              <p className="text-[22px] font-medium text-[#ebb05d] font-mono tabular-nums mt-1 leading-none">
                #{myResult.rank || '—'}
              </p>
            </div>
            <div className="p-4 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.06]">
              <span className="text-[12px] text-[#8a847a]">Time taken</span>
              <p className="text-[22px] font-medium text-[#efe9de] font-mono tabular-nums mt-1 leading-none">
                {Math.floor(myResult.timeTakenSeconds / 60)}m {myResult.timeTakenSeconds % 60}s
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#efe9de]/[0.08] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] text-[#aaa398]">
              <AcademicCapIcon className="h-4 w-4 text-[#ebb05d] shrink-0" strokeWidth={1.5} />
              <span className="tabular-nums">
                Merit certificate ready ({myResult.score}/{myResult.totalPossibleScore} · {myResult.percentage}%)
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {totalQuestions > 0 && (
                <button
                  onClick={() => {
                    setShowAnswerPreview(prev => !prev);
                    if (!showAnswerPreview) {
                      setTimeout(() => {
                        document.getElementById('answer-preview-section')?.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    }
                  }}
                  className="btn-secondary h-8 px-3 text-[12px]"
                  title="Toggle answer review"
                >
                  <DocumentCheckIcon className="h-3.5 w-3.5 text-[#8a847a]" strokeWidth={1.5} />
                  <span>{showAnswerPreview ? 'Hide review' : `Review (${totalQuestions})`}</span>
                  {showAnswerPreview ? (
                    <ChevronUpIcon className="h-3.5 w-3.5 text-[#8a847a]" strokeWidth={1.5} />
                  ) : (
                    <ChevronDownIcon className="h-3.5 w-3.5 text-[#8a847a]" strokeWidth={1.5} />
                  )}
                </button>
              )}

              <button
                onClick={() => handleDownloadCertificate(true)}
                disabled={downloadingCert}
                className="btn-secondary h-8 px-3 text-[12px]"
                title="Preview certificate in a new tab"
              >
                <EyeIcon className="h-3.5 w-3.5 text-[#8a847a]" strokeWidth={1.5} />
                <span>Preview</span>
              </button>

              <button
                onClick={() => handleDownloadCertificate(false)}
                disabled={downloadingCert}
                className="btn-primary h-8 px-3.5 text-[12px]"
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>{downloadingCert ? 'Generating...' : 'Download PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Answer Preview & Solution Review */}
      {myResult && totalQuestions > 0 && showAnswerPreview && (
        <div id="answer-preview-section" className="space-y-5">
          <div className="rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-medium text-[#efe9de]">Answer review and solutions</h2>
                <p className="text-[13px] text-[#aaa398] mt-1">
                  Compare your submitted answers with reference solutions and marking breakdown.
                </p>
              </div>

              <div className="inline-flex flex-wrap p-1 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] gap-1 self-start sm:self-auto">
                <button
                  onClick={() => setAnswerFilter('all')}
                  className={`h-8 px-3 rounded-[6px] text-[12px] font-medium transition-colors duration-150 tabular-nums ${
                    answerFilter === 'all'
                      ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                      : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
                  }`}
                >
                  All ({totalQuestions})
                </button>
                <button
                  onClick={() => setAnswerFilter('correct')}
                  className={`h-8 px-3 rounded-[6px] text-[12px] font-medium transition-colors duration-150 inline-flex items-center gap-1.5 tabular-nums ${
                    answerFilter === 'correct'
                      ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                      : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4cc38a]" />
                  <span>Correct ({correctCount})</span>
                </button>
                <button
                  onClick={() => setAnswerFilter('incorrect')}
                  className={`h-8 px-3 rounded-[6px] text-[12px] font-medium transition-colors duration-150 inline-flex items-center gap-1.5 tabular-nums ${
                    answerFilter === 'incorrect'
                      ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                      : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#e5484d]" />
                  <span>Incorrect ({incorrectCount})</span>
                </button>
                <button
                  onClick={() => setAnswerFilter('skipped')}
                  className={`h-8 px-3 rounded-[6px] text-[12px] font-medium transition-colors duration-150 inline-flex items-center gap-1.5 tabular-nums ${
                    answerFilter === 'skipped'
                      ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                      : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8a847a]" />
                  <span>Skipped ({skippedCount})</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#efe9de]/[0.06]">
              <div className="p-3.5 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.06]">
                <span className="text-[12px] text-[#8a847a]">Questions</span>
                <p className="text-[18px] font-medium text-[#efe9de] font-mono tabular-nums mt-1">
                  {totalQuestions}
                </p>
              </div>
              <div className="p-3.5 rounded-[10px] bg-[#4cc38a]/[0.06] border border-[#4cc38a]/20">
                <span className="text-[12px] text-[#4cc38a]">Correct</span>
                <p className="text-[18px] font-medium text-[#efe9de] font-mono tabular-nums mt-1">
                  {correctCount}{' '}
                  <span className="text-[12px] text-[#4cc38a] font-normal">
                    ({totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0}%)
                  </span>
                </p>
              </div>
              <div className="p-3.5 rounded-[10px] bg-[#e5484d]/[0.06] border border-[#e5484d]/20">
                <span className="text-[12px] text-[#e5484d]">Incorrect</span>
                <p className="text-[18px] font-medium text-[#efe9de] font-mono tabular-nums mt-1">
                  {incorrectCount}
                  {myResult.negativeMarking > 0 && (
                    <span className="text-[11px] text-[#e5484d] font-normal ml-1.5">
                      (-{myResult.negativeMarking} ea)
                    </span>
                  )}
                </p>
              </div>
              <div className="p-3.5 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.06]">
                <span className="text-[12px] text-[#8a847a]">Skipped</span>
                <p className="text-[18px] font-medium text-[#aaa398] font-mono tabular-nums mt-1">
                  {skippedCount}
                </p>
              </div>
            </div>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="p-8 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] text-center space-y-2">
              <FunnelIcon className="h-6 w-6 text-[#8a847a] mx-auto" strokeWidth={1.5} />
              <p className="text-[14px] text-[#aaa398]">No questions match this filter.</p>
              <button
                onClick={() => setAnswerFilter('all')}
                className="text-[13px] font-medium text-[#ebb05d] hover:text-[#efe9de]"
              >
                Show all questions
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQuestions.map((q, idx) => {
                const questionNumber =
                  questionsList.findIndex(item => (item.questionId || item.problemId) === (q.questionId || q.problemId)) + 1;

                if (q.type === 'coding') {
                  return (
                    <div
                      key={q.problemId || idx}
                      className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] overflow-hidden"
                    >
                      <div className="px-5 py-4 border-b border-[#efe9de]/[0.08] bg-[#12110f]/50 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08] tabular-nums">
                            Problem #{questionNumber}
                          </span>
                          {q.topic && (
                            <span className="px-2 py-0.5 rounded-[6px] text-[12px] bg-[#262421] text-[#aaa398]">
                              {q.topic}
                            </span>
                          )}
                          <span className="text-[12px] font-mono text-[#8a847a] capitalize tabular-nums">
                            {q.difficulty || 'medium'} · {q.marks || 10} marks
                          </span>
                        </div>

                        <div>
                          {q.submission ? (
                            q.submission.status === 'passed' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono tabular-nums bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25">
                                <CheckCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                                <span>
                                  Passed ({q.submission.passedTestCases}/{q.submission.totalTestCases}) · +{q.submission.score}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono tabular-nums bg-[#e09132]/10 text-[#ebb05d] border border-[#e09132]/25">
                                <XCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                                <span>
                                  {q.submission.passedTestCases || 0}/{q.submission.totalTestCases || 0} passed ·{' '}
                                  {q.submission.score || 0} pts
                                </span>
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#8a847a] border border-[#efe9de]/[0.06]">
                              <MinusCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                              <span>Not attempted</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-5 sm:p-6 space-y-4">
                        <div>
                          <h4 className="text-[15px] font-medium text-[#efe9de]">{q.title}</h4>
                          <p className="text-[13px] text-[#aaa398] mt-1 whitespace-pre-wrap leading-relaxed">
                            {q.description}
                          </p>
                        </div>

                        {q.submission && q.submission.code ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[12px] text-[#aaa398]">
                              <span className="inline-flex items-center gap-1.5 font-medium text-[#efe9de]">
                                <CodeBracketIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                                <span>Submitted code ({q.submission.language || 'code'})</span>
                              </span>
                              <span className="font-mono text-[#ebb05d] tabular-nums">
                                {q.submission.score || 0} / {q.marks || 10} pts
                              </span>
                            </div>
                            <pre className="p-4 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] text-[#efe9de]/90 font-mono text-[12px] overflow-x-auto max-h-72 leading-relaxed">
                              <code>{q.submission.code}</code>
                            </pre>
                            {q.submission.error && (
                              <div className="p-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[12px] font-mono">
                                {q.submission.error}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-[12px] text-[#8a847a]">No code submitted for this problem.</p>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={q.questionId || idx}
                    className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-[#efe9de]/[0.08] bg-[#12110f]/50 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08] tabular-nums">
                          Question #{questionNumber}
                        </span>
                        {q.topic && (
                          <span className="px-2 py-0.5 rounded-[6px] text-[12px] bg-[#262421] text-[#aaa398]">
                            {q.topic}
                          </span>
                        )}
                        <span className="text-[12px] font-mono text-[#8a847a] capitalize tabular-nums">
                          {q.difficulty || 'medium'} · {q.marks || 1} {q.marks === 1 ? 'mark' : 'marks'}
                        </span>
                      </div>

                      <div>
                        {q.isCorrect ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono tabular-nums bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25">
                            <CheckCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>Correct (+{q.scoreAwarded} pts)</span>
                          </span>
                        ) : q.isAttempted ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono tabular-nums bg-[#e5484d]/10 text-[#e5484d] border border-[#e5484d]/25">
                            <XCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>Incorrect ({q.scoreAwarded} pts)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] text-[12px] font-mono tabular-nums bg-[#262421] text-[#8a847a] border border-[#efe9de]/[0.06]">
                            <MinusCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <span>Skipped (0 pts)</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-5 sm:p-6 space-y-4">
                      <p className="text-[15px] text-[#efe9de] leading-relaxed">{q.question}</p>

                      <div className="space-y-2.5">
                        {q.options &&
                          q.options.map((optionText, optIdx) => {
                            const isUserSelected = q.selectedOption === optIdx;
                            const isCorrectSolution = q.correctOption === optIdx;

                            let containerStyle = 'border-[#efe9de]/[0.08] bg-[#12110f]/60 text-[#aaa398]';
                            let badgeStyle = 'bg-[#262421] text-[#aaa398] border-[#efe9de]/[0.08]';
                            let statusLabel = null;

                            if (isUserSelected && isCorrectSolution) {
                              containerStyle = 'border-[#4cc38a]/50 bg-[#4cc38a]/[0.08] text-[#efe9de]';
                              badgeStyle = 'bg-[#4cc38a] text-[#12110f] border-[#4cc38a] font-medium';
                              statusLabel = (
                                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4cc38a]">
                                  <CheckCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  <span>Your answer</span>
                                </span>
                              );
                            } else if (isUserSelected && !isCorrectSolution) {
                              containerStyle = 'border-[#e5484d]/50 bg-[#e5484d]/[0.08] text-[#efe9de]';
                              badgeStyle = 'bg-[#e5484d] text-[#12110f] border-[#e5484d] font-medium';
                              statusLabel = (
                                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#e5484d]">
                                  <XCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  <span>Your answer</span>
                                </span>
                              );
                            } else if (isCorrectSolution) {
                              containerStyle = 'border-[#4cc38a]/40 border-dashed bg-[#4cc38a]/[0.04] text-[#efe9de]';
                              badgeStyle = 'bg-[#4cc38a]/20 text-[#4cc38a] border-[#4cc38a]/40 font-medium';
                              statusLabel = (
                                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4cc38a]">
                                  <CheckCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  <span>Correct answer</span>
                                </span>
                              );
                            }

                            return (
                              <div
                                key={optIdx}
                                className={`p-3.5 rounded-[10px] border flex items-center justify-between gap-3 ${containerStyle}`}
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`w-7 h-7 rounded-[6px] flex items-center justify-center text-[12px] font-mono shrink-0 border ${badgeStyle}`}
                                  >
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span className="text-[14px]">{optionText}</span>
                                </div>
                                {statusLabel && <div className="shrink-0">{statusLabel}</div>}
                              </div>
                            );
                          })}
                      </div>

                      {q.explanation && (
                        <div className="p-4 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] border-l-2 border-l-[#e09132] space-y-1">
                          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#ebb05d]">
                            <LightBulbIcon className="h-4 w-4" strokeWidth={1.5} />
                            <span>Explanation</span>
                          </div>
                          <p className="text-[13px] text-[#aaa398] leading-relaxed pl-5.5">{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Top 3 Podium */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {top3.map((p, idx) => {
            const labels = ['Rank #1', 'Rank #2', 'Rank #3'];
            const isFirst = idx === 0;
            return (
              <div
                key={p.userId || idx}
                className={`p-5 rounded-[14px] bg-[#1c1a18] border flex flex-col justify-between ${
                  isFirst ? 'border-[#e09132]/40' : 'border-[#efe9de]/[0.08]'
                }`}
              >
                <div>
                  <span
                    className={`text-[12px] font-mono tabular-nums ${
                      isFirst ? 'text-[#ebb05d]' : 'text-[#8a847a]'
                    }`}
                  >
                    {labels[idx] || `Rank #${idx + 1}`}
                  </span>
                  <h4 className="text-[17px] font-medium text-[#efe9de] mt-1.5 truncate">{p.name}</h4>
                  <p className="text-[13px] text-[#8a847a]">{p.department || 'General'}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#efe9de]/[0.06] flex items-center justify-between font-mono tabular-nums">
                  <span className="text-[15px] font-medium text-[#efe9de]">
                    {p.score}{' '}
                    <span className="text-[12px] text-[#8a847a] font-normal">/ {p.totalPossibleScore}</span>
                  </span>
                  <span className="text-[13px] text-[#ebb05d]">{p.percentage}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Leaderboard Table */}
      <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#efe9de]/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-[16px] font-medium text-[#efe9de] tabular-nums">
            Standings ({rankings.length})
          </h3>

          <div className="relative w-full sm:w-64">
            <MagnifyingGlassIcon
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a847a] pointer-events-none"
              strokeWidth={1.5}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search participant"
              className="input-field h-9 py-0 pl-9 pr-3 text-[13px] leading-tight"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-7 h-7 border-2 border-[#e09132] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredRankings.length === 0 ? (
          <div className="text-center py-12 text-[#8a847a] text-[14px]">
            No submissions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-[#12110f]/50 text-[#8a847a] text-[12px] font-medium border-b border-[#efe9de]/[0.08]">
                <tr>
                  <th className="px-5 py-3">Rank</th>
                  <th className="px-5 py-3">Participant</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3">Accuracy</th>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efe9de]/[0.06] text-[#efe9de]">
                {filteredRankings.map((r) => {
                  const isCurrentUser = user && user._id === r.userId;

                  return (
                    <tr
                      key={r.rank}
                      className={`hover:bg-[#262421]/40 transition-colors duration-150 ${
                        isCurrentUser ? 'bg-[#e09132]/[0.08]' : ''
                      }`}
                    >
                      <td
                        className={`px-5 py-3.5 font-mono tabular-nums font-medium ${
                          r.rank === 1 ? 'text-[#ebb05d]' : 'text-[#aaa398]'
                        }`}
                      >
                        #{r.rank}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#efe9de]">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-[6px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center text-[12px] text-[#aaa398] shrink-0">
                            {r.name ? r.name.charAt(0).toUpperCase() : 'P'}
                          </span>
                          <span className="truncate">{r.name}</span>
                          {isCurrentUser && (
                            <span className="text-[11px] font-mono text-[#ebb05d] px-1.5 py-0.5 rounded-[4px] bg-[#e09132]/15 border border-[#e09132]/25">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-[#aaa398]">
                        {r.department || 'General'}
                      </td>
                      <td className="px-5 py-3.5 font-mono tabular-nums font-medium text-[#efe9de]">
                        {r.score}{' '}
                        <span className="text-[12px] text-[#8a847a] font-normal">
                          / {r.totalPossibleScore}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono tabular-nums text-[13px] text-[#ebb05d]">
                        {r.percentage}%
                      </td>
                      <td className="px-5 py-3.5 font-mono tabular-nums text-[13px] text-[#aaa398]">
                        {Math.floor(r.timeTakenSeconds / 60)}m {r.timeTakenSeconds % 60}s
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25 capitalize">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
