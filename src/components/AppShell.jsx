import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutGrid,
  BookOpen,
  Radio,
  BarChart3,
  ScanLine,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  KeyRound,
  Eye,
  EyeOff,
  LifeBuoy,
  Trash2,
  ShieldCheck,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api';
import { useFeedback } from './UiFeedback';
import BrandLogo from './BrandLogo';
import PrivacyPolicyModal from './PrivacyPolicyModal';

const NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: LayoutGrid, match: (p) => p === '/' },
  { path: '/courses', label: 'Courses', icon: BookOpen, match: (p) => p === '/courses' },
  {
    path: '/sessions',
    label: 'Live session',
    icon: Radio,
    match: (p) => p === '/sessions' || p.startsWith('/session/'),
  },
  { path: '/reports', label: 'Reports', icon: BarChart3, match: (p) => p === '/reports' },
  { path: '/checkin', label: 'Student check-in', icon: ScanLine, match: (p) => p === '/checkin' },
];

function getPageCrumbLabel(path) {
  if (path === '/courses') return 'Courses';
  if (path === '/sessions') return 'Live session';
  if (path === '/reports') return 'Reports';
  if (path.startsWith('/session/')) return 'Live session';
  return 'Overview';
}

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
  const [accountOpen, setAccountOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // Report a problem modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportForm, setReportForm] = useState({ category: 'Bug / Error', subject: '', message: '' });
  const [reportError, setReportError] = useState('');
  const [reportSending, setReportSending] = useState(false);

  // Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Privacy policy modal
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [path]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowPasswordModal(false);
        setShowReportModal(false);
        setShowDeleteModal(false);
        setShowPrivacyModal(false);
        setAccountOpen(false);
        setMobileOpen(false);
      }
    };
    const onClickOutside = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickOutside);
    };
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

  async function handleSubmitReport(e) {
    e.preventDefault();
    setReportError('');
    setReportSending(true);
    try {
      const res = await api.reportProblem(reportForm);
      toast(res.message || 'Thank you! Your report has been sent to our support team.', 'success');
      setReportForm({ category: 'Bug / Error', subject: '', message: '' });
      setShowReportModal(false);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setReportSending(false);
    }
  }

  async function handleDeleteAccount(e) {
    e.preventDefault();
    setDeleteError('');
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm.');
      return;
    }
    setDeletingAccount(true);
    try {
      await api.deleteAccount(deleteConfirmText);
      toast('Your account has been permanently deleted.', 'info');
      setShowDeleteModal(false);
      onLogout();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeletingAccount(false);
    }
  }

  const primaryLive = liveSessions[0] || null;
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const avatarInitial = (teacher?.name || 'A').trim().charAt(0).toUpperCase() || 'A';
  const currentLabel = getPageCrumbLabel(path);

  const sidebarContent = (
    <div className="sidebar-inner">
      <div>
        <button
          type="button"
          className="sidebar-brand"
          onClick={() => onNavigate('/')}
        >
          <BrandLogo size={34} dark />
        </button>

        <div className="sidebar-section-label">WORKSPACE</div>

        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.match(path);
            return (
              <button
                key={item.path}
                type="button"
                className={`sidebar-link ${active ? 'active' : ''}`}
                onClick={() => onNavigate(item.path)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.path === '/sessions' && liveSessions.length > 0 && (
                  <span className="sidebar-live-badge">{liveSessions.length}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-support-btn"
          onClick={() => {
            setMobileOpen(false);
            setReportError('');
            setShowReportModal(true);
          }}
        >
          <LifeBuoy size={15} />
          <span>Report a problem</span>
        </button>
        <div className="sidebar-footer-title">Made for the classroom</div>
        <div className="sidebar-footer-sub">Less time on roll calls.</div>
        <div className="sidebar-footer-sub">More time for teaching.</div>
      </div>
    </div>
  );

  return (
    <div className="workspace-shell">
      {/* Desktop Dark Navy Sidebar */}
      <aside className="workspace-sidebar no-print">{sidebarContent}</aside>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div className="sidebar-mobile-backdrop no-print" onClick={() => setMobileOpen(false)}>
          <aside className="workspace-sidebar mobile-drawer-sidebar" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="sidebar-mobile-close"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Right Main Workspace Column */}
      <div className="workspace-main">
        {/* Clean White Topbar */}
        <header className="workspace-topbar no-print">
          <div className="topbar-left">
            <button
              type="button"
              className="btn btn-ghost icon-btn mobile-only"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>

            <button
              type="button"
              className="mobile-only"
              onClick={() => onNavigate('/')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              aria-label="AttendQR Home"
            >
              <BrandLogo size={26} showText={false} />
            </button>

            <div className="topbar-crumbs">
              <button type="button" className="topbar-crumb-muted" onClick={() => onNavigate('/')}>
                Workspace
              </button>
              <span className="topbar-crumb-slash">/</span>
              {breadcrumb ? (
                <>
                  <button
                    type="button"
                    className="topbar-crumb-muted"
                    onClick={() => onNavigate(breadcrumb.parentPath || '/sessions')}
                  >
                    {breadcrumb.parentLabel}
                  </button>
                  <span className="topbar-crumb-slash">/</span>
                  <span className="topbar-crumb-current">{breadcrumb.current}</span>
                </>
              ) : (
                <span className="topbar-crumb-current">{currentLabel}</span>
              )}
            </div>
          </div>

          <div className="topbar-right">
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

            <span className="topbar-date desktop-only">{formattedDate}</span>

            <div className="account-menu-wrap" ref={accountMenuRef}>
              <button
                type="button"
                className="topbar-avatar-btn"
                onClick={() => setAccountOpen((v) => !v)}
                title={teacher?.name || 'Account'}
                aria-label="Open account menu"
              >
                {avatarInitial}
              </button>

              {accountOpen && (
                <div className="account-dropdown">
                  <div className="account-dropdown-header">
                    <div className="account-dropdown-name">{teacher?.name}</div>
                    <div className="account-dropdown-email">{teacher?.email}</div>
                  </div>
                  <div className="account-dropdown-divider" />
                  <button
                    type="button"
                    className="account-dropdown-item"
                    onClick={() => {
                      setAccountOpen(false);
                      onToggleTheme();
                    }}
                  >
                    {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                    <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                  </button>
                  <button
                    type="button"
                    className="account-dropdown-item"
                    onClick={() => {
                      setAccountOpen(false);
                      setPwError('');
                      setShowPasswordModal(true);
                    }}
                  >
                    <KeyRound size={15} />
                    <span>Change password</span>
                  </button>
                  <button
                    type="button"
                    className="account-dropdown-item"
                    onClick={() => {
                      setAccountOpen(false);
                      setReportError('');
                      setShowReportModal(true);
                    }}
                  >
                    <LifeBuoy size={15} />
                    <span>Report a problem</span>
                  </button>
                  <button
                    type="button"
                    className="account-dropdown-item"
                    onClick={() => {
                      setAccountOpen(false);
                      setShowPrivacyModal(true);
                    }}
                  >
                    <ShieldCheck size={15} />
                    <span>Privacy policy</span>
                  </button>
                  <div className="account-dropdown-divider" />
                  <button
                    type="button"
                    className="account-dropdown-item danger"
                    onClick={() => {
                      setAccountOpen(false);
                      setDeleteConfirmText('');
                      setDeleteError('');
                      setShowDeleteModal(true);
                    }}
                  >
                    <Trash2 size={15} />
                    <span>Delete account</span>
                  </button>
                  <button
                    type="button"
                    className="account-dropdown-item danger"
                    onClick={onLogout}
                  >
                    <LogOut size={15} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Canvas */}
        <main className="app-content view-fade" key={path}>
          {children}
        </main>
      </div>

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
                <div className="password-field">
                  <input
                    type={showPw.current ? 'text' : 'password'}
                    className="input"
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPw((s) => ({ ...s, current: !s.current }))}
                    aria-label={showPw.current ? 'Hide password' : 'Show password'}
                    title={showPw.current ? 'Hide password' : 'Show password'}
                  >
                    {showPw.current ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div className="password-field">
                  <input
                    type={showPw.next ? 'text' : 'password'}
                    className="input"
                    placeholder="Minimum 6 characters"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPw((s) => ({ ...s, next: !s.next }))}
                    aria-label={showPw.next ? 'Hide password' : 'Show password'}
                    title={showPw.next ? 'Hide password' : 'Show password'}
                  >
                    {showPw.next ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <div className="password-field">
                  <input
                    type={showPw.confirm ? 'text' : 'password'}
                    className="input"
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
                    aria-label={showPw.confirm ? 'Hide password' : 'Show password'}
                    title={showPw.confirm ? 'Hide password' : 'Show password'}
                  >
                    {showPw.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
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

      {/* Report a Problem Modal */}
      {showReportModal && (
        <div className="modal-backdrop" onClick={() => setShowReportModal(false)}>
          <div className="modal modal-animate" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div className="confirm-icon">
                  <LifeBuoy size={16} />
                </div>
                <h3 className="modal-title">Report a Problem</h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                onClick={() => setShowReportModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: 16 }}>
              Tell us what went wrong or share feedback. Our support team will follow up at{' '}
              <strong style={{ color: 'var(--ink)' }}>{teacher?.email}</strong>.
            </p>

            {reportError && <div className="alert alert-error">{reportError}</div>}

            <form onSubmit={handleSubmitReport}>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="select"
                  value={reportForm.category}
                  onChange={(e) => setReportForm({ ...reportForm, category: e.target.value })}
                >
                  <option value="Bug / Error">Bug / Error</option>
                  <option value="QR Scanning Issue">QR Scanning Issue</option>
                  <option value="Account & Login">Account &amp; Login</option>
                  <option value="Reports & Export">Reports &amp; Export</option>
                  <option value="Feature Request">Feature Request</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Subject *</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Short summary of the issue"
                  value={reportForm.subject}
                  onChange={(e) => setReportForm({ ...reportForm, subject: e.target.value })}
                  required
                  minLength={3}
                  maxLength={160}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description *</label>
                <textarea
                  className="input textarea"
                  rows={4}
                  placeholder="Describe what happened and how we can reproduce it..."
                  value={reportForm.message}
                  onChange={(e) => setReportForm({ ...reportForm, message: e.target.value })}
                  required
                  minLength={10}
                  maxLength={4000}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowReportModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={reportSending}>
                  <Send size={14} /> {reportSending ? 'Sending...' : 'Send Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div className="modal modal-animate" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div className="confirm-icon danger">
                  <AlertTriangle size={16} />
                </div>
                <h3 className="modal-title">Delete Account</h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                onClick={() => setShowDeleteModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              <div>
                <strong>This action cannot be undone.</strong> Deleting your account (
                <strong>{teacher?.email}</strong>) will permanently remove all your saved courses,
                sessions, and student attendance records.
              </div>
            </div>

            {deleteError && <div className="alert alert-error">{deleteError}</div>}

            <form onSubmit={handleDeleteAccount}>
              <div className="form-group">
                <label className="form-label">
                  Type <span className="mono">DELETE</span> to confirm
                </label>
                <input
                  className="input mono"
                  type="text"
                  placeholder="DELETE"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger-solid"
                  disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                >
                  <Trash2 size={14} /> {deletingAccount ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PrivacyPolicyModal open={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
    </div>
  );
}
