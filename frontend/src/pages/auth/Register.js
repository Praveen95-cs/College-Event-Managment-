import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AvenorMark } from '../../components/layout/AvenorLogo';
import { fetchDepartments } from '../../utils/departments';
import { CheckBadgeIcon, EnvelopeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    department: ''
  });
  const [otpInput, setOtpInput] = useState('');
  const [otpSentEmail, setOtpSentEmail] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpNotice, setOtpNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);

  const navigate = useNavigate();
  const { register, sendSignupOtp, verifySignupOtp } = useAuth();

  useEffect(() => {
    let mounted = true;
    fetchDepartments().then((list) => {
      if (mounted) setDepartments(list);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const normalizedEmail = formData.email.trim().toLowerCase();
  const isEmailVerified = Boolean(verificationToken && verifiedEmail === normalizedEmail);
  const hasActiveOtpForEmail = Boolean(otpSentEmail && otpSentEmail === normalizedEmail);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));

    if (name === 'email') {
      const nextEmail = value.trim().toLowerCase();
      if (verifiedEmail && nextEmail !== verifiedEmail) {
        setVerificationToken('');
        setVerifiedEmail('');
      }
      if (otpSentEmail && nextEmail !== otpSentEmail) {
        setOtpSentEmail('');
        setOtpInput('');
        setDevOtpHint('');
        setOtpNotice('');
      }
    }
  };

  const handleSendOtp = async () => {
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Please enter a valid email address before requesting a verification OTP.');
      return;
    }

    try {
      setError('');
      setOtpNotice('');
      setSendingOtp(true);
      const data = await sendSignupOtp({
        email: normalizedEmail,
        name: formData.name.trim(),
        purpose: 'register'
      });
      setOtpSentEmail(normalizedEmail);
      setOtpNotice(data.message || `A 6-digit verification code was sent to ${normalizedEmail}.`);
      setDevOtpHint(data.devOtp || '');
      setResendCooldown(30);
    } catch (err) {
      setError(err.message || 'Failed to send verification OTP.');
      if (err.retryAfterSeconds) {
        setResendCooldown(err.retryAfterSeconds);
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanOtp = otpInput.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    try {
      setError('');
      setVerifyingOtp(true);
      const data = await verifySignupOtp({
        email: normalizedEmail,
        otp: cleanOtp,
        purpose: 'register'
      });
      setVerificationToken(data.verificationToken);
      setVerifiedEmail(normalizedEmail);
      setOtpNotice('Email verified successfully. You can now finish creating your student account.');
      setDevOtpHint('');
    } catch (err) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEmailVerified) {
      setError('Please verify your email address with the 6-digit OTP first.');
      return;
    }
    try {
      setError('');
      setLoading(true);
      await register({
        ...formData,
        email: normalizedEmail,
        verificationToken,
        otp: otpInput.trim()
      });
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
      <div className="w-full max-w-[460px] rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-8 space-y-6">
        <div className="space-y-4">
          <AvenorMark size="md" />
          <div>
            <h1 className="text-[24px] font-medium tracking-[-0.02em] text-[#efe9de] leading-tight">
              Student registration
            </h1>
            <p className="mt-1.5 text-[14px] text-[#aaa398]">
              OTP-verified student signup. Already registered?{' '}
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

        {otpNotice && (
          <div className="px-4 py-3 rounded-[8px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 text-[#4cc38a] text-[13px]">
            {otpNotice}
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

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="email" className="block text-[13px] font-medium text-[#aaa398]">
                Email address *
              </label>
              {isEmailVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#4cc38a]/15 text-[#4cc38a] border border-[#4cc38a]/30">
                  <CheckBadgeIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Verified</span>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input-field flex-1"
                placeholder="student@college.edu"
                value={formData.email}
                onChange={handleChange}
              />
              {!isEmailVerified && (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={sendingOtp || resendCooldown > 0}
                  className="btn-secondary h-10 px-3.5 text-[12px] whitespace-nowrap shrink-0"
                >
                  <EnvelopeIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                  <span>
                    {sendingOtp
                      ? 'Sending...'
                      : resendCooldown > 0
                        ? `Resend (${resendCooldown}s)`
                        : hasActiveOtpForEmail
                          ? 'Resend OTP'
                          : 'Send OTP'}
                  </span>
                </button>
              )}
            </div>

              {!isEmailVerified && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#8a847a]">
                  <span>Check Spam/Promotions if the code does not appear in Primary.</span>
                  {!hasActiveOtpForEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                          setError('Enter your email address first before entering an OTP code.');
                          return;
                        }
                        setError('');
                        setOtpSentEmail(normalizedEmail);
                      }}
                      className="text-[#ebb05d] hover:underline shrink-0"
                    >
                      Already have an OTP?
                    </button>
                  )}
                </div>
              )}

              {hasActiveOtpForEmail && !isEmailVerified && (
              <div className="p-3.5 rounded-[10px] bg-[#161513] border border-[#e09132]/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#efe9de]">
                    <ShieldCheckIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.75} />
                    <span>Enter 6-digit email OTP</span>
                  </span>
                  <span className="text-[11px] font-mono text-[#8a847a]">Valid 10 min</span>
                </div>

                <div className="flex gap-2">
                  <input
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="input-field flex-1 font-mono tracking-[0.25em] text-center"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={verifyingOtp || otpInput.trim().length !== 6}
                    className="btn-primary h-10 px-4 text-[12px] shrink-0"
                  >
                    {verifyingOtp ? 'Verifying...' : 'Verify OTP'}
                  </button>
                </div>

                {devOtpHint && (
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[6px] bg-[#262421] border border-[#efe9de]/[0.08] text-[11px] text-[#aaa398]">
                    <span>
                      Dev OTP preview:{' '}
                      <strong className="font-mono text-[#ebb05d]">{devOtpHint}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpInput(devOtpHint)}
                      className="text-[#ebb05d] font-medium hover:underline"
                    >
                      Autofill
                    </button>
                  </div>
                )}
              </div>
            )}
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
              {departments.map((dept) => (
                <option key={dept._id || dept.name} value={dept.name}>
                  {dept.code ? `${dept.name} (${dept.code})` : dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !isEmailVerified}
              className="btn-primary w-full h-10 text-[14px]"
            >
              {loading
                ? 'Creating account...'
                : isEmailVerified
                  ? 'Create verified account'
                  : 'Verify email with OTP first'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
