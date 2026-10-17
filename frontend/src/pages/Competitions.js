import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  TrophyIcon,
  ClockIcon,
  CodeBracketIcon,
  AcademicCapIcon,
  SparklesIcon,
  PlusIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

import { getBackendUrl } from '../utils/apiConfig';

const Competitions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'quiz', 'coding', 'hybrid'
  const [geminiStatus, setGeminiStatus] = useState(null);

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
      setCompetitions(res.data);
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
      // Non-critical status
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
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">Draft</span>;
    }
    if (now < start) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">Upcoming</span>;
    }
    if (now >= start && now <= end) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5"></span>
          Live Arena
        </span>
      );
    }
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">Concluded</span>;
  };

  const getTypeIcon = (type) => {
    if (type === 'coding') return <CodeBracketIcon className="h-5 w-5 text-cyan-400" />;
    if (type === 'hybrid') return <SparklesIcon className="h-5 w-5 text-amber-400" />;
    return <AcademicCapIcon className="h-5 w-5 text-violet-400" />;
  };

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-950 via-gray-900 to-indigo-950 border border-violet-800/40 p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20">
              <SparklesIcon className="h-4 w-4 text-violet-400" />
              Powered by Google Gemini Free Tier
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              AI Quiz & Coding Competitions
            </h1>
            <p className="text-gray-300 text-sm sm:text-base">
              Test your engineering skills in personalized AI-generated quizzes and isolated algorithmic coding arenas. Compete live on the real-time leaderboard.
            </p>
            {geminiStatus?.verifiedModel && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <CheckCircleIcon className="h-4 w-4 text-emerald-400 inline" />
                Verified Model: <span className="text-emerald-300 font-mono font-medium">{geminiStatus.verifiedModel}</span> (Free Tier)
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {user && (user.role === 'admin' || user.role === 'organizer') && (
              <Link
                to="/competitions/create"
                className="inline-flex items-center px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/30 transition-all hover:scale-105"
              >
                <PlusIcon className="h-5 w-5 mr-1.5" />
                Create Competition
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div className="flex space-x-2 bg-gray-900/60 p-1 rounded-xl border border-gray-800">
          {[
            { id: 'all', label: 'All Arenas' },
            { id: 'quiz', label: 'Quiz MCQs' },
            { id: 'coding', label: 'Coding Challenges' },
            { id: 'hybrid', label: 'Hybrid' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-sm text-gray-400">
          Showing {filteredCompetitions.length} competition{filteredCompetitions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Competitions Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredCompetitions.length === 0 ? (
        <div className="text-center py-16 bg-gray-900/40 rounded-2xl border border-gray-800/80 p-8">
          <TrophyIcon className="mx-auto h-12 w-12 text-gray-600 mb-3" />
          <h3 className="text-lg font-medium text-gray-200">No competitions found</h3>
          <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
            {activeTab === 'all'
              ? 'No competitions have been published yet. Check back soon or create one!'
              : `No ${activeTab} competitions currently available.`}
          </p>
          {user && (user.role === 'admin' || user.role === 'organizer') && (
            <Link
              to="/competitions/create"
              className="mt-4 inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-violet-600 hover:bg-violet-700"
            >
              <PlusIcon className="h-4 w-4 mr-1.5" />
              Create First Competition
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompetitions.map(comp => {
            const now = new Date();
            const start = new Date(comp.startTime);
            const end = new Date(comp.endTime);
            const isLive = now >= start && now <= end && comp.status === 'published';
            const isFinished = now > end || comp.status === 'completed';
            const hasSubmitted = comp.myAssignment && ['submitted', 'timed_out'].includes(comp.myAssignment.status);
            const inProgress = comp.myAssignment && comp.myAssignment.status === 'in_progress';

            const enterPath = comp.type === 'coding'
              ? `/competitions/${comp._id}/code`
              : `/competitions/${comp._id}/quiz`;

            return (
              <div
                key={comp._id}
                className="group relative flex flex-col justify-between rounded-2xl bg-gray-900/80 border border-gray-800 hover:border-violet-500/50 p-6 transition-all duration-300 hover:shadow-xl hover:shadow-violet-950/30"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-gray-800 border border-gray-700/60">
                        {getTypeIcon(comp.type)}
                      </div>
                      <span className="text-xs uppercase font-semibold tracking-wider text-gray-400">
                        {comp.type}
                      </span>
                    </div>
                    {getStatusBadge(comp)}
                  </div>

                  <h3 className="text-xl font-bold text-gray-100 group-hover:text-violet-300 transition-colors line-clamp-1">
                    {comp.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-400 line-clamp-2">
                    {comp.description}
                  </p>

                  {comp.topics?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {comp.topics.slice(0, 3).map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md text-xs bg-gray-800/80 text-gray-300 border border-gray-700/40"
                        >
                          {t}
                        </span>
                      ))}
                      {comp.topics.length > 3 && (
                        <span className="px-1.5 py-0.5 rounded-md text-xs bg-gray-800 text-gray-400">
                          +{comp.topics.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-5 grid grid-cols-2 gap-3 pt-4 border-t border-gray-800 text-xs text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="h-4 w-4 text-violet-400 shrink-0" />
                      <span>{comp.durationMinutes} mins</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrophyIcon className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>{comp.totalMarks} Marks</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <CalendarDaysIcon className="h-4 w-4 text-cyan-400 shrink-0" />
                      <span>{start.toLocaleDateString()} {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-800/80 flex items-center justify-between gap-3">
                  <Link
                    to={`/competitions/${comp._id}/leaderboard`}
                    className="text-xs text-gray-400 hover:text-violet-300 font-medium transition-colors"
                  >
                    Leaderboard
                  </Link>

                  <div className="flex items-center gap-2">
                    {user && (user.role === 'admin' || user.role === 'organizer') && (
                      <Link
                        to={`/competitions/${comp._id}/manage`}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
                      >
                        Manage
                      </Link>
                    )}

                    {hasSubmitted ? (
                      <Link
                        to={`/competitions/${comp._id}/leaderboard`}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 hover:bg-emerald-900/50 transition-colors"
                      >
                        Score: {comp.myAssignment.score}/{comp.myAssignment.totalPossibleScore}
                      </Link>
                    ) : inProgress ? (
                      <button
                        onClick={() => navigate(enterPath)}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 transition-colors animate-pulse"
                      >
                        Resume Arena
                        <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                      </button>
                    ) : isLive ? (
                      <button
                        onClick={() => navigate(enterPath)}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 shadow-md shadow-violet-600/30 transition-all hover:scale-105"
                      >
                        Enter Arena
                        <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                      </button>
                    ) : isFinished ? (
                      <Link
                        to={`/competitions/${comp._id}/leaderboard`}
                        className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
                      >
                        View Results
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-500 font-medium px-2 py-1 bg-gray-800/50 rounded-md">
                        Opens Soon
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Competitions;
