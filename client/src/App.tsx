import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useGuildStore } from './stores/guildStore';
import { useFriendStore } from './stores/friendStore';
import { useVoiceStore } from './stores/voiceStore';
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
import { Volume2, Mic, MicOff, PhoneOff } from 'lucide-react';

export const App: React.FC = () => {
  const { user, token, isLoading, checkAuth } = useAuthStore();
  const { fetchGuilds, activeGuild, activeChannel, addMessage, updateVoiceState, setTyping, selectChannel } = useGuildStore();
  const { handleFriendEvent } = useFriendStore();
  const { isConnected, currentChannelId, isMuted, toggleMute, leaveVoice } = useVoiceStore();

  const [isHomeActive, setIsHomeActive] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
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
      <div className="w-screen h-[100dvh] flex items-center justify-center bg-background-darkest text-gray-400">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  // Find connected voice channel object if any
  const connectedVoiceChannel = isConnected
    ? activeGuild?.channels?.find((c) => c.id === currentChannelId)
    : null;

  return (
    <div className="w-screen h-[100dvh] flex bg-background-dark overflow-hidden select-none relative">
      {/* Mobile Left Drawer Backdrop */}
      {isMobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      )}

      {/* 1 & 2. Sidebars (Desktop fixed, Mobile slide-in drawer) */}
      <div
        className={`fixed md:static inset-y-0 left-0 z-40 md:z-0 flex h-full transition-transform duration-200 ease-in-out ${
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* 1. Server Sidebar */}
        <ServerList
          isHomeActive={isHomeActive}
          onSelectHome={() => {
            setIsHomeActive(true);
            setIsMobileDrawerOpen(false);
          }}
          onOpenCreateServer={() => {
            setIsCreateServerOpen(true);
            setIsMobileDrawerOpen(false);
          }}
          onOpenJoinServer={() => {
            setIsJoinServerOpen(true);
            setIsMobileDrawerOpen(false);
          }}
          onOpenSettings={() => {
            setIsSettingsOpen(true);
            setIsMobileDrawerOpen(false);
          }}
        />

        {/* 2. Channels Sidebar */}
        <ChannelList
          isHomeActive={isHomeActive}
          onOpenCreateChannel={(type) => {
            setCreateChannelType(type);
            setIsCreateChannelOpen(true);
            setIsMobileDrawerOpen(false);
          }}
          onOpenInviteModal={() => {
            setIsInviteModalOpen(true);
            setIsMobileDrawerOpen(false);
          }}
          onOpenSettings={() => {
            setIsSettingsOpen(true);
            setIsMobileDrawerOpen(false);
          }}
          onOpenScreenShare={() => {
            setIsScreenShareOpen(true);
            setIsMobileDrawerOpen(false);
          }}
          onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
        />
      </div>

      {/* 3. Main Stage: Friends View OR Voice Room OR Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        {isHomeActive ? (
          <FriendsView onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)} />
        ) : activeChannel?.type === 'voice' ? (
          <VoiceRoom
            channel={activeChannel}
            onOpenScreenShare={() => setIsScreenShareOpen(true)}
            onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          />
        ) : (
          <ChatArea onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)} />
        )}

        {/* Floating Mini Voice Dock (when connected to voice but viewing text channel or friends) */}
        {isConnected && activeChannel?.type !== 'voice' && (
          <div className="absolute bottom-16 md:bottom-20 right-4 z-20 bg-background-darkest/95 backdrop-blur-md p-2.5 px-4 rounded-2xl shadow-2xl border border-online/30 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
            <button
              onClick={() => {
                if (connectedVoiceChannel) selectChannel(connectedVoiceChannel);
              }}
              className="flex items-center gap-2 hover:opacity-80 text-left"
            >
              <Volume2 className="w-4 h-4 text-online animate-pulse" />
              <div className="text-xs">
                <span className="font-bold text-white block truncate max-w-[120px]">
                  {connectedVoiceChannel?.name || 'Voz Conectada'}
                </span>
                <span className="text-[10px] text-online">Toque para ver sala</span>
              </div>
            </button>

            <div className="w-[1px] h-6 bg-white/10 mx-1" />

            <button
              onClick={toggleMute}
              className={`p-2 rounded-full transition-colors ${
                isMuted ? 'bg-dnd text-white' : 'bg-background-light text-gray-200'
              }`}
              title="Mutar/Desmutar"
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={leaveVoice}
              className="p-2 rounded-full bg-dnd/20 text-dnd hover:bg-dnd hover:text-white transition-colors"
              title="Desconectar"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

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
