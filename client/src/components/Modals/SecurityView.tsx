import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Copy,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { identityManager, DeviceIdentityKeys } from '../../crypto/identity';
import { backupManager, BackupStatus } from '../../crypto/backupManager';
import { RecoveryKeyModal } from './RecoveryKeyModal';
import {
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';

export const SecurityView: React.FC = () => {
  const { user, updateProfile, setUser } = useAuthStore();
  const [isSyncingBackup, setIsSyncingBackup] = useState(false);
  const [identityKeys, setIdentityKeys] = useState<DeviceIdentityKeys | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ exists: false });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Modals state
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryModalMode, setRecoveryModalMode] = useState<'setup' | 'restore'>('setup');
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);

  const loadSecurityState = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
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
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar informações de segurança');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadSecurityState();
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
      if (!confirm('Atenção: Ao desativar o backup de chaves na nuvem, você não poderá ler mensagens antigas cifradas se fizer login em outro computador ou navegador sem uma chave manual. Deseja realmente desativar (opt-out)?')) {
        return;
      }
    }

    setError(null);
    setSuccessMessage(null);
    try {
      const nextVal = !current;
      const updated = await updateProfile({ e2ee_backup_enabled: nextVal });
      setUser(updated);
      backupManager.setBackupEnabledLocally(nextVal);
      if (nextVal) {
        setIsSyncingBackup(true);
        await backupManager.ensureActiveBackup(true);
        const bStatus = await backupManager.getBackupStatus();
        setBackupStatus(bStatus);
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

  const handleDeleteBackup = async () => {
    if (!confirm('Deseja realmente excluir o backup de chaves na nuvem? Suas mensagens continuarão nos seus aparelhos, mas não poderão ser recuperadas em novos dispositivos sem exportação manual.')) {
      return;
    }

    setIsDeletingBackup(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await backupManager.deleteBackup();
      setBackupStatus({ exists: false });
      setSuccessMessage('Backup de chaves na nuvem excluído com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao excluir o backup.');
    } finally {
      setIsDeletingBackup(false);
    }
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
      <h4 className={MODAL_SECTION_HEADER_CLASS}>
        Criptografia de Ponta a Ponta (E2EE)
      </h4>

      {/* Alertas */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* 1. Identidade Criptográfica (Este Aparelho) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white block">Identidade deste Aparelho</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                VODOZEMAC ATIVO
              </span>
            </div>
            <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
              {identityKeys ? (
                <>
                  Chave pública Ed25519:{' '}
                  <span className="font-mono text-gray-300 select-all">
                    {identityKeys.ed25519.slice(0, 10)}...{identityKeys.ed25519.slice(-10)}
                  </span>
                  . Suas conversas em DMs e canais habilitados são protegidas localmente.
                </>
              ) : (
                'Inicializando chaves criptográficas do dispositivo...'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyKey}
            disabled={!identityKeys}
            className="bg-background-dark hover:bg-white/10 disabled:opacity-50 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0"
          >
            {copiedKey ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Chave</span>
              </>
            )}
          </button>
        </div>

        {/* 2. Backup Automático de Chaves na Nuvem (Opt-out) */}
        <div className="p-3.5 bg-background-dark/50 rounded-2xl border border-white/5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 pr-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white block">Backup Automático de Chaves (Nuvem)</span>
                {user?.e2ee_backup_enabled !== false ? (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    ATIVADO (PADRÃO)
                  </span>
                ) : (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-red-500/20 text-red-400 border-red-500/30">
                    DESATIVADO (OPT-OUT)
                  </span>
                )}
              </div>
              <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
                {user?.e2ee_backup_enabled !== false
                  ? (backupStatus.exists
                      ? `Seu backup criptografado contém ${backupStatus.keyCount || 0} sessões protegidas com chave AES-GCM-256 derivada da sua conta.`
                      : 'O backup automático está ativado por padrão. Suas chaves de sessões criptografadas são salvas na nuvem de ponta a ponta.')
                  : 'Você optou por desativar o backup. Novas mensagens e conversas não poderão ser lidas em outros navegadores ou aparelhos sem exportação manual.'}
              </p>
            </div>

            {/* Opt-out Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={user?.e2ee_backup_enabled !== false}
              onClick={handleToggleBackup}
              disabled={isSyncingBackup}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 disabled:opacity-50 ${
                user?.e2ee_backup_enabled !== false ? 'bg-brand-500' : 'bg-white/10'
              }`}
              title={user?.e2ee_backup_enabled !== false ? 'Clique para desativar (Opt-out)' : 'Clique para ativar o backup'}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  user?.e2ee_backup_enabled !== false ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {user?.e2ee_backup_enabled !== false && (
              <button
                type="button"
                onClick={handleSyncBackupNow}
                disabled={isSyncingBackup}
                className="bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBackup ? 'animate-spin' : ''}`} />
                <span>{isSyncingBackup ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={openRecoverySetup}
              className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
            >
              Chave de Recuperação Offline
            </button>

            <button
              type="button"
              onClick={openRecoveryRestore}
              className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
            >
              Restaurar Manualmente
            </button>
          </div>
        </div>

        {/* 3. Excluir Backup de Chaves na Nuvem (apenas se existir) */}
        {backupStatus.exists && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-dnd block">Excluir Backup da Nuvem</span>
              <p className="text-[11px] text-dnd/80 leading-relaxed max-w-md">
                Apaga permanentemente o backup das suas chaves no servidor. Suas conversas continuarão salvas nos seus aparelhos atuais.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeleteBackup}
              disabled={isDeletingBackup}
              className="bg-dnd/10 hover:bg-dnd/20 text-dnd border border-dnd/30 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0 disabled:opacity-50"
            >
              {isDeletingBackup ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Excluindo...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Backup</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* 4. Integração com Sessões & Dispositivos */}
        <div className="p-3.5 bg-white/[0.03] rounded-2xl border border-white/5 flex items-center justify-between gap-3 mt-2">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-gray-200 block">Gerenciamento de Aparelhos e Verificação</span>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Para verificar chaves com outros aparelhos, ver sessões ativas ou desconectar computadores remotos, acesse a aba <strong className="text-white">Sessões & Dispositivos</strong>.
            </p>
          </div>
          <ShieldCheck className="w-5 h-5 text-brand-400 shrink-0" />
        </div>
      </div>

      {/* Modal de Recuperação */}
      <RecoveryKeyModal
        isOpen={isRecoveryModalOpen}
        mode={recoveryModalMode}
        onClose={() => setIsRecoveryModalOpen(false)}
        onSuccess={loadSecurityState}
      />
    </div>
  );
};
