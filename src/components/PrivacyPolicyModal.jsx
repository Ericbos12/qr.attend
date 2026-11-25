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
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Privacy Policy"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div className="confirm-icon">
              <ShieldCheck size={16} />
            </div>
            <h3 className="modal-title">Privacy Policy</h3>
          </div>
          <button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="privacy-content">
          <p className="privacy-updated">Last updated: November 2026</p>

          <p>
            AttendQR is designed to help instructors record and manage classroom attendance securely.
            This Privacy Policy explains what information we collect, how it is used, and your control over your data.
          </p>

          <h4>1. Information We Collect</h4>
          <ul>
            <li>
              <strong>Instructor accounts:</strong> Your full name, email address, and either a securely hashed password
              or verified profile details from Google Sign-In when you choose to continue with Google.
            </li>
            <li>
              <strong>Course &amp; attendance data:</strong> Course codes, titles, rooms, session timestamps, and
              student check-in submissions (Student ID, full name, check-in time, and attendance status).
            </li>
            <li>
              <strong>Anti-fraud &amp; verification signals:</strong> A randomly generated device identifier and signed
              cookie are used to prevent duplicate submissions from the same phone. If an instructor enables optional
              Classroom GPS Radius, the student&apos;s location is checked only at the moment of check-in to confirm
              proximity and is not tracked continuously.
            </li>
            <li>
              <strong>Support reports:</strong> Details you choose to submit through the in-app Report a Problem form.
            </li>
          </ul>

          <h4>2. How We Use Your Information</h4>
          <ul>
            <li>Authenticate instructors and send email verification or password reset codes.</li>
            <li>Generate rotating classroom QR codes and accurately record student attendance.</li>
            <li>Create attendance summaries and CSV exports requested by the instructor.</li>
            <li>Investigate and resolve technical issues reported through the support form.</li>
          </ul>

          <h4>3. Data Security</h4>
          <p>
            Passwords are never stored in plain text — they are protected with one-way salted cryptographic hashing
            (scrypt). Live QR codes rotate continuously and exchange scans for short-lived, single-use device tickets.
          </p>

          <h4>4. Third-Party Services</h4>
          <p>
            We do not sell or rent your personal data. Data is only processed by essential infrastructure services
            needed to run AttendQR (such as Google OAuth when you sign in with Google, email delivery for verification
            codes, and database hosting).
          </p>

          <h4>5. Your Rights &amp; Account Deletion</h4>
          <p>
            You can edit or delete your courses, attendance sessions, and individual student records at any time.
            You may also permanently delete your entire instructor account — along with all saved courses, sessions,
            and attendance records — directly from your account menu inside the app.
          </p>

          <h4>6. Questions or Concerns</h4>
          <p>
            If you have any questions about this Privacy Policy or experience an issue, please sign in and use the
            in-app <strong>Report a Problem</strong> form to reach our support team.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
