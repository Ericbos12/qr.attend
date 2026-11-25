import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { api, setAuthToken } from '../api';
import { BrandMark } from './BrandLogo';
import PrivacyPolicyModal from './PrivacyPolicyModal';

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.87c2.26-2.08 3.56-5.15 3.56-8.66z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.28a12 12 0 0 0 0 10.76l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

export default function LoginView({ onAuthenticated, initialError = '' }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'verify-signup' | 'forgot' | 'reset'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signupCode, setSignupCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetCode, setResetCode] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  useEffect(() => {
    let active = true;
    api
      .getAuthProviders()
      .then((res) => {
        if (active) setGoogleEnabled(Boolean(res?.google));
      })
      .catch(() => {
        if (active) setGoogleEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setInfo('');
  }

  function handleGoogleContinue() {
    setError('');
    setInfo('');
    if (googleEnabled === false) {
      setError(
        'Google Sign-In is currently unavailable. Please sign in with your email and password.'
      );
      return;
    }
    window.location.href = '/api/auth/google';
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const data = await api.login(email, password);
        setAuthToken(data.token);
        onAuthenticated(data.teacher);
      } else {
        const data = await api.register(name, email, password);
        setSignupCode('');
        setInfo(data.message);
        setResendCooldown(30);
        setMode('verify-signup');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySignup(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.verifyRegister(email, signupCode);
      setAuthToken(data.token);
      onAuthenticated(data.teacher);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendSignupCode() {
    if (resendCooldown > 0 || loading) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.register(name, email, password);
      setInfo(data.message);
      setResendCooldown(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.forgotPassword(email);
      setInfo(data.message);
      setMode('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.resetPassword(email, resetCode, password);
      setResetCode('');
      setPassword('');
      setInfo(data.message);
      setMode('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isVerifySignup = mode === 'verify-signup';

  const title =
    mode === 'forgot'
      ? 'Reset your password'
      : mode === 'reset'
      ? 'Set a new password'
      : isVerifySignup
      ? 'Verify your email'
      : mode === 'register'
      ? 'Create your account'
      : 'Sign in to AttendQR';

  return (
    <div className="auth-stage">
      {/* Layered comfortable classroom-inspired background */}
      <div className="auth-bg-layer auth-bg-layer-base" aria-hidden="true" />
      <div className="auth-bg-layer auth-bg-layer-wash-a" aria-hidden="true" />
      <div className="auth-bg-layer auth-bg-layer-wash-b" aria-hidden="true" />
      <div className="auth-bg-layer auth-bg-layer-grid" aria-hidden="true" />

      <main className="auth-center">
        {/* Concentric outer bezel: R_outer = 38px, padding = 8px -> R_card = 30px */}
        <div className="auth-shell">
          {/* Concentric card: R_card = 30px, padding = 20px -> R_inner = 10px */}
          <div className="auth-card">
            <div className="auth-brand-head auth-fly-1">
              <div className="auth-qr-badge">
                <BrandMark size={40} />
              </div>
              <h1 className="auth-heading">{title}</h1>
            </div>

            {info && <div className="alert alert-info auth-concentric-inner">{info}</div>}
            {error && <div className="alert alert-error auth-concentric-inner">{error}</div>}

            <div className="auth-mode-body" key={mode}>
              {isVerifySignup ? (
                <form onSubmit={handleVerifySignup}>
                  <div className="form-group auth-fly-2">
                    <label className="form-label">6-digit code sent to {email}</label>
                    <input
                      className="input mono auth-concentric-inner"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      value={signupCode}
                      onChange={(e) => setSignupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      style={{
                        textAlign: 'center',
                        fontSize: '1.35rem',
                        fontWeight: 600,
                        letterSpacing: '0.32em',
                        padding: '12px 14px',
                      }}
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    className="btn btn-primary btn-full btn-lg auth-cta auth-concentric-inner auth-fly-3"
                    type="submit"
                    disabled={loading || signupCode.length !== 6}
                  >
                    {loading ? 'Verifying...' : 'Verify & continue'}
                    <ArrowRight size={15} />
                  </button>

                  <div className="auth-inline-links auth-fly-4">
                    <button type="button" className="text-link-btn" onClick={() => switchMode('register')}>
                      <ArrowLeft size={13} /> Edit details
                    </button>
                    <button
                      type="button"
                      className="text-link-btn"
                      onClick={handleResendSignupCode}
                      disabled={resendCooldown > 0 || loading}
                      style={{ opacity: resendCooldown > 0 ? 0.6 : 1 }}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </form>
              ) : mode === 'forgot' ? (
                <form onSubmit={handleRequestReset}>
                  <div className="form-group auth-fly-2">
                    <label className="form-label">Email address</label>
                    <input
                      className="input auth-concentric-inner"
                      type="email"
                      placeholder="you@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    className="btn btn-primary btn-full btn-lg auth-cta auth-concentric-inner auth-fly-3"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? 'Sending code...' : 'Send reset code'}
                    <ArrowRight size={15} />
                  </button>

                  <div className="auth-inline-links auth-fly-4">
                    <button type="button" className="text-link-btn" onClick={() => switchMode('login')}>
                      <ArrowLeft size={13} /> Back to sign in
                    </button>
                    <button type="button" className="text-link-btn" onClick={() => switchMode('reset')}>
                      Have a code?
                    </button>
                  </div>
                </form>
              ) : mode === 'reset' ? (
                <form onSubmit={handleConfirmReset}>
                  <div className="form-group auth-fly-2">
                    <label className="form-label">Email address</label>
                    <input
                      className="input auth-concentric-inner"
                      type="email"
                      placeholder="you@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group auth-fly-2">
                    <label className="form-label">Reset code</label>
                    <input
                      className="input mono auth-concentric-inner"
                      placeholder="XXXX-XXXX-XXXX"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="form-group auth-fly-3">
                    <label className="form-label">New password</label>
                    <div className="password-field">
                      <input
                        className="input auth-concentric-inner"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="At least 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary btn-full btn-lg auth-cta auth-concentric-inner auth-fly-3"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? 'Updating password...' : 'Update password'}
                    <ArrowRight size={15} />
                  </button>

                  <div className="auth-inline-links auth-fly-4">
                    <button type="button" className="text-link-btn" onClick={() => switchMode('login')}>
                      <ArrowLeft size={13} /> Back to sign in
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleAuthSubmit}>
                  {mode === 'register' && (
                    <div className="form-group auth-fly-2">
                      <label className="form-label">Full name</label>
                      <input
                        className="input auth-concentric-inner"
                        type="text"
                        placeholder="Dr. Sarah Mensah"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="form-group auth-fly-2">
                    <label className="form-label">Email address</label>
                    <input
                      className="input auth-concentric-inner"
                      type="email"
                      placeholder="you@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group auth-fly-3">
                    <div className="auth-label-row">
                      <label className="form-label">Password</label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          className="text-link-btn"
                          style={{ fontSize: '0.79rem', fontWeight: 500 }}
                          onClick={() => switchMode('forgot')}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="password-field">
                      <input
                        className="input auth-concentric-inner"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Single primary CTA */}
                  <button
                    className="btn btn-primary btn-full btn-lg auth-cta auth-concentric-inner auth-fly-3"
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? mode === 'login'
                        ? 'Signing in...'
                        : 'Sending code...'
                      : mode === 'login'
                      ? 'Sign in'
                      : 'Create account'}
                    <ArrowRight size={15} />
                  </button>

                  <div className="auth-secondary-row auth-fly-4">
                    <button
                      type="button"
                      className="auth-quiet-google"
                      onClick={handleGoogleContinue}
                      disabled={loading}
                    >
                      <GoogleIcon />
                      <span>Continue with Google</span>
                    </button>

                    <span className="auth-dot-sep" aria-hidden="true">·</span>

                    {mode === 'login' ? (
                      <button
                        type="button"
                        className="text-link-btn"
                        style={{ fontSize: '0.82rem', fontWeight: 500 }}
                        onClick={() => switchMode('register')}
                      >
                        Create account
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-link-btn"
                        style={{ fontSize: '0.82rem', fontWeight: 500 }}
                        onClick={() => switchMode('login')}
                      >
                        Sign in instead
                      </button>
                    )}
                  </div>

                  <p className="auth-legal auth-fly-4">
                    By continuing, you agree to our{' '}
                    <button
                      type="button"
                      className="text-link-btn"
                      style={{ fontSize: 'inherit', fontWeight: 500, verticalAlign: 'baseline' }}
                      onClick={() => setShowPrivacy(true)}
                    >
                      Privacy Policy
                    </button>
                    .
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
