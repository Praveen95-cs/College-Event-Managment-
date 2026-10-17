import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ClockIcon,
  FlagIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { getBackendUrl } from '../utils/apiConfig';

const QuizArena = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [competition, setCompetition] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { [qId]: { selectedOption, markedForReview } }
  const [savingState, setSavingState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);

  // Initialize and start assessment
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

      setCompetition({
        id,
        durationMinutes: data.durationMinutes,
        negativeMarking: data.negativeMarking,
        totalMarks: data.totalMarks,
        type: data.type
      });

      // Filter for MCQ questions only in QuizArena (if hybrid, separate tabs/views)
      const mcqQuestions = (data.questions || []).filter(q => q.type !== 'coding');
      setQuestions(mcqQuestions);

      // Hydrate existing answers
      const ansMap = {};
      (data.answers || []).forEach(a => {
        ansMap[a.questionId] = {
          selectedOption: a.selectedOption,
          markedForReview: !!a.markedForReview
        };
      });
      setAnswers(ansMap);

      // Calculate time left from expiresAt
      const expiry = new Date(data.expiresAt).getTime();
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.floor((expiry - now) / 1000));
      setTimeLeft(remainingSeconds);

      // Start countdown
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Start assessment error:', err);
      setError(err.response?.data?.message || 'Failed to enter Quiz Arena.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSubmit = useCallback(async () => {
    await submitQuiz(true);
  }, [answers, questions]);

  const saveSingleAnswer = async (qId, optionIndex, isMarked) => {
    setSavingState('saving');
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${backendUrl}/api/competitions/${id}/save-answer`,
        {
          questionId: qId,
          selectedOption: optionIndex,
          markedForReview: isMarked
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 1200);
    } catch (err) {
      setSavingState('idle');
    }
  };

  const handleSelectOption = (optionIndex) => {
    const currentQ = questions[currentIndex];
    if (!currentQ) return;
    const qId = currentQ.questionId;
    const currentAns = answers[qId] || { markedForReview: false };

    const updated = {
      ...answers,
      [qId]: {
        ...currentAns,
        selectedOption: optionIndex
      }
    };
    setAnswers(updated);
    saveSingleAnswer(qId, optionIndex, currentAns.markedForReview);
  };

  const handleToggleReview = () => {
    const currentQ = questions[currentIndex];
    if (!currentQ) return;
    const qId = currentQ.questionId;
    const currentAns = answers[qId] || { selectedOption: -1 };
    const newReview = !currentAns.markedForReview;

    const updated = {
      ...answers,
      [qId]: {
        ...currentAns,
        markedForReview: newReview
      }
    };
    setAnswers(updated);
    saveSingleAnswer(qId, currentAns.selectedOption, newReview);
  };

  const handleClearChoice = () => {
    const currentQ = questions[currentIndex];
    if (!currentQ) return;
    const qId = currentQ.questionId;
    const currentAns = answers[qId] || { markedForReview: false };

    const updated = {
      ...answers,
      [qId]: {
        ...currentAns,
        selectedOption: -1
      }
    };
    setAnswers(updated);
    saveSingleAnswer(qId, -1, currentAns.markedForReview);
  };

  const submitQuiz = async (auto = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const answersPayload = Object.keys(answers).map(qId => ({
        questionId: qId,
        selectedOption: answers[qId].selectedOption
      }));

      await axios.post(
        `${backendUrl}/api/competitions/${id}/submit`,
        { answers: answersPayload },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      navigate(`/competitions/${id}/leaderboard`);
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.response?.data?.message || 'Error submitting assessment.');
    } finally {
      setSubmitting(false);
      setShowSubmitModal(false);
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
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-300 font-medium">Entering AI Quiz Arena & Loading Personalized Set...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-gray-900 border border-red-800 text-center space-y-4">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="text-lg font-bold text-gray-100">Unable to enter Quiz Arena</h3>
        <p className="text-sm text-gray-400">{error}</p>
        <button
          onClick={() => navigate('/competitions')}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-violet-600 hover:bg-violet-700"
        >
          Back to Competitions
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const currentAns = currentQ ? (answers[currentQ.questionId] || { selectedOption: -1, markedForReview: false }) : null;

  // Stats for modal
  const answeredCount = Object.values(answers).filter(a => a.selectedOption !== undefined && a.selectedOption !== -1).length;
  const markedCount = Object.values(answers).filter(a => a.markedForReview).length;
  const unansweredCount = questions.length - answeredCount;

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-2">
      {/* Top Banner: Arena Header & Countdown Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-gray-900 border border-gray-800 sticky top-16 z-30 backdrop-blur shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-100">AI Quiz Arena</h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{questions.length} Questions</span>
              {competition?.negativeMarking > 0 && (
                <span className="text-amber-400">• -{competition.negativeMarking} per wrong answer</span>
              )}
            </div>
          </div>
        </div>

        {/* Live Timer */}
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono font-bold text-sm ${
            timeLeft < 120
              ? 'bg-red-950/80 border-red-700 text-red-300 animate-pulse'
              : 'bg-gray-800 border-gray-700 text-gray-100'
          }`}>
            <ClockIcon className="h-4 w-4 text-violet-400" />
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all shadow-md shadow-violet-600/20"
          >
            Submit Quiz
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Question Area (3 Cols) */}
        <div className="lg:col-span-3 space-y-6">
          {currentQ ? (
            <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-6">
              {/* Question Header */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-violet-600/20 text-violet-300 border border-violet-600/30">
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-800 text-gray-300 capitalize">
                    {currentQ.difficulty || 'Medium'} • {currentQ.marks || 1} Mark{currentQ.marks !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Auto-save status */}
                <div className="text-xs text-gray-400 flex items-center gap-1.5">
                  {savingState === 'saving' && <span className="text-amber-400">Saving...</span>}
                  {savingState === 'saved' && (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircleIcon className="h-4 w-4" /> Saved
                    </span>
                  )}
                </div>
              </div>

              {/* Question Prompt */}
              <p className="text-lg font-medium text-gray-100 leading-relaxed">
                {currentQ.question}
              </p>

              {/* Options */}
              <div className="space-y-3 pt-2">
                {currentQ.options?.map((opt, optIdx) => {
                  const isSelected = currentAns?.selectedOption === optIdx;

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleSelectOption(optIdx)}
                      className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-violet-600/20 border-violet-500 shadow-md shadow-violet-600/10'
                          : 'bg-gray-800/60 border-gray-700/70 hover:bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-violet-600 text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className={`text-sm pt-0.5 transition-colors ${
                        isSelected ? 'text-white font-medium' : 'text-gray-200'
                      }`}>
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Bottom Controls */}
              <div className="pt-6 border-t border-gray-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleToggleReview}
                    className={`inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                      currentAns?.markedForReview
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                    }`}
                  >
                    <FlagIcon className="h-4 w-4 mr-1.5" />
                    {currentAns?.markedForReview ? 'Marked for Review' : 'Mark for Review'}
                  </button>

                  {currentAns?.selectedOption !== -1 && (
                    <button
                      type="button"
                      onClick={handleClearChoice}
                      className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                    >
                      Clear Choice
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                    className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeftIcon className="h-4 w-4 mr-1" />
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={currentIndex === questions.length - 1}
                    onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                    className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                  >
                    Next
                    <ChevronRightIcon className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-gray-900 rounded-2xl border border-gray-800">
              <p className="text-gray-400">No questions available in this arena.</p>
            </div>
          )}
        </div>

        {/* Sidebar: Question Navigation Palette (1 Col) */}
        <div className="p-6 rounded-2xl bg-gray-900 border border-gray-800 space-y-6 h-fit">
          <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
            Question Palette
          </h3>

          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const ans = answers[q.questionId];
              const isSelected = ans?.selectedOption !== undefined && ans.selectedOption !== -1;
              const isMarked = ans?.markedForReview;
              const isCurrent = idx === currentIndex;

              let btnStyle = 'bg-gray-800 text-gray-400 border-gray-700'; // unanswered
              if (isSelected && isMarked) {
                btnStyle = 'bg-purple-900 text-purple-200 border-purple-600';
              } else if (isMarked) {
                btnStyle = 'bg-amber-900/60 text-amber-200 border-amber-600';
              } else if (isSelected) {
                btnStyle = 'bg-emerald-900/70 text-emerald-200 border-emerald-600';
              }

              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-9 w-9 rounded-xl font-mono text-xs font-bold border transition-all ${btnStyle} ${
                    isCurrent ? 'ring-2 ring-violet-400 scale-105' : 'hover:scale-105'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="space-y-2 pt-4 border-t border-gray-800 text-xs">
            <div className="flex items-center gap-2 text-gray-400">
              <span className="w-3.5 h-3.5 rounded bg-emerald-900/70 border border-emerald-600"></span>
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span className="w-3.5 h-3.5 rounded bg-amber-900/60 border border-amber-600"></span>
              <span>Marked for Review ({markedCount})</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span className="w-3.5 h-3.5 rounded bg-gray-800 border border-gray-700"></span>
              <span>Unanswered ({unansweredCount})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-gray-100">Finish and Submit Quiz?</h3>
            <p className="text-sm text-gray-400">
              Are you sure you want to finalize your submission? You will not be able to change your answers once submitted.
            </p>

            <div className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/60 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-gray-400">Answered</span>
                <p className="text-base font-bold text-emerald-400 mt-1">{answeredCount}</p>
              </div>
              <div>
                <span className="text-gray-400">Review</span>
                <p className="text-base font-bold text-amber-400 mt-1">{markedCount}</p>
              </div>
              <div>
                <span className="text-gray-400">Unanswered</span>
                <p className="text-base font-bold text-gray-400 mt-1">{unansweredCount}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700"
              >
                Continue Quiz
              </button>
              <button
                type="button"
                onClick={() => submitQuiz(false)}
                disabled={submitting}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-600/30"
              >
                {submitting ? 'Submitting...' : 'Yes, Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizArena;
