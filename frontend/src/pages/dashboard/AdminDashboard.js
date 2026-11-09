import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { getBackendUrl } from '../../utils/apiConfig';

const AdminDashboard = () => {
  const { user } = useAuth();
  const backendUrl = getBackendUrl();
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [competitions, setCompetitions] = useState([]);
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
    if (
      !window.confirm(
        `Are you sure you want to permanently delete event "${eventTitle}"?\n\nThis will remove all associated registrations, linked competitions, and files to clean up database space.`
      )
    ) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(prev => prev.filter(e => e._id !== eventId));
      setSuccess('Event and associated records deleted.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete event');
    }
  };

  const handleDeleteCompetition = async (compId, compTitle) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete competition "${compTitle}"?\n\nThis will remove all participant assessments, submissions, and scores from the database to clean up space.`
      )
    ) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/competitions/${compId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompetitions(prev => prev.filter(c => c._id !== compId));
      setSuccess('Competition and participant records deleted.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete competition');
    }
  };

  const handleEventStatusChange = async (eventId, newStatus) => {
    try {
      await axios.patch(`/api/events/${eventId}`, { status: newStatus });
      setEvents(events.map(event => (event._id === eventId ? { ...event, status: newStatus } : event)));
    } catch (err) {
      setError('Failed to update event status');
    }
  };

  const handleUserRoleChange = async (userId, newRole) => {
    try {
      setError('');
      await axios.patch(`/api/users/${userId}`, { role: newRole });
      setUsers(users.map(item => (item._id === userId ? { ...item, role: newRole } : item)));
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
      setSuccess('Organizer account created.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create organizer');
    } finally {
      setCreating(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-[16px] text-[#aaa398]">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  const pendingEventsCount = events.filter(e => e.status === 'pending').length;
  const publishedCompsCount = competitions.filter(c => c.status === 'published' || c.status === 'active').length;
  const organizerCount = users.filter(u => u.role === 'organizer').length;

  const statusBadgeClass = (status) => {
    if (status === 'approved' || status === 'published' || status === 'active') {
      return 'bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25';
    }
    if (status === 'pending' || status === 'upcoming') {
      return 'bg-[#e09132]/10 text-[#ebb05d] border border-[#e09132]/25';
    }
    if (status === 'rejected' || status === 'cancelled') {
      return 'bg-[#e5484d]/10 text-[#e5484d] border border-[#e5484d]/25';
    }
    return 'bg-[#262421] text-[#aaa398] border border-[#efe9de]/[0.08]';
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15]">
            Admin dashboard
          </h1>
          <p className="mt-1.5 text-[14px] text-[#aaa398]">
            Approve campus events, oversee competitions, and provision organizer accounts.
          </p>
        </div>
        <Link to="/create-event" className="btn-primary h-9 px-4 text-[13px] self-start sm:self-auto">
          New event
        </Link>
      </div>

      {/* Compact 4-Card Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
          <span className="text-[13px] text-[#8a847a]">Total events</span>
          <p className="mt-2 text-[28px] font-medium text-[#efe9de] font-mono tabular-nums leading-none">
            {events.length}
          </p>
          <span className="block mt-2 text-[12px] text-[#aaa398] tabular-nums">
            {events.filter(e => e.status === 'approved').length} approved
          </span>
        </div>

        <div className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
          <span className="text-[13px] text-[#8a847a]">Pending approval</span>
          <p
            className={`mt-2 text-[28px] font-medium font-mono tabular-nums leading-none ${
              pendingEventsCount > 0 ? 'text-[#ebb05d]' : 'text-[#efe9de]'
            }`}
          >
            {pendingEventsCount}
          </p>
          <span className="block mt-2 text-[12px] text-[#aaa398]">
            {pendingEventsCount > 0 ? 'Awaiting status review' : 'Queue clear'}
          </span>
        </div>

        <div className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
          <span className="text-[13px] text-[#8a847a]">Competitions</span>
          <p className="mt-2 text-[28px] font-medium text-[#efe9de] font-mono tabular-nums leading-none">
            {competitions.length}
          </p>
          <span className="block mt-2 text-[12px] text-[#aaa398] tabular-nums">
            {publishedCompsCount} live or published
          </span>
        </div>

        <div className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
          <span className="text-[13px] text-[#8a847a]">Registered users</span>
          <p className="mt-2 text-[28px] font-medium text-[#efe9de] font-mono tabular-nums leading-none">
            {users.length}
          </p>
          <span className="block mt-2 text-[12px] text-[#aaa398] tabular-nums">
            {organizerCount} organizer{organizerCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Main Management Panel */}
      <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#efe9de]/[0.08] bg-[#12110f]/60 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex max-w-full overflow-x-auto p-1 rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] gap-1">
            <button
              onClick={() => setActiveTab('events')}
              className={`h-8 px-3.5 rounded-[6px] text-[13px] font-medium transition-colors duration-150 tabular-nums whitespace-nowrap shrink-0 ${
                activeTab === 'events'
                  ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                  : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
              }`}
            >
              Events ({events.length})
            </button>
            <button
              onClick={() => setActiveTab('competitions')}
              className={`h-8 px-3.5 rounded-[6px] text-[13px] font-medium transition-colors duration-150 tabular-nums whitespace-nowrap shrink-0 ${
                activeTab === 'competitions'
                  ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                  : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
              }`}
            >
              Competitions ({competitions.length})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`h-8 px-3.5 rounded-[6px] text-[13px] font-medium transition-colors duration-150 tabular-nums whitespace-nowrap shrink-0 ${
                activeTab === 'users'
                  ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                  : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
              }`}
            >
              Users ({users.length})
            </button>
          </div>
          <span className="text-[12px] text-[#8a847a]">
            Admin accounts cannot be created from this panel.
          </span>
        </div>

        {error && (
          <div
            className="mx-5 mt-4 px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]"
            role="alert"
          >
            {error}
          </div>
        )}
        {success && (
          <div
            className="mx-5 mt-4 px-4 py-3 rounded-[8px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 text-[#4cc38a] text-[13px]"
            role="alert"
          >
            {success}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-[14px] text-[#8a847a]">Loading dashboard records...</div>
        ) : activeTab === 'events' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#efe9de]/[0.06]">
              <thead className="bg-[#12110f]/50">
                <tr>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Title</th>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Organizer</th>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Date</th>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Status</th>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efe9de]/[0.06]">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-10 text-center text-[14px] text-[#8a847a]">
                      No events recorded.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event._id} className="hover:bg-[#262421]/40 transition-colors duration-150">
                      <td className="px-5 py-3.5 whitespace-nowrap text-[14px] font-medium text-[#efe9de]">
                        {event.title}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[14px] text-[#aaa398]">
                        {event.organizer?.name || '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[13px] font-mono text-[#aaa398] tabular-nums">
                        {event.date ? new Date(event.date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-[6px] text-[12px] font-medium capitalize ${statusBadgeClass(
                            event.status
                          )}`}
                        >
                          {event.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[13px]">
                        <div className="flex items-center gap-2">
                          <select
                            value={event.status}
                            onChange={(e) => handleEventStatusChange(event._id, e.target.value)}
                            className="h-8 py-0 pl-2.5 pr-8 text-[12px] leading-tight rounded-[6px] bg-[#262421] border border-[#efe9de]/[0.12] text-[#efe9de] focus:outline-none focus:border-[#e09132]"
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
                            className="h-8 px-2.5 rounded-[6px] text-[12px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 transition-colors duration-150"
                            title="Delete event and free space"
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
        ) : activeTab === 'competitions' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#efe9de]/[0.06]">
              <thead className="bg-[#12110f]/50">
                <tr>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Title</th>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Type</th>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Organizer</th>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Status</th>
                  <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efe9de]/[0.06]">
                {competitions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-10 text-center text-[14px] text-[#8a847a]">
                      No competitions found.
                    </td>
                  </tr>
                ) : (
                  competitions.map((comp) => (
                    <tr key={comp._id} className="hover:bg-[#262421]/40 transition-colors duration-150">
                      <td className="px-5 py-3.5 whitespace-nowrap text-[14px] font-medium text-[#efe9de]">
                        {comp.title}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08] capitalize">
                          {comp.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[14px] text-[#aaa398]">
                        {comp.organizer?.name || '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-[6px] text-[12px] font-medium capitalize ${statusBadgeClass(
                            comp.status
                          )}`}
                        >
                          {comp.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[13px]">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/competitions/${comp._id}/manage`}
                            className="h-8 inline-flex items-center px-3 rounded-[6px] text-[12px] font-medium text-[#efe9de] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/10 transition-colors duration-150"
                          >
                            Manage
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteCompetition(comp._id, comp.title)}
                            className="h-8 px-2.5 rounded-[6px] text-[12px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 transition-colors duration-150"
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
            <form
              onSubmit={handleCreateOrganizer}
              className="p-5 border-b border-[#efe9de]/[0.08] bg-[#12110f]/30 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end"
            >
              <div>
                <label className="block text-[12px] text-[#8a847a] mb-1">Organizer name</label>
                <input
                  required
                  placeholder="Full name"
                  value={organizerForm.name}
                  onChange={(e) => setOrganizerForm({ ...organizerForm, name: e.target.value })}
                  className="input-field h-9 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#8a847a] mb-1">Email</label>
                <input
                  required
                  type="email"
                  placeholder="organizer@college.edu"
                  value={organizerForm.email}
                  onChange={(e) => setOrganizerForm({ ...organizerForm, email: e.target.value })}
                  className="input-field h-9 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#8a847a] mb-1">Temporary password</label>
                <input
                  required
                  minLength={8}
                  type="password"
                  placeholder="Min 8 characters"
                  value={organizerForm.password}
                  onChange={(e) => setOrganizerForm({ ...organizerForm, password: e.target.value })}
                  className="input-field h-9 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#8a847a] mb-1">Department</label>
                <select
                  required
                  value={organizerForm.department}
                  onChange={(e) => setOrganizerForm({ ...organizerForm, department: e.target.value })}
                  className="input-field h-9 py-0 leading-tight"
                >
                  <option value="Computer Technology">Computer Technology</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="Civil">Civil</option>
                </select>
              </div>
              <button type="submit" disabled={creating} className="btn-primary h-9 px-4 text-[13px]">
                {creating ? 'Creating...' : 'Create organizer'}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#efe9de]/[0.06]">
                <thead className="bg-[#12110f]/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Name</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Email</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Role</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efe9de]/[0.06]">
                  {users.map((item) => (
                    <tr key={item._id} className="hover:bg-[#262421]/40 transition-colors duration-150">
                      <td className="px-5 py-3.5 whitespace-nowrap text-[14px] font-medium text-[#efe9de]">
                        {item.name}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[14px] text-[#aaa398]">
                        {item.email}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[13px] font-mono text-[#aaa398] capitalize">
                        {item.role}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-[13px]">
                        {item.role === 'admin' ? (
                          <span className="text-[12px] text-[#8a847a]">Locked</span>
                        ) : (
                          <select
                            value={item.role}
                            onChange={(e) => handleUserRoleChange(item._id, e.target.value)}
                            className="h-8 py-0 pl-2.5 pr-8 text-[12px] leading-tight rounded-[6px] bg-[#262421] border border-[#efe9de]/[0.12] text-[#efe9de] focus:outline-none focus:border-[#e09132]"
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
  );
};

export default AdminDashboard;
