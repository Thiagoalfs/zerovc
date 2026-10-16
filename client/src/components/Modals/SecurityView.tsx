import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Key,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { identityManager, DeviceIdentityKeys } from '../../crypto/identity';
import { backupManager, BackupStatus } from '../../crypto/backupManager';
import { getVerifiedDevices } from '../../crypto/verification';
import { RecoveryKeyModal } from './RecoveryKeyModal';
import { DeviceVerificationModal } from './DeviceVerificationModal';
import {
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';

interface DeviceItem {
  id: string;
  user_id: string;
  curve25519_key: string;
  ed25519_key: string;
  identity_signature?: string;
  fallback_key?: string;
  revoked_at?: string | null;
  created_at: string;
}

export const SecurityView: React.FC = () => {
  const { user } = useAuthStore();
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [identityKeys, setIdentityKeys] = useState<DeviceIdentityKeys | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ exists: false });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Modals state
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryModalMode, setRecoveryModalMode] = useState<'setup' | 'restore'>('setup');
  const [verifyDeviceTarget, setVerifyDeviceTarget] = useState<DeviceItem | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);

  const loadSecurityState = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Identity & current device
      let myKeys: DeviceIdentityKeys | null = null;
      try {
        myKeys = identityManager.getIdentityKeys();
      } catch {
        const init = await identityManager.init();
        myKeys = init.keys;
      }
      setIdentityKeys(myKeys);

      const cachedDevId = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : null;
      setCurrentDeviceId(cachedDevId);

      // 2. Fetch user's registered devices
      try {
        const devList = await api.e2ee.getUserDevices(user.id);
        setDevices(devList || []);
      } catch {
        setDevices([]);
      }

      // 3. Verified devices
      const verifiedList = await getVerifiedDevices();
      setVerifiedIds(new Set(verifiedList));

      // 4. Cloud backup status
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

  const handleRevokeDevice = async (deviceId: string) => {
    if (deviceId === currentDeviceId) {
      if (!confirm('Tem certeza de que deseja revogar este dispositivo? Você perderá o acesso às conversas cifradas nesta sessão.')) {
        return;
      }
    }

    setRevokingId(deviceId);
    setError(null);
    setSuccessMessage(null);

    try {
      await api.e2ee.revokeDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      setSuccessMessage('Dispositivo revogado com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao revogar o dispositivo.');
    } finally {
      setRevokingId(null);
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

        {/* 2. Backup de Chaves na Nuvem (Opt-in) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white block">Backup de Chaves na Nuvem</span>
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  backupStatus.exists
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                }`}
              >
                {backupStatus.exists ? 'ATIVADO' : 'DESATIVADO'}
              </span>
            </div>
            <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
              {backupStatus.exists
                ? `Seu backup criptografado contém ${backupStatus.keyCount || 0} sessões salvas na nuvem com PBKDF2/AES-GCM de 256 bits.`
                : 'Configure uma chave de segurança de 256 bits para salvar suas chaves de conversa na nuvem e lê-las em novos navegadores.'}
            </p>
          </div>
          <button
            type="button"
            onClick={openRecoverySetup}
            className="bg-brand-500 hover:bg-brand-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer self-start sm:self-auto shrink-0"
          >
            {backupStatus.exists ? 'Atualizar Backup' : 'Configurar Backup'}
          </button>
        </div>

        {/* 3. Restaurar Mensagens de Backup */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-white block">Restaurar Mensagens de Backup</span>
            <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
              Importe suas sessões anteriores inserindo sua Chave de Recuperação de 256 bits para ler conversas antigas.
            </p>
          </div>
          <button
            type="button"
            onClick={openRecoveryRestore}
            className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            Restaurar Chaves
          </button>
        </div>

        {/* 4. Excluir Backup de Chaves na Nuvem (apenas se existir) */}
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

        {/* 5. Dispositivos Registrados (Olm) */}
        {devices.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white block">Dispositivos Registrados (Olm)</span>
              <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
                Nenhum outro aparelho registrado encontrado para esta conta.
              </p>
            </div>
            <button
              type="button"
              onClick={loadSecurityState}
              disabled={isLoading}
              className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        ) : (
          devices.map((dev) => {
            const isCurrent = dev.id === currentDeviceId;
            const isVerified = verifiedIds.has(dev.id);

            return (
              <div key={dev.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-white block">
                      Dispositivo {dev.id.slice(0, 8)}...{dev.id.slice(-6)}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-brand-500/20 text-brand-300 border-brand-500/30">
                        ESTE APARELHO
                      </span>
                    )}
                    {isVerified ? (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        VERIFICADO
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        NÃO VERIFICADO
                      </span>
                    )}
                  </div>
                  <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md font-mono text-[11px]`}>
                    Ed25519: {dev.ed25519_key ? `${dev.ed25519_key.slice(0, 8)}...${dev.ed25519_key.slice(-8)}` : 'N/A'} • Chave de identidade de ponta a ponta
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setVerifyDeviceTarget(dev)}
                    className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                    <span>Verificar Código</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRevokeDevice(dev.id)}
                    disabled={revokingId === dev.id}
                    className="bg-dnd/10 hover:bg-dnd/20 text-dnd border border-dnd/30 p-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50"
                    title="Revogar este dispositivo"
                  >
                    {revokingId === dev.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modais de Fluxo */}
      <RecoveryKeyModal
        isOpen={isRecoveryModalOpen}
        mode={recoveryModalMode}
        onClose={() => setIsRecoveryModalOpen(false)}
        onSuccess={loadSecurityState}
      />

      {verifyDeviceTarget && (
        <DeviceVerificationModal
          isOpen={Boolean(verifyDeviceTarget)}
          peerDevice={{
            device_id: verifyDeviceTarget.id,
            ed25519_key: verifyDeviceTarget.ed25519_key,
            curve25519_key: verifyDeviceTarget.curve25519_key,
          }}
          onClose={() => setVerifyDeviceTarget(null)}
          onVerified={() => {
            loadSecurityState();
          }}
        />
      )}
    </div>
  );
};
