import React, { useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Trash2, Loader2, FileText } from 'lucide-react';
import { Message, DMMessage, DMGroupMessage } from '../../types';
import { formatAssetUrl } from '../../lib/api';
import { FormattedMessage } from '../Chat/FormattedMessage';

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
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !message) return null;

  const author = message.author;
  const timeStr = (() => {
    try {
      return format(new Date(message.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR });
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
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-background-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Excluir mensagem</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            Tem certeza de que deseja excluir esta mensagem? Esta ação não pode ser desfeita.
          </p>
        </div>

        {/* Message Preview Box */}
        <div className="px-5 py-2">
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
        </div>

        {/* Action Buttons Footer */}
        <div className="p-5 pt-3 bg-background-darkest/60 border-t border-white/5 flex items-center justify-end gap-3 mt-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:underline transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={isDeleting}
            onClick={handleSubmit}
            className="bg-dnd hover:bg-red-600 active:scale-95 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-red-500/20 flex items-center gap-2 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Excluindo...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
