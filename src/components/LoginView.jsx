import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Sparkles,
  Shield,
  ShieldOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api, setAuthToken } from '../api';
import { evaluatePassword, generateSecurePassword } from '../passwordPolicy';
import { authSound } from '../sound';
import LookAwayGuardian from './LookAwayGuardian';
import PrivacyPolicyModal from './PrivacyPolicyModal';

/**
 * 6-box numeric PIN input:
 * - Each digit has its own individual box
 * - Automatically advances to the next box on digit entry
 * - Supports Backspace to previous box, Arrow keys, and full-code paste/autofill
 * - Automatically triggers onComplete(code) as soon as the 6th digit is entered
 */
function OtpPinBoxes({
  idPrefix = 'otp-pin',
  value = '',
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  autoFocus = true,
  focusTrigger = 0,
}) {
  const inputRefs = useRef([]);
  const lastSubmittedRef = useRef('');
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  useEffect(() => {
    if (value.length < 6) {
      lastSubmittedRef.current = '';
    }
  }, [value]);

  useEffect(() => {
    if (focusTrigger > 0 && !disabled) {
      requestAnimationFrame(() => {
        inputRefs.current[0]?.focus();
      });
    }
  }, [focusTrigger, disabled]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      requestAnimationFrame(() => {
        inputRefs.current[0]?.focus();
      });
    }
  }, [autoFocus]);

  function commitDigits(nextArr, focusIndex) {
    const joined = nextArr.join('').replace(/\D/g, '').slice(0, 6);
    onChange(joined);
    if (typeof focusIndex === 'number' && focusIndex >= 0 && focusIndex < 6) {
      requestAnimationFrame(() => {
        inputRefs.current[focusIndex]?.focus();
        inputRefs.current[focusIndex]?.select?.();
      });
    }
    if (joined.length === 6 && !disabled && lastSubmittedRef.current !== joined) {
      lastSubmittedRef.current = joined;
      onComplete?.(joined);
    }
  }

  function handleChange(index, raw) {
    if (disabled) return;
    const onlyDigits = String(raw || '').replace(/\D/g, '');
    if (!onlyDigits) {
      const next = [...digits];
      next[index] = '';
      commitDigits(next, index);
      return;
    }

    // Handle multi-digit paste or OS one-time-code autofill
    if (onlyDigits.length > 1) {
      const next = [...digits];
      const start = onlyDigits.length >= 6 ? 0 : index;
      for (let offset = 0; offset < onlyDigits.length && start + offset < 6; offset++) {
        next[start + offset] = onlyDigits[offset];
      }
      const nextFocus = Math.min(5, start + onlyDigits.length);
      authSound.keyTick(Math.min(100, (start + onlyDigits.length) * 16));
      commitDigits(next, nextFocus);
      return;
    }

    const next = [...digits];
    next[index] = onlyDigits;
    authSound.keyTick((index + 1) * 16);
    commitDigits(next, index < 5 ? index + 1 : 5);
  }

  function handleKeyDown(index, e) {
    if (disabled) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = '';
        commitDigits(next, index);
      } else if (index > 0) {
        next[index - 1] = '';
        commitDigits(next, index - 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index, e) {
    if (disabled) return;
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    const next = [...digits];
    const start = pasted.length >= 6 ? 0 : index;
    for (let offset = 0; offset < pasted.length && start + offset < 6; offset++) {
      next[start + offset] = pasted[offset];
    }
    const nextFocus = Math.min(5, start + pasted.length);
    authSound.keyTick(Math.min(100, (start + pasted.length) * 16));
    commitDigits(next, nextFocus);
  }

  return (
    <div
      className={`otp-pin-grid ${hasError ? 'is-error' : ''}`}
      role="group"
      aria-label="6-digit verification PIN"
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          id={`${idPrefix}-${i}`}
          className={`otp-pin-box mono ${digit ? 'is-filled' : ''}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          aria-label={`Digit ${i + 1} of 6`}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

/**
 * Password field where:
 * - The input's own SVG outline acts as the live concentric strength meter (no red rules)
 * - Characters are rendered in monospace 1ch slots so dots seamlessly morph into letters
 * - Optional frosted Privacy Glass shields shoulder-surfers (hover/click to peek)
 */
function CraftedPasswordField({
  id = 'auth-password',
  value,
  onChange,
  onFocus,
  onBlur,
  showPassword,
  onToggleShow,
  privacyGlass,
  onToggleGlass,
  strength,
  meterActive,
  placeholder,
}) {
  const inputRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [glassPeeking, setGlassPeeking] = useState(false);

  const chars = useMemo(() => Array.from(value || ''), [value]);

  const strokeColor = !meterActive
    ? 'var(--accent)'
    : strength.tone === 'strong'
    ? 'var(--brand-emerald)'
    : strength.tone === 'good'
    ? 'var(--accent)'
    : strength.tone === 'fair'
    ? '#d97706'
    : strength.tone === 'weak'
    ? '#b45309'
    : 'transparent';

  const meterPercent = meterActive ? strength.percent : 0;
  const isFrosted = privacyGlass && !glassPeeking && value.length > 0;

  return (
    <div
      className={`pw-meter-wrap ${meterActive && strength.tone === 'strong' ? 'is-strong' : ''} ${
        isFrosted ? 'is-frosted' : ''
      }`}
      onMouseEnter={() => privacyGlass && setGlassPeeking(true)}
      onMouseLeave={() => setGlassPeeking(false)}
    >
      {/* Concentric SVG Outline Meter (traces the exact 10px rounded input perimeter) */}
      <svg
        className="pw-outline-svg"
        viewBox="0 0 360 44"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect
          x="1.25"
          y="1.25"
          width="357.5"
          height="41.5"
          rx="9.5"
          ry="9.5"
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
        {meterActive && meterPercent > 0 && (
          <rect
            className="pw-outline-progress"
            x="1.25"
            y="1.25"
            width="357.5"
            height="41.5"
            rx="9.5"
            ry="9.5"
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.2"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - meterPercent}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Seamless Monospace Dot <-> Letter Morph Display Layer */}
      <div className="pw-morph-viewport" aria-hidden="true">
        <div
          className="pw-morph-track mono"
          style={{ transform: `translateX(${-scrollLeft}px)` }}
        >
          {chars.length === 0 ? (
            <span className="pw-morph-placeholder">{placeholder}</span>
          ) : (
            chars.map((ch, idx) => (
              <span
                key={idx}
                className={`pw-slot ${showPassword ? 'is-revealed' : 'is-masked'}`}
                style={{ '--slot-delay': `${Math.min(idx, 18) * 11}ms` }}
              >
                <span className="pw-slot-dot">•</span>
                <span className="pw-slot-char">{ch === ' ' ? '\u00A0' : ch}</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Real Native Input (caret, selection, autofill, keyboard accessibility) */}
      <input
        id={id}
        ref={inputRef}
        className="pw-native-input mono"
        type="text"
        inputMode="text"
        enterKeyHint="done"
        autoComplete={meterActive ? 'new-password' : 'current-password'}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          requestAnimationFrame(() => {
            if (inputRef.current) setScrollLeft(inputRef.current.scrollLeft || 0);
          });
        }}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft || 0)}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label="Password"
        required
      />

      {/* Frosted Privacy Glass Pane (hides field from shoulder-surfers; hover melts frost) */}
      <div className={`pw-privacy-glass ${isFrosted ? 'active' : ''}`} aria-hidden="true">
        <span className="pw-glass-sheen" />
      </div>

      {/* Right Controls: Privacy Glass toggle + Eye Morph toggle */}
      <div className="pw-controls">
        <button
          type="button"
          className={`pw-ctrl-btn ${privacyGlass ? 'is-on' : ''}`}
          onClick={onToggleGlass}
          aria-label={privacyGlass ? 'Turn off privacy glass' : 'Turn on privacy glass'}
          title={privacyGlass ? 'Privacy glass on (hover to peek)' : 'Enable privacy glass'}
        >
          {privacyGlass ? (
            <Shield size={15} strokeWidth={1.8} />
          ) : (
            <ShieldOff size={15} strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          className="pw-ctrl-btn"
          onClick={onToggleShow}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          title={showPassword ? 'Morph to dots' : 'Morph to letters'}
        >
          {showPassword ? (
            <EyeOff size={15} strokeWidth={1.75} />
          ) : (
            <Eye size={15} strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  );
}

export default function LoginView({ onAuthenticated, initialError = '' }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'verify-signup' | 'forgot' | 'reset'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [privacyGlass, setPrivacyGlass] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      const saved = localStorage.getItem('attendqr_auth_sound');
      const initial = saved !== 'off';
      authSound.enabled = initial;
      return initial;
    } catch {
      return true;
    }
  });
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [signupCode, setSignupCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetCode, setResetCode] = useState('');
  const [pinFocusTick, setPinFocusTick] = useState(0);
  const [info, setInfo] = useState('');
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const wasStrongRef = useRef(false);
  const wasCommonRef = useRef(false);

  const strictMode = mode === 'register' || mode === 'reset';
  const strength = useMemo(() => evaluatePassword(password, email), [password, email]);

  useEffect(() => {
    authSound.enabled = soundOn;
    try {
      localStorage.setItem('attendqr_auth_sound', soundOn ? 'on' : 'off');
    } catch {}
  }, [soundOn]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  // Celebrate with subtle chime when password crosses into 100% strong, or soft thud if common
  useEffect(() => {
    if (!strictMode) {
      wasStrongRef.current = false;
      wasCommonRef.current = false;
      return;
    }
    if (strength.valid && !wasStrongRef.current) {
      authSound.strongChime();
    }
    if (strength.common && !wasCommonRef.current) {
      authSound.softReject();
    }
    wasStrongRef.current = strength.valid;
    wasCommonRef.current = strength.common;
  }, [strictMode, strength.valid, strength.common]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setInfo('');
    setPasswordFocused(false);
    authSound.keyTick(30);
  }

  function handlePasswordChange(nextVal) {
    setPassword(nextVal);
    if (nextVal.length > password.length) {
      authSound.keyTick(strictMode ? evaluatePassword(nextVal, email).percent : 40);
    }
  }

  function handleSuggestPassword() {
    const generated = generateSecurePassword();
    setPassword(generated);
    setShowPassword(true);
    setError('');
    authSound.strongChime();
  }

  function handleToggleShow() {
    const next = !showPassword;
    setShowPassword(next);
    authSound.glassToggle(next);
  }

  function handleToggleGlass() {
    const next = !privacyGlass;
    setPrivacyGlass(next);
    authSound.glassToggle(next);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');

    if (mode === 'register' && !strength.valid) {
      authSound.softReject();
      setError(strength.hint || 'Please strengthen your password or tap Suggest.');
      return;
    }

    if (mode === 'register' && !consentAccepted) {
      authSound.softReject();
      setError('Please check the consent box to agree to the Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const data = await api.login(email, password);
        authSound.success();
        setAuthToken(data.token);
        onAuthenticated(data.teacher);
      } else {
        const data = await api.register(name, email, password, consentAccepted);
        authSound.strongChime();
        setSignupCode('');
        setInfo(data.message);
        setResendCooldown(30);
        setMode('verify-signup');
      }
    } catch (err) {
      authSound.softReject();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitSignupVerification(codeToVerify) {
    const clean = String(codeToVerify ?? signupCode).replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6 || loading) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.verifyRegister(email, clean);
      authSound.success();
      setAuthToken(data.token);
      onAuthenticated(data.teacher);
    } catch (err) {
      authSound.softReject();
      setSignupCode('');
      setPinFocusTick((t) => t + 1);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendSignupCode() {
    if (resendCooldown > 0 || loading) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.register(name, email, password, true);
      authSound.keyTick(70);
      setSignupCode('');
      setPinFocusTick((t) => t + 1);
      setInfo(data.message);
      setResendCooldown(30);
    } catch (err) {
      authSound.softReject();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.forgotPassword(email);
      authSound.keyTick(75);
      setResetCode('');
      setResendCooldown(30);
      setInfo(data.message);
      setMode('verify-reset');
    } catch (err) {
      authSound.softReject();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitVerifyResetCode(codeToVerify) {
    const clean = String(codeToVerify ?? resetCode).replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6 || loading) return;
    if (!email.trim()) {
      authSound.softReject();
      setResetCode('');
      setError('Please enter your account email address first.');
      return;
    }
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.verifyResetCode(email, clean);
      authSound.strongChime();
      setResetCode(clean);
      setPassword('');
      setInfo(data.message || 'Code verified. Set your new password below.');
      setMode('reset');
    } catch (err) {
      authSound.softReject();
      setResetCode('');
      setPinFocusTick((t) => t + 1);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendResetCode() {
    if (resendCooldown > 0 || loading || !email.trim()) return;
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const data = await api.forgotPassword(email);
      authSound.keyTick(70);
      setResetCode('');
      setPinFocusTick((t) => t + 1);
      setInfo(data.message);
      setResendCooldown(30);
    } catch (err) {
      authSound.softReject();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!strength.valid) {
      authSound.softReject();
      setError(strength.hint || 'Please strengthen your password or tap Suggest.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.resetPassword(email, resetCode, password);
      authSound.success();
      setResetCode('');
      setPassword('');
      setInfo(data.message);
      setMode('login');
    } catch (err) {
      authSound.softReject();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isVerifySignup = mode === 'verify-signup';
  const isVerifyReset = mode === 'verify-reset';

  const title =
    mode === 'forgot'
      ? 'Reset your password'
      : isVerifyReset
      ? 'Enter reset PIN'
      : mode === 'reset'
      ? 'Set a new password'
      : isVerifySignup
      ? 'Verify your email'
      : mode === 'register'
      ? 'Create your account'
      : 'Sign in to AttendQR';

  const eyeProgress = Math.min(1, email.length / 26);
  const guardianLooksAway = passwordFocused || (privacyGlass && password.length > 0);
  const guardianPeeks = passwordFocused && showPassword && !privacyGlass;
  const guardianHappy = strictMode && strength.valid;

  return (
    <div className="auth-stage">
      {/* Preserved AttendQR custom background in smooth ambient motion + static center veil */}
      <div className="auth-bg-layer auth-bg-layer-image" aria-hidden="true" />
      <div className="auth-bg-layer auth-bg-layer-veil" aria-hidden="true" />
      <div className="auth-bg-layer auth-bg-layer-wash-a" aria-hidden="true" />
      <div className="auth-bg-layer auth-bg-layer-wash-b" aria-hidden="true" />

      <main className="auth-center">
        {/* Exact concentric outer bezel: 42px - 8px - 1px = 33px card -> 10px inner */}
        <div className="auth-shell">
          <div className="auth-card">
            <button
              type="button"
              className={`auth-sound-btn ${soundOn ? 'is-on' : 'is-off'}`}
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                authSound.enabled = next;
                if (next) authSound.keyTick(85);
              }}
              aria-pressed={soundOn}
              aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
              title={soundOn ? 'Sound is on — click to mute' : 'Sound is off — click to enable'}
            >
              {soundOn ? (
                <Volume2 size={14} strokeWidth={2} aria-hidden="true" />
              ) : (
                <VolumeX size={14} strokeWidth={2} aria-hidden="true" />
              )}
              <span>{soundOn ? 'Sound on' : 'Sound off'}</span>
            </button>

            <div className="auth-brand-head auth-fly-1">
              <LookAwayGuardian
                lookAway={guardianLooksAway}
                peek={guardianPeeks}
                happy={guardianHappy}
                eyeProgress={eyeProgress}
              />
              <h1 className="auth-heading">{title}</h1>
            </div>

            {info && (
              <div className="alert alert-info auth-concentric-inner" role="status" aria-live="polite">
                {info}
              </div>
            )}
            {error && (
              <div className="alert alert-error auth-concentric-inner" role="alert">
                {error}
              </div>
            )}

            <div className="auth-mode-body" key={mode}>
              {isVerifySignup ? (
                <div className="otp-step-wrap">
                  <div className="form-group auth-fly-2">
                    <label htmlFor="signup-pin-0" className="form-label" style={{ textAlign: 'center', display: 'block' }}>
                      Enter the 6-digit PIN sent to <strong>{email}</strong>
                    </label>
                    <OtpPinBoxes
                      idPrefix="signup-pin"
                      value={signupCode}
                      onChange={setSignupCode}
                      onComplete={submitSignupVerification}
                      disabled={loading}
                      hasError={Boolean(error)}
                      autoFocus={true}
                      focusTrigger={pinFocusTick}
                    />
                    <div className="otp-pin-status" role="status" aria-live="polite">
                      {loading ? (
                        <>
                          <span className="otp-spinner" aria-hidden="true" />
                          <span>Verifying PIN &amp; creating account...</span>
                        </>
                      ) : (
                        <span></span>
                      )}
                    </div>
                  </div>

                  <div className="auth-inline-links auth-fly-4">
                    <button type="button" className="text-link-btn" onClick={() => switchMode('register')}>
                      <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" /> Edit registration details
                    </button>
                    <button
                      type="button"
                      className="text-link-btn"
                      onClick={handleResendSignupCode}
                      disabled={resendCooldown > 0 || loading}
                      style={{ opacity: resendCooldown > 0 ? 0.6 : 1 }}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </div>
              ) : mode === 'forgot' ? (
                <form onSubmit={handleRequestReset}>
                  <div className="form-group auth-fly-2">
                    <label htmlFor="auth-forgot-email" className="form-label">
                      Email address
                    </label>
                    <input
                      id="auth-forgot-email"
                      className="input auth-concentric-inner"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="send"
                      placeholder="you@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    className="btn btn-primary btn-full btn-lg auth-cta auth-concentric-inner auth-fly-3"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? 'Sending reset code...' : 'Send reset code'}
                    <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
                  </button>

                  <div className="auth-inline-links auth-fly-4">
                    <button type="button" className="text-link-btn" onClick={() => switchMode('login')}>
                      <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" /> Back to sign in
                    </button>
                  </div>
                </form>
              ) : isVerifyReset ? (
                <div className="otp-step-wrap">
                  {!email.trim() ? (
                    <div className="form-group auth-fly-2">
                      <label htmlFor="auth-verify-reset-email" className="form-label">
                        Account email address
                      </label>
                      <input
                        id="auth-verify-reset-email"
                        className="input auth-concentric-inner"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="next"
                        placeholder="you@university.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="otp-email-pill auth-fly-2">
                      <span>
                        PIN sent to <strong>{email}</strong>
                      </span>
                      <button
                        type="button"
                        className="text-link-btn"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => {
                          setResetCode('');
                          switchMode('forgot');
                        }}
                      >
                        Change
                      </button>
                    </div>
                  )}

                  <div className="form-group auth-fly-2">
                    <label htmlFor="reset-pin-0" className="form-label" style={{ textAlign: 'center', display: 'block' }}>
                      Enter 6-digit reset PIN
                    </label>
                    <OtpPinBoxes
                      idPrefix="reset-pin"
                      value={resetCode}
                      onChange={setResetCode}
                      onComplete={submitVerifyResetCode}
                      disabled={loading}
                      hasError={Boolean(error)}
                      autoFocus={Boolean(email.trim())}
                      focusTrigger={pinFocusTick}
                    />
                    <div className="otp-pin-status" role="status" aria-live="polite">
                      {loading ? (
                        <>
                          <span className="otp-spinner" aria-hidden="true" />
                          <span>Confirming PIN...</span>
                        </>
                      ) : (
                        <span>Confirms automatically as soon as you enter the last digit</span>
                      )}
                    </div>
                  </div>

                  <div className="auth-inline-links auth-fly-4">
                    <button type="button" className="text-link-btn" onClick={() => switchMode('forgot')}>
                      <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" /> Back
                    </button>
                    <button
                      type="button"
                      className="text-link-btn"
                      onClick={handleResendResetCode}
                      disabled={resendCooldown > 0 || loading || !email.trim()}
                      style={{ opacity: resendCooldown > 0 || !email.trim() ? 0.6 : 1 }}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend PIN'}
                    </button>
                  </div>
                </div>
              ) : mode === 'reset' ? (
                <form onSubmit={handleConfirmReset}>
                  <div className="otp-email-pill auth-fly-2">
                    <span>
                      Verified account: <strong>{email}</strong>
                    </span>
                  </div>

                  <div className="form-group auth-fly-3">
                    <div className="auth-label-row">
                      <label htmlFor="auth-reset-password" className="form-label">
                        New password
                      </label>
                      <button
                        type="button"
                        className="pw-suggest-btn"
                        onClick={handleSuggestPassword}
                      >
                        <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
                        <span>Suggest strong</span>
                      </button>
                    </div>
                    <CraftedPasswordField
                      id="auth-reset-password"
                      value={password}
                      onChange={handlePasswordChange}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      showPassword={showPassword}
                      onToggleShow={handleToggleShow}
                      privacyGlass={privacyGlass}
                      onToggleGlass={handleToggleGlass}
                      strength={strength}
                      meterActive={true}
                      placeholder="10+ chars, mixed & symbol"
                    />
                    {strength.hint && (
                      <div
                        className={`pw-meter-caption tone-${strength.tone}`}
                        role="status"
                        aria-live="polite"
                      >
                        <span>{strength.hint}</span>
                        <span className="tnum">{strength.percent}%</span>
                      </div>
                    )}
                  </div>

                  <button
                    className="btn btn-primary btn-full btn-lg auth-cta auth-concentric-inner auth-fly-3"
                    type="submit"
                    disabled={loading || !strength.valid}
                  >
                    {loading ? 'Saving new password...' : 'Save new password'}
                    <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
                  </button>

                  <div className="auth-inline-links auth-fly-4">
                    <button type="button" className="text-link-btn" onClick={() => switchMode('login')}>
                      <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" /> Back to sign in
                    </button>
                    <button
                      type="button"
                      className="text-link-btn"
                      onClick={() => {
                        setResetCode('');
                        switchMode('forgot');
                      }}
                    >
                      Request new PIN
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleAuthSubmit}>
                  {mode === 'register' && (
                    <div className="form-group auth-fly-2">
                      <label htmlFor="auth-name" className="form-label">
                        Full name
                      </label>
                      <input
                        id="auth-name"
                        className="input auth-concentric-inner"
                        type="text"
                        autoComplete="name"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        placeholder="Dr. Sarah Mensah"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="form-group auth-fly-2">
                    <label htmlFor="auth-email" className="form-label">
                      Email address
                    </label>
                    <input
                      id="auth-email"
                      className="input auth-concentric-inner"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      placeholder="you@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group auth-fly-3">
                    <div className="auth-label-row">
                      <label htmlFor="auth-password" className="form-label">
                        Password
                      </label>
                      {mode === 'login' ? (
                        <button
                          type="button"
                          className="text-link-btn"
                          style={{ fontSize: '0.79rem', fontWeight: 500 }}
                          onClick={() => switchMode('forgot')}
                        >
                          Forgot password?
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="pw-suggest-btn"
                          onClick={handleSuggestPassword}
                        >
                          <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
                          <span>Suggest strong</span>
                        </button>
                      )}
                    </div>

                    <CraftedPasswordField
                      id="auth-password"
                      value={password}
                      onChange={handlePasswordChange}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      showPassword={showPassword}
                      onToggleShow={handleToggleShow}
                      privacyGlass={privacyGlass}
                      onToggleGlass={handleToggleGlass}
                      strength={strength}
                      meterActive={mode === 'register'}
                      placeholder={
                        mode === 'register'
                          ? 'Create a strong password'
                          : 'Enter your password'
                      }
                    />

                    {mode === 'register' && strength.hint && (
                      <div
                        className={`pw-meter-caption tone-${strength.tone}`}
                        role="status"
                        aria-live="polite"
                      >
                        <span>{strength.hint}</span>
                        <span className="tnum">{strength.percent}%</span>
                      </div>
                    )}
                  </div>

                  {/* Explicit affirmative form consent on account creation */}
                  {mode === 'register' && (
                    <label htmlFor="auth-consent" className="auth-consent-row auth-fly-3">
                      <input
                        id="auth-consent"
                        type="checkbox"
                        checked={consentAccepted}
                        onChange={(e) => {
                          setConsentAccepted(e.target.checked);
                          authSound.keyTick(e.target.checked ? 90 : 30);
                        }}
                        required
                      />
                      <span>
                        I consent to AttendQR processing my account details under the{' '}
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
                  )}

                  {/* Single primary CTA */}
                  <button
                    className="btn btn-primary btn-full btn-lg auth-cta auth-concentric-inner auth-fly-3"
                    type="submit"
                    disabled={
                      loading ||
                      (mode === 'register' && ((password.length > 0 && !strength.valid) || !consentAccepted))
                    }
                  >
                    {loading
                      ? mode === 'login'
                        ? 'Signing in...'
                        : 'Sending verification code...'
                      : mode === 'login'
                      ? 'Sign in to AttendQR'
                      : 'Create instructor account'}
                    <ArrowRight size={15} strokeWidth={1.75} className="icon-optical-arrow" aria-hidden="true" />
                  </button>

                  <div className="auth-secondary-row auth-fly-4">
                    {mode === 'login' ? (
                      <button
                        type="button"
                        className="text-link-btn"
                        style={{ fontSize: '0.82rem', fontWeight: 500 }}
                        onClick={() => switchMode('register')}
                      >
                        Create account
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-link-btn"
                        style={{ fontSize: '0.82rem', fontWeight: 500 }}
                        onClick={() => switchMode('login')}
                      >
                        Sign in instead
                      </button>
                    )}
                  </div>

                  <p className="auth-legal auth-fly-4">
                    By continuing, you agree to our{' '}
                    <button
                      type="button"
                      className="text-link-btn"
                      style={{ fontSize: 'inherit', fontWeight: 500, verticalAlign: 'baseline' }}
                      onClick={() => setShowPrivacy(true)}
                    >
                      Privacy Policy
                    </button>
                    .
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <PrivacyPolicyModal open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  );
}
