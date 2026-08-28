export interface User {
  id: string;
  username: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  custom_status?: string;
  roles?: Role[];
  two_factor_enabled?: boolean;
  created_at?: string;
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
