import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { getBackendUrl } from '../utils/apiConfig';

const AdminDashboard = () => {
  const { user } = useAuth();
  const backendUrl = getBackendUrl();
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('events'); // 'events', 'competitions', 'users'
  const [organizerForm, setOrganizerForm] = useState({
    name: '',
    email: '',
    password: '',
    department: 'Computer Technology'
  });
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [eventsRes, usersRes, compsRes] = await Promise.all([
        axios.get(`${backendUrl}/api/events`, { headers }),
        axios.get(`${backendUrl}/api/users`, { headers }),
        axios.get(`${backendUrl}/api/competitions`, { headers }).catch(() => ({ data: [] }))
      ]);
      setEvents(eventsRes.data || []);
      setUsers(usersRes.data || []);
      setCompetitions(compsRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteEvent = async (eventId, eventTitle) => {
    if (!window.confirm(`Are you sure you want to permanently delete event "${eventTitle}"?\n\nThis will remove all associated registrations, linked competitions, and files to clean up database space.`)) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(prev => prev.filter(e => e._id !== eventId));
      setSuccess('Event and associated records deleted successfully to clean up space.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete event');
    }
  };

  const handleDeleteCompetition = async (compId, compTitle) => {
    if (!window.confirm(`Are you sure you want to permanently delete competition "${compTitle}"?\n\nThis will remove all participant assessments, submissions, and scores from the database to clean up space.`)) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/competitions/${compId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompetitions(prev => prev.filter(c => c._id !== compId));
      setSuccess('Competition and all participant assessments deleted successfully to clean up space.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete competition');
    }
  };

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
                  Events ({events.length})
                </button>
                <button
                  onClick={() => setActiveTab('competitions')}
                  className={`${
                    activeTab === 'competitions'
                      ? 'border-violet-500 text-violet-300'
                      : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                >
                  Competitions ({competitions.length})
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`${
                    activeTab === 'users'
                      ? 'border-violet-500 text-violet-300'
                      : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                  } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                >
                  Users ({users.length})
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
                          <div className="flex items-center gap-2">
                            <select
                              value={event.status}
                              onChange={(e) => handleEventStatusChange(event._id, e.target.value)}
                              className="block w-full pl-3 pr-8 py-1.5 text-xs border-gray-600 bg-gray-900 text-gray-100 focus:outline-none focus:ring-violet-500 focus:border-violet-500 rounded-md"
                            >
                              <option value="pending">Pending</option>
                              <option value="approved">Approved</option>
                              <option value="rejected">Rejected</option>
                              <option value="upcoming">Upcoming</option>
                              <option value="ongoing">Ongoing</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(event._id, event.title)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded text-rose-300 bg-rose-950/60 border border-rose-800 hover:bg-rose-900 transition-colors"
                              title="Delete event and free space"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : activeTab === 'competitions' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Title</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Organizer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {competitions.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-sm text-gray-400">
                          No competitions found.
                        </td>
                      </tr>
                    ) : (
                      competitions.map((comp) => (
                        <tr key={comp._id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">
                            {comp.title}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-300 uppercase">
                            <span className="px-2 py-0.5 rounded bg-violet-900/60 text-violet-300 border border-violet-700/60">
                              {comp.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                            {comp.organizer?.name || '—'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-xs">
                            <span className={`px-2 py-0.5 rounded-full font-medium ${
                              comp.status === 'published' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-gray-700 text-gray-300'
                            }`}>
                              {comp.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/competitions/${comp._id}/manage`}
                                className="px-3 py-1 text-xs font-medium rounded text-gray-200 bg-gray-700 hover:bg-gray-600 transition-colors"
                              >
                                Manage
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleDeleteCompetition(comp._id, comp.title)}
                                className="px-2.5 py-1 text-xs font-semibold rounded text-rose-300 bg-rose-950/60 border border-rose-800 hover:bg-rose-900 transition-colors"
                                title="Delete competition and clean up DB space"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
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
