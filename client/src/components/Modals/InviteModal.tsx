import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Link as LinkIcon, Users, AlertCircle, RefreshCw, Settings2, Clock, Hash, ChevronDown, Sparkles } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { api, getApiBaseUrl } from '../../lib/api';
import { copyToClipboard } from '../../utils/clipboard';
import { GuildInvite } from '../../types';

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
  const { activeGuild } = useGuildStore();
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-background-dark w-full max-w-md max-h-[92dvh] my-auto rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 pb-2 flex items-center justify-between relative flex-shrink-0">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-500" />
              Convidar amigos
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Envie o link de convite para amigos entrarem em {activeGuild.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto no-scrollbar flex-1">
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
              <button
                type="button"
                onClick={loadInvite}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Tentar Novamente
              </button>
            </div>
          ) : (
            <>
              {/* If NOT existing invite (e.g. newly generated or created), show code row if desired */}
              {!isExistingInvite && inviteCode && !showSettings && (
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                    Código de Convite (10 Caracteres)
                  </label>
                  <div
                    onClick={() => handleCopyCode()}
                    className="flex items-center gap-2 bg-background-darkest p-2 px-3 rounded-xl border border-white/10 hover:border-brand-500/50 transition-colors cursor-pointer group"
                    title="Clique para copiar"
                  >
                    <span className="flex-1 font-mono text-lg font-bold text-brand-500 tracking-wider select-all">
                      {inviteCode}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyCode(e)}
                      className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copiado!' : 'Copiar Hash'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Full URL Box (Always shown when active invite is present) */}
              {!showSettings && fullInviteUrl && (
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5 flex items-center justify-between">
                    <span>Link de Convite do Servidor</span>
                    {invite && (
                      <span className="text-[11px] font-normal text-gray-400 normal-case flex items-center gap-2">
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
                      {fullInviteUrl}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyLink(e)}
                      className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-white" /> : <LinkIcon className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Toggle Settings Panel / Settings Form */}
              {showSettings ? (
                <div className="bg-background-darkest/60 border border-white/10 rounded-xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Settings2 className="w-4 h-4 text-brand-500" />
                      Configurações do Link de Convite
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Expira em */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-300 uppercase mb-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        Expira em
                      </label>
                      <div className="relative">
                        <select
                          value={maxAge}
                          onChange={(e) => setMaxAge(Number(e.target.value))}
                          className="w-full bg-background-dark border border-white/10 text-gray-200 text-xs rounded-lg p-2 pr-8 appearance-none focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
                        >
                          {EXPIRATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-background-darkest text-white">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    {/* Limite de usos */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-300 uppercase mb-1.5 flex items-center gap-1">
                        <Hash className="w-3 h-3 text-gray-400" />
                        Limite de usos
                      </label>
                      <div className="relative">
                        <select
                          value={maxUses}
                          onChange={(e) => setMaxUses(Number(e.target.value))}
                          className="w-full bg-background-dark border border-white/10 text-gray-200 text-xs rounded-lg p-2 pr-8 appearance-none focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
                        >
                          {USES_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-background-darkest text-white">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="px-3 py-2 text-xs font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={handleGenerateNewInvite}
                      className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg"
                    >
                      {isGenerating ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{isGenerating ? 'Gerando...' : 'Gerar Novo Link'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="text-xs text-brand-400 hover:text-brand-300 hover:underline flex items-center gap-1.5 cursor-pointer font-medium transition-colors"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Editar link de convite (Expiração e Limite de usos)</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
