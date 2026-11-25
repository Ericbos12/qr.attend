import React, { useEffect, useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import {
  api,
  getOrCreateDeviceId,
  getSavedStudentProfile,
  saveStudentProfile,
} from '../api';
import BrandLogo from './BrandLogo';
import PrivacyPolicyModal from './PrivacyPolicyModal';

export default function StudentCheckIn({ onGoHome }) {
  const saved = getSavedStudentProfile();
  const [studentId, setStudentId] = useState(saved?.studentId || '');
  const [studentName, setStudentName] = useState(saved?.studentName || '');
  const [hasSavedProfile, setHasSavedProfile] = useState(Boolean(saved?.studentId || saved?.studentName));
  const [studentConsent, setStudentConsent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const [claimState, setClaimState] = useState('verifying'); // 'verifying' | 'ready' | 'blocked'
  const [ticketId, setTicketId] = useState('');
  const [ticketExpiresAt, setTicketExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [blockReason, setBlockReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  // Immediately exchange live QR token for a single-use device-bound ticket,
  // and strip query parameters from the URL bar so the link cannot be shared.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get('s') || '';
    const urlToken = params.get('t') || '';

    if (window.location.search) {
      window.history.replaceState({}, '', '/checkin');
    }

    if (!urlSessionId || !urlToken) {
      setClaimState('blocked');
      setBlockReason(
        'Direct links are not accepted. Please scan the live QR code currently displayed in the classroom.'
      );
      return;
    }

    let active = true;
    const deviceId = getOrCreateDeviceId();

    api
      .claimQrScan({ sessionId: urlSessionId, token: urlToken, deviceId })
      .then((res) => {
        if (!active) return;
        setTicketId(res.ticketId);
        setTicketExpiresAt(res.expiresAt);
        setSessionInfo(res.session);
        setClaimState('ready');
      })
      .catch((err) => {
        if (!active) return;
        setClaimState('blocked');
        setBlockReason(err.message);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (claimState !== 'ready' || !ticketExpiresAt || receipt) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((ticketExpiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setClaimState('blocked');
        setBlockReason('Your check-in window expired. Please scan the live QR code on screen again.');
      }
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [claimState, ticketExpiresAt, receipt]);

  function getBrowserCoords() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Location services are not supported by this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error('Location permission is required to verify classroom presence.')),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const deviceId = getOrCreateDeviceId();
      let coords = null;
      if (sessionInfo?.geoLockRequired) {
        coords = await getBrowserCoords();
      }

      const data = await api.studentCheckIn({
        ticketId,
        studentId: studentId.trim(),
        studentName: studentName.trim(),
        deviceId,
        coords,
      });

      saveStudentProfile({
        studentId: studentId.trim(),
        studentName: studentName.trim(),
      });
      setReceipt(data);
    } catch (err) {
      setError(err.message);
      if (err.code === 'TICKET_EXPIRED' || err.code === 'TICKET_USED' || err.code === 'DEVICE_MISMATCH') {
        setClaimState('blocked');
        setBlockReason(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="student-page">
      <div className="student-card">
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 16,
            marginBottom: 18,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <BrandLogo size={28} />
          <button
            type="button"
            onClick={onGoHome}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-muted)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Instructor Portal
          </button>
        </div>

        {/* Receipt View */}
        {receipt ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--ok-soft)',
                  color: 'var(--ok)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={16} strokeWidth={2.5} />
              </div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {receipt.alreadyCheckedIn ? 'Already Recorded' : 'Attendance Recorded'}
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>{receipt.message}</p>

            <div className="receipt-table">
              <div className="receipt-row">
                <span style={{ color: 'var(--ink-muted)' }}>Course</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>
                  <span className="mono">{receipt.classInfo?.code}</span> — {receipt.classInfo?.name}
                </span>
              </div>
              <div className="receipt-row">
                <span style={{ color: 'var(--ink-muted)' }}>Student Name</span>
                <span style={{ fontWeight: 600 }}>{receipt.record?.studentName}</span>
              </div>
              <div className="receipt-row">
                <span style={{ color: 'var(--ink-muted)' }}>Student ID</span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {receipt.record?.studentId}
                </span>
              </div>
              <div className="receipt-row">
                <span style={{ color: 'var(--ink-muted)' }}>Status</span>
                <span className={receipt.record?.status === 'late' ? 'badge-late' : 'badge-present'}>
                  {receipt.record?.status === 'late' ? 'Late' : 'Present'}
                </span>
              </div>
              <div className="receipt-row">
                <span style={{ color: 'var(--ink-muted)' }}>Recorded At</span>
                <span className="mono">{new Date(receipt.record?.checkedInAt).toLocaleTimeString()}</span>
              </div>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
              You may close this tab now.
            </p>
          </div>
        ) : claimState === 'verifying' ? (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
            Verifying QR code...
          </div>
        ) : claimState === 'blocked' ? (
          <div>
            <div className="alert alert-error" style={{ marginBottom: 14 }}>
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Scan Required</div>
                <div>{blockReason}</div>
              </div>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', lineHeight: 1.55 }}>
              Attendance codes rotate every few seconds and are locked to the scanning device. Point your phone camera directly at the live QR code displayed by your instructor.
            </p>
          </div>
        ) : (
          <>
            {sessionInfo && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span className="course-code-label mono">{sessionInfo.classCode}</span>
                  <span className="mono" style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
                    {secondsLeft}s remaining
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginTop: 4 }}>{sessionInfo.className}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginTop: 2 }}>
                  {sessionInfo.teacherName}
                  {sessionInfo.room ? ` · ${sessionInfo.room}` : ''}
                </div>
              </div>
            )}

            {error && (
              <div className="alert alert-error" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="student-id-input" className="form-label">
                  Student ID *
                </label>
                <input
                  id="student-id-input"
                  className="input mono"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  placeholder="Enter your Student ID"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="form-group">
                <label htmlFor="student-name-input" className="form-label">
                  Full Name *
                </label>
                <input
                  id="student-name-input"
                  className="input"
                  type="text"
                  autoCapitalize="words"
                  enterKeyHint="done"
                  placeholder="Enter your full name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

              <label htmlFor="student-consent" className="auth-consent-row">
                <input
                  id="student-consent"
                  type="checkbox"
                  checked={studentConsent}
                  onChange={(e) => setStudentConsent(e.target.checked)}
                  required
                />
                <span>
                  I consent to recording my Student ID, name, and check-in time for this class under the{' '}
                  <button
                    type="button"
                    className="text-link-btn"
                    style={{ fontSize: 'inherit', fontWeight: 600, verticalAlign: 'baseline' }}
                    onClick={() => setShowPrivacy(true)}
                  >
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>

              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                style={{ marginTop: 10 }}
                disabled={submitting || !studentConsent}
              >
                {submitting ? 'Recording attendance...' : 'Confirm my attendance'}
              </button>

              {hasSavedProfile && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button
                    type="button"
                    className="text-link-btn"
                    style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--ink-muted)' }}
                    onClick={() => {
                      localStorage.removeItem('attendqr_student_profile');
                      setStudentId('');
                      setStudentName('');
                      setHasSavedProfile(false);
                    }}
                  >
                    Clear saved details on this phone
                  </button>
                </div>
              )}
            </form>
          </>
        )}
      </div>

      <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
