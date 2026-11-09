import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { getBackendUrl } from '../../utils/apiConfig';
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  MapPinIcon,
  CheckBadgeIcon,
  EyeIcon,
  TrophyIcon
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
        link.setAttribute(
          'download',
          `${(eventTitle || 'event').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_certificate.pdf`
        );
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
        link.setAttribute(
          'download',
          `${(compTitle || 'competition').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_merit_certificate.pdf`
        );
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
        <p className="text-[15px] text-[#aaa398]">Please sign in to view your profile and certificates.</p>
      </div>
    );
  }

  const totalCertificates = registrations.length + compCertificates.length;

  return (
    <div className="space-y-8">
      {/* Profile Header Card */}
      <div className="rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-[12px] bg-[#262421] border border-[#efe9de]/[0.12] flex items-center justify-center text-[#ebb05d] font-medium text-[22px] shrink-0">
            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] sm:text-[24px] font-medium text-[#efe9de] tracking-[-0.015em]">
                {user.name}
              </h1>
              <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08] capitalize">
                {user.role}
              </span>
            </div>
            <p className="text-[14px] text-[#aaa398] mt-0.5 truncate">{user.email}</p>
            {user.department && (
              <p className="text-[12px] font-mono text-[#8a847a] mt-1">{user.department}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[#efe9de]/[0.08] rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.08] py-3 px-2 shrink-0">
          <div className="px-4 text-center">
            <span className="block text-[22px] font-medium text-[#efe9de] font-mono tabular-nums leading-none">
              {registrations.length}
            </span>
            <span className="block text-[12px] text-[#8a847a] mt-1.5">Events joined</span>
          </div>
          <div className="px-4 text-center">
            <span className="block text-[22px] font-medium text-[#ebb05d] font-mono tabular-nums leading-none">
              {compCertificates.length}
            </span>
            <span className="block text-[12px] text-[#8a847a] mt-1.5">Contests</span>
          </div>
          <div className="px-4 text-center">
            <span className="block text-[22px] font-medium text-[#4cc38a] font-mono tabular-nums leading-none">
              {totalCertificates}
            </span>
            <span className="block text-[12px] text-[#8a847a] mt-1.5">Certificates</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
          {error}
        </div>
      )}

      {/* Main Certificates Hub */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#efe9de]/[0.08]">
          <div>
            <h2 className="text-[20px] font-medium text-[#efe9de] tracking-[-0.01em]">
              Certificates and credentials
            </h2>
            <p className="text-[13px] text-[#aaa398] mt-1">
              Landscape PDF certificates with scores, rankings, and verification IDs.
            </p>
          </div>

          <div className="inline-flex p-1 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] gap-1 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`h-8 px-3 rounded-[6px] text-[13px] font-medium transition-colors duration-150 tabular-nums ${
                activeTab === 'all'
                  ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                  : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
              }`}
            >
              All ({totalCertificates})
            </button>
            <button
              onClick={() => setActiveTab('competitions')}
              className={`h-8 px-3 rounded-[6px] text-[13px] font-medium transition-colors duration-150 tabular-nums ${
                activeTab === 'competitions'
                  ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                  : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
              }`}
            >
              Competitions ({compCertificates.length})
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`h-8 px-3 rounded-[6px] text-[13px] font-medium transition-colors duration-150 tabular-nums ${
                activeTab === 'events'
                  ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                  : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
              }`}
            >
              Events ({registrations.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-7 h-7 border-2 border-[#e09132] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : totalCertificates === 0 ? (
          <div className="text-center py-16 bg-[#1c1a18] rounded-[14px] border border-[#efe9de]/[0.08] px-6">
            <AcademicCapIcon className="mx-auto h-8 w-8 text-[#8a847a] mb-3" strokeWidth={1.5} />
            <h3 className="text-[16px] font-medium text-[#efe9de]">No certificates earned yet</h3>
            <p className="text-[13px] text-[#8a847a] mt-1 max-w-sm mx-auto">
              Register for campus events or submit a timed competition to receive downloadable PDF certificates.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Competition Merit Certificates */}
            {(activeTab === 'all' || activeTab === 'competitions') && compCertificates.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrophyIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                    <h3 className="text-[16px] font-medium text-[#efe9de]">
                      Competition merit certificates
                    </h3>
                  </div>
                  <span className="text-[12px] font-mono text-[#8a847a] tabular-nums">
                    {compCertificates.length} issued
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
                        className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16] transition-colors duration-150 p-6 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-[#efe9de]/[0.06]">
                            <span className="text-[12px] font-mono text-[#ebb05d]">Merit credential</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25">
                              <CheckBadgeIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                              <span>Verified</span>
                            </span>
                          </div>

                          <h4 className="text-[16px] font-medium text-[#efe9de] line-clamp-2">{cert.title}</h4>

                          <div className="mt-2 flex items-center gap-2 text-[12px] font-mono text-[#8a847a]">
                            <span className="px-2 py-0.5 rounded-[6px] bg-[#262421] text-[#aaa398] border border-[#efe9de]/[0.06]">
                              {cert.type === 'coding'
                                ? 'Coding'
                                : cert.type === 'hybrid'
                                  ? 'Hybrid'
                                  : 'Quiz'}
                            </span>
                            <span>{submitDateStr}</span>
                          </div>

                          <div className="mt-4 p-3 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.06] grid grid-cols-3 divide-x divide-[#efe9de]/[0.06] text-center font-mono tabular-nums">
                            <div>
                              <span className="block text-[11px] font-sans text-[#8a847a]">Score</span>
                              <span className="text-[13px] font-medium text-[#efe9de]">
                                {cert.score}/{cert.totalPossibleScore}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[11px] font-sans text-[#8a847a]">Accuracy</span>
                              <span className="text-[13px] font-medium text-[#4cc38a]">{cert.percentage}%</span>
                            </div>
                            <div>
                              <span className="block text-[11px] font-sans text-[#8a847a]">Rank</span>
                              <span className="text-[13px] font-medium text-[#ebb05d]">
                                {cert.rank ? `#${cert.rank}` : '—'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 space-y-1 text-[12px] text-[#8a847a]">
                            {cert.department && <p>Department: {cert.department}</p>}
                            <p className="font-mono truncate">ID: {cert.certificateId}</p>
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-[#efe9de]/[0.06] flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadCompCertificate(cert.competitionId, cert.title, true)}
                            disabled={isDownloading}
                            className="btn-secondary flex-1 h-9 text-[13px]"
                            title="Preview certificate in a new tab"
                          >
                            <EyeIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                            <span>Preview</span>
                          </button>

                          <button
                            onClick={() => handleDownloadCompCertificate(cert.competitionId, cert.title, false)}
                            disabled={isDownloading}
                            className="btn-primary flex-1 h-9 text-[13px]"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4" strokeWidth={1.5} />
                            <span>{isDownloading ? 'Exporting...' : 'PDF'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Event Participation Certificates */}
            {(activeTab === 'all' || activeTab === 'events') && registrations.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AcademicCapIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                    <h3 className="text-[16px] font-medium text-[#efe9de]">
                      Event participation certificates
                    </h3>
                  </div>
                  <span className="text-[12px] font-mono text-[#8a847a] tabular-nums">
                    {registrations.length} issued
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
                        className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16] transition-colors duration-150 p-6 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-[#efe9de]/[0.06]">
                            <span className="text-[12px] font-mono text-[#aaa398]">Event pass</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[12px] bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25">
                              <CheckBadgeIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                              <span>Issued</span>
                            </span>
                          </div>

                          <h4 className="text-[16px] font-medium text-[#efe9de] line-clamp-2">
                            {event.title || 'Campus Event'}
                          </h4>

                          <div className="mt-3 space-y-1.5 text-[13px] text-[#aaa398]">
                            {event.department && <p>{event.department}</p>}
                            <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
                              <CalendarDaysIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                              <span>{eventDateStr}</span>
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-2">
                                <MapPinIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                                <span className="truncate">{event.location}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-3 border-t border-[#efe9de]/[0.06] text-[12px] font-mono text-[#8a847a] tabular-nums">
                            <span>Reg no: </span>
                            <span className="text-[#efe9de]">{reg.regNo || user.email?.split('@')[0]}</span>
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-[#efe9de]/[0.06] flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadEventCertificate(event._id, event.title, true)}
                            disabled={!event._id || isDownloading}
                            className="btn-secondary flex-1 h-9 text-[13px]"
                            title="Preview certificate in new tab"
                          >
                            <EyeIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                            <span>Preview</span>
                          </button>

                          <button
                            onClick={() => handleDownloadEventCertificate(event._id, event.title, false)}
                            disabled={!event._id || isDownloading}
                            className="btn-primary flex-1 h-9 text-[13px]"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4" strokeWidth={1.5} />
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
