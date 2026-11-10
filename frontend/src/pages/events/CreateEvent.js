import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { getBackendUrl } from '../../utils/apiConfig';
import { resolveMediaUrl } from '../../utils/eventLifecycle';
import { useAuth } from '../../contexts/AuthContext';
import { DEFAULT_DEPARTMENTS, fetchDepartments } from '../../utils/departments';
import {
  CurrencyRupeeIcon,
  TrophyIcon,
  PhotoIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';
import AvenorLoader from '../../components/common/AvenorLoader';

const toLocalDatetimeInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const CreateEvent = () => {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    department: '',
    type: '',
    status: 'approved',
    club: '',
    category: '',
    tags: '',
    eligibility: 'Open to all enrolled students',
    capacity: '',
    registrationOpen: true,
    registrationDeadline: '',
    isPaid: false,
    registrationFee: '',
    currency: 'INR',
    paymentUpiId: '',
    backupPaymentUpiIds: '',
    paymentInstructions: '',
    whatsappGroupLink: '',
    autoDeleteWhenExpired: 'inherit',
    highlights: '',
    perks: '',
    agenda: '',
    certificateEnabled: true,
    requireEventRegistration: true
  });

  const [clubs, setClubs] = useState([]);
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [manageableCompetitions, setManageableCompetitions] = useState([]);
  const [selectedCompetitionIds, setSelectedCompetitionIds] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [existingPhoto, setExistingPhoto] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditing);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [youpiConfig, setYoupiConfig] = useState({
    gatewayMode: 'embedded',
    vpaConfigured: false,
    defaultPayeeVpa: '',
    verificationMode: 'manual'
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    Promise.allSettled([
      axios.get(`${backendUrl}/api/clubs`, { headers }),
      axios.get(`${backendUrl}/api/competitions/manage`, { headers }),
      isEditing ? axios.get(`${backendUrl}/api/events/${id}`, { headers }) : Promise.resolve(null),
      axios.get(`${backendUrl}/api/payments/youpi/config`),
      fetchDepartments()
    ]).then(([clubsRes, compsRes, eventRes, youpiRes, deptRes]) => {
      if (deptRes?.status === 'fulfilled' && Array.isArray(deptRes.value) && deptRes.value.length > 0) {
        setDepartments(deptRes.value.map((d) => d.name));
      }
      if (youpiRes?.status === 'fulfilled' && youpiRes.value?.data) {
        setYoupiConfig(youpiRes.value.data);
      }
      if (clubsRes.status === 'fulfilled') {
        const allClubs = clubsRes.value.data || [];
        const manageable = user?.role === 'admin' ? allClubs : allClubs.filter((c) => c.canManage);
        setClubs(manageable);
        if (!isEditing && manageable.length === 1) {
          setFormData((prev) => ({ ...prev, club: manageable[0]._id }));
        }
      }

      if (compsRes.status === 'fulfilled') {
        setManageableCompetitions(compsRes.value.data || []);
      }

      if (isEditing && eventRes.status === 'fulfilled' && eventRes.value?.data) {
        const ev = eventRes.value.data;
        const linked = Array.isArray(ev.linkedCompetitions) ? ev.linkedCompetitions : [];
        const linkedIds = linked.map((c) => c._id);
        const requireReg = linked.length > 0 ? linked.some((c) => c.requireEventRegistration !== false) : true;

        setSelectedCompetitionIds(linkedIds);
        setExistingPhoto(ev.photo || '');
        setFormData({
          title: ev.title || '',
          description: ev.description || '',
          date: toDateInput(ev.date),
          time: ev.time || '',
          location: ev.location || '',
          department: ev.department || '',
          type: ev.type || '',
          status: ev.status || 'approved',
          club: ev.club?._id || ev.club || '',
          category: ev.category || '',
          tags: Array.isArray(ev.tags) ? ev.tags.join(', ') : '',
          eligibility: ev.eligibility || 'Open to all enrolled students',
          capacity: ev.capacity !== undefined && ev.capacity !== null ? String(ev.capacity) : '',
          registrationOpen: ev.registrationOpen !== false,
          registrationDeadline: toLocalDatetimeInput(ev.registrationDeadline),
          isPaid: Boolean(ev.isPaid),
          registrationFee: ev.registrationFee ? String(ev.registrationFee) : '',
          currency: ev.currency || 'INR',
          paymentUpiId: ev.paymentUpiId || '',
          backupPaymentUpiIds: Array.isArray(ev.backupPaymentUpiIds)
            ? ev.backupPaymentUpiIds.join(', ')
            : '',
          paymentInstructions: ev.paymentInstructions || '',
          whatsappGroupLink: ev.whatsappGroupLink || '',
          autoDeleteWhenExpired: ev.autoDeleteWhenExpired || 'inherit',
          highlights: Array.isArray(ev.noveltyFeatures?.highlights)
            ? ev.noveltyFeatures.highlights.join('\n')
            : '',
          perks: Array.isArray(ev.noveltyFeatures?.perks) ? ev.noveltyFeatures.perks.join('\n') : '',
          agenda: Array.isArray(ev.noveltyFeatures?.agenda) ? ev.noveltyFeatures.agenda.join('\n') : '',
          certificateEnabled: ev.noveltyFeatures?.certificateEnabled !== false,
          requireEventRegistration: requireReg
        });
      } else if (isEditing && eventRes.status === 'rejected') {
        setError(eventRes.reason?.response?.data?.message || 'Unable to load event for editing.');
      }

      setInitialLoading(false);
    });
  }, [backendUrl, id, isEditing, user?.role]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Event cover image must be 2 MB or smaller.');
      return;
    }
    setError('');
    setPhoto(file);
    setRemovePhoto(false);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const toggleCompetitionSelection = (compId) => {
    setSelectedCompetitionIds((prev) =>
      prev.includes(compId) ? prev.filter((item) => item !== compId) : [...prev, compId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.isPaid && (!formData.registrationFee || Number(formData.registrationFee) <= 0)) {
      setError('Paid events must have a registration fee greater than 0.');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to manage events');
        return;
      }

      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title.trim());
      formDataToSend.append('description', formData.description.trim());
      formDataToSend.append('date', formData.date);
      formDataToSend.append('time', formData.time.trim());
      formDataToSend.append('location', formData.location.trim());
      formDataToSend.append('department', formData.department);
      formDataToSend.append('type', formData.type);
      formDataToSend.append('status', formData.status);
      formDataToSend.append('eligibility', formData.eligibility);
      formDataToSend.append('capacity', String(formData.capacity));
      formDataToSend.append('registrationOpen', String(Boolean(formData.registrationOpen)));
      formDataToSend.append('registrationDeadline', formData.registrationDeadline || '');
      formDataToSend.append('isPaid', String(Boolean(formData.isPaid)));
      formDataToSend.append(
        'registrationFee',
        formData.isPaid ? String(Number(formData.registrationFee || 0)) : '0'
      );
      formDataToSend.append('currency', formData.currency || 'INR');
      formDataToSend.append('paymentUpiId', formData.paymentUpiId || '');
      formDataToSend.append('backupPaymentUpiIds', formData.backupPaymentUpiIds || '');
      formDataToSend.append('paymentInstructions', formData.paymentInstructions || '');
      formDataToSend.append('whatsappGroupLink', formData.whatsappGroupLink.trim());
      formDataToSend.append('autoDeleteWhenExpired', formData.autoDeleteWhenExpired || 'inherit');
      formDataToSend.append('highlights', formData.highlights);
      formDataToSend.append('perks', formData.perks);
      formDataToSend.append('agenda', formData.agenda);
      formDataToSend.append('certificateEnabled', String(Boolean(formData.certificateEnabled)));

      if (formData.club) {
        formDataToSend.append('club', formData.club);
      } else if (isEditing) {
        formDataToSend.append('club', '');
      }

      if (formData.category || isEditing) {
        formDataToSend.append('category', formData.category);
      }

      if (formData.tags || isEditing) {
        formDataToSend.append('tags', formData.tags);
      }

      formDataToSend.append('connectedCompetitionIds', selectedCompetitionIds.join(','));
      formDataToSend.append('replaceCompetitionLinks', 'true');
      formDataToSend.append('requireEventRegistration', String(Boolean(formData.requireEventRegistration)));

      if (photo) {
        formDataToSend.append('photo', photo);
      } else if (removePhoto) {
        formDataToSend.append('removePhoto', 'true');
      }

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      };

      const response = isEditing
        ? await axios.put(`${backendUrl}/api/events/${id}`, formDataToSend, config)
        : await axios.post(`${backendUrl}/api/events`, formDataToSend, config);

      const savedId = response.data?._id || id;
      navigate(savedId ? `/events/${savedId}` : '/events');
    } catch (err) {
      console.error('Error saving event:', err);
      setError(
        err.response?.data?.message ||
          (isEditing ? 'Failed to update event. Please try again.' : 'Failed to create event. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  };

  const departmentOptions =
    formData.department && !departments.includes(formData.department)
      ? [formData.department, ...departments]
      : departments;

  const displayedPhoto = photoPreviewUrl || (!removePhoto ? resolveMediaUrl(existingPhoto) : '');

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center py-24">
        <AvenorLoader variant="section" label="Loading event editor..." />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {isEditing && (
            <Link
              to={`/events/${id}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#aaa398] hover:text-[#efe9de] mb-2 transition-colors"
            >
              <ArrowLeftIcon className="h-4 w-4" strokeWidth={1.5} />
              <span>Back to event</span>
            </Link>
          )}
          <h1 className="text-[28px] font-medium text-[#efe9de] tracking-[-0.02em] leading-[1.15]">
            {isEditing ? 'Edit event' : 'Create new event'}
          </h1>
          <p className="mt-1.5 text-[14px] text-[#aaa398]">
            {isEditing
              ? 'Update schedule, ticket pricing, cover photo, and linked competitions anytime.'
              : 'Publish a department workshop, fest session, paid summit, or connected competition.'}
          </p>
        </div>
      </div>

      <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08]">
          <div>
            <h2 className="text-[14px] font-medium text-[#efe9de]">
              Hosting a quiz or coding contest
            </h2>
            <p className="text-[13px] text-[#8a847a] mt-0.5">
              {isEditing
                ? 'Launch a new competition pre-linked to this event or attach existing ones below.'
                : 'Set up timed MCQs or coding problems in the competition studio and connect them to events.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(isEditing ? `/competitions/create?eventId=${id}` : '/competitions/create')}
            className="btn-secondary h-9 px-3.5 text-[13px] shrink-0"
          >
            {isEditing ? 'New linked contest' : 'Open studio'}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="title" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Event title
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              rows={4}
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="date" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Date
              </label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="input-field font-mono"
              />
            </div>

            <div>
              <label htmlFor="time" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Time
              </label>
              <input
                type="text"
                id="time"
                name="time"
                value={formData.time}
                onChange={handleChange}
                placeholder="e.g. 10:00 AM - 4:00 PM"
                required
                className="input-field font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="location" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Location
            </label>
            <input
              type="text"
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              required
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="department" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Department
              </label>
              <select
                id="department"
                name="department"
                value={formData.department}
                onChange={handleChange}
                required
                className="input-field"
              >
                <option value="">Select department</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="type" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Event type
              </label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                required
                className="input-field"
              >
                <option value="">Select type</option>
                <option value="tech">Tech events</option>
                <option value="non-tech">Non-tech events</option>
                <option value="special">Special events</option>
                <option value="workshop">Workshops</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="category" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Feed category
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="input-field"
              >
                <option value="">Auto-detect from type</option>
                <option value="Technical">Technical</option>
                <option value="Hackathon">Hackathon</option>
                <option value="Workshop">Workshop</option>
                <option value="Seminar">Seminar</option>
                <option value="Cultural">Cultural</option>
                <option value="Sports">Sports</option>
                <option value="Competition">Competition</option>
              </select>
            </div>

            <div>
              <label htmlFor="club" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Host club (optional)
              </label>
              <select
                id="club"
                name="club"
                value={formData.club}
                onChange={handleChange}
                className="input-field"
              >
                <option value="">Auto-match organizer chapter</option>
                {clubs.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isEditing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="status" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                  Publication status
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="approved">Approved / Published</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label htmlFor="registrationDeadline" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                  Registration deadline (optional)
                </label>
                <input
                  type="datetime-local"
                  id="registrationDeadline"
                  name="registrationDeadline"
                  value={formData.registrationDeadline}
                  onChange={handleChange}
                  className="input-field font-mono"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="tags" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Tags (optional)
              </label>
              <input
                type="text"
                id="tags"
                name="tags"
                value={formData.tags}
                onChange={handleChange}
                placeholder="e.g. AI, Robotics, Hackathon"
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="eligibility" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Eligibility
              </label>
              <input
                type="text"
                id="eligibility"
                name="eligibility"
                value={formData.eligibility}
                onChange={handleChange}
                placeholder="Open to all enrolled students"
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label htmlFor="capacity" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Capacity
              </label>
              <input
                type="number"
                id="capacity"
                name="capacity"
                value={formData.capacity}
                onChange={handleChange}
                required
                min="1"
                className="input-field font-mono"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer h-10 px-3.5 rounded-[8px] bg-[#161513] border border-[#efe9de]/[0.08]">
              <input
                type="checkbox"
                id="registrationOpen"
                name="registrationOpen"
                checked={formData.registrationOpen}
                onChange={handleChange}
                className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132]"
              />
              <span className="text-[13px] font-medium text-[#efe9de]">Registrations open</span>
            </label>
          </div>

          {/* Payment Configuration */}
          <div className="p-4 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CurrencyRupeeIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                <span className="text-[14px] font-medium text-[#efe9de]">Registration pricing</span>
              </div>
              <label className="inline-flex items-center gap-2.5 cursor-pointer text-[13px] font-medium text-[#efe9de]">
                <input
                  type="checkbox"
                  name="isPaid"
                  checked={formData.isPaid}
                  onChange={handleChange}
                  className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132]"
                />
                <span>Require entry fee (Paid event)</span>
              </label>
            </div>

            {formData.isPaid ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label htmlFor="registrationFee" className="block text-[12px] font-medium text-[#aaa398] mb-1">
                    Registration fee ({formData.currency || 'INR'}) *
                  </label>
                  <input
                    type="number"
                    id="registrationFee"
                    name="registrationFee"
                    min="1"
                    step="1"
                    required={formData.isPaid}
                    value={formData.registrationFee}
                    onChange={handleChange}
                    placeholder="e.g. 199"
                    className="input-field font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="paymentUpiId" className="block text-[12px] font-medium text-[#aaa398] mb-1">
                    Payee UPI VPA{' '}
                    {youpiConfig.gatewayMode === 'embedded' && !youpiConfig.vpaConfigured
                      ? '*'
                      : youpiConfig.defaultPayeeVpa
                        ? `(optional — defaults to ${youpiConfig.defaultPayeeVpa})`
                        : '(managed by external YouPI-PG merchant account)'}
                  </label>
                  <input
                    type="text"
                    id="paymentUpiId"
                    name="paymentUpiId"
                    required={formData.isPaid && youpiConfig.gatewayMode === 'embedded' && !youpiConfig.vpaConfigured}
                    value={formData.paymentUpiId}
                    onChange={handleChange}
                    placeholder="your-club-or-college@bank"
                    className="input-field font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="backupPaymentUpiIds" className="block text-[12px] font-medium text-[#aaa398] mb-1">
                    Backup UPI VPAs for automatic rotation (optional, comma-separated)
                  </label>
                  <input
                    type="text"
                    id="backupPaymentUpiIds"
                    name="backupPaymentUpiIds"
                    value={formData.backupPaymentUpiIds}
                    onChange={handleChange}
                    placeholder="e.g. backup1@oksbi, backup2@okicici (used if GPay hits daily receiver limit)"
                    className="input-field font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="paymentInstructions" className="block text-[12px] font-medium text-[#aaa398] mb-1">
                    YouPI-PG checkout instructions (optional)
                  </label>
                  <input
                    type="text"
                    id="paymentInstructions"
                    name="paymentInstructions"
                    value={formData.paymentInstructions}
                    onChange={handleChange}
                    placeholder="e.g. Scan the YouPI UPI QR code and enter your 12-digit UTR to unlock pass & competitions"
                    className="input-field"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-[#8a847a]">
                Free campus event — students can reserve seats immediately without checkout.
              </p>
            )}

            <div className="pt-3 border-t border-[#efe9de]/[0.06] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="whatsappGroupLink" className="block text-[12px] font-medium text-[#aaa398] mb-1">
                  WhatsApp group invite link (optional)
                </label>
                <input
                  type="url"
                  id="whatsappGroupLink"
                  name="whatsappGroupLink"
                  value={formData.whatsappGroupLink}
                  onChange={handleChange}
                  placeholder="https://chat.whatsapp.com/..."
                  className="input-field"
                />
                <p className="text-[12px] text-[#8a847a] mt-1">
                  {formData.isPaid
                    ? 'Hidden before checkout — automatically shown & emailed once YouPI payment is confirmed.'
                    : 'Revealed on confirmation screen & emailed to registered students.'}
                </p>
              </div>

              <div>
                <label htmlFor="autoDeleteWhenExpired" className="block text-[12px] font-medium text-[#aaa398] mb-1">
                  Cloud expiry cleanup policy
                </label>
                <select
                  id="autoDeleteWhenExpired"
                  name="autoDeleteWhenExpired"
                  value={formData.autoDeleteWhenExpired}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="inherit">Follow global Admin cloud cleanup setting</option>
                  <option value="always">Auto-delete from MongoDB cloud once expired</option>
                  <option value="never">Keep archived (do not auto-delete)</option>
                </select>
                <p className="text-[12px] text-[#8a847a] mt-1">
                  Removes expired event, photos, bookings &amp; posts from Atlas cloud DB automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Connected Competitions */}
          <div className="p-4 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrophyIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                <span className="text-[14px] font-medium text-[#efe9de]">Connected competitions</span>
              </div>
              <span className="text-[12px] font-mono text-[#8a847a]">
                {selectedCompetitionIds.length} linked
              </span>
            </div>

            <p className="text-[12px] text-[#8a847a]">
              Select competitions linked to this event. Students must register{formData.isPaid ? ' and complete payment' : ''} before entering linked arenas.
            </p>

            {manageableCompetitions.length === 0 ? (
              <p className="text-[12px] text-[#8a847a] italic">
                No competitions created by your account yet. Use &ldquo;Open studio&rdquo; above after saving, or manage competitions anytime.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {manageableCompetitions.map((comp) => {
                  const checked = selectedCompetitionIds.includes(comp._id);
                  const linkedElsewhere =
                    comp.event &&
                    comp.event._id !== id &&
                    comp.event !== id &&
                    !checked;
                  return (
                    <label
                      key={comp._id}
                      className={`flex items-start justify-between gap-3 p-2.5 rounded-[8px] border cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#e09132]/10 border-[#e09132]/40'
                          : 'bg-[#1c1a18] border-[#efe9de]/[0.06] hover:border-[#efe9de]/[0.16]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCompetitionSelection(comp._id)}
                          className="mt-0.5 h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132]"
                        />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#efe9de] truncate">{comp.title}</p>
                          <p className="text-[12px] font-mono text-[#8a847a]">
                            {comp.type} · {comp.status}
                            {linkedElsewhere && comp.event?.title ? ` · currently on ${comp.event.title}` : ''}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedCompetitionIds.length > 0 && (
              <label className="flex items-center gap-2.5 pt-2 border-t border-[#efe9de]/[0.06] cursor-pointer text-[12px] text-[#aaa398]">
                <input
                  type="checkbox"
                  name="requireEventRegistration"
                  checked={formData.requireEventRegistration}
                  onChange={handleChange}
                  className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132]"
                />
                <span>Gate competition entry on event registration &amp; verified payment</span>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="highlights" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Event highlights
              </label>
              <textarea
                id="highlights"
                name="highlights"
                value={formData.highlights}
                onChange={handleChange}
                rows={3}
                placeholder="One highlight per line or comma separated"
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="perks" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                Perks
              </label>
              <textarea
                id="perks"
                name="perks"
                value={formData.perks}
                onChange={handleChange}
                rows={3}
                placeholder="One perk per line or comma separated"
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label htmlFor="agenda" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Event agenda
            </label>
            <textarea
              id="agenda"
              name="agenda"
              value={formData.agenda}
              onChange={handleChange}
              rows={4}
              placeholder="List the session flow or agenda points"
              className="input-field"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="certificateEnabled"
              name="certificateEnabled"
              checked={formData.certificateEnabled}
              onChange={handleChange}
              className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132] focus:ring-offset-[#1c1a18]"
            />
            <span className="text-[13px] font-medium text-[#efe9de]">
              Enable participation certificates
            </span>
          </label>

          <div className="space-y-3">
            <label htmlFor="photo" className="block text-[13px] font-medium text-[#aaa398]">
              Event cover photo (PNG, JPG, WebP · max 2 MB)
            </label>

            {displayedPhoto && (
              <div className="relative rounded-[10px] overflow-hidden border border-[#efe9de]/[0.1] bg-[#12110f] aspect-[21/9]">
                <img src={displayedPhoto} alt="Event cover preview" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer px-3.5 py-2 rounded-[8px] border border-[#efe9de]/10 bg-[#262421] hover:bg-[#302d29] text-[13px] font-medium text-[#efe9de] transition-colors">
                <PhotoIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                <span>{displayedPhoto ? 'Change cover photo' : 'Upload cover photo'}</span>
                <input
                  type="file"
                  id="photo"
                  name="photo"
                  onChange={handlePhotoChange}
                  accept="image/*"
                  className="hidden"
                />
              </label>

              {(existingPhoto || photoPreviewUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    setPhoto(null);
                    setPhotoPreviewUrl('');
                    setRemovePhoto(true);
                  }}
                  className="text-[12px] text-[#e5484d] hover:underline"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#efe9de]/[0.08]">
            <button
              type="button"
              onClick={() => navigate(isEditing ? `/events/${id}` : '/events')}
              className="btn-secondary h-10 px-4 text-[13px]"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary h-10 px-5 text-[13px]">
              {loading ? (
                <>
                  <AvenorLoader variant="inline" tone="dark" />
                  <span>{isEditing ? 'Saving changes...' : 'Creating...'}</span>
                </>
              ) : isEditing ? (
                'Save changes'
              ) : (
                'Create event'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEvent;
