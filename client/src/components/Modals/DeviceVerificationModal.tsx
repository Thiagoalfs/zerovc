import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Check,
  QrCode,
  Hash,
  AlertTriangle,
  Loader2,
  Copy,
} from 'lucide-react';
import {
  computeSafetyNumber,
  generateOfflineSVGQR,
  isDeviceVerified,
  setDeviceVerified,
  SafetyVerificationResult,
} from '../../crypto/verification';
import { identityManager } from '../../crypto/identity';
import { copyToClipboard } from '../../utils/clipboard';

interface DeviceVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  peerUser?: {
    id: string;
    username: string;
    display_name?: string;
    avatar_url?: string;
  };
  peerDevice?: {
    device_id: string;
    ed25519_key: string;
    curve25519_key?: string;
  };
  onVerified?: () => void;
}

export const DeviceVerificationModal: React.FC<DeviceVerificationModalProps> = ({
  isOpen,
  onClose,
  peerUser,
  peerDevice,
  onVerified,
}) => {
  const [activeView, setActiveView] = useState<'digits' | 'qr'>('digits');
  const [safetyNumber, setSafetyNumber] = useState<SafetyVerificationResult | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadVerification() {
      if (!isOpen || !peerDevice?.ed25519_key) return;
      setIsLoading(true);
      setError(null);

      try {
        let myKey = '';
        try {
          myKey = identityManager.getIdentityKeys().ed25519;
        } catch {
          const initRes = await identityManager.init();
          myKey = initRes.keys.ed25519;
        }

        const safety = await computeSafetyNumber(myKey, peerDevice.ed25519_key);
        const verified = await isDeviceVerified(peerDevice.device_id);

        if (isMounted) {
          setSafetyNumber(safety);
          setIsVerified(verified);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Falha ao calcular código de verificação');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadVerification();

    return () => {
      isMounted = false;
    };
  }, [isOpen, peerDevice]);

  if (!isOpen || !peerDevice) return null;

  const handleToggleVerified = async () => {
    try {
      const nextStatus = !isVerified;
      await setDeviceVerified(peerDevice.device_id, nextStatus);
      setIsVerified(nextStatus);
      if (nextStatus) {
        onVerified?.();
      }
    } catch {
      setError('Falha ao atualizar o status de verificação');
    }
  };

  const handleCopyCode = async () => {
    if (!safetyNumber) return;
    try {
      await copyToClipboard(safetyNumber.formatted);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setError('Falha ao copiar código');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background-darker w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-background-darkest/50">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isVerified ? 'bg-emerald-500/10 text-emerald-400' : 'bg-brand-500/10 text-brand-400'}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Verificar Código de Segurança
                </h2>
                {isVerified && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    Verificado
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                {peerUser ? `Dispositivo de ${peerUser.display_name || peerUser.username}` : `Dispositivo ${peerDevice.device_id.slice(0, 8)}`}
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

        {/* Mode Selector */}
        <div className="flex border-b border-white/10 px-6 pt-3 bg-background-darkest/20">
          <button
            type="button"
            onClick={() => setActiveView('digits')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeView === 'digits'
                ? 'border-brand-400 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>Código de 60 Dígitos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('qr')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeView === 'qr'
                ? 'border-brand-400 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Código QR Offline</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-gray-400 leading-relaxed">
            Compare este código com o exibido no aparelho do outro usuário ou escaneie o QR Code. Se ambos forem idênticos, você tem a garantia criptográfica de que nenhuma terceira parte está interceptando a conversa.
          </p>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
              <Loader2 className="w-7 h-7 animate-spin text-brand-400" />
              <span className="text-xs">Calculando hash canônico de segurança...</span>
            </div>
          ) : activeView === 'digits' && safetyNumber ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-background-darkest p-4 rounded-xl border border-white/10">
                {safetyNumber.groups.map((group, idx) => (
                  <div
                    key={idx}
                    className="p-2 text-center rounded-lg bg-white/5 font-mono text-sm sm:text-base font-bold text-white tracking-widest select-all"
                  >
                    {group}
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? 'Código copiado!' : 'Copiar 60 dígitos'}</span>
                </button>
              </div>
            </div>
          ) : activeView === 'qr' && safetyNumber ? (
            <div className="flex flex-col items-center justify-center py-4 space-y-3">
              <div
                className="p-3 bg-white rounded-2xl shadow-xl flex items-center justify-center overflow-hidden"
                dangerouslySetInnerHTML={{
                  __html: generateOfflineSVGQR(safetyNumber.qrPayload, 190),
                }}
              />
              <span className="text-[11px] text-gray-400 font-mono text-center">
                Código QR gerado 100% offline via SVG vetorial
              </span>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-background-darkest/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleToggleVerified}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              isVerified
                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
            }`}
          >
            {isVerified ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Desmarcar Verificação</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Marcar como Verificado</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
