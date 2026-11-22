import React from 'react';
import { cn } from '@/lib/utils';
import {
  MODAL_DESCRIPTION_CLASS,
  MODAL_ITEM_ROW_PADDING_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_TOGGLE_HEADER_CLASS,
} from '@/constants/modalTypography';

export interface SettingsGroupProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  cardClassName?: string;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  action,
  children,
  className,
  cardClassName,
}) => (
  <div className={className}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-2 mb-3">
        {title && (
          <h4 className={cn(MODAL_SECTION_HEADER_CLASS, 'mb-0')}>{title}</h4>
        )}
        {action}
      </div>
    )}
    <div
      className={cn(
        'divide-y divide-white/5',
        cardClassName
      )}
    >
      {children}
    </div>
  </div>
);

export interface SettingsRowProps {
  label: React.ReactNode;
  labelId?: string;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  labelId,
  badge,
  description,
  control,
  children,
  className,
}) => (
  <div className={cn(MODAL_ITEM_ROW_PADDING_CLASS, children ? 'space-y-2.5' : '', className)}>
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5 pr-4 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span id={labelId} className={cn(MODAL_TOGGLE_HEADER_CLASS, 'block')}>
            {label}
          </span>
          {badge}
        </div>
        {description && (
          <p className={cn(MODAL_DESCRIPTION_CLASS, 'max-w-md')}>{description}</p>
        )}
      </div>
      {control && <div className="shrink-0">{control}</div>}
    </div>
    {children}
  </div>
);
