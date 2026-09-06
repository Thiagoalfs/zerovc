export const Permissions = {
  ADMINISTRATOR: 1 << 0, // 1: Permissão Mestre (Ativa tudo e ignora restrições)
  MANAGE_GUILD: 1 << 1, // 2: Gerenciar Servidor
  MANAGE_ROLES: 1 << 2, // 4: Gerenciar Cargos
  MANAGE_CHANNELS: 1 << 3, // 8: Gerenciar Canais e Categorias
  KICK_MEMBERS: 1 << 4, // 16: Expulsar Membros
  BAN_MEMBERS: 1 << 5, // 32: Banir Membros
  MUTE_MEMBERS: 1 << 6, // 64: Silenciar Membros

  SEND_MESSAGES: 1 << 7, // 128: Enviar Mensagens
  MANAGE_MESSAGES: 1 << 8, // 256: Gerenciar Mensagens
  ATTACH_FILES: 1 << 9, // 512: Anexar Arquivos

  CONNECT_VOICE: 1 << 10, // 1024: Conectar em Voz
  SPEAK_VOICE: 1 << 11, // 2048: Falar em Voz
  MUTE_VOICE: 1 << 12, // 4096: Silenciar Outros em Voz
  DEAFEN_VOICE: 1 << 13, // 8192: Ensurdecer Outros em Voz
} as const;

export interface User {
  id: string;
  username: string;
  display_name?: string;
  email?: string;
  phone_number?: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  custom_status?: string;
  roles?: Role[];
  two_factor_enabled?: boolean;
  muted_until?: string;
  created_at?: string;
}

export interface FavoriteGIF {
  id: string;
  user_id: string;
  gif_url: string;
  preview_url?: string;
  title?: string;
  created_at: string;
}

export interface Role {
  id: string;
  guild_id: string;
  name: string;
  color: string;
  position: number;
  permissions: number;
  created_at?: string;
}

export interface Guild {
  id: string;
  name: string;
  icon_url?: string;
  banner_url?: string;
  owner_id: string;
  channels?: Channel[];
  members?: User[];
  roles?: Role[];
  created_at: string;
}

export interface Channel {
  id: string;
  guild_id: string;
  name: string;
  type: 'text' | 'voice' | 'category';
  category_id?: string;
  topic?: string;
  position: number;
  is_private?: boolean;
  role_ids?: string[];
  voice_sessions?: VoiceSession[];
  created_at: string;
}

export interface Attachment {
  url: string;
  filename: string;
  size: number;
  type: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  user_ids: string[];
}

export interface MessageReplyInfo {
  id: string;
  author: User;
  content: string;
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  author: User;
  content: string;
  attachments?: Attachment[];
  reply_to_id?: string;
  reply_to?: MessageReplyInfo;
  reactions?: MessageReaction[];
  is_pinned: boolean;
  is_edited?: boolean;
  edited_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DMRoom {
  id: string;
  user1_id: string;
  user2_id: string;
  recipient: User;
  last_message?: DMMessage;
  created_at: string;
}

export interface DMMessage {
  id: string;
  dm_room_id: string;
  author_id: string;
  author: User;
  content: string;
  attachments?: Attachment[];
  reply_to_id?: string;
  reply_to?: MessageReplyInfo;
  reactions?: MessageReaction[];
  is_pinned?: boolean;
  is_edited?: boolean;
  edited_at?: string;
  created_at: string;
}

export interface DMGroup {
  id: string;
  name?: string;
  icon_url?: string;
  owner_id: string;
  members: User[];
  last_message?: DMGroupMessage;
  created_at: string;
}

export interface DMGroupMessage {
  id: string;
  group_id: string;
  author_id: string;
  author: User;
  content: string;
  attachments?: Attachment[];
  reply_to_id?: string;
  reply_to?: MessageReplyInfo;
  reactions?: MessageReaction[];
  is_pinned?: boolean;
  is_edited?: boolean;
  edited_at?: string;
  created_at: string;
}

export interface VoiceSession {
  id: string;
  channel_id: string;
  user_id: string;
  user: User;
  is_muted: boolean;
  is_deafened: boolean;
  is_screensharing: boolean;
  joined_at: string;
}

export interface GuildInvite {
  code: string;
  guild_id: string;
  guild?: Guild;
  creator_id: string;
  creator?: User;
  uses: number;
  created_at: string;
}

export interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  user?: User;
  friend?: User;
  created_at: string;
}

export type Friendship = Friend;

export interface AuditLog {
  id: string;
  guild_id: string;
  actor_id: string;
  actor?: User;
  action_type: string;
  target_id?: string;
  target_user?: User;
  details: Record<string, any>;
  created_at: string;
}

export interface ChannelReadState {
  user_id: string;
  channel_id: string;
  last_read_message_id?: string;
  unread_count: number;
  updated_at: string;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      getScreenSources: () => Promise<Array<{ id: string; name: string; thumbnail: string; appIcon: string | null }>>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      checkForUpdates: () => void;
      startDownloadUpdate: () => void;
      quitAndInstall: () => void;
      openExternal: (url: string) => void;
      reloadApp: () => void;
      registerGlobalShortcut?: (shortcut: string, action: string) => Promise<boolean>;
      unregisterAllShortcuts?: () => Promise<boolean>;
      onGlobalShortcut?: (callback: (action: string) => void) => () => void;
      onRepoUpdateAvailable?: (callback: (info: any) => void) => () => void;
      onUpdateAvailable: (callback: (info: any) => void) => () => void;
      onUpdateProgress: (callback: (progress: any) => void) => () => void;
      onUpdateDownloaded: (callback: (info: any) => void) => () => void;
      setMinimizeToTray?: (enabled: boolean) => void;
      getMinimizeToTray?: () => Promise<boolean>;
      setAutoStart?: (enabled: boolean) => void;
      getAutoStart?: () => Promise<boolean>;
      setZoomFactor?: (factor: number) => void;
      getZoomFactor?: () => number;
    };
  }
}

