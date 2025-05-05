import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { format } from 'date-fns';
import {
  CalendarIcon,
  MapPinIcon,
  UserGroupIcon,
  FunnelIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  TagIcon
} from '@heroicons/react/24/outline';
import EventRegistration from '../components/EventRegistration';
import { useNavigate } from 'react-router-dom';

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
  const navigate = useNavigate();

  // Add backend base URL
  const backendUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  useEffect(() => {
    fetchEvents();
  }, [filters]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Get token from localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to view events');
        setLoading(false);
        return;
      }

      const response = await axios.get(`${backendUrl}/api/events`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: filters
      });
      
      setEvents(response.data);
    } catch (err) {
      console.error('Error fetching events:', err);
      if (err.response?.status === 401) {
        setError('Please log in to view events');
      } else {
        setError('Failed to fetch events. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBookEvent = (event) => {
    if (user?.role === 'student') {
      setSelectedEvent(event);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (window.confirm('Are you sure you want to delete this event?')) {
      try {
        setError('');
        const token = localStorage.getItem('token');
        if (!token) {
          setError('Please log in to delete events');
          return;
        }
        
        await axios.delete(`${backendUrl}/api/events/${eventId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        // Remove the deleted event from the state
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
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-100 mb-4">Please Log In</h2>
            <p className="text-gray-300 mb-6">You need to be logged in to view events.</p>
            <Link
              to="/login"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-violet-600 hover:bg-violet-700"
            >
              Log In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-100">Events</h1>
          {user && (user.role === 'admin' || user.role === 'organizer') && (
            <Link
              to="/create-event"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
            >
              Create Event
            </Link>
          )}
          <div className="flex space-x-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-700 rounded-md leading-5 bg-gray-800 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-violet-500 focus:border-violet-500 sm:text-sm"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="inline-flex items-center px-4 py-2 border border-gray-700 rounded-md shadow-sm text-sm font-medium text-gray-100 bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
              >
                <FunnelIcon className="h-5 w-5 text-gray-300" />
                <span className="ml-2">Filter</span>
              </button>
              {isFilterOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1">
                    <button
                      onClick={() => setSelectedType('all')}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        selectedType === 'all' ? 'text-violet-400' : 'text-gray-300'
                      } hover:bg-gray-700`}
                    >
                      All Types
                    </button>
                    <button
                      onClick={() => setSelectedType('academic')}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        selectedType === 'academic' ? 'text-violet-400' : 'text-gray-300'
                      } hover:bg-gray-700`}
                    >
                      Academic
                    </button>
                    <button
                      onClick={() => setSelectedType('cultural')}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        selectedType === 'cultural' ? 'text-violet-400' : 'text-gray-300'
                      } hover:bg-gray-700`}
                    >
                      Cultural
                    </button>
                    <button
                      onClick={() => setSelectedType('sports')}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        selectedType === 'sports' ? 'text-violet-400' : 'text-gray-300'
                      } hover:bg-gray-700`}
                    >
                      Sports
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-300">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="text-center text-gray-300">No events found</div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <div
                key={event._id}
                className="bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700"
              >
                {event.photo && (
                  <img
                    src={`${backendUrl}${event.photo}`}
                    alt={event.title}
                    className="w-full h-48 object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '/images/no-image.png';
                    }}
                  />
                )}
                <div className="p-6">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-medium text-gray-100">
                      {event.title}
                    </h3>
                    {(user?.role === 'admin' || user?.role === 'organizer') && (
                      <button
                        onClick={() => handleDeleteEvent(event._id)}
                        className="text-red-400 hover:text-red-300 transition-colors duration-200"
                        title="Delete event"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-300">{event.description}</p>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center text-sm text-gray-300">
                      <CalendarIcon className="h-5 w-5 mr-2 text-gray-400" />
                      {format(new Date(event.date), 'PPP')} at {event.time}
                    </div>
                    <div className="flex items-center text-sm text-gray-300">
                      <MapPinIcon className="h-5 w-5 mr-2 text-gray-400" />
                      {event.location}
                    </div>
                    <div className="flex items-center text-sm text-gray-300">
                      <UserGroupIcon className="h-5 w-5 mr-2 text-gray-400" />
                      {event.attendees.length}/{event.capacity} attendees
                    </div>
                    <div className="flex items-center text-sm text-gray-300">
                      <TagIcon className="h-5 w-5 mr-2 text-gray-400" />
                      {event.type.charAt(0).toUpperCase() + event.type.slice(1)}
                    </div>
                  </div>
                  <div className="mt-6">
                    {user?.role === 'student' && (
                      <button
                        onClick={() => handleBookEvent(event)}
                        className="w-full bg-violet-600 text-white py-2 px-4 rounded-md hover:bg-violet-700 transition-colors duration-200"
                      >
                        Book Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedEvent && (
        <EventRegistration
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
};

export default Events; 