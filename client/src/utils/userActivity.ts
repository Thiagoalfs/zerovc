import React, { useState, useEffect, useMemo } from 'react';
import { User, Guild, Channel, Permissions, VoiceSession } from '../types';
import { useVoiceStore } from '../stores/voiceStore';
import { useGuildStore } from '../stores/guildStore';

export interface DisplayedActivity {
  kind: 'game' | 'music' | 'other' | 'call';
  type: string;
  header: string;
  name: string;
  details?: string;
  state?: string;
  emoji?: string;
  icon_url?: string;
  start_time?: number;
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
 * Checks if a user has permission to use slash commands in a channel,
 * combining guild role permissions, Administrator bypass, and channel permission overwrites.
 */
export function canUserUseCommands(
  ch: Channel | null | undefined,
  guild: Guild | null | undefined,
  currentUser: User | null | undefined
): boolean {
  if (!guild || !currentUser) return true;

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

  let hasPerm = (userPerms & Permissions.USE_COMMANDS) !== 0;

  // Channel permission overwrites
  if (ch && ch.permission_overwrites && ch.permission_overwrites.length > 0) {
    if (everyoneRole) {
      const ow = ch.permission_overwrites.find((o) => String(o.role_id) === String(everyoneRole.id));
      if (ow) {
        if ((ow.deny & Permissions.USE_COMMANDS) !== 0) {
          hasPerm = false;
        }
        if ((ow.allow & Permissions.USE_COMMANDS) !== 0) {
          hasPerm = true;
        }
      }
    }

    let roleDeny = false;
    let roleAllow = false;
    userRoles.forEach((r) => {
      const ow = ch.permission_overwrites?.find((o) => String(o.role_id) === String(r.id));
      if (ow) {
        if ((ow.deny & Permissions.USE_COMMANDS) !== 0) {
          roleDeny = true;
        }
        if ((ow.allow & Permissions.USE_COMMANDS) !== 0) {
          roleAllow = true;
        }
      }
    });

    if (roleDeny) hasPerm = false;
    if (roleAllow) hasPerm = true;
  }

  return hasPerm;
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
  guilds: Guild[],
  guildVoiceStates?: Record<string, VoiceSession[]>
): DisplayedActivity | null {
  if (!targetUser) return null;

  const isMe = currentUser?.id === targetUser.id;
  const user = isMe && currentUser ? currentUser : targetUser;

  if (user.status === 'offline') return null;

  const rawCustomAct = user.custom_activity;
  const customAct = rawCustomAct && rawCustomAct.name !== 'OBS Studio' ? rawCustomAct : undefined;
  const showActivity = user.show_activity_status !== false;

  // 1. JOGO (Prioridade Máxima)
  if (showActivity && customAct && customAct.type === 'playing' && customAct.name) {
    let iconUrl = customAct.icon_url;
    if (customAct.name.toLowerCase() === 'minecraft') {
      if (!iconUrl || iconUrl.includes('java') || iconUrl.startsWith('data:image/x-icon') || iconUrl.includes('games/minecraft')) {
        iconUrl = '/assets/minecraft.webp';
      }
    }
    return {
      kind: 'game',
      type: 'playing',
      header: 'Jogando',
      name: customAct.name,
      details: customAct.details,
      state: customAct.state,
      emoji: customAct.emoji,
      icon_url: iconUrl,
      start_time: customAct.start_time,
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
      start_time: customAct.start_time,
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
      start_time: customAct.start_time,
    };
  }

  // 4. CALL (Prioridade Mínima)
  // Check if targetUser is in any voice channel in a guild that currentUser is in and has access to
  if (!currentUser) return null;

  // If checking the local user, verify local voice connection
  if (isMe) {
    const { isConnected, currentChannelId, dmRoomId, dmGroupId } = useVoiceStore.getState();
    if (!isConnected || (!currentChannelId && !dmRoomId && !dmGroupId)) {
      return null;
    }
  }

  const voiceStatesMap = guildVoiceStates || useGuildStore.getState().guildVoiceStates;
  const currentActiveGuild = useGuildStore.getState().activeGuild;
  const allGuilds = guilds && guilds.length > 0 ? guilds : (currentActiveGuild ? [currentActiveGuild] : []);

  for (const guild of allGuilds) {
    const effectiveGuild = currentActiveGuild && currentActiveGuild.id === guild.id ? currentActiveGuild : guild;
    if (!effectiveGuild.channels || effectiveGuild.channels.length === 0) continue;

    const guildSessions = voiceStatesMap?.[effectiveGuild.id];

    for (const ch of effectiveGuild.channels) {
      if (ch.type !== 'voice') continue;

      let session: VoiceSession | undefined;

      if (guildSessions !== undefined) {
        session = guildSessions.find((s) => s.user_id === targetUser.id && s.channel_id === ch.id);
      } else {
        session = ch.voice_sessions?.find((s) => s.user_id === targetUser.id);
      }

      if (!session) continue;

      // Verify if currentUser has permission to see and join this voice channel
      const hasAccess = canUserViewChannel(ch, effectiveGuild, currentUser);

      if (hasAccess) {
        const participantCount = guildSessions
          ? guildSessions.filter((s) => s.channel_id === ch.id).length
          : ch.voice_sessions?.length || 1;
        const joinedAtMs = session.joined_at ? new Date(session.joined_at).getTime() : undefined;
        return {
          kind: 'call',
          type: 'call',
          header: 'Em chamada',
          name: ch.name,
          details: effectiveGuild.name,
          state: `${participantCount} ${participantCount === 1 ? 'membro' : 'membros'} no canal`,
          guildName: effectiveGuild.name,
          guildIcon: effectiveGuild.icon_url,
          participantCount,
          start_time: joinedAtMs,
        };
      }
    }
  }

  return null;
}

/**
 * Returns the tailwind text color class for an activity timer or label based on its type/kind:
 * - jogando (game / playing): verde (text-emerald-400)
 * - transmitindo (streaming): roxo (text-purple-400)
 * - em call (call): verde (text-emerald-400)
 * - ouvindo (music / listening): verde (text-emerald-400)
 * - assistindo (watching): roxo / índigo (text-indigo-400)
 * - competindo (competing): dourado / amarelo (text-amber-400)
 * - default: text-brand-400
 */
export function getActivityColorClass(
  activity?: DisplayedActivity | null | { kind?: string; type?: string }
): string {
  if (!activity) return 'text-gray-400';

  const kind = activity.kind;
  const type = activity.type;

  // Jogando = verde
  if (kind === 'game' || type === 'playing') {
    return 'text-emerald-400';
  }

  // Transmitindo = roxo
  if (type === 'streaming') {
    return 'text-purple-400';
  }

  // Em call = verde
  if (kind === 'call' || type === 'call') {
    return 'text-emerald-400';
  }

  // Ouvindo música = verde
  if (kind === 'music' || type === 'listening') {
    return 'text-emerald-400';
  }

  // Assistindo = roxo / índigo
  if (type === 'watching') {
    return 'text-indigo-400';
  }

  // Competindo = dourado / amarelo
  if (type === 'competing') {
    return 'text-amber-400';
  }

  return 'text-brand-400';
}

const sessionActivityStartTimes = new Map<string, number>();

/**
 * Gets or computes the start timestamp (in ms) for an activity.
 * If rawStartTime is present, normalizes seconds/ms.
 * Otherwise, records and preserves a session start timestamp for that user + game.
 */
export function getActivityStartTime(userId?: string, activityName?: string, rawStartTime?: number): number {
  if (rawStartTime && rawStartTime > 0) {
    return rawStartTime < 10000000000 ? rawStartTime * 1000 : rawStartTime;
  }
  const key = `${userId || 'unknown'}:${activityName || 'activity'}`;
  if (!sessionActivityStartTimes.has(key)) {
    sessionActivityStartTimes.set(key, Date.now());
  }
  return sessionActivityStartTimes.get(key)!;
}

export function clearActivityStartTime(userId?: string) {
  if (!userId) return;
  for (const key of sessionActivityStartTimes.keys()) {
    if (key.startsWith(`${userId}:`)) {
      sessionActivityStartTimes.delete(key);
    }
  }
}

/**
 * Formats elapsed time into clean digital format:
 * e.g. "04:32 decorridos" or "01:15:20 decorridos"
 */
export function formatElapsedTime(startTimeMs: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - startTimeMs) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)} decorridos`;
  }
  return `${pad(minutes)}:${pad(seconds)} decorridos`;
}

/**
 * React hook that live-updates the elapsed time for an active game/activity every second.
 */
export function useActivityElapsedTime(
  activity: DisplayedActivity | null | undefined,
  userId?: string
): string | null {
  const [now, setNow] = useState(() => Date.now());

  const startTimeMs = useMemo(() => {
    if (!activity || !activity.name) return null;
    return getActivityStartTime(userId, activity.name, activity.start_time);
  }, [activity?.name, activity?.start_time, userId]);

  useEffect(() => {
    if (!startTimeMs) {
      if (userId && !activity) {
        clearActivityStartTime(userId);
      }
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [startTimeMs, userId, activity]);

  if (!activity || !startTimeMs) return null;
  return formatElapsedTime(startTimeMs, now);
}
