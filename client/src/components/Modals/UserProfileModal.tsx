import React, { useMemo, useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Shield,
  Calendar,
  Edit3,
  Gamepad2,
  Music,
  Tv,
  Radio,
  Trophy,
  Sparkles,
  Volume2,
  Maximize2,
  Send,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { User } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useDMStore } from '../../stores/dmStore';
import { formatAssetUrl } from '../../lib/api';
import { getUserActivity } from '../../utils/userActivity';
import { UserRolesSection } from './UserRolesSection';

export interface UserProfilePosition {
  x: number;
  y: number;
}

export interface UserProfileModalProps {
  user: User | null;
  position?: UserProfilePosition | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDM?: (userId: string) => void;
  onEditOwnProfile?: () => void;
  onOpenFullProfile?: (user: User) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  position,
  isOpen,
  onClose,
  onOpenDM,
  onEditOwnProfile,
  onOpenFullProfile,
}) => {
  const { user: currentUser } = useAuthStore();
  const guilds = useGuildStore((s) => s.guilds);

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

  const activity = useMemo(() => {
    return getUserActivity(user, currentUser, guilds);
  }, [user, currentUser, guilds]);

  const popoverStyle: React.CSSProperties = useMemo(() => {
    if (!position || typeof window === 'undefined' || window.innerWidth < 640) {
      return {};
    }

    const cardWidth = 300;
    const cardHeight = 380;
    const margin = 16;

    let left = position.x + 16;
    let top = position.y - 40;

    // If overflowing on the right side (e.g. clicked in MemberList), position it to the left
    if (left + cardWidth > window.innerWidth - margin) {
      left = position.x - cardWidth - 16;
    }

    // Clamp inside viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - cardWidth - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - cardHeight - margin));

    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${cardWidth}px`,
    };
  }, [position]);

  if (!isOpen || !user) return null;

  const isMe = currentUser?.id === user.id;

  const getStatusColor = (s?: string) => {
    switch (s) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
  };

  const getStatusLabel = (s?: string) => {
    switch (s) {
      case 'online': return 'Disponível';
      case 'idle': return 'Ausente';
      case 'dnd': return 'Não Perturbe';
      default: return 'Invisível / Offline';
    }
  };

  const joinDateStr = (() => {
    if (!user.created_at) return '';
    try {
      return format(new Date(user.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return '';
    }
  })();

  const [quickMessage, setQuickMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuickMessage('');
      setSendError(null);
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, user?.id]);



  const handleQuickSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = quickMessage.trim();
    if (!text || !user || isMe || isSendingMessage) return;

    setIsSendingMessage(true);
    setSendError(null);
    try {
      const room = await useDMStore.getState().openDMWithUser(user.id);
      if (!room) {
        throw new Error('Não foi possível iniciar a conversa.');
      }
      await useDMStore.getState().sendMessage(text);
      setQuickMessage('');
      onClose();
      if (onOpenDM) {
        onOpenDM(user.id);
      }
    } catch (err: any) {
      const msg = err?.message || 'Falha ao enviar mensagem.';
      if (msg.toLowerCase().includes('bloque') || msg.includes('block') || msg.includes('403')) {
        setSendError('Não é possível enviar mensagem para este usuário.');
      } else {
        setSendError(msg);
      }
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleOpenEdit = () => {
    onClose();
    if (onEditOwnProfile) {
      onEditOwnProfile();
    }
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenFullProfile) {
      onOpenFullProfile(user);
    }
  };

  return (
    <>
      {/* Invisible/Subtle Backdrop: Closes on outside click */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs sm:bg-black/20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Floating Popover Card */}
      <div
        style={popoverStyle}
        onClick={(e) => e.stopPropagation()}
        className={`fixed z-50 bg-background-darkest rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92dvh] overflow-y-auto no-scrollbar ${
          !position || (typeof window !== 'undefined' && window.innerWidth < 640)
            ? 'inset-x-4 top-1/2 -translate-y-1/2 sm:translate-y-0 sm:top-auto sm:inset-x-auto max-w-sm mx-auto'
            : ''
        }`}
      >
        {/* Banner with expand action */}
        <div
          className="h-20 bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 bg-cover bg-center relative group/banner cursor-pointer"
          style={user.banner_url ? { backgroundImage: `url(${formatAssetUrl(user.banner_url)})` } : {}}
          onClick={handleAvatarClick}
          title="Clique para abrir perfil completo no centro da tela"
        >
          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/80 text-white opacity-0 group-hover/banner:opacity-100 transition-opacity">
            <Maximize2 className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Profile Details */}
        <div className="px-4 pb-4 relative bg-background-darkest">
          {/* Avatar with Click to Expand */}
          <div className="relative -mt-9 mb-2 inline-block group/avatar">
            <div
              onClick={handleAvatarClick}
              className="w-16 h-16 rounded-full bg-brand-500 border-4 border-background-darkest flex items-center justify-center text-xl font-bold text-white shadow-xl overflow-hidden cursor-pointer relative transition-transform group-hover/avatar:scale-105 active:scale-95"
              title="Clique para abrir perfil completo no centro da tela"
            >
              {user.avatar_url ? (
                <img src={formatAssetUrl(user.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{user.display_name?.[0]?.toUpperCase() || user.username[0]?.toUpperCase() || 'U'}</span>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Maximize2 className="w-4 h-4 drop-shadow" />
              </div>
            </div>
            <div
              className={`absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-2 border-background-darkest shadow-md ${getStatusColor(
                user.status
              )}`}
              title={getStatusLabel(user.status)}
            />
          </div>

          {/* User Details Card */}
          <div className="bg-background-darker/90 rounded-2xl p-3 border border-white/5 space-y-2.5">
            {/* Names */}
            <div>
              <h2 className="text-base font-bold text-white leading-snug">
                {user.display_name || user.username || 'Usuário'}
              </h2>
              {user.username && <span className="text-xs text-gray-400 font-medium">@{user.username}</span>}
            </div>

            {/* Custom Status */}
            {user.custom_status && (
              <div className="p-2 bg-background-darkest rounded-xl text-xs text-gray-200 border border-white/5 flex items-center gap-1.5">
                <span>{user.custom_status}</span>
              </div>
            )}

            {/* Atividade Category - Only rendered if an activity is active */}
            {activity && (
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Atividade
                </span>
                <div className="p-2.5 bg-background-darkest/90 rounded-xl border border-brand-500/20 flex flex-col gap-1 shadow-sm animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-400 uppercase tracking-wider">
                    {activity.kind === 'game' ? <Gamepad2 className="w-3.5 h-3.5 text-green-400" /> :
                     activity.kind === 'music' ? <Music className="w-3.5 h-3.5 text-emerald-400" /> :
                     activity.kind === 'call' ? <Volume2 className="w-3.5 h-3.5 text-brand-400 animate-pulse" /> :
                     activity.type === 'watching' ? <Tv className="w-3.5 h-3.5 text-purple-400" /> :
                     activity.type === 'streaming' ? <Radio className="w-3.5 h-3.5 text-red-400" /> :
                     activity.type === 'competing' ? <Trophy className="w-3.5 h-3.5 text-amber-400" /> :
                     <Sparkles className="w-3.5 h-3.5 text-brand-400" />}
                    <span>{activity.header}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-100 flex items-center gap-1">
                      {activity.emoji && <span>{activity.emoji}</span>}
                      <span>{activity.name}</span>
                    </span>
                    {activity.details && (
                      <span className="text-[11px] text-gray-300">{activity.details}</span>
                    )}
                    {activity.state && (
                      <span className="text-[10px] text-gray-400">{activity.state}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* About Me / Bio */}
            {user.bio ? (
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                  Sobre mim
                </span>
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{user.bio}</p>
              </div>
            ) : null}

            {/* Server Roles with Dropdown */}
            <UserRolesSection user={user} size="sm" />

            {/* Account Created Date */}
            {joinDateStr && (
              <div className="pt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                <Calendar className="w-3 h-3 text-gray-500" />
                <span>Membro desde {joinDateStr}</span>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="mt-3 space-y-1.5">
            {isMe ? (
              <button
                type="button"
                onClick={handleOpenEdit}
                className="w-full bg-background-light hover:bg-white/15 text-white font-semibold py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 border border-white/10 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar Meu Perfil</span>
              </button>
            ) : (
              <>
                <form onSubmit={handleQuickSendMessage} className="space-y-1">
                  <div className="relative flex items-center">
                    <input
                      ref={inputRef}
                      autoFocus
                      type="text"
                      value={quickMessage}
                      onChange={(e) => {
                        setQuickMessage(e.target.value);
                        if (sendError) setSendError(null);
                      }}
                      placeholder={`Conversar com @${user.display_name || user.username}`}
                      disabled={isSendingMessage}
                      className="w-full bg-background-darker border border-white/10 focus:border-brand-500 rounded-xl px-3 py-2 pr-9 text-xs text-white placeholder-gray-500 outline-none transition-all shadow-inner"
                    />
                    <button
                      type="submit"
                      disabled={!quickMessage.trim() || isSendingMessage}
                      className="absolute right-1.5 p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors cursor-pointer"
                      title="Enviar mensagem"
                    >
                      {isSendingMessage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-brand-400" />
                      )}
                    </button>
                  </div>
                  {sendError && (
                    <div className="flex items-center gap-1.5 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-xl">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{sendError}</span>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

