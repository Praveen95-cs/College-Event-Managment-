import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import UPIPayment from './UPIPayment';

const EventRegistration = ({ event, onClose }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    regNo: '',
    needsAccommodation: false
  });
  const [error, setError] = useState('');
  const { user } = useAuth();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to register for events');
        return;
      }

      // First, register for the event
      const response = await axios.post(
        `${backendUrl}/api/events/register`,
        {
          eventId: event._id,
          name: formData.name,
          regNo: formData.regNo,
          needsAccommodation: formData.needsAccommodation
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.registrationId) {
        // Then, book the event
        await axios.post(
          `${backendUrl}/api/events/${event._id}/book`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        setStep(2);
      }
    } catch (err) {
      console.error('Error registering for event:', err);
      setError(err.response?.data?.message || 'Failed to register for event');
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  if (step === 1) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Register for {event.title}</h2>
          
          {error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="regNo">
                Registration Number
              </label>
              <input
                type="text"
                id="regNo"
                name="regNo"
                value={formData.regNo}
                onChange={handleInputChange}
                required
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              />
            </div>

            <div className="mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="needsAccommodation"
                  checked={formData.needsAccommodation}
                  onChange={handleInputChange}
                  className="mr-2"
                />
                <span className="text-gray-700 text-sm">I need accommodation</span>
              </label>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-violet-600 hover:bg-violet-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Proceed to Payment
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <UPIPayment
          amount={event.fee || 99}
          upiId="praveensumathi12@okicici"
          businessName="College Events"
        />
        <div className="mt-4 text-center">
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventRegistration; 