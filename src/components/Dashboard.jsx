import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
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
  ArrowRight,
  Loader2,
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

  // Overview stage selection + live QR product preview
  const [selectedClassId, setSelectedClassId] = useState('');
  const [stageQrUrl, setStageQrUrl] = useState('');
  const [stageQrMeta, setStageQrMeta] = useState(null);
  const [stageRemainingSec, setStageRemainingSec] = useState(8);
  const [stageProgressPct, setStageProgressPct] = useState(100);

  // Filters
  const [sessionSearch, setSessionSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Create / Edit course modal
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingClassId, setEditingClassId] = useState(null);
  const [courseForm, setCourseForm] = useState({ code: '', name: '', room: '' });
  const [savingCourse, setSavingCourse] = useState(false);

  // Start session modal
  const [startTargetClass, setStartTargetClass] = useState(null);
  const [startingSession, setStartingSession] = useState(false);
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

  const liveSessions = useMemo(
    () => sessions.filter((s) => s.status === 'active' || s.status === 'paused'),
    [sessions]
  );
  const primaryLive = liveSessions[0] || null;
  const activeCount = useMemo(
    () => sessions.filter((s) => s.status === 'active').length,
    [sessions]
  );
  const totalCheckIns = useMemo(
    () => sessions.reduce((acc, s) => acc + (s.attendeeCount || 0), 0),
    [sessions]
  );
  const avgPerSession = sessions.length > 0 ? Math.round(totalCheckIns / sessions.length) : 0;

  const selectedCourse = useMemo(() => {
    if (classes.length === 0) return null;
    return classes.find((c) => c.id === selectedClassId) || classes[0];
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (classes.length > 0 && !classes.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

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

  // Show actual live rotating QR code on Overview when a session is active,
  // or a crisp preview QR for the selected course when ready to launch
  useEffect(() => {
    if (viewMode !== 'overview') return;
    let cancelled = false;

    if (primaryLive) {
      let pollTimer = null;
      let tickTimer = null;
      let serverOffset = 0;
      let latestQr = null;

      async function fetchLiveQr() {
        try {
          const data = await api.getSessionQr(primaryLive.id);
          if (cancelled || !data?.qr) return;
          latestQr = data.qr;
          setStageQrMeta(data.qr);
          if (data.qr.serverTime) {
            serverOffset = data.qr.serverTime - Date.now();
          }
          const origin =
            window.location.hostname === 'localhost' && data.lanOrigin
              ? data.lanOrigin
              : window.location.origin;
          const scanUrl = `${origin}/checkin?s=${encodeURIComponent(primaryLive.id)}&t=${encodeURIComponent(data.qr.token)}`;
          const img = await QRCode.toDataURL(scanUrl, {
            width: 240,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0b1220', light: '#ffffff' },
          });
          if (!cancelled) setStageQrUrl(img);
        } catch {}
      }

      fetchLiveQr();
      tickTimer = setInterval(() => {
        if (!latestQr) return;
        const now = Date.now() + serverOffset;
        const remMs = Math.max(0, latestQr.expiresAt - now);
        const totalMs = (latestQr.intervalSec || 8) * 1000;
        setStageRemainingSec(Math.ceil(remMs / 1000));
        setStageProgressPct(Math.max(0, Math.min(100, (remMs / totalMs) * 100)));
        if (remMs <= 250 && !pollTimer) {
          pollTimer = setTimeout(() => {
            pollTimer = null;
            fetchLiveQr();
          }, 300);
        }
      }, 200);

      return () => {
        cancelled = true;
        if (tickTimer) clearInterval(tickTimer);
        if (pollTimer) clearTimeout(pollTimer);
      };
    }

    setStageQrMeta(null);
    if (selectedCourse) {
      const previewPayload = `${window.location.origin}/checkin?course=${encodeURIComponent(selectedCourse.code)}`;
      QRCode.toDataURL(previewPayload, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0b1220', light: '#ffffff' },
      })
        .then((img) => {
          if (!cancelled) setStageQrUrl(img);
        })
        .catch(() => {});
    } else {
      setStageQrUrl('');
    }

    return () => {
      cancelled = true;
    };
  }, [viewMode, primaryLive?.id, primaryLive?.status, selectedCourse?.id, selectedCourse?.code]);

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
    if (savingCourse) return;
    setSavingCourse(true);
    try {
      setError('');
      if (editingClassId) {
        await api.updateClass(editingClassId, courseForm);
        toast(`Saved changes to ${courseForm.code.toUpperCase()}`, 'success');
      } else {
        const res = await api.createClass(courseForm);
        if (res?.class?.id) setSelectedClassId(res.class.id);
        toast(`Added ${courseForm.code.toUpperCase()}`, 'success');
      }
      setCourseForm({ code: '', name: '', room: '' });
      setEditingClassId(null);
      setShowCourseModal(false);
      await onRefresh?.();
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    } finally {
      setSavingCourse(false);
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
    if (!startTargetClass || startingSession) return;
    setStartingSession(true);
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
      toast(`Live QR started for ${startTargetClass.code}`, 'success');
      onOpenProjector(session.id);
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    } finally {
      setStartingSession(false);
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

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* ==========================================
          OVERVIEW — PRODUCT-FIRST ROLL-CALL STAGE
         ========================================== */}
      {viewMode === 'overview' && (
        <div className="overview-stack">
          {loading ? (
            <div className="rollcall-stage">
              <div className="rollcall-stage-copy" style={{ gap: 14 }}>
                <span className="skeleton" style={{ height: 28, width: '62%' }} />
                <span className="skeleton" style={{ height: 18, width: '44%' }} />
                <span className="skeleton" style={{ height: 46, width: 220, marginTop: 8 }} />
              </div>
              <div className="rollcall-stage-preview">
                <span className="skeleton" style={{ width: 196, height: 196, borderRadius: 10 }} />
              </div>
            </div>
          ) : primaryLive ? (
            /* Active / Paused Live Session — Actual Live QR on Stage */
            <section className="rollcall-stage rollcall-stage-live" aria-label="Active attendance session">
              <div className="rollcall-stage-copy">
                <div className="rollcall-live-status">
                  <span
                    className={`status-dot ${primaryLive.status === 'active' ? 'live' : 'paused'}`}
                  />
                  <span>
                    {primaryLive.status === 'active' ? 'Accepting check-ins' : 'Check-in paused'}
                  </span>
                  {primaryLive.room && <span className="rollcall-sep">·</span>}
                  {primaryLive.room && <span>{primaryLive.room}</span>}
                </div>

                <h1 className="rollcall-headline">
                  <span className="mono">{primaryLive.classCode}</span> attendance is{' '}
                  {primaryLive.status === 'active' ? 'open' : 'paused'}
                </h1>

                <div className="rollcall-live-counter">
                  <span className="rollcall-big-num tnum">{primaryLive.attendeeCount}</span>
                  <span className="rollcall-big-unit">
                    {primaryLive.attendeeCount === 1 ? 'student recorded' : 'students recorded'}
                    {primaryLive.lateCount > 0 ? ` · ${primaryLive.lateCount} late` : ''}
                  </span>
                </div>

                <div className="rollcall-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-cta-xl"
                    onClick={() => onOpenProjector(primaryLive.id)}
                  >
                    <QrCode size={18} strokeWidth={1.75} />
                    <span>Open full-screen projector</span>
                    <ArrowRight size={16} strokeWidth={1.75} className="icon-optical-arrow" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-lg"
                    onClick={() => onOpenSessionDetail(primaryLive.id)}
                  >
                    <Eye size={16} strokeWidth={1.75} />
                    <span>View register</span>
                  </button>
                </div>
              </div>

              <div className="rollcall-stage-preview">
                <div className="rollcall-qr-frame">
                  {stageQrUrl ? (
                    <img
                      src={stageQrUrl}
                      alt={`Live QR code for ${primaryLive.classCode}`}
                      width={196}
                      height={196}
                    />
                  ) : (
                    <span className="skeleton" style={{ width: 196, height: 196 }} />
                  )}
                  <div className="rollcall-qr-bar">
                    <div
                      className="rollcall-qr-bar-fill"
                      style={{ width: `${stageProgressPct}%` }}
                    />
                  </div>
                  <div className="rollcall-qr-caption tnum">
                    <span>{primaryLive.status === 'active' ? `Rotates in ${stageRemainingSec}s` : 'Paused'}</span>
                    <span>{stageQrMeta?.intervalSec || 8}s cycle</span>
                  </div>
                </div>
              </div>
            </section>
          ) : selectedCourse ? (
            /* Ready to Launch — Enlarged Main Feature */
            <section className="rollcall-stage" aria-label="Start live QR attendance">
              <div className="rollcall-stage-copy">
                <h1 className="rollcall-headline">
                  Project a live QR code for{' '}
                  <span className="mono" style={{ color: 'var(--accent)' }}>
                    {selectedCourse.code}
                  </span>
                </h1>

                <p className="rollcall-desc">
                  {selectedCourse.name}
                  {selectedCourse.room ? ` · ${selectedCourse.room}` : ''} · Students scan from their seats with rotating anti-screenshot codes.
                </p>

                {classes.length > 1 && (
                  <div className="rollcall-course-picker">
                    <label htmlFor="stage-course-select" className="rollcall-picker-label">
                      Course
                    </label>
                    <select
                      id="stage-course-select"
                      className="select rollcall-picker-select"
                      value={selectedCourse.id}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.code} — {cls.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="rollcall-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-cta-xl"
                    onClick={() => openStartSessionModal(selectedCourse)}
                  >
                    <Play size={17} strokeWidth={1.75} className="icon-optical-play" />
                    <span>Start live QR attendance</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-lg"
                    onClick={openNewCourseModal}
                  >
                    <Plus size={16} strokeWidth={1.75} />
                    <span>New course</span>
                  </button>
                </div>
              </div>

              <div className="rollcall-stage-preview">
                <div className="rollcall-qr-frame rollcall-qr-frame-idle">
                  {stageQrUrl ? (
                    <img
                      src={stageQrUrl}
                      alt={`QR preview for ${selectedCourse.code}`}
                      width={186}
                      height={186}
                      style={{ opacity: 0.88 }}
                    />
                  ) : (
                    <span className="skeleton" style={{ width: 186, height: 186 }} />
                  )}
                  <div className="rollcall-qr-caption">
                    <span className="mono" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {selectedCourse.code}
                    </span>
                    <span className="tnum">8s rotating QR</span>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            /* Empty Workspace — Single Clear Onboarding Action */
            <section className="rollcall-stage rollcall-stage-empty">
              <div className="rollcall-stage-copy">
                <h1 className="rollcall-headline">
                  Create your first course to run QR roll call
                </h1>
                <p className="rollcall-desc">
                  Save a course code once, display a rotating QR code during lectures, and export attendance registers as CSV.
                </p>
                <div className="rollcall-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-cta-xl"
                    onClick={openNewCourseModal}
                  >
                    <Plus size={18} strokeWidth={1.75} />
                    <span>Add your first course</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Compact Tabular Key Numbers (grouped cleanly by spacing) */}
          <div className="metrics-strip">
            <div className="metric-item">
              <span className="metric-num tnum">{classes.length}</span>
              <span className="metric-label">Courses</span>
            </div>
            <div className="metric-item">
              <span className="metric-num tnum" style={{ color: activeCount > 0 ? 'var(--ok)' : 'var(--ink)' }}>
                {activeCount}
              </span>
              <span className="metric-label">Open now</span>
            </div>
            <div className="metric-item">
              <span className="metric-num tnum">{totalCheckIns}</span>
              <span className="metric-label">Check-ins</span>
            </div>
            <div className="metric-item">
              <span className="metric-num tnum">{sessions.length}</span>
              <span className="metric-label">
                {sessions.length > 0 ? `Sessions (${avgPerSession} avg)` : 'Sessions held'}
              </span>
            </div>
          </div>

          {/* Two-Column Workspace Lists — Grouped by Spacing, Zero Filler Badges */}
          <div className="overview-bottom-grid">
            <section className="overview-section">
              <div className="overview-section-head">
                <h2 className="section-heading">Courses</h2>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => onNavigate?.('/courses')}
                >
                  All courses <ArrowRight size={14} strokeWidth={1.75} />
                </button>
              </div>

              <div className="panel panel-padded">
                {loading ? (
                  <div className="skeleton-list">
                    <span className="skeleton" style={{ height: 48 }} />
                    <span className="skeleton" style={{ height: 48 }} />
                    <span className="skeleton" style={{ height: 48 }} />
                  </div>
                ) : classes.length === 0 ? (
                  <div className="overview-empty">
                    <p>No courses added yet.</p>
                  </div>
                ) : (
                  <div className="overview-list">
                    {classes.slice(0, 5).map((cls) => (
                      <div className="overview-list-row" key={cls.id}>
                        <div style={{ minWidth: 0 }}>
                          <div className="overview-course-line">
                            <span className="course-code-text mono">{cls.code}</span>
                            <span className="overview-course-title">{cls.name}</span>
                          </div>
                          <div className="overview-row-meta tnum">
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
                            <QrCode size={14} strokeWidth={1.75} /> Open QR
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openStartSessionModal(cls)}
                          >
                            <Play size={13} strokeWidth={1.75} className="icon-optical-play" /> Start QR
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="overview-section">
              <div className="overview-section-head">
                <h2 className="section-heading">Recent sessions</h2>
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() => onNavigate?.('/sessions')}
                >
                  All sessions <ArrowRight size={14} strokeWidth={1.75} />
                </button>
              </div>

              <div className="panel panel-padded">
                {loading ? (
                  <div className="skeleton-list">
                    <span className="skeleton" style={{ height: 48 }} />
                    <span className="skeleton" style={{ height: 48 }} />
                    <span className="skeleton" style={{ height: 48 }} />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="overview-empty">
                    <p>Recorded lecture sessions appear here.</p>
                  </div>
                ) : (
                  <div className="overview-list">
                    {sessions.slice(0, 6).map((sess) => (
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              className={`status-dot ${
                                sess.status === 'active'
                                  ? 'live'
                                  : sess.status === 'paused'
                                  ? 'paused'
                                  : ''
                              }`}
                            />
                            <span className="overview-session-title">{sess.title}</span>
                          </div>
                          <div className="overview-row-meta tnum" style={{ paddingLeft: 15 }}>
                            <span className="mono">{sess.classCode}</span>
                            {' · '}
                            {new Date(sess.startedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        <div className="overview-session-right tnum">
                          {sess.lateCount > 0 && (
                            <span className="late-inline">{sess.lateCount} late</span>
                          )}
                          <span className="overview-session-count">{sess.attendeeCount}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ==========================================
          PAGE HEADER FOR COURSES & SESSIONS VIEWS
         ========================================== */}
      {viewMode !== 'overview' && (
        <div className="page-header">
          <h1 className="page-title">
            {viewMode === 'sessions' ? 'Attendance register' : 'Courses'}
          </h1>

          {viewMode === 'courses' ? (
            <button type="button" className="btn btn-primary" onClick={openNewCourseModal}>
              <Plus size={16} strokeWidth={1.75} /> New course
            </button>
          ) : (
            sessions.length > 0 && (
              <a className="btn btn-secondary btn-sm" href={api.getReportRecordsCsvUrl()} download>
                <Download size={15} strokeWidth={1.75} /> Export all CSV
              </a>
            )
          )}
        </div>
      )}

      {/* ==========================================
          COURSES VIEW
         ========================================== */}
      {viewMode === 'courses' && (
        <>
          {primaryLive && (
            <div className="overview-live-strip" style={{ marginBottom: 24 }}>
              <div className="overview-live-left">
                <span
                  className={`status-dot ${primaryLive.status === 'active' ? 'live' : 'paused'}`}
                />
                <span className="mono" style={{ fontWeight: 600 }}>
                  {primaryLive.classCode}
                </span>
                <span style={{ fontWeight: 600 }}>{primaryLive.title}</span>
                <span className="tnum" style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                  {primaryLive.attendeeCount} recorded
                  {primaryLive.room ? ` · ${primaryLive.room}` : ''}
                </span>
              </div>
              <div className="overview-live-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onOpenSessionDetail(primaryLive.id)}
                >
                  <Eye size={14} strokeWidth={1.75} /> Register
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onOpenProjector(primaryLive.id)}
                >
                  <QrCode size={14} strokeWidth={1.75} /> Open QR
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="courses-grid">
              {[1, 2, 3].map((n) => (
                <div className="course-card" key={n}>
                  <span className="skeleton" style={{ height: 18, width: 84 }} />
                  <span className="skeleton" style={{ height: 22, width: '78%' }} />
                  <span className="skeleton" style={{ height: 38, width: '100%' }} />
                </div>
              ))}
            </div>
          ) : classes.length === 0 ? (
            <div className="panel" style={{ padding: 36, textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>No courses saved yet</p>
              <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem', marginBottom: 18 }}>
                Add your first course code to start taking QR attendance.
              </p>
              <button type="button" className="btn btn-primary" onClick={openNewCourseModal}>
                <Plus size={16} strokeWidth={1.75} /> Add course
              </button>
            </div>
          ) : (
            <div className="courses-grid">
              {classes.map((cls) => (
                <div className="course-card" key={cls.id}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span className="course-code-text mono">{cls.code}</span>
                      {cls.activeSessionId && (
                        <span className="status-tag">
                          <span className={`status-dot ${cls.activeSessionStatus === 'active' ? 'live' : 'paused'}`} />
                          {cls.activeSessionStatus === 'active' ? 'Live' : 'Paused'}
                        </span>
                      )}
                    </div>
                    <div className="course-name">{cls.name}</div>
                    <div className="course-meta tnum">
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
                        <QrCode size={15} strokeWidth={1.75} />
                        Open live QR
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-full"
                        onClick={() => openStartSessionModal(cls)}
                      >
                        <Play size={14} strokeWidth={1.75} className="icon-optical-play" />
                        Take attendance
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      onClick={() => openEditCourseModal(cls)}
                      title={`Edit ${cls.code}`}
                      aria-label={`Edit course ${cls.code} ${cls.name}`}
                    >
                      <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      onClick={() => handleDeleteClass(cls)}
                      title={`Delete ${cls.code}`}
                      aria-label={`Delete course ${cls.code} ${cls.name}`}
                    >
                      <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ==========================================
          ATTENDANCE REGISTER / SESSIONS VIEW
         ========================================== */}
      {viewMode === 'sessions' && (
        <>
          <div className="section-header">
            <div style={{ position: 'relative', width: 260 }}>
              <Search
                size={15}
                strokeWidth={1.75}
                color="var(--ink-muted)"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                className="input"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                aria-label="Search attendance sessions"
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
            {loading ? (
              <div style={{ padding: 20 }}>
                <div className="skeleton-list">
                  <span className="skeleton" style={{ height: 46 }} />
                  <span className="skeleton" style={{ height: 46 }} />
                  <span className="skeleton" style={{ height: 46 }} />
                </div>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div style={{ padding: 34, textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
                {sessions.length === 0
                  ? 'No sessions recorded yet. Start a live QR session from Overview or Courses.'
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
                          <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
                            <span className="mono">{sess.classCode}</span> — {sess.className}
                            {sess.room ? ` · ${sess.room}` : ''}
                          </div>
                        </td>
                        <td className="tnum" style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
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
                        <td className="tnum" style={{ fontWeight: 600 }}>
                          <span>{sess.attendeeCount}</span>
                          {sess.lateCount > 0 && (
                            <span className="late-inline" style={{ marginLeft: 8 }}>
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
                                aria-label={`Open live QR projector for ${sess.title}`}
                              >
                                <QrCode size={14} strokeWidth={1.75} aria-hidden="true" /> Open QR
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => onOpenSessionDetail(sess.id)}
                              aria-label={`View attendance register for ${sess.title}`}
                            >
                              <Eye size={14} strokeWidth={1.75} aria-hidden="true" /> View register
                            </button>
                            <a
                              className="btn btn-secondary btn-sm"
                              href={api.getExportCsvUrl(sess.id)}
                              download
                              aria-label={`Download CSV attendance sheet for ${sess.title}`}
                            >
                              <Download size={14} strokeWidth={1.75} aria-hidden="true" /> Download CSV
                            </a>
                            <button
                              type="button"
                              className="btn btn-ghost icon-btn"
                              onClick={() => handleDeleteSession(sess)}
                              title={`Delete ${sess.title}`}
                              aria-label={`Delete attendance session ${sess.title}`}
                            >
                              <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
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
              <h3 className="modal-title">{editingClassId ? 'Edit course' : 'Add course'}</h3>
              <button type="button" className="btn btn-ghost icon-btn" onClick={() => setShowCourseModal(false)}>
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <form onSubmit={handleSaveCourse}>
              <div className="form-group">
                <label className="form-label">Course code *</label>
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
                <label className="form-label">Course title *</label>
                <input
                  className="input"
                  placeholder="Data Structures & Algorithms"
                  value={courseForm.name}
                  onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Room or venue</label>
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
                <button type="submit" className="btn btn-primary" disabled={savingCourse}>
                  {savingCourse && <Loader2 size={15} strokeWidth={1.75} className="spin" />}
                  {savingCourse
                    ? 'Saving...'
                    : editingClassId
                    ? 'Save changes'
                    : 'Save course'}
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
              <h3 className="modal-title">Start live QR attendance</h3>
              <button type="button" className="btn btn-ghost icon-btn" onClick={() => setStartTargetClass(null)}>
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            <form onSubmit={handleStartSession}>
              {classes.length > 1 ? (
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
              ) : (
                <div style={{ marginBottom: 14, fontSize: '0.88rem', color: 'var(--ink-secondary)' }}>
                  <span className="course-code-text mono" style={{ marginRight: 8 }}>
                    {startTargetClass.code}
                  </span>
                  {startTargetClass.name}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Session label</label>
                <input
                  className="input"
                  value={sessionConfig.title}
                  onChange={(e) => setSessionConfig({ ...sessionConfig, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Room or venue</label>
                <input
                  className="input"
                  placeholder="Room 204"
                  value={sessionConfig.room}
                  onChange={(e) => setSessionConfig({ ...sessionConfig, room: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">QR rotation interval</label>
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
                  Screenshots and forwarded links expire once the code rotates.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Mark late arrivals after</label>
                <select
                  className="select"
                  value={sessionConfig.lateAfterMinutes}
                  onChange={(e) =>
                    setSessionConfig({ ...sessionConfig, lateAfterMinutes: e.target.value })
                  }
                >
                  <option value="">Off (all check-ins marked Present)</option>
                  <option value="5">5 minutes</option>
                  <option value="10">10 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="20">20 minutes</option>
                  <option value="30">30 minutes</option>
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
                    <strong>One check-in per phone</strong>
                    <br />
                    <span className="form-hint">
                      Stops one device from checking in twice for an absent classmate.
                    </span>
                  </span>
                </label>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>Classroom GPS radius</div>
                      <div className="form-hint">Require check-in within 75m of this room (HTTPS).</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={captureClassroomGps}
                    >
                      <Crosshair size={14} strokeWidth={1.75} /> {sessionConfig.geoCoords ? 'Update GPS' : 'Set location'}
                    </button>
                  </div>
                  {geoStatus && (
                    <div className="tnum" style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: 6 }}>
                      {geoStatus}
                    </div>
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
                <button type="submit" className="btn btn-primary" disabled={startingSession}>
                  {startingSession ? (
                    <Loader2 size={15} strokeWidth={1.75} className="spin" />
                  ) : (
                    <QrCode size={15} strokeWidth={1.75} />
                  )}
                  {startingSession ? 'Starting...' : 'Display QR code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
