import React, { useState, useEffect, useCallback } from 'react';
import { SquishSwitch } from '../ui/squish-switch';
import { ModalButton } from '@/components/ui/modal-button';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-group';
import { InlineAlert } from '@/components/ui/inline-alert';
import { AppModal, AppModalHeader, AppModalBody, AppModalFooter } from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { showConfirm } from '../../stores/confirmModalStore';
import { identityManager, DeviceIdentityKeys } from '../../crypto/identity';
import { backupManager, BackupStatus } from '../../crypto/backupManager';
import { RecoveryKeyModal } from './RecoveryKeyModal';

const SECURITY_CACHE_TTL_MS = 60_000;
let cachedSecurityState: {
  userId: string;
  identityKeys: DeviceIdentityKeys | null;
  backupStatus: BackupStatus;
  fetchedAt: number;
} | null = null;

export const SecurityView: React.FC = () => {
  const { user, updateProfile, setUser } = useAuthStore();
  const validCache = cachedSecurityState && cachedSecurityState.userId === user?.id ? cachedSecurityState : null;

  const [isSyncingBackup, setIsSyncingBackup] = useState(false);
  const [identityKeys, setIdentityKeys] = useState<DeviceIdentityKeys | null>(validCache?.identityKeys ?? null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>(validCache?.backupStatus ?? { exists: false });

  const [isLoading, setIsLoading] = useState(!validCache);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Modals state
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryModalMode, setRecoveryModalMode] = useState<'setup' | 'restore'>('setup');
  const [isDelete2FAModalOpen, setIsDelete2FAModalOpen] = useState(false);
  const [delete2FACode, setDelete2FACode] = useState('');
  const [delete2FAError, setDelete2FAError] = useState<string | null>(null);
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);

  const loadSecurityState = useCallback(async (force = false) => {
    if (!user?.id) return;

    const currentCache = cachedSecurityState?.userId === user.id ? cachedSecurityState : null;
    if (!force && currentCache && Date.now() - currentCache.fetchedAt < SECURITY_CACHE_TTL_MS) {
      setIdentityKeys(currentCache.identityKeys);
      setBackupStatus(currentCache.backupStatus);
      setIsLoading(false);
      return;
    }

    if (!currentCache) setIsLoading(true);
    setError(null);

    try {
      // 1. Identity keys for current device
      let myKeys: DeviceIdentityKeys | null = null;
      try {
        myKeys = identityManager.getIdentityKeys();
      } catch {
        const init = await identityManager.init();
        myKeys = init.keys;
      }
      setIdentityKeys(myKeys);

      // 2. Cloud backup status
      const bStatus = await backupManager.getBackupStatus();
      setBackupStatus(bStatus);

      cachedSecurityState = {
        userId: user.id,
        identityKeys: myKeys,
        backupStatus: bStatus,
        fetchedAt: Date.now(),
      };
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar informações de segurança');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadSecurityState();
  }, [loadSecurityState]);

  const handleCopyKey = () => {
    if (!identityKeys?.ed25519) return;
    navigator.clipboard.writeText(identityKeys.ed25519);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleToggleBackup = async () => {
    const current = user?.e2ee_backup_enabled !== false;
    if (current) {
      const confirmed = await showConfirm({
        title: 'Desativar backup automático',
        message: 'Sem o backup na nuvem, você precisará da chave de recuperação para ler mensagens antigas em outros aparelhos.',
        confirmText: 'Desativar',
        cancelText: 'Cancelar',
        variant: 'danger',
        icon: 'alert',
      });
      if (!confirmed) return;
    }

    setError(null);
    setSuccessMessage(null);
    try {
      const nextVal = !current;
      const updated = await updateProfile({ e2ee_backup_enabled: nextVal } as any);
      setUser(updated);
      backupManager.setBackupEnabledLocally(nextVal);
      if (nextVal) {
        setIsSyncingBackup(true);
        await backupManager.ensureActiveBackup(true);
        const bStatus = await backupManager.getBackupStatus();
        setBackupStatus(bStatus);
        if (user?.id) {
          cachedSecurityState = { userId: user.id, identityKeys, backupStatus: bStatus, fetchedAt: Date.now() };
        }
        setSuccessMessage('Backup automático reativado e sincronizado com sucesso.');
      } else {
        setSuccessMessage('Backup automático de chaves desativado (opt-out).');
      }
    } catch (err: any) {
      setError(err?.message || 'Falha ao alterar preferência de backup.');
    } finally {
      setIsSyncingBackup(false);
    }
  };

  const handleSyncBackupNow = async () => {
    setIsSyncingBackup(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await backupManager.ensureActiveBackup(true);
      const bStatus = await backupManager.getBackupStatus();
      setBackupStatus(bStatus);
      setSuccessMessage(`Backup sincronizado com sucesso! ${res?.key_count ?? bStatus.keyCount ?? 0} sessões protegidas na nuvem.`);
    } catch (err: any) {
      setError(err?.message || 'Falha ao sincronizar o backup de chaves.');
    } finally {
      setIsSyncingBackup(false);
    }
  };

  const executeDeleteBackup = async (code?: string) => {
    setIsDeletingBackup(true);
    setError(null);
    setDelete2FAError(null);
    setSuccessMessage(null);

    try {
      await backupManager.deleteBackup(code);
      const emptyStatus = { exists: false };
      setBackupStatus(emptyStatus);
      if (user?.id) {
        cachedSecurityState = { userId: user.id, identityKeys, backupStatus: emptyStatus, fetchedAt: Date.now() };
      }
      setIsDelete2FAModalOpen(false);
      setDelete2FACode('');
      setSuccessMessage('Backup de chaves na nuvem excluído com sucesso.');
    } catch (err: any) {
      const msg = err?.message || 'Falha ao excluir o backup.';
      if (isDelete2FAModalOpen) {
        setDelete2FAError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setIsDeletingBackup(false);
    }
  };

  const handleDeleteBackup = async () => {
    if (user?.two_factor_enabled) {
      setDelete2FACode('');
      setDelete2FAError(null);
      setIsDelete2FAModalOpen(true);
      return;
    }

    const confirmed = await showConfirm({
      title: 'Excluir backup na nuvem',
      message: 'O backup salvo no servidor será apagado. Suas mensagens continuam salvas nos aparelhos atuais.',
      confirmText: 'Excluir backup',
      cancelText: 'Cancelar',
      variant: 'danger',
      icon: 'trash',
    });
    if (!confirmed) return;

    await executeDeleteBackup();
  };

  const openRecoverySetup = () => {
    setRecoveryModalMode('setup');
    setIsRecoveryModalOpen(true);
  };

  const openRecoveryRestore = () => {
    setRecoveryModalMode('restore');
    setIsRecoveryModalOpen(true);
  };

  return (
    <div>
      {/* Alertas */}
      {error && (
        <InlineAlert variant="error" className="mb-4">
          {error}
        </InlineAlert>
      )}

      {successMessage && (
        <InlineAlert variant="success" className="mb-4">
          {successMessage}
        </InlineAlert>
      )}

      <SettingsGroup title="Criptografia de Ponta a Ponta (E2EE)">
        {/* 1. Identidade Criptográfica (Este Aparelho) */}
        <SettingsRow
          label="Identidade deste Aparelho"
          badge={
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              VODOZEMAC ATIVO
            </span>
          }
          description={
            identityKeys ? (
              <>
                Chave pública Ed25519:{' '}
                <span className="font-mono text-gray-300 select-all">
                  {identityKeys.ed25519.slice(0, 10)}...{identityKeys.ed25519.slice(-10)}
                </span>
              </>
            ) : (
              'Inicializando chaves criptográficas do dispositivo...'
            )
          }
        />

        {/* 2. Backup Automático de Chaves na Nuvem (Opt-out) */}
        <SettingsRow
          label="Backup Automático de Chaves (Nuvem)"
          badge={
            user?.e2ee_backup_enabled !== false ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ATIVADO (PADRÃO)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                DESATIVADO (OPT-OUT)
              </span>
            )
          }
          description={
            user?.e2ee_backup_enabled !== false
              ? (backupStatus.exists
                  ? `Seu backup criptografado contém ${backupStatus.keyCount || 0} sessões protegidas.`
                  : 'O backup automático está ativado por padrão. Suas chaves de sessões criptografadas são salvas na nuvem de ponta a ponta.')
              : 'Você optou por desativar o backup. Novas mensagens e conversas não poderão ser lidas em outros navegadores ou aparelhos sem exportação manual.'
          }
          control={
            <div className="flex items-center gap-2.5">
              {user?.e2ee_backup_enabled === false && backupStatus.exists && (
                <ModalButton
                  type="error"
                  size="small"
                  onClick={handleDeleteBackup}
                  loading={isDeletingBackup}
                  prefix={<Trash2 className="w-3.5 h-3.5" />}
                  title="Apagar permanentemente o backup das suas chaves no servidor"
                >
                  {isDeletingBackup ? 'Excluindo...' : 'Excluir Backup'}
                </ModalButton>
              )}
              <SquishSwitch
                checked={user?.e2ee_backup_enabled !== false}
                onCheckedChange={handleToggleBackup}
                disabled={isSyncingBackup}
                aria-label={user?.e2ee_backup_enabled !== false ? 'Desativar backup automático de chaves' : 'Ativar backup automático de chaves'}
                title={user?.e2ee_backup_enabled !== false ? 'Clique para desativar (Opt-out)' : 'Clique para ativar o backup'}
              />
            </div>
          }
        >
          {/* Action buttons row */}
          <div className="flex items-center gap-2 pt-0.5 flex-wrap">
            {user?.e2ee_backup_enabled !== false && (
              <ModalButton
                type="primary"
                size="small"
                onClick={handleSyncBackupNow}
                loading={isSyncingBackup}
                prefix={<RefreshCw className="w-3.5 h-3.5" />}
              >
                {isSyncingBackup ? 'Sincronizando...' : 'Sincronizar Agora'}
              </ModalButton>
            )}

            <ModalButton
              type="secondary"
              size="small"
              onClick={openRecoverySetup}
            >
              Chave de Recuperação Offline
            </ModalButton>

            <ModalButton
              type="secondary"
              size="small"
              onClick={openRecoveryRestore}
            >
              Restaurar Manualmente
            </ModalButton>
          </div>
        </SettingsRow>
      </SettingsGroup>

      {/* Modal de Recuperação */}
      <RecoveryKeyModal
        isOpen={isRecoveryModalOpen}
        mode={recoveryModalMode}
        onClose={() => setIsRecoveryModalOpen(false)}
        onSuccess={() => loadSecurityState(true)}
      />

      {/* Modal 2FA para excluir backup */}
      <AppModal
        isOpen={isDelete2FAModalOpen}
        onClose={() => !isDeletingBackup && setIsDelete2FAModalOpen(false)}
        titleId="delete-backup-2fa-title"
        closeOnBackdrop={!isDeletingBackup}
        closeOnEsc={!isDeletingBackup}
      >
        <AppModalHeader
          title="Excluir backup na nuvem"
          titleId="delete-backup-2fa-title"
          onClose={() => setIsDelete2FAModalOpen(false)}
          closeDisabled={isDeletingBackup}
        />
        <AppModalBody
          onSubmit={(e) => {
            e.preventDefault();
            if (!delete2FACode.trim()) {
              setDelete2FAError('Digite o código 2FA ou código de backup.');
              return;
            }
            void executeDeleteBackup(delete2FACode.trim());
          }}
        >
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
            O backup salvo no servidor será apagado. Suas mensagens continuam salvas nos aparelhos atuais.
          </p>
          {delete2FAError && <InlineAlert variant="error">{delete2FAError}</InlineAlert>}
          <AppInput
            label="Código 2FA (6 dígitos ou backup)"
            value={delete2FACode}
            onChange={(e) => {
              setDelete2FACode(e.target.value);
              setDelete2FAError(null);
            }}
            maxLength={16}
            placeholder="000000"
            className="font-mono tracking-wider"
            autoFocus
          />
          <AppModalFooter
            onCancel={() => setIsDelete2FAModalOpen(false)}
            cancelDisabled={isDeletingBackup}
            confirmText={isDeletingBackup ? 'Excluindo...' : 'Excluir backup'}
            confirmType="error"
            confirmHtmlType="submit"
            loading={isDeletingBackup}
            disabled={!delete2FACode.trim()}
          />
        </AppModalBody>
      </AppModal>
    </div>
  );
};
