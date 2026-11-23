import React, { useState } from 'react';
import { QrCode, ArrowRight, ArrowLeft } from 'lucide-react';
import { api, setAuthToken } from '../api';

export default function LoginView({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'reset'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(name, email, password);
      setAuthToken(data.token);
      onAuthenticated(data.teacher);
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

  return (
    <div className="auth-split">
      {/* Left Institutional Panel */}
      <aside className="auth-aside">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: '#ffffff',
              color: '#102a27',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <QrCode size={18} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>AttendQR</span>
        </div>

        <div style={{ maxWidth: 420 }}>
          <p
            className="mono"
            style={{
              fontSize: '0.74rem',
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: '#9bc0b9',
              marginBottom: 14,
            }}
          >
            Classroom Attendance System
          </p>
          <h1 style={{ fontSize: '2rem', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 18 }}>
            Live QR roll call for lectures and labs.
          </h1>
          <p style={{ fontSize: '0.93rem', color: '#bfd4cf', lineHeight: 1.6, marginBottom: 28 }}>
            Sign in to project a rotating QR code during class. Students scan directly from their seats and enter their Student ID and full name.
          </p>

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.14)',
              paddingTop: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: '0.84rem',
              color: '#d2e2de',
            }}
          >
            <div>• Rotating QR codes invalidate screenshots automatically</div>
            <div>• Single-use device tickets stop forwarded links from working</div>
            <div>• Automatic late tracking, reports, and bulk CSV export</div>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: '#8ab0a8' }}>
          Students do not sign in here — scan the live QR code displayed by your instructor.
        </div>
      </aside>

      {/* Right Sign-In Panel */}
      <main className="auth-main">
        <div className="auth-box">
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.015em' }}>
              {isResetFlow ? 'Reset Password' : 'Instructor Portal'}
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--ink-muted)', marginTop: 3 }}>
              {mode === 'forgot'
                ? 'Request a 15-minute reset code for your instructor account.'
                : mode === 'reset'
                ? 'Enter the reset code from your email or server log and choose a new password.'
                : 'Sign in to manage courses and display attendance QR codes.'}
            </p>
          </div>

          {!isResetFlow && (
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

          {mode === 'forgot' ? (
            <form onSubmit={handleRequestReset}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  placeholder="name@institution.edu"
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
                <input
                  className="input"
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
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
                <input
                  className="input"
                  type="password"
                  placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                type="submit"
                disabled={loading}
                style={{ marginTop: 6 }}
              >
                {loading ? 'Signing in...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
