import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('events');
  const [organizerForm, setOrganizerForm] = useState({
    name: '',
    email: '',
    password: '',
    department: 'Computer Technology'
  });
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    try {
      const [eventsRes, usersRes] = await Promise.all([
        axios.get('/api/events'),
        axios.get('/api/users')
      ]);
      setEvents(eventsRes.data);
      setUsers(usersRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEventStatusChange = async (eventId, newStatus) => {
    try {
      await axios.patch(`/api/events/${eventId}`, { status: newStatus });
      setEvents(events.map(event =>
        event._id === eventId ? { ...event, status: newStatus } : event
      ));
    } catch (err) {
      setError('Failed to update event status');
    }
  };

  const handleUserRoleChange = async (userId, newRole) => {
    try {
      setError('');
      await axios.patch(`/api/users/${userId}`, { role: newRole });
      setUsers(users.map(item =>
        item._id === userId ? { ...item, role: newRole } : item
      ));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user role');
    }
  };

  const handleCreateOrganizer = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      const created = await axios.post('/api/users/organizers', organizerForm);
      setUsers([created.data, ...users]);
      setOrganizerForm({
        name: '',
        email: '',
        password: '',
        department: 'Computer Technology'
      });
      setSuccess('Organizer account created');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create organizer');
    } finally {
      setCreating(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-gray-100">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gray-800 shadow overflow-hidden sm:rounded-lg border border-gray-700">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-100">Admin Dashboard</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-400">
              Manage events and create organizer accounts. Admin accounts cannot be created here.
            </p>
          </div>

          <div className="border-t border-gray-700">
            <div className="border-b border-gray-700">
              <nav className="-mb-px flex">
                <button
                  onClick={() => setActiveTab('events')}
                  className={`${
                    activeTab === 'events'
                      ? 'border-violet-500 text-violet-300'
                      : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                >
                  Events
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`${
                    activeTab === 'users'
                      ? 'border-violet-500 text-violet-300'
                      : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                >
                  Users
                </button>
              </nav>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded relative m-4" role="alert">
                <span className="block sm:inline">{error}</span>
              </div>
            )}
            {success && (
              <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded relative m-4" role="alert">
                <span className="block sm:inline">{success}</span>
              </div>
            )}

            {loading ? (
              <div className="p-4 text-gray-300">Loading...</div>
            ) : activeTab === 'events' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Title</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Organizer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {events.map((event) => (
                      <tr key={event._id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">{event.title}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{event.organizer?.name || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {event.date ? new Date(event.date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            event.status === 'approved' ? 'bg-green-900 text-green-200' :
                            event.status === 'pending' ? 'bg-yellow-900 text-yellow-200' :
                            'bg-red-900 text-red-200'
                          }`}>
                            {event.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          <select
                            value={event.status}
                            onChange={(e) => handleEventStatusChange(event._id, e.target.value)}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 bg-gray-900 text-gray-100 focus:outline-none focus:ring-violet-500 focus:border-violet-500 sm:text-sm rounded-md"
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="ongoing">Ongoing</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <form onSubmit={handleCreateOrganizer} className="p-6 border-b border-gray-700 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <input
                    required
                    placeholder="Organizer name"
                    value={organizerForm.name}
                    onChange={(e) => setOrganizerForm({ ...organizerForm, name: e.target.value })}
                    className="px-3 py-2 rounded-md bg-gray-900 border border-gray-600 text-gray-100"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Organizer email"
                    value={organizerForm.email}
                    onChange={(e) => setOrganizerForm({ ...organizerForm, email: e.target.value })}
                    className="px-3 py-2 rounded-md bg-gray-900 border border-gray-600 text-gray-100"
                  />
                  <input
                    required
                    minLength={8}
                    type="password"
                    placeholder="Temporary password"
                    value={organizerForm.password}
                    onChange={(e) => setOrganizerForm({ ...organizerForm, password: e.target.value })}
                    className="px-3 py-2 rounded-md bg-gray-900 border border-gray-600 text-gray-100"
                  />
                  <select
                    required
                    value={organizerForm.department}
                    onChange={(e) => setOrganizerForm({ ...organizerForm, department: e.target.value })}
                    className="px-3 py-2 rounded-md bg-gray-900 border border-gray-600 text-gray-100"
                  >
                    <option value="Computer Technology">Computer Technology</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Mechanical">Mechanical</option>
                    <option value="Civil">Civil</option>
                  </select>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    {creating ? 'Creating...' : 'Create organizer'}
                  </button>
                </form>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-900">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {users.map((item) => (
                        <tr key={item._id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">{item.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{item.role}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                            {item.role === 'admin' ? (
                              <span className="text-gray-500">Locked</span>
                            ) : (
                              <select
                                value={item.role}
                                onChange={(e) => handleUserRoleChange(item._id, e.target.value)}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 bg-gray-900 text-gray-100 focus:outline-none focus:ring-violet-500 focus:border-violet-500 sm:text-sm rounded-md"
                              >
                                <option value="student">Student</option>
                                <option value="organizer">Organizer</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
