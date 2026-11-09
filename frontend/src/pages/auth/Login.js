import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AvenorMark } from '../../components/layout/AvenorLogo';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(formData.email, formData.password);
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center py-8 sm:py-12">
      <div className="w-full max-w-[420px] rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-8 space-y-6">
        <div className="space-y-4">
          <AvenorMark size="md" />
          <div>
            <h1 className="text-[24px] font-medium tracking-[-0.02em] text-[#efe9de] leading-tight">
              Sign in to Avenor
            </h1>
            <p className="mt-1.5 text-[14px] text-[#aaa398]">
              New student?{' '}
              <Link to="/register" className="text-[#ebb05d] hover:text-[#efe9de] font-medium transition-colors duration-150">
                Create an account
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
            <label htmlFor="email" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="input-field"
              placeholder="student@college.edu"
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
              autoComplete="current-password"
              required
              value={formData.password}
              onChange={handleChange}
              className="input-field"
              placeholder="Enter password"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full h-10 text-[14px]"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
