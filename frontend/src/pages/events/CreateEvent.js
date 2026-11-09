import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getBackendUrl } from '../../utils/apiConfig';

const CreateEvent = () => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    department: '',
    type: '',
    club: '',
    category: '',
    tags: '',
    eligibility: 'Open to all enrolled students',
    capacity: '',
    highlights: '',
    perks: '',
    agenda: '',
    certificateEnabled: true
  });
  const [clubs, setClubs] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios
      .get(`${backendUrl}/api/clubs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      .then((res) => {
        const manageable = (res.data || []).filter((c) => c.canManage);
        setClubs(manageable);
        if (manageable.length === 1) {
          setFormData((prev) => ({ ...prev, club: manageable[0]._id }));
        }
      })
      .catch(() => setClubs([]));
  }, [backendUrl]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePhotoChange = (e) => {
    if (e.target.files[0]) {
      setPhoto(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to create events');
        return;
      }

      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        if ((key === 'club' || key === 'category' || key === 'tags') && !formData[key]) {
          return;
        }
        formDataToSend.append(key, formData[key]);
      });
      if (photo) {
        formDataToSend.append('photo', photo);
      }

      const response = await axios.post(`${backendUrl}/api/events`, formDataToSend, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data) {
        navigate('/events');
      }
    } catch (err) {
      console.error('Error creating event:', err);
      setError(err.response?.data?.message || 'Failed to create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-[28px] font-medium text-[#efe9de] tracking-[-0.02em] leading-[1.15]">
          Create new event
        </h1>
        <p className="mt-1.5 text-[14px] text-[#aaa398]">
          Publish a department workshop, fest session, or student meetup.
        </p>
      </div>

      <div className="rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08]">
          <div>
            <h2 className="text-[14px] font-medium text-[#efe9de]">
              Hosting a quiz or coding contest
            </h2>
            <p className="text-[13px] text-[#8a847a] mt-0.5">
              Set up timed MCQs or Judge0 coding problems in the competition studio.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/competitions/create')}
            className="btn-secondary h-9 px-3.5 text-[13px] shrink-0"
          >
            Open studio
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
                type="time"
                id="time"
                name="time"
                value={formData.time}
                onChange={handleChange}
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
                <option value="Computer Science">Computer Science</option>
                <option value="Information Technology">Information Technology</option>
                <option value="Electronics">Electronics</option>
                <option value="Mechanical">Mechanical</option>
                <option value="Civil">Civil</option>
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
              onChange={(e) => setFormData(prev => ({ ...prev, certificateEnabled: e.target.checked }))}
              className="h-4 w-4 rounded-[4px] border-[#efe9de]/20 bg-[#262421] text-[#e09132] focus:ring-[#e09132] focus:ring-offset-[#1c1a18]"
            />
            <span className="text-[13px] font-medium text-[#efe9de]">
              Enable participation certificates
            </span>
          </label>

          <div>
            <label htmlFor="photo" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Event cover photo
            </label>
            <input
              type="file"
              id="photo"
              name="photo"
              onChange={handlePhotoChange}
              accept="image/*"
              className="block w-full text-[13px] text-[#aaa398] file:mr-3 file:py-2 file:px-3.5 file:rounded-[8px] file:border file:border-[#efe9de]/10 file:text-[13px] file:font-medium file:bg-[#262421] file:text-[#efe9de] hover:file:bg-[#302d29]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#efe9de]/[0.08]">
            <button
              type="button"
              onClick={() => navigate('/events')}
              className="btn-secondary h-10 px-4 text-[13px]"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary h-10 px-5 text-[13px]">
              {loading ? 'Creating...' : 'Create event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEvent;
