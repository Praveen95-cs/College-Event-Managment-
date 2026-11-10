import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  ClockIcon,
  FlagIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  AcademicCapIcon,
  LockClosedIcon
} from '@heroicons/react/24/outline';
import { getBackendUrl } from '../../utils/apiConfig';
import EventRegistration from '../../components/events/EventRegistration';
import AvenorLoader from '../../components/common/AvenorLoader';

const QuizArena = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [blockInfo, setBlockInfo] = useState(null);
  const [unlockEvent, setUnlockEvent] = useState(null);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [competition, setCompetition] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { [qId]: { selectedOption, markedForReview } }
  const [savingState, setSavingState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

      setCompetition({
        id,
        durationMinutes: data.durationMinutes,
        negativeMarking: data.negativeMarking,
        totalMarks: data.totalMarks,
        type: data.type
      });

      const mcqQuestions = (data.questions || []).filter(q => q.type !== 'coding');
      setQuestions(mcqQuestions);

      const ansMap = {};
      (data.answers || []).forEach(a => {
        ansMap[a.questionId] = {
          selectedOption: a.selectedOption,
          markedForReview: !!a.markedForReview
        };
      });
      setAnswers(ansMap);

      const expiry = new Date(data.expiresAt).getTime();
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.floor((expiry - now) / 1000));
      setTimeLeft(remainingSeconds);

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
      const data = err.response?.data;
      if (
        err.response?.status === 403 &&
        data?.eventId &&
        ['EVENT_REGISTRATION_REQUIRED', 'EVENT_PAYMENT_REQUIRED'].includes(data?.code)
      ) {
        setBlockInfo(data);
      }
      setError(data?.message || 'Failed to enter quiz arena.');
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
      <div className="min-h-[60vh] flex items-center justify-center">
        <AvenorLoader variant="page" label="Loading assessment questions..." />
      </div>
    );
  }

  if (error) {
    const feeCurrency = blockInfo?.currency && blockInfo.currency !== 'INR' ? `${blockInfo.currency} ` : '₹';
    return (
      <div className="max-w-lg mx-auto my-12 p-6 sm:p-7 rounded-[14px] bg-[#1c1a18] border border-[#e09132]/35 text-center space-y-4">
        {blockInfo ? (
          <LockClosedIcon className="mx-auto h-9 w-9 text-[#ebb05d]" strokeWidth={1.5} />
        ) : (
          <ExclamationTriangleIcon className="mx-auto h-8 w-8 text-[#e5484d]" strokeWidth={1.5} />
        )}
        <h3 className="text-[18px] font-medium text-[#efe9de]">
          {blockInfo ? 'Event registration & payment required' : 'Unable to enter quiz arena'}
        </h3>
        <p className="text-[13px] text-[#aaa398] leading-relaxed">{error}</p>

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

  const currentQ = questions[currentIndex];
  const currentAns = currentQ ? answers[currentQ.questionId] || { selectedOption: -1, markedForReview: false } : null;

  const answeredCount = Object.values(answers).filter(a => a.selectedOption !== undefined && a.selectedOption !== -1).length;
  const markedCount = Object.values(answers).filter(a => a.markedForReview).length;
  const unansweredCount = questions.length - answeredCount;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Arena Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-3.5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] sticky top-20 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[8px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center shrink-0">
            <AcademicCapIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-[15px] font-medium text-[#efe9de]">Quiz arena</h1>
            <div className="flex items-center gap-2 text-[12px] font-mono text-[#8a847a] tabular-nums">
              <span>{questions.length} questions</span>
              {competition?.negativeMarking > 0 && (
                <span className="text-[#ebb05d]">· -{competition.negativeMarking} wrong penalty</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-[8px] border font-mono text-[13px] font-medium tabular-nums ${
              timeLeft < 120
                ? 'bg-[#e5484d]/15 border-[#e5484d]/40 text-[#e5484d]'
                : 'bg-[#12110f] border-[#efe9de]/[0.08] text-[#efe9de]'
            }`}
          >
            <ClockIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button onClick={() => setShowSubmitModal(true)} className="btn-primary h-9 px-4 text-[13px]">
            Submit quiz
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Question Area */}
        <div className="lg:col-span-3 space-y-6">
          {currentQ ? (
            <div className="p-6 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#efe9de]/[0.08]">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-[6px] text-[12px] font-mono font-medium bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08] tabular-nums">
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <span className="text-[12px] font-mono text-[#8a847a] capitalize tabular-nums">
                    {currentQ.difficulty || 'medium'} · {currentQ.marks || 1} mark{currentQ.marks !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="text-[12px] font-mono flex items-center gap-1.5">
                  {savingState === 'saving' && <span className="text-[#ebb05d]">Saving...</span>}
                  {savingState === 'saved' && (
                    <span className="text-[#4cc38a] inline-flex items-center gap-1">
                      <CheckCircleIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                      <span>Saved</span>
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[17px] text-[#efe9de] leading-relaxed">{currentQ.question}</p>

              <div className="space-y-3 pt-1">
                {currentQ.options?.map((opt, optIdx) => {
                  const isSelected = currentAns?.selectedOption === optIdx;

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleSelectOption(optIdx)}
                      className={`w-full flex items-start gap-3.5 p-4 rounded-[10px] border text-left transition-colors duration-150 ${
                        isSelected
                          ? 'bg-[#e09132]/[0.1] border-[#e09132]'
                          : 'bg-[#12110f]/60 border-[#efe9de]/[0.08] hover:bg-[#262421]/60 hover:border-[#efe9de]/[0.16]'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-[6px] flex items-center justify-center font-mono text-[12px] font-medium shrink-0 transition-colors duration-150 ${
                          isSelected
                            ? 'bg-[#e09132] text-[#12110f]'
                            : 'bg-[#262421] text-[#aaa398] border border-[#efe9de]/[0.08]'
                        }`}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className={`text-[14px] pt-0.5 ${isSelected ? 'text-[#efe9de] font-medium' : 'text-[#aaa398]'}`}>
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-5 border-t border-[#efe9de]/[0.08] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleToggleReview}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] text-[12px] font-medium border transition-colors duration-150 ${
                      currentAns?.markedForReview
                        ? 'bg-[#e09132]/15 text-[#ebb05d] border-[#e09132]/40'
                        : 'bg-[#262421] text-[#aaa398] border-[#efe9de]/[0.08] hover:text-[#efe9de]'
                    }`}
                  >
                    <FlagIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>{currentAns?.markedForReview ? 'Marked for review' : 'Mark for review'}</span>
                  </button>

                  {currentAns?.selectedOption !== -1 && (
                    <button
                      type="button"
                      onClick={handleClearChoice}
                      className="text-[12px] text-[#8a847a] hover:text-[#e5484d] transition-colors duration-150"
                    >
                      Clear choice
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                    className="btn-secondary h-8 px-3 text-[12px]"
                  >
                    <ChevronLeftIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Previous</span>
                  </button>

                  <button
                    type="button"
                    disabled={currentIndex === questions.length - 1}
                    onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                    className="btn-primary h-8 px-3.5 text-[12px]"
                  >
                    <span>Next</span>
                    <ChevronRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-[#1c1a18] rounded-[14px] border border-[#efe9de]/[0.08]">
              <p className="text-[14px] text-[#8a847a]">No questions available in this arena.</p>
            </div>
          )}
        </div>

        {/* Question Navigation Palette */}
        <div className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] space-y-5 h-fit">
          <h2 className="text-[14px] font-medium text-[#efe9de]">Question palette</h2>

          <div className="grid grid-cols-5 lg:grid-cols-4 gap-2">
            {questions.map((q, idx) => {
              const ans = answers[q.questionId];
              const isSelected = ans?.selectedOption !== undefined && ans.selectedOption !== -1;
              const isMarked = ans?.markedForReview;
              const isCurrent = idx === currentIndex;

              let btnStyle = 'bg-[#262421] text-[#8a847a] border-[#efe9de]/[0.08] hover:text-[#efe9de]';
              if (isSelected && isMarked) {
                btnStyle = 'bg-[#e09132]/20 text-[#ebb05d] border-[#4cc38a]/60';
              } else if (isMarked) {
                btnStyle = 'bg-[#e09132]/15 text-[#ebb05d] border-[#e09132]/40';
              } else if (isSelected) {
                btnStyle = 'bg-[#4cc38a]/15 text-[#4cc38a] border-[#4cc38a]/40';
              }

              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-9 rounded-[8px] font-mono tabular-nums text-[12px] font-medium border transition-colors duration-150 ${btnStyle} ${
                    isCurrent ? 'ring-2 ring-[#e09132] ring-offset-2 ring-offset-[#1c1a18]' : ''
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 pt-4 border-t border-[#efe9de]/[0.08] text-[12px] text-[#aaa398] tabular-nums">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-[3px] bg-[#4cc38a]/25 border border-[#4cc38a]/60 shrink-0" />
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-[3px] bg-[#e09132]/25 border border-[#e09132]/60 shrink-0" />
              <span>Marked for review ({markedCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-[3px] bg-[#262421] border border-[#efe9de]/[0.14] shrink-0" />
              <span>Unanswered ({unansweredCount})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#12110f]/80 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.12] shadow-[0_24px_64px_rgba(0,0,0,0.6)] space-y-5">
            <div>
              <h3 className="text-[18px] font-medium text-[#efe9de]">Submit quiz</h3>
              <p className="text-[13px] text-[#aaa398] mt-1">
                Once submitted, your answers are locked and scored immediately.
              </p>
            </div>

            <div className="p-4 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
              <div>
                <span className="block font-sans text-[12px] text-[#8a847a]">Answered</span>
                <p className="text-[18px] font-medium text-[#4cc38a] mt-1">{answeredCount}</p>
              </div>
              <div>
                <span className="block font-sans text-[12px] text-[#8a847a]">Review</span>
                <p className="text-[18px] font-medium text-[#ebb05d] mt-1">{markedCount}</p>
              </div>
              <div>
                <span className="block font-sans text-[12px] text-[#8a847a]">Unanswered</span>
                <p className="text-[18px] font-medium text-[#aaa398] mt-1">{unansweredCount}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="btn-secondary h-9 px-4 text-[13px]"
              >
                Continue quiz
              </button>
              <button
                type="button"
                onClick={() => submitQuiz(false)}
                disabled={submitting}
                className="btn-primary h-9 px-4 text-[13px]"
              >
                {submitting ? 'Submitting...' : 'Submit now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizArena;
