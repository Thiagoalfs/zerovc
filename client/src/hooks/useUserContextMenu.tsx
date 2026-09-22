import React, { useCallback } from 'react';
import {
  User as UserIcon,
  MessageSquare,
  Copy,
  Shield,
  VolumeX,
  UserMinus,
  Ban,
  UserX,
  Check,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  UserPlus,
} from 'lucide-react';
import { User, Role } from '../types';
import { useAuthStore } from '../stores/authStore';
import { useGuildStore } from '../stores/guildStore';
import { useDMStore } from '../stores/dmStore';
import { useFriendStore } from '../stores/friendStore';
import { useContextMenu, ContextMenuItem } from '../components/ContextMenu';
import { UserVolumeSlider, StreamVolumeSlider } from '../components/Voice/VolumeSliders';
import { useGuildPermissions } from './useGuildPermissions';
import { api } from '../lib/api';

export interface UserContextMenuOptions {
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  isVoiceActive?: boolean;
  isVoiceMuted?: boolean;
  isScreenSharing?: boolean;
  voiceChannelId?: string;
  contextType?: 'guild' | 'dm' | 'friends' | 'voice';
}

export function useUserContextMenu() {
  const { user: currentUser } = useAuthStore();
  const {
    activeGuild,
    assignRole,
    removeRole,
    muteMember,
    kickMember,
    banMember,
  } = useGuildStore();
  const { openDMWithUser } = useDMStore();
  const { friends, sendRequest } = useFriendStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const perms = useGuildPermissions();

  const handleUserContextMenu = useCallback(
    (e: React.MouseEvent, targetUser: User, options: UserContextMenuOptions = {}) => {
      e.preventDefault();
      e.stopPropagation();

      const isMe = targetUser.id === currentUser?.id;
      const isGuildContext = options.contextType === 'guild' || (!options.contextType && Boolean(activeGuild));

      const friendship = friends.find(
        (f) => f.friend?.id === targetUser.id || f.user?.id === targetUser.id
      );
      const isFriend = !!friendship && friendship.status === 'accepted';

      const items: ContextMenuItem[] = [
        {
          label: 'Ver Perfil',
          icon: <UserIcon className="w-4 h-4" />,
          onClick: () => options.onOpenUserProfile?.(targetUser, { x: e.clientX, y: e.clientY }),
        },
      ];

      if (!isMe) {
        items.push({
          label: 'Enviar Mensagem',
          icon: <MessageSquare className="w-4 h-4" />,
          onClick: async () => {
            if (options.onOpenDM) {
              options.onOpenDM(targetUser.id);
            } else {
              await openDMWithUser(targetUser.id);
            }
          },
        });

        if (!isFriend) {
          items.push({
            label: 'Adicionar Amigo',
            icon: <UserPlus className="w-4 h-4 text-online" />,
            onClick: async () => {
              try {
                await sendRequest(targetUser.username);
                alert(`Pedido de amizade enviado para @${targetUser.username}!`);
              } catch (err: any) {
                alert(err?.message || 'Erro ao enviar pedido de amizade');
              }
            },
          });
        }

        items.push({ label: '', separator: true });
        items.push({
          label: 'Volume de Usuário',
          customRender: <UserVolumeSlider userId={targetUser.id} />,
        });

        if (options.isScreenSharing) {
          items.push({
            label: 'Volume da Transmissão',
            customRender: <StreamVolumeSlider userId={targetUser.id} />,
          });
        }
      }

      // Voice Call Controls (Mute/Deafen)
      if (options.voiceChannelId && (perms.canMuteVoice || perms.isCurrentOwner || perms.hasAdmin)) {
        items.push({ label: '', separator: true });

        items.push({
          label: options.isVoiceMuted ? 'Desmutar Microfone na Call' : 'Mutar Microfone na Call',
          icon: options.isVoiceMuted ? <Mic className="w-4 h-4 text-online" /> : <MicOff className="w-4 h-4 text-amber-400" />,
          onClick: async () => {
            await api.channels.adminUpdateVoiceState(options.voiceChannelId!, targetUser.id, {
              is_muted: !options.isVoiceMuted,
            });
          },
        });

        items.push({
          label: 'Ensurdecer na Call',
          icon: <Headphones className="w-4 h-4 text-amber-400" />,
          onClick: async () => {
            await api.channels.adminUpdateVoiceState(options.voiceChannelId!, targetUser.id, {
              is_deafened: true,
            });
          },
        });
      }

      // Server Roles Assignment
      if (isGuildContext && activeGuild) {
        const targetMember = activeGuild.members?.find((m) => m.id === targetUser.id) || targetUser;
        const mod = perms.canModerateMember(targetMember);

        if (perms.isCurrentOwner || isMe || (!mod.isTargetOwner && mod.isHierarchyAllowed)) {
          if (perms.canManageRoles && activeGuild.roles && activeGuild.roles.length > 0) {
            const roleSubItems: ContextMenuItem[] = activeGuild.roles
              .filter((role) => role.name !== '@everyone')
              .map((role) => {
                const hasRole = (targetMember.roles || []).some((r: Role) => r.id === role.id);
                return {
                  label: role.name,
                  icon: hasRole ? (
                    <Check className="w-3.5 h-3.5 text-online" />
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: role.color }} />
                  ),
                  onClick: async () => {
                    if (hasRole) {
                      await removeRole(activeGuild.id, targetMember.id, role.id);
                    } else {
                      await assignRole(activeGuild.id, targetMember.id, role.id);
                    }
                  },
                };
              });

            if (roleSubItems.length > 0) {
              items.push({
                label: 'Alterar Cargos',
                icon: <Shield className="w-4 h-4 text-brand-400" />,
                subItems: roleSubItems,
              });
            }
          }
        }
      }

      // Admin & Moderation Section (Red at base, above Copy ID)
      const targetMember = (isGuildContext && activeGuild) ? (activeGuild.members?.find((m) => m.id === targetUser.id) || targetUser) : null;
      const mod = targetMember ? perms.canModerateMember(targetMember) : { isTargetOwner: false, isHierarchyAllowed: false };
      const canModMember = isGuildContext && activeGuild && (perms.isCurrentOwner || (!mod.isTargetOwner && mod.isHierarchyAllowed));
      const canDisconnectVoice = options.voiceChannelId && (perms.canMuteVoice || perms.isCurrentOwner || perms.hasAdmin) && !isMe;

      const hasModGroup = canDisconnectVoice || (canModMember && (perms.canMute || (!isMe && (perms.canKick || perms.canBan)))) || !isMe;

      if (hasModGroup) {
        items.push({ label: '', separator: true });

        // Timeout / Mute Submenu (in red)
        if (canModMember && perms.canMute) {
          const isMuted = targetMember?.muted_until && new Date(targetMember.muted_until) > new Date();
          const muteSubItems: ContextMenuItem[] = [
            {
              label: 'Por 60 segundos',
              onClick: () => muteMember(activeGuild!.id, targetMember!.id, 60),
            },
            {
              label: 'Por 5 minutos',
              onClick: () => muteMember(activeGuild!.id, targetMember!.id, 300),
            },
            {
              label: 'Por 1 hora',
              onClick: () => muteMember(activeGuild!.id, targetMember!.id, 3600),
            },
            {
              label: 'Por 1 dia',
              onClick: () => muteMember(activeGuild!.id, targetMember!.id, 86400),
            },
            { label: '', separator: true },
            {
              label: 'Remover Silenciamento',
              onClick: () => muteMember(activeGuild!.id, targetMember!.id, 0),
            },
          ];

          items.push({
            label: isMuted ? 'Membro Silenciado' : 'Silenciar Membro',
            icon: <VolumeX className="w-4 h-4 text-[#f23f43]" />,
            variant: 'danger',
            subItems: muteSubItems,
          });
        }

        // Disconnect from voice
        if (canDisconnectVoice) {
          items.push({
            label: 'Desconectar da Call',
            icon: <PhoneOff className="w-4 h-4" />,
            variant: 'danger',
            onClick: async () => {
              await api.channels.adminUpdateVoiceState(options.voiceChannelId!, targetUser.id, {
                disconnect: true,
              });
            },
          });
        }

        // Kick & Ban (only for other members)
        if (canModMember && !isMe) {
          if (perms.canKick) {
            items.push({
              label: `Expulsar ${targetMember!.display_name || targetMember!.username}`,
              icon: <UserMinus className="w-4 h-4" />,
              variant: 'danger',
              onClick: () => {
                if (confirm(`Tem certeza que deseja expulsar ${targetMember!.display_name || targetMember!.username}?`)) {
                  kickMember(activeGuild!.id, targetMember!.id);
                }
              },
            });
          }

          if (perms.canBan) {
            items.push({
              label: `Banir ${targetMember!.display_name || targetMember!.username}`,
              icon: <Ban className="w-4 h-4" />,
              variant: 'danger',
              onClick: () => {
                if (confirm(`Tem certeza que deseja banir ${targetMember!.display_name || targetMember!.username} do servidor?`)) {
                  banMember(activeGuild!.id, targetMember!.id);
                }
              },
            });
          }
        }

        if (!isMe) {
          items.push({
            label: 'Bloquear Usuário',
            icon: <UserX className="w-4 h-4" />,
            variant: 'danger',
            onClick: async () => {
              if (confirm(`Deseja bloquear @${targetUser.username}? Você não receberá mais mensagens diretas deste usuário.`)) {
                await api.users.block(targetUser.id);
              }
            },
          });
        }
      }

      // Copy ID at the very bottom
      items.push({ label: '', separator: true });
      items.push({
        label: 'Copiar ID do Usuário',
        icon: <Copy className="w-4 h-4" />,
        onClick: () => navigator.clipboard.writeText(targetUser.id),
      });

      openContextMenu(e, items, `@${targetUser.username}`);
    },
    [currentUser, activeGuild, openDMWithUser, perms, assignRole, removeRole, muteMember, kickMember, banMember, openContextMenu, friends, sendRequest]
  );

  return {
    menu,
    openContextMenu,
    closeContextMenu,
    handleUserContextMenu,
  };
}
