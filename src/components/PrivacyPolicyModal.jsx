import React, { useEffect } from 'react';
import { X, ShieldCheck } from 'lucide-react';

export default function PrivacyPolicyModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-animate"
        style={{ maxWidth: 580 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-modal-title"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div className="confirm-icon" aria-hidden="true">
              <ShieldCheck size={16} strokeWidth={1.75} />
            </div>
            <h2 id="privacy-modal-title" className="modal-title">
              Privacy Policy
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            onClick={onClose}
            aria-label="Close privacy policy dialog"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="privacy-content">
          <p className="privacy-updated">Effective: November 2026 · Service Operator: AttendQR</p>

          <p>
            AttendQR is a classroom attendance register operated to help instructors verify live in-class
            attendance with minimal personal data. We collect only what is strictly necessary to run the service.
          </p>

          <h3>1. Only Necessary Data Collected</h3>
          <ul>
            <li>
              <strong>Instructor accounts:</strong> Full name, email address, and either a one-way salted
              cryptographic password hash (scrypt) or verified Google account name/email when you choose{' '}
              <strong>Continue with Google</strong>.
            </li>
            <li>
              <strong>Course &amp; attendance records:</strong> Course code, course title, lecture room,
              session timestamps, and student check-in entries (Student ID, full name, timestamp, and
              Present/Late status).
            </li>
            <li>
              <strong>Anti-fraud signals (minimized):</strong> A random device identifier prevents duplicate
              check-ins from one phone. Student IP addresses are used strictly in memory for rate limiting and
              are <strong>not</strong> stored in attendance records. If an instructor enables optional Classroom
              GPS Radius, coordinates are checked once in memory at check-in and are never stored or tracked.
            </li>
            <li>
              <strong>Support reports:</strong> Only the subject and message you intentionally submit via
              Report a Problem.
            </li>
          </ul>

          <h3>2. Lawful Basis &amp; Applicable Data Protection Laws</h3>
          <p>
            We process personal data in alignment with the{' '}
            <strong>Ghana Data Protection Act, 2012 (Act 843)</strong>, the{' '}
            <strong>EU/UK GDPR</strong>, and educational privacy best practices (including FERPA data
            minimization principles):
          </p>
          <ul>
            <li>
              <strong>Consent:</strong> Instructor account registration, optional Google Sign-In, and student
              check-in submission.
            </li>
            <li>
              <strong>Educational administration &amp; integrity:</strong> Recording accurate class
              attendance and preventing fraudulent proxy check-ins.
            </li>
          </ul>

          <h3>3. Third-Party Services</h3>
          <p>
            AttendQR contains <strong>no advertising trackers, analytics pixels, or third-party social embeds</strong>.
            External services are limited strictly to Google Sign-In (only when you click Continue with Google),
            Google Fonts, and transactional email delivery for verification/reset codes and support reports.
          </p>

          <h3>4. Your Rights &amp; Data Control</h3>
          <p>
            You have the right to access, correct, export (CSV), or permanently delete your data at any time.
            Instructors can edit or delete any course, session, or student entry directly, and can permanently
            delete their entire account and all associated attendance records from the Account menu.
          </p>

          <h3>5. Service Operator &amp; Contact</h3>
          <p>
            <strong>Service:</strong> AttendQR Classroom Attendance Platform
            <br />
            <strong>Support &amp; Data Protection Contact:</strong>{' '}
            <a href="mailto:attend.qrsupport@gmail.com" className="policy-mail-link">
              attend.qrsupport@gmail.com
            </a>
            <br />
            Signed-in instructors can also submit requests via the in-app <strong>Report a problem</strong> form.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close policy
          </button>
        </div>
      </div>
    </div>
  );
}
