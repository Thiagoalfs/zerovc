import React from 'react';
import { Clock } from 'lucide-react';
import { User } from '../../../types';
import {
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_CARD_PADDING_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_CANCEL_BUTTON_CLASS,
  MODAL_BACKDROP_CLASS,
} from '../../../constants/modalTypography';

interface MuteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  muteModalUser: User | null;
  onMuteDuration: (durationSeconds: number) => Promise<void>;
}

export const MuteMemberModal: React.FC<MuteMemberModalProps> = ({
  isOpen,
  onClose,
  muteModalUser,
  onMuteDuration,
}) => {
  if (!isOpen || !muteModalUser) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={MODAL_BACKDROP_CLASS}
    >
      <div className={`w-full max-w-md max-h-[92dvh] my-auto bg-background-darker rounded-xl border border-white/10 shadow-2xl ${MODAL_CARD_PADDING_CLASS} text-gray-200 overflow-y-auto chat-scrollbar`}>
        <h3 className={`${MODAL_DIALOG_TITLE_CLASS} mb-1 flex items-center gap-2`}>
          <Clock className="w-5 h-5 text-amber-400" />
          <span>Silenciar @{muteModalUser.username}</span>
        </h3>
        <p className={`${MODAL_DESCRIPTION_CLASS} mb-5`}>
          Escolha por quanto tempo o membro ficará silenciado no servidor.
        </p>

        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <button
            type="button"
            onClick={() => onMuteDuration(15 * 60)}
            className="p-3 bg-background-dark hover:bg-background-light text-white rounded-xl text-xs font-semibold text-center border border-white/10 transition-colors cursor-pointer"
          >
            15 Minutos
          </button>
          <button
            type="button"
            onClick={() => onMuteDuration(60 * 60)}
            className="p-3 bg-background-dark hover:bg-background-light text-white rounded-xl text-xs font-semibold text-center border border-white/10 transition-colors cursor-pointer"
          >
            1 Hora
          </button>
          <button
            type="button"
            onClick={() => onMuteDuration(24 * 60 * 60)}
            className="p-3 bg-background-dark hover:bg-background-light text-white rounded-xl text-xs font-semibold text-center border border-white/10 transition-colors cursor-pointer"
          >
            24 Horas (1 Dia)
          </button>
          <button
            type="button"
            onClick={() => onMuteDuration(7 * 24 * 60 * 60)}
            className="p-3 bg-background-dark hover:bg-background-light text-white rounded-xl text-xs font-semibold text-center border border-white/10 transition-colors cursor-pointer"
          >
            7 Dias (1 Semana)
          </button>
          <button
            type="button"
            onClick={() => onMuteDuration(-1)}
            className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-xl text-xs font-semibold text-center border border-red-500/30 transition-colors cursor-pointer"
          >
            Permanente
          </button>
          <button
            type="button"
            onClick={() => onMuteDuration(0)}
            className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-xl text-xs font-semibold text-center border border-emerald-500/30 transition-colors cursor-pointer"
          >
            Remover Silêncio
          </button>
        </div>

        <div className="flex justify-end pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            className={MODAL_CANCEL_BUTTON_CLASS}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
