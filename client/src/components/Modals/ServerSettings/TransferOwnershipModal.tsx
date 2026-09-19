import React from 'react';
import { Crown, Search, Check } from 'lucide-react';
import { Guild, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';

interface TransferOwnershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeGuild: Guild;
  user: User | null;
  members: User[];
  transferTargetUser: User | null;
  setTransferTargetUser: (u: User | null) => void;
  transferConfirmText: string;
  setTransferConfirmText: (val: string) => void;
  transferAcknowledge: boolean;
  setTransferAcknowledge: (val: boolean) => void;
  transferSearchQuery: string;
  setTransferSearchQuery: (val: string) => void;
  transferError: string;
  isTransferring: boolean;
  onConfirmTransfer: (e: React.FormEvent) => Promise<void>;
}

export const TransferOwnershipModal: React.FC<TransferOwnershipModalProps> = ({
  isOpen,
  onClose,
  activeGuild,
  user,
  members,
  transferTargetUser,
  setTransferTargetUser,
  transferConfirmText,
  setTransferConfirmText,
  transferAcknowledge,
  setTransferAcknowledge,
  transferSearchQuery,
  setTransferSearchQuery,
  transferError,
  isTransferring,
  onConfirmTransfer,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{ zIndex: 99999 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-fade-in"
    >
      <div className="w-full max-w-lg max-h-[92dvh] my-auto bg-[#1e1f22] rounded-2xl border border-amber-500/40 shadow-2xl p-4 sm:p-6 text-gray-200 overflow-y-auto no-scrollbar">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Transferir Posse do Servidor</h3>
            <p className="text-xs text-gray-400">Passe o controle total deste servidor para outro membro</p>
          </div>
        </div>

        <div className="p-3.5 my-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
          ⚠️ <strong>Atenção:</strong> Você deixará de ser o dono do servidor e passará a ser um administrador. Esta ação não poderá ser desfeita por você após a confirmação.
        </div>

        {transferError && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
            {transferError}
          </div>
        )}

        <form onSubmit={onConfirmTransfer} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
              1. Selecione o Novo Dono
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={transferSearchQuery}
                onChange={(e) => setTransferSearchQuery(e.target.value)}
                placeholder="Filtrar membro..."
                className="w-full pl-9 pr-4 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-xs mb-2 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1 bg-[#111214]/60 p-2 rounded-xl border border-white/10 custom-scrollbar">
              {members
                .filter((m) => m.id !== user?.id)
                .filter((m) =>
                  !transferSearchQuery.trim() ||
                  m.username.toLowerCase().includes(transferSearchQuery.toLowerCase()) ||
                  (m.display_name && m.display_name.toLowerCase().includes(transferSearchQuery.toLowerCase()))
                )
                .map((m) => {
                  const isSelected = transferTargetUser?.id === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setTransferTargetUser(m)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-amber-500/20 border border-amber-500/40 text-white' : 'hover:bg-[#18191c] text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden shrink-0">
                          {m.avatar_url ? (
                            <img src={formatAssetUrl(m.avatar_url)} alt={m.username} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white bg-brand-600">
                              {m.username[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-semibold">{m.display_name || m.username}</span>
                        <span className="text-[11px] text-gray-500">@{m.username}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                    </div>
                  );
                })}
            </div>
          </div>

          {transferTargetUser && (
            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-300 select-none">
                <input
                  type="checkbox"
                  checked={transferAcknowledge}
                  onChange={(e) => setTransferAcknowledge(e.target.checked)}
                  className="mt-0.5 rounded bg-[#111214] border-white/10 text-amber-500 focus:ring-0"
                />
                <span>
                  Reconheço que estou transferindo irreversivelmente a posse para <strong>@{transferTargetUser.username}</strong>.
                </span>
              </label>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                  2. Digite o nome do servidor para confirmar: <span className="text-white select-all">{activeGuild.name}</span>
                </label>
                <input
                  type="text"
                  value={transferConfirmText}
                  onChange={(e) => setTransferConfirmText(e.target.value)}
                  placeholder={activeGuild.name}
                  className="w-full px-4 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                isTransferring ||
                !transferTargetUser ||
                !transferAcknowledge ||
                transferConfirmText.trim() !== activeGuild.name.trim()
              }
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-amber-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isTransferring ? 'Transferindo...' : 'Confirmar Transferência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
