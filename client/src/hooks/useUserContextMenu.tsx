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
  Crown,
} from 'lucide-react';
import { User, Role } from '../types';
import { useAuthStore } from '../stores/authStore';
import { useGuildStore } from '../stores/guildStore';
import { useDMStore } from '../stores/dmStore';
import { useDMGroupStore } from '../stores/dmGroupStore';
import { useFriendStore } from '../stores/friendStore';
import { useContextMenu, ContextMenuItem } from '../components/ContextMenu';
import { UserVolumeSlider, StreamVolumeSlider } from '../components/Voice/VolumeSliders';
import { useGuildPermissions } from './useGuildPermissions';
import { api } from '../lib/api';
import { copyToClipboard } from '../utils/clipboard';

export interface UserContextMenuOptions {
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  isVoiceActive?: boolean;
  isVoiceMuted?: boolean;
  isScreenSharing?: boolean;
  voiceChannelId?: string;
  contextType?: 'guild' | 'dm' | 'friends' | 'voice' | 'dm_group';
  groupId?: string;
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
  const { activeGroup, transferOwnership, removeMember: removeGroupMember } = useDMGroupStore();
  const { friends, sendRequest } = useFriendStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const perms = useGuildPermissions();

  const handleUserContextMenu = useCallback(
    (e: React.MouseEvent, targetUser: User, options: UserContextMenuOptions = {}) => {
      e.preventDefault();
      e.stopPropagation();

      const isMe = targetUser.id === currentUser?.id;
      const isBot = Boolean(targetUser.is_bot || targetUser.id === '00000000-0000-0000-0000-000000000001' || targetUser.username?.toLowerCase() === 'gork');
      const isGuildContext = options.contextType === 'guild' || (!options.contextType && Boolean(activeGuild));

      if (isBot) {
        const botItems: ContextMenuItem[] = [
          {
            label: 'Ver Perfil',
            icon: <UserIcon className="w-4 h-4" />,
            onClick: () => options.onOpenUserProfile?.(targetUser, { x: e.clientX, y: e.clientY }),
          },
          { label: '', separator: true },
          {
            label: 'Copiar ID do Usuário',
            icon: <Copy className="w-4 h-4" />,
            onClick: () => copyToClipboard(targetUser.id),
          },
        ];
        openContextMenu(e, botItems, targetUser.display_name || `@${targetUser.username}`);
        return;
      }

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

      const targetMember = isGuildContext && activeGuild
        ? activeGuild.members?.find((m) => m.id === targetUser.id) || targetUser
        : targetUser;
      const mod = isGuildContext && activeGuild ? perms.canModerateMember(targetMember) : null;
      const canModerateTarget = Boolean(perms.isCurrentOwner || (mod && !mod.isTargetOwner && mod.isHierarchyAllowed));

      // Voice Channel Moderation
      if (options.voiceChannelId && !isMe && canModerateTarget && (perms.canMuteVoice || perms.isCurrentOwner || perms.hasAdmin)) {
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

        items.push({
          label: 'Desconectar da Call',
          icon: <PhoneOff className="w-4 h-4 text-dnd" />,
          onClick: async () => {
            await api.channels.adminUpdateVoiceState(options.voiceChannelId!, targetUser.id, {
              disconnect: true,
            });
          },
        });
      }

      // Server Member Moderation Actions (Roles, Timeout, Kick, Ban)
      if (isGuildContext && activeGuild && mod) {
        // Change Roles Submenu
        if (!mod.isTargetOwner && (perms.isCurrentOwner || (isMe ? perms.canManageRoles : mod.isHierarchyAllowed))) {
          if (perms.canManageRoles && activeGuild.roles && activeGuild.roles.length > 0) {
            const roleSubItems: ContextMenuItem[] = activeGuild.roles
              .filter((role) => {
                if (role.name === '@everyone') return false;
                if (perms.isCurrentOwner) return true;
                const rolePos = typeof role.position === 'number' ? role.position : 999;
                return rolePos > perms.currentUserHighestPos;
              })
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

        // Moderation actions on other members (Timeout, Kick, Ban)
        if (!isMe && canModerateTarget) {
          // Timeout / Mute Submenu
          if (perms.canMute) {
            const isMuted = targetMember.muted_until && new Date(targetMember.muted_until) > new Date();
            const muteSubItems: ContextMenuItem[] = [
              {
                label: 'Por 60 segundos',
                onClick: () => muteMember(activeGuild.id, targetMember.id, 60),
              },
              {
                label: 'Por 5 minutos',
                onClick: () => muteMember(activeGuild.id, targetMember.id, 300),
              },
              {
                label: 'Por 1 hora',
                onClick: () => muteMember(activeGuild.id, targetMember.id, 3600),
              },
              {
                label: 'Por 1 dia',
                onClick: () => muteMember(activeGuild.id, targetMember.id, 86400),
              },
              { label: '', separator: true },
              {
                label: 'Remover Silenciamento',
                onClick: () => muteMember(activeGuild.id, targetMember.id, 0),
              },
            ];

            items.push({
              label: isMuted ? 'Membro Silenciado' : 'Silenciar Membro',
              icon: <VolumeX className="w-4 h-4 text-amber-400" />,
              subItems: muteSubItems,
            });
          }

          // Kick
          if (perms.canKick) {
            items.push({
              label: `Expulsar ${targetMember.display_name || targetMember.username}`,
              icon: <UserMinus className="w-4 h-4 text-amber-400" />,
              variant: 'danger',
              onClick: () => {
                if (confirm(`Tem certeza que deseja expulsar ${targetMember.display_name || targetMember.username}?`)) {
                  kickMember(activeGuild.id, targetMember.id);
                }
              },
            });
          }

          // Ban
          if (perms.canBan) {
            items.push({
              label: `Banir ${targetMember.display_name || targetMember.username}`,
              icon: <Ban className="w-4 h-4 text-dnd" />,
              variant: 'danger',
              onClick: () => {
                if (confirm(`Tem certeza que deseja banir ${targetMember.display_name || targetMember.username} do servidor?`)) {
                  banMember(activeGuild.id, targetMember.id);
                }
              },
            });
          }
        }
      }

      // DM Group Moderation / Ownership Actions
      const targetGroup = options.groupId
        ? useDMGroupStore.getState().groups.find((g) => g.id === options.groupId) || activeGroup
        : activeGroup;

      const isGroupMember = Boolean(
        targetGroup &&
        (options.contextType === 'dm_group' || targetGroup.members?.some((m) => m.id === targetUser.id))
      );

      const isGroupOwner = Boolean(
        targetGroup && currentUser?.id === targetGroup.owner_id
      );

      if (isGroupMember && targetGroup && !isMe) {
        if (isGroupOwner) {
          items.push({ label: '', separator: true });

          items.push({
            label: 'Transferir Posse do Grupo',
            icon: <Crown className="w-4 h-4 text-amber-400" />,
            onClick: async () => {
              const targetName = targetUser.display_name || targetUser.username;
              if (window.confirm(`Tem certeza que deseja transferir a posse do grupo para "${targetName}"?`)) {
                try {
                  await transferOwnership(targetGroup.id, targetUser.id);
                  alert(`Posse do grupo transferida com sucesso para @${targetUser.username}!`);
                } catch (err: any) {
                  alert(err?.message || 'Erro ao transferir a posse do grupo');
                }
              }
            },
          });

          items.push({
            label: 'Remover do Grupo',
            icon: <UserMinus className="w-4 h-4 text-dnd" />,
            variant: 'danger',
            onClick: async () => {
              const targetName = targetUser.display_name || targetUser.username;
              if (window.confirm(`Tem certeza que deseja remover ${targetName} do grupo?`)) {
                try {
                  await removeGroupMember(targetGroup.id, targetUser.id);
                } catch (err: any) {
                  alert(err?.message || 'Erro ao remover membro do grupo');
                }
              }
            },
          });
        }
      }

      if (!isMe) {
        items.push({ label: '', separator: true });
        items.push({
          label: 'Bloquear Usuário',
          icon: <UserX className="w-4 h-4 text-dnd" />,
          variant: 'danger',
          onClick: async () => {
            if (confirm(`Deseja bloquear @${targetUser.username}? Você não receberá mais mensagens diretas deste usuário.`)) {
              await api.users.block(targetUser.id);
            }
          },
        });
      }

      items.push({ label: '', separator: true });
      items.push({
        label: 'Copiar ID do Usuário',
        icon: <Copy className="w-4 h-4" />,
        onClick: () => copyToClipboard(targetUser.id),
      });

      openContextMenu(e, items, `@${targetUser.username}`);
    },
    [currentUser, activeGuild, activeGroup, transferOwnership, removeGroupMember, openDMWithUser, perms, assignRole, removeRole, muteMember, kickMember, banMember, openContextMenu, friends, sendRequest]
  );

  return {
    menu,
    openContextMenu,
    closeContextMenu,
    handleUserContextMenu,
  };
}
