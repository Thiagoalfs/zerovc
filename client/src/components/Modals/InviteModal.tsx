import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Link as LinkIcon, Users } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { api, getApiBaseUrl } from '../../lib/api';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose }) => {
  const { activeGuild } = useGuildStore();
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!isOpen || !activeGuild) return;

    const loadInvite = async () => {
      setIsLoading(true);
      try {
        const invite = await api.guilds.createInvite(activeGuild.id);
        setInviteCode(invite.code);
      } catch (err) {
        console.error('Failed to load invite:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadInvite();
  }, [isOpen, activeGuild]);

  if (!isOpen || !activeGuild) return null;

  const fullInviteUrl = `${window.location.origin}/invite/${inviteCode}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(fullInviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150">
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-6 text-sm text-gray-400">
              Gerando código de convite...
            </div>
          ) : (
            <>
              {/* 10-Character Hash Box */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                  Código de Convite (10 Caracteres)
                </label>
                <div className="flex items-center gap-2 bg-background-darkest p-2 px-3 rounded-xl border border-white/10">
                  <span className="flex-1 font-mono text-lg font-bold text-brand-500 tracking-wider">
                    {inviteCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
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
                <div className="flex items-center gap-2 bg-background-darkest p-1.5 pl-3 rounded-xl border border-white/10">
                  <span className="flex-1 text-xs text-gray-300 truncate font-mono">
                    {fullInviteUrl}
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
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
