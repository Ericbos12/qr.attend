import React, { useEffect, useState } from 'react';
import {
  QrCode,
  BookOpen,
  ClipboardList,
  BarChart3,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Radio,
  ChevronRight,
  KeyRound,
} from 'lucide-react';
import { api } from '../api';
import { useFeedback } from './UiFeedback';

const NAV_ITEMS = [
  { path: '/', label: 'Courses', icon: BookOpen, match: (p) => p === '/' || p === '/courses' },
  {
    path: '/sessions',
    label: 'Attendance Register',
    icon: ClipboardList,
    match: (p) => p === '/sessions' || p.startsWith('/session/'),
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: BarChart3,
    match: (p) => p === '/reports',
  },
];

export default function AppShell({
  path,
  teacher,
  theme,
  onToggleTheme,
  onNavigate,
  onLogout,
  liveSessions = [],
  onOpenProjector,
  breadcrumb = null,
  children,
}) {
  const { toast } = useFeedback();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setShowPasswordModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwSaving(true);
    try {
      await api.changePassword(pwForm.currentPassword, pwForm.newPassword);
      toast('Password updated successfully', 'success');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordModal(false);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  }

  const primaryLive = liveSessions[0] || null;

  return (
    <div className="modern-shell">
      {/* Sticky Glass Top Navigation */}
      <header className="modern-nav">
        <div className="modern-nav-inner">
          {/* Left: Brand + Desktop Nav Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, minWidth: 0 }}>
            <button
              type="button"
              className="brand brand-btn"
              onClick={() => onNavigate('/')}
            >
              <div className="brand-mark">
                <QrCode size={16} />
              </div>
              <span>AttendQR</span>
            </button>

            <nav className="top-tabs desktop-only" aria-label="Primary navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.match(path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    className={`top-tab ${active ? 'active' : ''}`}
                    onClick={() => onNavigate(item.path)}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                    {item.path === '/sessions' && liveSessions.length > 0 && (
                      <span className="nav-pill nav-pill-live">{liveSessions.length}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right: Live QR Jump, Theme Toggle, Profile & Sign Out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {primaryLive && (
              <button
                type="button"
                className="live-pill-btn"
                onClick={() => onOpenProjector(primaryLive.id)}
                title="Open active QR display"
              >
                <Radio size={13} />
                <span className="desktop-only">{primaryLive.classCode} Live QR</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary icon-btn"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button
              type="button"
              className="nav-user nav-user-btn desktop-only"
              onClick={() => {
                setPwError('');
                setShowPasswordModal(true);
              }}
              title="Account & Password Settings"
            >
              <div className="teacher-avatar">
                {(teacher?.name || 'A')
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <span className="nav-user-name">{teacher?.name}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm desktop-only"
              onClick={onLogout}
            >
              <LogOut size={14} /> Sign Out
            </button>

            <button
              type="button"
              className="btn btn-ghost icon-btn mobile-only"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Slide-Down Drawer */}
        {mobileOpen && (
          <div className="mobile-drawer">
            <div className="mobile-drawer-links">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.match(path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    className={`mobile-drawer-item ${active ? 'active' : ''}`}
                    onClick={() => onNavigate(item.path)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mobile-drawer-footer">
              <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{teacher?.name}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setMobileOpen(false);
                    setPwError('');
                    setShowPasswordModal(true);
                  }}
                >
                  <KeyRound size={14} /> Password
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onLogout}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Optional Breadcrumb Bar (e.g. inside Session Detail) */}
      {breadcrumb && (
        <div className="sub-breadcrumb-bar no-print">
          <div className="sub-breadcrumb-inner">
            <button
              type="button"
              className="crumb-root"
              onClick={() => onNavigate(breadcrumb.parentPath || '/sessions')}
            >
              {breadcrumb.parentLabel}
            </button>
            <ChevronRight size={14} className="crumb-sep" />
            <span className="crumb-current">{breadcrumb.current}</span>
          </div>
        </div>
      )}

      {/* Main Page View */}
      <main className="app-content view-fade" key={path}>
        {children}
      </main>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal-backdrop" onClick={() => setShowPasswordModal(false)}>
          <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Account Security</h3>
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                onClick={() => setShowPasswordModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <div>
                <strong>{teacher?.name}</strong>
                <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>{teacher?.email}</div>
              </div>
            </div>

            {pwError && <div className="alert alert-error">{pwError}</div>}

            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="input"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Minimum 6 characters"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="input"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPasswordModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                  <KeyRound size={14} /> {pwSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
