import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { format } from 'date-fns';
import {
  CalendarIcon,
  MapPinIcon,
  UserGroupIcon,
  PencilIcon,
  TrashIcon,
  ArrowLeftIcon,
  TrophyIcon,
  SparklesIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';

import { getBackendUrl } from '../utils/apiConfig';

const EventDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventCompetitions, setEventCompetitions] = useState([]);
  const backendUrl = getBackendUrl();

  useEffect(() => {
    fetchEventDetails();
    fetchEventCompetitions();
  }, [id]);

  const fetchEventCompetitions = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/competitions?eventId=${id}`);
      setEventCompetitions(res.data);
    } catch (err) {
      // Non-critical
    }
  };

  const fetchEventDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/events/${id}`);
      setEvent(response.data);
    } catch (error) {
      setError('Error fetching event details');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookEvent = async () => {
    try {
      await axios.post(`/api/events/${id}/book`);
      fetchEventDetails();
    } catch (error) {
      console.error('Error booking event:', error);
    }
  };

  const handleCancelBooking = async () => {
    try {
      await axios.post(`/api/events/${id}/cancel`);
      fetchEventDetails();
    } catch (error) {
      console.error('Error cancelling booking:', error);
    }
  };

  const handleDeleteEvent = async () => {
    if (window.confirm('Are you sure you want to permanently delete this event? This will remove all bookings, linked competitions, and photos to clean up database space.')) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${backendUrl}/api/events/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        navigate('/events');
      } catch (error) {
        console.error('Error deleting event:', error);
        alert(error.response?.data?.message || 'Failed to delete event');
      }
    }
  };

  const handleDownloadRegistrations = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/registrations/event/${id}/export`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        responseType: 'blob'
      });

      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_registrations.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading registrations:', error);
    }
  };

  const handleDownloadCertificate = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/registrations/event/${id}/certificate`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        responseType: 'blob'
      });

      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `${event.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_certificate.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading certificate:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || 'Event not found'}</p>
        <button
          onClick={() => navigate('/events')}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Events
        </button>
      </div>
    );
  }

  const isAttending = event.attendees.some(a => a._id === user?._id);
  const isOrganizer = event.organizer._id === user?._id;
  const isAdmin = user?.role === 'admin';

  const imageUrl = event.photo && event.photo !== '' ? event.photo : '/images/no-image.png';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <button
          onClick={() => navigate('/events')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Events
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <img
          src={imageUrl}
          alt={event.title}
          className="w-full h-64 object-cover object-center"
        />
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {event.title}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Organized by {event.organizer.name}
            </p>
          </div>
          {(isOrganizer || isAdmin) && (
            <div className="flex space-x-4">
              <button
                onClick={() => navigate(`/events/${id}/edit`)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <PencilIcon className="h-4 w-4 mr-2" />
                Edit
              </button>
              <button
                onClick={handleDeleteEvent}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                <TrashIcon className="h-4 w-4 mr-2" />
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Date & Time</dt>
              <dd className="mt-1 text-sm text-gray-900 flex items-center">
                <CalendarIcon className="h-5 w-5 mr-2 text-gray-400" />
                {format(new Date(event.date), 'PPP')} at {event.time}
              </dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Location</dt>
              <dd className="mt-1 text-sm text-gray-900 flex items-center">
                <MapPinIcon className="h-5 w-5 mr-2 text-gray-400" />
                {event.location}
              </dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Capacity</dt>
              <dd className="mt-1 text-sm text-gray-900 flex items-center">
                <UserGroupIcon className="h-5 w-5 mr-2 text-gray-400" />
                {event.attendees.length}/{event.capacity} attendees
              </dd>
            </div>
            <div className="sm:col-span-1">
              <dt className="text-sm font-medium text-gray-500">Department</dt>
              <dd className="mt-1 text-sm text-gray-900">{event.department}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Description</dt>
              <dd className="mt-1 text-sm text-gray-900">{event.description}</dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Event Novelty Features</h4>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="text-sm font-semibold text-gray-900 mb-3">Highlights</h5>
              <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
                {(event.noveltyFeatures?.highlights?.length ? event.noveltyFeatures.highlights : ['Immersive campus experience', 'Interactive participation', 'Student recognition']).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="text-sm font-semibold text-gray-900 mb-3">Perks</h5>
              <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
                {(event.noveltyFeatures?.perks?.length ? event.noveltyFeatures.perks : ['Networking opportunities', 'Hands-on learning', 'Event certificate']).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="text-sm font-semibold text-gray-900 mb-3">Agenda</h5>
              <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
                {(event.noveltyFeatures?.agenda?.length ? event.noveltyFeatures.agenda : ['Welcome and registration', 'Main event sessions', 'Closing and awards']).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* AI Competition Arena Integration Card */}
        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrophyIcon className="h-6 w-6 text-amber-500" />
              <h4 className="text-lg font-bold text-gray-900">Event Competitions & AI Arenas</h4>
            </div>
            {(isOrganizer || isAdmin) && (
              <button
                onClick={() => navigate('/competitions/create')}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors shadow"
              >
                <SparklesIcon className="h-4 w-4 mr-1.5" />
                Add AI Competition
              </button>
            )}
          </div>

          {eventCompetitions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {eventCompetitions.map(comp => (
                <div key={comp._id} className="p-4 rounded-xl bg-violet-50/50 border border-violet-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-violet-200 text-violet-800">
                        {comp.type} ARENA
                      </span>
                      <span className="text-xs text-gray-500">{comp.durationMinutes} mins • {comp.totalMarks} marks</span>
                    </div>
                    <h5 className="font-bold text-gray-900 mt-2">{comp.title}</h5>
                    <p className="text-xs text-gray-600 line-clamp-2 mt-1">{comp.description}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-violet-200/60 flex items-center justify-between">
                    <button
                      onClick={() => navigate(`/competitions/${comp._id}/leaderboard`)}
                      className="text-xs font-medium text-violet-700 hover:text-violet-900"
                    >
                      Leaderboard
                    </button>
                    <button
                      onClick={() => navigate(comp.type === 'coding' ? `/competitions/${comp._id}/code` : `/competitions/${comp._id}/quiz`)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 shadow-sm"
                    >
                      Enter Arena
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-center text-sm text-gray-500">
              No online competitions currently attached to this event.
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          {isAuthenticated && user?.role === 'student' && (
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              {isAttending && (
                <button
                  onClick={handleDownloadCertificate}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-amber-500/50 text-sm font-semibold rounded-xl text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 shadow-md shadow-amber-950/20 transition-all"
                >
                  <AcademicCapIcon className="h-4 w-4 text-amber-400" />
                  <span>Download Certificate</span>
                </button>
              )}
              {isAttending ? (
                <button
                  onClick={handleCancelBooking}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                >
                  Cancel Booking
                </button>
              ) : (
                <button
                  onClick={handleBookEvent}
                  disabled={event.attendees.length >= event.capacity}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {event.attendees.length >= event.capacity ? 'Event Full' : 'Book Event'}
                </button>
              )}
            </div>
          )}

          {(isOrganizer || isAdmin) && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleDownloadRegistrations}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700"
              >
                Download Registrations Excel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventDetails; 