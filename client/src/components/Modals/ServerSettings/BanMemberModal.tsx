import React from 'react';
import { Ban } from 'lucide-react';
import { User } from '../../../types';
import {
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_CARD_PADDING_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_CANCEL_BUTTON_CLASS,
  MODAL_DANGER_BUTTON_CLASS,
  MODAL_BACKDROP_CLASS,
} from '../../../constants/modalTypography';

interface BanMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  banModalUser: User | null;
  banReason: string;
  setBanReason: (val: string) => void;
  onConfirmBan: (e: React.FormEvent) => Promise<void>;
}

export const BanMemberModal: React.FC<BanMemberModalProps> = ({
  isOpen,
  onClose,
  banModalUser,
  banReason,
  setBanReason,
  onConfirmBan,
}) => {
  if (!isOpen || !banModalUser) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={MODAL_BACKDROP_CLASS}
    >
      <div className={`w-full max-w-md max-h-[92dvh] my-auto bg-background-darker rounded-xl border border-red-500/30 shadow-2xl ${MODAL_CARD_PADDING_CLASS} text-gray-200 overflow-y-auto chat-scrollbar`}>
        <h3 className={`${MODAL_DIALOG_TITLE_CLASS} mb-1 flex items-center gap-2`}>
          <Ban className="w-5 h-5 text-red-500" />
          <span>Banir @{banModalUser.username}</span>
        </h3>
        <p className={`${MODAL_DESCRIPTION_CLASS} mb-4`}>
          O membro será desconectado e impedido de reentrar no servidor até ser desbanido.
        </p>

        <form onSubmit={onConfirmBan} className="space-y-4">
          <div className="space-y-1.5">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              Motivo do Banimento (Opcional)
            </label>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Ex: Violação das regras da comunidade..."
              rows={3}
              className="w-full px-3 py-2 bg-background-darkest border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className={MODAL_CANCEL_BUTTON_CLASS}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={MODAL_DANGER_BUTTON_CLASS}
            >
              Confirmar Banimento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
