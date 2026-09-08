import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Link as LinkIcon, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { api, getApiBaseUrl } from '../../lib/api';
import { copyToClipboard } from '../../utils/clipboard';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose }) => {
  const { activeGuild } = useGuildStore();
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadInvite = async () => {
    if (!activeGuild) return;
    setIsLoading(true);
    setError(null);
    try {
      const invite = await api.guilds.createInvite(activeGuild.id);
      setInviteCode(invite.code);
    } catch (err: any) {
      console.error('Failed to load invite:', err);
      setError(err?.message || 'Falha ao gerar o código de convite.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !activeGuild) return;
    loadInvite();
  }, [isOpen, activeGuild]);

  if (!isOpen || !activeGuild) return null;

  const origin = (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http') && !window.location.origin.includes('localhost:5173'))
    ? window.location.origin
    : getApiBaseUrl();
  const fullInviteUrl = inviteCode ? `${origin}/invite/${inviteCode}` : '';

  const handleCopyCode = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!inviteCode) return;
    const ok = await copyToClipboard(inviteCode);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyLink = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!fullInviteUrl) return;
    const ok = await copyToClipboard(fullInviteUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4" onClick={onClose}>
      <div 
        className="bg-background-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-2 flex items-center justify-between relative">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-500" />
              Convidar amigos para {activeGuild.name}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Envie o código de 10 caracteres ou o link direto para seus amigos entrarem.
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
        <div className="p-6 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-sm text-gray-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
              <span>Gerando código de convite...</span>
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
              {/* 10-Character Hash Box */}
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

              {/* Full URL Box */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                  Ou copie o Link Completo
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
                    className="bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-online" /> : <LinkIcon className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
