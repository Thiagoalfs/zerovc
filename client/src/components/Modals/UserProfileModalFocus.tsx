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
  ChevronRight,
} from 'lucide-react';
import { User, Guild } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useFriendStore } from '../../stores/friendStore';
import { copyToClipboard } from '../../utils/clipboard';
import { api, formatAssetUrl } from '../../lib/api';
import { getUserActivity, useActivityElapsedTime, getActivityColorClass } from '../../utils/userActivity';
import { UserRolesSection } from './UserRolesSection';

export interface UserProfileModalFocusProps {
  user: User | null;
  guild?: Guild | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDM?: (userId: string) => void;
  onEditOwnProfile?: () => void;
  onPreviewImage?: (url: string) => void;
}

export const UserProfileModalFocus: React.FC<UserProfileModalFocusProps> = ({
  user,
  guild,
  isOpen,
  onClose,
  onOpenDM,
  onEditOwnProfile,
  onPreviewImage,
}) => {
  const { user: currentUser } = useAuthStore();
  const guilds = useGuildStore((s) => s.guilds);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const guildVoiceStates = useGuildStore((s) => s.guildVoiceStates);
  const isVoiceConnected = useVoiceStore((s) => s.isConnected);
  const currentVoiceChannelId = useVoiceStore((s) => s.currentChannelId);
  const { friends, pending, sendRequest } = useFriendStore();
  const [copied, setCopied] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const [profileData, setProfileData] = useState<{
    user?: User;
    joined_at?: string;
    mutual_guilds: Array<{ id: string; name: string; icon_url?: string }>;
    mutual_friends: Array<{ id: string; username: string; display_name?: string; avatar_url?: string }>;
  } | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isServersExpanded, setIsServersExpanded] = useState(false);
  const [isFriendsExpanded, setIsFriendsExpanded] = useState(false);

  useEffect(() => {
    setRequestSent(false);
  }, [user?.id]);

  useEffect(() => {
    if (!isOpen || !user?.id) {
      setProfileData(null);
      setIsServersExpanded(false);
      setIsFriendsExpanded(false);
      return;
    }

    let isMounted = true;
    setIsLoadingProfile(true);

    api.users
      .getProfile(user.id, guild?.id)
      .then((data) => {
        if (isMounted) {
          setProfileData(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load user profile details:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, user?.id, guild?.id]);

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
    return getUserActivity(user, currentUser, guilds, guildVoiceStates);
  }, [user, currentUser, guilds, guildVoiceStates, isVoiceConnected, currentVoiceChannelId]);

  const elapsedTime = useActivityElapsedTime(activity, user?.id);

  const isMe = currentUser?.id === user?.id;

  const mutualGuilds = useMemo(() => {
    if (profileData?.mutual_guilds) {
      return profileData.mutual_guilds;
    }
    if (!user || isMe) return [];
    return guilds
      .filter((g) => g.members?.some((m) => m.id === user.id))
      .map((g) => ({ id: g.id, name: g.name, icon_url: g.icon_url }));
  }, [profileData?.mutual_guilds, guilds, user?.id, isMe]);

  const mutualFriends = useMemo(() => {
    return profileData?.mutual_friends || [];
  }, [profileData?.mutual_friends]);

  const createdDateStr = useMemo(() => {
    const raw = profileData?.user?.created_at || user?.created_at;
    if (!raw) return '';
    try {
      return format(new Date(raw), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return '';
    }
  }, [profileData?.user?.created_at, user?.created_at]);

  const joinedDateStr = useMemo(() => {
    const raw = profileData?.joined_at || user?.joined_at;
    if (!raw) return '';
    try {
      return format(new Date(raw), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return '';
    }
  }, [profileData?.joined_at, user?.joined_at]);

  if (!isOpen || !user) return null;

  const isBot = Boolean(user.is_bot);

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

  const handleSelectMutualGuild = async (guildId: string) => {
    onClose();
    await selectGuild(guildId);
  };

  const handleSelectMutualFriend = (friendId: string) => {
    onClose();
    if (onOpenDM) {
      onOpenDM(friendId);
    }
  };

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
    copyToClipboard(user.username);
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
        className="relative bg-background-darkest border border-white/10 rounded-xl w-full max-w-lg sm:max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92dvh] overflow-y-auto no-scrollbar select-text"
      >
        {/* Top Banner with Close Button */}
        <div
          onClick={user.banner_url ? handleBannerClick : undefined}
          className={`w-full aspect-[2.5/1] bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 bg-cover bg-center relative flex-shrink-0 ${
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
        <div className="px-5 sm:px-6 pb-6 relative bg-background-darkest">
          {/* Large Interactive Avatar */}
          <div className="flex items-end justify-between -mt-16 sm:-mt-20 mb-4">
            <div className="relative inline-block group/bigavatar">
              <div
                onClick={handleAvatarClick}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-brand-500 border-[6px] border-background-darkest flex items-center justify-center text-3xl sm:text-4xl font-bold text-white shadow-2xl overflow-hidden cursor-pointer relative transition-transform group-hover/bigavatar:scale-105 active:scale-95"
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
                className={`absolute bottom-1 right-1 w-6 h-6 rounded-full border-4 border-background-darkest shadow-md ${getStatusColor(
                  user.status
                )}`}
                title={getStatusLabel(user.status)}
              />
            </div>

            {/* Action Buttons Top Right */}
            {!isBot && (
              <div className="flex items-center gap-2 mb-1">
                {isMe ? (
                  <button
                    type="button"
                    onClick={handleOpenEdit}
                    className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Editar Perfil</span>
                  </button>
                ) : isFriend ? (
                  <button
                    type="button"
                    onClick={handleStartChat}
                    className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer"
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
                      className={`active:scale-95 text-white font-semibold px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed ${
                        isPending || requestSent
                          ? 'bg-emerald-600/80 hover:bg-emerald-600'
                          : 'bg-online hover:bg-online/90'
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
            )}
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
              <div className="mt-1.5 text-xs sm:text-sm text-gray-300 break-words">
                <span>{user.custom_status}</span>
              </div>
            )}
          </div>

          {/* Details Sections */}
          <div className="space-y-4 pt-1">
            {/* Atividade Category - Sleek Minimal Layout without box */}
            {activity && (
              <div className="space-y-1.5 animate-in fade-in">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  {activity.header || 'Atividade'}
                </span>
                <div className="flex items-center gap-3 py-1">
                  {activity.icon_url ? (
                    <img
                      src={formatAssetUrl(activity.icon_url)}
                      alt=""
                      className="w-11 h-11 rounded-xl object-contain p-0.5 bg-white/5 border border-white/10 shrink-0 shadow-sm"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      {activity.kind === 'game' ? <Gamepad2 className="w-6 h-6 text-emerald-400" /> :
                       activity.kind === 'music' ? <Music className="w-6 h-6 text-emerald-400" /> :
                       activity.kind === 'call' ? <Volume2 className="w-6 h-6 text-emerald-400 animate-pulse" /> :
                       activity.type === 'watching' ? <Tv className="w-6 h-6 text-indigo-400" /> :
                       activity.type === 'streaming' ? <Radio className="w-6 h-6 text-purple-400" /> :
                       activity.type === 'competing' ? <Trophy className="w-6 h-6 text-amber-400" /> :
                       <Sparkles className="w-6 h-6 text-brand-400" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                      {activity.emoji && <span>{activity.emoji}</span>}
                      <span>{activity.name}</span>
                    </div>
                    {elapsedTime && (
                      <div className={`text-xs truncate font-medium ${getActivityColorClass(activity)}`}>
                        {elapsedTime}
                      </div>
                    )}
                    {activity.details && (
                      <div className="text-xs text-gray-300 font-medium truncate mt-0.5">{activity.details}</div>
                    )}
                    {activity.state && !elapsedTime && (
                      <div className="text-xs text-gray-400 truncate mt-0.5">{activity.state}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* About Me / Bio */}
            {user.bio && user.bio.trim().length > 0 ? (
              <div>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Sobre mim
                </span>
                <p className="text-xs sm:text-sm text-gray-200 leading-relaxed whitespace-pre-wrap selection:bg-brand-500/30">
                  {user.bio.trim()}
                </p>
              </div>
            ) : null}

              {/* Server Roles with Dropdown */}
              <UserRolesSection user={user} guild={guild} size="md" />

              {/* Servidores em comum, Amigos em comum, Membro desde */}
              <div className="pt-2 border-t border-white/5 space-y-2.5">
                {/* 1. Servidores em comum */}
                {!isMe && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsServersExpanded((prev) => !prev)}
                      className="w-full flex items-center gap-2 py-1.5 px-1 hover:bg-white/5 rounded-lg transition-all cursor-pointer group text-left"
                    >
                      <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition-colors">
                        Servidores em comum
                      </span>
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={`w-4 h-4 text-gray-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
                            isServersExpanded ? 'rotate-90 text-white' : ''
                          }`}
                        />
                        {mutualGuilds.length > 0 ? (
                          <div className="flex items-center -space-x-1.5 shrink-0">
                            {mutualGuilds.slice(0, 3).map((item, idx) => (
                              <div
                                key={item.id}
                                className="w-6 h-6 rounded-full border-2 border-background-darkest bg-background-darker overflow-hidden shadow-sm relative shrink-0"
                                style={{ zIndex: 10 - idx }}
                                title={item.name}
                              >
                                {item.icon_url ? (
                                  <img
                                    src={formatAssetUrl(item.icon_url)}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-white/10 text-gray-200 text-[10px] font-bold flex items-center justify-center">
                                    {item.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            ))}
                            {mutualGuilds.length > 3 && (
                              <div
                                className="w-6 h-6 rounded-full border-2 border-background-darkest bg-white/10 text-gray-300 text-[10px] font-bold flex items-center justify-center shrink-0 shadow-sm relative"
                                style={{ zIndex: 6 }}
                                title={`Mais ${mutualGuilds.length - 3}`}
                              >
                                +{mutualGuilds.length - 3}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 font-medium">0</span>
                        )}
                      </div>
                    </button>

                    {isServersExpanded && (
                      <div className="mt-1 space-y-1 max-h-44 overflow-y-auto no-scrollbar animate-in fade-in duration-150">
                        {mutualGuilds.length > 0 ? (
                          mutualGuilds.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => handleSelectMutualGuild(g.id)}
                              className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-left"
                            >
                              <div className="w-7 h-7 rounded-full overflow-hidden bg-background-darker border border-white/10 shrink-0">
                                {g.icon_url ? (
                                  <img src={formatAssetUrl(g.icon_url)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-white/10 text-gray-300 text-xs font-bold flex items-center justify-center">
                                    {g.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <span className="text-xs font-medium text-gray-200 truncate flex-1">{g.name}</span>
                            </button>
                          ))
                        ) : (
                          <p className="text-xs text-gray-400 py-1 px-2">Nenhum servidor em comum</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Amigos em comum */}
                {!isMe && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsFriendsExpanded((prev) => !prev)}
                      className="w-full flex items-center gap-2 py-1.5 px-1 hover:bg-white/5 rounded-lg transition-all cursor-pointer group text-left"
                    >
                      <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition-colors">
                        Amigos em comum
                      </span>
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={`w-4 h-4 text-gray-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
                            isFriendsExpanded ? 'rotate-90 text-white' : ''
                          }`}
                        />
                        {mutualFriends.length > 0 ? (
                          <div className="flex items-center -space-x-1.5 shrink-0">
                            {mutualFriends.slice(0, 3).map((item, idx) => (
                              <div
                                key={item.id}
                                className="w-6 h-6 rounded-full border-2 border-background-darkest bg-background-darker overflow-hidden shadow-sm relative shrink-0"
                                style={{ zIndex: 10 - idx }}
                                title={item.display_name || item.username}
                              >
                                {item.avatar_url ? (
                                  <img
                                    src={formatAssetUrl(item.avatar_url)}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-brand-500/20 text-brand-300 text-[10px] font-bold flex items-center justify-center">
                                    {(item.display_name || item.username || '?').charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            ))}
                            {mutualFriends.length > 3 && (
                              <div
                                className="w-6 h-6 rounded-full border-2 border-background-darkest bg-white/10 text-gray-300 text-[10px] font-bold flex items-center justify-center shrink-0 shadow-sm relative"
                                style={{ zIndex: 6 }}
                                title={`Mais ${mutualFriends.length - 3}`}
                              >
                                +{mutualFriends.length - 3}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 font-medium">0</span>
                        )}
                      </div>
                    </button>

                    {isFriendsExpanded && (
                      <div className="mt-1 space-y-1 max-h-44 overflow-y-auto no-scrollbar animate-in fade-in duration-150">
                        {mutualFriends.length > 0 ? (
                          mutualFriends.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => handleSelectMutualFriend(f.id)}
                              className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-left"
                            >
                              <div className="w-7 h-7 rounded-full overflow-hidden bg-background-darker border border-white/10 shrink-0">
                                {f.avatar_url ? (
                                  <img src={formatAssetUrl(f.avatar_url)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-brand-500/20 text-brand-300 text-xs font-bold flex items-center justify-center">
                                    {(f.display_name || f.username || '?').charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-gray-200 truncate">{f.display_name || f.username}</div>
                                <div className="text-[11px] text-gray-400 truncate">@{f.username}</div>
                              </div>
                            </button>
                          ))
                        ) : (
                          <p className="text-xs text-gray-400 py-1 px-2">Nenhum amigo em comum</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Membro desde */}
                {(createdDateStr || (guild && (joinedDateStr || isLoadingProfile))) && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                      Membro desde
                    </span>
                    <div className={`grid gap-2 ${guild ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {/* Data de criação da conta */}
                      <div className="flex items-center gap-2.5 py-1 px-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4 text-brand-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">No ZeroVC</div>
                          <div className="text-xs font-semibold text-gray-200 truncate" title={createdDateStr}>
                            {createdDateStr || 'Desconhecido'}
                          </div>
                        </div>
                      </div>

                      {/* Data de quando entrou no servidor (ao lado, somente quando dentro de um servidor) */}
                      {guild && (
                        <div className="flex items-center gap-2.5 py-1 px-1 min-w-0">
                          {guild.icon_url ? (
                            <img
                              src={formatAssetUrl(guild.icon_url)}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-xs font-bold text-emerald-400">
                              {guild.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider truncate" title={guild.name}>
                              {guild.name}
                            </div>
                            <div className="text-xs font-semibold text-gray-200 truncate" title={joinedDateStr}>
                              {joinedDateStr || (isLoadingProfile ? 'Carregando...' : 'Desconhecido')}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
};