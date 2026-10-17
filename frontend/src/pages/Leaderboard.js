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
  UserCircleIcon
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

  const rankings = leaderboard?.rankings || [];
  const filteredRankings = rankings.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.department && r.department.toLowerCase().includes(search.toLowerCase()))
  );

  const top3 = rankings.slice(0, 3);

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
        <div className="p-6 rounded-2xl bg-gradient-to-r from-violet-950/60 to-indigo-950/60 border border-violet-700/50 shadow-xl space-y-3">
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-3 rounded-xl bg-gray-900/60 border border-gray-800">
              <span className="text-xs text-gray-400">Score</span>
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
                  <span className="text-lg font-extrabold text-white">{p.score} pts</span>
                  <span className="text-xs text-gray-400 font-mono">
                    {Math.floor(p.timeTakenSeconds / 60)}m {p.timeTakenSeconds % 60}s
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
