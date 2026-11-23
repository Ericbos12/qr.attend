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

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ studentId: '', studentName: '', note: '' });

  async function load() {
    try {
      setError('');
      const data = await api.getSession(sessionId);
      setSession(data.session);
      setRecords(data.records);
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

  // Live SSE updates when viewing an open/paused register
  useEffect(() => {
    if (!session || session.status === 'ended') return;
    const es = new EventSource(api.getStreamUrl(sessionId));
    es.addEventListener('checkin', (evt) => {
      try {
        const rec = JSON.parse(evt.data);
        setRecords((prev) => (prev.some((r) => r.id === rec.id) ? prev : [rec, ...prev]));
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
    return () => es.close();
  }, [sessionId, session?.status]);

  async function handleManualAdd(e) {
    e.preventDefault();
    try {
      setError('');
      const { record } = await api.manualCheckIn(sessionId, addForm);
      setRecords((prev) => (prev.some((r) => r.id === record.id) ? prev : [record, ...prev]));
      setAddForm({ studentId: '', studentName: '', note: '' });
      setShowAdd(false);
      toast(`Added ${record.studentName} to register`, 'success');
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
      (r.note || '').toLowerCase().includes(q)
    );
  });

  const qrCount = records.filter((r) => r.method === 'qr').length;
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
        <div className="panel" style={{ padding: 34, textAlign: 'center', color: 'var(--ink-muted)' }}>
          Loading register...
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span className="course-code-label mono">{session.classCode}</span>
              <span className="status-tag">
                <span
                  className={`status-dot ${
                    session.status === 'active' ? 'live' : session.status === 'paused' ? 'paused' : ''
                  }`}
                />
                {session.status === 'active' ? 'Open' : session.status === 'paused' ? 'Paused' : 'Closed'}
              </span>
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.015em' }}>{session.title}</h1>
            <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', marginTop: 2 }}>
              {session.className} {session.room ? `· ${session.room}` : ''} · Started{' '}
              {new Date(session.startedAt).toLocaleString()}
            </p>
          </div>

          <div className="summary-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="summary-cell">
              <div className="summary-label">Total Present</div>
              <div className="summary-value">{records.length}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">QR Scans</div>
              <div className="summary-value">{qrCount}</div>
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
                placeholder="Filter by name or ID..."
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
                      <th>Method</th>
                      <th>Time Recorded</th>
                      <th className="no-print" style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((rec, idx) => (
                      <tr key={rec.id}>
                        <td className="mono" style={{ color: 'var(--ink-muted)' }}>
                          {filtered.length - idx}
                        </td>
                        <td className="mono" style={{ fontWeight: 600 }}>
                          {rec.studentId}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{rec.studentName}</div>
                          {rec.note && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{rec.note}</div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)' }}>
                          {rec.method === 'qr' ? 'QR Scan' : 'Manual'}
                        </td>
                        <td className="mono" style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
                          {new Date(rec.checkedInAt).toLocaleTimeString()}
                        </td>
                        <td className="no-print" style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-ghost icon-btn"
                            onClick={() => handleRemoveRecord(rec)}
                            title="Remove Record"
                          >
                            <Trash2 size={14} />
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
