import React from 'react';
import { cn } from '@/lib/utils';
import { MODAL_FIELD_LABEL_CLASS } from '@/constants/modalTypography';

export interface AppInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  error?: string | null;
  containerClassName?: string;
}

export const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(
  (
    {
      label,
      leftIcon,
      rightElement,
      error,
      id,
      className,
      containerClassName,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className={cn('space-y-1.5', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className={MODAL_FIELD_LABEL_CLASS}>
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 flex items-center">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full bg-background-darkest border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
              leftIcon && 'pl-9',
              rightElement && 'pr-10',
              error && 'border-red-500/50 focus:border-red-500',
              className
            )}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
              {rightElement}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);
AppInput.displayName = 'AppInput';

export interface AppTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  error?: string | null;
  containerClassName?: string;
}

export const AppTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AppTextareaProps
>(({ label, error, id, className, containerClassName, ...props }, ref) => {
  const generatedId = React.useId();
  const textareaId = id ?? generatedId;

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label && (
        <label htmlFor={textareaId} className={MODAL_FIELD_LABEL_CLASS}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        className={cn(
          'w-full bg-background-darkest border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors resize-none disabled:opacity-60 disabled:cursor-not-allowed',
          error && 'border-red-500/50 focus:border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
});
AppTextarea.displayName = 'AppTextarea';
