import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { getBackendUrl } from '../../utils/apiConfig';
import {
  CheckCircleIcon,
  XMarkIcon,
  CalendarDaysIcon,
  MapPinIcon,
  TicketIcon
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

const EventRegistration = ({ event, onClose, onRegistered }) => {
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

      const reg = response.data.registration || response.data;
      setConfirmedRegistration(reg);
      setBookingSuccess(true);
      onRegistered?.(reg);
    } catch (err) {
      console.error('Error booking event:', err);
      try {
        const token = localStorage.getItem('token');
        const fallbackRes = await axios.post(
          `${backendUrl}/api/events/${event._id}/book`,
          {
            regNo: formData.regNo.trim(),
            needsAccommodation: formData.needsAccommodation
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const reg = fallbackRes.data.registration || fallbackRes.data;
        setConfirmedRegistration(reg);
        setBookingSuccess(true);
        onRegistered?.(reg);
      } catch (fallbackErr) {
        const msg =
          fallbackErr.response?.data?.message ||
          err.response?.data?.message ||
          'Failed to book event. Please try again.';
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
      <div className="bg-[#1c1a18] border border-[#efe9de]/[0.12] rounded-[16px] p-6 sm:p-7 max-w-lg w-full shadow-[0_16px_48px_rgba(0,0,0,0.5)] relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-[8px] text-[#8a847a] hover:text-[#efe9de] hover:bg-[#262421] transition-colors duration-150"
          aria-label="Close modal"
        >
          <XMarkIcon className="h-5 w-5" strokeWidth={1.5} />
        </button>

        {bookingSuccess ? (
          <div className="py-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-[10px] bg-[#4cc38a]/15 border border-[#4cc38a]/30 text-[#4cc38a] shrink-0">
                <CheckCircleIcon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-[20px] font-medium text-[#efe9de]">Registration confirmed</h3>
                <p className="text-[13px] text-[#aaa398]">
                  Seat reserved for <span className="text-[#efe9de] font-medium">{event.title}</span>.
                </p>
              </div>
            </div>

            <div className="mt-5 bg-[#161513] border border-[#efe9de]/[0.08] rounded-[10px] p-4 space-y-2.5 text-[13px]">
              <div className="flex items-center gap-2 text-[12px] text-[#8a847a] pb-2 border-b border-[#efe9de]/[0.06]">
                <TicketIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                <span>Pass details</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a847a]">Attendee</span>
                <span className="font-medium text-[#efe9de]">{formData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a847a]">Registration number</span>
                <span className="font-mono text-[#ebb05d] tabular-nums">
                  {formData.regNo || confirmedRegistration?._id || 'CONFIRMED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a847a]">Admission</span>
                <span className="font-medium text-[#4cc38a]">Free</span>
              </div>
              {formData.needsAccommodation && (
                <div className="flex justify-between">
                  <span className="text-[#8a847a]">Accommodation</span>
                  <span className="text-[#ebb05d]">Requested</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link to="/profile" className="btn-primary flex-1 h-10 text-[13px]">
                View in profile
              </Link>
              <button type="button" onClick={onClose} className="btn-secondary flex-1 h-10 text-[13px]">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="pr-8 mb-5">
              <span className="inline-block px-2 py-0.5 rounded-[6px] text-[12px] font-medium bg-[#262421] border border-[#efe9de]/[0.08] text-[#ebb05d] mb-2">
                Free event registration
              </span>
              <h2 className="text-[20px] font-medium text-[#efe9de] leading-snug">{event.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#aaa398] font-mono tabular-nums">
                {formattedDate && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDaysIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                    {formattedDate} {event.time && `· ${event.time}`}
                  </span>
                )}
                {event.location && (
                  <span className="flex items-center gap-1.5 font-sans">
                    <MapPinIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                    {event.location}
                  </span>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5" htmlFor="name">
                  Full name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="Your full name"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#aaa398] mb-1.5" htmlFor="regNo">
                  Student registration or roll number
                </label>
                <input
                  type="text"
                  id="regNo"
                  name="regNo"
                  value={formData.regNo}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. 21CS045"
                  className="input-field font-mono"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-[#aaa398] select-none pt-1">
                <input
                  type="checkbox"
                  name="needsAccommodation"
                  checked={formData.needsAccommodation}
                  onChange={handleInputChange}
                  className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132] focus:ring-offset-[#1c1a18]"
                />
                <span>I require campus accommodation assistance</span>
              </label>

              <div className="pt-4 border-t border-[#efe9de]/[0.08] flex justify-end gap-3">
                <button type="button" onClick={onClose} className="btn-secondary h-10 px-4 text-[13px]">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn-primary h-10 px-5 text-[13px]">
                  {loading ? 'Confirming...' : 'Confirm registration'}
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
