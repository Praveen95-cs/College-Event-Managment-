import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { getBackendUrl } from '../../utils/apiConfig';
import { DEFAULT_DEPARTMENTS, fetchDepartments } from '../../utils/departments';

const AdminDashboard = () => {
  const { user } = useAuth();
  const backendUrl = getBackendUrl();
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [youpiSessions, setYoupiSessions] = useState([]);
  const [youpiGatewayInfo, setYoupiGatewayInfo] = useState(null);
  const [systemStatus, setSystemStatus] = useState({ smtpConfigured: false, smtpHost: '', smtpFrom: '' });
  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState('');
  const [syncingPaymentId, setSyncingPaymentId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('events');
  const [organizerForm, setOrganizerForm] = useState({
    name: '',
    email: '',
    password: '',
    department: DEFAULT_DEPARTMENTS[0]
  });
  const [creating, setCreating] = useState(false);

  // Department management state
  const [newDeptForm, setNewDeptForm] = useState({ name: '', code: '' });
  const [addingDept, setAddingDept] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState('');
  const [editDeptForm, setEditDeptForm] = useState({ name: '', code: '' });
  const [savingDeptId, setSavingDeptId] = useState('');

  // Expired event cleanup policy state
  const [cleanupPolicy, setCleanupPolicy] = useState({
    autoDeleteExpiredEvents: false,
    expiredEventGraceHours: 24,
    lastCleanupAt: null,
    lastDeletedCount: 0
  });
  const [expiredSummary, setExpiredSummary] = useState({
    totalExpiredCount: 0,
    eligibleAutoDeleteCount: 0
  });
  const [savingCleanup, setSavingCleanup] = useState(false);
  const [purgingExpired, setPurgingExpired] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [eventsRes, usersRes, compsRes, paymentsRes, cleanupRes, deptsList, statusRes] =
        await Promise.all([
          axios.get(`${backendUrl}/api/events`, { headers }),
          axios.get(`${backendUrl}/api/users`, { headers }),
          axios.get(`${backendUrl}/api/competitions`, { headers }).catch(() => ({ data: [] })),
          axios
            .get(`${backendUrl}/api/payments/youpi/admin/sessions`, { headers })
            .catch(() => ({ data: { sessions: [] } })),
          axios
            .get(`${backendUrl}/api/events/admin/cleanup-policy`, { headers })
            .catch(() => ({ data: null })),
          fetchDepartments({ includeInactive: true, includeStats: true }),
          axios
            .get(`${backendUrl}/api/users/admin/system-status`, { headers })
            .catch(() => ({ data: null }))
        ]);

      setEvents(eventsRes.data || []);
      setUsers(usersRes.data || []);
      setCompetitions(compsRes.data || []);
      setYoupiSessions(paymentsRes.data?.sessions || []);
      setYoupiGatewayInfo(paymentsRes.data?.gatewayInfo || null);
      setDepartments(Array.isArray(deptsList) ? deptsList : []);

      const activeDeptNames = (deptsList || [])
        .filter((d) => d.isActive !== false)
        .map((d) => d.name);
      if (activeDeptNames.length > 0) {
        setOrganizerForm((prev) => ({
          ...prev,
          department: activeDeptNames.includes(prev.department)
            ? prev.department
            : activeDeptNames[0]
        }));
      }

      if (cleanupRes.data?.policy) {
        setCleanupPolicy(cleanupRes.data.policy);
        setExpiredSummary({
          totalExpiredCount: cleanupRes.data.totalExpiredCount || 0,
          eligibleAutoDeleteCount: cleanupRes.data.eligibleAutoDeleteCount || 0
        });
      }
      if (statusRes.data) {
        setSystemStatus(statusRes.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      setEvents((prev) => prev.filter((e) => e._id !== eventId));
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
      setCompetitions((prev) => prev.filter((c) => c._id !== compId));
      setSuccess('Competition and participant records deleted.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete competition');
    }
  };

  const handleEventStatusChange = async (eventId, newStatus) => {
    try {
      await axios.patch(`${backendUrl}/api/events/${eventId}`, { status: newStatus });
      setEvents(events.map((event) => (event._id === eventId ? { ...event, status: newStatus } : event)));
    } catch {
      setError('Failed to update event status');
    }
  };

  const handleUserRoleChange = async (userId, newRole) => {
    try {
      setError('');
      setSuccess('');
      await axios.patch(`${backendUrl}/api/users/${userId}`, { role: newRole });
      setUsers(users.map((item) => (item._id === userId ? { ...item, role: newRole } : item)));
      setSuccess('User role updated.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user role');
    }
  };

  const handleUserDepartmentChange = async (userId, newDept) => {
    try {
      setError('');
      setSuccess('');
      await axios.patch(`${backendUrl}/api/users/${userId}`, { department: newDept });
      setUsers(users.map((item) => (item._id === userId ? { ...item, department: newDept } : item)));
      setSuccess('User department updated.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user department');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (
      !window.confirm(
        `Permanently delete user "${targetUser.name}" (${targetUser.email})?\n\nAll their registrations, exam submissions, YouPI payment sessions, likes, saves, comments, and notifications will be deleted.`
      )
    ) {
      return;
    }
    try {
      setError('');
      setSuccess('');
      setDeletingUserId(targetUser._id);
      const res = await axios.delete(`${backendUrl}/api/users/${targetUser._id}`);
      setUsers((prev) => prev.filter((u) => u._id !== targetUser._id));
      setSuccess(res.data?.message || 'User deleted permanently.');
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeletingUserId('');
    }
  };

  const handleCreateOrganizer = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      const created = await axios.post(`${backendUrl}/api/users/organizers`, organizerForm);
      setUsers([created.data, ...users]);
      const firstActive = departments.find((d) => d.isActive !== false)?.name || DEFAULT_DEPARTMENTS[0];
      setOrganizerForm({
        name: '',
        email: '',
        password: '',
        department: firstActive
      });
      setSuccess('Organizer account created.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create organizer');
    } finally {
      setCreating(false);
    }
  };

  const handleAddDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptForm.name.trim()) return;
    try {
      setError('');
      setSuccess('');
      setAddingDept(true);
      await axios.post(`${backendUrl}/api/departments`, {
        name: newDeptForm.name.trim(),
        code: newDeptForm.code.trim()
      });
      setNewDeptForm({ name: '', code: '' });
      setSuccess(`Department "${newDeptForm.name.trim()}" added.`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add department');
    } finally {
      setAddingDept(false);
    }
  };

  const startEditDepartment = (dept) => {
    setEditingDeptId(dept._id);
    setEditDeptForm({ name: dept.name || '', code: dept.code || '' });
  };

  const handleSaveDepartment = async (deptId) => {
    if (!editDeptForm.name.trim()) {
      setError('Department name cannot be empty.');
      return;
    }
    try {
      setError('');
      setSuccess('');
      setSavingDeptId(deptId);
      const res = await axios.put(`${backendUrl}/api/departments/${deptId}`, {
        name: editDeptForm.name.trim(),
        code: editDeptForm.code.trim()
      });
      setEditingDeptId('');
      const c = res.data?.cascadeCounts;
      setSuccess(
        res.data?.renamed
          ? `Renamed to "${res.data.department.name}" (synced ${c?.usersUpdated || 0} user(s), ${c?.eventsUpdated || 0} event(s), ${c?.clubsUpdated || 0} club(s)).`
          : `Department "${res.data.department?.name || editDeptForm.name}" updated.`
      );
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update department');
    } finally {
      setSavingDeptId('');
    }
  };

  const handleToggleDepartmentActive = async (dept) => {
    try {
      setError('');
      setSuccess('');
      setSavingDeptId(dept._id);
      await axios.patch(`${backendUrl}/api/departments/${dept._id}`, {
        isActive: !dept.isActive
      });
      setSuccess(
        `Department "${dept.name}" ${!dept.isActive ? 'activated' : 'hidden from student signup'}.`
      );
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update department status');
    } finally {
      setSavingDeptId('');
    }
  };

  const handleDeleteDepartment = async (dept) => {
    if (
      !window.confirm(
        `Delete department "${dept.name}"?\n\nIt will be removed from Admin/Student dropdowns. Existing records referencing "${dept.name}" stay intact.`
      )
    ) {
      return;
    }
    try {
      setError('');
      setSuccess('');
      setSavingDeptId(dept._id);
      const res = await axios.delete(`${backendUrl}/api/departments/${dept._id}`);
      setSuccess(res.data?.message || `Department "${dept.name}" deleted.`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete department');
    } finally {
      setSavingDeptId('');
    }
  };

  const handleReconcileYoupi = async (paymentId, action) => {
    try {
      setError('');
      setSuccess('');
      setReconcilingId(paymentId);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/admin/sessions/${paymentId}/reconcile`,
        { action },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = res.data?.session;
      if (updated) {
        setYoupiSessions((prev) =>
          prev.map((item) => (item.paymentId === paymentId ? { ...item, ...updated } : item))
        );
      }
      setSuccess(
        action === 'approve'
          ? 'YouPI payment reconciled — event pass & competitions unlocked.'
          : 'YouPI payment marked as failed.'
      );
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reconcile YouPI payment');
    } finally {
      setReconcilingId('');
    }
  };

  const handleSyncYoupiSession = async (paymentId) => {
    try {
      setError('');
      setSuccess('');
      setSyncingPaymentId(paymentId);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/admin/sessions/${paymentId}/sync`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = res.data?.session;
      if (updated) {
        setYoupiSessions((prev) =>
          prev.map((item) => (item.paymentId === paymentId ? { ...item, ...updated } : item))
        );
        setSuccess(`Synced order ${updated.orderId}: status is now ${updated.status}.`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to sync session from external YouPI-PG gateway');
    } finally {
      setSyncingPaymentId('');
    }
  };

  const handleUpdateCleanupPolicy = async (nextValues) => {
    try {
      setError('');
      setSuccess('');
      setSavingCleanup(true);
      const token = localStorage.getItem('token');
      const payload = {
        autoDeleteExpiredEvents:
          nextValues.autoDeleteExpiredEvents !== undefined
            ? nextValues.autoDeleteExpiredEvents
            : cleanupPolicy.autoDeleteExpiredEvents,
        expiredEventGraceHours:
          nextValues.expiredEventGraceHours !== undefined
            ? nextValues.expiredEventGraceHours
            : cleanupPolicy.expiredEventGraceHours
      };
      const res = await axios.put(`${backendUrl}/api/events/admin/cleanup-policy`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.policy) {
        setCleanupPolicy(res.data.policy);
        setExpiredSummary({
          totalExpiredCount: res.data.totalExpiredCount || 0,
          eligibleAutoDeleteCount: res.data.eligibleAutoDeleteCount || 0
        });
      }
      setSuccess('Cloud expired-event auto-cleanup settings saved.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save cloud cleanup policy');
    } finally {
      setSavingCleanup(false);
    }
  };

  const handlePurgeExpiredNow = async () => {
    if (
      !window.confirm(
        `Permanently delete ${expiredSummary.totalExpiredCount} expired event(s) from MongoDB Atlas Cloud?\n\nAll linked competitions, registrations, payment sessions, and uploaded cover media for expired events will be removed.`
      )
    ) {
      return;
    }
    try {
      setError('');
      setSuccess('');
      setPurgingExpired(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/events/admin/purge-expired`,
        { graceHours: 0 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(res.data?.message || 'Expired events purged from MongoDB cloud.');
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to purge expired events');
    } finally {
      setPurgingExpired(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-[16px] text-[#aaa398]">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  const pendingEventsCount = events.filter((e) => e.status === 'pending').length;
  const publishedCompsCount = competitions.filter((c) => c.status === 'published' || c.status === 'active').length;
  const organizerCount = users.filter((u) => u.role === 'organizer').length;
  const activeDepartments = departments.filter((d) => d.isActive !== false);

  const statusBadgeClass = (status) => {
    const s = String(status || '').toLowerCase();
    if (['approved', 'published', 'active', 'reconciled', 'success', 'observed_success'].includes(s)) {
      return 'bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25';
    }
    if (['pending', 'upcoming', 'manual_review', 'queued', 'initiated'].includes(s)) {
      return 'bg-[#e09132]/10 text-[#ebb05d] border border-[#e09132]/25';
    }
    if (['rejected', 'cancelled', 'failed', 'expired'].includes(s)) {
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
            Manage campus departments, users, event approvals, YouPI reconciliation, and cloud cleanup.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <span
            className={`h-9 inline-flex items-center px-3 rounded-[8px] text-[12px] font-mono border ${
              systemStatus.smtpConfigured
                ? 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                : 'bg-[#e09132]/10 text-[#ebb05d] border-[#e09132]/25'
            }`}
            title={
              systemStatus.smtpConfigured
                ? `Live SMTP email active via ${systemStatus.smtpHost || 'SMTP'}`
                : 'Configure SMTP_USER & SMTP_PASS in backend/.env or Render Env for live emails'
            }
          >
            {systemStatus.smtpConfigured ? 'SMTP Email Live' : 'Email Console Mode (Configure SMTP)'}
          </span>
          <Link to="/create-event" className="btn-primary h-9 px-4 text-[13px]">
            New event
          </Link>
        </div>
      </div>

      {/* Compact 4-Card Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08]">
          <span className="text-[13px] text-[#8a847a]">Total events</span>
          <p className="mt-2 text-[28px] font-medium text-[#efe9de] font-mono tabular-nums leading-none">
            {events.length}
          </p>
          <span className="block mt-2 text-[12px] text-[#aaa398] tabular-nums">
            {events.filter((e) => e.status === 'approved').length} approved
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
          <span className="text-[13px] text-[#8a847a]">Departments</span>
          <p className="mt-2 text-[28px] font-medium text-[#efe9de] font-mono tabular-nums leading-none">
            {departments.length}
          </p>
          <span className="block mt-2 text-[12px] text-[#aaa398] tabular-nums">
            {activeDepartments.length} active · {publishedCompsCount} live contests
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
            {[
              { id: 'events', label: `Events (${events.length})` },
              { id: 'competitions', label: `Competitions (${competitions.length})` },
              { id: 'users', label: `Users (${users.length})` },
              { id: 'departments', label: `Departments (${departments.length})` },
              { id: 'payments', label: `YouPI Payments (${youpiSessions.length})` }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`h-8 px-3.5 rounded-[6px] text-[13px] font-medium transition-colors duration-150 tabular-nums whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
                    : 'text-[#8a847a] hover:text-[#efe9de] border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-[#8a847a]">
            Admin-only governance panel
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
          <div>
            <div className="px-5 py-4 border-b border-[#efe9de]/[0.08] bg-[#161513]/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-[13px] font-medium text-[#efe9de]">
                    <input
                      type="checkbox"
                      checked={Boolean(cleanupPolicy.autoDeleteExpiredEvents)}
                      disabled={savingCleanup}
                      onChange={(e) =>
                        handleUpdateCleanupPolicy({ autoDeleteExpiredEvents: e.target.checked })
                      }
                      className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132]"
                    />
                    <span>Auto-delete expired events from MongoDB Cloud</span>
                  </label>
                  <span
                    className={`px-2 py-0.5 rounded-[5px] text-[11px] font-mono border ${
                      expiredSummary.totalExpiredCount > 0
                        ? 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/30'
                        : 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                    }`}
                  >
                    {expiredSummary.totalExpiredCount} expired in cloud
                  </span>
                </div>
                <p className="text-[12px] text-[#8a847a]">
                  Automatically removes past events along with photos, registrations, YouPI sessions, and linked contests from cloud storage.
                  {cleanupPolicy.lastCleanupAt && (
                    <span className="ml-1.5 font-mono text-[#aaa398]">
                      Last sweep: {new Date(cleanupPolicy.lastCleanupAt).toLocaleString()} ({cleanupPolicy.lastDeletedCount || 0} deleted)
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <select
                  aria-label="Expired event retention grace window"
                  disabled={savingCleanup}
                  value={String(cleanupPolicy.expiredEventGraceHours ?? 24)}
                  onChange={(e) =>
                    handleUpdateCleanupPolicy({ expiredEventGraceHours: Number(e.target.value) })
                  }
                  className="h-9 pl-3 pr-8 rounded-[8px] text-[12px] bg-[#262421] border border-[#efe9de]/[0.12] text-[#efe9de] focus:outline-none focus:border-[#e09132]"
                >
                  <option value="0">Delete immediately after event ends</option>
                  <option value="24">Delete 24 hours after end</option>
                  <option value="72">Delete 3 days after end</option>
                  <option value="168">Delete 7 days after end</option>
                </select>
                <button
                  type="button"
                  disabled={purgingExpired || expiredSummary.totalExpiredCount === 0}
                  onClick={handlePurgeExpiredNow}
                  className="h-9 px-3.5 rounded-[8px] text-[12px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 disabled:opacity-40 transition-colors"
                >
                  {purgingExpired ? 'Purging...' : `Purge Expired Now (${expiredSummary.totalExpiredCount})`}
                </button>
              </div>
            </div>

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
                          <div className="flex items-center gap-2">
                            <Link to={`/events/${event._id}`} className="hover:text-[#ebb05d] transition-colors">
                              {event.title}
                            </Link>
                            <span
                              className={`px-1.5 py-0.5 rounded-[5px] text-[10px] font-mono border ${
                                event.isPaid && Number(event.registrationFee || 0) > 0
                                  ? 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/25'
                                  : 'bg-[#262421] text-[#8a847a] border-[#efe9de]/[0.06]'
                              }`}
                            >
                              {event.isPaid && Number(event.registrationFee || 0) > 0
                                ? `${event.currency && event.currency !== 'INR' ? `${event.currency} ` : '₹'}${event.registrationFee}`
                                : 'Free'}
                            </span>
                            {event.hasWhatsappGroup && (
                              <span className="px-1.5 py-0.5 rounded-[5px] text-[10px] font-mono bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25">
                                WA Group
                              </span>
                            )}
                          </div>
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
                            <Link
                              to={`/events/${event._id}`}
                              className="h-8 inline-flex items-center px-3 rounded-[6px] text-[12px] font-medium text-[#ebb05d] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/10 transition-colors duration-150"
                            >
                              Attendance
                            </Link>
                            <Link
                              to={`/events/${event._id}/edit`}
                              className="h-8 inline-flex items-center px-3 rounded-[6px] text-[12px] font-medium text-[#efe9de] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/10 transition-colors duration-150"
                            >
                              Edit
                            </Link>
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
        ) : activeTab === 'users' ? (
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
                  {(activeDepartments.length > 0
                    ? activeDepartments
                    : DEFAULT_DEPARTMENTS.map((n) => ({ name: n }))
                  ).map((dept) => (
                    <option key={dept._id || dept.name} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
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
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Department</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Role</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efe9de]/[0.06]">
                  {users.map((item) => {
                    const deptOptions =
                      item.department && !activeDepartments.some((d) => d.name === item.department)
                        ? [{ name: item.department }, ...activeDepartments]
                        : activeDepartments;
                    return (
                      <tr key={item._id} className="hover:bg-[#262421]/40 transition-colors duration-150">
                        <td className="px-5 py-3.5 whitespace-nowrap text-[14px] font-medium text-[#efe9de]">
                          {item.name}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-[14px] text-[#aaa398]">
                          <div>{item.email}</div>
                          {item.emailVerified && (
                            <span className="text-[11px] font-mono text-[#4cc38a]">OTP Verified</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-[13px]">
                          {item.role === 'admin' ? (
                            <span className="text-[#aaa398]">{item.department || 'Administration'}</span>
                          ) : (
                            <select
                              aria-label={`Department for ${item.name}`}
                              value={item.department || ''}
                              onChange={(e) => handleUserDepartmentChange(item._id, e.target.value)}
                              className="h-8 py-0 pl-2.5 pr-8 text-[12px] leading-tight rounded-[6px] bg-[#262421] border border-[#efe9de]/[0.12] text-[#efe9de] focus:outline-none focus:border-[#e09132]"
                            >
                              {!item.department && <option value="">Select department</option>}
                              {deptOptions.map((d) => (
                                <option key={d._id || d.name} value={d.name}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-[13px] font-mono text-[#aaa398] capitalize">
                          {item.role}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-[13px]">
                          {item.role === 'admin' ? (
                            <span className="text-[12px] text-[#8a847a]">Locked</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                aria-label={`Role for ${item.name}`}
                                value={item.role}
                                onChange={(e) => handleUserRoleChange(item._id, e.target.value)}
                                className="h-8 py-0 pl-2.5 pr-8 text-[12px] leading-tight rounded-[6px] bg-[#262421] border border-[#efe9de]/[0.12] text-[#efe9de] focus:outline-none focus:border-[#e09132]"
                              >
                                <option value="student">Student</option>
                                <option value="organizer">Organizer</option>
                              </select>
                              <button
                                type="button"
                                disabled={deletingUserId === item._id}
                                onClick={() => handleDeleteUser(item)}
                                className="h-8 px-2.5 rounded-[6px] text-[12px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 disabled:opacity-50 transition-colors duration-150"
                                title={`Delete ${item.name}`}
                              >
                                {deletingUserId === item._id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'departments' ? (
          <div>
            <form
              onSubmit={handleAddDepartment}
              className="p-5 border-b border-[#efe9de]/[0.08] bg-[#12110f]/30 grid gap-3 sm:grid-cols-3 items-end"
            >
              <div>
                <label htmlFor="newDeptName" className="block text-[12px] text-[#8a847a] mb-1">
                  Department name *
                </label>
                <input
                  id="newDeptName"
                  required
                  placeholder="e.g. Artificial Intelligence & Data Science"
                  value={newDeptForm.name}
                  onChange={(e) => setNewDeptForm({ ...newDeptForm, name: e.target.value })}
                  className="input-field h-9 py-1.5"
                />
              </div>
              <div>
                <label htmlFor="newDeptCode" className="block text-[12px] text-[#8a847a] mb-1">
                  Short code (optional)
                </label>
                <input
                  id="newDeptCode"
                  placeholder="e.g. AIDS"
                  maxLength={20}
                  value={newDeptForm.code}
                  onChange={(e) => setNewDeptForm({ ...newDeptForm, code: e.target.value.toUpperCase() })}
                  className="input-field h-9 py-1.5 font-mono uppercase"
                />
              </div>
              <button type="submit" disabled={addingDept} className="btn-primary h-9 px-4 text-[13px]">
                {addingDept ? 'Adding...' : 'Add department'}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#efe9de]/[0.06]">
                <thead className="bg-[#12110f]/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Department</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Code</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Usage</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Visibility</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efe9de]/[0.06]">
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-5 py-10 text-center text-[14px] text-[#8a847a]">
                        No departments configured yet.
                      </td>
                    </tr>
                  ) : (
                    departments.map((dept) => {
                      const isEditingRow = editingDeptId === dept._id;
                      const busy = savingDeptId === dept._id;
                      return (
                        <tr key={dept._id} className="hover:bg-[#262421]/40 transition-colors duration-150">
                          <td className="px-5 py-3.5 whitespace-nowrap text-[14px] font-medium text-[#efe9de]">
                            {isEditingRow ? (
                              <input
                                type="text"
                                aria-label="Edit department name"
                                value={editDeptForm.name}
                                onChange={(e) => setEditDeptForm({ ...editDeptForm, name: e.target.value })}
                                className="input-field h-8 py-1 text-[13px] min-w-[220px]"
                              />
                            ) : (
                              dept.name
                            )}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-[13px] font-mono text-[#ebb05d]">
                            {isEditingRow ? (
                              <input
                                type="text"
                                aria-label="Edit department code"
                                value={editDeptForm.code}
                                onChange={(e) =>
                                  setEditDeptForm({ ...editDeptForm, code: e.target.value.toUpperCase() })
                                }
                                className="input-field h-8 py-1 text-[12px] font-mono uppercase w-24"
                              />
                            ) : (
                              dept.code || '—'
                            )}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-[12px] font-mono text-[#aaa398] tabular-nums">
                            {dept.usersCount || 0} users · {dept.eventsCount || 0} events
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-[6px] text-[12px] font-medium ${
                                dept.isActive !== false
                                  ? 'bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25'
                                  : 'bg-[#262421] text-[#8a847a] border border-[#efe9de]/[0.08]'
                              }`}
                            >
                              {dept.isActive !== false ? 'Active' : 'Hidden'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-[12px]">
                            <div className="flex items-center gap-2">
                              {isEditingRow ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleSaveDepartment(dept._id)}
                                    className="h-8 px-3 rounded-[6px] font-medium text-[#4cc38a] bg-[#4cc38a]/10 border border-[#4cc38a]/25 hover:bg-[#4cc38a]/20"
                                  >
                                    {busy ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setEditingDeptId('')}
                                    className="h-8 px-3 rounded-[6px] font-medium text-[#aaa398] bg-[#262421] border border-[#efe9de]/10 hover:text-[#efe9de]"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => startEditDepartment(dept)}
                                    className="h-8 px-3 rounded-[6px] font-medium text-[#efe9de] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/10"
                                  >
                                    Modify
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleToggleDepartmentActive(dept)}
                                    className="h-8 px-3 rounded-[6px] font-medium text-[#ebb05d] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/10"
                                  >
                                    {dept.isActive !== false ? 'Hide' : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleDeleteDepartment(dept)}
                                    className="h-8 px-2.5 rounded-[6px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            {youpiGatewayInfo && (
              <div className="px-5 py-4 border-b border-[#efe9de]/[0.08] bg-[#161513]/70 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-[#efe9de]">
                      {youpiGatewayInfo.gatewayMode === 'external'
                        ? 'Option 2 · Separate External YouPI-PG V2 Gateway'
                        : 'Option 1 · Embedded YouPI-PG Mode'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-[5px] text-[11px] font-mono border ${
                        youpiGatewayInfo.gatewayMode === 'external'
                          ? youpiGatewayInfo.externalConfigured
                            ? 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                            : 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/30'
                          : 'bg-[#262421] text-[#aaa398] border-[#efe9de]/[0.08]'
                      }`}
                    >
                      Method: {youpiGatewayInfo.defaultMethod} ({youpiGatewayInfo.verificationMode})
                    </span>
                    {youpiGatewayInfo.apiUrlOrigin && (
                      <span className="px-2 py-0.5 rounded-[5px] text-[11px] font-mono bg-[#12110f] text-[#ebb05d] border border-[#efe9de]/[0.08]">
                        {youpiGatewayInfo.apiUrlOrigin}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#8a847a]">
                    Webhook callback:{' '}
                    <code className="font-mono text-[#aaa398]">
                      {(backendUrl || window.location.origin).replace(/\/+$/, '')}
                      {youpiGatewayInfo.webhookCallbackPath || '/api/payments/youpi/webhook'}
                    </code>
                    {' · '}Configure a non-Google Pay UPI VPA (PhonePe @ybl, Paytm, BHIM @upi, SBI @sbi) inside your external YouPI-PG Admin with <code className="font-mono text-[#aaa398]">MANUAL_UPI</code>.
                  </p>
                </div>

                {youpiGatewayInfo.gatewayMode === 'external' && (
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0 text-[11px] font-mono">
                    {[
                      { label: 'API URL', ok: Boolean(youpiGatewayInfo.apiUrlOrigin) },
                      { label: 'Merchant ID', ok: Boolean(youpiGatewayInfo.merchantIdConfigured) },
                      { label: 'Merchant Key', ok: Boolean(youpiGatewayInfo.merchantKeyConfigured) },
                      { label: 'Webhook Secret', ok: Boolean(youpiGatewayInfo.webhookSecretConfigured) }
                    ].map((badge) => (
                      <span
                        key={badge.label}
                        className={`px-2 py-0.5 rounded-[5px] border ${
                          badge.ok
                            ? 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                            : 'bg-[#e5484d]/10 text-[#e5484d] border-[#e5484d]/25'
                        }`}
                      >
                        {badge.ok ? '✓' : '✕'} {badge.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#efe9de]/[0.06]">
                <thead className="bg-[#12110f]/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Order &amp; UTR</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Event</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Student</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Amount</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Status</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efe9de]/[0.06]">
                  {youpiSessions.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-5 py-10 text-center text-[14px] text-[#8a847a]">
                        No YouPI-PG payment sessions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    youpiSessions.map((ps) => {
                      const canReconcile = ['MANUAL_REVIEW', 'ACTIVE', 'OBSERVED_SUCCESS'].includes(ps.status);
                      const canSyncExternal =
                        ps.gatewayMode === 'external' &&
                        !['RECONCILED', 'SUCCESS', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(ps.status);
                      const busy = reconcilingId === ps.paymentId;
                      const syncing = syncingPaymentId === ps.paymentId;
                      return (
                        <tr key={ps.paymentId} className="hover:bg-[#262421]/40 transition-colors duration-150">
                          <td className="px-5 py-3.5 whitespace-nowrap text-[12px] font-mono">
                            <div className="text-[#efe9de]">{ps.orderId}</div>
                            <div className="text-[#8a847a] mt-0.5">
                              {ps.utr ? `UTR: ${ps.utr}` : `${ps.gatewayMode.toUpperCase()} · ${ps.method || 'UPI'}`}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-[13px] text-[#efe9de]">
                            {ps.eventTitle}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-[13px] text-[#aaa398]">
                            <div>{ps.student?.name || ps.customerName || '—'}</div>
                            <div className="text-[11px] font-mono text-[#8a847a]">
                              {ps.customerRegNo || ps.student?.email || ''}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-[13px] font-mono text-[#ebb05d] tabular-nums">
                            {ps.currency} {ps.amountDisplay}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-[6px] text-[11px] font-mono ${statusBadgeClass(
                                ps.status
                              )}`}
                            >
                              {ps.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-[12px]">
                            <div className="flex flex-wrap items-center gap-2">
                              {canSyncExternal && (
                                <button
                                  type="button"
                                  disabled={syncing || busy}
                                  onClick={() => handleSyncYoupiSession(ps.paymentId)}
                                  className="h-8 px-2.5 rounded-[6px] font-medium text-[#ebb05d] bg-[#e09132]/12 border border-[#e09132]/30 hover:bg-[#e09132]/20 transition-colors"
                                  title="Poll latest status from external YouPI-PG gateway"
                                >
                                  {syncing ? 'Syncing...' : 'Sync'}
                                </button>
                              )}
                              {canReconcile ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy || syncing}
                                    onClick={() => handleReconcileYoupi(ps.paymentId, 'approve')}
                                    className="h-8 px-2.5 rounded-[6px] font-medium text-[#4cc38a] bg-[#4cc38a]/10 border border-[#4cc38a]/25 hover:bg-[#4cc38a]/20 transition-colors"
                                  >
                                    Approve &amp; Unlock
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy || syncing}
                                    onClick={() => handleReconcileYoupi(ps.paymentId, 'reject')}
                                    className="h-8 px-2.5 rounded-[6px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 transition-colors"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : (
                                !canSyncExternal && (
                                  <span className="text-[11px] font-mono text-[#8a847a]">
                                    {ps.settlementState}
                                  </span>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
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
