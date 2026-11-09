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
  const [youpiQueue, setYoupiQueue] = useState({
    receivingAccountId: '',
    currentSlot: null,
    queue: []
  });
  const [youpiDevices, setYoupiDevices] = useState([]);
  const [pairQrData, setPairQrData] = useState(null);
  const [selectedDeviceVpa, setSelectedDeviceVpa] = useState('');
  const [generatingPairQr, setGeneratingPairQr] = useState(false);
  const [suspendedUsers, setSuspendedUsers] = useState([]);
  const [recentFraudObs, setRecentFraudObs] = useState([]);
  const [unbanningUserId, setUnbanningUserId] = useState('');
  const [statementVpa, setStatementVpa] = useState('');
  const [standQrForm, setStandQrForm] = useState({
    preferredVpa: '',
    amount: '',
    mode: '02',
    tn: ''
  });
  const [standQrResult, setStandQrResult] = useState(null);
  const [generatingStandQr, setGeneratingStandQr] = useState(false);
  const [youpiAutomation, setYoupiAutomation] = useState({
    primaryVpa: '',
    backupVpas: [],
    autoVerifyEnabled: true,
    fulfillOnObserved: false,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapUser: '',
    imapConfigured: false,
    hasImapPass: false,
    imapPassHint: '',
    observerConfigured: false,
    hasObserverSecret: false,
    observerSecretHint: '',
    hasAndroidEnrollmentSecret: false,
    lastPollAt: null,
    lastPollResult: null
  });
  const [youpiObservations, setYoupiObservations] = useState([]);
  const [youpiAutoForm, setYoupiAutoForm] = useState({
    backupVpas: '',
    autoVerifyEnabled: true,
    imapHost: 'imap.gmail.com',
    imapPort: '993',
    imapUser: '',
    imapPass: ''
  });
  const [savingYoupiAuto, setSavingYoupiAuto] = useState(false);
  const [pollingInbox, setPollingInbox] = useState(false);
  const [reconcilingCsv, setReconcilingCsv] = useState(false);
  const [csvSummary, setCsvSummary] = useState(null);
  const [generatedObserverSecret, setGeneratedObserverSecret] = useState('');

  const [systemStatus, setSystemStatus] = useState({
    configured: false,
    smtpConfigured: false,
    httpConfigured: false,
    smtpHost: '',
    smtpFrom: '',
    activeChannels: [],
    relayProvider: 'auto',
    lastEmailStatus: null
  });
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [showAppsScriptCode, setShowAppsScriptCode] = useState(false);
  const [emailForm, setEmailForm] = useState({
    emailRelayProvider: 'auto',
    brevoApiKey: '',
    resendApiKey: '',
    emailWebhookUrl: '',
    emailWebhookSecret: '',
    smtpHostOverride: '',
    smtpPortOverride: '',
    smtpUserOverride: '',
    smtpPassOverride: '',
    smtpFromOverride: ''
  });
  const [savingEmailCfg, setSavingEmailCfg] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState(null);

  const [loading, setLoading] = useState(true);
  const [reconcilingId, setReconcilingId] = useState('');
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
      const [
        eventsRes,
        usersRes,
        compsRes,
        paymentsRes,
        cleanupRes,
        deptsList,
        statusRes,
        autoRes,
        queueRes,
        securityRes
      ] = await Promise.all([
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
          .catch(() => ({ data: null })),
        axios
          .get(`${backendUrl}/api/payments/youpi/admin/automation`, { headers })
          .catch(() => ({ data: null })),
        axios
          .get(`${backendUrl}/api/payments/youpi/admin/queue`, { headers })
          .catch(() => ({ data: null })),
        axios
          .get(`${backendUrl}/api/payments/youpi/admin/security/suspended`, { headers })
          .catch(() => ({ data: null }))
      ]);

      setEvents(eventsRes.data || []);
      setUsers(usersRes.data || []);
      setCompetitions(compsRes.data || []);
      setYoupiSessions(paymentsRes.data?.sessions || []);
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
        setEmailForm((prev) => ({
          ...prev,
          emailRelayProvider: statusRes.data.relayProvider || 'auto',
          smtpFromOverride: prev.smtpFromOverride || statusRes.data.smtpFrom || ''
        }));
      }
      if (autoRes.data?.config) {
        const ac = autoRes.data.config;
        setYoupiAutomation(ac);
        setYoupiAutoForm({
          backupVpas: Array.isArray(ac.backupVpas) ? ac.backupVpas.join(', ') : '',
          autoVerifyEnabled: ac.autoVerifyEnabled !== false,
          imapHost: ac.imapHost || 'imap.gmail.com',
          imapPort: String(ac.imapPort || 993),
          imapUser: ac.imapUser || '',
          imapPass: ''
        });
        setYoupiObservations(autoRes.data.observations || []);
        setYoupiDevices(autoRes.data.devices || []);
        if (ac.primaryVpa) {
          setStatementVpa((prev) => prev || ac.primaryVpa);
          setStandQrForm((prev) => (prev.preferredVpa ? prev : { ...prev, preferredVpa: ac.primaryVpa }));
        }
      }
      if (queueRes.data) {
        setYoupiQueue({
          receivingAccountId: queueRes.data.receivingAccountId || '',
          currentSlot: queueRes.data.currentSlot || null,
          queue: queueRes.data.queue || []
        });
      }
      if (securityRes.data) {
        setSuspendedUsers(securityRes.data.suspendedUsers || []);
        setRecentFraudObs(securityRes.data.recentFraudObservations || []);
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
          ? `YouPI payment settled (${updated?.status || 'RECONCILED'}) — event pass & competitions unlocked.`
          : updated?.status === 'MANUAL_REVIEW'
            ? 'YouPI observation flagged for manual bank verification review.'
            : 'YouPI payment marked as failed.'
      );
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reconcile YouPI payment');
    } finally {
      setReconcilingId('');
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

  const handleSaveEmailSettings = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setSuccess('');
      setSavingEmailCfg(true);
      const token = localStorage.getItem('token');
      const res = await axios.put(`${backendUrl}/api/users/admin/email-settings`, emailForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.status) setSystemStatus(res.data.status);
      setEmailForm((prev) => ({
        ...prev,
        brevoApiKey: '',
        resendApiKey: '',
        emailWebhookSecret: '',
        smtpPassOverride: ''
      }));
      setSuccess(res.data?.message || 'Email delivery relay settings saved.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save email settings.');
    } finally {
      setSavingEmailCfg(false);
    }
  };

  const handleResetEmailChannel = async (payload) => {
    try {
      setError('');
      setSuccess('');
      setSavingEmailCfg(true);
      const token = localStorage.getItem('token');
      const res = await axios.put(`${backendUrl}/api/users/admin/email-settings`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.status) setSystemStatus(res.data.status);
      setSuccess('Email channel cleared.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset email channel.');
    } finally {
      setSavingEmailCfg(false);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setSuccess('');
      setTestEmailResult(null);
      setSendingTestEmail(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/users/admin/test-email`,
        { to: (testEmailTo || user?.email || '').trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.status) setSystemStatus(res.data.status);
      setTestEmailResult({ ok: true, ...res.data });
      setSuccess(`Test email delivered via ${res.data.provider} in ${res.data.latencyMs}ms.`);
    } catch (err) {
      const data = err.response?.data || {};
      if (data.status) setSystemStatus(data.status);
      setTestEmailResult({
        ok: false,
        code: data.code || 'EMAIL_DELIVERY_FAILED',
        message: data.message || err.message || 'Test email delivery failed.',
        latencyMs: data.latencyMs
      });
      setError(data.message || 'Test email failed.');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleSaveYoupiAutomation = async (e, extraFlags = {}) => {
    if (e) e.preventDefault();
    try {
      setError('');
      setSuccess('');
      setSavingYoupiAuto(true);
      const token = localStorage.getItem('token');
      const res = await axios.put(
        `${backendUrl}/api/payments/youpi/admin/automation`,
        {
          ...youpiAutoForm,
          imapPort: Number(youpiAutoForm.imapPort) || 993,
          ...extraFlags
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.config) {
        setYoupiAutomation(res.data.config);
        setYoupiAutoForm((prev) => ({
          ...prev,
          backupVpas: Array.isArray(res.data.config.backupVpas)
            ? res.data.config.backupVpas.join(', ')
            : prev.backupVpas,
          imapPass: ''
        }));
      }
      if (res.data?.generatedObserverSecret) {
        setGeneratedObserverSecret(res.data.generatedObserverSecret);
      }
      setSuccess(res.data?.message || 'YouPI automation settings saved.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save YouPI automation settings.');
    } finally {
      setSavingYoupiAuto(false);
    }
  };

  const handlePollBankInboxNow = async () => {
    try {
      setError('');
      setSuccess('');
      setPollingInbox(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/admin/poll-now`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.config) setYoupiAutomation(res.data.config);
      if (res.data?.observations) setYoupiObservations(res.data.observations);
      const sum = res.data?.summary || {};
      if (sum.ok) {
        setSuccess(
          `Bank inbox scanned (${sum.scanned || 0} email(s)) · ${sum.matched || 0} payment(s) auto-reconciled.`
        );
        await fetchData();
      } else {
        setError(sum.reason || sum.error || 'Bank inbox poll skipped or failed.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to poll bank inbox.');
    } finally {
      setPollingInbox(false);
    }
  };

  const handleUploadStatementCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setError('');
      setSuccess('');
      setCsvSummary(null);
      setReconcilingCsv(true);
      const csvText = await file.text();
      const token = localStorage.getItem('token');
      const targetRecAcc = (statementVpa || youpiAutomation.primaryVpa || '').trim();
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/admin/statements/import`,
        { receivingAccountId: targetRecAcc, csv: csvText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.summary) setCsvSummary(res.data.summary);
      if (res.data?.observations) setYoupiObservations(res.data.observations);
      const sum = res.data?.summary || {};
      const settledCnt = sum.reconciled ?? sum.matchedCount ?? 0;
      const conflictCnt = sum.conflicts ?? sum.ambiguousCount ?? 0;
      setSuccess(
        `Scanned ${sum.creditRows || 0} bank credit row(s) (${targetRecAcc || 'primary VPA'}) — ${settledCnt} settled, ${conflictCnt} conflict(s).`
      );
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process bank CSV statement.');
    } finally {
      setReconcilingCsv(false);
    }
  };

  const handleRefreshQueue = async (overrideVpa = '') => {
    try {
      setError('');
      const token = localStorage.getItem('token');
      const vpa = (overrideVpa || youpiQueue.receivingAccountId || youpiAutomation.primaryVpa || '').trim();
      const res = await axios.get(`${backendUrl}/api/payments/youpi/admin/queue`, {
        params: vpa ? { receivingAccountId: vpa } : {},
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setYoupiQueue({
          receivingAccountId: res.data.receivingAccountId || vpa,
          currentSlot: res.data.currentSlot || null,
          queue: res.data.queue || []
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to refresh payment queue.');
    }
  };

  const handleGeneratePairQr = async (overrideVpa = '') => {
    try {
      setError('');
      setSuccess('');
      setGeneratingPairQr(true);
      const token = localStorage.getItem('token');
      const vpa = (overrideVpa || selectedDeviceVpa || youpiAutomation.primaryVpa || '').trim();
      const res = await axios.get(`${backendUrl}/api/payments/youpi/admin/sms-gateway/pair-qr`, {
        params: vpa ? { receivingAccountId: vpa } : {},
        headers: { Authorization: `Bearer ${token}` }
      });
      setPairQrData(res.data || null);
      if (Array.isArray(res.data?.devices)) {
        setYoupiDevices(res.data.devices);
      }
      setSuccess(`Generated Android SMS Gateway pairing QR for ${res.data?.receivingAccountId || vpa || 'primary VPA'}.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate Android pairing QR.');
    } finally {
      setGeneratingPairQr(false);
    }
  };

  const handleRevokeAndroidDevice = async (deviceId) => {
    try {
      setError('');
      setSuccess('');
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/admin/sms-gateway/devices/${deviceId}/revoke`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(res.data?.message || 'Android SMS observer device revoked.');
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to revoke Android device.');
    }
  };

  const handleDeleteAndroidDevice = async (deviceId) => {
    if (!window.confirm('Permanently remove this Android SMS observer device?')) return;
    try {
      setError('');
      setSuccess('');
      const token = localStorage.getItem('token');
      const res = await axios.delete(
        `${backendUrl}/api/payments/youpi/admin/sms-gateway/devices/${deviceId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(res.data?.message || 'Android SMS observer device removed.');
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete Android device.');
    }
  };

  const handleUnbanUser = async (targetUser) => {
    try {
      setError('');
      setSuccess('');
      setUnbanningUserId(targetUser._id);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${backendUrl}/api/payments/youpi/admin/security/unban`,
        { userId: targetUser._id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(res.data?.message || `Security suspension cleared for ${targetUser.email}.`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to clear user suspension.');
    } finally {
      setUnbanningUserId('');
    }
  };

  const handleGenerateStandQr = async (e) => {
    if (e) e.preventDefault();
    try {
      setError('');
      setGeneratingStandQr(true);
      const params = {
        mode: standQrForm.mode || '02'
      };
      if (standQrForm.preferredVpa) params.preferredVpa = standQrForm.preferredVpa;
      if (standQrForm.tn?.trim()) params.tn = standQrForm.tn.trim();
      if (standQrForm.mode === '04' && standQrForm.amount) params.amount = standQrForm.amount;
      const res = await axios.get(`${backendUrl}/api/payments/youpi/stand-qr`, { params });
      setStandQrResult(res.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate NPCI Stand QR.');
    } finally {
      setGeneratingStandQr(false);
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
  const authorizedVpas = Array.from(
    new Set([youpiAutomation.primaryVpa, ...(youpiAutomation.backupVpas || [])].filter(Boolean))
  );

  const statusBadgeClass = (status) => {
    const s = String(status || '').toLowerCase();
    if (['approved', 'published', 'active', 'reconciled', 'success', 'connected', 'clear'].includes(s)) {
      return 'bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/25';
    }
    if (['pending', 'upcoming', 'observed_success', 'manual_review', 'queued', 'processing', 'initiated', 'idle', 'standby', 'flagged'].includes(s)) {
      return 'bg-[#e09132]/10 text-[#ebb05d] border border-[#e09132]/25';
    }
    if (['rejected', 'cancelled', 'failed', 'expired', 'blocked', 'suspended', 'revoked', 'offline'].includes(s)) {
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
          <button
            type="button"
            onClick={() => setShowEmailPanel((v) => !v)}
            className={`h-9 inline-flex items-center gap-2 px-3 rounded-[8px] text-[12px] font-mono border transition-colors ${
              systemStatus.configured
                ? systemStatus.lastEmailStatus?.delivered === false
                  ? 'bg-[#e5484d]/10 text-[#e5484d] border-[#e5484d]/30'
                  : 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                : 'bg-[#e09132]/10 text-[#ebb05d] border-[#e09132]/25'
            }`}
          >
            <span>
              {systemStatus.configured
                ? systemStatus.lastEmailStatus?.delivered === false
                  ? 'Email Warning · Configure / Test'
                  : `Email Live (${(systemStatus.activeChannels || []).join(', ') || 'configured'})`
                : 'Email Console Mode · Configure Relay'}
            </span>
          </button>
          <Link to="/create-event" className="btn-primary h-9 px-4 text-[13px]">
            New event
          </Link>
        </div>
      </div>

      {/* Email Delivery & Cloud HTTPS Relay Diagnostics Drawer */}
      {showEmailPanel && (
        <div className="rounded-[14px] bg-[#1c1a18] border border-[#e09132]/30 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#efe9de]/[0.08]">
            <div>
              <h2 className="text-[17px] font-medium text-[#efe9de]">
                Email Delivery &amp; Cloud HTTPS Relay Diagnostics
              </h2>
              <p className="text-[12.5px] text-[#aaa398] mt-1">
                Cloud hosts (Render Free) frequently throttle or timeout SMTP ports 465/587. Configure a <strong>Port 443 HTTPS relay</strong> (Brevo Free API, Resend, or a 10-line Google Apps Script Gmail Bridge) for sub-second OTP &amp; registration emails without touching Render redeploy.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowEmailPanel(false)}
              className="btn-secondary h-8 px-3 text-[12px]"
            >
              Close panel
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Test Email & Last Status */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-[12px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 space-y-2.5 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#8a847a] font-mono uppercase">Active Channels</span>
                  <span className="font-mono text-[#ebb05d]">
                    Mode: {systemStatus.relayProvider || 'auto'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {systemStatus.brevoConfigured && (
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25 font-mono text-[11px]">
                      Brevo HTTPS ✓
                    </span>
                  )}
                  {systemStatus.webhookConfigured && (
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25 font-mono text-[11px]">
                      Webhook HTTPS ({systemStatus.webhookUrlHost}) ✓
                    </span>
                  )}
                  {systemStatus.resendConfigured && (
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#4cc38a]/12 text-[#4cc38a] border border-[#4cc38a]/25 font-mono text-[11px]">
                      Resend HTTPS ✓
                    </span>
                  )}
                  {systemStatus.smtpConfigured && (
                    <span className="px-2 py-0.5 rounded-[5px] bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.1] font-mono text-[11px]">
                      SMTP {systemStatus.smtpHost}:{systemStatus.smtpPort} ({systemStatus.smtpUserMasked})
                    </span>
                  )}
                  {!systemStatus.configured && (
                    <span className="text-[#e5484d]">No mail transports configured</span>
                  )}
                </div>

                {systemStatus.lastEmailStatus && (
                  <div className="pt-2 border-t border-[#efe9de]/[0.06] space-y-1">
                    <span className="text-[#8a847a]">Last delivery attempt:</span>
                    <div
                      className={`font-mono text-[11px] ${
                        systemStatus.lastEmailStatus.delivered ? 'text-[#4cc38a]' : 'text-[#e5484d]'
                      }`}
                    >
                      {systemStatus.lastEmailStatus.delivered ? 'DELIVERED' : 'FAILED'} via{' '}
                      {systemStatus.lastEmailStatus.provider} ({systemStatus.lastEmailStatus.latencyMs}ms)
                    </div>
                    {systemStatus.lastEmailStatus.reason && (
                      <p className="text-[11px] text-[#e5484d] break-words">
                        {systemStatus.lastEmailStatus.reason}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <form
                onSubmit={handleSendTestEmail}
                className="rounded-[12px] bg-[#161513] border border-[#efe9de]/[0.08] p-4 space-y-3"
              >
                <span className="block text-[13px] font-medium text-[#efe9de]">
                  Send Diagnostic Test Email
                </span>
                <input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder={user?.email || 'recipient@gmail.com'}
                  className="input-field h-9 text-[12px]"
                />
                <button
                  type="submit"
                  disabled={sendingTestEmail}
                  className="btn-primary w-full h-9 text-[12px]"
                >
                  {sendingTestEmail ? 'Testing Transports...' : 'Send Test Email Now'}
                </button>
                {testEmailResult && (
                  <p
                    className={`text-[11.5px] font-mono ${
                      testEmailResult.ok ? 'text-[#4cc38a]' : 'text-[#e5484d]'
                    }`}
                  >
                    {testEmailResult.ok
                      ? `Delivered via ${testEmailResult.provider} in ${testEmailResult.latencyMs}ms.`
                      : `${testEmailResult.code}: ${testEmailResult.message}`}
                  </p>
                )}
              </form>
            </div>

            {/* Relay Config Form */}
            <form onSubmit={handleSaveEmailSettings} className="lg:col-span-7 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] text-[#aaa398] mb-1">
                    Relay Priority Mode
                  </label>
                  <select
                    value={emailForm.emailRelayProvider}
                    onChange={(e) =>
                      setEmailForm((p) => ({ ...p, emailRelayProvider: e.target.value }))
                    }
                    className="input-field h-9 py-0 text-[12px]"
                  >
                    <option value="auto">Auto (HTTPS Relays first in Cloud)</option>
                    <option value="brevo">Brevo HTTPS API First</option>
                    <option value="webhook">Google Apps Script / Webhook First</option>
                    <option value="resend">Resend HTTPS API First</option>
                    <option value="smtp">Direct SMTP First</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11.5px] text-[#aaa398] mb-1">
                    Sender From Address
                  </label>
                  <input
                    type="text"
                    value={emailForm.smtpFromOverride}
                    onChange={(e) =>
                      setEmailForm((p) => ({ ...p, smtpFromOverride: e.target.value }))
                    }
                    placeholder="Avenor Events <you@gmail.com>"
                    className="input-field h-9 text-[12px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[11.5px] text-[#aaa398] mb-1">
                    <span>Brevo API Key (300 free/day, Port 443)</span>
                    {systemStatus.brevoConfigured && (
                      <button
                        type="button"
                        onClick={() => handleResetEmailChannel({ clearBrevoApiKey: true })}
                        className="text-[#e5484d] hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={emailForm.brevoApiKey}
                    onChange={(e) =>
                      setEmailForm((p) => ({ ...p, brevoApiKey: e.target.value }))
                    }
                    placeholder={
                      systemStatus.brevoConfigured ? 'Saved ✓ (leave blank to keep)' : 'xkeysib-...'
                    }
                    className="input-field h-9 text-[12px] font-mono"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11.5px] text-[#aaa398] mb-1">
                    <span>Resend API Key (Optional)</span>
                    {systemStatus.resendConfigured && (
                      <button
                        type="button"
                        onClick={() => handleResetEmailChannel({ clearResendApiKey: true })}
                        className="text-[#e5484d] hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={emailForm.resendApiKey}
                    onChange={(e) =>
                      setEmailForm((p) => ({ ...p, resendApiKey: e.target.value }))
                    }
                    placeholder={
                      systemStatus.resendConfigured ? 'Saved ✓ (leave blank to keep)' : 're_...'
                    }
                    className="input-field h-9 text-[12px] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[11.5px] text-[#aaa398] mb-1">
                    <span>Google Apps Script / HTTPS Webhook URL</span>
                    {systemStatus.webhookConfigured && (
                      <button
                        type="button"
                        onClick={() => handleResetEmailChannel({ clearEmailWebhook: true })}
                        className="text-[#e5484d] hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    value={emailForm.emailWebhookUrl}
                    onChange={(e) =>
                      setEmailForm((p) => ({ ...p, emailWebhookUrl: e.target.value }))
                    }
                    placeholder={
                      systemStatus.webhookConfigured
                        ? `Configured (${systemStatus.webhookUrlHost})`
                        : 'https://script.google.com/macros/s/.../exec'
                    }
                    className="input-field h-9 text-[12px]"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] text-[#aaa398] mb-1">
                    Webhook Secret Token (Optional)
                  </label>
                  <input
                    type="password"
                    value={emailForm.emailWebhookSecret}
                    onChange={(e) =>
                      setEmailForm((p) => ({ ...p, emailWebhookSecret: e.target.value }))
                    }
                    placeholder={
                      systemStatus.webhookSecretConfigured ? 'Saved ✓ (blank to keep)' : 'Shared secret'
                    }
                    className="input-field h-9 text-[12px] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={emailForm.smtpHostOverride}
                  onChange={(e) =>
                    setEmailForm((p) => ({ ...p, smtpHostOverride: e.target.value }))
                  }
                  placeholder="SMTP Host (e.g. smtp.gmail.com)"
                  className="input-field h-9 text-[12px]"
                />
                <input
                  type="email"
                  value={emailForm.smtpUserOverride}
                  onChange={(e) =>
                    setEmailForm((p) => ({ ...p, smtpUserOverride: e.target.value }))
                  }
                  placeholder="SMTP Username override"
                  className="input-field h-9 text-[12px]"
                />
                <input
                  type="password"
                  value={emailForm.smtpPassOverride}
                  onChange={(e) =>
                    setEmailForm((p) => ({ ...p, smtpPassOverride: e.target.value }))
                  }
                  placeholder="Gmail App Password (blank to keep)"
                  className="input-field h-9 text-[12px] font-mono"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAppsScriptCode((v) => !v)}
                  className="text-[11.5px] text-[#ebb05d] hover:underline"
                >
                  {showAppsScriptCode
                    ? 'Hide Free Gmail Apps Script Guide'
                    : 'Free Setup: Use Your Gmail Over HTTPS (No SMTP Port Block)'}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleResetEmailChannel({ clearSmtpOverrides: true })}
                    className="btn-secondary h-9 px-3 text-[12px]"
                  >
                    Clear SMTP Override
                  </button>
                  <button
                    type="submit"
                    disabled={savingEmailCfg}
                    className="btn-primary h-9 px-4 text-[12px]"
                  >
                    {savingEmailCfg ? 'Saving...' : 'Save Relay Settings'}
                  </button>
                </div>
              </div>

              {showAppsScriptCode && (
                <div className="rounded-[10px] bg-[#12110f] border border-[#efe9de]/[0.08] p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#aaa398]">
                    <span>
                      1. Open <strong className="text-[#efe9de]">script.google.com</strong> → New project → paste below → Deploy as <strong className="text-[#efe9de]">Web App</strong> (Execute as: <strong className="text-[#ebb05d]">Me</strong>, Who has access: <strong className="text-[#ebb05d]">Anyone</strong>) → paste the <code className="text-[#ebb05d]">/exec</code> URL above.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `function doPost(e) {\n  var body = JSON.parse(e.postData.contents);\n  var expectedSecret = ''; // Optional: set same Webhook Secret Token here\n  if (expectedSecret && body.secret !== expectedSecret) {\n    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);\n  }\n  GmailApp.sendEmail(body.to, body.subject, body.text || '', {\n    htmlBody: body.html || undefined,\n    name: body.fromName || 'Avenor Campus Events'\n  });\n  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);\n}`;
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(snippet).then(() => {
                            setSuccess('Google Apps Script bridge copied to clipboard.');
                          });
                        }
                      }}
                      className="btn-secondary h-7 px-2.5 text-[11px] shrink-0"
                    >
                      Copy Script
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-[#d9ceb8] overflow-x-auto leading-relaxed">
{`function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var expectedSecret = ''; // Optional: set same Webhook Secret Token here
  if (expectedSecret && body.secret !== expectedSecret) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
  }
  GmailApp.sendEmail(body.to, body.subject, body.text || '', {
    htmlBody: body.html || undefined,
    name: body.fromName || 'Avenor Campus Events'
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}`}
                  </pre>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

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
          <div className="divide-y divide-[#efe9de]/[0.08]">
            {/* YouPI-PG Zero-Trust Engine Configuration, Statement CSV & Bank Polling */}
            <div className="p-5 bg-[#161513]/70 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-medium text-[#efe9de]">
                    YouPI-PG Zero-Trust Automation, Backup VPA Pool &amp; CSV Settlement
                  </h3>
                  <p className="text-[12px] text-[#8a847a] mt-0.5">
                    Configure backup receiver UPI IDs, Gmail IMAP bank polling, or reconcile bank CSV statements across authorized receiving accounts.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-[6px] text-[11px] font-mono border ${
                      youpiAutomation.imapConfigured
                        ? 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                        : 'bg-[#262421] text-[#8a847a] border-[#efe9de]/[0.08]'
                    }`}
                  >
                    {youpiAutomation.imapConfigured ? 'IMAP Auto-Poll Ready' : 'IMAP Not Configured'}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-[6px] text-[11px] font-mono border ${
                      youpiAutomation.observerConfigured
                        ? 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                        : 'bg-[#262421] text-[#8a847a] border-[#efe9de]/[0.08]'
                    }`}
                  >
                    {youpiAutomation.observerConfigured ? 'SMS/Webhook Bridge Armed' : 'Webhook Secret Unset'}
                  </span>
                  <span className="px-2.5 py-1 rounded-[6px] text-[11px] font-mono border bg-[#e09132]/10 text-[#ebb05d] border-[#e09132]/25">
                    Zero-Trust Mode
                  </span>
                </div>
              </div>

              <div className="rounded-[10px] bg-[#e09132]/10 border border-[#e09132]/30 px-4 py-3 text-[12px] text-[#d9ceb8] leading-relaxed">
                <strong className="text-[#ebb05d]">Zero-Trust Settlement Invariant:</strong>{' '}
                Live Gmail IMAP &amp; Android SMS observations move matching sessions to{' '}
                <code className="font-mono text-[#ebb05d]">OBSERVED_SUCCESS (NOT_RECONCILED)</code> only.
                Student event passes, certificates &amp; WhatsApp group links unlock <strong>exclusively</strong>{' '}
                after 2-day IST CSV Bank Statement Reconciliation or manual Admin Approve below.
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <form
                  onSubmit={handleSaveYoupiAutomation}
                  className="lg:col-span-8 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.08] p-4 space-y-3.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11.5px] text-[#aaa398] mb-1">
                        Backup UPI VPAs (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={youpiAutoForm.backupVpas}
                        onChange={(e) =>
                          setYoupiAutoForm((p) => ({ ...p, backupVpas: e.target.value }))
                        }
                        placeholder="praveensumathi12-2@oksbi, alt@okicici"
                        className="input-field h-9 text-[12px] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] text-[#aaa398] mb-1">
                        Bank Alert Gmail IMAP Email
                      </label>
                      <input
                        type="email"
                        value={youpiAutoForm.imapUser}
                        onChange={(e) =>
                          setYoupiAutoForm((p) => ({ ...p, imapUser: e.target.value }))
                        }
                        placeholder="bank-alerts-gmail@gmail.com"
                        className="input-field h-9 text-[12px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11.5px] text-[#aaa398] mb-1">
                        Gmail IMAP App Password
                      </label>
                      <input
                        type="password"
                        value={youpiAutoForm.imapPass}
                        onChange={(e) =>
                          setYoupiAutoForm((p) => ({ ...p, imapPass: e.target.value }))
                        }
                        placeholder={
                          youpiAutomation.hasImapPass
                            ? `Saved (${youpiAutomation.imapPassHint})`
                            : '16-char Google App Password'
                        }
                        className="input-field h-9 text-[12px] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] text-[#aaa398] mb-1">
                        IMAP Host
                      </label>
                      <input
                        type="text"
                        value={youpiAutoForm.imapHost}
                        onChange={(e) =>
                          setYoupiAutoForm((p) => ({ ...p, imapHost: e.target.value }))
                        }
                        className="input-field h-9 text-[12px] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11.5px] text-[#aaa398] mb-1">
                        IMAP Port
                      </label>
                      <input
                        type="number"
                        value={youpiAutoForm.imapPort}
                        onChange={(e) =>
                          setYoupiAutoForm((p) => ({ ...p, imapPort: e.target.value }))
                        }
                        className="input-field h-9 text-[12px] font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#d9ceb8]">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={youpiAutoForm.autoVerifyEnabled}
                        onChange={(e) =>
                          setYoupiAutoForm((p) => ({ ...p, autoVerifyEnabled: e.target.checked }))
                        }
                        className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132]"
                      />
                      <span>Enable automated IMAP polling during active 300s/30s checkout windows</span>
                    </label>
                  </div>

                  {generatedObserverSecret && (
                    <div className="p-2.5 rounded-[8px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 text-[11px] font-mono text-[#4cc38a] break-all">
                      New X-Youpi-Observer-Secret (copy now): {generatedObserverSecret}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pollingInbox}
                        onClick={handlePollBankInboxNow}
                        className="btn-secondary h-8 px-3 text-[12px]"
                      >
                        {pollingInbox ? 'Polling IMAP...' : 'Poll Bank Inbox Now'}
                      </button>
                      <button
                        type="button"
                        disabled={savingYoupiAuto}
                        onClick={() =>
                          handleSaveYoupiAutomation(null, { generateObserverSecret: true })
                        }
                        className="btn-secondary h-8 px-3 text-[12px]"
                      >
                        Generate SMS Observer Secret
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={savingYoupiAuto}
                      className="btn-primary h-8 px-4 text-[12px]"
                    >
                      {savingYoupiAuto ? 'Saving...' : 'Save Automation Settings'}
                    </button>
                  </div>

                  {youpiAutomation.lastPollAt && (
                    <p className="text-[11px] font-mono text-[#8a847a]">
                      Last IMAP sweep: {new Date(youpiAutomation.lastPollAt).toLocaleString()} ·{' '}
                      {youpiAutomation.lastPollResult?.ok
                        ? `Scanned ${youpiAutomation.lastPollResult.scanned || 0}, Observed ${youpiAutomation.lastPollResult.matched || 0}`
                        : youpiAutomation.lastPollResult?.error || 'Idle'}
                    </p>
                  )}
                </form>

                {/* Bank CSV Bulk Reconciliation */}
                <div className="lg:col-span-4 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.08] p-4 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <span className="text-[13px] font-medium text-[#efe9de]">
                      Bank CSV Statement Reconciliation
                    </span>
                    <p className="text-[11.5px] text-[#8a847a] leading-relaxed">
                      Import your HDFC / SBI / ICICI / Axis CSV statement to settle{' '}
                      <code className="font-mono text-[#ebb05d]">OBSERVED_SUCCESS</code> &amp;{' '}
                      <code className="font-mono text-[#ebb05d]">MANUAL_REVIEW</code> sessions within the 2-day IST posting window.
                    </p>

                    {authorizedVpas.length > 0 && (
                      <div>
                        <label className="block text-[11px] text-[#aaa398] mb-1">
                          Statement Receiving Account (VPA)
                        </label>
                        <select
                          aria-label="Statement Receiving VPA"
                          value={statementVpa || authorizedVpas[0]}
                          onChange={(e) => setStatementVpa(e.target.value)}
                          className="input-field h-8 text-[11.5px] font-mono py-0"
                        >
                          {authorizedVpas.map((vpa) => (
                            <option key={vpa} value={vpa}>
                              {vpa}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="text-[10px] font-mono text-[#8a847a] space-y-0.5 break-all pt-1">
                      <div>Android App Endpoint: {(backendUrl || window.location.origin)}/api/payments/youpi/pollers/android/events</div>
                      <div>Secret SMS Bridge: {(backendUrl || window.location.origin)}/api/payments/youpi/observer/sms</div>
                    </div>
                  </div>

                  {csvSummary && (
                    <div className="p-2.5 rounded-[8px] bg-[#1c1a18] border border-[#efe9de]/[0.08] text-[11px] font-mono space-y-0.5 text-[#d9ceb8]">
                      <div>Credit rows parsed: {csvSummary.creditRows || 0}</div>
                      <div className="text-[#4cc38a]">Reconciled (RECONCILED): {csvSummary.reconciled ?? csvSummary.matchedCount ?? 0}</div>
                      <div className="text-[#ebb05d]">Conflicts / Held: {csvSummary.conflicts ?? csvSummary.ambiguousCount ?? 0}</div>
                      <div className="text-[#8a847a]">
                        Unmatched / Dup: {(csvSummary.unmatched ?? csvSummary.unattributedCount ?? 0) + (csvSummary.duplicateCount || 0)}
                      </div>
                    </div>
                  )}

                  <label className="btn-primary h-9 px-3 text-[12px] cursor-pointer text-center">
                    <span>{reconcilingCsv ? 'Reconciling CSV...' : 'Import Bank Statement (.csv)'}</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      disabled={reconcilingCsv}
                      onChange={handleUploadStatementCsv}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Android SMS Gateway Pairing, Live FIFO Queue Monitor & NPCI Stand QR */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Android SMS Gateway Pairing & Paired Devices */}
                <div className="lg:col-span-5 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.08] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-[13px] font-medium text-[#efe9de]">
                        Android SMS Gateway Pairing (HMAC)
                      </h4>
                      <p className="text-[11px] text-[#8a847a]">
                        Pair an Android companion phone via QR to forward bank SMS &amp; GPay/PhonePe/Paytm alerts securely.
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-[5px] text-[10.5px] font-mono bg-[#262421] text-[#ebb05d] border border-[#efe9de]/[0.08]">
                      {youpiDevices.filter((d) => d.isActive).length} active device(s)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {authorizedVpas.length > 0 && (
                      <select
                        aria-label="Receiving VPA for Android SMS Gateway"
                        value={selectedDeviceVpa || authorizedVpas[0]}
                        onChange={(e) => setSelectedDeviceVpa(e.target.value)}
                        className="input-field h-8 text-[11.5px] font-mono py-0 flex-1 min-w-[160px]"
                      >
                        {authorizedVpas.map((vpa) => (
                          <option key={vpa} value={vpa}>
                            {vpa}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      disabled={generatingPairQr}
                      onClick={() => handleGeneratePairQr()}
                      className="btn-secondary h-8 px-3 text-[11.5px] shrink-0"
                    >
                      {generatingPairQr ? 'Generating...' : 'Generate Pairing QR'}
                    </button>
                  </div>

                  {pairQrData?.qrSvg && (
                    <div className="rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] p-3 flex flex-col sm:flex-row items-center gap-3">
                      <div className="bg-white p-2 rounded-[8px] shrink-0">
                        <img
                          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pairQrData.qrSvg)}`}
                          alt="Android SMS Gateway Pairing QR"
                          className="w-28 h-28 block"
                        />
                      </div>
                      <div className="min-w-0 space-y-1 text-[11px]">
                        <div className="font-medium text-[#efe9de]">Scan inside YouPI Android Companion</div>
                        <div className="font-mono text-[#ebb05d] break-all">
                          VPA: {pairQrData.receivingAccountId}
                        </div>
                        <div className="text-[#8a847a]">
                          Signed with SHA-256 HMAC per device · 60s replay guard
                        </div>
                      </div>
                    </div>
                  )}

                  {youpiDevices.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {youpiDevices.map((dev) => (
                        <div
                          key={dev.deviceId}
                          className="rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.06] px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[#efe9de] truncate">
                                {dev.deviceName || dev.deviceModel || 'Android Observer'}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded-[4px] font-mono text-[10px] ${statusBadgeClass(
                                  dev.connectionStatus || (dev.isActive ? 'standby' : 'revoked')
                                )}`}
                              >
                                {dev.connectionStatus || (dev.isActive ? 'STANDBY' : 'REVOKED')}
                              </span>
                            </div>
                            <div className="font-mono text-[10px] text-[#8a847a] truncate mt-0.5">
                              {dev.receivingAccountId || 'All VPAs'} · ID: {String(dev.deviceId).slice(0, 8)}…
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {dev.isActive && (
                              <button
                                type="button"
                                onClick={() => handleRevokeAndroidDevice(dev.deviceId)}
                                className="px-2 py-1 rounded-[5px] text-[10.5px] font-medium text-[#ebb05d] bg-[#e09132]/10 border border-[#e09132]/25 hover:bg-[#e09132]/20"
                              >
                                Revoke
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteAndroidDevice(dev.deviceId)}
                              className="px-2 py-1 rounded-[5px] text-[10.5px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#8a847a]">
                      No Android SMS Gateway devices paired yet. Generate a QR above to link a phone.
                    </p>
                  )}
                </div>

                {/* Live FIFO Single-Slot Queue Monitor */}
                <div className="lg:col-span-4 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.08] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-[13px] font-medium text-[#efe9de]">
                        Live FIFO Payment Slot Monitor
                      </h4>
                      <p className="text-[11px] text-[#8a847a]">
                        1 active checkout per receiving VPA at any time; others queue in strict FIFO order.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRefreshQueue()}
                      className="btn-secondary h-7 px-2.5 text-[11px] shrink-0"
                    >
                      Refresh
                    </button>
                  </div>

                  {authorizedVpas.length > 0 && (
                    <select
                      aria-label="Inspect Queue for VPA"
                      value={youpiQueue.receivingAccountId || authorizedVpas[0]}
                      onChange={(e) => handleRefreshQueue(e.target.value)}
                      className="input-field h-8 text-[11.5px] font-mono py-0"
                    >
                      {authorizedVpas.map((vpa) => (
                        <option key={vpa} value={vpa}>
                          Slot Pool: {vpa}
                        </option>
                      ))}
                    </select>
                  )}

                  {youpiQueue.currentSlot ? (
                    <div className="rounded-[9px] bg-[#161513] border border-[#4cc38a]/25 p-3 space-y-1 text-[11.5px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[#4cc38a] font-semibold">
                          ACTIVE SLOT HOLDER
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-[4px] font-mono text-[10px] ${statusBadgeClass(youpiQueue.currentSlot.status)}`}>
                          {youpiQueue.currentSlot.status}
                        </span>
                      </div>
                      <div className="font-mono text-[#efe9de]">
                        {youpiQueue.currentSlot.orderId} · ₹{((Number(youpiQueue.currentSlot.amountPaise) || 0) / 100).toFixed(2)}
                      </div>
                      <div className="text-[#8a847a] truncate">
                        {youpiQueue.currentSlot.event?.title || 'Event checkout'} · Method: {youpiQueue.currentSlot.method || 'UPI'}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[9px] bg-[#161513] border border-[#efe9de]/[0.06] p-3 text-[11.5px] text-[#8a847a]">
                      Slot idle — next checkout acquires immediately without queuing.
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-mono text-[#aaa398]">
                      Waiting Queue ({youpiQueue.queue?.length || 0})
                    </div>
                    {(youpiQueue.queue || []).length === 0 ? (
                      <p className="text-[11px] text-[#8a847a]">No sessions waiting in queue.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                        {youpiQueue.queue.map((q) => (
                          <div
                            key={q.paymentId}
                            className="rounded-[7px] bg-[#161513] border border-[#efe9de]/[0.06] px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono"
                          >
                            <span className="text-[#ebb05d]">#{q.queuePosition}</span>
                            <span className="text-[#efe9de] truncate mx-2">{q.orderId}</span>
                            <span className="text-[#aaa398]">₹{((Number(q.amountPaise) || 0) / 100).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* NPCI Stand QR Generator (mode=02 Static / mode=04 Fixed Amount) */}
                <form
                  onSubmit={handleGenerateStandQr}
                  className="lg:col-span-3 rounded-[12px] bg-[#12110f] border border-[#efe9de]/[0.08] p-4 space-y-2.5"
                >
                  <div>
                    <h4 className="text-[13px] font-medium text-[#efe9de]">
                      NPCI Desk Stand QR
                    </h4>
                    <p className="text-[11px] text-[#8a847a]">
                      Printable booth QR (`mode=02` open or `mode=04` fixed INR).
                    </p>
                  </div>

                  {authorizedVpas.length > 0 && (
                    <select
                      aria-label="Stand QR Payee VPA"
                      value={standQrForm.preferredVpa || authorizedVpas[0]}
                      onChange={(e) =>
                        setStandQrForm((p) => ({ ...p, preferredVpa: e.target.value }))
                      }
                      className="input-field h-8 text-[11.5px] font-mono py-0"
                    >
                      {authorizedVpas.map((vpa) => (
                        <option key={vpa} value={vpa}>
                          {vpa}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="NPCI Stand QR Mode"
                      value={standQrForm.mode}
                      onChange={(e) =>
                        setStandQrForm((p) => ({ ...p, mode: e.target.value }))
                      }
                      className="input-field h-8 text-[11.5px] font-mono py-0"
                    >
                      <option value="02">Static (02)</option>
                      <option value="04">Fixed Amt (04)</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={standQrForm.mode !== '04'}
                      placeholder={standQrForm.mode === '04' ? 'INR Amount' : 'Open amount'}
                      value={standQrForm.amount}
                      onChange={(e) =>
                        setStandQrForm((p) => ({ ...p, amount: e.target.value }))
                      }
                      className="input-field h-8 text-[11.5px] font-mono disabled:opacity-45"
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Desk note (e.g. Avenor Desk)"
                    value={standQrForm.tn}
                    onChange={(e) => setStandQrForm((p) => ({ ...p, tn: e.target.value }))}
                    className="input-field h-8 text-[11.5px]"
                  />

                  <button
                    type="submit"
                    disabled={generatingStandQr}
                    className="btn-secondary h-8 w-full text-[11.5px]"
                  >
                    {generatingStandQr ? 'Generating QR...' : 'Generate NPCI Stand QR'}
                  </button>

                  {standQrResult?.qrSvg && (
                    <div className="pt-1 flex flex-col items-center gap-1.5">
                      <div className="bg-white p-2 rounded-[8px]">
                        <img
                          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(standQrResult.qrSvg)}`}
                          alt="NPCI Stand QR"
                          className="w-28 h-28 block"
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[#8a847a] text-center break-all line-clamp-2">
                        {standQrResult.upiUri}
                      </span>
                    </div>
                  )}
                </form>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#efe9de]/[0.06]">
                <thead className="bg-[#12110f]/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Order, Method &amp; UTR</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Event</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Student</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Amount</th>
                    <th className="px-5 py-3 text-left text-[12px] font-medium text-[#8a847a]">Status &amp; Settlement</th>
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
                      const canReconcile = [
                        'MANUAL_REVIEW',
                        'ACTIVE',
                        'PROCESSING',
                        'QUEUED',
                        'OBSERVED_SUCCESS'
                      ].includes(ps.status);
                      const busy = reconcilingId === ps.paymentId;
                      return (
                        <tr key={ps.paymentId} className="hover:bg-[#262421]/40 transition-colors duration-150">
                          <td className="px-5 py-3.5 whitespace-nowrap text-[12px] font-mono">
                            <div className="text-[#efe9de] flex items-center gap-1.5">
                              <span>{ps.orderId}</span>
                              <span className="px-1.5 py-0.5 rounded-[4px] bg-[#262421] text-[10px] text-[#aaa398]">
                                {ps.method || 'UPI'}
                              </span>
                            </div>
                            <div className="text-[#8a847a] mt-0.5">
                              {ps.utr ? `UTR: ${ps.utr}` : 'Awaiting UTR'}
                              {ps.payeeVpa ? ` · ${ps.payeeVpa}` : ''}
                              {ps.queuePosition > 0 ? ` · Q#${ps.queuePosition}` : ''}
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
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-[6px] text-[11px] font-mono ${statusBadgeClass(
                                  ps.status
                                )}`}
                              >
                                {ps.status}
                              </span>
                              <span className="text-[10.5px] font-mono text-[#8a847a]">
                                {ps.settlementState || 'PENDING'}
                                {ps.verificationTag ? ` · ${ps.verificationTag}` : ''}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-[12px]">
                            {canReconcile ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleReconcileYoupi(ps.paymentId, 'approve')}
                                  className="h-8 px-2.5 rounded-[6px] font-medium text-[#4cc38a] bg-[#4cc38a]/10 border border-[#4cc38a]/25 hover:bg-[#4cc38a]/20 transition-colors"
                                >
                                  Approve &amp; Unlock
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleReconcileYoupi(ps.paymentId, 'reject')}
                                  className="h-8 px-2.5 rounded-[6px] font-medium text-[#e5484d] bg-[#e5484d]/10 border border-[#e5484d]/25 hover:bg-[#e5484d]/20 transition-colors"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] font-mono text-[#8a847a]">
                                {ps.settlementState}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Fraud Security & Suspended Identities Panel */}
            <div className="p-5 bg-[#161513]/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-[13.5px] font-medium text-[#efe9de]">
                    Fraud Security &amp; Auto-Suspended Identities ({suspendedUsers.length})
                  </h4>
                  <p className="text-[11.5px] text-[#8a847a]">
                    Stage 5 spoofing defense automatically suspends accounts linked to spoofed bank SMS/email sender injections.
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-[5px] text-[11px] font-mono border ${
                    suspendedUsers.length > 0
                      ? 'bg-[#e5484d]/10 text-[#e5484d] border-[#e5484d]/30'
                      : 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                  }`}
                >
                  {suspendedUsers.length > 0 ? `${suspendedUsers.length} Suspended` : 'All Clear'}
                </span>
              </div>

              {suspendedUsers.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {suspendedUsers.map((su) => (
                    <div
                      key={su._id}
                      className="rounded-[10px] bg-[#12110f] border border-[#e5484d]/30 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[#efe9de] truncate">
                            {su.name}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded-[4px] font-mono text-[10px] ${statusBadgeClass(su.paymentSecurityStatus)}`}>
                            {su.paymentSecurityStatus}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#8a847a] truncate">
                          {su.email}
                        </div>
                        {su.paymentSecurityReason && (
                          <div className="text-[11px] text-[#e5484d] truncate mt-0.5">
                            {su.paymentSecurityReason}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={unbanningUserId === su._id}
                        onClick={() => handleUnbanUser(su)}
                        className="h-8 px-3 rounded-[6px] text-[11.5px] font-medium text-[#4cc38a] bg-[#4cc38a]/10 border border-[#4cc38a]/25 hover:bg-[#4cc38a]/20 shrink-0"
                      >
                        {unbanningUserId === su._id ? 'Unbanning...' : 'Unban / Clear Flag'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {recentFraudObs.length > 0 && (
                <div className="rounded-[9px] bg-[#12110f] border border-[#e5484d]/20 p-3 space-y-1.5">
                  <div className="text-[11px] font-mono text-[#e5484d] uppercase">
                    Recent Spoof / Fraud Rejection Audit ({recentFraudObs.length})
                  </div>
                  {recentFraudObs.slice(0, 5).map((fo) => (
                    <div key={fo._id} className="text-[11px] font-mono text-[#aaa398] truncate">
                      [{new Date(fo.createdAt).toLocaleString()}] {fo.source} · Sender: {fo.sender || 'unknown'} · {fo.reason || fo.rawSnippet}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {youpiObservations.length > 0 && (
              <div className="p-5 bg-[#12110f]/40 space-y-2.5">
                <h4 className="text-[13px] font-medium text-[#aaa398]">
                  Recent Automated Bank Observations ({youpiObservations.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {youpiObservations.slice(0, 8).map((obs) => (
                    <div
                      key={obs._id || obs.fingerprint}
                      className="rounded-[9px] bg-[#161513] border border-[#efe9de]/[0.07] p-3 text-[11.5px] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 font-mono">
                        <span className="text-[#ebb05d]">
                          {obs.source} · ₹{((Number(obs.amountPaise) || 0) / 100).toFixed(2)}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-[4px] border text-[10px] ${
                            obs.attributionStatus?.startsWith('MATCHED')
                              ? 'bg-[#4cc38a]/10 text-[#4cc38a] border-[#4cc38a]/25'
                              : obs.attributionStatus === 'AMBIGUOUS'
                                ? 'bg-[#e09132]/12 text-[#ebb05d] border-[#e09132]/30'
                                : 'bg-[#e5484d]/10 text-[#e5484d] border-[#e5484d]/25'
                          }`}
                        >
                          {obs.attributionStatus}
                        </span>
                      </div>
                      <p className="text-[#8a847a] truncate">
                        Sender: {obs.sender || '—'} {obs.bankRef ? `· UTR: ${obs.bankRef}` : ''}
                      </p>
                      <p className="text-[#aaa398] line-clamp-1">{obs.reason || obs.rawSnippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
