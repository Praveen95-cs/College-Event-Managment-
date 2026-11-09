import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { XMarkIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import ClubLogo from './ClubLogo';
import { getBackendUrl } from '../../utils/apiConfig';
import { DEFAULT_DEPARTMENTS, fetchDepartments } from '../../utils/departments';

const CreateClubModal = ({ isOpen, onClose, onCreated, onUpdated, clubToEdit = null }) => {
  const backendUrl = getBackendUrl();
  const isEditing = Boolean(clubToEdit?._id);
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [form, setForm] = useState({
    name: '',
    department: DEFAULT_DEPARTMENTS[0],
    description: '',
    tags: '',
    logoUrl: ''
  });
  const [logo, setLogo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [removeLogo, setRemoveLogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setLogo(null);
    setRemoveLogo(false);
    fetchDepartments().then((list) => {
      const names = list.map((d) => d.name).filter(Boolean);
      if (names.length > 0) {
        setDepartments(names);
        setForm((prev) => ({
          ...prev,
          department: clubToEdit?.department || (names.includes(prev.department) ? prev.department : names[0])
        }));
      }
    });
    if (clubToEdit) {
      setForm({
        name: clubToEdit.name || '',
        department: clubToEdit.department || DEFAULT_DEPARTMENTS[0],
        description: clubToEdit.description || '',
        tags: Array.isArray(clubToEdit.tags) ? clubToEdit.tags.join(', ') : clubToEdit.tags || '',
        logoUrl: clubToEdit.logo && clubToEdit.logo.startsWith('http') ? clubToEdit.logo : ''
      });
      setPreviewUrl(clubToEdit.logo || '');
    } else {
      setForm({
        name: '',
        department: DEFAULT_DEPARTMENTS[0],
        description: '',
        tags: '',
        logoUrl: ''
      });
      setPreviewUrl('');
    }
  }, [isOpen, clubToEdit]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > 2 * 1024 * 1024) {
      setError('Club logo image must be 2 MB or smaller.');
      return;
    }
    setError('');
    setLogo(file);
    setRemoveLogo(false);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(typeof reader.result === 'string' ? reader.result : '');
      reader.readAsDataURL(file);
    }
  };

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
      fd.append('tags', form.tags.trim());
      if (logo) {
        fd.append('logo', logo);
      } else if (removeLogo) {
        fd.append('removeLogo', 'true');
      } else if (form.logoUrl.trim()) {
        fd.append('logoUrl', form.logoUrl.trim());
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      };

      if (isEditing) {
        const res = await axios.patch(`${backendUrl}/api/clubs/${clubToEdit._id}`, fd, { headers });
        onUpdated?.(res.data);
      } else {
        const res = await axios.post(`${backendUrl}/api/clubs`, fd, { headers });
        onCreated?.(res.data);
      }

      setLogo(null);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || (isEditing ? 'Failed to update club.' : 'Failed to create club.'));
    } finally {
      setSubmitting(false);
    }
  };

  const departmentOptions =
    form.department && !departments.includes(form.department)
      ? [form.department, ...departments]
      : departments;

  const previewClub = {
    name: form.name || clubToEdit?.name || 'Club',
    logo: removeLogo ? '' : previewUrl || form.logoUrl || ''
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#1c1a18] border border-[#efe9de]/[0.12] rounded-[16px] p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-[0_16px_48px_rgba(0,0,0,0.55)] relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-[8px] text-[#8a847a] hover:text-[#efe9de] hover:bg-[#262421]"
          aria-label="Close modal"
        >
          <XMarkIcon className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-3 mb-4 pr-8">
          <div className="h-9 w-9 rounded-[9px] bg-[#262421] border border-[#efe9de]/[0.1] flex items-center justify-center text-[#ebb05d] shrink-0">
            <UserGroupIcon className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-[18px] font-medium text-[#efe9de]">
              {isEditing ? 'Edit campus club' : 'Create campus club'}
            </h2>
            <p className="text-[12px] text-[#8a847a]">
              {isEditing ? 'Update club details or upload a new chapter logo.' : 'Register a verified club chapter in Avenor.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08]">
            <ClubLogo club={previewClub} size="lg" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[12px] font-medium text-[#efe9de]">Logo preview</p>
              <p className="text-[11px] text-[#8a847a]">Saved directly to database (JPEG, PNG, GIF, WebP up to 2MB).</p>
              {(previewClub.logo || clubToEdit?.logo) && !removeLogo && (
                <button
                  type="button"
                  onClick={() => {
                    setLogo(null);
                    setPreviewUrl('');
                    setRemoveLogo(true);
                    setForm(prev => ({ ...prev, logoUrl: '' }));
                  }}
                  className="text-[11px] text-[#e5484d] hover:underline"
                >
                  Remove current logo
                </button>
              )}
            </div>
          </div>

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
            <select
              required
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="input-field"
            >
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
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
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Upload logo image</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileChange}
              className="block w-full text-[13px] text-[#aaa398] file:mr-3 file:py-1.5 file:px-3 file:rounded-[8px] file:border file:border-[#efe9de]/10 file:text-[12px] file:font-medium file:bg-[#262421] file:text-[#efe9de] hover:file:bg-[#302d29]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#aaa398] mb-1">Or paste image URL (optional)</label>
            <input
              type="url"
              placeholder="https://..."
              value={form.logoUrl}
              onChange={(e) => {
                setRemoveLogo(false);
                setLogo(null);
                setPreviewUrl(e.target.value);
                setForm({ ...form, logoUrl: e.target.value });
              }}
              className="input-field text-[13px]"
            />
          </div>

          <div className="pt-3 border-t border-[#efe9de]/[0.08] flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="btn-secondary h-9 px-4 text-[13px]">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary h-9 px-4 text-[13px]">
              {submitting ? (isEditing ? 'Saving...' : 'Creating...') : isEditing ? 'Save changes' : 'Create club'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateClubModal;
