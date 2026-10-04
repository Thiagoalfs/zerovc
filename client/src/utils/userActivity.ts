import { User, Guild, Channel, Permissions } from '../types';

export interface DisplayedActivity {
  kind: 'game' | 'music' | 'other' | 'call';
  type: string;
  header: string;
  name: string;
  details?: string;
  state?: string;
  emoji?: string;
  icon_url?: string;
  guildName?: string;
  guildIcon?: string;
  participantCount?: number;
}

/**
 * Checks whether the current user has permission to view/access a channel in a guild.
 */
export function canUserViewChannel(ch: Channel, guild: Guild | null, currentUser: User | null): boolean {
  if (!guild || !ch || ch.type === 'category' || !currentUser) return false;

  // Server owner always has full access
  if (guild.owner_id === currentUser.id) return true;

  const currentMember = (guild.members || []).find((m) => String(m.id) === String(currentUser.id));
  const userRoles = (currentMember?.roles || []).map((r) => {
    const fullRole = (guild.roles || []).find((gr) => String(gr.id) === String(r.id));
    return fullRole ? { ...r, ...fullRole } : r;
  });

  const everyoneRole = (guild.roles || []).find((r) => r.name === '@everyone');
  let userPerms = everyoneRole ? (everyoneRole.permissions || 0) : 0;
  userRoles.forEach((r) => {
    userPerms |= (r.permissions || 0);
  });

  // Administrator bypasses restrictions
  if ((userPerms & Permissions.ADMINISTRATOR) !== 0) {
    return true;
  }

  const canView = (userPerms & Permissions.VIEW_CHANNEL) !== 0;
  const canConnect = (userPerms & Permissions.CONNECT_VOICE) !== 0;
  let hasAccess = canView || canConnect;

  // Private channel role check
  if (ch.is_private) {
    const hasRole = ch.role_ids && ch.role_ids.length > 0
      ? userRoles.some((r) => ch.role_ids?.some((id) => String(id) === String(r.id)))
      : false;
    if (!hasRole) {
      hasAccess = false;
    }
  }

  // Permission overwrites
  if (ch.permission_overwrites && ch.permission_overwrites.length > 0) {
    if (everyoneRole) {
      const ow = ch.permission_overwrites.find((o) => String(o.role_id) === String(everyoneRole.id));
      if (ow) {
        if ((ow.deny & Permissions.VIEW_CHANNEL) !== 0 || (ow.deny & Permissions.CONNECT_VOICE) !== 0) {
          hasAccess = false;
        }
        if ((ow.allow & Permissions.VIEW_CHANNEL) !== 0 || (ow.allow & Permissions.CONNECT_VOICE) !== 0) {
          hasAccess = true;
        }
      }
    }

    userRoles.forEach((r) => {
      const ow = ch.permission_overwrites?.find((o) => String(o.role_id) === String(r.id));
      if (ow) {
        if ((ow.deny & Permissions.VIEW_CHANNEL) !== 0 || (ow.deny & Permissions.CONNECT_VOICE) !== 0) {
          hasAccess = false;
        }
        if ((ow.allow & Permissions.VIEW_CHANNEL) !== 0 || (ow.allow & Permissions.CONNECT_VOICE) !== 0) {
          hasAccess = true;
        }
      }
    });
  }

  return hasAccess;
}

/**
  * Checks if a user has permission to use TTS in a channel,
  * combining guild role permissions, Administrator bypass, and channel permission overwrites.
  */
export function canUserSendTTS(
  ch: Channel | null | undefined,
  guild: Guild | null | undefined,
  currentUser: User | null | undefined
): boolean {
  if (!guild || !currentUser) return false;

  // Server owner always has full access
  if (guild.owner_id === currentUser.id) return true;

  const currentMember = (guild.members || []).find((m) => String(m.id) === String(currentUser.id));
  const userRoles = (currentMember?.roles || []).map((r) => {
    const fullRole = (guild.roles || []).find((gr) => String(gr.id) === String(r.id));
    return fullRole ? { ...r, ...fullRole } : r;
  });

  const everyoneRole = (guild.roles || []).find((r) => r.name === '@everyone');
  let userPerms = everyoneRole ? (everyoneRole.permissions || 0) : 0;
  userRoles.forEach((r) => {
    userPerms |= (r.permissions || 0);
  });

  // Administrator bypasses restrictions
  if ((userPerms & Permissions.ADMINISTRATOR) !== 0) {
    return true;
  }

  let hasTTS = (userPerms & Permissions.SEND_TTS) !== 0;

  // Channel permission overwrites
  if (ch && ch.permission_overwrites && ch.permission_overwrites.length > 0) {
    if (everyoneRole) {
      const ow = ch.permission_overwrites.find((o) => String(o.role_id) === String(everyoneRole.id));
      if (ow) {
        if ((ow.deny & Permissions.SEND_TTS) !== 0) {
          hasTTS = false;
        }
        if ((ow.allow & Permissions.SEND_TTS) !== 0) {
          hasTTS = true;
        }
      }
    }

    let roleDeny = false;
    let roleAllow = false;
    userRoles.forEach((r) => {
      const ow = ch.permission_overwrites?.find((o) => String(o.role_id) === String(r.id));
      if (ow) {
        if ((ow.deny & Permissions.SEND_TTS) !== 0) {
          roleDeny = true;
        }
        if ((ow.allow & Permissions.SEND_TTS) !== 0) {
          roleAllow = true;
        }
      }
    });

    if (roleDeny) hasTTS = false;
    if (roleAllow) hasTTS = true;
  }

  return hasTTS;
}

