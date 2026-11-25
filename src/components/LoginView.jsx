import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { api, setAuthToken } from '../api';
import BrandLogo from './BrandLogo';
import PrivacyPolicyModal from './PrivacyPolicyModal';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
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

  function handleGoogleContinue() {
    setError('');
    setInfo('');
    if (googleEnabled === false) {
      setError(
        'Google Sign-In is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file and restart the server.'
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

  const isResetFlow = mode === 'forgot' || mode === 'reset';
  const isVerifySignup = mode === 'verify-signup';
  const showAuthTabs = !isResetFlow && !isVerifySignup;

  return (
    <div className="auth-split">
      {/* Left Institutional Panel */}
      <aside className="auth-aside">
        <div>
          <BrandLogo size={36} dark />
        </div>

        <div style={{ maxWidth: 420 }}>
          <div
            className="mono"
            style={{
              fontSize: '0.74rem',
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: '#bfdbfe',
              marginBottom: 14,
            }}
          >
            <h2>Classroom Attendance System</h2>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 18 }}>
            Live QR roll call for lectures and labs.
          </h1>
          <p style={{ fontSize: '0.93rem', color: '#dbeafe', lineHeight: 1.6, marginBottom: 28 }}>
            {mode === 'register'
              ? 'Sign up to project a rotating QR code during class. Students scan directly from their seats and enter their Student ID and full name.'
              : 'Sign in to project a rotating QR code during class. Students scan directly from their seats and enter their Student ID and full name.'}
          </p>

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.2)',
              paddingTop: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: '0.84rem',
              color: '#eff6ff',
            }}
          >
            <div>• Rotating QR codes invalidate screenshots automatically</div>
            <div>• Single-use device tickets stop forwarded links from working</div>
            <div>• Automatic late tracking, reports, and bulk CSV export</div>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: '#bfdbfe' }}>
          {mode === 'register'
            ? 'Students do not need to sign up — scan the live QR code displayed by your instructor.'
            : 'Students do not sign in here — scan the live QR code displayed by your instructor.'}
        </div>
      </aside>

      {/* Right Sign-In / Sign-Up Panel */}
      <main className="auth-main">
        <div className="auth-box">
          <div style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 14 }}>
              <BrandLogo size={30} />
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.015em' }}>
              {isResetFlow
                ? 'Reset Password'
                : isVerifySignup
                ? 'Confirm Your Email'
                : 'Instructor Portal'}
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--ink-muted)', marginTop: 3 }}>
              {mode === 'forgot'
                ? 'Request a 15-minute reset code for your instructor account.'
                : mode === 'reset'
                ? 'Enter the reset code from your email or server log and choose a new password.'
                : isVerifySignup
                ? `Enter the 6-digit confirmation code sent to ${email}.`
                : mode === 'register'
                ? 'Sign up to manage courses and display attendance QR codes.'
                : 'Sign in to manage courses and display attendance QR codes.'}
            </p>
          </div>

          {showAuthTabs && (
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setMode('login');
                  setError('');
                  setInfo('');
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setMode('register');
                  setError('');
                  setInfo('');
                }}
              >
                Create Account
              </button>
            </div>
          )}

          {info && <div className="alert alert-info">{info}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          {isVerifySignup ? (
            <form onSubmit={handleVerifySignup}>
              <div className="form-group">
                <label className="form-label">6-Digit Verification Code</label>
                <input
                  className="input mono"
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
                    fontWeight: 700,
                    letterSpacing: '0.32em',
                    padding: '12px 14px',
                  }}
                  required
                  autoFocus
                />
                <span className="form-hint">Check your inbox (and spam folder) for your 6-digit code.</span>
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                type="submit"
                disabled={loading || signupCode.length !== 6}
                style={{ marginTop: 6 }}
              >
                {loading ? 'Verifying...' : 'Verify & Create Account'}
                <ArrowRight size={16} />
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setInfo('');
                  }}
                >
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
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                type="submit"
                disabled={loading}
                style={{ marginTop: 6 }}
              >
                {loading ? 'Generating code...' : 'Request Reset Code'}
                <ArrowRight size={16} />
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setInfo('');
                  }}
                >
                  <ArrowLeft size={13} /> Back to Sign In
                </button>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => {
                    setMode('reset');
                    setError('');
                  }}
                >
                  Already have a code?
                </button>
              </div>
            </form>
          ) : mode === 'reset' ? (
            <form onSubmit={handleConfirmReset}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  placeholder="name@institution.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reset Code</label>
                <input
                  className="input mono"
                  placeholder="XXXX-XXXX-XXXX"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="password-field">
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Minimum 6 characters"
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
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                type="submit"
                disabled={loading}
                style={{ marginTop: 6 }}
              >
                {loading ? 'Resetting...' : 'Set New Password'}
                <ArrowRight size={16} />
              </button>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setInfo('');
                  }}
                >
                  <ArrowLeft size={13} /> Back to Sign In
                </button>
              </div>
            </form>
          ) : (
            <div>
              <form onSubmit={handleAuthSubmit}>
                {mode === 'register' && (
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="Dr. Sarah Mensah"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="name@institution.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label">Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        className="text-link-btn"
                        onClick={() => {
                          setMode('forgot');
                          setError('');
                          setInfo('');
                        }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="password-field">
                    <input
                      className="input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter password'}
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
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-full btn-lg"
                  type="submit"
                  disabled={loading}
                  style={{ marginTop: 6 }}
                >
                  {loading
                    ? mode === 'login'
                      ? 'Signing in...'
                      : 'Sending code...'
                    : mode === 'login'
                    ? 'Sign In'
                    : 'Continue & Send Code'}
                  <ArrowRight size={16} />
                </button>
              </form>

              <div className="auth-divider">
                <span>or</span>
              </div>

              <button
                type="button"
                className="btn btn-google btn-full btn-lg"
                onClick={handleGoogleContinue}
                disabled={loading}
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </button>

              <p className="auth-legal">
                By {mode === 'register' ? 'creating an account' : 'signing in'}, you agree to our{' '}
                <button
                  type="button"
                  className="text-link-btn"
                  style={{ fontSize: 'inherit', verticalAlign: 'baseline' }}
                  onClick={() => setShowPrivacy(true)}
                >
                  Privacy Policy
                </button>
                .
              </p>
            </div>
          )}
        </div>
      </main>

      <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
