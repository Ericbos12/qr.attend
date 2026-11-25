import React, { useEffect, useMemo, useState } from 'react';
import {
  QrCode,
  Plus,
  Play,
  Download,
  Trash2,
  Eye,
  X,
  Pencil,
  Crosshair,
  Search,
  Radio,
  BookOpen,
  Users,
  Calendar,
  ArrowRight,
  Inbox,
} from 'lucide-react';
import { api } from '../api';
import { useFeedback } from './UiFeedback';

export default function Dashboard({
  viewMode = 'overview', // 'overview' | 'courses' | 'sessions'
  classes = [],
  sessions = [],
  loading = false,
  onRefresh,
  onNavigate,
  onOpenProjector,
  onOpenSessionDetail,
}) {
  const { toast, confirm } = useFeedback();
  const [error, setError] = useState('');

  // Filters
  const [sessionSearch, setSessionSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Create / Edit course modal
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingClassId, setEditingClassId] = useState(null);
  const [courseForm, setCourseForm] = useState({ code: '', name: '', room: '' });

  // Start session modal
  const [startTargetClass, setStartTargetClass] = useState(null);
  const [sessionConfig, setSessionConfig] = useState({
    title: '',
    room: '',
    rotateIntervalSec: 8,
    lateAfterMinutes: '',
    preventDuplicateDevice: true,
    useGeoLock: false,
    geoRadiusMeters: 75,
    geoCoords: null,
  });
  const [geoStatus, setGeoStatus] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowCourseModal(false);
        setStartTargetClass(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function openNewCourseModal() {
    setEditingClassId(null);
    setCourseForm({ code: '', name: '', room: '' });
    setShowCourseModal(true);
  }

  function openEditCourseModal(cls) {
    setEditingClassId(cls.id);
    setCourseForm({ code: cls.code, name: cls.name, room: cls.room || '' });
    setShowCourseModal(true);
  }

  async function handleSaveCourse(e) {
    e.preventDefault();
    try {
      setError('');
      if (editingClassId) {
        await api.updateClass(editingClassId, courseForm);
        toast(`Updated ${courseForm.code.toUpperCase()}`, 'success');
      } else {
        await api.createClass(courseForm);
        toast(`Added course ${courseForm.code.toUpperCase()}`, 'success');
      }
      setCourseForm({ code: '', name: '', room: '' });
      setEditingClassId(null);
      setShowCourseModal(false);
      await onRefresh?.();
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
  }

  async function handleDeleteClass(cls) {
    const ok = await confirm({
      title: 'Delete Course',
      message: `Delete "${cls.code} — ${cls.name}" and all recorded attendance sessions for this course?`,
      confirmLabel: 'Delete Course',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteClass(cls.id);
      toast(`Deleted ${cls.code}`, 'info');
      await onRefresh?.();
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
  }

  function openStartSessionModal(cls) {
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    setStartTargetClass(cls);
    setGeoStatus('');
    setSessionConfig({
      title: `${cls.code} — ${today}`,
      room: cls.room || '',
      rotateIntervalSec: 8,
      lateAfterMinutes: '',
      preventDuplicateDevice: true,
      useGeoLock: false,
      geoRadiusMeters: 75,
      geoCoords: null,
    });
  }

  function captureClassroomGps() {
    if (!navigator.geolocation) {
      setGeoStatus('Location services are not available in this browser.');
      return;
    }
    setGeoStatus('Reading classroom coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSessionConfig((prev) => ({
          ...prev,
          useGeoLock: true,
          geoCoords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        }));
        setGeoStatus(`Locked (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`);
      },
      (err) => {
        setGeoStatus(`Location unavailable: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleStartSession(e) {
    e.preventDefault();
    if (!startTargetClass) return;
    try {
      setError('');
      const payload = {
        classId: startTargetClass.id,
        title: sessionConfig.title,
        room: sessionConfig.room,
        rotateIntervalSec: sessionConfig.rotateIntervalSec,
        lateAfterMinutes: sessionConfig.lateAfterMinutes ? Number(sessionConfig.lateAfterMinutes) : null,
        preventDuplicateDevice: sessionConfig.preventDuplicateDevice,
        geoLock:
          sessionConfig.useGeoLock && sessionConfig.geoCoords
            ? {
                lat: sessionConfig.geoCoords.lat,
                lng: sessionConfig.geoCoords.lng,
                radiusMeters: sessionConfig.geoRadiusMeters,
              }
            : null,
      };
      const { session } = await api.createSession(payload);
      setStartTargetClass(null);
      await onRefresh?.();
      toast(`QR session started for ${startTargetClass.code}`, 'success');
      onOpenProjector(session.id);
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
  }

  async function handleDeleteSession(sess) {
    const ok = await confirm({
      title: 'Delete Attendance Session',
      message: `Remove "${sess.title}" and all ${sess.attendeeCount} recorded check-ins?`,
      confirmLabel: 'Delete Session',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteSession(sess.id);
      toast('Session deleted', 'info');
      await onRefresh?.();
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
  }

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.classCode || '').toLowerCase().includes(q) ||
        (s.className || '').toLowerCase().includes(q) ||
        (s.room || '').toLowerCase().includes(q)
      );
    });
  }, [sessions, sessionSearch, statusFilter]);

  const totalCheckIns = sessions.reduce((acc, s) => acc + (s.attendeeCount || 0), 0);
  const liveSessions = sessions.filter((s) => s.status === 'active' || s.status === 'paused');
  const activeCount = sessions.filter((s) => s.status === 'active').length;

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Overview Workspace View */}
      {viewMode === 'overview' && (
        <>
          <div className="overview-hero">
            <div>
              <div className="overview-eyebrow">LECTURER WORKSPACE</div>
              <h1 className="overview-greeting">Good to see you 👋</h1>
              <p className="overview-sub">Everything you need to keep attendance on track.</p>
            </div>
            <button type="button" className="btn btn-primary btn-hero-cta" onClick={openNewCourseModal}>
              <Plus size={16} /> New course
            </button>
          </div>

          <div className="overview-stats-grid">
            <div className="stat-card">
              <div className="stat-icon stat-icon-indigo">
                <BookOpen size={18} />
              </div>
              <div className="stat-label">Total courses</div>
              <div className="stat-value">{classes.length}</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon stat-icon-green">
                <Radio size={18} />
              </div>
              <div className="stat-label">Live sessions</div>
              <div className="stat-value">{activeCount}</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon stat-icon-amber">
                <Users size={18} />
              </div>
              <div className="stat-label">Total check-ins</div>
              <div className="stat-value">{totalCheckIns}</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon stat-icon-sky">
                <Calendar size={18} />
              </div>
              <div className="stat-label">Sessions held</div>
              <div className="stat-value">{sessions.length}</div>
            </div>
          </div>

          {liveSessions.length > 0 ? (
            <div className="quick-start-banner">
              <div className="quick-start-content">
                <div className="quick-start-eyebrow" style={{ color: '#6ee7b7' }}>
                  ● {liveSessions[0].status === 'active' ? 'LIVE SESSION' : 'PAUSED SESSION'}
                </div>
                <h2 className="quick-start-title">
                  {liveSessions[0].classCode} — {liveSessions[0].title}
                </h2>
                <p className="quick-start-sub">
                  {liveSessions[0].attendeeCount} students checked in
                  {liveSessions[0].room ? ` · ${liveSessions[0].room}` : ''}. Open the live projector to display the rotating QR code.
                </p>
              </div>
              <div className="quick-start-actions">
                <button
                  type="button"
                  className="btn quick-start-btn"
                  onClick={() => onOpenProjector(liveSessions[0].id)}
                >
                  Open live QR <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="btn quick-start-btn-ghost"
                  onClick={() => onOpenSessionDetail(liveSessions[0].id)}
                >
                  Register
                </button>
              </div>
            </div>
          ) : (
            <div className="quick-start-banner">
              <div className="quick-start-content">
                <div className="quick-start-eyebrow">QUICK START</div>
                <h2 className="quick-start-title">Ready for your next lecture?</h2>
                <p className="quick-start-sub">
                  Create a course, start a session, and put a QR code up for your students.
                </p>
              </div>
              <div className="quick-start-actions">
                {classes.length === 0 ? (
                  <button
                    type="button"
                    className="btn quick-start-btn"
                    onClick={openNewCourseModal}
                  >
                    Set up a course <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn quick-start-btn"
                    onClick={() => openStartSessionModal(classes[0])}
                  >
                    Start live session <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="overview-bottom-grid">
            <div className="overview-card">
              <div className="overview-card-header">
                <h3 className="overview-card-title">Your courses</h3>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => onNavigate?.('/courses')}
                >
                  View all <ArrowRight size={13} />
                </button>
              </div>

              {loading ? (
                <div className="overview-empty">Loading courses...</div>
              ) : classes.length === 0 ? (
                <div className="overview-empty">
                  <Inbox size={26} className="overview-empty-icon" />
                  <p>No courses yet. Add your first course to get started.</p>
                </div>
              ) : (
                <div className="overview-list">
                  {classes.slice(0, 4).map((cls) => (
                    <div className="overview-list-row" key={cls.id}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="course-code-label mono">{cls.code}</span>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{cls.name}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginTop: 3 }}>
                          {cls.room ? `${cls.room} · ` : ''}
                          {cls.sessionCount} {cls.sessionCount === 1 ? 'session' : 'sessions'} · {cls.totalCheckIns} check-ins
                        </div>
                      </div>
                      {cls.activeSessionId ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => onOpenProjector(cls.activeSessionId)}
                        >
                          <QrCode size={13} /> Live QR
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openStartSessionModal(cls)}
                        >
                          <Play size={13} /> Start QR
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="overview-card">
              <div className="overview-card-header">
                <h3 className="overview-card-title">Recent sessions</h3>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => onNavigate?.('/reports')}
                >
                  View reports <ArrowRight size={13} />
                </button>
              </div>

              {loading ? (
                <div className="overview-empty">Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="overview-empty">
                  <Inbox size={26} className="overview-empty-icon" />
                  <p>Your lecture sessions will show up here.</p>
                </div>
              ) : (
                <div className="overview-list">
                  {sessions.slice(0, 5).map((sess) => (
                    <button
                      type="button"
                      className="overview-session-row"
                      key={sess.id}
                      onClick={() =>
                        sess.status !== 'ended'
                          ? onOpenProjector(sess.id)
                          : onOpenSessionDetail(sess.id)
                      }
                    >
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span
                            className={`status-dot ${
                              sess.status === 'active'
                                ? 'live'
                                : sess.status === 'paused'
                                ? 'paused'
                                : ''
                            }`}
                          />
                          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{sess.title}</span>
                        </div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)', marginTop: 2 }}>
                          {new Date(sess.startedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink-secondary)' }}>
                        {sess.attendeeCount}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Page Header for Courses & Sessions views */}
      {viewMode !== 'overview' && (
        <div className="page-header">
          <div>
            <h1 className="page-title">
              {viewMode === 'sessions' ? 'Live session & Register' : 'Courses'}
            </h1>
            <p className="page-sub">
              {viewMode === 'sessions'
                ? 'View attendance sessions, open live QR codes, or export registers as CSV.'
                : 'Select a course to project a live rotating QR code for student attendance.'}
            </p>
          </div>

          {viewMode === 'courses' ? (
            <button type="button" className="btn btn-primary" onClick={openNewCourseModal}>
              <Plus size={15} /> New course
            </button>
          ) : (
            sessions.length > 0 && (
              <a className="btn btn-secondary btn-sm" href={api.getReportRecordsCsvUrl()} download>
                <Download size={14} /> Export All CSV
              </a>
            )
          )}
        </div>
      )}

      {/* Courses View */}
      {viewMode === 'courses' && (
        <>
          {liveSessions.length > 0 && (
            <div className="live-banner">
              <div className="live-banner-left">
                <div className="live-banner-badge">
                  <Radio size={14} />
                  <span>{liveSessions[0].status === 'active' ? 'Live Now' : 'Paused'}</span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.96rem' }}>
                    <span className="mono">{liveSessions[0].classCode}</span> — {liveSessions[0].title}
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                    {liveSessions[0].attendeeCount} students recorded
                    {liveSessions[0].room ? ` · ${liveSessions[0].room}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: '#ffffff', color: '#1e3a8a' }}
                  onClick={() => onOpenProjector(liveSessions[0].id)}
                >
                  <QrCode size={14} /> Open Live QR
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: 'rgba(255,255,255,0.14)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.22)' }}
                  onClick={() => onOpenSessionDetail(liveSessions[0].id)}
                >
                  <Eye size={14} /> Register
                </button>
              </div>
            </div>
          )}

          <div className="summary-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="summary-cell">
              <div className="summary-label">Saved Courses</div>
              <div className="summary-value">{classes.length}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Active QR Sessions</div>
              <div className="summary-value" style={{ color: activeCount > 0 ? 'var(--ok)' : 'var(--ink)' }}>
                {activeCount}
              </div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Total Attendance Recorded</div>
              <div className="summary-value">{totalCheckIns}</div>
            </div>
          </div>

          {loading ? (
            <div className="panel" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-muted)' }}>
              Loading courses...
            </div>
          ) : classes.length === 0 ? (
            <div className="panel" style={{ padding: 36, textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>No courses saved yet</p>
              <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', marginBottom: 16 }}>
                Add your first course code to start taking QR attendance.
              </p>
              <button type="button" className="btn btn-primary" onClick={openNewCourseModal}>
                <Plus size={15} /> Add Course
              </button>
            </div>
          ) : (
            <div className="courses-grid">
              {classes.map((cls) => (
                <div className="course-card" key={cls.id}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="course-code-label mono">{cls.code}</span>
                      {cls.activeSessionId && (
                        <span className="status-tag">
                          <span className={`status-dot ${cls.activeSessionStatus === 'active' ? 'live' : 'paused'}`} />
                          {cls.activeSessionStatus === 'active' ? 'Live' : 'Paused'}
                        </span>
                      )}
                    </div>
                    <div className="course-name">{cls.name}</div>
                    <div className="course-meta">
                      {cls.room && <span>{cls.room}</span>}
                      <span>{cls.sessionCount} {cls.sessionCount === 1 ? 'session' : 'sessions'}</span>
                      <span>{cls.totalCheckIns} recorded</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {cls.activeSessionId ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-full"
                        onClick={() => onOpenProjector(cls.activeSessionId)}
                      >
                        <QrCode size={15} />
                        Open Live QR
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-dark btn-full"
                        onClick={() => openStartSessionModal(cls)}
                      >
                        <Play size={14} />
                        Take Attendance
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      onClick={() => openEditCourseModal(cls)}
                      title="Edit Course"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      onClick={() => handleDeleteClass(cls)}
                      title="Delete Course"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Attendance Register View */}
      {viewMode === 'sessions' && (
        <>
          <div className="section-header">
            <div style={{ position: 'relative', width: 260 }}>
              <Search
                size={14}
                color="var(--ink-muted)"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                className="input"
                style={{ paddingLeft: 32, paddingTop: 7, paddingBottom: 7, fontSize: '0.84rem' }}
                placeholder="Search sessions..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
              />
            </div>

            <div className="segmented-control">
              {['all', 'active', 'paused', 'ended'].map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`seg-btn ${statusFilter === st ? 'active' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st === 'all' ? 'All' : st === 'active' ? 'Open' : st === 'paused' ? 'Paused' : 'Closed'}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            {filteredSessions.length === 0 ? (
              <div style={{ padding: 34, textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
                {sessions.length === 0
                  ? 'No sessions recorded yet. Go to Courses and select Take Attendance to begin.'
                  : 'No sessions match your filter.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Date &amp; Time</th>
                      <th>Status</th>
                      <th>Present</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((sess) => (
                      <tr key={sess.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{sess.title}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                            <span className="mono">{sess.classCode}</span> — {sess.className}
                            {sess.room ? ` · ${sess.room}` : ''}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                          {new Date(sess.startedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>
                          <span className="status-tag">
                            <span
                              className={`status-dot ${
                                sess.status === 'active'
                                  ? 'live'
                                  : sess.status === 'paused'
                                  ? 'paused'
                                  : ''
                              }`}
                            />
                            {sess.status === 'active' ? 'Open' : sess.status === 'paused' ? 'Paused' : 'Closed'}
                          </span>
                        </td>
                        <td className="mono" style={{ fontWeight: 600 }}>
                          <span>{sess.attendeeCount}</span>
                          {sess.lateCount > 0 && (
                            <span className="badge-late" style={{ marginLeft: 8 }}>
                              {sess.lateCount} late
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            {sess.status !== 'ended' && (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => onOpenProjector(sess.id)}
                              >
                                <QrCode size={13} /> QR
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => onOpenSessionDetail(sess.id)}
                            >
                              <Eye size={13} /> Register
                            </button>
                            <a
                              className="btn btn-secondary btn-sm"
                              href={api.getExportCsvUrl(sess.id)}
                              download
                            >
                              <Download size={13} /> CSV
                            </a>
                            <button
                              type="button"
                              className="btn btn-ghost icon-btn"
                              onClick={() => handleDeleteSession(sess)}
                              title="Delete Session"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal: Create / Edit Course */}
      {showCourseModal && (
        <div className="modal-backdrop" onClick={() => setShowCourseModal(false)}>
          <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingClassId ? 'Edit Course' : 'Add Course'}</h3>
              <button type="button" className="btn btn-ghost icon-btn" onClick={() => setShowCourseModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveCourse}>
              <div className="form-group">
                <label className="form-label">Course Code *</label>
                <input
                  className="input mono"
                  placeholder="CS 201"
                  value={courseForm.code}
                  onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Course Title *</label>
                <input
                  className="input"
                  placeholder="Data Structures & Algorithms"
                  value={courseForm.name}
                  onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Room / Venue</label>
                <input
                  className="input"
                  placeholder="Lecture Hall B"
                  value={courseForm.room}
                  onChange={(e) => setCourseForm({ ...courseForm, room: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCourseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingClassId ? 'Save Changes' : 'Save Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Start Attendance Session */}
      {startTargetClass && (
        <div className="modal-backdrop" onClick={() => setStartTargetClass(null)}>
          <div className="modal modal-animate" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Start QR Attendance</h3>
              <button type="button" className="btn btn-ghost icon-btn" onClick={() => setStartTargetClass(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <div>
                <strong className="mono">{startTargetClass.code}</strong> — {startTargetClass.name}
              </div>
            </div>

            <form onSubmit={handleStartSession}>
              {classes.length > 1 && (
                <div className="form-group">
                  <label className="form-label">Course</label>
                  <select
                    className="select"
                    value={startTargetClass.id}
                    onChange={(e) => {
                      const nextCls = classes.find((c) => c.id === e.target.value);
                      if (nextCls) openStartSessionModal(nextCls);
                    }}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Session Label</label>
                <input
                  className="input"
                  value={sessionConfig.title}
                  onChange={(e) => setSessionConfig({ ...sessionConfig, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Room / Venue</label>
                <input
                  className="input"
                  placeholder="Room 204"
                  value={sessionConfig.room}
                  onChange={(e) => setSessionConfig({ ...sessionConfig, room: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">QR Code Refresh Interval</label>
                <select
                  className="select"
                  value={sessionConfig.rotateIntervalSec}
                  onChange={(e) =>
                    setSessionConfig({ ...sessionConfig, rotateIntervalSec: Number(e.target.value) })
                  }
                >
                  <option value={5}>Every 5 seconds</option>
                  <option value={8}>Every 8 seconds (Recommended)</option>
                  <option value={10}>Every 10 seconds</option>
                </select>
                <span className="form-hint">
                  Screenshots and forwarded links expire automatically once the QR code rotates.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Mark Late Arrivals After (Optional)</label>
                <select
                  className="select"
                  value={sessionConfig.lateAfterMinutes}
                  onChange={(e) =>
                    setSessionConfig({ ...sessionConfig, lateAfterMinutes: e.target.value })
                  }
                >
                  <option value="">Disabled (all check-ins marked Present)</option>
                  <option value="5">5 minutes after start</option>
                  <option value="10">10 minutes after start</option>
                  <option value="15">15 minutes after start</option>
                  <option value="20">20 minutes after start</option>
                  <option value="30">30 minutes after start</option>
                </select>
              </div>

              <div className="modal-inset-box">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={sessionConfig.preventDuplicateDevice}
                    onChange={(e) =>
                      setSessionConfig({ ...sessionConfig, preventDuplicateDevice: e.target.checked })
                    }
                  />
                  <span>
                    <strong>One submission per phone</strong>
                    <br />
                    <span className="form-hint">
                      Blocks checking in a second time on the same phone for an absent student.
                    </span>
                  </span>
                </label>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>Classroom GPS Radius (Optional)</div>
                      <div className="form-hint">Require students to be within 75m of the room (HTTPS).</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={captureClassroomGps}
                    >
                      <Crosshair size={13} /> {sessionConfig.geoCoords ? 'Update GPS' : 'Set Location'}
                    </button>
                  </div>
                  {geoStatus && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: 6 }}>{geoStatus}</div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStartTargetClass(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <QrCode size={15} /> Display QR Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
