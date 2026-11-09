import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { format } from 'date-fns';
import {
  CalendarIcon,
  MapPinIcon,
  UserGroupIcon,
  FunnelIcon,
  TrashIcon,
  PencilIcon,
  MagnifyingGlassIcon,
  TagIcon,
  CurrencyRupeeIcon
} from '@heroicons/react/24/outline';
import EventRegistration from '../../components/events/EventRegistration';
import ClubLogo from '../../components/feed/ClubLogo';
import { resolveMediaUrl } from '../../utils/eventLifecycle';

const EVENT_TYPES = ['tech', 'non-tech', 'special', 'workshop'];

const Events = () => {
  const { user, isAuthenticated } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filters, setFilters] = useState({
    department: '',
    type: '',
    search: ''
  });

  const backendUrl =
    process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const response = await axios.get(
        token ? `${backendUrl}/api/events` : `${backendUrl}/api/events/public`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          params: {
            department: filters.department || undefined,
            type: filters.type || undefined,
            search: filters.search || undefined
          }
        }
      );
      setEvents(response.data);
    } catch (err) {
      console.error('Error fetching events:', err);
      if (err.response?.status === 401) {
        setError('Your session expired. Please log in again.');
      } else {
        setError('Failed to fetch events. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  }, [backendUrl, filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters({
        department: '',
        type: selectedType === 'all' ? '' : selectedType,
        search: searchQuery.trim()
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedType]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleBookEvent = (event) => {
    if (user?.role === 'student') {
      setSelectedEvent(event);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    try {
      setError('');
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to delete events');
        return;
      }
      await axios.delete(`${backendUrl}/api/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(events.filter(event => event._id !== eventId));
    } catch (err) {
      console.error('Error deleting event:', err);
      if (err.response?.status === 401) {
        setError('Please log in to delete events');
      } else if (err.response?.status === 403) {
        setError('You are not authorized to delete this event');
      } else {
        setError('Failed to delete event. Please try again.');
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-[#efe9de]/[0.08]">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15]">
            Campus events
          </h1>
          <p className="mt-1.5 text-[14px] text-[#aaa398]">
            Workshops, technical symposiums, and club sessions open for registration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user && (user.role === 'admin' || user.role === 'organizer') && (
            <Link to="/create-event" className="btn-primary h-9 px-4 text-[13px]">
              Create event
            </Link>
          )}

          <div className="relative">
            <MagnifyingGlassIcon
              className="h-4 w-4 text-[#8a847a] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              strokeWidth={1.5}
            />
            <input
              type="text"
              placeholder="Search events"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field h-9 py-0 pl-9 pr-3 w-56 text-[13px] leading-tight"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="btn-secondary h-9 px-3.5 text-[13px]"
            >
              <FunnelIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
              <span>{selectedType === 'all' ? 'All types' : selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}</span>
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-[10px] bg-[#1c1a18] border border-[#efe9de]/[0.12] shadow-[0_12px_32px_rgba(0,0,0,0.45)] z-20 py-1">
                <button
                  onClick={() => {
                    setSelectedType('all');
                    setIsFilterOpen(false);
                  }}
                  className={`block w-full text-left px-3.5 py-2 text-[13px] transition-colors duration-150 ${
                    selectedType === 'all' ? 'text-[#ebb05d] bg-[#262421]' : 'text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421]/60'
                  }`}
                >
                  All types
                </button>
                {EVENT_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type);
                      setIsFilterOpen(false);
                    }}
                    className={`block w-full text-left px-3.5 py-2 text-[13px] transition-colors duration-150 ${
                      selectedType === type ? 'text-[#ebb05d] bg-[#262421]' : 'text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421]/60'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="w-7 h-7 border-2 border-[#e09132] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
          <CalendarIcon className="h-8 w-8 text-[#8a847a] mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-[15px] font-medium text-[#efe9de]">No events found</p>
          <p className="text-[13px] text-[#8a847a] mt-1">Try adjusting your search or type filter.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const fee = Number(event.registrationFee || 0);
            const isPaidEvent = Boolean(event.isPaid && fee > 0);
            const currencySymbol = event.currency && event.currency !== 'INR' ? `${event.currency} ` : '₹';
            const feeLabel = isPaidEvent ? `${currencySymbol}${fee}` : 'Free';
            const canEditOrDelete =
              user?.role === 'admin' ||
              (user?.role === 'organizer' &&
                (!event.organizer || (event.organizer?._id || event.organizer) === user?._id));
            const isRegistered =
              Boolean(user?._id) &&
              Array.isArray(event.attendees) &&
              event.attendees.some((a) => (a._id || a) === user._id);
            const photoSrc = resolveMediaUrl(event.photo);

            return (
              <div
                key={event._id}
                className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16] transition-colors duration-150 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {photoSrc && (
                    <div className="aspect-[16/9] bg-[#12110f] overflow-hidden border-b border-[#efe9de]/[0.06]">
                      <img
                        src={photoSrc}
                        alt={event.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      {event.club ? (
                        <Link
                          to={`/clubs/${event.club._id}`}
                          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#aaa398] hover:text-[#efe9de] transition-colors min-w-0"
                        >
                          <ClubLogo club={event.club} size="sm" />
                          <span className="truncate">{event.club.name}</span>
                        </Link>
                      ) : (
                        <span className="text-[12px] font-mono text-[#8a847a]">{event.department}</span>
                      )}

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-mono border shrink-0 ${
                          isPaidEvent
                            ? 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/25'
                            : 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                        }`}
                      >
                        {isPaidEvent && <CurrencyRupeeIcon className="h-3 w-3" strokeWidth={1.75} />}
                        <span>{feeLabel}</span>
                      </span>
                    </div>

                    <div className="flex justify-between items-start gap-3">
                      <Link
                        to={`/events/${event._id}`}
                        className="text-[17px] font-medium text-[#efe9de] hover:text-[#ebb05d] transition-colors duration-150 leading-snug"
                      >
                        {event.title}
                      </Link>
                      {canEditOrDelete && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Link
                            to={`/events/${event._id}/edit`}
                            className="p-1.5 rounded-[6px] text-[#8a847a] hover:text-[#ebb05d] hover:bg-[#e09132]/10 transition-colors duration-150"
                            title="Edit event"
                          >
                            <PencilIcon className="h-4 w-4" strokeWidth={1.5} />
                          </Link>
                          <button
                            onClick={() => handleDeleteEvent(event._id)}
                            className="p-1.5 rounded-[6px] text-[#8a847a] hover:text-[#e5484d] hover:bg-[#e5484d]/10 transition-colors duration-150"
                            title="Delete event"
                          >
                            <TrashIcon className="h-4 w-4" strokeWidth={1.5} />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="mt-2 text-[13px] text-[#aaa398] line-clamp-2 leading-relaxed">
                      {event.description}
                    </p>

                    <div className="mt-4 space-y-2 text-[13px] text-[#aaa398]">
                      <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
                        <CalendarIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                        <span>
                          {event.date ? `${format(new Date(event.date), 'MMM d, yyyy')} · ${event.time}` : event.time}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPinIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                        <span className="truncate">{event.location}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
                        <UserGroupIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                        <span>
                          {event.attendees?.length || 0} / {event.capacity} seats filled
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TagIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                        <span>{event.type ? event.type.charAt(0).toUpperCase() + event.type.slice(1) : 'Event'}</span>
                      </div>
                    </div>

                    {(event.noveltyFeatures?.certificateEnabled || event.noveltyFeatures?.highlights?.length > 0) && (
                      <div className="mt-4 pt-3 border-t border-[#efe9de]/[0.06] flex flex-wrap items-center gap-2">
                        {event.noveltyFeatures?.certificateEnabled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[12px] bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08]">
                            Certificate included
                          </span>
                        )}
                        {event.noveltyFeatures?.highlights?.length > 0 && (
                          <span className="text-[12px] text-[#8a847a] truncate">
                            {event.noveltyFeatures.highlights[0]}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-6 pb-6 pt-0 flex items-center gap-2">
                  {user?.role === 'student' &&
                    (isRegistered ? (
                      <Link
                        to={`/events/${event._id}`}
                        className="flex-1 h-9 inline-flex items-center justify-center rounded-[8px] text-[12px] font-medium bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/30 hover:bg-[#4cc38a]/20 transition-colors"
                      >
                        View pass / status
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleBookEvent(event)}
                        className="btn-primary flex-1 h-9 text-[13px]"
                      >
                        {isPaidEvent ? `Pay ${feeLabel} & reserve` : 'Reserve seat'}
                      </button>
                    ))}
                  {!isAuthenticated && (
                    <Link to="/login" className="btn-primary flex-1 h-9 text-[13px]">
                      Sign in to register
                    </Link>
                  )}
                  <Link
                    to={`/events/${event._id}`}
                    className={`btn-secondary h-9 text-[13px] ${
                      user?.role === 'student' || !isAuthenticated ? 'px-3.5' : 'flex-1'
                    }`}
                  >
                    Details
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedEvent && (
        <EventRegistration
          event={selectedEvent}
          onClose={() => {
            setSelectedEvent(null);
            fetchEvents();
          }}
        />
      )}
    </div>
  );
};

export default Events;
