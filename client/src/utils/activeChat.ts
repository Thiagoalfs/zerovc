export type ActiveChatType = 'channel' | 'dm' | 'group' | 'friends' | 'none';

export interface ActiveChatState {
  type: ActiveChatType;
  id: string | null;
}

let currentActiveChat: ActiveChatState = {
  type: 'none',
  id: null,
};

export const setActiveChat = (type: ActiveChatType, id: string | null = null) => {
  currentActiveChat = { type, id };
};

export const getActiveChat = (): ActiveChatState => {
  return currentActiveChat;
};

export const isChatActiveNow = (type: ActiveChatType, id: string): boolean => {
  return currentActiveChat.type === type && currentActiveChat.id === id;
};
