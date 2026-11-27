import React, { useEffect } from 'react';
import { QrCode, BookOpen, Download, ShieldCheck, ArrowRight, X } from 'lucide-react';
import BrandLogo from './BrandLogo';

export default function WelcomeOnboardingModal({ open, teacherName, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const firstName = String(teacherName || '').trim().split(/\s+/)[0] || 'there';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-animate welcome-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
      >
        <div className="welcome-modal-top">
          <BrandLogo size={30} />
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            onClick={onClose}
            aria-label="Close welcome guide"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="welcome-modal-hero">
          <span className="welcome-badge">Welcome to AttendQR</span>
          <h2 id="welcome-modal-title" className="welcome-modal-title">
            Hi {firstName}, here&apos;s what AttendQR does for your classes
          </h2>
          <p className="welcome-modal-sub">
            AttendQR is a real-time QR code classroom attendance platform. Instead of passing paper
            sign-in sheets around class, you project a secure rotating QR code and watch verified
            student check-ins arrive live.
          </p>
        </div>

        <div className="welcome-steps">
          <div className="welcome-step">
            <div className="welcome-step-icon">
              <BookOpen size={17} strokeWidth={1.9} />
            </div>
            <div>
              <strong>1. Add your courses</strong>
              <p>Save your course codes, titles, and rooms once so starting a lecture takes one click.</p>
            </div>
          </div>

          <div className="welcome-step">
            <div className="welcome-step-icon">
              <QrCode size={17} strokeWidth={1.9} />
            </div>
            <div>
              <strong>2. Project a rotating QR code</strong>
              <p>
                Codes refresh automatically every 10–30 seconds. Students scan with their phone camera
                (no app or student login required) and check in immediately.
              </p>
            </div>
          </div>

          <div className="welcome-step">
            <div className="welcome-step-icon">
              <ShieldCheck size={17} strokeWidth={1.9} />
            </div>
            <div>
              <strong>3. Prevent proxy check-ins automatically</strong>
              <p>
                One-device-per-session locking and optional classroom GPS radius ensure only students
                physically present can check in.
              </p>
            </div>
          </div>

          <div className="welcome-step">
            <div className="welcome-step-icon">
              <Download size={17} strokeWidth={1.9} />
            </div>
            <div>
              <strong>4. Export attendance reports anytime</strong>
              <p>Review Present and Late arrivals live and download clean CSV sheets for your records.</p>
            </div>
          </div>
        </div>

        <div className="welcome-modal-actions">
          <button
            type="button"
            className="auth-wati-primary-btn welcome-cta-btn"
            onClick={onClose}
          >
            <span>Go to my dashboard</span>
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
