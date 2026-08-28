import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useGuildStore } from './stores/guildStore';
import { socket } from './lib/socket';
import { WSEvent, Message, VoiceSession, Channel } from './types';
import { ServerList } from './components/Sidebar/ServerList';
import { ChannelList } from './components/Sidebar/ChannelList';
import { ChatArea } from './components/Chat/ChatArea';
import { VoiceRoom } from './components/Voice/VoiceRoom';
import { AuthScreen } from './components/Auth/AuthScreen';
import { CreateServerModal } from './components/Modals/CreateServerModal';
import { CreateChannelModal } from './components/Modals/CreateChannelModal';
import { ScreenShareModal } from './components/Modals/ScreenShareModal';
import { SettingsModal } from './components/Modals/SettingsModal';

export const App: React.FC = () => {
  const { user, token, isLoading, checkAuth } = useAuthStore();
  const { fetchGuilds, activeChannel, addMessage, updateVoiceState, setTyping } = useGuildStore();

  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
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

      socket.on('MESSAGE_CREATE', handleMessageCreate);
      socket.on('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
      socket.on('TYPING_START', handleTypingStart);

      return () => {
        socket.off('MESSAGE_CREATE', handleMessageCreate);
        socket.off('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
        socket.off('TYPING_START', handleTypingStart);
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
        onOpenCreateServer={() => setIsCreateServerOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Channels Sidebar */}
      <ChannelList
        onOpenCreateChannel={(type) => {
          setCreateChannelType(type);
          setIsCreateChannelOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenScreenShare={() => setIsScreenShareOpen(true)}
      />

      {/* 3. Main Stage: Voice Room or Chat Area */}
      {activeChannel?.type === 'voice' ? (
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
