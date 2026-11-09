import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AvenorMark } from '../../components/layout/AvenorLogo';
import {
  CheckBadgeIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
  KeyIcon
} from '@heroicons/react/24/outline';

const ForgotPassword = () => {
  const { sendSignupOtp, verifySignupOtp, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSentEmail, setOtpSentEmail] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [resetComplete, setResetComplete] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const isOtpVerified = Boolean(verificationToken && verifiedEmail === normalizedEmail);
  const hasActiveOtp = Boolean(otpSentEmail && otpSentEmail === normalizedEmail);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);
    const clean = val.trim().toLowerCase();
    if (verifiedEmail && clean !== verifiedEmail) {
      setVerificationToken('');
      setVerifiedEmail('');
    }
    if (otpSentEmail && clean !== otpSentEmail) {
      setOtpSentEmail('');
      setOtpInput('');
      setDevOtpHint('');
      setNotice('');
    }
  };

  const handleSendResetOtp = async () => {
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Please enter your registered email address first.');
      return;
    }
    try {
      setError('');
      setNotice('');
      setSendingOtp(true);
      const res = await sendSignupOtp({
        email: normalizedEmail,
        purpose: 'reset_password'
      });
      setOtpSentEmail(normalizedEmail);
      setNotice(res.message || `Password reset OTP sent to ${normalizedEmail}.`);
      setDevOtpHint(res.devOtp || '');
      setResendCooldown(30);
    } catch (err) {
      setError(err.message || 'Unable to send password reset OTP.');
      if (err.retryAfterSeconds) {
        setResendCooldown(err.retryAfterSeconds);
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    const cleanOtp = otpInput.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Enter the 6-digit password reset OTP.');
      return;
    }
    try {
      setError('');
      setVerifyingOtp(true);
      const res = await verifySignupOtp({
        email: normalizedEmail,
        otp: cleanOtp,
        purpose: 'reset_password'
      });
      setVerificationToken(res.verificationToken);
      setVerifiedEmail(normalizedEmail);
      setNotice('OTP verified. Set your new password below.');
      setDevOtpHint('');
    } catch (err) {
      setError(err.message || 'Invalid verification code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isOtpVerified) {
      setError('Verify your 6-digit email OTP before resetting your password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      await resetPassword({
        email: normalizedEmail,
        newPassword,
        verificationToken,
        otp: otpInput.trim()
      });
      setResetComplete(true);
      setNotice('');
    } catch (err) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center py-8 sm:py-12">
      <div className="w-full max-w-[440px] rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-8 space-y-6">
        <div className="space-y-4">
          <AvenorMark size="md" />
          <div>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#aaa398] hover:text-[#efe9de] mb-2 transition-colors"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>Back to sign in</span>
            </Link>
            <h1 className="text-[24px] font-medium tracking-[-0.02em] text-[#efe9de] leading-tight">
              Forgot password
            </h1>
            <p className="mt-1.5 text-[14px] text-[#aaa398]">
              Verify your registered email with a 6-digit OTP to set a new password.
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]" role="alert">
            {error}
          </div>
        )}

        {notice && !resetComplete && (
          <div className="px-4 py-3 rounded-[8px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 text-[#4cc38a] text-[13px]">
            {notice}
          </div>
        )}

        {resetComplete ? (
          <div className="space-y-5 pt-2">
            <div className="p-4 rounded-[12px] bg-[#4cc38a]/10 border border-[#4cc38a]/30 flex items-start gap-3">
              <CheckBadgeIcon className="h-6 w-6 text-[#4cc38a] shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <h2 className="text-[15px] font-medium text-[#efe9de]">Password updated</h2>
                <p className="text-[13px] text-[#aaa398] mt-1">
                  Your password for <span className="font-mono text-[#efe9de]">{normalizedEmail}</span> has been reset. You can now sign in with your new credentials.
                </p>
              </div>
            </div>
            <Link to="/login" className="btn-primary w-full h-10 text-[14px]">
              Go to Sign in
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleResetSubmit}>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="reset-email" className="block text-[13px] font-medium text-[#aaa398]">
                  Registered email *
                </label>
                {isOtpVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-[#4cc38a]/15 text-[#4cc38a] border border-[#4cc38a]/30">
                    <CheckBadgeIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Verified</span>
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={handleEmailChange}
                  className="input-field flex-1"
                  placeholder="student@college.edu"
                />
                {!isOtpVerified && (
                  <button
                    type="button"
                    onClick={handleSendResetOtp}
                    disabled={sendingOtp || resendCooldown > 0}
                    className="btn-secondary h-10 px-3.5 text-[12px] whitespace-nowrap shrink-0"
                  >
                    <EnvelopeIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.5} />
                    <span>
                      {sendingOtp
                        ? 'Sending...'
                        : resendCooldown > 0
                          ? `Resend (${resendCooldown}s)`
                          : hasActiveOtp
                            ? 'Resend OTP'
                            : 'Send OTP'}
                    </span>
                  </button>
                )}
              </div>

              {!isOtpVerified && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#8a847a]">
                  <span>Check Spam/Promotions if the email does not arrive immediately.</span>
                  {!hasActiveOtp && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                          setError('Enter your registered email address first.');
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

              {hasActiveOtp && !isOtpVerified && (
                <div className="p-3.5 rounded-[10px] bg-[#161513] border border-[#e09132]/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#efe9de]">
                      <ShieldCheckIcon className="h-4 w-4 text-[#ebb05d]" strokeWidth={1.75} />
                      <span>Enter 6-digit reset OTP</span>
                    </span>
                    <span className="text-[11px] font-mono text-[#8a847a]">Valid 10 min</span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      id="reset-otp"
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
                      onClick={handleVerifyResetOtp}
                      disabled={verifyingOtp || otpInput.trim().length !== 6}
                      className="btn-primary h-10 px-4 text-[12px] shrink-0"
                    >
                      {verifyingOtp ? 'Verifying...' : 'Verify OTP'}
                    </button>
                  </div>

                  {devOtpHint && (
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[6px] bg-[#262421] border border-[#efe9de]/[0.08] text-[11px] text-[#aaa398]">
                      <span>
                        Dev OTP preview: <strong className="font-mono text-[#ebb05d]">{devOtpHint}</strong>
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

            {isOtpVerified && (
              <>
                <div>
                  <label htmlFor="newPassword" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                    New password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="input-field"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="input-field"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full h-10 text-[14px]"
                  >
                    <KeyIcon className="h-4 w-4" strokeWidth={1.75} />
                    <span>{submitting ? 'Updating password...' : 'Reset password'}</span>
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;

