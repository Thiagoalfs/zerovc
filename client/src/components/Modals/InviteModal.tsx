import React, { useState, useEffect } from 'react';
import { Copy, Check, Link as LinkIcon, AlertCircle, RefreshCw, Settings2 } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { api, getApiBaseUrl } from '../../lib/api';
import { copyToClipboard } from '../../utils/clipboard';
import { GuildInvite } from '../../types';
import { DropdownSelect } from '../Common/DropdownSelect';
import { useStreamerModeStore } from '../../stores/streamerModeStore';
import { ModalButton } from '@/components/ui/modal-button';
import { AppModal, AppModalHeader } from '@/components/ui/app-modal';
import {
  MODAL_FIELD_LABEL_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_BODY_PADDING_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXPIRATION_OPTIONS = [
  { label: 'Nunca', value: 0 },
  { label: '6 horas', value: 21600 },
  { label: '1 dia', value: 86400 },
  { label: '7 dias', value: 604800 },
  { label: '30 dias', value: 2592000 },
];

const USES_OPTIONS = [
  { label: 'Ilimitado', value: 0 },
  { label: '1 uso', value: 1 },
  { label: '5 usos', value: 5 },
  { label: '10 usos', value: 10 },
  { label: '25 usos', value: 25 },
  { label: '50 usos', value: 50 },
];

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose }) => {
  const activeGuild = useGuildStore((s) => s.activeGuild);
  const isStreamerModeHidingInvites = useStreamerModeStore((s) => s.enabled && s.hideInviteLinks);
  const [invite, setInvite] = useState<GuildInvite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Custom options
  const [maxAge, setMaxAge] = useState<number>(604800); // 7 dias default
  const [maxUses, setMaxUses] = useState<number>(0); // Ilimitado default

  const loadInvite = async () => {
    if (!activeGuild) return;
    setIsLoading(true);
    setError(null);
    try {
      const inv = await api.guilds.createInvite(activeGuild.id);
      setInvite(inv);
    } catch (err: any) {
      console.error('Failed to load invite:', err);
      setError(err?.message || 'Falha ao carregar link de convite.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateNewInvite = async () => {
    if (!activeGuild) return;
    setIsGenerating(true);
    setError(null);
    try {
      const inv = await api.guilds.createInvite(activeGuild.id, {
        forceNew: true,
        max_age: maxAge,
        max_uses: maxUses,
      });
      setInvite(inv);
      setShowSettings(false);
    } catch (err: any) {
      console.error('Failed to generate custom invite:', err);
      setError(err?.message || 'Falha ao gerar novo convite.');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !activeGuild) return;
    setShowSettings(false);
    loadInvite();
  }, [isOpen, activeGuild]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !activeGuild) return null;

  const inviteCode = invite?.code || '';
  const origin =
    typeof window !== 'undefined' &&
    window.location.origin &&
    window.location.origin.startsWith('http') &&
    !window.location.origin.includes('localhost:5173')
      ? window.location.origin
      : getApiBaseUrl();
  const fullInviteUrl = inviteCode ? `${origin}/invite/${inviteCode}` : '';

  const isExistingInvite = !!invite?.is_existing;

  const handleCopyLink = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!fullInviteUrl) return;
    const ok = await copyToClipboard(fullInviteUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyCode = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!inviteCode) return;
    const ok = await copyToClipboard(inviteCode);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const formatExpirationText = (expiresAt?: string | null) => {
    if (!expiresAt) return 'Nunca expira';
    try {
      const exp = new Date(expiresAt);
      const diffMs = exp.getTime() - Date.now();
      if (diffMs <= 0) return 'Expirado';
      const hours = Math.round(diffMs / (1000 * 60 * 60));
      if (hours < 24) return `Expira em ~${hours} hora${hours > 1 ? 's' : ''}`;
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
      return `Expira em ~${days} dia${days > 1 ? 's' : ''}`;
    } catch {
      return 'Expira em breve';
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="invite-modal-title"
      className="max-h-[92dvh] my-auto overflow-visible animate-in fade-in zoom-in-95 duration-150 relative z-50"
    >
      <AppModalHeader
        title="Convidar amigos"
        subtitle={`Convite para ${activeGuild.name}`}
        titleId="invite-modal-title"
        onClose={onClose}
        className="border-b-0"
      />

        {/* Content */}
        <div className={`${MODAL_BODY_PADDING_CLASS} space-y-4 sm:space-y-5 overflow-visible flex-1`}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-sm text-gray-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
              <span>Buscando link de convite...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-dnd/10 border border-dnd/20 text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-dnd text-sm font-semibold">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
              <ModalButton
                type="primary"
                onClick={loadInvite}
                className="mx-auto"
              >
                Tentar novamente
              </ModalButton>
            </div>
          ) : (
            <>
              {/* If NOT existing invite (e.g. newly generated or created), show code row if desired */}
              {!isExistingInvite && inviteCode && !showSettings && (
                <div>
                  <label className={MODAL_FIELD_LABEL_CLASS}>
                    Código de convite
                  </label>
                  <div
                    onClick={() => handleCopyCode()}
                    className="flex items-center gap-2 bg-background-darkest p-2 px-3 rounded-xl border border-white/10 hover:border-brand-500/50 transition-colors cursor-pointer group"
                    title="Clique para copiar"
                  >
                    <span className="flex-1 font-mono text-lg font-bold text-brand-500 tracking-wider select-all">
                      {isStreamerModeHidingInvites ? '••••••••' : inviteCode}
                    </span>
                    <ModalButton
                      type="primary"
                      size="small"
                      onClick={(e) => handleCopyCode(e)}
                      prefix={copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      className="flex-shrink-0"
                    >
                      {copiedCode ? 'Copiado' : 'Copiar código'}
                    </ModalButton>
                  </div>
                </div>
              )}

              {/* Full URL Box (Always shown when active invite is present) */}
              {!showSettings && fullInviteUrl && (
                <div>
                  <label className={`${MODAL_FIELD_LABEL_CLASS} flex items-center justify-between`}>
                    <span>Link de convite</span>
                    {invite && (
                      <span className={`${MODAL_DESCRIPTION_CLASS} font-normal normal-case flex items-center gap-2`}>
                        <span>{formatExpirationText(invite.expires_at)}</span>
                        <span>•</span>
                        <span>
                          {invite.max_uses && invite.max_uses > 0
                            ? `${invite.uses}/${invite.max_uses} usos`
                            : 'Usos ilimitados'}
                        </span>
                      </span>
                    )}
                  </label>
                  <div
                    onClick={() => handleCopyLink()}
                    className="flex items-center gap-2 bg-background-darkest p-1.5 pl-3 rounded-xl border border-white/10 hover:border-brand-500/50 transition-colors cursor-pointer group"
                    title="Clique para copiar"
                  >
                    <span className="flex-1 text-xs text-gray-300 truncate font-mono select-all">
                      {isStreamerModeHidingInvites ? `${origin}/invite/••••••••` : fullInviteUrl}
                    </span>
                    <ModalButton
                      type="primary"
                      size="small"
                      onClick={(e) => handleCopyLink(e)}
                      prefix={copiedLink ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                      className="flex-shrink-0"
                    >
                      {copiedLink ? 'Link copiado' : 'Copiar link'}
                    </ModalButton>
                  </div>
                </div>
              )}

              {/* Toggle Settings Panel / Settings Form */}
              {showSettings ? (
                <div className="bg-background-darkest/60 border border-white/10 rounded-xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-100 overflow-visible">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                    <span className={`${MODAL_SECTION_HEADER_CLASS} !mb-0`}>
                      Configurações do link
                    </span>
                    <ModalButton
                      type="tertiary"
                      size="small"
                      onClick={() => setShowSettings(false)}
                    >
                      Cancelar
                    </ModalButton>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Expira em */}
                    <div>
                      <label className={MODAL_FIELD_LABEL_CLASS}>
                        Expira em
                      </label>
                      <DropdownSelect
                        value={maxAge}
                        onChange={(val) => setMaxAge(Number(val))}
                        options={EXPIRATION_OPTIONS.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                        placeholder="Selecione o tempo..."
                      />
                    </div>

                    {/* Limite de usos */}
                    <div>
                      <label className={MODAL_FIELD_LABEL_CLASS}>
                        Limite de usos
                      </label>
                      <DropdownSelect
                        value={maxUses}
                        onChange={(val) => setMaxUses(Number(val))}
                        options={USES_OPTIONS.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                        placeholder="Selecione os usos..."
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <ModalButton
                      type="secondary"
                      onClick={() => setShowSettings(false)}
                    >
                      Voltar
                    </ModalButton>
                    <ModalButton
                      type="primary"
                      loading={isGenerating}
                      onClick={handleGenerateNewInvite}
                    >
                      {isGenerating ? 'Gerando...' : 'Gerar novo link'}
                    </ModalButton>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <ModalButton
                    type="tertiary"
                    size="small"
                    prefix={<Settings2 className="w-3.5 h-3.5" />}
                    onClick={() => setShowSettings(true)}
                  >
                    Editar link de convite
                  </ModalButton>
                </div>
              )}
            </>
          )}
        </div>
    </AppModal>
  );
};
