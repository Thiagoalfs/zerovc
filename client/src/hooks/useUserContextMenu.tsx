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
  PhoneForwarded,
  Volume2,
  UserPlus,
  Crown,
} from 'lucide-react';
import { User, Role } from '../types';
import { useAuthStore } from '../stores/authStore';
import { useGuildStore } from '../stores/guildStore';
import { useDMStore } from '../stores/dmStore';
import { useDMGroupStore } from '../stores/dmGroupStore';
import { useFriendStore } from '../stores/friendStore';
import { useContextMenu, ContextMenuItem, RoleSelectorMenu } from '../components/ContextMenu';
import { UserVolumeSlider, StreamVolumeSlider } from '../components/Voice/VolumeSliders';
import { useGuildPermissions } from './useGuildPermissions';
import { canUserMuteVoice, canUserDeafenVoice } from '../utils/userActivity';
import { api } from '../lib/api';
import { showConfirm, showAlert } from '../stores/confirmModalStore';
import { copyToClipboard } from '../utils/clipboard';

export interface UserContextMenuOptions {
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  isMe?: boolean;
  isVoiceActive?: boolean;
  isVoiceMuted?: boolean;
  isVoiceDeafened?: boolean;
  isScreenSharing?: boolean;
  voiceChannelId?: string;
  contextType?: 'guild' | 'dm' | 'friends' | 'voice' | 'dm_group';
  groupId?: string;
}

