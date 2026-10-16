import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Key,
  Cloud,
  Laptop,
  Smartphone,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { identityManager, DeviceIdentityKeys } from '../../crypto/identity';
import { backupManager, BackupStatus } from '../../crypto/backupManager';
import { getVerifiedDevices, isDeviceVerified } from '../../crypto/verification';
import { RecoveryKeyModal } from './RecoveryKeyModal';
import { DeviceVerificationModal } from './DeviceVerificationModal';
import {
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_CARD_PADDING_CLASS,
  MODAL_DIVIDER_CLASS,
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
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 1. Status Geral de Criptografia */}
      <div className={`bg-background-darkest/60 border border-white/10 rounded-2xl ${MODAL_CARD_PADDING_CLASS}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 shrink-0 mt-0.5">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white">Criptografia de Ponta a Ponta</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  vodozemac WASM Ativo
                </span>
              </div>
              <p className={MODAL_DESCRIPTION_CLASS}>
                Suas conversas em DMs, grupos e canais habilitados são protegidas pelos protocolos Double Ratchet (Olm) e Megolm.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadSecurityState}
            disabled={isLoading}
            className="self-start sm:self-center p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
            title="Atualizar status de segurança"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {identityKeys && (
          <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-gray-400">Fingerprint do Aparelho Atual:</span>
            <span className="font-mono text-brand-300 font-bold bg-white/5 px-2.5 py-1 rounded-lg break-all select-all">
              {identityKeys.ed25519.slice(0, 10)}...{identityKeys.ed25519.slice(-10)}
            </span>
          </div>
        )}
      </div>

      {/* 2. Backup de Chaves na Nuvem (Opt-in) */}
      <div className={`bg-background-darkest/60 border border-white/10 rounded-2xl ${MODAL_CARD_PADDING_CLASS} space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 shrink-0 mt-0.5">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white">Backup de Chaves na Nuvem (Opt-in)</h3>
                {backupStatus.exists ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    Backup Ativo
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-gray-400 border border-white/10">
                    Inativo
                  </span>
                )}
              </div>
              <p className={MODAL_DESCRIPTION_CLASS}>
                {backupStatus.exists
                  ? `Seu backup contém ${backupStatus.keyCount || 0} sessões criptografadas com sua Chave de Recuperação de 256 bits via PBKDF2/AES-GCM.`
                  : 'Nenhum backup configurado. Suas mensagens criptografadas só podem ser lidas nos seus aparelhos atuais.'}
              </p>
            </div>
          </div>
        </div>

        {backupStatus.exists ? (
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={openRecoverySetup}
              className="flex items-center gap-2 px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-brand-500/20 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Atualizar Backup</span>
            </button>

            <button
              type="button"
              onClick={openRecoveryRestore}
              className="flex items-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Restaurar Chaves</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteBackup}
              disabled={isDeletingBackup}
              className="flex items-center gap-2 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 ml-auto"
            >
              {isDeletingBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Excluir Backup</span>
            </button>
          </div>
        ) : (
          <div className="pt-2">
            <button
              type="button"
              onClick={openRecoverySetup}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-brand-500/20 transition-all"
            >
              <Key className="w-4 h-4" />
              <span>Configurar Chave de Recuperação</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Dispositivos Registrados (Olm) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={MODAL_SECTION_HEADER_CLASS}>Dispositivos Registrados (Olm)</h3>
            <p className={MODAL_DESCRIPTION_CLASS}>
              Aparelhos conectados autorizados a receber e decifrar chaves de conversa via mensagens to-device.
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-400">
            {devices.length} {devices.length === 1 ? 'dispositivo' : 'dispositivos'}
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500 bg-background-darkest/40 rounded-2xl border border-white/5">
            Nenhum dispositivo registrado encontrado.
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((dev) => {
              const isCurrent = dev.id === currentDeviceId;
              const isVerified = verifiedIds.has(dev.id);

              return (
                <div
                  key={dev.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-background-darkest/50 border border-white/10 hover:border-white/15 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-white/5 text-gray-300 shrink-0">
                      {dev.fallback_key ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-white truncate max-w-[160px] sm:max-w-[220px]">
                          {dev.id.slice(0, 8)}...{dev.id.slice(-6)}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                            Este Aparelho
                          </span>
                        )}
                        {isVerified ? (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Verificado</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Não Verificado</span>
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-gray-400 font-mono mt-0.5 truncate">
                        Ed25519: {dev.ed25519_key ? `${dev.ed25519_key.slice(0, 6)}...${dev.ed25519_key.slice(-6)}` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setVerifyDeviceTarget(dev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-lg border border-white/10 transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                      <span>Verificar Código</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRevokeDevice(dev.id)}
                      disabled={revokingId === dev.id}
                      className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="Revogar acesso deste dispositivo"
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
            })}
          </div>
        )}
      </div>

      {/* Modals */}
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
