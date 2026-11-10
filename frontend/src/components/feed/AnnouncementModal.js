import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { XMarkIcon, MegaphoneIcon } from '@heroicons/react/24/outline';

const CATEGORIES = [
  'Technical',
  'Hackathon',
  'Workshop',
  'Seminar',
  'Cultural',
  'Sports',
  'Competition',
  'General'
];

const AnnouncementModal = ({ isOpen, onClose, clubs = [], initialClubId = '', onCreated }) => {
  const [form, setForm] = useState({
    clubId: initialClubId || (clubs[0]?._id || ''),
    title: '',
    content: '',
    category: 'Technical',
    tags: '',
    relatedEventId: ''
  });
  const [events, setEvents] = useState([]);
  const [media, setMedia] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm(prev => ({
        ...prev,
        clubId: initialClubId || prev.clubId || clubs[0]?._id || ''
      }));
      axios
        .get('/api/events/public')
        .then(res => setEvents(res.data || []))
        .catch(() => setEvents([]));
    }
  }, [isOpen, initialClubId, clubs]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and announcement details are required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const token = localStorage.getItem('token');
      const fd = new FormData();
      if (form.clubId) fd.append('clubId', form.clubId);
      fd.append('title', form.title.trim());
      fd.append('content', form.content.trim());
      fd.append('category', form.category);
      if (form.tags.trim()) fd.append('tags', form.tags.trim());
      if (form.relatedEventId) fd.append('relatedEventId', form.relatedEventId);
      if (media) fd.append('media', media);

      const res = await axios.post('/api/feed/announcements', fd, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      onCreated?.(res.data);
      setForm({
        clubId: initialClubId || clubs[0]?._id || '',
        title: '',
        content: '',
        category: 'Technical',
        tags: '',
        relatedEventId: ''
      });
      setMedia(null);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to publish announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#1c1a18] border border-[#efe9de]/[0.12] rounded-[14px] p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-[0_16px_48px_rgba(0,0,0,0.55)] relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-[8px] text-[#8a847a] hover:text-[#efe9de] hover:bg-[#262421] transition-colors"
          aria-label="Close modal"
        >
          <XMarkIcon className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2.5 mb-4 pr-8">
          <div className="h-9 w-9 rounded-[8px] bg-[#e09132]/15 border border-[#e09132]/30 flex items-center justify-center text-[#ebb05d]">
            <MegaphoneIcon className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-[18px] font-medium text-[#efe9de]">Publish announcement</h2>
            <p className="text-[12px] text-[#8a847a]">Updates followers in Campus Feed and Notifications.</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {clubs.length > 0 && (
            <div>
              <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Posting club</label>
              <select
                value={form.clubId}
                onChange={(e) => setForm({ ...form, clubId: e.target.value })}
                className="input-field h-9 py-0 leading-tight"
              >
                {clubs.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="input-field h-9 py-0 leading-tight"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#aaa398] mb-1">
                Linked event (optional)
              </label>
              <select
                value={form.relatedEventId}
                onChange={(e) => setForm({ ...form, relatedEventId: e.target.value })}
                className="input-field h-9 py-0 leading-tight"
              >
                <option value="">None</option>
                {events.map((ev) => (
                  <option key={ev._id} value={ev._id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Headline</label>
            <input
              type="text"
              required
              maxLength={200}
              placeholder="e.g. Registration deadline extended until Nov 14"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Details</label>
            <textarea
              required
              rows={4}
              maxLength={4000}
              placeholder="Share schedule changes, room updates, or key reminders for students..."
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Tags (comma separated)</label>
            <input
              type="text"
              placeholder="e.g. AI, deadline, TechFest"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setMedia(e.target.files?.[0] || null)}
              className="block w-full text-[13px] text-[#aaa398] file:mr-3 file:py-1.5 file:px-3 file:rounded-[8px] file:border file:border-[#efe9de]/10 file:text-[12px] file:font-medium file:bg-[#262421] file:text-[#efe9de] hover:file:bg-[#302d29]"
            />
          </div>

          <div className="pt-3 border-t border-[#efe9de]/[0.08] flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn-secondary h-9 px-4 text-[13px]">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary h-9 px-4 text-[13px]">
              {submitting ? 'Publishing...' : 'Publish announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AnnouncementModal;

