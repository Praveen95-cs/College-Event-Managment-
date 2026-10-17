import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getBackendUrl } from '../utils/apiConfig';
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  MapPinIcon,
  UserCircleIcon,
  CheckBadgeIcon,
  SparklesIcon,
  EyeIcon,
  TrophyIcon,
  BoltIcon
} from '@heroicons/react/24/outline';

const Profile = () => {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [compCertificates, setCompCertificates] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'competitions' | 'events'
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState('');
  const backendUrl = getBackendUrl();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const [regRes, compRes] = await Promise.allSettled([
          axios.get(`${backendUrl}/api/registrations/my`, { headers }),
          axios.get(`${backendUrl}/api/competitions/my-certificates`, { headers })
        ]);

        if (regRes.status === 'fulfilled') {
          setRegistrations(regRes.value.data || []);
        }
        if (compRes.status === 'fulfilled') {
          setCompCertificates(compRes.value.data || []);
        }
      } catch (err) {
        setError('Failed to fetch your event and competition certificates');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [backendUrl]);

  const handleDownloadEventCertificate = async (eventId, eventTitle, openInTab = false) => {
    try {
      setDownloadingId(`event_${eventId}`);
      setError('');
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/registrations/event/${eventId}/certificate`, {
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
        link.setAttribute('download', `${(eventTitle || 'event').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_certificate.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 60000);
    } catch (err) {
      console.error('Error downloading event certificate:', err);
      setError(err.response?.data?.message || 'Failed to download event certificate.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadCompCertificate = async (compId, compTitle, openInTab = false) => {
    try {
      setDownloadingId(`comp_${compId}`);
      setError('');
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/competitions/${compId}/certificate`, {
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
        link.setAttribute('download', `${(compTitle || 'competition').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_merit_certificate.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 60000);
    } catch (err) {
      console.error('Error downloading competition certificate:', err);
      setError(err.response?.data?.message || 'Failed to download competition certificate.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-gray-400">Please log in to view your profile and certificates.</p>
      </div>
    );
  }

  const totalCertificates = registrations.length + compCertificates.length;

  return (
    <div className="space-y-8">
      {/* Profile Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-violet-950/60 via-gray-900 to-indigo-950/50 border border-violet-800/40 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-violet-600/30 font-bold text-2xl">
              {user.name ? user.name.charAt(0).toUpperCase() : <UserCircleIcon className="h-10 w-10" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-100">{user.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-violet-900/60 text-violet-300 border border-violet-700/50">
                  {user.role}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-0.5">{user.email}</p>
              {user.department && (
                <p className="text-xs text-gray-500 mt-1">Department: {user.department}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 bg-gray-900/80 border border-gray-800 rounded-2xl p-4 text-center">
            <div>
              <span className="block text-2xl font-bold text-violet-400">{registrations.length}</span>
              <span className="text-xs text-gray-400">Events Joined</span>
            </div>
            <div className="h-8 w-px bg-gray-800"></div>
            <div>
              <span className="block text-2xl font-bold text-amber-400">{compCertificates.length}</span>
              <span className="text-xs text-gray-400">Contests Rated</span>
            </div>
            <div className="h-8 w-px bg-gray-800"></div>
            <div>
              <span className="block text-2xl font-bold text-emerald-400">{totalCertificates}</span>
              <span className="text-xs text-gray-400">Total Certs</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-800/60 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Main Certificates Hub */}
      <div className="space-y-6">
        {/* Section Header & Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <AcademicCapIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-100">Verified Credentials & Merit Certificates</h2>
              <p className="text-xs text-gray-400">Official landscape credentials with scores, rankings, and digital verification seals</p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 bg-gray-900 p-1 rounded-xl border border-gray-800">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All ({totalCertificates})
            </button>
            <button
              onClick={() => setActiveTab('competitions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'competitions'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Competitions ({compCertificates.length})
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'events'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Events ({registrations.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : totalCertificates === 0 ? (
          <div className="text-center py-16 bg-gray-900/40 rounded-2xl border border-gray-800 p-8">
            <AcademicCapIcon className="mx-auto h-12 w-12 text-gray-600 mb-3" />
            <h3 className="text-lg font-medium text-gray-200">No Certificates Earned Yet</h3>
            <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
              Join upcoming events or participate in AI quizzes and coding arenas to earn verified official certificates.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* COMPETITION MERIT CERTIFICATES SECTION */}
            {(activeTab === 'all' || activeTab === 'competitions') && compCertificates.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TrophyIcon className="h-5 w-5 text-amber-400" />
                  <h3 className="text-base font-bold text-gray-100">
                    Competition Merit & Score Certificates
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">
                    {compCertificates.length} Issued
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {compCertificates.map((cert) => {
                    const isDownloading = downloadingId === `comp_${cert.competitionId}`;
                    const submitDateStr = cert.submitTime
                      ? new Date(cert.submitTime).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'Recent';

                    return (
                      <div
                        key={cert.assignmentId}
                        className="group relative flex flex-col justify-between rounded-2xl bg-gradient-to-b from-gray-900 via-gray-900/90 to-gray-950 border border-amber-900/40 hover:border-amber-500/50 p-6 transition-all duration-300 shadow-xl hover:shadow-amber-950/30"
                      >
                        <div>
                          {/* Top Badges */}
                          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-gray-800/80">
                            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold uppercase tracking-wider">
                              <TrophyIcon className="h-4 w-4" />
                              <span>Merit Credential</span>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                              <CheckBadgeIcon className="h-3.5 w-3.5" />
                              Score Verified
                            </span>
                          </div>

                          <h4 className="text-lg font-bold text-gray-100 group-hover:text-amber-300 transition-colors line-clamp-2">
                            {cert.title}
                          </h4>

                          {/* Competition Type Tag */}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-violet-950/60 text-violet-300 border border-violet-800/50 uppercase">
                              <BoltIcon className="h-3 w-3" />
                              {cert.type === 'coding' ? 'Coding Arena' : cert.type === 'hybrid' ? 'Hybrid Contest' : 'AI Quiz'}
                            </span>
                            <span className="text-xs text-gray-400">{submitDateStr}</span>
                          </div>

                          {/* SCORE TAKEN SHOWCASE CARD */}
                          <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 border border-gray-800/80 grid grid-cols-3 gap-2 text-center">
                            <div>
                              <span className="block text-[10px] uppercase font-bold text-gray-400">Score</span>
                              <span className="text-sm font-extrabold text-indigo-300">
                                {cert.score} / {cert.totalPossibleScore}
                              </span>
                            </div>
                            <div className="border-x border-gray-800">
                              <span className="block text-[10px] uppercase font-bold text-gray-400">Accuracy</span>
                              <span className="text-sm font-extrabold text-emerald-400">
                                {cert.percentage}%
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-bold text-gray-400">Rank</span>
                              <span className="text-sm font-extrabold text-amber-400">
                                {cert.rank ? `#${cert.rank}` : 'Top Tier'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 space-y-1 text-xs text-gray-400">
                            {cert.department && (
                              <p className="text-gray-400">Dept: <span className="text-gray-300 font-medium">{cert.department}</span></p>
                            )}
                            <div className="text-[11px] font-mono text-gray-400 truncate">
                              ID: <span className="text-gray-400">{cert.certificateId}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-6 pt-4 border-t border-gray-800 flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadCompCertificate(cert.competitionId, cert.title, true)}
                            disabled={isDownloading}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-50"
                            title="Preview certificate in a new tab"
                          >
                            <EyeIcon className="h-3.5 w-3.5 text-gray-400" />
                            <span>Preview</span>
                          </button>

                          <button
                            onClick={() => handleDownloadCompCertificate(cert.competitionId, cert.title, false)}
                            disabled={isDownloading}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
                          >
                            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                            <span>{isDownloading ? 'Exporting...' : 'PDF'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* EVENT PARTICIPATION CERTIFICATES SECTION */}
            {(activeTab === 'all' || activeTab === 'events') && registrations.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AcademicCapIcon className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-gray-100">
                    Campus Event Participation Certificates
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
                    {registrations.length} Issued
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {registrations.map((reg) => {
                    const event = reg.event || {};
                    const eventDateStr = event.date
                      ? new Date(event.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'Recent';

                    const isDownloading = downloadingId === `event_${event._id}`;

                    return (
                      <div
                        key={reg._id}
                        className="group relative flex flex-col justify-between rounded-2xl bg-gradient-to-b from-gray-900 via-gray-900/90 to-gray-950 border border-gray-800 hover:border-indigo-500/40 p-6 transition-all duration-300 shadow-xl hover:shadow-indigo-950/20"
                      >
                        <div>
                          {/* Top Certificate Header Badge */}
                          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-gray-800/80">
                            <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold tracking-wider uppercase">
                              <SparklesIcon className="h-4 w-4" />
                              <span>Verified Event</span>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                              <CheckBadgeIcon className="h-3.5 w-3.5" />
                              Issued
                            </span>
                          </div>

                          <h4 className="text-lg font-bold text-gray-100 group-hover:text-indigo-300 transition-colors line-clamp-2">
                            {event.title || 'Campus Event'}
                          </h4>

                          <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                            {event.department && (
                              <p className="text-gray-300 font-medium">Dept: {event.department}</p>
                            )}
                            <div className="flex items-center gap-1 text-gray-400">
                              <CalendarDaysIcon className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                              <span>{eventDateStr}</span>
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-1 text-gray-400">
                                <MapPinIcon className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                <span className="truncate">{event.location}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-800/70 text-[11px] text-gray-400 font-mono">
                            <span>Roll / Reg No: </span>
                            <span className="text-gray-200">{reg.regNo || user.email?.split('@')[0]}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-6 pt-4 border-t border-gray-800 flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadEventCertificate(event._id, event.title, true)}
                            disabled={!event._id || isDownloading}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors disabled:opacity-50"
                            title="Preview certificate in new tab"
                          >
                            <EyeIcon className="h-3.5 w-3.5 text-gray-400" />
                            <span>Preview</span>
                          </button>

                          <button
                            onClick={() => handleDownloadEventCertificate(event._id, event.title, false)}
                            disabled={!event._id || isDownloading}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
                          >
                            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                            <span>{isDownloading ? 'Exporting...' : 'PDF'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;