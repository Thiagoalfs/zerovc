import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Download,
  Check,
  RefreshCw,
} from 'lucide-react';
import { generateRecoveryKey, zeroBuffer, parseRecoveryKey, RecoveryKeyData } from '../../crypto/recovery';
import { backupManager } from '../../crypto/backupManager';
import { copyToClipboard } from '../../utils/clipboard';
import { ModalButton } from '@/components/ui/modal-button';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';
import {
  MODAL_BACKDROP_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
} from '../../constants/modalTypography';

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
      setSuccessMessage(`Backup ativado. ${result.key_count} sessões criptografadas e salvas na nuvem.`);
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
      setSuccessMessage(`Restauração concluída. ${res.restoredSessions} sessões criptografadas importadas.`);
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-key-modal-title"
      className={MODAL_BACKDROP_CLASS}
    >
      <div className="bg-background-darker w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-background-darkest/50">
          <h2 id="recovery-key-modal-title" className={MODAL_DIALOG_TITLE_CLASS}>
            {currentMode === 'setup' ? 'Chave de recuperação E2EE' : 'Restaurar chaves da nuvem'}
          </h2>
          <ModalButton
            type="tertiary"
            shape="circle"
            size="small"
            svgOnly
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </ModalButton>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {error && <InlineAlert variant="error">{error}</InlineAlert>}

          {successMessage && <InlineAlert variant="success">{successMessage}</InlineAlert>}

          {currentMode === 'setup' ? (
            <>
              <InlineAlert variant="warning">
                <strong className="font-semibold block mb-0.5">Guarde sua chave com segurança</strong>
                Sua Chave de Recuperação de 256 bits é gerada localmente no seu aparelho e nunca é enviada aos nossos servidores. Se você perder esta chave e todos os seus dispositivos, ninguém poderá restaurar seu histórico.
              </InlineAlert>

              {recoveryData && (
                <div className="p-4 bg-background-darkest rounded-xl border border-white/10 flex items-center justify-between gap-3">
                  <span className="font-mono text-sm sm:text-base font-bold text-brand-300 tracking-wider break-all select-all">
                    {recoveryData.recoveryKey}
                  </span>
                  <ModalButton
                    type="tertiary"
                    shape="circle"
                    size="small"
                    svgOnly
                    onClick={handleRegenerate}
                    aria-label="Gerar nova chave aleatória"
                    title="Gerar nova chave aleatória"
                    className="shrink-0"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </ModalButton>
                </div>
              )}

              {/* Action Buttons: Copy & Download */}
              <div className="grid grid-cols-2 gap-2.5">
                <ModalButton
                  type="secondary"
                  fullWidth
                  onClick={handleCopy}
                  prefix={isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  className={isCopied ? '!bg-emerald-500/15 !border-emerald-500/30 !text-emerald-400' : ''}
                >
                  {isCopied ? 'Copiada' : 'Copiar chave'}
                </ModalButton>

                <ModalButton
                  type="secondary"
                  fullWidth
                  onClick={handleDownload}
                  prefix={<Download className="w-4 h-4" />}
                >
                  Baixar (.txt)
                </ModalButton>
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
                Informe sua chave de recuperação para decifrar e restaurar suas sessões.
              </p>

              <AppInput
                label="Chave de recuperação"
                type="text"
                value={restoreInput}
                onChange={(e) => setRestoreInput(e.target.value)}
                placeholder="ZVC-XXXX-XXXX-XXXX-XXXX"
                className="font-mono"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-background-darkest/40">
          {currentMode === 'setup' ? (
            <ModalButton
              type="tertiary"
              size="small"
              onClick={() => setCurrentMode('restore')}
            >
              Já tenho uma chave e quero restaurar
            </ModalButton>
          ) : (
            <ModalButton
              type="tertiary"
              size="small"
              onClick={() => setCurrentMode('setup')}
            >
              Quero gerar uma nova chave
            </ModalButton>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <ModalButton type="secondary" onClick={onClose}>
              Cancelar
            </ModalButton>

            {currentMode === 'setup' ? (
              <ModalButton
                type="primary"
                onClick={handleCreateBackup}
                loading={isLoading}
                disabled={!confirmedSafekeeping}
              >
                Ativar backup criptografado
              </ModalButton>
            ) : (
              <ModalButton
                type="primary"
                onClick={handleRestoreBackup}
                loading={isLoading}
                disabled={!restoreInput.trim()}
              >
                Restaurar chaves
              </ModalButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
