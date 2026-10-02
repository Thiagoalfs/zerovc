import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption<T = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface DropdownSelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  prefixIcon?: React.ReactNode;
  align?: 'left' | 'right';
}

export function DropdownSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  disabled = false,
  className = 'w-full',
  buttonClassName = '',
  menuClassName = '',
  prefixIcon,
  align = 'left',
}: DropdownSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full bg-background-darker hover:bg-background-dark border border-white/10 hover:border-white/20 px-3.5 py-2.5 rounded-xl flex items-center justify-between text-xs sm:text-sm font-medium text-gray-200 transition-all cursor-pointer shadow-sm group disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'border-brand-500/50 ring-1 ring-brand-500/30' : ''
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          {prefixIcon && <span className="flex-shrink-0 text-gray-400">{prefixIcon}</span>}
          {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
          <span className="truncate font-medium text-left">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-gray-400 group-hover:text-white transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-brand-400' : ''
          }`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div
            className={`absolute ${
              align === 'right' ? 'right-0' : 'left-0'
            } top-full mt-1.5 w-full min-w-[200px] max-h-60 overflow-y-auto z-50 bg-background-darker border border-white/10 p-1.5 rounded-xl shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 no-scrollbar ${menuClassName}`}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={opt.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!opt.disabled) {
                      onChange(opt.value);
                      setIsOpen(false);
                    }
                  }}
                  className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-left text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'bg-brand-500/20 text-brand-400 font-semibold'
                      : 'hover:bg-white/5 text-gray-300 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                    <span className="truncate">{opt.label}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-brand-400 flex-shrink-0 ml-2" />}
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500 text-center select-none">
                Nenhuma opção disponível
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
