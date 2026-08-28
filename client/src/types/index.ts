export interface User {
  id: string;
  username: string;
  email?: string;
  avatar_url: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  custom_status: string;
  created_at?: string;
  updated_at?: string;
}

export type UserPublic = User;

export interface GuildMember {
  guild_id: string;
  user_id: string;
  nickname: string;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  joined_at: string;
}

export interface Channel {
  id: string;
  guild_id: string;
  name: string;
  type: 'text' | 'voice';
  topic: string;
  position: number;
  voice_sessions?: VoiceSession[];
  created_at: string;
}

export interface Guild {
  id: string;
  name: string;
  icon_url: string;
  owner_id: string;
  channels?: Channel[];
  members?: User[];
  created_at: string;
  updated_at: string;
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

export interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  user?: User;
  friend?: User;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  url: string;
  filename: string;
  size: number;
  type: string;
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  author: User;
  content: string;
  attachments: Attachment[];
  reply_to_id?: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
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

export interface WSEvent<T = any> {
  type: string;
  data: T;
}
