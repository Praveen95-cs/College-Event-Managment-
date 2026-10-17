import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  TrophyIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  SparklesIcon,
  UserCircleIcon,
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
import { getBackendUrl } from '../utils/apiConfig';

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
      link.setAttribute('download', `${leaderboard?.competitionTitle?.replace(/[^a-z0-9]/gi, '_') || 'competition'}_leaderboard.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const [downloadingCert, setDownloadingCert] = useState(false);

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
        link.setAttribute('download', `${(leaderboard?.competitionTitle || 'competition').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_merit_certificate.pdf`);
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
  const filteredRankings = rankings.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.department && r.department.toLowerCase().includes(search.toLowerCase()))
  );

  const top3 = rankings.slice(0, 3);

  // Derived answer preview data
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
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Back button and Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            to="/competitions"
            className="inline-flex items-center text-xs font-semibold text-gray-400 hover:text-violet-300 transition-colors mb-2"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back to Competitions
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-100 flex items-center gap-2">
            <TrophyIcon className="h-7 w-7 text-amber-400" />
            {leaderboard?.competitionTitle || 'Competition Leaderboard'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time verified participant rankings, evaluated scores, and performance metrics.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs">
            {error}
          </div>
        )}

        {user && (user.role === 'admin' || user.role === 'organizer') && (
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 transition-all self-start sm:self-auto"
          >
            <ArrowDownTrayIcon className="h-4 w-4 mr-1.5" />
            Download Excel Report
          </button>
        )}
      </div>

      {/* Participant's Own Result Banner if available */}
      {myResult && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-violet-950/60 to-indigo-950/60 border border-violet-700/50 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-violet-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-violet-300">
                Your Assessment Performance
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {myResult.status.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
            <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-xs text-gray-400">Score (Correct Answers)</span>
              <p className="text-xl font-bold text-gray-100 mt-0.5">
                {myResult.score} / {myResult.totalPossibleScore}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-xs text-gray-400">Percentage</span>
              <p className="text-xl font-bold text-violet-400 mt-0.5">
                {myResult.percentage}%
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-xs text-gray-400">Your Rank</span>
              <p className="text-xl font-bold text-amber-400 mt-0.5">
                #{myResult.rank || '-'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-xs text-gray-400">Time Taken</span>
              <p className="text-xl font-bold text-cyan-400 mt-0.5 font-mono">
                {Math.floor(myResult.timeTakenSeconds / 60)}m {myResult.timeTakenSeconds % 60}s
              </p>
            </div>
          </div>

          {/* Action Bar: Certificate Download & Answer Preview Jump */}
          <div className="pt-3 border-t border-violet-800/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
              <AcademicCapIcon className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Official Merit Certificate Ready • Score: {myResult.score}/{myResult.totalPossibleScore} ({myResult.percentage}%)</span>
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-violet-200 bg-violet-900/50 hover:bg-violet-800/60 border border-violet-600/50 transition-colors shadow-sm"
                  title="Toggle Answer Preview"
                >
                  <DocumentCheckIcon className="h-3.5 w-3.5 text-violet-300" />
                  <span>{showAnswerPreview ? 'Hide Answer Preview' : `Answer Preview (${totalQuestions})`}</span>
                  {showAnswerPreview ? (
                    <ChevronUpIcon className="h-3 w-3 text-violet-300" />
                  ) : (
                    <ChevronDownIcon className="h-3 w-3 text-violet-300" />
                  )}
                </button>
              )}
              <button
                onClick={() => handleDownloadCertificate(true)}
                disabled={downloadingCert}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-200 bg-gray-900 hover:bg-gray-800 border border-violet-700/50 transition-colors disabled:opacity-50"
                title="Preview certificate in a new tab"
              >
                <EyeIcon className="h-3.5 w-3.5 text-gray-400" />
                <span>Certificate Preview</span>
              </button>
              <button
                onClick={() => handleDownloadCertificate(false)}
                disabled={downloadingCert}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                <span>{downloadingCert ? 'Generating...' : 'Download Certificate (PDF)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Answer Preview and Detailed Solution Review Section */}
      {myResult && totalQuestions > 0 && showAnswerPreview && (
        <div id="answer-preview-section" className="space-y-6 pt-2">
          {/* Section Header */}
          <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <DocumentCheckIcon className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-100">
                    Answer Preview & Solution Review
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-gray-400 mt-1">
                  Compare your submitted answers with verified correct solutions, marking breakdown, and AI insights.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-gray-800/80 border border-gray-700 self-start sm:self-auto overflow-x-auto">
                <button
                  onClick={() => setAnswerFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    answerFilter === 'all'
                      ? 'bg-violet-600 text-white shadow'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  All ({totalQuestions})
                </button>
                <button
                  onClick={() => setAnswerFilter('correct')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                    answerFilter === 'correct'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-gray-400 hover:text-emerald-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Correct ({correctCount})
                </button>
                <button
                  onClick={() => setAnswerFilter('incorrect')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                    answerFilter === 'incorrect'
                      ? 'bg-rose-600 text-white shadow'
                      : 'text-gray-400 hover:text-rose-300'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                  Incorrect ({incorrectCount})
                </button>
                <button
                  onClick={() => setAnswerFilter('skipped')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                    answerFilter === 'skipped'
                      ? 'bg-gray-700 text-white shadow'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                  Skipped ({skippedCount})
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-gray-800">
              <div className="p-3 rounded-xl bg-gray-800/40 border border-gray-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-gray-400">Total Questions</span>
                  <p className="text-base font-bold text-gray-100 font-mono mt-0.5">{totalQuestions}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 text-xs font-bold">
                  Σ
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/40 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-emerald-400">Correct Answers</span>
                  <p className="text-base font-bold text-emerald-300 font-mono mt-0.5">
                    {correctCount} <span className="text-xs text-emerald-400/80 font-normal">({totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0}%)</span>
                  </p>
                </div>
                <CheckCircleIcon className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-rose-400">Incorrect Answers</span>
                  <p className="text-base font-bold text-rose-300 font-mono mt-0.5">
                    {incorrectCount}
                    {myResult.negativeMarking > 0 && (
                      <span className="text-[10px] text-rose-400/80 font-normal ml-1">(-{myResult.negativeMarking} ea)</span>
                    )}
                  </p>
                </div>
                <XCircleIcon className="h-6 w-6 text-rose-400" />
              </div>
              <div className="p-3 rounded-xl bg-gray-800/40 border border-gray-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-gray-400">Skipped / Unattempted</span>
                  <p className="text-base font-bold text-gray-300 font-mono mt-0.5">{skippedCount}</p>
                </div>
                <MinusCircleIcon className="h-6 w-6 text-gray-500" />
              </div>
            </div>
          </div>

          {/* Questions Cards List */}
          {filteredQuestions.length === 0 ? (
            <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 text-center space-y-2">
              <FunnelIcon className="h-8 w-8 text-gray-600 mx-auto" />
              <p className="text-sm font-medium text-gray-300">No questions found matching the selected filter.</p>
              <button
                onClick={() => setAnswerFilter('all')}
                className="text-xs font-semibold text-violet-400 hover:text-violet-300 underline"
              >
                Reset to All Questions
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQuestions.map((q, idx) => {
                const questionNumber = questionsList.findIndex(item => (item.questionId || item.problemId) === (q.questionId || q.problemId)) + 1;

                if (q.type === 'coding') {
                  return (
                    <div
                      key={q.problemId || idx}
                      className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden shadow-lg transition-all hover:border-gray-700 space-y-0"
                    >
                      {/* Coding Card Header */}
                      <div className="p-4 sm:p-5 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3 bg-gray-900/90">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-cyan-600/20 text-cyan-300 border border-cyan-500/30">
                            Problem #{questionNumber}
                          </span>
                          {q.topic && (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-800 text-gray-300 border border-gray-700">
                              {q.topic}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase ${
                            q.difficulty === 'hard' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                            q.difficulty === 'medium' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                            'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {q.difficulty || 'medium'}
                          </span>
                          <span className="text-xs text-gray-400">
                            • {q.marks || 10} Marks
                          </span>
                        </div>

                        {/* Status badge */}
                        <div>
                          {q.submission ? (
                            q.submission.status === 'passed' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
                                All Tests Passed ({q.submission.passedTestCases}/{q.submission.totalTestCases}) • +{q.submission.score} pts
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <XCircleIcon className="h-4 w-4 text-amber-400" />
                                {q.submission.passedTestCases || 0}/{q.submission.totalTestCases || 0} Passed • {q.submission.score || 0} pts
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-800 text-gray-400 border border-gray-700">
                              <MinusCircleIcon className="h-4 w-4 text-gray-500" />
                              Not Attempted (0 pts)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Coding Body */}
                      <div className="p-5 sm:p-6 space-y-4">
                        <div>
                          <h4 className="text-base font-bold text-gray-100">{q.title}</h4>
                          <p className="text-xs sm:text-sm text-gray-300 mt-1 whitespace-pre-wrap leading-relaxed">{q.description}</p>
                        </div>

                        {q.submission && q.submission.code ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-gray-400">
                              <span className="flex items-center gap-1.5 font-semibold text-gray-300">
                                <CodeBracketIcon className="h-4 w-4 text-violet-400" />
                                Your Submitted Solution ({q.submission.language || 'Code'})
                              </span>
                              <span className="font-mono text-cyan-300 font-semibold">
                                Score: {q.submission.score || 0} / {q.marks || 10} pts
                              </span>
                            </div>
                            <pre className="p-4 rounded-xl bg-gray-950 border border-gray-800 text-emerald-300 font-mono text-xs overflow-x-auto max-h-72 leading-relaxed">
                              <code>{q.submission.code}</code>
                            </pre>
                            {q.submission.error && (
                              <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs font-mono">
                                {q.submission.error}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic">No code submitted for this problem.</p>
                        )}
                      </div>
                    </div>
                  );
                }

                // MCQ Question Card
                return (
                  <div
                    key={q.questionId || idx}
                    className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden shadow-lg transition-all hover:border-gray-700"
                  >
                    {/* MCQ Header */}
                    <div className="p-4 sm:p-5 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3 bg-gray-900/90">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-violet-600/20 text-violet-300 border border-violet-500/30">
                          Question #{questionNumber}
                        </span>
                        {q.topic && (
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-800 text-gray-300 border border-gray-700">
                            {q.topic}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase ${
                          q.difficulty === 'hard' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                          q.difficulty === 'medium' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {q.difficulty || 'medium'}
                        </span>
                        <span className="text-xs text-gray-400">
                          • {q.marks || 1} {q.marks === 1 ? 'Mark' : 'Marks'}
                        </span>
                      </div>

                      {/* Right Status Badge */}
                      <div className="flex items-center gap-2">
                        {q.isCorrect ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
                            Correct (+{q.scoreAwarded} pts)
                          </span>
                        ) : q.isAttempted ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            <XCircleIcon className="h-4 w-4 text-rose-400" />
                            Incorrect ({q.scoreAwarded} pts)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-800 text-gray-400 border border-gray-700">
                            <MinusCircleIcon className="h-4 w-4 text-gray-500" />
                            Skipped / Unattempted (0 pts)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* MCQ Body */}
                    <div className="p-5 sm:p-6 space-y-4">
                      <p className="text-gray-100 text-sm sm:text-base font-medium leading-relaxed">
                        {q.question}
                      </p>

                      {/* Options List */}
                      <div className="space-y-2.5">
                        {q.options && q.options.map((optionText, optIdx) => {
                          const isUserSelected = q.selectedOption === optIdx;
                          const isCorrectSolution = q.correctOption === optIdx;

                          let containerStyle = "border-gray-800 bg-gray-900/60 text-gray-300";
                          let badgeStyle = "bg-gray-800 text-gray-400 border-gray-700";
                          let statusPill = null;

                          if (isUserSelected && isCorrectSolution) {
                            // User selected the correct answer
                            containerStyle = "border-emerald-500 bg-emerald-950/40 text-emerald-100 shadow-md shadow-emerald-950/60 ring-1 ring-emerald-500/50";
                            badgeStyle = "bg-emerald-500 text-white font-bold border-emerald-400";
                            statusPill = (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-500/50">
                                <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-400" />
                                Your Answer (Correct)
                              </span>
                            );
                          } else if (isUserSelected && !isCorrectSolution) {
                            // User selected a wrong answer
                            containerStyle = "border-rose-500 bg-rose-950/40 text-rose-100 shadow-md shadow-rose-950/60 ring-1 ring-rose-500/50";
                            badgeStyle = "bg-rose-500 text-white font-bold border-rose-400";
                            statusPill = (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/30 text-rose-300 border border-rose-500/50">
                                <XCircleIcon className="h-3.5 w-3.5 text-rose-400" />
                                Your Answer (Incorrect)
                              </span>
                            );
                          } else if (isCorrectSolution) {
                            // The verified correct solution that user missed
                            containerStyle = "border-emerald-500/80 bg-emerald-950/20 text-emerald-200 border-dashed";
                            badgeStyle = "bg-emerald-600/50 text-emerald-200 font-bold border-emerald-500/50";
                            statusPill = (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-400" />
                                Correct Solution
                              </span>
                            );
                          }

                          return (
                            <div
                              key={optIdx}
                              className={`p-3.5 sm:p-4 rounded-xl border flex items-center justify-between gap-3 transition-colors ${containerStyle}`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 border ${badgeStyle}`}>
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span className="text-sm font-medium">{optionText}</span>
                              </div>
                              {statusPill && <div className="shrink-0">{statusPill}</div>}
                            </div>
                          );
                        })}
                      </div>

                      {/* Explanation Callout */}
                      {q.explanation && (
                        <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 via-violet-950/30 to-gray-900 border border-indigo-800/40 space-y-1.5 mt-3">
                          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                            <LightBulbIcon className="h-4 w-4 text-amber-400" />
                            <span>Solution Explanation & Insights</span>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed pl-6">
                            {q.explanation}
                          </p>
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

      {/* Top 3 Podium Cards */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {top3.map((p, idx) => {
            const podiumColors = [
              { border: 'border-amber-400/60', bg: 'bg-amber-950/20', text: 'text-amber-400', label: '1st Place • Gold' },
              { border: 'border-slate-300/60', bg: 'bg-slate-900/40', text: 'text-slate-300', label: '2nd Place • Silver' },
              { border: 'border-amber-700/60', bg: 'bg-amber-950/10', text: 'text-amber-600', label: '3rd Place • Bronze' }
            ];
            const style = podiumColors[idx] || podiumColors[2];

            return (
              <div
                key={p.userId || idx}
                className={`p-5 rounded-2xl border ${style.border} ${style.bg} relative overflow-hidden flex flex-col justify-between`}
              >
                <div>
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${style.text}`}>
                    {style.label}
                  </span>
                  <h4 className="text-lg font-bold text-gray-100 mt-1 truncate">{p.name}</h4>
                  <p className="text-xs text-gray-400">{p.department || 'General'}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                  <span className="text-base font-extrabold text-white font-mono">
                    {p.score} <span className="text-xs text-gray-400 font-normal">/ {p.totalPossibleScore}</span>
                  </span>
                  <span className="text-xs text-violet-300 font-mono font-semibold">
                    {p.percentage}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Leaderboard Table */}
      <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden shadow-xl space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-lg font-bold text-gray-100">
            Overall Standings ({rankings.length} Submissions)
          </h3>

          <div className="relative w-full sm:w-64">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student or dept..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-xs text-gray-100 placeholder-gray-500 focus:border-violet-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredRankings.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No submissions recorded yet. Once participants finish, their live rankings will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-800/60 text-gray-400 uppercase text-[11px] font-semibold border-b border-gray-800">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Participant</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Accuracy</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-gray-200">
                {filteredRankings.map((r) => {
                  const isCurrentUser = user && user._id === r.userId;

                  return (
                    <tr
                      key={r.rank}
                      className={`hover:bg-gray-800/40 transition-colors ${
                        isCurrentUser ? 'bg-violet-950/30 font-semibold' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5 font-mono font-bold">
                        {r.rank === 1 ? '🥇 1' : r.rank === 2 ? '🥈 2' : r.rank === 3 ? '🥉 3' : `#${r.rank}`}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-gray-100 flex items-center gap-2">
                        <UserCircleIcon className="h-6 w-6 text-gray-500 shrink-0" />
                        <span className="truncate">{r.name}</span>
                        {isCurrentUser && (
                          <span className="text-[10px] uppercase font-bold text-violet-400 px-1.5 py-0.5 rounded bg-violet-900/60">You</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">{r.department || 'General'}</td>
                      <td className="px-4 py-3.5 font-bold text-white font-mono">
                        {r.score} <span className="text-xs text-gray-400 font-normal">/ {r.totalPossibleScore}</span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-violet-300 text-xs">{r.percentage}%</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-gray-400">
                        {Math.floor(r.timeTakenSeconds / 60)}m {r.timeTakenSeconds % 60}s
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize">
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
