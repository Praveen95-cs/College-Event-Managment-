import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getBackendUrl } from '../utils/apiConfig';
import {
  CheckCircleIcon,
  XMarkIcon,
  CalendarDaysIcon,
  MapPinIcon,
  TicketIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

const EventRegistration = ({ event, onClose }) => {
  const { user } = useAuth();
  const backendUrl = getBackendUrl();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    regNo: user?.email ? user.email.split('@')[0] : '',
    needsAccommodation: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [confirmedRegistration, setConfirmedRegistration] = useState(null);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to register for events');
        setLoading(false);
        return;
      }

      // Register and book the event directly (free admission, no payment)
      const response = await axios.post(
        `${backendUrl}/api/events/register`,
        {
          eventId: event._id,
          name: formData.name.trim() || user?.name || 'Attendee',
          regNo: formData.regNo.trim(),
          needsAccommodation: formData.needsAccommodation
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setConfirmedRegistration(response.data.registration || response.data);
      setBookingSuccess(true);
    } catch (err) {
      console.error('Error booking event:', err);
      // Fallback attempt to /api/events/:id/book
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          `${backendUrl}/api/events/${event._id}/book`,
          {
            regNo: formData.regNo.trim(),
            needsAccommodation: formData.needsAccommodation
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setBookingSuccess(true);
      } catch (fallbackErr) {
        const msg = fallbackErr.response?.data?.message || err.response?.data?.message || 'Failed to book event. Please try again.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = event.date
    ? new Date(event.date).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        {bookingSuccess ? (
          /* Confirmation Success View */
          <div className="text-center py-4">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 mb-4 animate-bounce">
              <CheckCircleIcon className="h-10 w-10" />
            </div>

            <h3 className="text-2xl font-bold text-gray-100">Booking Confirmed!</h3>
            <p className="mt-1 text-sm text-gray-400">
              Your registration for <span className="text-violet-300 font-semibold">{event.title}</span> is complete.
            </p>

            <div className="mt-6 bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 text-left space-y-2 text-sm text-gray-300">
              <div className="flex items-center gap-2 text-xs text-gray-400 uppercase font-semibold tracking-wider">
                <TicketIcon className="h-4 w-4 text-violet-400" />
                <span>Ticket & Admission Details</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-700/50 text-xs">
                <span className="text-gray-400">Attendee:</span>
                <span className="font-medium text-gray-200">{formData.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Registration ID / No:</span>
                <span className="font-mono text-violet-300">{formData.regNo || confirmedRegistration?._id || 'CONFIRMED'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Fee:</span>
                <span className="font-semibold text-emerald-400">Free Admission</span>
              </div>
              {formData.needsAccommodation && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Accommodation:</span>
                  <span className="text-amber-300 font-medium">Requested</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link
                to="/profile"
                className="flex-1 inline-flex justify-center items-center px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 shadow-md shadow-violet-600/30 transition-colors"
              >
                View in My Profile
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 inline-flex justify-center items-center px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Registration Form View */
          <div>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-950/80 border border-violet-700/50 text-violet-300 mb-2">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  Free Event Registration
                </span>
                <h2 className="text-2xl font-bold text-gray-100">{event.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                  {formattedDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDaysIcon className="h-4 w-4 text-violet-400" />
                      {formattedDate} {event.time && `at ${event.time}`}
                    </span>
                  )}
                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPinIcon className="h-4 w-4 text-cyan-400" />
                      {event.location}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-red-200 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5" htmlFor="name">
                  Full Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter your name"
                  className="w-full px-3.5 py-2.5 bg-gray-800/90 border border-gray-700 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5" htmlFor="regNo">
                  Student Registration / Roll Number
                </label>
                <input
                  type="text"
                  id="regNo"
                  name="regNo"
                  value={formData.regNo}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. 21CS045"
                  className="w-full px-3.5 py-2.5 bg-gray-800/90 border border-gray-700 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-300 select-none">
                  <input
                    type="checkbox"
                    name="needsAccommodation"
                    checked={formData.needsAccommodation}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-violet-600 focus:ring-violet-500 focus:ring-offset-gray-900"
                  />
                  <span>I require campus accommodation assistance</span>
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 shadow-md shadow-violet-600/30 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                >
                  {loading ? 'Confirming Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventRegistration;