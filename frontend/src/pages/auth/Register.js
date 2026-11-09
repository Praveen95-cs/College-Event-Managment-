import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AvenorMark } from '../../components/layout/AvenorLogo';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    department: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await register(formData);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to create an account. Please try again.');
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center py-8 sm:py-12">
      <div className="w-full max-w-[440px] rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-8 space-y-6">
        <div className="space-y-4">
          <AvenorMark size="md" />
          <div>
            <h1 className="text-[24px] font-medium tracking-[-0.02em] text-[#efe9de] leading-tight">
              Student registration
            </h1>
            <p className="mt-1.5 text-[14px] text-[#aaa398]">
              Student signup only. Already registered?{' '}
              <Link to="/login" className="text-[#ebb05d] hover:text-[#efe9de] font-medium transition-colors duration-150">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]" role="alert">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="input-field"
              placeholder="Full name"
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input-field"
              placeholder="student@college.edu"
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="input-field"
              placeholder="Minimum 8 characters"
              value={formData.password}
              onChange={handleChange}
            />
          </div>

          <div>
            <label htmlFor="department" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Department
            </label>
            <select
              id="department"
              name="department"
              required
              className="input-field"
              value={formData.department}
              onChange={handleChange}
            >
              <option value="">Select department</option>
              <option value="Computer Technology">Computer Technology</option>
              <option value="Information Technology">Information Technology</option>
              <option value="Electronics">Electronics</option>
              <option value="Mechanical">Mechanical</option>
              <option value="Civil">Civil</option>
            </select>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-10 text-[14px]"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
