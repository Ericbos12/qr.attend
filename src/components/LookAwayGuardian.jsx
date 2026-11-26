import React from 'react';
import { BrandMark } from './BrandLogo';

/**
 * Friendly eriqo Guardian mascot integrated cleanly beside the QR mark.
 * - Watches email typing smoothly (eyeProgress 0..1)
 * - Politely turns head away & raises hands over eyes when entering password
 * - Peeks shyly through one finger only if password is revealed without privacy glass
 * - Smiles warmly when password is strong
 */
export default function LookAwayGuardian({
  lookAway = false,
  peek = false,
  happy = false,
  eyeProgress = 0.5, // 0..1 horizontal gaze tracking while typing email
}) {
  // Smooth pupil offset when looking at email field
  const gazeX = lookAway ? -6.5 : (eyeProgress - 0.5) * 6.5;
  const gazeY = lookAway ? -2.2 : 1.8;
  const headShiftX = lookAway ? (peek ? -2 : -5) : (eyeProgress - 0.5) * 2.5;
  const headTilt = lookAway ? (peek ? -5 : -11) : (eyeProgress - 0.5) * 3;

  return (
    <div className="guardian-cluster" aria-hidden="true">
      <div className="auth-qr-badge">
        <BrandMark size={38} />
      </div>

      <div
        className={`guardian-badge ${lookAway ? 'is-away' : ''} ${peek ? 'is-peeking' : ''} ${
          happy ? 'is-happy' : ''
        }`}
        title={lookAway ? 'Looking away for your privacy' : 'eriqo'}
      >
        <svg viewBox="0 0 64 64" width="44" height="44" style={{ display: 'block', overflow: 'visible' }}>
          {/* Soft circular studio backdrop */}
          <rect width="64" height="64" rx="11" fill="#edf4fc" />
          {/* Shoulders / collar */}
          <path d="M12 64 C14 51, 22 47, 32 47 C42 47, 50 51, 52 64 Z" fill="#1456d9" />
          <path d="M27 47 L32 54 L37 47 Z" fill="#ffffff" opacity="0.92" />

          {/* Animated head group */}
          <g
            style={{
              transformOrigin: '32px 32px',
              transform: `translateX(${headShiftX}px) rotate(${headTilt}deg)`,
              transition: 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {/* Ears */}
            <circle cx="15" cy="31" r="4" fill="#f3c6a5" />
            <circle cx="49" cy="31" r="4" fill="#f3c6a5" />

            {/* Face */}
            <rect x="17" y="14" width="30" height="32" rx="14" fill="#f8d4b8" />

            {/* Hair */}
            <path
              d="M16 25 C16 14, 23 10, 32 10 C41 10, 48 14, 48 25 C45 19, 39 18, 32 18 C25 18, 19 19, 16 25 Z"
              fill="#0f2b5b"
            />

            {/* Soft cheek blush */}
            <ellipse cx="22.5" cy="34.5" rx="3" ry="1.8" fill="#f4978e" opacity="0.38" />
            <ellipse cx="41.5" cy="34.5" rx="3" ry="1.8" fill="#f4978e" opacity="0.38" />

            {/* Eyes */}
            <g className="guardian-eyes">
              {/* Left eye */}
              <ellipse cx="26" cy="29.5" rx="3.4" ry="3.7" fill="#ffffff" />
              <circle
                cx={26 + gazeX * 0.38}
                cy={29.5 + gazeY * 0.38}
                r="1.9"
                fill="#0b1220"
                style={{ transition: 'cx 0.2s ease, cy 0.2s ease' }}
              />
              <circle cx={26.6 + gazeX * 0.35} cy={28.8 + gazeY * 0.35} r="0.6" fill="#ffffff" />

              {/* Right eye */}
              <ellipse cx="38" cy="29.5" rx="3.4" ry="3.7" fill="#ffffff" />
              <circle
                cx={38 + gazeX * 0.38}
                cy={29.5 + gazeY * 0.38}
                r="1.9"
                fill="#0b1220"
                style={{ transition: 'cx 0.2s ease, cy 0.2s ease' }}
              />
              <circle cx={38.6 + gazeX * 0.35} cy={28.8 + gazeY * 0.35} r="0.6" fill="#ffffff" />
            </g>

            {/* Glasses frame (clean academic look) */}
            <rect x="20.5" y="25" width="10.5" height="8.5" rx="3.5" fill="none" stroke="#0f2b5b" strokeWidth="1.5" />
            <rect x="33" y="25" width="10.5" height="8.5" rx="3.5" fill="none" stroke="#0f2b5b" strokeWidth="1.5" />
            <line x1="31" y1="29" x2="33" y2="29" stroke="#0f2b5b" strokeWidth="1.5" />

            {/* Mouth (neutral smile vs pleased strong-password grin vs polite hush when looking away) */}
            {happy ? (
              <path
                d="M27 38 C29 41.8, 35 41.8, 37 38"
                fill="none"
                stroke="#0f2b5b"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            ) : lookAway && !peek ? (
              <path
                d="M29.5 39.2 Q32 38.4 34.5 39.2"
                fill="none"
                stroke="#0f2b5b"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M28.2 38.2 C30 40.2, 34 40.2, 35.8 38.2"
                fill="none"
                stroke="#0f2b5b"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            )}
          </g>

          {/* Left hand rises politely to shield eyes when looking away */}
          <g
            style={{
              transform: lookAway ? 'translate(0px, 0px)' : 'translate(-12px, 24px)',
              opacity: lookAway ? 1 : 0,
              transition: 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease',
            }}
          >
            <rect x="14" y="23" width="15" height="14" rx="6" fill="#f3c6a5" stroke="#d9a684" strokeWidth="1" />
            <line x1="18.5" y1="24" x2="18.5" y2="32" stroke="#d9a684" strokeWidth="1" strokeLinecap="round" />
            <line x1="23" y1="24" x2="23" y2="32" stroke="#d9a684" strokeWidth="1" strokeLinecap="round" />
          </g>

          {/* Right hand rises when looking away, lowers slightly when peeking */}
          <g
            style={{
              transform: lookAway
                ? peek
                  ? 'translate(2px, 7px)'
                  : 'translate(0px, 0px)'
                : 'translate(12px, 24px)',
              opacity: lookAway ? 1 : 0,
              transition: 'transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease',
            }}
          >
            <rect x="35" y="23" width="15" height="14" rx="6" fill="#f3c6a5" stroke="#d9a684" strokeWidth="1" />
            <line x1="41" y1="24" x2="41" y2="32" stroke="#d9a684" strokeWidth="1" strokeLinecap="round" />
            <line x1="45.5" y1="24" x2="45.5" y2="32" stroke="#d9a684" strokeWidth="1" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    </div>
  );
}
