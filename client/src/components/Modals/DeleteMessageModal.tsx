import React, { useEffect } from 'react';
import { formatDateWithTime } from '../../utils/date';
import { FileText } from 'lucide-react';
import { Message, DMMessage, DMGroupMessage } from '../../types';
import { formatAssetUrl } from '../../lib/api';
import { FormattedMessage } from '../Chat/FormattedMessage';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { MODAL_DESCRIPTION_CLASS } from '../../constants/modalTypography';

interface DeleteMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  message: Message | DMMessage | DMGroupMessage | null;
  isDeleting?: boolean;
}

export const DeleteMessageModal: React.FC<DeleteMessageModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  message,
  isDeleting = false,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!isDeleting) {
          onConfirm();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, isDeleting]);

  if (!isOpen || !message) return null;

  const author = message.author;
  const timeStr = (() => {
    try {
      return formatDateWithTime(new Date(message.created_at));
    } catch {
      return '';
    }
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeleting) return;
    await onConfirm();
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="delete-message-modal-title"
      closeOnBackdrop={!isDeleting}
      closeOnEsc={!isDeleting}
    >
      <AppModalHeader
        title="Excluir mensagem"
        titleId="delete-message-modal-title"
        onClose={onClose}
        closeDisabled={isDeleting}
      />

      <AppModalBody onSubmit={handleSubmit}>
        <p className={MODAL_DESCRIPTION_CLASS}>
          Tem certeza de que deseja excluir esta mensagem? Esta ação não pode ser desfeita.
        </p>

        {/* Message Preview Box */}
        <div className="bg-background-darkest/90 rounded-2xl p-3 border border-white/5 shadow-inner flex items-start gap-3">
          {/* Author Avatar */}
          <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0 overflow-hidden shadow-md">
            {author?.avatar_url ? (
              <img
                src={formatAssetUrl(author.avatar_url)}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{author?.display_name?.[0]?.toUpperCase() || author?.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>

          {/* Author Name, Timestamp & Message Body */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-semibold text-xs text-white truncate">
                {author?.display_name || author?.username || 'Usuário'}
              </span>
              {timeStr && (
                <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                  {timeStr}
                </span>
              )}
            </div>

            {/* Message Content */}
            {message.content && (
              <div className="text-xs text-gray-200 break-words leading-relaxed">
                <FormattedMessage content={message.content} />
              </div>
            )}

            {/* Attachments preview if any */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {message.attachments.map((att, idx) => {
                  const isImg = att.type?.startsWith('image/');
                  if (isImg) {
                    return (
                      <div
                        key={idx}
                        className="rounded-xl overflow-hidden border border-white/10 max-w-[200px] max-h-32 bg-black/40"
                      >
                        <img
                          src={formatAssetUrl(att.url)}
                          alt={att.filename}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-white/5 rounded-xl text-xs text-gray-300 max-w-xs"
                    >
                      <FileText className="w-4 h-4 text-brand-400 flex-shrink-0" />
                      <span className="truncate">{att.filename}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <AppModalFooter
          align="end"
          onCancel={onClose}
          cancelDisabled={isDeleting}
          confirmText={isDeleting ? 'Excluindo...' : 'Excluir'}
          confirmType="error"
          confirmHtmlType="submit"
          loading={isDeleting}
        />
      </AppModalBody>
    </AppModal>
  );
};
