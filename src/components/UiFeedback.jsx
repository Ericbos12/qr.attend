import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'info', durationMs = 3400) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    if (durationMs > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    }
  }, []);

  const confirm = useCallback(({ title, message, confirmLabel = 'Confirm', danger = false }) => {
    return new Promise((resolve) => {
      setConfirmState({ title, message, confirmLabel, danger, resolve });
    });
  }, []);

  const handleConfirmChoice = (choice) => {
    if (confirmState) {
      confirmState.resolve(choice);
      setConfirmState(null);
    }
  };

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e) => {
      if (e.key === 'Escape') handleConfirmChoice(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmState]);

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast Stack */}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">
              {t.type === 'success' ? (
                <CheckCircle2 size={16} />
              ) : t.type === 'error' ? (
                <AlertCircle size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Custom In-App Confirmation Dialog */}
      {confirmState && (
        <div className="modal-backdrop" onClick={() => handleConfirmChoice(false)}>
          <div
            className="modal modal-animate"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={`confirm-icon ${confirmState.danger ? 'danger' : ''}`}>
                  <AlertTriangle size={16} />
                </div>
                <h3 className="modal-title">{confirmState.title || 'Please Confirm'}</h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost icon-btn"
                onClick={() => handleConfirmChoice(false)}
                aria-label="Cancel confirmation dialog"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--ink-secondary)', lineHeight: 1.55, marginBottom: 22 }}>
              {confirmState.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleConfirmChoice(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${confirmState.danger ? 'btn-danger-solid' : 'btn-primary'}`}
                onClick={() => handleConfirmChoice(true)}
                autoFocus
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within FeedbackProvider');
  }
  return ctx;
}
