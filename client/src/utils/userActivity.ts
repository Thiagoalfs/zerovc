import { User, Guild, Permissions } from '../types';

export interface DisplayedActivity {
  kind: 'game' | 'music' | 'other' | 'call';
  type: string;
  header: string;
  name: string;
  details?: string;
  state?: string;
  emoji?: string;
  guildName?: string;
  guildIcon?: string;
  participantCount?: number;
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
  const user = isMe && currentUser ? { ...targetUser, ...currentUser } : targetUser;

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
    };
  }

  // 4. CALL (Prioridade Mínima)
  // Check if targetUser is in any voice channel in a guild that currentUser is in and has access to
  if (!currentUser) return null;

  for (const guild of guilds) {
    if (!guild.channels || guild.channels.length === 0) continue;

    const isOwner = guild.owner_id === currentUser.id;
    const currentMember = guild.members?.find((m) => m.id === currentUser.id);

    for (const ch of guild.channels) {
      if (ch.type !== 'voice') continue;

      const isInVoice = ch.voice_sessions?.some((s) => s.user_id === targetUser.id);
      if (!isInVoice) continue;

      // Verify if currentUser has permission to see and join this voice channel
      let hasAccess = false;

      if (isOwner) {
        hasAccess = true;
      } else {
        const userRoles = (currentMember?.roles || []).map((r) => {
          const fullRole = guild.roles?.find((gr) => gr.id === r.id);
          return fullRole ? { ...r, ...fullRole } : r;
        });

        const everyoneRole = guild.roles?.find((r) => r.name === '@everyone');
        let userPerms = everyoneRole ? (everyoneRole.permissions || 0) : 0;
        userRoles.forEach((r) => {
          userPerms |= (r.permissions || 0);
        });

        // Administrator bypasses restrictions
        if ((userPerms & Permissions.ADMINISTRATOR) !== 0) {
          hasAccess = true;
        } else {
          const canView = (userPerms & Permissions.VIEW_CHANNEL) !== 0;
          const canConnect = (userPerms & Permissions.CONNECT_VOICE) !== 0;
          if (canView || canConnect) {
            hasAccess = true;
          }

          // Private channel role check
          if (ch.is_private) {
            const hasRole = ch.role_ids && ch.role_ids.length > 0
              ? userRoles.some((r) => ch.role_ids?.includes(r.id))
              : false;
            if (!hasRole) {
              hasAccess = false;
            }
          }

          // Permission overwrites
          if (ch.permission_overwrites && ch.permission_overwrites.length > 0) {
            if (everyoneRole) {
              const ow = ch.permission_overwrites.find((o) => o.role_id === everyoneRole.id);
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
              const ow = ch.permission_overwrites?.find((o) => o.role_id === r.id);
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
        }
      }

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
