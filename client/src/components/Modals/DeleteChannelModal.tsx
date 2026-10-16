import React, { useEffect } from 'react';
import { X, Trash2, Hash, Volume2, Folder, Loader2 } from 'lucide-react';
import { Channel } from '../../types';
import {
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_HEADER_PADDING_CLASS,
  MODAL_FOOTER_PADDING_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_CANCEL_BUTTON_CLASS,
  MODAL_DANGER_BUTTON_CLASS,
  MODAL_BACKDROP_CLASS,
} from '../../constants/modalTypography';

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
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!isDeleting) {
          onConfirm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onConfirm, isDeleting]);

  if (!isOpen || !channel) return null;

  const isCategory = channel.type === 'category';
  const isVoice = channel.type === 'voice';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeleting) return;
    await onConfirm();
  };

  return (
    <div
      className={MODAL_BACKDROP_CLASS}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <div
        className="bg-background-dark w-full max-w-md max-h-[92dvh] my-auto rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col text-gray-200 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com ícone de perigo */}
        <div className={`${MODAL_HEADER_PADDING_CLASS} flex-shrink-0`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className={`${MODAL_DIALOG_TITLE_CLASS} flex items-center gap-2 text-white`}>
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <span>{isCategory ? 'Excluir Categoria' : 'Excluir Canal'}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className={MODAL_DESCRIPTION_CLASS}>
            {isCategory
              ? 'Tem certeza de que deseja excluir esta categoria? Os canais contidos nela não serão apagados, mas serão movidos para a raiz do servidor.'
              : 'Tem certeza de que deseja excluir permanentemente este canal? Todas as mensagens e arquivos enviados serão apagados e esta ação não poderá ser desfeita.'}
          </p>
        </div>

        {/* Prévia do canal a ser excluído */}
        <div className="px-4 sm:px-6 py-2">
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
              <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                {!isCategory && <span className="text-gray-400 font-normal">{isVoice ? '🔊' : '#'}</span>}
                <span className="truncate">{channel.name}</span>
              </div>
              <div className="text-[11px] text-gray-400 truncate">
                {isCategory ? 'Categoria de Canais' : isVoice ? 'Canal de Voz' : 'Canal de Texto'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer com botões de ação */}
        <form onSubmit={handleSubmit} className={`${MODAL_FOOTER_PADDING_CLASS} bg-background-darkest/40 border-t border-white/5 flex items-center justify-end gap-3 mt-4`}>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className={MODAL_CANCEL_BUTTON_CLASS}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isDeleting}
            className={`${MODAL_DANGER_BUTTON_CLASS} min-w-[120px] flex items-center justify-center gap-2`}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Excluindo...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>{isCategory ? 'Excluir Categoria' : 'Excluir Canal'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
