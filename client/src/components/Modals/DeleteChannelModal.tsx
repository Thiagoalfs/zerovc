import React, { useEffect } from 'react';
import { Hash, Volume2, Folder } from 'lucide-react';
import { Channel } from '../../types';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { MODAL_DESCRIPTION_CLASS } from '../../constants/modalTypography';

interface DeleteChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  channel: Channel | null;
  isDeleting?: boolean;
}

export const DeleteChannelModal: React.FC<DeleteChannelModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  channel,
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

  if (!isOpen || !channel) return null;

  const isCategory = channel.type === 'category';
  const isVoice = channel.type === 'voice';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeleting) return;
    await onConfirm();
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="delete-channel-modal-title"
      closeOnBackdrop={!isDeleting}
      closeOnEsc={!isDeleting}
    >
      <AppModalHeader
        title={isCategory ? 'Excluir Categoria' : 'Excluir Canal'}
        titleId="delete-channel-modal-title"
        onClose={onClose}
        closeDisabled={isDeleting}
      />

      <AppModalBody onSubmit={handleSubmit}>
        <p className={MODAL_DESCRIPTION_CLASS}>
          {isCategory
            ? 'Tem certeza de que deseja excluir esta categoria? Os canais contidos nela não serão apagados, mas serão movidos para a raiz do servidor.'
            : 'Tem certeza de que deseja excluir permanentemente este canal? Todas as mensagens e arquivos enviados serão apagados e esta ação não poderá ser desfeita.'}
        </p>

        {/* Prévia do canal a ser excluído */}
        <div className="bg-background-darkest/80 rounded-xl p-3 border border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 flex-shrink-0">
            {isCategory ? (
              <Folder className="w-5 h-5 text-amber-400/80" />
            ) : isVoice ? (
              <Volume2 className="w-5 h-5 text-gray-300" />
            ) : (
              <Hash className="w-5 h-5 text-gray-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white truncate">
              {channel.name}
            </div>
            <div className="text-[11px] text-gray-400 truncate">
              {isCategory ? 'Categoria de Canais' : isVoice ? 'Canal de Voz' : 'Canal de Texto'}
            </div>
          </div>
        </div>

        <AppModalFooter
          align="end"
          onCancel={onClose}
          cancelDisabled={isDeleting}
          confirmText={isDeleting ? 'Excluindo...' : isCategory ? 'Excluir Categoria' : 'Excluir Canal'}
          confirmType="error"
          confirmHtmlType="submit"
          loading={isDeleting}
        />
      </AppModalBody>
    </AppModal>
  );
};
