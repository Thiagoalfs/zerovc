import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, Shield, Calendar, Edit3 } from 'lucide-react';
import { User } from '../../types';
import { useAuthStore } from '../../stores/authStore';

export interface UserProfilePosition {
  x: number;
  y: number;
}

interface UserProfileModalProps {
  user: User | null;
  position?: UserProfilePosition | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDM?: (userId: string) => void;
  onEditOwnProfile?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  position,
  isOpen,
  onClose,
  onOpenDM,
  onEditOwnProfile,
}) => {
  const { user: currentUser } = useAuthStore();

  const popoverStyle: React.CSSProperties = useMemo(() => {
    if (!position || typeof window === 'undefined' || window.innerWidth < 640) {
      return {};
    }

    const cardWidth = 300;
    const cardHeight = 360;
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
    <>
      {/* Invisible/Subtle Backdrop: Closes on outside click */}
      <div
        className="fixed inset-0 z-50 bg-black/20 sm:bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Floating Popover Card */}
      <div
        style={popoverStyle}
        onClick={(e) => e.stopPropagation()}
        className={`fixed z-50 bg-background-darkest rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col ${
          !position || (typeof window !== 'undefined' && window.innerWidth < 640)
            ? 'inset-x-4 bottom-6 top-auto max-w-sm mx-auto'
            : ''
        }`}
      >
        {/* Banner */}
        <div
          className="h-20 bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 bg-cover bg-center"
          style={user.banner_url ? { backgroundImage: `url(${user.banner_url})` } : {}}
        />

        {/* Profile Details */}
        <div className="px-4 pb-4 relative bg-background-darkest">
          {/* Avatar */}
          <div className="relative -mt-9 mb-2 inline-block">
            <div className="w-16 h-16 rounded-full bg-brand-500 border-4 border-background-darkest flex items-center justify-center text-xl font-bold text-white shadow-xl overflow-hidden">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{user.display_name?.[0]?.toUpperCase() || user.username[0]?.toUpperCase() || 'U'}</span>
              )}
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
                {user.display_name || user.username}
              </h2>
              <span className="text-xs text-gray-400 font-medium">@{user.username}</span>
            </div>

            {/* Custom Status */}
            {user.custom_status && (
              <div className="p-2 bg-background-darkest rounded-xl text-xs text-gray-200 border border-white/5 flex items-center gap-1.5">
                <span>{user.custom_status}</span>
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
            ) : (
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">
                  Sobre mim
                </span>
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">Oi! Estou usando zerovc!</p>
              </div>
            )}

            {/* Server Roles */}
            {user.roles && user.roles.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-brand-400" />
                  Cargos
                </span>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <span
                      key={role.id}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1"
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
                <button
                  type="button"
                  onClick={handleStartChat}
                  className="w-full bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-brand-500/20 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Enviar Mensagem</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Tem certeza que deseja bloquear ${user.display_name || user.username}? Isso removerá a amizade e impedirá mensagens diretas.`)) {
                      try {
                        const { api } = await import('../../lib/api');
                        await api.users.block(user.id);
                        alert(`Usuário ${user.display_name || user.username} bloqueado.`);
                        onClose();
                      } catch (err: any) {
                        alert(err.message || 'Falha ao bloquear usuário');
                      }
                    }
                  }}
                  className="w-full text-gray-400 hover:text-dnd hover:bg-dnd/10 py-1.5 rounded-xl text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Bloquear Usuário</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