export function useUserContextMenu() {
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const perms = useGuildPermissions();

  const handleUserContextMenu = useCallback(
    (e: React.MouseEvent, targetUser: User, options: UserContextMenuOptions = {}) => {
      e.preventDefault();
      e.stopPropagation();

      const currentUser = useAuthStore.getState().user;
      const { activeGuild, muteMember, kickMember, banMember } = useGuildStore.getState();
      const { openDMWithUser } = useDMStore.getState();
      const { activeGroup, transferOwnership, removeMember: removeGroupMember } = useDMGroupStore.getState();
      const { friends, sendRequest } = useFriendStore.getState();

      const isMe =
        Boolean(options.isMe) ||
        (Boolean(currentUser?.id) &&
          String(targetUser.id).toLowerCase() === String(currentUser?.id).toLowerCase());
      const isBot = Boolean(targetUser.is_bot);
      const isGuildContext = options.contextType === 'guild';

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
                showAlert({
                  title: 'Pedido de Amizade',
                  message: `Pedido de amizade enviado para @${targetUser.username}!`,
                  variant: 'success',
                });
              } catch (err: any) {
                showAlert({
                  title: 'Erro de Amizade',
                  message: err?.message || 'Erro ao enviar pedido de amizade',
                  variant: 'danger',
                });
              }
            },
          });
        }

        if (options.isVoiceActive) {
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
      }

      const targetMember = isGuildContext && activeGuild
        ? activeGuild.members?.find((m) => String(m.id).toLowerCase() === String(targetUser.id).toLowerCase()) || targetUser
        : targetUser;
      const mod = isGuildContext && activeGuild ? perms.canModerateMember(targetMember) : null;
      const canModerateTarget = Boolean(perms.isCurrentOwner || (mod && !mod.isTargetOwner && mod.isHierarchyAllowed));

      // Voice Channel Moderation (Move to stays above server moderation; Mute/Deafen/Disconnect are danger actions below Ban)
      const voiceChannel = options.voiceChannelId
        ? activeGuild?.channels?.find((c) => c.id === options.voiceChannelId)
        : undefined;
      const canMuteInVoice = Boolean(
        options.voiceChannelId &&
          !isMe &&
          canModerateTarget &&
          (canUserMuteVoice(voiceChannel, activeGuild, currentUser) || perms.isCurrentOwner || perms.hasAdmin)
      );
      const canDeafenInVoice = Boolean(
        options.voiceChannelId &&
          !isMe &&
          canModerateTarget &&
          (canUserDeafenVoice(voiceChannel, activeGuild, currentUser) || perms.isCurrentOwner || perms.hasAdmin)
      );
      const canMoveMembers = Boolean(
        options.voiceChannelId &&
          !isMe &&
          canModerateTarget &&
          (perms.canMoveMembers || perms.isCurrentOwner || perms.hasAdmin)
      );

      if (canMoveMembers && activeGuild) {
        items.push({ label: '', separator: true });
        const otherVoiceChannels = (activeGuild.channels || []).filter(
          (c) => c.type === 'voice' && c.id !== options.voiceChannelId
        );
        if (otherVoiceChannels.length > 0) {
          items.push({
            label: 'Mover para',
            icon: <PhoneForwarded className="w-4 h-4 text-indigo-400" />,
            subItems: otherVoiceChannels.map((vc) => ({
              label: vc.name,
              icon: <Volume2 className="w-4 h-4 text-gray-400" />,
              onClick: async () => {
                try {
                  await api.channels.adminUpdateVoiceState(options.voiceChannelId!, targetUser.id, {
                    target_channel_id: vc.id,
                  });
                } catch (err: any) {
                  console.error('Erro ao mover membro:', err);
                }
              },
            })),
          });
        } else {
          items.push({
            label: 'Mover para',
            icon: <PhoneForwarded className="w-4 h-4 text-gray-500" />,
            disabled: true,
            tooltip: 'Nenhuma outra chamada disponível',
          });
        }
      }

      // Server Member Moderation Actions (Roles, Timeout, Kick, Ban)
      if (isGuildContext && activeGuild && mod) {
        // Change Roles Submenu
        const canManageTargetRoles = perms.isCurrentOwner || (!mod.isTargetOwner && (isMe ? perms.canManageRoles : mod.isHierarchyAllowed));
        if (canManageTargetRoles) {
          if (perms.canManageRoles && activeGuild.roles && activeGuild.roles.length > 0) {
            const hasAssignableRoles = activeGuild.roles.some((role) => {
              if (role.name === '@everyone') return false;
              if (perms.isCurrentOwner) return true;
              const rolePos = typeof role.position === 'number' ? role.position : 999;
              return rolePos > perms.currentUserHighestPos;
            });

            if (hasAssignableRoles) {
              items.push({
                label: 'Alterar Cargos',
                icon: <Shield className="w-4 h-4 text-brand-400" />,
                subCustomRender: (
                  <RoleSelectorMenu
                    guild={activeGuild}
                    targetUser={targetMember}
                    showHeader={false}
                    maxHeightClass="max-h-[260px]"
                  />
                ),
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
              onClick: async () => {
                const confirmed = await showConfirm({
                  title: 'Expulsar Membro',
                  message: `Tem certeza que deseja expulsar ${targetMember.display_name || targetMember.username} do servidor?`,
                  confirmText: 'Expulsar',
                  variant: 'danger',
                  icon: 'user',
                });
                if (confirmed) {
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
              onClick: async () => {
                const confirmed = await showConfirm({
                  title: 'Banir Membro',
                  message: `Tem certeza que deseja banir ${targetMember.display_name || targetMember.username} do servidor? Esta ação removerá o usuário permanentemente.`,
                  confirmText: 'Banir Membro',
                  variant: 'danger',
                  icon: 'user',
                });
                if (confirmed) {
                  banMember(activeGuild.id, targetMember.id);
                }
              },
            });
          }
        }
      }

      // Voice Channel Danger Actions (below Ban)
      if (options.voiceChannelId && (canMuteInVoice || canDeafenInVoice || canMoveMembers)) {
        if (canMuteInVoice) {
          items.push({
            label: 'Silenciar no servidor',
            icon: <MicOff className="w-4 h-4 text-dnd" />,
            variant: 'danger',
            checked: Boolean(options.isVoiceMuted),
            onClick: async (nextChecked) => {
              await api.channels.adminUpdateVoiceState(options.voiceChannelId!, targetUser.id, {
                is_muted: nextChecked ?? !options.isVoiceMuted,
              });
            },
          });
        }

        if (canDeafenInVoice) {
          items.push({
            label: 'Ensurdecer no servidor',
            icon: <Headphones className="w-4 h-4 text-dnd" />,
            variant: 'danger',
            checked: Boolean(options.isVoiceDeafened),
            onClick: async (nextChecked) => {
              await api.channels.adminUpdateVoiceState(options.voiceChannelId!, targetUser.id, {
                is_deafened: nextChecked ?? !options.isVoiceDeafened,
              });
            },
          });
        }

        if (canMoveMembers) {
          items.push({
            label: 'Desconectar da Call',
            icon: <PhoneOff className="w-4 h-4 text-dnd" />,
            variant: 'danger',
            onClick: async () => {
              await api.channels.adminUpdateVoiceState(options.voiceChannelId!, targetUser.id, {
                disconnect: true,
              });
            },
          });
        }
      }

      // DM Group Moderation / Ownership Actions (only in dm_group context)
      const isGroupContext = options.contextType === 'dm_group';
      const targetGroup = isGroupContext
        ? (options.groupId
            ? useDMGroupStore.getState().groups.find((g) => g.id === options.groupId) || activeGroup
            : activeGroup)
        : null;

      const isGroupMember = Boolean(
        targetGroup && targetGroup.members?.some((m) => m.id === targetUser.id)
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
              const confirmed = await showConfirm({
                title: 'Transferir Posse do Grupo',
                message: `Tem certeza que deseja transferir a posse do grupo para "${targetName}"? Você deixará de ser o administrador principal do grupo.`,
                confirmText: 'Transferir Posse',
                variant: 'warning',
              });
              if (confirmed) {
                try {
                  await transferOwnership(targetGroup.id, targetUser.id);
                  showAlert({
                    title: 'Posse Transferida',
                    message: `Posse do grupo transferida com sucesso para @${targetUser.username}!`,
                    variant: 'success',
                  });
                } catch (err: any) {
                  showAlert({
                    title: 'Erro ao Transferir',
                    message: err?.message || 'Erro ao transferir a posse do grupo',
                    variant: 'danger',
                  });
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
              const confirmed = await showConfirm({
                title: 'Remover do Grupo',
                message: `Tem certeza que deseja remover ${targetName} do grupo?`,
                confirmText: 'Remover',
                variant: 'danger',
                icon: 'user',
              });
              if (confirmed) {
                try {
                  await removeGroupMember(targetGroup.id, targetUser.id);
                } catch (err: any) {
                  showAlert({
                    title: 'Erro',
                    message: err?.message || 'Erro ao remover membro do grupo',
                    variant: 'danger',
                  });
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
            const confirmed = await showConfirm({
              title: 'Bloquear Usuário',
              message: `Deseja bloquear @${targetUser.username}? Vocês não receberão mais mensagens diretas nem poderão se conectar.`,
              confirmText: 'Bloquear',
              variant: 'danger',
              icon: 'user',
            });
            if (confirmed) {
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
    [perms, openContextMenu]
  );

  return {
    menu,
    openContextMenu,
    closeContextMenu,
    handleUserContextMenu,
  };
}
