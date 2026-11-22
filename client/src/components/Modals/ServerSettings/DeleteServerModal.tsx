import React from 'react';
import { Lock } from 'lucide-react';
import { Guild, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';
import { OtpInput } from '../../ui/otp-input';
import {
  MODAL_FIELD_LABEL_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../../constants/modalTypography';
import { ModalButton } from '@/components/ui/modal-button';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';

interface DeleteServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeGuild: Guild;
  user: User | null;
  deleteConfirmText: string;
  setDeleteConfirmText: (val: string) => void;
  isDeleteAcknowledged: boolean;
  setIsDeleteAcknowledged: (val: boolean) => void;
  twoFactorCode: string;
  setTwoFactorCode: (val: string) => void;
  deleteError: string;
  setDeleteError: (val: string) => void;
  isDeleting: boolean;
  onConfirmDelete: () => Promise<void>;
  membersCount: number;
  is2FARequired?: boolean;
}

export const DeleteServerModal: React.FC<DeleteServerModalProps> = ({
  isOpen,
  onClose,
  activeGuild,
  user,
  deleteConfirmText,
  setDeleteConfirmText,
  isDeleteAcknowledged,
  setIsDeleteAcknowledged,
  twoFactorCode,
  setTwoFactorCode,
  deleteError,
  setDeleteError,
  isDeleting,
  onConfirmDelete,
  membersCount,
  is2FARequired,
}) => {
  const [useBackupCode, setUseBackupCode] = React.useState(false);
  const has2FA = Boolean(user?.two_factor_enabled) || Boolean(is2FARequired);

  const initials = activeGuild.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="delete-server-modal-title"
      closeOnBackdrop={!isDeleting}
      closeOnEsc={!isDeleting}
    >
      <AppModalHeader
        title="Excluir servidor"
        titleId="delete-server-modal-title"
        onClose={onClose}
        closeDisabled={isDeleting}
      />

      <AppModalBody>
        <p className={MODAL_DESCRIPTION_CLASS}>
          Tem certeza de que deseja excluir o servidor <span className="font-semibold text-white">"{activeGuild.name}"</span>? Esta ação não pode ser desfeita.
        </p>

        {/* Server Preview Box */}
        <div className="bg-background-darkest/90 rounded-2xl p-3 border border-white/5 shadow-inner flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0 overflow-hidden shadow-md">
            {activeGuild.icon_url ? (
              <img
                src={formatAssetUrl(activeGuild.icon_url)}
                alt={activeGuild.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-xs text-white truncate">
              {activeGuild.name}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {membersCount} membro(s) • {(activeGuild.channels || []).length} canal(is)
            </div>
          </div>
        </div>

        {deleteError && <InlineAlert variant="error">{deleteError}</InlineAlert>}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              Digite o nome do servidor
            </label>
            <ModalButton
              type="tertiary"
              size="tiny"
              onClick={() => {
                setDeleteConfirmText(activeGuild.name);
                if (deleteError) setDeleteError('');
              }}
            >
              Preencher
            </ModalButton>
          </div>
          <AppInput
            type="text"
            value={deleteConfirmText}
            onChange={(e) => {
              setDeleteConfirmText(e.target.value);
              if (deleteError) setDeleteError('');
            }}
            placeholder={activeGuild.name}
            autoFocus
            className="text-xs focus:border-red-500"
          />
        </div>

        {has2FA && (
          <div className="space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <label className={`${MODAL_FIELD_LABEL_CLASS} flex items-center gap-1.5`}>
                <Lock className="w-3.5 h-3.5 text-brand-400" />
                <span>{useBackupCode ? 'Código de backup (2FA)' : 'Código de autenticação (2FA)'}</span>
              </label>
              <ModalButton
                type="tertiary"
                size="tiny"
                onClick={() => {
                  setUseBackupCode((v) => !v);
                  setTwoFactorCode('');
                  if (deleteError) setDeleteError('');
                }}
              >
                {useBackupCode ? 'Usar 6 dígitos' : 'Usar backup'}
              </ModalButton>
            </div>
            {useBackupCode ? (
              <AppInput
                type="text"
                autoComplete="one-time-code"
                maxLength={12}
                value={twoFactorCode}
                onChange={(e) => {
                  setTwoFactorCode(e.target.value);
                  if (deleteError) setDeleteError('');
                }}
                placeholder="xxxx-xxxx"
                className="text-xs font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal"
              />
            ) : (
              <div className="flex justify-center pt-1">
                <OtpInput
                  length={6}
                  value={twoFactorCode}
                  onChange={(val) => {
                    setTwoFactorCode(val);
                    if (deleteError) setDeleteError('');
                  }}
                  size="sm"
                  status={deleteError ? 'error' : 'idle'}
                  slotClassName="bg-background-darkest/90 border border-white/10"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/5">
          <input
            type="checkbox"
            id="delete-server-ack"
            checked={isDeleteAcknowledged}
            onChange={(e) => {
              setIsDeleteAcknowledged(e.target.checked);
              if (deleteError) setDeleteError('');
            }}
            className="w-4 h-4 rounded border-gray-600 bg-background-darkest text-red-600 focus:ring-red-500 cursor-pointer shrink-0"
          />
          <label
            htmlFor="delete-server-ack"
            className="text-xs text-gray-300 cursor-pointer select-none leading-tight"
          >
            Estou ciente de que todos os canais e mensagens serão excluídos permanentemente.
          </label>
        </div>

        <AppModalFooter
          align="end"
          onCancel={onClose}
          cancelDisabled={isDeleting}
          confirmText={isDeleting ? 'Excluindo...' : 'Excluir servidor'}
          confirmType="error"
          onConfirm={onConfirmDelete}
          loading={isDeleting}
          disabled={has2FA && !twoFactorCode.trim()}
        />
      </AppModalBody>
    </AppModal>
  );
};
