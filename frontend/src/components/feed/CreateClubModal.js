import React, { useState } from 'react';
import axios from 'axios';
import { XMarkIcon, UserGroupIcon } from '@heroicons/react/24/outline';

const CreateClubModal = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({
    name: '',
    department: 'Computer Technology',
    description: '',
    tags: ''
  });
  const [logo, setLogo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Club name is required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('department', form.department.trim());
      fd.append('description', form.description.trim());
      if (form.tags.trim()) fd.append('tags', form.tags.trim());
      if (logo) fd.append('logo', logo);

      const res = await axios.post('/api/clubs', fd, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      onCreated?.(res.data);
      setForm({ name: '', department: 'Computer Technology', description: '', tags: '' });
      setLogo(null);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create club.');
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
      <div className="bg-[#1c1a18] border border-[#efe9de]/[0.12] rounded-[16px] p-6 max-w-md w-full shadow-[0_16px_48px_rgba(0,0,0,0.55)] relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-[8px] text-[#8a847a] hover:text-[#efe9de] hover:bg-[#262421]"
          aria-label="Close modal"
        >
          <XMarkIcon className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2.5 mb-4 pr-8">
          <div className="h-9 w-9 rounded-[9px] bg-[#262421] border border-[#efe9de]/[0.1] flex items-center justify-center text-[#ebb05d]">
            <UserGroupIcon className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-[18px] font-medium text-[#efe9de]">Create campus club</h2>
            <p className="text-[12px] text-[#8a847a]">Register a verified club chapter in Avenor.</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Club name</label>
            <input
              type="text"
              required
              placeholder="e.g. GDG MIT"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Department</label>
            <input
              type="text"
              placeholder="e.g. Computer Technology"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="Student developer community hosting workshops and coding sprints..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Tags</label>
            <input
              type="text"
              placeholder="e.g. Web, Cloud, AI"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Logo (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogo(e.target.files?.[0] || null)}
              className="block w-full text-[13px] text-[#aaa398] file:mr-3 file:py-1.5 file:px-3 file:rounded-[8px] file:border file:border-[#efe9de]/10 file:text-[12px] file:font-medium file:bg-[#262421] file:text-[#efe9de] hover:file:bg-[#302d29]"
            />
          </div>

          <div className="pt-3 border-t border-[#efe9de]/[0.08] flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn-secondary h-9 px-4 text-[13px]">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary h-9 px-4 text-[13px]">
              {submitting ? 'Creating...' : 'Create club'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateClubModal;

