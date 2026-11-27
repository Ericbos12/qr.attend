import React from 'react';

export function BrandMark({ size = 34 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block', borderRadius: Math.round(size * 0.25) }}
    >
      <rect width="64" height="64" rx="16" fill="#ffffff" />
      <path d="M12 24V18C12 14.686 14.686 12 18 12H24" stroke="#1d74f5" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M40 12H46C49.314 12 52 14.686 52 18V24" stroke="#1d74f5" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M12 40V46C12 49.314 14.686 52 18 52H24" stroke="#10c96f" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M40 52H46C49.314 52 52 49.314 52 46V40" stroke="#10c96f" strokeWidth="4.5" strokeLinecap="round" />
      <rect x="19" y="19" width="10.5" height="10.5" rx="2.2" stroke="#0f2b5b" strokeWidth="2.8" />
      <rect x="22.8" y="22.8" width="3" height="3" rx="0.8" fill="#0f2b5b" />
      <rect x="34.5" y="19" width="10.5" height="10.5" rx="2.2" stroke="#0f2b5b" strokeWidth="2.8" />
      <rect x="38.3" y="22.8" width="3" height="3" rx="0.8" fill="#0f2b5b" />
      <rect x="19" y="34.5" width="10.5" height="10.5" rx="2.2" stroke="#0f2b5b" strokeWidth="2.8" />
      <rect x="22.8" y="38.3" width="3" height="3" rx="0.8" fill="#0f2b5b" />
      <rect x="34.5" y="34.5" width="4.4" height="4.4" rx="1" fill="#10c96f" />
      <rect x="40.6" y="34.5" width="4.4" height="4.4" rx="1" fill="#10c96f" />
      <rect x="34.5" y="40.6" width="4.4" height="4.4" rx="1" fill="#10c96f" />
      <rect x="40.6" y="40.6" width="4.4" height="4.4" rx="1" fill="#1d74f5" />
    </svg>
  );
}

export default function BrandLogo({ size = 34, dark = false, showText = true }) {
  const fontSize = Math.max(15, Math.round(size * 0.56));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3) }}>
      <BrandMark size={size} />
      {showText && (
        <span
          style={{
            fontWeight: 700,
            fontSize: `${fontSize}px`,
            letterSpacing: '-0.025em',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'baseline',
          }}
        >
          <span style={{ color: dark ? '#ffffff' : 'var(--ink)' }}>attend</span>
          <span style={{ color: '#10c96f', marginLeft: 3 }}>qr</span>
        </span>
      )}
    </span>
  );
}