/**
 * Finds the first accessible channel for the current user in a guild:
 * Prioritizes text channels, followed by any accessible channel. Categories are excluded.
 */
export function findFirstAccessibleChannel(
  channels: Channel[],
  guild: Guild | null,
  currentUser: User | null
): Channel | null {
  if (!channels || channels.length === 0 || !guild || !currentUser) return null;

  const nonCategories = channels.filter((c) => c.type !== 'category');
  const accessible = nonCategories.filter((c) => canUserViewChannel(c, guild, currentUser));

  if (accessible.length === 0) return null;

  return accessible.find((c) => c.type === 'text') || accessible[0];
}

/**
 * Resolves the single highest-priority active activity for a user:
 * Priority Order:
 * 1. Jogo (Máxima)
 * 2. Música (Média)
 * 3. Outras Atividades (Vídeo/Stream/Competição)
 * 4. Call (Mínima - apenas se o usuário atual for membro do servidor e tiver permissão para ver a call)
 */
export function getUserActivity(
  targetUser: User | null,
  currentUser: User | null,
  guilds: Guild[]
): DisplayedActivity | null {
  if (!targetUser) return null;

  const isMe = currentUser?.id === targetUser.id;
  const user = isMe && currentUser ? currentUser : targetUser;

  if (user.status === 'offline') return null;

  const customAct = user.custom_activity;
  const showActivity = user.show_activity_status !== false;

  // 1. JOGO (Prioridade Máxima)
  if (showActivity && customAct && customAct.type === 'playing' && customAct.name) {
    return {
      kind: 'game',
      type: 'playing',
      header: 'Jogando agora',
      name: customAct.name,
      details: customAct.details,
      state: customAct.state,
      emoji: customAct.emoji,
      icon_url: customAct.icon_url,
    };
  }

  // 2. MÚSICA (Prioridade Média)
  if (showActivity && customAct && customAct.type === 'listening' && customAct.name) {
    return {
      kind: 'music',
      type: 'listening',
      header: 'Ouvindo',
      name: customAct.name,
      details: customAct.details,
      state: customAct.state,
      emoji: customAct.emoji,
      icon_url: customAct.icon_url,
    };
  }

  // 3. OUTRAS ATIVIDADES CUSTOMIZADAS (Watching, Streaming, Competing, Custom)
  if (showActivity && customAct && customAct.name && customAct.type !== 'playing' && customAct.type !== 'listening') {
    const headerMap: Record<string, string> = {
      watching: 'Assistindo',
      streaming: 'Transmitindo',
      competing: 'Competindo',
      custom: 'Atividade',
    };
    return {
      kind: 'other',
      type: customAct.type,
      header: headerMap[customAct.type] || 'Atividade',
      name: customAct.name,
      details: customAct.details,
      state: customAct.state,
      emoji: customAct.emoji,
      icon_url: customAct.icon_url,
    };
  }

  // 4. CALL (Prioridade Mínima)
  // Check if targetUser is in any voice channel in a guild that currentUser is in and has access to
  if (!currentUser) return null;

  for (const guild of guilds) {
    if (!guild.channels || guild.channels.length === 0) continue;

    for (const ch of guild.channels) {
      if (ch.type !== 'voice') continue;

      const isInVoice = ch.voice_sessions?.some((s) => s.user_id === targetUser.id);
      if (!isInVoice) continue;

      // Verify if currentUser has permission to see and join this voice channel
      const hasAccess = canUserViewChannel(ch, guild, currentUser);

      if (hasAccess) {
        const participantCount = ch.voice_sessions?.length || 1;
        return {
          kind: 'call',
          type: 'call',
          header: 'Em chamada de voz',
          name: ch.name,
          details: guild.name,
          state: `${participantCount} ${participantCount === 1 ? 'membro' : 'membros'} no canal`,
          guildName: guild.name,
          guildIcon: guild.icon_url,
          participantCount,
        };
      }
    }
  }

  return null;
}
