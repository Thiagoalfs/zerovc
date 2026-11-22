import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANT_STYLES = {
  error: 'bg-red-500/10 border-red-500/20 text-red-400',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  info: 'bg-brand-500/10 border-brand-500/20 text-brand-300',
} as const;

const VARIANT_ICONS = {
  error: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

export interface InlineAlertProps {
  variant?: keyof typeof VARIANT_STYLES;
  icon?: React.ReactNode | false;
  onDismiss?: () => void;
  className?: string;
  children: React.ReactNode;
}

export const InlineAlert: React.FC<InlineAlertProps> = ({
  variant = 'error',
  icon,
  onDismiss,
  className,
  children,
}) => {
  const DefaultIcon = VARIANT_ICONS[variant];

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 p-3 rounded-xl border text-xs leading-relaxed',
        VARIANT_STYLES[variant],
        className
      )}
    >
      {icon !== false && (
        <span className="shrink-0 mt-0.5">
          {icon ?? <DefaultIcon className="w-4 h-4" />}
        </span>
      )}
      <div className="flex-1 min-w-0">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar aviso"
          className="shrink-0 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
