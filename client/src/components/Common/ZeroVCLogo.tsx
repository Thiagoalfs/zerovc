import React, { useId } from 'react';

interface ZeroVCLogoProps {
  className?: string;
  size?: number | string;
}

export const ZeroVCLogo: React.FC<ZeroVCLogoProps> = ({ className = 'w-5 h-5', size }) => {
  const gradId = useId();

  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
    >
      <defs>
        <linearGradient id={gradId} x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>

      {/* Fundo azul redondo */}
      <circle cx="256" cy="256" r="244" fill={`url(#${gradId})`} />

      {/* Z bold geométrico centralizado */}
      <path
        d="M 148 142 L 364 142 L 238 328 L 364 328 L 364 370 L 148 370 L 274 184 L 148 184 Z"
        fill="#FFFFFF"
      />

      {/* "VC" acima da perna inferior do Z */}
      <g stroke="#FFFFFF" strokeWidth="8" strokeLinecap="butt" strokeLinejoin="miter" fill="none">
        <path d="M 288 280 L 303 307.3 L 318 280" />
        <path d="M 353.9 288.1 A 14 14 0 1 0 353.9 307.9" />
      </g>
    </svg>
  );
};
