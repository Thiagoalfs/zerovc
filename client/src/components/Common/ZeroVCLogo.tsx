import React from 'react';

interface ZeroVCLogoProps {
  className?: string;
  size?: number | string;
}

export const ZeroVCLogo: React.FC<ZeroVCLogoProps> = ({ className = 'w-5 h-5', size }) => {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
    >
      {/* Rounded squircle background */}
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#5865F2" />
      {/* Sharp white 'Z' emblem */}
      <polygon points="8,8 24,8 24,11.5 13.5,20.5 24,20.5 24,24 8,24 8,20.5 18.5,11.5 8,11.5" fill="#FFFFFF" />
    </svg>
  );
};
