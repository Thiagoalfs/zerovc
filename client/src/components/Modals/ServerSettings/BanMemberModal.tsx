import React from 'react';
import { Ban } from 'lucide-react';
import { User } from '../../../types';

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
      style={{ zIndex: 99999 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-fade-in"
    >
      <div className="w-full max-w-md max-h-[92dvh] my-auto bg-[#1e1f22] rounded-2xl border border-red-500/30 shadow-2xl p-4 sm:p-6 text-gray-200 overflow-y-auto no-scrollbar">
        <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <Ban className="w-5 h-5 text-red-500" />
          <span>Banir @{banModalUser.username}</span>
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          O membro será desconectado e impedido de reentrar no servidor até ser desbanido.
        </p>

        <form onSubmit={onConfirmBan} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
              Motivo do Banimento (Opcional)
            </label>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Ex: Violação das regras da comunidade..."
              rows={3}
              className="w-full px-3 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-red-600/20 transition-colors cursor-pointer"
            >
              Confirmar Banimento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
