import React, { useEffect, useState } from 'react';
import {
  QrCode,
  BookOpen,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Radio,
  ChevronRight,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Courses', icon: BookOpen, match: (p) => p === '/' || p === '/courses' },
  {
    path: '/sessions',
    label: 'Attendance Register',
    icon: ClipboardList,
    match: (p) => p === '/sessions' || p.startsWith('/session/'),
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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

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

            <div className="nav-user desktop-only">
              <div className="teacher-avatar">
                {(teacher?.name || 'A')
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <span className="nav-user-name">{teacher?.name}</span>
            </div>

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
              <button type="button" className="btn btn-secondary btn-sm" onClick={onLogout}>
                <LogOut size={14} /> Sign Out
              </button>
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
    </div>
  );
}
