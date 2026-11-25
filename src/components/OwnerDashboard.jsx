import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  RefreshCw,
  Shield,
  Users,
  Radio,
  Search,
  CheckCircle2,
  Clock,
  Lock,
  Mail,
  KeyRound,
} from 'lucide-react';
import { api } from '../api';

function formatRelativeTime(iso) {
  if (!iso) return 'Never';
  const diffMs = Date.now() - Date.parse(iso);
  if (Number.isNaN(diffMs) || diffMs < 0) return 'Just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function OwnerDashboard({ teacher }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'online' | 'today'

  // 2FA Step-Up Gate state
  const [codeSent, setCodeSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [gateInfo, setGateInfo] = useState('');
  const [gateError, setGateError] = useState('');

  const loadMetrics = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await api.getOwnerMetrics();
      setData(res);
      setLocked(false);
      setError('');
    } catch (err) {
      if (err.status === 403 || err.data?.requiresOwnerVerification) {
        setLocked(true);
        setData(null);
        setError('');
      } else {
        setError(err.message || 'Could not load platform activity.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics(false);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !locked) {
        loadMetrics(true);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [loadMetrics, locked]);

  async function handleRequestCode() {
    setGateError('');
    setGateInfo('');
    setSendingCode(true);
    try {
      const res = await api.requestOwnerCode();
      setCodeSent(true);
      setGateInfo(res.message || 'Verification code sent to your email.');
    } catch (err) {
      setGateError(err.message || 'Could not send security code.');
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setGateError('');
    setGateInfo('');
    setVerifyingCode(true);
    try {
      await api.verifyOwnerCode(otpCode);
      setOtpCode('');
      setCodeSent(false);
      setLocked(false);
      await loadMetrics(false);
    } catch (err) {
      setGateError(err.message || 'Verification failed.');
    } finally {
      setVerifyingCode(false);
    }
  }

  async function handleLockNow() {
    try {
      await api.lockOwnerMonitor();
    } catch {}
    setData(null);
    setLocked(true);
    setCodeSent(false);
    setOtpCode('');
    setGateInfo('Owner Monitor locked.');
    setGateError('');
  }

  const filteredUsers = useMemo(() => {
    const list = data?.users || [];
    const q = search.trim().toLowerCase();
    return list.filter((u) => {
      if (filter === 'online' && !u.isOnline) return false;
      if (filter === 'today' && !u.activeToday) return false;
      if (!q) return true;
      return (
        String(u.name || '').toLowerCase().includes(q) ||
        String(u.email || '').toLowerCase().includes(q)
      );
    });
  }, [data, search, filter]);

  // 2FA Step-Up Gate Screen (prevents stolen JWTs from reading owner metrics)
  if (!loading && locked) {
    return (
      <div className="overview-stack">
        <section className="panel owner-gate-card" aria-label="Owner security verification">
          <div className="owner-gate-head">
            <div className="owner-shield-badge" aria-hidden="true">
              <Lock size={19} strokeWidth={1.85} />
            </div>
            <div>
              <div className="owner-title-row">
                <h1 className="owner-title">Verify Owner Identity</h1>
                <span className="owner-private-pill">2FA Protected</span>
              </div>
              <p className="owner-subtitle">
                For your security, unlocking the Active Users Monitor requires a fresh 6-digit
                one-time code sent to <strong>{teacher?.email}</strong>. Unlocks expire
                automatically after 30 minutes.
              </p>
            </div>
          </div>

          {gateInfo && (
            <div className="alert alert-info" role="status" aria-live="polite">
              {gateInfo}
            </div>
          )}
          {gateError && (
            <div className="alert alert-error" role="alert">
              {gateError}
            </div>
          )}

          {!codeSent ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRequestCode}
                disabled={sendingCode}
              >
                <Mail size={15} strokeWidth={1.85} aria-hidden="true" />
                <span>{sendingCode ? 'Sending 6-digit code...' : 'Send 6-digit security code'}</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerifyCode} style={{ maxWidth: 360 }}>
              <div className="form-group">
                <label htmlFor="owner-otp-input" className="form-label">
                  Enter 6-digit code from {teacher?.email}
                </label>
                <input
                  id="owner-otp-input"
                  className="input mono"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  enterKeyHint="done"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    textAlign: 'center',
                    fontSize: '1.3rem',
                    fontWeight: 600,
                    letterSpacing: '0.32em',
                    padding: '11px 14px',
                  }}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={verifyingCode || otpCode.length !== 6}
                >
                  <KeyRound size={15} strokeWidth={1.85} aria-hidden="true" />
                  <span>{verifyingCode ? 'Verifying...' : 'Unlock Active Users'}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRequestCode}
                  disabled={sendingCode}
                >
                  {sendingCode ? 'Resending...' : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    );
  }

  const summary = data?.summary || {
    totalUsers: 0,
    onlineNow: 0,
    activeToday: 0,
    activeWeek: 0,
    newUsersWeek: 0,
    liveSessionsCount: 0,
    totalCourses: 0,
    totalSessions: 0,
    checkInsToday: 0,
    checkInsLast5Min: 0,
    totalCheckIns: 0,
  };

  const liveSessions = data?.liveSessions || [];

  return (
    <div className="overview-stack">
      {/* Private Owner Header Banner */}
      <section className="panel owner-banner" aria-label="Private Owner Monitor">
        <div className="owner-banner-left">
          <div className="owner-shield-badge" aria-hidden="true">
            <Shield size={18} strokeWidth={1.85} />
          </div>
          <div>
            <div className="owner-title-row">
              <h1 className="owner-title">Active Users Monitor</h1>
              <span className="owner-private-pill">Owner only · 2FA</span>
            </div>
            <p className="owner-subtitle">
              Real-time instructor activity, live QR sessions, and check-ins across AttendQR.
              Auto-updates every 15 seconds.
            </p>
          </div>
        </div>

        <div className="owner-banner-actions">
          {data?.generatedAt && (
            <span className="owner-updated tnum">
              Updated {formatRelativeTime(data.generatedAt)}
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadMetrics(false)}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} aria-hidden="true" />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleLockNow}
            title="Lock the Owner Monitor immediately"
          >
            <Lock size={14} aria-hidden="true" />
            <span>Lock</span>
          </button>
        </div>
      </section>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {/* Primary KPI Strip */}
      <section className="metrics-strip" aria-label="Platform activity summary">
        <div className="metric-item">
          <div className="metric-num tnum owner-online-num">
            <span className={`status-dot ${summary.onlineNow > 0 ? 'live' : ''}`} />
            <span>{loading ? '—' : summary.onlineNow}</span>
          </div>
          <div className="metric-label">Online now (5 min)</div>
        </div>

        <div className="metric-item">
          <div className="metric-num tnum">{loading ? '—' : summary.activeToday}</div>
          <div className="metric-label">Active today (24h)</div>
        </div>

        <div className="metric-item">
          <div className="metric-num tnum">{loading ? '—' : summary.activeWeek}</div>
          <div className="metric-label">
            Active this week ({summary.totalUsers} total)
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-num tnum">{loading ? '—' : summary.liveSessionsCount}</div>
          <div className="metric-label">
            Live QR sessions · {summary.checkInsToday} scans today
          </div>
        </div>
      </section>

      {/* Secondary Quick Totals Row */}
      <section className="owner-submetrics">
        <div className="owner-submetric-chip">
          <Users size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="tnum">
            <strong>{summary.newUsersWeek}</strong> new accounts (7d)
          </span>
        </div>
        <div className="owner-submetric-chip">
          <Activity size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="tnum">
            <strong>{summary.checkInsLast5Min}</strong> student check-ins in last 5m
          </span>
        </div>
        <div className="owner-submetric-chip">
          <CheckCircle2 size={14} strokeWidth={1.8} aria-hidden="true" />
          <span className="tnum">
            <strong>{summary.totalCheckIns}</strong> all-time check-ins across{' '}
            <strong>{summary.totalCourses}</strong> courses
          </span>
        </div>
      </section>

      {/* Currently Live QR Sessions */}
      <section className="panel">
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={16} strokeWidth={1.85} style={{ color: 'var(--brand-emerald)' }} aria-hidden="true" />
            <h2 className="panel-title">Live QR Sessions Right Now</h2>
          </div>
          <span className="status-tag tnum">{liveSessions.length} active</span>
        </div>

        {loading ? (
          <div style={{ padding: 20 }}>
            <span className="skeleton" style={{ height: 36, width: '100%' }} />
          </div>
        ) : liveSessions.length === 0 ? (
          <div style={{ padding: '22px 18px', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            No classrooms are currently running a live QR session.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Course &amp; Session</th>
                  <th>Instructor</th>
                  <th>Status</th>
                  <th>Check-ins</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {liveSessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        <span className="mono">{s.classCode}</span> — {s.title}
                      </div>
                      {s.room && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                          {s.room}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.teacherName}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
                        {s.teacherEmail}
                      </div>
                    </td>
                    <td>
                      <span className={s.status === 'active' ? 'badge-present' : 'badge-late'}>
                        {s.status === 'active' ? 'Live' : 'Paused'}
                      </span>
                    </td>
                    <td className="tnum" style={{ fontWeight: 600 }}>
                      {s.attendeeCount}
                    </td>
                    <td className="tnum" style={{ color: 'var(--ink-muted)' }}>
                      {formatRelativeTime(s.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Registered Users & Activity Table */}
      <section className="panel">
        <div className="panel-header owner-users-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} strokeWidth={1.85} aria-hidden="true" />
            <h2 className="panel-title">Registered Accounts ({filteredUsers.length})</h2>
          </div>

          <div className="owner-users-controls">
            <div className="owner-filter-tabs" role="tablist" aria-label="Filter users by activity">
              {[
                { id: 'all', label: 'All' },
                { id: 'online', label: `Online (${summary.onlineNow})` },
                { id: 'today', label: `24h (${summary.activeToday})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.id}
                  className={`owner-filter-tab ${filter === tab.id ? 'active' : ''}`}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="owner-search-wrap">
              <Search size={14} className="owner-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="input owner-search-input"
                placeholder="Search name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search registered accounts"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="skeleton" style={{ height: 34, width: '100%' }} />
            <span className="skeleton" style={{ height: 34, width: '100%' }} />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '22px 18px', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            No matching accounts for this filter.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Presence</th>
                  <th>Last active</th>
                  <th>Courses</th>
                  <th>Sessions</th>
                  <th>Check-ins</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{u.name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{u.email}</div>
                    </td>
                    <td>
                      {u.isOnline ? (
                        <span className="owner-presence-badge is-online">
                          <span className="status-dot live" />
                          Online now
                        </span>
                      ) : u.activeToday ? (
                        <span className="owner-presence-badge is-today">
                          <Clock size={12} strokeWidth={2} aria-hidden="true" />
                          Active today
                        </span>
                      ) : (
                        <span className="owner-presence-badge is-idle">Offline</span>
                      )}
                    </td>
                    <td className="tnum" style={{ color: 'var(--ink-secondary)' }}>
                      {formatRelativeTime(u.lastSeenAt)}
                    </td>
                    <td className="tnum">{u.coursesCount}</td>
                    <td className="tnum">
                      {u.sessionsCount}
                      {u.liveSessionsCount > 0 && (
                        <span className="badge-present" style={{ marginLeft: 6 }}>
                          {u.liveSessionsCount} live
                        </span>
                      )}
                    </td>
                    <td className="tnum" style={{ fontWeight: 600 }}>
                      {u.checkInsCount}
                    </td>
                    <td className="tnum" style={{ color: 'var(--ink-muted)' }}>
                      {formatDateShort(u.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
