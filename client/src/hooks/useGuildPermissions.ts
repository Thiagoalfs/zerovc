import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useGuildStore } from '../stores/guildStore';
import { Guild, User, Role, Permissions } from '../types';

export interface GuildPermissionsResult {
  currentUserRoles: Role[];
  currentUserPerms: number;
  currentUserHighestPos: number;
  isCurrentOwner: boolean;
  hasAdmin: boolean;
  canManageGuild: boolean;
  canManageRoles: boolean;
  canManageChannels: boolean;
  canKick: boolean;
  canBan: boolean;
  canMute: boolean;
  canManageMessages: boolean;
  canMuteVoice: boolean;
  canDeafenVoice: boolean;
  canModerateMember: (targetUser: User | { id: string; roles?: Role[] }) => {
    isMe: boolean;
    isTargetOwner: boolean;
    targetHighestPos: number;
    isHierarchyAllowed: boolean;
  };
}

export function useGuildPermissions(customGuild?: Guild | null): GuildPermissionsResult {
  const { user } = useAuthStore();
  const { activeGuild } = useGuildStore();
  const guild = customGuild !== undefined ? customGuild : activeGuild;

  return useMemo(() => {
    if (!guild || !user) {
      return {
        currentUserRoles: [],
        currentUserPerms: 0,
        currentUserHighestPos: 999999,
        isCurrentOwner: false,
        hasAdmin: false,
        canManageGuild: false,
        canManageRoles: false,
        canManageChannels: false,
        canKick: false,
        canBan: false,
        canMute: false,
        canManageMessages: false,
        canMuteVoice: false,
        canDeafenVoice: false,
        canModerateMember: () => ({
          isMe: false,
          isTargetOwner: false,
          targetHighestPos: 999999,
          isHierarchyAllowed: false,
        }),
      };
    }

    const isCurrentOwner = guild.owner_id === user.id;
    const currentMember = guild.members?.find((m) => m.id === user.id);
    const currentUserRoles = currentMember?.roles || [];

    let currentUserPerms = 0;
    let currentUserHighestPos = 999999;

    currentUserRoles.forEach((r) => {
      currentUserPerms |= Number(r.permissions || 0);
      if (r.position < currentUserHighestPos) {
        currentUserHighestPos = r.position;
      }
    });

    const hasAdmin = isCurrentOwner || (currentUserPerms & Permissions.ADMINISTRATOR) !== 0;
    const canManageGuild = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_GUILD) !== 0;
    const canManageRoles = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_ROLES) !== 0;
    const canManageChannels = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_CHANNELS) !== 0;
    const canKick = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.KICK_MEMBERS) !== 0;
    const canBan = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.BAN_MEMBERS) !== 0;
    const canMute = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MUTE_MEMBERS) !== 0;
    const canManageMessages = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_MESSAGES) !== 0;
    const canMuteVoice = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MUTE_VOICE) !== 0;
    const canDeafenVoice = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.DEAFEN_VOICE) !== 0;

    const canModerateMember = (targetUser: User | { id: string; roles?: Role[] }) => {
      const isMe = targetUser.id === user.id;
      const isTargetOwner = targetUser.id === guild.owner_id;

      const targetMember = guild.members?.find((m) => m.id === targetUser.id) || targetUser;
      let targetHighestPos = 999999;
      (targetMember.roles || []).forEach((r) => {
        if (r.position < targetHighestPos) {
          targetHighestPos = r.position;
        }
      });

      const isHierarchyAllowed = isCurrentOwner || isMe || currentUserHighestPos < targetHighestPos;

      return {
        isMe,
        isTargetOwner,
        targetHighestPos,
        isHierarchyAllowed,
      };
    };

    return {
      currentUserRoles,
      currentUserPerms,
      currentUserHighestPos,
      isCurrentOwner,
      hasAdmin,
      canManageGuild,
      canManageRoles,
      canManageChannels,
      canKick,
      canBan,
      canMute,
      canManageMessages,
      canMuteVoice,
      canDeafenVoice,
      canModerateMember,
    };
  }, [guild, user]);
}
