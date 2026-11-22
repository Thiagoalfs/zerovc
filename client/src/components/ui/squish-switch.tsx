'use client';

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface SquishSwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
}

const SIZES = {
  sm: { track: 'w-10 h-6', travel: 16 },
  md: { track: 'w-12 h-6', travel: 24 },
} as const;

export const SquishSwitch: React.FC<SquishSwitchProps> = ({
  checked,
  onCheckedChange,
  size = 'md',
  disabled = false,
  className,
  onClick,
  ...props
}) => {
  const [pressed, setPressed] = useState(false);
  const reducedMotion = useReducedMotion();
  const { track, travel } = SIZES[size];

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (!e.defaultPrevented && !disabled) {
      onCheckedChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleClick}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:cursor-not-allowed disabled:opacity-50',
        track,
        checked ? 'bg-brand-500' : 'bg-white/10 hover:bg-white/15',
        className,
      )}
      {...props}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{
          x: checked ? travel : 0,
          scaleX: reducedMotion ? 1 : pressed ? 1.32 : 1,
          scaleY: reducedMotion ? 1 : pressed ? 0.84 : 1,
        }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : {
                x: { type: 'spring', stiffness: 550, damping: 36 },
                scaleX: { type: 'spring', stiffness: 550, damping: 28 },
                scaleY: { type: 'spring', stiffness: 550, damping: 28 },
              }
        }
        style={{ transformOrigin: 'center' }}
        className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm"
      />
    </button>
  );
};

export default SquishSwitch;
