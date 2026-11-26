import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface ClipTabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

interface ClipTabsProps<T extends string> {
  items: ClipTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  role?: 'tablist' | 'radiogroup';
  className?: string;
  buttonClassName?: string;
  activeClassName?: string;
  radiusPx?: number;
}

/**
 * Duplicate-tablist clip-path switcher (Emil Kowalski pattern):
 * Renders an active cobalt copy over the base tab list and animates
 * `clip-path: inset(...)` so text and fill invert in one seamless pass.
 */
export function ClipTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  role = 'tablist',
  className = '',
  buttonClassName = '',
  activeClassName = 'bg-[#2563EB] text-white',
  radiusPx = 10,
}: ClipTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hasMeasuredRef = useRef(false);
  const [clipPath, setClipPath] = useState<string>('inset(0 100% 0 0)');
  const [animateClip, setAnimateClip] = useState(false);

  const measure = useCallback(
    (shouldAnimate: boolean) => {
      const container = containerRef.current;
      const activeEl = itemRefs.current[value];
      if (!container || !activeEl) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;

      const top = activeEl.offsetTop;
      const left = activeEl.offsetLeft;
      const right = Math.max(0, cw - (left + activeEl.offsetWidth));
      const bottom = Math.max(0, ch - (top + activeEl.offsetHeight));

      setAnimateClip(shouldAnimate && hasMeasuredRef.current);
      setClipPath(`inset(${top}px ${right}px ${bottom}px ${left}px round ${radiusPx}px)`);
      hasMeasuredRef.current = true;
    },
    [value, radiusPx]
  );

  useLayoutEffect(() => {
    measure(true);
  }, [measure]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure]);

  const itemRole = role === 'tablist' ? 'tab' : 'radio';

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={ariaLabel}
      className={`relative ${className}`}
    >
      {/* Interactive base layer */}
      {items.map((item) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[item.id] = el;
            }}
            type="button"
            role={itemRole}
            aria-selected={role === 'tablist' ? isActive : undefined}
            aria-checked={role === 'radiogroup' ? isActive : undefined}
            onClick={() => onChange(item.id)}
            className={`relative z-10 pub-press cursor-pointer select-none ${
              isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
            } ${buttonClassName}`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
          </button>
        );
      })}

      {/* Clipped active cobalt overlay for seamless color inversion */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-20 ${className} ${
          animateClip ? 'pub-tab-clip-layer' : ''
        }`}
        style={{
          clipPath,
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          boxShadow: 'none',
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={`select-none ${activeClassName} ${buttonClassName}`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge}
          </div>
        ))}
      </div>
    </div>
  );
}
