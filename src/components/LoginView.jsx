import React, { useState } from 'react';
import { QrCode, ArrowRight } from 'lucide-react';
import { api, setAuthToken } from '../api';

export default function LoginView({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
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
            <div>• One submission per phone prevents proxy check-ins</div>
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
              Instructor Portal
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--ink-muted)', marginTop: 3 }}>
              Sign in to manage courses and display attendance QR codes.
            </p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setError('');
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
              }}
            >
              Create Account
            </button>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
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
              <label className="form-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={4}
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
        </div>
      </main>
    </div>
  );
}
