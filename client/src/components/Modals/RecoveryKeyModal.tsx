import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  Copy,
  Download,
  Check,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { generateRecoveryKey, zeroBuffer, parseRecoveryKey, RecoveryKeyData } from '../../crypto/recovery';
import { backupManager } from '../../crypto/backupManager';
import { copyToClipboard } from '../../utils/clipboard';

interface RecoveryKeyModalProps {
  isOpen: boolean;
  mode?: 'setup' | 'restore';
  onClose: () => void;
  onSuccess?: () => void;
}

export const RecoveryKeyModal: React.FC<RecoveryKeyModalProps> = ({
  isOpen,
  mode = 'setup',
  onClose,
  onSuccess,
}) => {
  const [currentMode, setCurrentMode] = useState<'setup' | 'restore'>(mode);
  const [recoveryData, setRecoveryData] = useState<RecoveryKeyData | null>(null);
  const [restoreInput, setRestoreInput] = useState('');
  const [confirmedSafekeeping, setConfirmedSafekeeping] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize or re-generate key when modal opens in setup mode
  useEffect(() => {
    if (isOpen) {
      setCurrentMode(mode);
      setError(null);
      setSuccessMessage(null);
      setConfirmedSafekeeping(false);
      setIsCopied(false);
      setRestoreInput('');

      if (mode === 'setup') {
        const key = generateRecoveryKey();
        setRecoveryData(key);
      }
    } else {
      // Zeroize memory on close
      if (recoveryData?.rawBytes) {
        zeroBuffer(recoveryData.rawBytes);
      }
      setRecoveryData(null);
    }

    return () => {
      if (recoveryData?.rawBytes) {
        zeroBuffer(recoveryData.rawBytes);
      }
    };
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!recoveryData) return;
    try {
      await copyToClipboard(recoveryData.recoveryKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      setError('Falha ao copiar para a área de transferência');
    }
  };

  const handleDownload = () => {
    if (!recoveryData) return;
    try {
      const content = `ZeroVC - Chave de Recuperação E2EE\n==================================\n\nChave: ${recoveryData.recoveryKey}\n\nAVISO DE SEGURANÇA:\nGuarde esta chave em um local seguro (gerenciador de senhas ou impresso em papel).\nNenhum funcionário do ZeroVC tem acesso a esta chave. Se você perder esta chave e todos os seus dispositivos, seu histórico de mensagens criptografadas será perdido permanentemente.`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'zerovc-chave-recuperacao.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError('Falha ao baixar o arquivo da chave');
    }
  };

  const handleRegenerate = () => {
    if (recoveryData?.rawBytes) {
      zeroBuffer(recoveryData.rawBytes);
    }
    const newKey = generateRecoveryKey();
    setRecoveryData(newKey);
    setIsCopied(false);
    setConfirmedSafekeeping(false);
    setError(null);
  };

  const handleCreateBackup = async () => {
    if (!recoveryData) return;
    if (!confirmedSafekeeping) {
      setError('Por favor, confirme que salvou a chave de recuperação antes de continuar.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await backupManager.createBackup(recoveryData.rawBytes);
      setSuccessMessage(`Backup ativado com sucesso! ${result.key_count} sessões foram criptografadas e salvas na nuvem.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar o backup criptografado.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreInput.trim()) {
      setError('Por favor, informe a chave de recuperação.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const parsedBytes = parseRecoveryKey(restoreInput);
      const res = await backupManager.restoreBackup(parsedBytes);
      zeroBuffer(parsedBytes);
      setSuccessMessage(`Restauração concluída! ${res.restoredSessions} sessões criptografadas foram importadas.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Chave de recuperação inválida ou nenhum backup disponível.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background-darker w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-background-darkest/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {currentMode === 'setup' ? 'Chave de Recuperação E2EE' : 'Restaurar Chaves da Nuvem'}
              </h2>
              <p className="text-xs text-gray-400">
                {currentMode === 'setup'
                  ? 'Backup protegido com criptografia de ponta a ponta'
                  : 'Recupere suas sessões em um novo aparelho'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {currentMode === 'setup' ? (
            <>
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs leading-relaxed flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block mb-0.5">Guarde sua chave com segurança</strong>
                  Sua Chave de Recuperação de 256 bits é gerada localmente no seu aparelho e nunca é enviada aos nossos servidores. Se você perder esta chave e todos os seus dispositivos, ninguém poderá restaurar seu histórico.
                </div>
              </div>

              {recoveryData && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                    Sua Chave de Recuperação de 256 bits
                  </span>
                  <div className="p-4 bg-background-darkest rounded-xl border border-white/10 flex items-center justify-between gap-3">
                    <span className="font-mono text-sm sm:text-base font-bold text-brand-300 tracking-wider break-all select-all">
                      {recoveryData.recoveryKey}
                    </span>
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0"
                      title="Gerar nova chave aleatória"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons: Copy & Download */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    isCopied
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                  }`}
                >
                  {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{isCopied ? 'Copiada!' : 'Copiar Chave'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar (.txt)</span>
                </button>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={confirmedSafekeeping}
                  onChange={(e) => setConfirmedSafekeeping(e.target.checked)}
                  className="mt-0.5 rounded border-gray-600 text-brand-500 focus:ring-brand-500/20 bg-background-darkest w-4 h-4"
                />
                <span className="text-xs text-gray-300 leading-relaxed">
                  Confirmo que copiei ou baixei minha chave e compreendo que se eu a perder e formatar meus aparelhos, minhas mensagens não poderão ser recuperadas.
                </span>
              </label>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-gray-300 leading-relaxed">
                Digite ou cole sua chave de recuperação de 256 bits (no formato <code className="bg-white/10 px-1 py-0.5 rounded text-brand-300">ZVC-XXXX-XXXX-XXXX-XXXX</code>) para decifrar e restaurar suas sessões de conversa.
              </p>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  Chave de Recuperação
                </label>
                <input
                  type="text"
                  value={restoreInput}
                  onChange={(e) => setRestoreInput(e.target.value)}
                  placeholder="ZVC-XXXX-XXXX-XXXX-XXXX"
                  className="w-full px-3.5 py-2.5 bg-background-darkest rounded-xl border border-white/10 text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-brand-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-background-darkest/40">
          {currentMode === 'setup' ? (
            <button
              type="button"
              onClick={() => setCurrentMode('restore')}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Já tenho uma chave e quero restaurar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentMode('setup')}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Quero gerar uma nova chave
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>

            {currentMode === 'setup' ? (
              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={!confirmedSafekeeping || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-lg shadow-brand-500/20 transition-all"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ativar Backup Criptografado</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRestoreBackup}
                disabled={!restoreInput.trim() || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl shadow-lg shadow-brand-500/20 transition-all"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Restaurar Chaves</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
