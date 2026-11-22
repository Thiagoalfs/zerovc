import React from 'react';
import {
  Plus,
  Link as LinkIcon,
  Check,
  Copy,
  Trash2,
} from 'lucide-react';
import { GuildInvite } from '../../../types';
import { useStreamerModeStore } from '../../../stores/streamerModeStore';
import { MODAL_DESCRIPTION_CLASS } from '../../../constants/modalTypography';
import { ModalButton } from '@/components/ui/modal-button';

interface InvitesTabProps {
  invitesList: GuildInvite[];
  isLoadingInvites: boolean;
  isCreatingInvite: boolean;
  handleGenerateNewInvite: () => Promise<void>;
  handleCopyInviteLink: (code: string) => void;
  handleRevokeInvite: (code: string) => Promise<void>;
  copiedCode: string | null;
  isOwner: boolean;
  hasAdmin?: boolean;
  canManageGuild?: boolean;
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
  hasAdmin,
  canManageGuild,
}) => {
  const isStreamerModeHidingInvites = useStreamerModeStore((s) => s.enabled && s.hideInviteLinks);
  return (
    <div className="max-w-4xl space-y-6 animate-fade-in py-6">
      {/* Mobile-only create invite button */}
      <div className="md:hidden flex justify-end">
        <ModalButton
          type="primary"
          fullWidth
          onClick={handleGenerateNewInvite}
          loading={isCreatingInvite}
          prefix={<Plus className="w-4 h-4" />}
        >
          {isCreatingInvite ? 'Gerando...' : 'Gerar Novo Link'}
        </ModalButton>
      </div>

      {isLoadingInvites ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : invitesList.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl bg-background-darker/60 border border-white/10">
          <LinkIcon className="w-12 h-12 stroke-1 text-gray-500 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-white">Nenhum link de convite ativo</h4>
          <p className={`${MODAL_DESCRIPTION_CLASS} max-w-sm mx-auto mt-1`}>
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
                className="p-4 rounded-2xl bg-background-darker border border-white/10 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-brand-400">
                      {isStreamerModeHidingInvites ? '••••••••' : inv.code}
                    </span>
                    <span className="text-xs text-gray-500 truncate font-mono">
                      ({isStreamerModeHidingInvites ? `${origin}/invite/••••••••` : fullLink})
                    </span>
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
                  <ModalButton
                    type="secondary"
                    size="small"
                    onClick={() => handleCopyInviteLink(inv.code)}
                    prefix={isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  >
                    {isCopied ? 'Copiado!' : 'Copiar'}
                  </ModalButton>

                  {(isOwner || hasAdmin || canManageGuild) && (
                    <ModalButton
                      type="error"
                      size="small"
                      svgOnly
                      onClick={() => handleRevokeInvite(inv.code)}
                      title="Revogar / Excluir Convite"
                      aria-label="Revogar / Excluir Convite"
                    >
                      <Trash2 className="w-4 h-4" />
                    </ModalButton>
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
