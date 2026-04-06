'use client';

import { useState } from 'react';

interface MothershipLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function MothershipLogo({ size = 48, className = '', style }: MothershipLogoProps) {
  const [usePng, setUsePng] = useState(true);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: '0 0 16px rgba(0,217,255,0.35), 0 0 4px rgba(0,217,255,0.2)',
        ...style,
      }}
    >
      {usePng ? (
        <img
          src="/logo.png"
          alt="Mothership"
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setUsePng(false)}
        />
      ) : (
        <img
          src="/logo.svg"
          alt="Mothership"
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </div>
  );
}
