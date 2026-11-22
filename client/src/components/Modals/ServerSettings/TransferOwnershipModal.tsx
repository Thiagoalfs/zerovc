import React from 'react';
import { Search, Check } from 'lucide-react';
import { Guild, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';

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
  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      titleId="transfer-ownership-modal-title"
      className="border-amber-500/40"
    >
      <AppModalHeader
        title="Transferir posse do servidor"
        titleId="transfer-ownership-modal-title"
        onClose={onClose}
      />

      <AppModalBody onSubmit={onConfirmTransfer}>
        <InlineAlert variant="warning">
          Você deixará de ser o dono do servidor e passará a ser um administrador. Esta ação não poderá ser desfeita por você após a confirmação.
        </InlineAlert>

        {transferError && <InlineAlert variant="error">{transferError}</InlineAlert>}

        <div className="space-y-1.5">
          <AppInput
            label="1. Selecione o novo dono"
            leftIcon={<Search className="w-4 h-4" />}
            type="text"
            value={transferSearchQuery}
            onChange={(e) => setTransferSearchQuery(e.target.value)}
            placeholder="Filtrar membro..."
            className="text-xs focus:border-amber-500"
            containerClassName="mb-2"
          />

          <div className="max-h-36 overflow-y-auto space-y-1 bg-background-darkest/60 p-2 rounded-xl border border-white/10 chat-scrollbar">
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
                      isSelected ? 'bg-amber-500/20 border border-amber-500/40 text-white' : 'hover:bg-background-dark text-gray-300'
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
                className="mt-0.5 rounded bg-background-darkest border-white/10 text-amber-500 focus:ring-0"
              />
              <span>
                Reconheço que estou transferindo irreversivelmente a posse para <strong>@{transferTargetUser.username}</strong>.
              </span>
            </label>

            <AppInput
              label={
                <>
                  2. Digite o nome do servidor para confirmar:{' '}
                  <span className="text-white select-all">{activeGuild.name}</span>
                </>
              }
              type="text"
              value={transferConfirmText}
              onChange={(e) => setTransferConfirmText(e.target.value)}
              placeholder={activeGuild.name}
              className="text-xs focus:border-amber-500"
            />
          </div>
        )}

        <AppModalFooter
          align="end"
          onCancel={onClose}
          confirmText={isTransferring ? 'Transferindo...' : 'Confirmar transferência'}
          confirmType="warning"
          confirmHtmlType="submit"
          loading={isTransferring}
          disabled={
            !transferTargetUser ||
            !transferAcknowledge ||
            transferConfirmText.trim() !== activeGuild.name.trim()
          }
        />
      </AppModalBody>
    </AppModal>
  );
};
