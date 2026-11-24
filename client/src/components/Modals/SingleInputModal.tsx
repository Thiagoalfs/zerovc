import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';
import { MODAL_DESCRIPTION_CLASS } from '../../constants/modalTypography';

export interface SingleInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  subtitle?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  leftIcon?: React.ReactNode;
  maxLength?: number;
  helperText?: string;
  allowEmpty?: boolean;
  confirmText: string;
  loadingText?: string;
  footerAlign?: 'between' | 'end';
  usePortal?: boolean;
  onSubmit: (value: string) => Promise<unknown>;
}

export const SingleInputModal: React.FC<SingleInputModalProps> = ({
  isOpen,
  onClose,
  titleId,
  title,
  subtitle,
  label,
  initialValue = '',
  placeholder,
  leftIcon,
  maxLength,
  helperText,
  allowEmpty = false,
  confirmText,
  loadingText,
  footerAlign = 'between',
  usePortal = false,
  onSubmit,
}) => {
  const [value, setValue] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setError('');
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const trimmed = value.trim();
  const isDisabled = !allowEmpty && !trimmed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisabled) return;

    setIsLoading(true);
    setError('');
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar');
    } finally {
      setIsLoading(false);
    }
  };

  const modal = (
    <AppModal isOpen={isOpen} onClose={onClose} titleId={titleId}>
      <AppModalHeader
        title={title}
        subtitle={subtitle}
        titleId={titleId}
        onClose={onClose}
      />

      <AppModalBody onSubmit={handleSubmit}>
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <div>
          <AppInput
            label={label}
            leftIcon={leftIcon}
            type="text"
            required={!allowEmpty}
            autoFocus
            value={value}
            placeholder={placeholder}
            maxLength={maxLength}
            onChange={(e) => setValue(e.target.value)}
          />
          {helperText && (
            <p className={`${MODAL_DESCRIPTION_CLASS} mt-1`}>{helperText}</p>
          )}
        </div>

        <AppModalFooter
          align={footerAlign}
          onCancel={onClose}
          confirmText={isLoading && loadingText ? loadingText : confirmText}
          confirmHtmlType="submit"
          loading={isLoading}
          disabled={isDisabled}
        />
      </AppModalBody>
    </AppModal>
  );

  return usePortal ? createPortal(modal, document.body) : modal;
};
