import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  TrophyIcon,
  ClockIcon,
  CodeBracketIcon,
  AcademicCapIcon,
  PlusIcon,
  CalendarDaysIcon,
  ArrowRightIcon,
  TrashIcon,
  LockClosedIcon
} from '@heroicons/react/24/outline';

import { getBackendUrl } from '../../utils/apiConfig';
import EventRegistration from '../../components/events/EventRegistration';
import AvenorLoader from '../../components/common/AvenorLoader';

const Competitions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'quiz', 'coding', 'hybrid'
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [unlockEvent, setUnlockEvent] = useState(null);

  const backendUrl = getBackendUrl();

  useEffect(() => {
    fetchCompetitions();
    fetchGeminiStatus();
  }, []);

  const fetchCompetitions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${backendUrl}/api/competitions`, { headers });
      setCompetitions(res.data || []);
    } catch (err) {
      console.error('Error fetching competitions:', err);
      setError('Failed to load competitions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchGeminiStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const res = await axios.get(`${backendUrl}/api/competitions/gemini-status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setGeminiStatus(res.data);
      }
    } catch (err) {
      console.warn('Could not fetch Gemini status:', err);
    }
  };

  const handleDeleteCompetition = async (compId, compTitle) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${compTitle}"?\n\nThis will remove all questions, participant submissions, and scores from the database to clean up space.`
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/competitions/${compId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompetitions(prev => prev.filter(c => c._id !== compId));
    } catch (err) {
      console.error('Error deleting competition:', err);
      alert(err.response?.data?.message || 'Failed to delete competition');
    }
  };

  const filteredCompetitions = competitions.filter(comp => {
    if (activeTab === 'all') return true;
    return comp.type === activeTab;
  });

  const getStatusBadge = (comp) => {
    const now = new Date();
    const start = new Date(comp.startTime);
    const end = new Date(comp.endTime);

    if (comp.status === 'draft') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#262421] text-[#8a847a] border border-[#efe9de]/[0.08]">
          Draft
        </span>
      );
    }
    if (now < start) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#e09132]/10 text-[#ebb05d] border border-[#e09132]/25">
          Upcoming
        </span>
      );
    }
    if (now >= start && now <= end) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4cc38a]" />
          <span>Live</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#262421] text-[#aaa398] border border-[#efe9de]/[0.08]">
        Concluded
      </span>
    );
  };

  const getTypeIcon = (type) => {
    if (type === 'coding') return <CodeBracketIcon className="h-4 w-4 text-[#aaa398]" strokeWidth={1.5} />;
    if (type === 'hybrid') return <TrophyIcon className="h-4 w-4 text-[#aaa398]" strokeWidth={1.5} />;
    return <AcademicCapIcon className="h-4 w-4 text-[#aaa398]" strokeWidth={1.5} />;
  };

  const formatTypeLabel = (type) => {
    if (type === 'coding') return 'Coding';
    if (type === 'hybrid') return 'Hybrid';
    return 'Quiz';
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#efe9de]/[0.08]">
        <div className="max-w-2xl">
          <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15]">
            Competitions and coding arenas
          </h1>
          <p className="mt-1.5 text-[14px] sm:text-[15px] text-[#aaa398] leading-relaxed">
            Timed technical quizzes and isolated programming rounds across campus departments.
          </p>
          {geminiStatus?.verifiedModel && (
            <p className="mt-2.5 text-[12px] text-[#8a847a] font-mono">
              Problem synthesis model: <span className="text-[#4cc38a]">{geminiStatus.verifiedModel}</span>
            </p>
          )}
        </div>

        {user && (user.role === 'admin' || user.role === 'organizer') && (
          <Link to="/competitions/create" className="btn-primary h-9 px-4 text-[13px] self-start md:self-auto shrink-0">
            <PlusIcon className="h-4 w-4" strokeWidth={1.5} />
            <span>Create competition</span>
          </Link>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex flex-wrap p-1 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] gap-1">
          {[
            { id: 'all', label: 'All arenas' },
            { id: 'quiz', label: 'Quiz MCQs' },
            { id: 'coding', label: 'Coding challenges' },
            { id: 'hybrid', label: 'Hybrid' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`h-8 px-3.5 rounded-[6px] text-[13px] font-medium transition-colors duration-150 ${
                activeTab === tab.id
                  ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                  : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-[13px] font-mono text-[#8a847a] tabular-nums">
          {filteredCompetitions.length} competition{filteredCompetitions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
          {error}
        </div>
      )}

      {/* Competitions Grid */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <AvenorLoader variant="section" label="Loading competitions..." />
        </div>
      ) : filteredCompetitions.length === 0 ? (
        <div className="py-16 text-center rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] px-6">
          <TrophyIcon className="mx-auto h-8 w-8 text-[#8a847a] mb-3" strokeWidth={1.5} />
          <h3 className="text-[16px] font-medium text-[#efe9de]">No competitions found</h3>
          <p className="text-[13px] text-[#8a847a] mt-1 max-w-sm mx-auto">
            {activeTab === 'all'
              ? 'No competitions have been published yet. Check back soon or create one.'
              : `No ${activeTab} competitions currently available.`}
          </p>
          {user && (user.role === 'admin' || user.role === 'organizer') && (
            <Link to="/competitions/create" className="btn-primary mt-5 h-9 px-4 text-[13px]">
              <PlusIcon className="h-4 w-4" strokeWidth={1.5} />
              <span>Create first competition</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCompetitions.map(comp => {
            const now = new Date();
            const start = new Date(comp.startTime);
            const end = new Date(comp.endTime);
            const isLive = now >= start && now <= end && comp.status === 'published';
            const isFinished = now > end || comp.status === 'completed';
            const hasSubmitted = comp.myAssignment && ['submitted', 'timed_out'].includes(comp.myAssignment.status);
            const inProgress = comp.myAssignment && comp.myAssignment.status === 'in_progress';
            const isLocked = Boolean(comp.accessStatus && !comp.accessStatus.allowed && !hasSubmitted);
            const evFee = Number(comp.event?.registrationFee || 0);
            const evIsPaid = Boolean(comp.event?.isPaid && evFee > 0);
            const evCurrency = comp.event?.currency && comp.event.currency !== 'INR' ? `${comp.event.currency} ` : '₹';

            const enterPath =
              comp.type === 'coding' ? `/competitions/${comp._id}/code` : `/competitions/${comp._id}/quiz`;

            return (
              <div
                key={comp._id}
                className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16] transition-colors duration-150 p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-7 h-7 rounded-[6px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center shrink-0">
                        {getTypeIcon(comp.type)}
                      </div>
                      <span className="text-[12px] font-mono text-[#aaa398]">
                        {formatTypeLabel(comp.type)}
                      </span>
                    </div>
                    {getStatusBadge(comp)}
                  </div>

                  <h3 className="text-[17px] font-medium text-[#efe9de] line-clamp-1">{comp.title}</h3>
                  <p className="mt-1.5 text-[13px] text-[#aaa398] line-clamp-2 leading-relaxed">
                    {comp.description}
                  </p>

                  {comp.event && (
                    <div className="mt-3 p-2.5 rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.08] flex items-center justify-between gap-2 text-[12px]">
                      <Link
                        to={`/events/${comp.event._id}`}
                        className="font-medium text-[#efe9de] hover:text-[#ebb05d] truncate transition-colors"
                      >
                        Event: {comp.event.title}
                      </Link>
                      <span
                        className={`px-2 py-0.5 rounded-[6px] text-[12px] font-mono shrink-0 border ${
                          evIsPaid
                            ? 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/25'
                            : 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                        }`}
                      >
                        {evIsPaid ? `${evCurrency}${evFee}` : 'Free'}
                      </span>
                    </div>
                  )}

                  {isLocked && (
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[12px] bg-[#e09132]/10 text-[#ebb05d] border border-[#e09132]/25">
                      <LockClosedIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                      <span>
                        {comp.accessStatus.code === 'EVENT_PAYMENT_REQUIRED'
                          ? `Complete ${evCurrency}${evFee} event payment to attend`
                          : evIsPaid
                            ? `Requires event registration & ${evCurrency}${evFee} fee`
                            : 'Requires event registration to attend'}
                      </span>
                    </div>
                  )}

                  {comp.topics?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {comp.topics.slice(0, 3).map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-[6px] text-[12px] bg-[#262421] text-[#aaa398] border border-[#efe9de]/[0.06]"
                        >
                          {t}
                        </span>
                      ))}
                      {comp.topics.length > 3 && (
                        <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#8a847a] tabular-nums">
                          +{comp.topics.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-5 grid grid-cols-2 gap-2.5 pt-4 border-t border-[#efe9de]/[0.06] text-[12px] font-mono text-[#aaa398] tabular-nums">
                    <div className="flex items-center gap-2">
                      <ClockIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                      <span>{comp.durationMinutes} min</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrophyIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                      <span>{comp.totalMarks} marks</span>
                    </div>
                    <div className="flex items-center gap-2 col-span-2">
                      <CalendarDaysIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                      <span>
                        {start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-[#efe9de]/[0.06] flex items-center justify-between gap-3">
                  <Link
                    to={`/competitions/${comp._id}/leaderboard`}
                    className="text-[13px] font-medium text-[#aaa398] hover:text-[#efe9de] transition-colors duration-150"
                  >
                    Leaderboard
                  </Link>

                  <div className="flex items-center gap-2">
                    {user && (user.role === 'admin' || user.role === 'organizer') && (
                      <Link
                        to={`/competitions/${comp._id}/manage`}
                        className="btn-secondary h-8 px-2.5 text-[12px]"
                      >
                        Manage
                      </Link>
                    )}

                    {user && (user.role === 'admin' || comp.organizer?._id === user._id || comp.organizer === user._id) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCompetition(comp._id, comp.title)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 transition-colors duration-150"
                        title="Delete competition and clean up space"
                      >
                        <TrashIcon className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    )}

                    {hasSubmitted ? (
                      <Link
                        to={`/competitions/${comp._id}/leaderboard`}
                        className="inline-flex items-center h-8 px-3 rounded-[8px] text-[12px] font-mono tabular-nums font-medium text-[#4cc38a] bg-[#4cc38a]/10 border border-[#4cc38a]/25 hover:bg-[#4cc38a]/15 transition-colors duration-150"
                      >
                        {comp.myAssignment.score}/{comp.myAssignment.totalPossibleScore}
                      </Link>
                    ) : isLocked && (isLive || inProgress) ? (
                      !user ? (
                        <Link to="/login" className="btn-primary h-8 px-3 text-[12px]">
                          Sign in to unlock
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setUnlockEvent(comp.event)}
                          className="btn-primary h-8 px-3 text-[12px]"
                        >
                          <LockClosedIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                          <span>
                            {evIsPaid ? `Pay ${evCurrency}${evFee} & unlock` : 'Register to unlock'}
                          </span>
                        </button>
                      )
                    ) : inProgress ? (
                      <button
                        onClick={() => navigate(enterPath)}
                        className="btn-primary h-8 px-3 text-[12px]"
                      >
                        <span>Resume</span>
                        <ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    ) : isLive ? (
                      <button
                        onClick={() => navigate(enterPath)}
                        className="btn-primary h-8 px-3 text-[12px]"
                      >
                        <span>Enter</span>
                        <ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    ) : isFinished ? (
                      <Link
                        to={`/competitions/${comp._id}/leaderboard`}
                        className="btn-secondary h-8 px-3 text-[12px]"
                      >
                        Results
                      </Link>
                    ) : isLocked && user && comp.event ? (
                      <button
                        type="button"
                        onClick={() => setUnlockEvent(comp.event)}
                        className="btn-secondary h-8 px-3 text-[12px]"
                      >
                        {evIsPaid ? `Pay ${evCurrency}${evFee} early` : 'Pre-register'}
                      </button>
                    ) : (
                      <span className="h-8 inline-flex items-center px-2.5 rounded-[8px] text-[12px] text-[#8a847a] bg-[#262421] border border-[#efe9de]/[0.06]">
                        Opens soon
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {unlockEvent && (
        <EventRegistration
          event={unlockEvent}
          onClose={() => setUnlockEvent(null)}
          onRegistered={() => fetchCompetitions()}
        />
      )}
    </div>
  );
};

export default Competitions;
