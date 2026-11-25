import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Pause,
  Play,
  Square,
  UserPlus,
  Download,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { api } from '../api';
import { useFeedback } from './UiFeedback';
import BrandLogo from './BrandLogo';

export default function ProjectorView({ sessionId, onBack, onOpenDetail }) {
  const { toast, confirm } = useFeedback();
  const [session, setSession] = useState(null);
  const [records, setRecords] = useState([]);
  const [qrState, setQrState] = useState(null);
  const [lanOrigin, setLanOrigin] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [remainingSec, setRemainingSec] = useState(8);
  const [progressPct, setProgressPct] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [latestId, setLatestId] = useState('');

  // Teacher override for a student physically in class without a working phone
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualForm, setManualForm] = useState({ studentId: '', studentName: '' });
  const [manualMsg, setManualMsg] = useState('');

  const lastTokenRef = useRef('');
  const refreshingRef = useRef(false);
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const sessData = await api.getSession(sessionId);
        if (!active) return;
        setSession(sessData.session);
        setRecords(sessData.records);
        setQrState(sessData.qr);
        if (sessData.lanOrigin) setLanOrigin(sessData.lanOrigin);
        if (sessData.qr?.serverTime) {
          serverOffsetRef.current = sessData.qr.serverTime - Date.now();
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Real-time SSE listener
  useEffect(() => {
    const es = new EventSource(api.getStreamUrl(sessionId));
    es.addEventListener('checkin', (evt) => {
      try {
        const record = JSON.parse(evt.data);
        setRecords((prev) => {
          if (prev.some((r) => r.id === record.id)) return prev;
          setLatestId(record.id);
          return [record, ...prev];
        });
      } catch {}
    });
    es.addEventListener('record_updated', (evt) => {
      try {
        const record = JSON.parse(evt.data);
        setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));
      } catch {}
    });
    es.addEventListener('record_removed', (evt) => {
      try {
        const { recordId } = JSON.parse(evt.data);
        setRecords((prev) => prev.filter((r) => r.id !== recordId));
      } catch {}
    });
    es.addEventListener('session_update', (evt) => {
      try {
        const updated = JSON.parse(evt.data);
        setSession(updated);
      } catch {}
    });
    return () => es.close();
  }, [sessionId]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Rotating QR refresh loop (clock-skew safe)
  useEffect(() => {
    if (!session || session.status === 'ended') return;

    const refreshQr = async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const data = await api.getSessionQr(sessionId);
        if (data.qr?.serverTime) {
          serverOffsetRef.current = data.qr.serverTime - Date.now();
        }
        setQrState(data.qr);
        if (data.lanOrigin) setLanOrigin(data.lanOrigin);
      } catch {
      } finally {
        refreshingRef.current = false;
      }
    };

    const tick = setInterval(() => {
      if (!qrState?.expiresAt || !qrState.intervalSec) {
        refreshQr();
        return;
      }
      const estimatedServerNow = Date.now() + serverOffsetRef.current;
      const leftMs = qrState.expiresAt - estimatedServerNow;
      if (leftMs <= 120) {
        setProgressPct(0);
        setRemainingSec(0);
        refreshQr();
      } else {
        setRemainingSec(Math.ceil(leftMs / 1000));
        setProgressPct(Math.max(0, Math.min(100, (leftMs / (qrState.intervalSec * 1000)) * 100)));
      }
    }, 150);

    return () => clearInterval(tick);
  }, [sessionId, session?.status, qrState?.expiresAt, qrState?.intervalSec]);

  const isLocalHost =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const qrOrigin = isLocalHost && lanOrigin ? lanOrigin : window.location.origin;

  const scanUrl = qrState
    ? `${qrOrigin}/checkin?s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(qrState.token)}`
    : '';

  useEffect(() => {
    if (!scanUrl) return;
    if (lastTokenRef.current === scanUrl && qrDataUrl) return;
    lastTokenRef.current = scanUrl;

    QRCode.toDataURL(scanUrl, {
      width: 900,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f2342', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => {});
  }, [scanUrl]);

  async function togglePause() {
    if (!session) return;
    const nextStatus = session.status === 'active' ? 'paused' : 'active';
    const { session: updated } = await api.updateSession(session.id, { status: nextStatus });
    setSession(updated);
    toast(nextStatus === 'paused' ? 'Attendance paused' : 'Attendance resumed', 'info');
  }

  async function endSession() {
    if (!session) return;
    const ok = await confirm({
      title: 'Close Attendance Session',
      message: 'Students will no longer be able to scan this QR code once closed.',
      confirmLabel: 'Close Session',
      danger: true,
    });
    if (!ok) return;
    const { session: updated } = await api.updateSession(session.id, { status: 'ended' });
    setSession(updated);
    toast('Attendance session closed', 'info');
    onOpenDetail(session.id);
  }

  async function handleManualAdd(e) {
    e.preventDefault();
    setManualMsg('');
    try {
      await api.manualCheckIn(sessionId, manualForm);
      setManualForm({ studentId: '', studentName: '' });
      setManualMsg('Student recorded.');
      toast('Student added manually', 'success');
      setTimeout(() => setManualMsg(''), 2500);
    } catch (err) {
      setManualMsg(err.message);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  if (loading) {
    return (
      <div className="projector-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#93b4d8', fontSize: '0.9rem' }}>Loading QR session...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="projector-page" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="alert alert-error">{error || 'Session not found'}</div>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back to Courses
        </button>
      </div>
    );
  }

  return (
    <div className="projector-page">
      {/* Clean Top Bar */}
      <div className="projector-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" className="btn btn-sm proj-btn" onClick={onBack}>
            <ArrowLeft size={14} /> Courses
          </button>
          <BrandLogo size={28} dark showText={false} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: '0.82rem', color: '#93c5fd', fontWeight: 600 }}>
                {session.classCode}
              </span>
              <span style={{ fontWeight: 600, fontSize: '0.98rem' }}>{session.title}</span>
              <span style={{ fontSize: '0.76rem', color: session.status === 'active' ? '#4ade80' : '#f59e0b' }}>
                • {session.status === 'active' ? 'Open' : session.status === 'paused' ? 'Paused' : 'Closed'}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#93b4d8' }}>
              {session.className} {session.room ? `· ${session.room}` : ''}
              {session.lateAfterMinutes ? ` · Late after ${session.lateAfterMinutes}m` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm proj-btn icon-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen mode'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {session.status !== 'ended' && (
            <>
              <button type="button" className="btn btn-sm proj-btn" onClick={togglePause}>
                {session.status === 'active' ? (
                  <>
                    <Pause size={13} /> Pause
                  </>
                ) : (
                  <>
                    <Play size={13} /> Resume
                  </>
                )}
              </button>
              <button type="button" className="btn btn-danger-solid btn-sm" onClick={endSession}>
                <Square size={12} /> Close Session
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Projector Body: Pure QR Stage + Live Roll Call */}
      <div className="projector-body">
        <div className="projector-stage">
          <div style={{ marginBottom: 14 }}>
            <h1 style={{ fontSize: 'clamp(1.45rem, 2.8vw, 2rem)', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 4 }}>
              Scan to Record Attendance
            </h1>
            <p style={{ color: '#bfdbfe', fontSize: '0.94rem' }}>
              Point your phone camera at the QR code and submit your Student ID and full name.
            </p>
          </div>

          <div className="qr-frame">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Live attendance QR code for ${session.classCode} — ${session.title}`}
              />
            ) : (
              <div
                style={{
                  width: 'min(620px, 68vh, 84vw)',
                  height: 'min(620px, 68vh, 84vw)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#6b7280',
                }}
              >
                Generating QR...
              </div>
            )}

            {session.status !== 'active' && (
              <div className="qr-paused-overlay">
                <div style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                  {session.status === 'paused' ? 'Attendance Paused' : 'Session Closed'}
                </div>
                {session.status === 'paused' && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={togglePause}>
                    <Play size={13} /> Resume
                  </button>
                )}
              </div>
            )}

            {session.status === 'active' && (
              <div style={{ width: '100%' }}>
                <div className="countdown-track">
                  <div className="countdown-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 8,
                    fontSize: '0.76rem',
                    color: '#4b5563',
                  }}
                >
                  <span>Rotates every {qrState?.intervalSec || 8}s</span>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {String(remainingSec).padStart(2, '0')}s
                  </span>
                </div>
              </div>
            )}
          </div>

          <p style={{ marginTop: 14, fontSize: '0.8rem', color: '#93b4d8', maxWidth: 460 }}>
            Live QR scan only — screenshots and forwarded links expire automatically and cannot be reused.
          </p>
          {isLocalHost && lanOrigin && (
            <p className="mono" style={{ marginTop: 6, fontSize: '0.74rem', color: '#bfdbfe', opacity: 0.85 }}>
              Phone scan target: {lanOrigin} (connect phone to same Wi-Fi)
            </p>
          )}
        </div>

        {/* Right: Live Roll Call Sidebar */}
        <aside className="projector-sidebar">
          <div className="sidebar-header">
            <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>Live Roll Call</span>
            <span className="mono" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#93c5fd' }}>
              {records.length}
            </span>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #1e355c',
              display: 'flex',
              gap: 8,
            }}
          >
            <button
              type="button"
              className="btn btn-sm btn-full proj-btn"
              onClick={() => setShowManualAdd((v) => !v)}
            >
              <UserPlus size={13} /> Manual Entry
            </button>
            <a className="btn btn-sm proj-btn" href={api.getExportCsvUrl(sessionId)} download>
              <Download size={13} /> CSV
            </a>
          </div>

          {showManualAdd && (
            <form
              onSubmit={handleManualAdd}
              style={{
                padding: 12,
                background: '#162b4f',
                borderBottom: '1px solid #1e355c',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <input
                className="input mono"
                placeholder="Student ID"
                style={{ background: '#0c1930', color: '#fff', borderColor: '#2c4a7a', padding: '7px 10px', fontSize: '0.84rem' }}
                value={manualForm.studentId}
                onChange={(e) => setManualForm({ ...manualForm, studentId: e.target.value })}
                required
              />
              <input
                className="input"
                placeholder="Full Name"
                style={{ background: '#0c1930', color: '#fff', borderColor: '#2c4a7a', padding: '7px 10px', fontSize: '0.84rem' }}
                value={manualForm.studentName}
                onChange={(e) => setManualForm({ ...manualForm, studentName: e.target.value })}
                required
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Add to Register
              </button>
              {manualMsg && <div style={{ fontSize: '0.78rem', color: '#93c5fd' }}>{manualMsg}</div>}
            </form>
          )}

          <div className="sidebar-list">
            {records.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#88a8cc', padding: '44px 16px', fontSize: '0.84rem' }}>
                Waiting for first scan...
              </div>
            ) : (
              records.map((rec) => (
                <div
                  className={`attendee-row ${rec.id === latestId ? 'attendee-new' : ''}`}
                  key={rec.id}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: '0.88rem',
                        color: '#ffffff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rec.studentName}
                    </div>
                    <div className="mono" style={{ fontSize: '0.76rem', color: '#93b4d8', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{rec.studentId}</span>
                      {rec.status === 'late' && (
                        <span
                          style={{
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 4,
                            background: 'rgba(245, 158, 11, 0.2)',
                            color: '#fbbf24',
                          }}
                        >
                          LATE
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: '0.74rem', color: '#88a8cc', flexShrink: 0 }}>
                    {new Date(rec.checkedInAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
