import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, MessageSquare, Shield, Calendar, Edit3, User as UserIcon } from 'lucide-react';
import { User } from '../../types';
import { useAuthStore } from '../../stores/authStore';

interface UserProfileModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDM?: (userId: string) => void;
  onEditOwnProfile?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onOpenDM,
  onEditOwnProfile,
}) => {
  const { user: currentUser } = useAuthStore();

  if (!isOpen || !user) return null;

  const isMe = currentUser?.id === user.id;

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
  };

  const getStatusLabel = (s: string) => {
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

  const handleStartChat = () => {
    onClose();
    if (onOpenDM) {
      onOpenDM(user.id);
    }
  };

  const handleOpenEdit = () => {
    onClose();
    if (onEditOwnProfile) {
      onEditOwnProfile();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4 animate-in fade-in duration-150">
      <div className="bg-background-darkest w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md transition-colors z-20"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Banner */}
        <div
          className="h-28 bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 bg-cover bg-center"
          style={user.banner_url ? { backgroundImage: `url(${user.banner_url})` } : {}}
        />

        {/* Profile Content */}
        <div className="px-5 pb-5 relative bg-background-darkest">
          {/* Avatar */}
          <div className="relative -mt-12 mb-3 inline-block">
            <div className="w-24 h-24 rounded-full bg-brand-500 border-4 border-background-darkest flex items-center justify-center text-3xl font-bold text-white shadow-2xl overflow-hidden">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{user.display_name?.[0]?.toUpperCase() || user.username[0]?.toUpperCase() || 'U'}</span>
              )}
            </div>
            <div
              className={`absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full border-4 border-background-darkest shadow-md ${getStatusColor(
                user.status
              )}`}
              title={getStatusLabel(user.status)}
            />
          </div>

          {/* User Details Card */}
          <div className="bg-background-darker/90 rounded-2xl p-4 border border-white/5 space-y-3.5">
            {/* Names */}
            <div>
              <h2 className="text-xl font-bold text-white leading-tight">
                {user.display_name || user.username}
              </h2>
              <span className="text-xs text-gray-400 font-medium">@{user.username}</span>
            </div>

            {/* Custom Status */}
            {user.custom_status && (
              <div className="p-2.5 bg-background-darkest rounded-xl text-xs text-gray-200 border border-white/5 flex items-center gap-2">
                <span>{user.custom_status}</span>
              </div>
            )}

            <div className="w-full h-[1px] bg-white/5" />

            {/* About Me */}
            {user.bio ? (
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Sobre mim
                </span>
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{user.bio}</p>
              </div>
            ) : (
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Status
                </span>
                <span className="text-xs text-gray-300 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(user.status)}`} />
                  <span>{getStatusLabel(user.status)}</span>
                </span>
              </div>
            )}

            {/* Server Roles */}
            {user.roles && user.roles.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-brand-400" />
                  Cargos
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {user.roles.map((role) => (
                    <span
                      key={role.id}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1"
                      style={{ color: role.color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: role.color }} />
                      {role.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Account Created Date */}
            {joinDateStr && (
              <div className="pt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <span>Membro desde {joinDateStr}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-4">
            {isMe ? (
              <button
                type="button"
                onClick={handleOpenEdit}
                className="w-full bg-background-light hover:bg-white/15 text-white font-semibold py-2.5 rounded-xl text-xs md:text-sm transition-all flex items-center justify-center gap-2 border border-white/10"
              >
                <Edit3 className="w-4 h-4" />
                <span>Editar Meu Perfil</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartChat}
                className="w-full bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold py-2.5 rounded-xl text-xs md:text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Enviar Mensagem</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
