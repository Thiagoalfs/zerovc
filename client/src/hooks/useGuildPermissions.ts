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
  canSendTTS: boolean;
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
        canSendTTS: false,
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

    const isCurrentOwner = Boolean(
      user.id && guild.owner_id && String(user.id).toLowerCase() === String(guild.owner_id).toLowerCase()
    );
    const currentMember = guild.members?.find(
      (m) => String(m.id).toLowerCase() === String(user.id).toLowerCase()
    );
    const rawRoles = (currentMember?.roles && currentMember.roles.length > 0)
      ? currentMember.roles
      : (user.roles || []);

    const everyoneRole = guild.roles?.find((r) => r.name === '@everyone');
    let currentUserPerms = Number(everyoneRole?.permissions || 0);

    // Resolve roles against live guild.roles to ensure updated permissions are applied immediately
    const currentUserRoles: Role[] = [];
    const seenRoleIds = new Set<string>();

    rawRoles.forEach((r: any) => {
      if (!r) return;
      const roleId = typeof r === 'string' ? r : r.id;
      if (roleId && seenRoleIds.has(String(roleId))) return;
      if (roleId) seenRoleIds.add(String(roleId));

      const liveRole = guild.roles?.find((gr) => String(gr.id) === String(roleId));
      const finalRole = liveRole ? { ...r, ...liveRole } : r;
      currentUserRoles.push(finalRole);
      currentUserPerms |= Number(finalRole.permissions || 0);
    });

    // Highest role position (lower number = higher hierarchy).
    // Owner is always -1. For non-owners, @everyone is excluded so custom roles determine rank.
    let currentUserHighestPos = isCurrentOwner ? -1 : 999999;
    if (!isCurrentOwner) {
      currentUserRoles.forEach((r) => {
        if (!r || r.name === '@everyone') return;
        const pos = typeof r.position === 'number' ? r.position : 999999;
        if (pos < currentUserHighestPos) {
          currentUserHighestPos = pos;
        }
      });
    }

    const hasAdmin = isCurrentOwner || (currentUserPerms & Permissions.ADMINISTRATOR) !== 0;
    const canManageGuild = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_GUILD) !== 0;
    const canManageRoles = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_ROLES) !== 0;
    const canManageChannels = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_CHANNELS) !== 0;
    const canKick = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.KICK_MEMBERS) !== 0;
    const canBan = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.BAN_MEMBERS) !== 0;
    const canMute = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MUTE_MEMBERS) !== 0;
    const canManageMessages = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_MESSAGES) !== 0;
    const canSendTTS = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.SEND_TTS) !== 0;
    const canMuteVoice = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MUTE_VOICE) !== 0;
    const canDeafenVoice = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.DEAFEN_VOICE) !== 0;

    const canModerateMember = (targetUser?: User | { id: string; roles?: Role[] } | null) => {
      if (!targetUser || !targetUser.id) {
        return {
          isMe: false,
          isTargetOwner: false,
          targetHighestPos: 999999,
          isHierarchyAllowed: false,
        };
      }
      const isMe = String(targetUser.id).toLowerCase() === String(user.id).toLowerCase();
      const isTargetOwner = String(targetUser.id).toLowerCase() === String(guild.owner_id).toLowerCase();

      const targetMember = guild.members?.find((m) => String(m.id).toLowerCase() === String(targetUser.id).toLowerCase()) || targetUser;
      let targetHighestPos = 999999;
      const targetRoles = (targetMember as any).roles || [];
      targetRoles.forEach((r: any) => {
        if (!r) return;
        const roleId = typeof r === 'string' ? r : r.id;
        const liveRole = guild.roles?.find((gr) => String(gr.id) === String(roleId)) || r;
        if (liveRole.name === '@everyone') return;
        const pos = typeof liveRole.position === 'number' ? liveRole.position : 999999;
        if (pos < targetHighestPos) {
          targetHighestPos = pos;
        }
      });

      const isHierarchyAllowed = !isMe && !isTargetOwner && (isCurrentOwner || currentUserHighestPos < targetHighestPos);

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
      canSendTTS,
      canMuteVoice,
      canDeafenVoice,
      canModerateMember,
    };
  }, [guild, user]);
}
