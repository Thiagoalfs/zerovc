import React from 'react';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from '@/components/ui/r-dropdown';

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
  placement?: 'auto' | 'top' | 'bottom';
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
  placement = 'auto',
}: DropdownSelectProps<T>) {
  const stringValue = value !== undefined && value !== null ? String(value) : '';
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <Dropdown
      value={stringValue}
      onValueChange={(nextStr) => {
        const matched = options.find((opt) => String(opt.value) === nextStr);
        if (matched && !matched.disabled) {
          onChange(matched.value);
        }
      }}
      disabled={disabled}
      className={className}
    >
      <DropdownTrigger className={buttonClassName}>
        {prefixIcon && <span className="flex-shrink-0 text-gray-400">{prefixIcon}</span>}
        {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
        <span className={`truncate font-medium text-left ${!selectedOption ? 'text-gray-400' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
      </DropdownTrigger>

      <DropdownContent
        align={align === 'right' ? 'end' : 'start'}
        side={placement === 'top' ? 'top' : 'bottom'}
        className={`w-full min-w-[200px] ${menuClassName}`.trim()}
      >
        {options.map((opt) => (
          <DropdownItem
            key={String(opt.value)}
            value={String(opt.value)}
            disabled={opt.disabled}
            textValue={opt.label}
          >
            {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
            <span className="whitespace-normal break-words leading-snug">{opt.label}</span>
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
