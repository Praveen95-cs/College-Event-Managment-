import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const Profile = () => {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchUserRegistrations = async () => {
      try {
        const response = await axios.get(`${backendUrl}/api/registrations/my`);
        setRegistrations(response.data);
      } catch (err) {
        setError('Failed to fetch your registrations');
      } finally {
        setLoading(false);
      }
    };

    fetchUserRegistrations();
  }, [backendUrl]);

  const handleDownloadCertificate = async (eventId, eventTitle) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/registrations/event/${eventId}/certificate`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        responseType: 'blob'
      });

      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `${eventTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_certificate.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to download certificate');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl">Please log in to view your profile</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Profile Information</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Personal details and events.</p>
          </div>
          <div className="border-t border-gray-200">
            <dl>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Full name</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{user.name}</dd>
              </div>
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Email address</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{user.email}</dd>
              </div>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Role</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Your Certificates</h3>
          {loading ? (
            <p>Loading your registrations...</p>
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : registrations.length === 0 ? (
            <p>You haven't registered for any events yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {registrations.map((registration) => (
                <div key={registration._id} className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h4 className="text-lg font-medium text-gray-900">{registration.event?.title}</h4>
                    <p className="mt-1 text-sm text-gray-500">{registration.event?.department} • {registration.event?.location}</p>
                    <p className="mt-2 text-sm text-gray-600">Registration No: {registration.regNo}</p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {registration.status}
                      </span>
                      <button
                        onClick={() => handleDownloadCertificate(registration.event?._id, registration.event?.title || 'certificate')}
                        disabled={!registration.event?._id}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-white bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400"
                      >
                        Download Certificate
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile; 