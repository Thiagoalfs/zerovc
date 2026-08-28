import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useGuildStore } from './stores/guildStore';
import { useFriendStore } from './stores/friendStore';
import { socket } from './lib/socket';
import { WSEvent, Message, VoiceSession } from './types';
import { ServerList } from './components/Sidebar/ServerList';
import { ChannelList } from './components/Sidebar/ChannelList';
import { ChatArea } from './components/Chat/ChatArea';
import { VoiceRoom } from './components/Voice/VoiceRoom';
import { FriendsView } from './components/Friends/FriendsView';
import { AuthScreen } from './components/Auth/AuthScreen';
import { CreateServerModal } from './components/Modals/CreateServerModal';
import { CreateChannelModal } from './components/Modals/CreateChannelModal';
import { ScreenShareModal } from './components/Modals/ScreenShareModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { InviteModal } from './components/Modals/InviteModal';
import { JoinServerModal } from './components/Modals/JoinServerModal';

export const App: React.FC = () => {
  const { user, token, isLoading, checkAuth } = useAuthStore();
  const { fetchGuilds, activeGuild, activeChannel, addMessage, updateVoiceState, setTyping } = useGuildStore();
  const { handleFriendEvent } = useFriendStore();

  const [isHomeActive, setIsHomeActive] = useState(false);
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  const [isJoinServerOpen, setIsJoinServerOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState<'text' | 'voice'>('text');
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (token && user) {
      fetchGuilds();

      // WebSocket Event Subscriptions
      const handleMessageCreate = (event: WSEvent<Message>) => {
        addMessage(event.data);
      };

      const handleVoiceStateUpdate = (event: WSEvent<{ action: string; session?: VoiceSession; channel_id?: string; user_id?: string }>) => {
        updateVoiceState(event.data.action, event.data.session, event.data.channel_id, event.data.user_id);
      };

      const handleTypingStart = (event: WSEvent<{ channel_id: string; user_id: string }>) => {
        setTyping(event.data.channel_id, event.data.user_id);
      };

      const handleFriendUpdate = (event: WSEvent) => {
        handleFriendEvent(event.data);
      };

      socket.on('MESSAGE_CREATE', handleMessageCreate);
      socket.on('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
      socket.on('TYPING_START', handleTypingStart);
      socket.on('FRIEND_REQUEST_CREATE', handleFriendUpdate);
      socket.on('FRIEND_REQUEST_UPDATE', handleFriendUpdate);

      return () => {
        socket.off('MESSAGE_CREATE', handleMessageCreate);
        socket.off('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
        socket.off('TYPING_START', handleTypingStart);
        socket.off('FRIEND_REQUEST_CREATE', handleFriendUpdate);
        socket.off('FRIEND_REQUEST_UPDATE', handleFriendUpdate);
      };
    }
  }, [token, user]);

  if (isLoading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background-darkest text-gray-400">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="w-screen h-screen flex bg-background-dark overflow-hidden select-none">
      {/* 1. Server Sidebar */}
      <ServerList
        isHomeActive={isHomeActive}
        onSelectHome={() => setIsHomeActive(true)}
        onOpenCreateServer={() => setIsCreateServerOpen(true)}
        onOpenJoinServer={() => setIsJoinServerOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Channels Sidebar */}
      <ChannelList
        isHomeActive={isHomeActive}
        onOpenCreateChannel={(type) => {
          setCreateChannelType(type);
          setIsCreateChannelOpen(true);
        }}
        onOpenInviteModal={() => setIsInviteModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenScreenShare={() => setIsScreenShareOpen(true)}
      />

      {/* 3. Main Stage: Friends View OR Voice Room OR Chat Area */}
      {isHomeActive ? (
        <FriendsView />
      ) : activeChannel?.type === 'voice' ? (
        <VoiceRoom
          channel={activeChannel}
          onOpenScreenShare={() => setIsScreenShareOpen(true)}
        />
      ) : (
        <ChatArea />
      )}

      {/* Modals */}
      <CreateServerModal
        isOpen={isCreateServerOpen}
        onClose={() => setIsCreateServerOpen(false)}
      />

      <JoinServerModal
        isOpen={isJoinServerOpen}
        onClose={() => setIsJoinServerOpen(false)}
      />

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />

      <CreateChannelModal
        isOpen={isCreateChannelOpen}
        initialType={createChannelType}
        onClose={() => setIsCreateChannelOpen(false)}
      />

      <ScreenShareModal
        isOpen={isScreenShareOpen}
        onClose={() => setIsScreenShareOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
