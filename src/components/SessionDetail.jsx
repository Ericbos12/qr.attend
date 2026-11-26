import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  QrCode,
  Search,
  Trash2,
  UserPlus,
  Play,
  Printer,
  X,
} from 'lucide-react';
import { api } from '../api';
import { useFeedback } from './UiFeedback';

export default function SessionDetail({ sessionId, onBack, onOpenProjector, onSessionLoaded }) {
  const { toast, confirm } = useFeedback();
  const [session, setSession] = useState(null);
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [realtimeMode, setRealtimeMode] = useState(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ studentId: '', studentName: '', status: 'present', note: '' });

  async function load() {
    try {
      setError('');
      const data = await api.getSession(sessionId);
      setSession(data.session);
      setRecords(data.records);
      setRealtimeMode(data.realtimeMode === 'poll' ? 'poll' : 'sse');
      onSessionLoaded?.(data.session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  // Live updates when viewing an open/paused register (SSE locally, 3s polling on serverless)
  useEffect(() => {
    if (!session || session.status === 'ended' || !realtimeMode) return;

    if (realtimeMode === 'poll') {
      let active = true;
      const poll = async () => {
        if (!active || document.visibilityState === 'hidden') return;
        try {
          const data = await api.getSession(sessionId);
          if (!active) return;
          setSession(data.session);
          setRecords(data.records);
        } catch {}
      };
      const timer = setInterval(poll, 3000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }

    const es = new EventSource(api.getStreamUrl(sessionId));
    es.addEventListener('use_polling', () => {
      es.close();
      setRealtimeMode('poll');
    });
    es.addEventListener('checkin', (evt) => {
      try {
        const rec = JSON.parse(evt.data);
        setRecords((prev) => (prev.some((r) => r.id === rec.id) ? prev : [rec, ...prev]));
      } catch {}
    });
    es.addEventListener('record_updated', (evt) => {
      try {
        const rec = JSON.parse(evt.data);
        setRecords((prev) => prev.map((r) => (r.id === rec.id ? rec : r)));
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
        setSession(JSON.parse(evt.data));
      } catch {}
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setRealtimeMode('poll');
      }
    };
    return () => es.close();
  }, [sessionId, session?.status, realtimeMode]);

  async function handleManualAdd(e) {
    e.preventDefault();
    try {
      setError('');
      const { record } = await api.manualCheckIn(sessionId, addForm);
      setRecords((prev) => (prev.some((r) => r.id === record.id) ? prev : [record, ...prev]));
      setAddForm({ studentId: '', studentName: '', status: 'present', note: '' });
      setShowAdd(false);
      toast(`Added ${record.studentName} to register`, 'success');
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
  }

  async function handleToggleStatus(record) {
    const nextStatus = record.status === 'late' ? 'present' : 'late';
    try {
      const { record: updated } = await api.updateRecord(sessionId, record.id, { status: nextStatus });
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast(
        `${record.studentName} marked ${nextStatus === 'late' ? 'Late' : 'Present'}`,
        'info'
      );
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
  }

  async function handleRemoveRecord(record) {
    const ok = await confirm({
      title: 'Remove Attendance Record',
      message: `Remove ${record.studentName} (${record.studentId}) from this session register?`,
      confirmLabel: 'Remove Record',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removeRecord(sessionId, record.id);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      toast(`Removed ${record.studentName}`, 'info');
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
  }

  async function handleReopen() {
    try {
      const { session: updated } = await api.updateSession(sessionId, { status: 'active' });
      setSession(updated);
      toast('Session reopened', 'success');
      onOpenProjector(sessionId);
    } catch (err) {
      setError(err.message);
      toast(err.message, 'error');
    }
  }

  const filtered = records.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.studentName.toLowerCase().includes(q) ||
      r.studentId.toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q) ||
      (r.note || '').toLowerCase().includes(q)
    );
  });

  const lateCount = records.filter((r) => r.status === 'late').length;
  const onTimeCount = records.length - lateCount;
  const manualCount = records.filter((r) => r.method === 'manual').length;

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Top Action Strip */}
      <div className="page-header no-print" style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back to Register
        </button>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {session && session.status !== 'ended' ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenProjector(sessionId)}>
              <QrCode size={14} /> Open QR Display
            </button>
          ) : (
            session && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleReopen}>
                <Play size={14} /> Reopen Session
              </button>
            )
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
          <a className="btn btn-secondary btn-sm" href={api.getExportCsvUrl(sessionId)} download>
            <Download size={14} /> Export CSV
          </a>
        </div>
      </div>

      {loading || !session ? (
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="skeleton" style={{ height: 22, width: '40%' }} />
            <span className="skeleton" style={{ height: 64, width: '100%' }} />
            <span className="skeleton" style={{ height: 42, width: '100%' }} />
            <span className="skeleton" style={{ height: 42, width: '90%' }} />
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span className="course-code-text mono">{session.classCode}</span>
              <span className="status-tag">
                <span
                  className={`status-dot ${
                    session.status === 'active' ? 'live' : session.status === 'paused' ? 'paused' : ''
                  }`}
                />
                {session.status === 'active' ? 'Open' : session.status === 'paused' ? 'Paused' : 'Closed'}
              </span>
              {session.lateAfterMinutes && (
                <span className="tnum" style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                  · Late after {session.lateAfterMinutes}m
                </span>
              )}
            </div>
            <h1 className="page-title">{session.title}</h1>
            <p className="tnum" style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', marginTop: 4 }}>
              {session.className} {session.room ? `· ${session.room}` : ''} · Started{' '}
              {new Date(session.startedAt).toLocaleString()}
            </p>
          </div>

          <div className="summary-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="summary-cell">
              <div className="summary-label">Total Recorded</div>
              <div className="summary-value">{records.length}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">On Time</div>
              <div className="summary-value" style={{ color: 'var(--ok)' }}>
                {onTimeCount}
              </div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Late</div>
              <div className="summary-value" style={{ color: lateCount > 0 ? 'var(--warn)' : 'var(--ink)' }}>
                {lateCount}
              </div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Manual Entries</div>
              <div className="summary-value">{manualCount}</div>
            </div>
          </div>

          <div className="section-header no-print">
            <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
              <Search
                size={15}
                color="var(--ink-muted)"
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                className="input"
                style={{ paddingLeft: 34 }}
                placeholder="Filter by name, ID, or status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button type="button" className="btn btn-dark" onClick={() => setShowAdd(true)}>
              <UserPlus size={15} /> Add Student
            </button>
          </div>

          <div className="panel">
            {filtered.length === 0 ? (
              <div style={{ padding: 34, textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
                {records.length === 0 ? 'No students recorded for this session yet.' : 'No matching records.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student ID</th>
                      <th>Full Name</th>
                      <th>Status</th>
                      <th>Method</th>
                      <th>Time Recorded</th>
                      <th className="no-print" style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((rec, idx) => (
                      <tr key={rec.id}>
                        <td className="tnum" style={{ color: 'var(--ink-muted)' }}>
                          {filtered.length - idx}
                        </td>
                        <td className="mono" style={{ fontWeight: 600 }}>
                          {rec.studentId}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{rec.studentName}</div>
                          {rec.note && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>{rec.note}</div>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`status-toggle-btn ${rec.status === 'late' ? 'is-late' : 'is-present'}`}
                            onClick={() => handleToggleStatus(rec)}
                            title="Click to switch Present / Late"
                          >
                            {rec.status === 'late' ? 'Late' : 'Present'}
                          </button>
                        </td>
                        <td style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                          {rec.method === 'qr' ? 'QR scan' : 'Manual'}
                        </td>
                        <td className="tnum" style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                          {new Date(rec.checkedInAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="no-print" style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-ghost icon-btn"
                            onClick={() => handleRemoveRecord(rec)}
                            title="Remove record"
                          >
                            <Trash2 size={15} strokeWidth={1.75} />
                          </button>
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

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal modal-animate" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Manual Attendance Entry</h3>
              <button type="button" className="btn btn-ghost icon-btn" onClick={() => setShowAdd(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleManualAdd}>
              <div className="form-group">
                <label className="form-label">Student ID *</label>
                <input
                  className="input mono"
                  placeholder="STU-2026-041"
                  value={addForm.studentId}
                  onChange={(e) => setAddForm({ ...addForm, studentId: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  className="input"
                  placeholder="Kwame Boateng"
                  value={addForm.studentName}
                  onChange={(e) => setAddForm({ ...addForm, studentName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="select"
                  value={addForm.status}
                  onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                >
                  <option value="present">Present (On Time)</option>
                  <option value="late">Late</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Note (Optional)</label>
                <input
                  className="input"
                  placeholder="Phone unavailable"
                  value={addForm.note}
                  onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add to Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
