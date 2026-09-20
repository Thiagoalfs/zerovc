import React, { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  MessageSquare,
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
  X,
  ExternalLink,
  Copy,
  Check,
  UserPlus,
} from 'lucide-react';
import { User } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useFriendStore } from '../../stores/friendStore';
import { formatAssetUrl } from '../../lib/api';
import { getUserActivity } from '../../utils/userActivity';
import { UserRolesSection } from './UserRolesSection';

export interface UserProfileModalFocusProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDM?: (userId: string) => void;
  onEditOwnProfile?: () => void;
  onPreviewImage?: (url: string) => void;
}

export const UserProfileModalFocus: React.FC<UserProfileModalFocusProps> = ({
  user,
  isOpen,
  onClose,
  onOpenDM,
  onEditOwnProfile,
  onPreviewImage,
}) => {
  const { user: currentUser } = useAuthStore();
  const guilds = useGuildStore((s) => s.guilds);
  const { friends, pending, sendRequest } = useFriendStore();
  const [copied, setCopied] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    setRequestSent(false);
  }, [user?.id]);

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

  const friendship = useMemo(() => {
    if (!user) return null;
    return friends.find(
      (f) => f.friend?.id === user.id || f.user?.id === user.id
    );
  }, [friends, user]);

  const isFriend = !!friendship && friendship.status === 'accepted';
  const isPending = useMemo(() => {
    if (!user) return false;
    return pending.some(
      (f) => f.friend?.id === user.id || f.user?.id === user.id
    );
  }, [pending, user]);

  const activity = useMemo(() => {
    return getUserActivity(user, currentUser, guilds);
  }, [user, currentUser, guilds]);

  if (!isOpen || !user) return null;

  const isMe = currentUser?.id === user.id;

  const getStatusColor = (s?: string) => {
    switch (s) {
      case 'online':
        return 'bg-online';
      case 'idle':
        return 'bg-idle';
      case 'dnd':
        return 'bg-dnd';
      default:
        return 'bg-offline';
    }
  };

  const getStatusLabel = (s?: string) => {
    switch (s) {
      case 'online':
        return 'Disponível';
      case 'idle':
        return 'Ausente';
      case 'dnd':
        return 'Não Perturbe';
      default:
        return 'Invisível / Offline';
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

  const handleStartChat = () => {
    onClose();
    if (onOpenDM) {
      onOpenDM(user.id);
    }
  };

  const handleAddFriend = async () => {
    if (!user || isSendingRequest || isPending || requestSent) return;
    setIsSendingRequest(true);
    try {
      await sendRequest(user.username);
      setRequestSent(true);
      alert(`Pedido de amizade enviado para @${user.username}!`);
    } catch (err: any) {
      alert(err?.message || 'Erro ao enviar pedido de amizade');
    } finally {
      setIsSendingRequest(false);
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
    if (user.avatar_url && onPreviewImage) {
      onPreviewImage(formatAssetUrl(user.avatar_url));
    }
  };

  const handleBannerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user.banner_url && onPreviewImage) {
      onPreviewImage(formatAssetUrl(user.banner_url));
    }
  };

  const handleCopyUsername = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(user.username);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {/* Full Screen Dim Backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm -z-10" />

      {/* Centered Modal Window */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[#111214] border border-white/10 rounded-3xl w-full max-w-lg sm:max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92dvh] overflow-y-auto no-scrollbar select-text"
      >
        {/* Top Banner with Close Button */}
        <div
          onClick={user.banner_url ? handleBannerClick : undefined}
          className={`h-36 sm:h-44 bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 bg-cover bg-center relative flex-shrink-0 ${
            user.banner_url ? 'cursor-pointer group/banner' : ''
          }`}
          style={user.banner_url ? { backgroundImage: `url(${formatAssetUrl(user.banner_url)})` } : {}}
          title={user.banner_url ? 'Clique para ampliar o banner' : undefined}
        >
          {user.banner_url && (
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/banner:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
              <ExternalLink className="w-5 h-5 drop-shadow" />
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-3.5 right-3.5 p-2 rounded-full bg-black/60 hover:bg-black/80 text-gray-300 hover:text-white transition-all cursor-pointer shadow-lg backdrop-blur-md z-10 active:scale-95"
            title="Fechar (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Header & Content */}
        <div className="px-5 sm:px-6 pb-6 relative bg-[#111214]">
          {/* Large Interactive Avatar */}
          <div className="flex items-end justify-between -mt-16 sm:-mt-20 mb-4">
            <div className="relative inline-block group/bigavatar">
              <div
                onClick={handleAvatarClick}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-brand-500 border-[6px] border-[#111214] flex items-center justify-center text-3xl sm:text-4xl font-bold text-white shadow-2xl overflow-hidden cursor-pointer relative transition-transform group-hover/bigavatar:scale-105 active:scale-95"
                title={user.avatar_url ? 'Clique para ampliar foto de perfil' : 'Foto de perfil'}
              >
                {user.avatar_url ? (
                  <img src={formatAssetUrl(user.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span>{user.display_name?.[0]?.toUpperCase() || user.username[0]?.toUpperCase() || 'U'}</span>
                )}
                {user.avatar_url && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/bigavatar:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                    <ExternalLink className="w-5 h-5 drop-shadow" />
                  </div>
                )}
              </div>
              <div
                className={`absolute bottom-1 right-1 w-6 h-6 rounded-full border-4 border-[#111214] shadow-md ${getStatusColor(
                  user.status
                )}`}
                title={getStatusLabel(user.status)}
              />
            </div>

            {/* Action Buttons Top Right */}
            <div className="flex items-center gap-2 mb-1">
              {isMe ? (
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-lg shadow-brand-500/20 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Editar Perfil</span>
                </button>
              ) : isFriend ? (
                <button
                  type="button"
                  onClick={handleStartChat}
                  className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-lg shadow-brand-500/20 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Enviar Mensagem</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={handleAddFriend}
                    disabled={isSendingRequest || isPending || requestSent}
                    className={`active:scale-95 text-white font-semibold px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed ${
                      isPending || requestSent
                        ? 'bg-emerald-600/80 hover:bg-emerald-600 shadow-emerald-600/20'
                        : 'bg-online hover:bg-online/90 shadow-online/20'
                    }`}
                  >
                    {isPending || requestSent ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Pedido Enviado</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>{isSendingRequest ? 'Enviando...' : 'Adicionar amigo'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleStartChat}
                    className="bg-background-darker hover:bg-white/10 active:scale-95 text-gray-300 hover:text-white p-2 sm:p-2.5 rounded-xl transition-all border border-white/10 cursor-pointer shadow-md flex items-center justify-center"
                    title="Enviar Mensagem"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Names & Quick Copy */}
          <div className="mb-4">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                {user.display_name || user.username}
              </h2>
              <button
                type="button"
                onClick={handleCopyUsername}
                className="text-xs sm:text-sm text-gray-400 hover:text-white font-medium flex items-center gap-1 transition-colors cursor-pointer group/copy"
                title="Clique para copiar username"
              >
                <span>@{user.username}</span>
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-online" />
                ) : (
                  <Copy className="w-3.5 h-3.5 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                )}
              </button>
            </div>

            {/* Custom Status */}
            {user.custom_status && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-background-darker/90 rounded-xl text-xs sm:text-sm text-gray-200 border border-white/5 shadow-inner">
                <span>{user.custom_status}</span>
              </div>
            )}
          </div>

          {/* Details Sections Container */}
          <div className="bg-background-darker/90 rounded-2xl p-4 sm:p-5 border border-white/5 space-y-4">
            {/* Atividade Category - Only rendered if an activity is active */}
            {activity && (
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Atividade
                </span>
                <div className="p-3.5 bg-background-darkest/90 rounded-xl border border-brand-500/25 flex flex-col gap-1.5 shadow-md animate-in fade-in">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-400 uppercase tracking-wider">
                    {activity.kind === 'game' ? <Gamepad2 className="w-4 h-4 text-green-400" /> :
                     activity.kind === 'music' ? <Music className="w-4 h-4 text-emerald-400" /> :
                     activity.kind === 'call' ? <Volume2 className="w-4 h-4 text-brand-400 animate-pulse" /> :
                     activity.type === 'watching' ? <Tv className="w-4 h-4 text-purple-400" /> :
                     activity.type === 'streaming' ? <Radio className="w-4 h-4 text-red-400" /> :
                     activity.type === 'competing' ? <Trophy className="w-4 h-4 text-amber-400" /> :
                     <Sparkles className="w-4 h-4 text-brand-400" />}
                    <span>{activity.header}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-100 flex items-center gap-1.5">
                      {activity.emoji && <span>{activity.emoji}</span>}
                      <span>{activity.name}</span>
                    </span>
                    {activity.details && (
                      <span className="text-xs text-gray-300 font-medium">{activity.details}</span>
                    )}
                    {activity.state && (
                      <span className="text-xs text-gray-400">{activity.state}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* About Me / Bio */}
            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                Sobre mim
              </span>
              {user.bio ? (
                <p className="text-xs sm:text-sm text-gray-200 leading-relaxed whitespace-pre-wrap selection:bg-brand-500/30">
                  {user.bio}
                </p>
              ) : (
                <p className="text-xs text-gray-500 italic">Nenhuma biografia informada.</p>
              )}
            </div>

              {/* Server Roles with Dropdown */}
              <UserRolesSection user={user} size="md" />

              {/* Account Created Date */}
              {joinDateStr && (
                <div className="pt-2 border-t border-white/5 flex items-center gap-2 text-xs text-gray-400">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span>Membro do ZeroVC desde {joinDateStr}</span>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};