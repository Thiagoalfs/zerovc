import React from 'react';
import {
  Plus,
  Link as LinkIcon,
  Check,
  Copy,
  Trash2,
} from 'lucide-react';
import { GuildInvite } from '../../../types';

interface InvitesTabProps {
  invitesList: GuildInvite[];
  isLoadingInvites: boolean;
  isCreatingInvite: boolean;
  handleGenerateNewInvite: () => Promise<void>;
  handleCopyInviteLink: (code: string) => void;
  handleRevokeInvite: (code: string) => Promise<void>;
  copiedCode: string | null;
  isOwner: boolean;
}

export const InvitesTab: React.FC<InvitesTabProps> = ({
  invitesList,
  isLoadingInvites,
  isCreatingInvite,
  handleGenerateNewInvite,
  handleCopyInviteLink,
  handleRevokeInvite,
  copiedCode,
  isOwner,
}) => {
  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-[#1e1f22] border border-white/10">
        <div>
          <h3 className="text-sm font-bold text-white">Gerenciamento de Links de Convite</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Veja todos os links de convite ativos gerados para este servidor.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerateNewInvite}
          disabled={isCreatingInvite}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-500/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{isCreatingInvite ? 'Gerando...' : 'Gerar Novo Link'}</span>
        </button>
      </div>

      {isLoadingInvites ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : invitesList.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl bg-[#1e1f22]/60 border border-white/10">
          <LinkIcon className="w-12 h-12 stroke-1 text-gray-500 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-white">Nenhum link de convite ativo</h4>
          <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
            Crie um link de convite acima para convidar seus amigos para o servidor!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invitesList.map((inv) => {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zerovc.safiroko.xyz';
            const fullLink = `${origin}/invite/${inv.code}`;
            const isCopied = copiedCode === inv.code;

            return (
              <div
                key={inv.code}
                className="p-4 rounded-2xl bg-[#1e1f22] border border-white/10 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-brand-400">{inv.code}</span>
                    <span className="text-xs text-gray-500 truncate font-mono">({fullLink})</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                    <span>Criado por @{inv.creator?.username || 'membro'}</span>
                    <span>•</span>
                    <span className="text-white font-medium">{inv.uses} {inv.uses === 1 ? 'uso' : 'usos'}</span>
                    <span>•</span>
                    <span>{inv.created_at ? new Date(inv.created_at).toLocaleDateString('pt-BR') : 'Hoje'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyInviteLink(inv.code)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isCopied
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-white/10 hover:bg-white/15 text-white'
                    }`}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
                  </button>

                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(inv.code)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                      title="Revogar / Excluir Convite"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
