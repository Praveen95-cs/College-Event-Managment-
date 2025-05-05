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
  ClockIcon
} from '@heroicons/react/24/outline';

const EventDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showMotivationForm, setShowMotivationForm] = useState(false);
  const [newQuote, setNewQuote] = useState({ text: '', author: '' });
  const [newTip, setNewTip] = useState('');

  useEffect(() => {
    fetchEventDetails();
  }, [id]);

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
    if (window.confirm('Are you sure you want to delete this event?')) {
      try {
        await axios.delete(`/api/events/${id}`);
        navigate('/events');
      } catch (error) {
        console.error('Error deleting event:', error);
      }
    }
  };

  const handleGenerateMotivation = async () => {
    try {
      await axios.post(`/api/motivation/generate/${id}`);
      fetchEventDetails();
    } catch (error) {
      console.error('Error generating motivation content:', error);
    }
  };

  const handleAddQuote = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`/api/motivation/${id}`, {
        quotes: [...event.motivationContent.quotes, newQuote]
      });
      setNewQuote({ text: '', author: '' });
      setShowMotivationForm(false);
      fetchEventDetails();
    } catch (error) {
      console.error('Error adding quote:', error);
    }
  };

  const handleAddTip = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`/api/motivation/${id}`, {
        tips: [...event.motivationContent.tips, { text: newTip }]
      });
      setNewTip('');
      setShowMotivationForm(false);
      fetchEventDetails();
    } catch (error) {
      console.error('Error adding tip:', error);
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

        {/* Motivation Section */}
        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-medium text-gray-900">Motivation Content</h4>
            {(isOrganizer || isAdmin) && (
              <div className="flex space-x-4">
                <button
                  onClick={handleGenerateMotivation}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Generate Content
                </button>
                <button
                  onClick={() => setShowMotivationForm(!showMotivationForm)}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Add Manually
                </button>
              </div>
            )}
          </div>

          {showMotivationForm && (isOrganizer || isAdmin) && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h5 className="text-sm font-medium text-gray-900 mb-3">Add Quote</h5>
                  <form onSubmit={handleAddQuote} className="space-y-4">
                    <div>
                      <label htmlFor="quoteText" className="block text-sm font-medium text-gray-700">
                        Quote
                      </label>
                      <input
                        type="text"
                        id="quoteText"
                        value={newQuote.text}
                        onChange={(e) => setNewQuote({ ...newQuote, text: e.target.value })}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="quoteAuthor" className="block text-sm font-medium text-gray-700">
                        Author
                      </label>
                      <input
                        type="text"
                        id="quoteAuthor"
                        value={newQuote.author}
                        onChange={(e) => setNewQuote({ ...newQuote, author: e.target.value })}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      Add Quote
                    </button>
                  </form>
                </div>
                <div>
                  <h5 className="text-sm font-medium text-gray-900 mb-3">Add Tip</h5>
                  <form onSubmit={handleAddTip} className="space-y-4">
                    <div>
                      <label htmlFor="tipText" className="block text-sm font-medium text-gray-700">
                        Tip
                      </label>
                      <input
                        type="text"
                        id="tipText"
                        value={newTip}
                        onChange={(e) => setNewTip(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      Add Tip
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h5 className="text-sm font-medium text-gray-900 mb-3">Motivational Quotes</h5>
              <div className="space-y-4">
                {event.motivationContent?.quotes.map((quote, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-900 italic">"{quote.text}"</p>
                    <p className="text-gray-500 text-sm mt-2">- {quote.author}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h5 className="text-sm font-medium text-gray-900 mb-3">Success Tips</h5>
              <div className="space-y-4">
                {event.motivationContent?.tips.map((tip, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-gray-900">{tip.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          {isAuthenticated && !isOrganizer && (
            <div className="flex justify-end">
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
        </div>
      </div>
    </div>
  );
};

export default EventDetails; 