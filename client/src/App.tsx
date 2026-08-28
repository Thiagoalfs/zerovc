import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from './stores/authStore';
import { useGuildStore } from './stores/guildStore';
import { useFriendStore } from './stores/friendStore';
import { useVoiceStore } from './stores/voiceStore';
import { useDMStore } from './stores/dmStore';
import { useCallStore } from './stores/callStore';
import { socket } from './lib/socket';
import { Message, VoiceSession, Channel, DMRoom } from './types';
import { api } from './lib/api';
import { ServerList } from './components/Sidebar/ServerList';
import { ChannelList } from './components/Sidebar/ChannelList';
import { DMChannelList } from './components/DM/DMChannelList';
import { ChatArea } from './components/Chat/ChatArea';
import { VoiceRoom } from './components/Voice/VoiceRoom';
import { FriendsView } from './components/Friends/FriendsView';
import { DMChatArea } from './components/DM/DMChatArea';
import { DMGroupChatArea } from './components/DM/DMGroupChatArea';
import { useDMGroupStore } from './stores/dmGroupStore';
import { AuthScreen } from './components/Auth/AuthScreen';
import { CreateServerModal } from './components/Modals/CreateServerModal';
import { CreateChannelModal } from './components/Modals/CreateChannelModal';
import { ScreenShareModal } from './components/Modals/ScreenShareModal';
import { ProfileModal } from './components/Modals/ProfileModal';
import { ServerSettingsModal } from './components/Modals/ServerSettingsModal';
import { ChannelSettingsModal } from './components/Modals/ChannelSettingsModal';
import { InviteModal } from './components/Modals/InviteModal';
import { UserProfileModal } from './components/Modals/UserProfileModal';
import { ImageModal } from './components/Modals/ImageModal';
import { IncomingCallModal } from './components/DM/IncomingCallModal';
import { livekit } from './lib/livekit';
import { User } from './types';
import { Volume2, Mic, MicOff, PhoneOff } from 'lucide-react';

export const App: React.FC = () => {
  const { user, token, isLoading, checkAuth, setUser } = useAuthStore();
  const {
    fetchGuilds,
    activeGuild,
    activeChannel,
    addMessage,
    updateMessageInStore,
    removeMessageFromStore,
    updateVoiceState,
    setTyping,
    selectGuild,
    selectChannel,
  } = useGuildStore();
  const { handleFriendEvent } = useFriendStore();
  const { isConnected, currentChannelId, isMuted, toggleMute, leaveVoice } = useVoiceStore();
  const { addMessage: addDMMessage } = useDMStore();

  const [isHomeActive, setIsHomeActive] = useState(true);
  const [homeView, setHomeView] = useState<'friends' | 'dm' | 'group'>('friends');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Modals
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState<'text' | 'voice' | 'category'>('text');
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>(undefined);
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState<{
    user: User;
    position?: { x: number; y: number };
  } | null>(null);
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const navigateTo = (path: string, replace = false) => {
    if (window.location.pathname !== path) {
      if (replace) {
        window.history.replaceState(null, '', path);
      } else {
        window.history.pushState(null, '', path);
      }
    }
  };

  const handleRoute = useCallback(async (pathname: string) => {
    const cleanPath = pathname.replace(/^\/+|\/+$/g, '');
    const segments = cleanPath ? cleanPath.split('/') : [];

    // 0. Handle /invite/:code
    if (segments.length >= 1 && segments[0] === 'invite') {
      const code = segments[1];
      if (code) {
        sessionStorage.setItem('pending_invite_code', code);
        const { user, token } = useAuthStore.getState();
        if (token && user) {
          try {
            const res = await api.invites.join(code);
            sessionStorage.removeItem('pending_invite_code');
            await useGuildStore.getState().fetchGuilds();
            const joinedGuild = await api.guilds.getDetails(res.guild_id);
            useGuildStore.setState({ activeGuild: joinedGuild });
            setIsHomeActive(false);
            const defaultChannel =
              joinedGuild.channels?.find((c) => c.type === 'text') || joinedGuild.channels?.[0];
            if (defaultChannel) {
              useGuildStore.getState().selectChannel(defaultChannel);
              navigateTo(`/${joinedGuild.id}/${defaultChannel.id}`, true);
            }
            return;
          } catch (err) {
            console.error('Failed to auto-join invite:', err);
            try {
              const preview = await api.invites.get(code);
              if (preview?.invite?.guild_id) {
                const joinedGuild = await api.guilds.getDetails(preview.invite.guild_id);
                useGuildStore.setState({ activeGuild: joinedGuild });
                setIsHomeActive(false);
                const defaultChannel =
                  joinedGuild.channels?.find((c) => c.type === 'text') || joinedGuild.channels?.[0];
                if (defaultChannel) {
                  useGuildStore.getState().selectChannel(defaultChannel);
                  navigateTo(`/${joinedGuild.id}/${defaultChannel.id}`, true);
                }
                sessionStorage.removeItem('pending_invite_code');
                return;
              }
            } catch {}
          }
        } else {
          return;
        }
      }
    }

    // 1. Default to /@me or /@me/friends or /@me/:roomId or /@me/group/:groupId
    if (segments.length === 0 || segments[0] === '@me') {
      setIsHomeActive(true);
      if (segments.length > 1 && segments[1]) {
        if (segments[1] === 'group' && segments[2]) {
          const groupId = segments[2];
          setHomeView('group');
          await useDMGroupStore.getState().selectGroupById(groupId);
          navigateTo(`/@me/group/${groupId}`, true);
        } else {
          const roomId = segments[1];
          setHomeView('dm');
          const { rooms, fetchRooms, selectRoom } = useDMStore.getState();
          if (rooms.length === 0) await fetchRooms();
          const targetRoom = useDMStore.getState().rooms.find((r) => r.id === roomId);
          if (targetRoom) {
            selectRoom(targetRoom);
          }
          navigateTo(`/@me/${roomId}`, true);
        }
      } else {
        setHomeView('friends');
        navigateTo('/@me', true);
      }
      return;
    }

    // 2. Server & Channel: /:guildId/:channelId
    if (segments.length >= 1) {
      const guildId = segments[0];
      const channelId = segments[1];

      setIsHomeActive(false);
      try {
        const fullGuild = await api.guilds.getDetails(guildId);
        useGuildStore.setState({ activeGuild: fullGuild });

        if (fullGuild.channels && fullGuild.channels.length > 0) {
          const targetChannel = channelId
            ? fullGuild.channels.find((c) => c.id === channelId) || fullGuild.channels[0]
            : fullGuild.channels.find((c) => c.type === 'text') || fullGuild.channels[0];

          useGuildStore.getState().selectChannel(targetChannel);
          navigateTo(`/${guildId}/${targetChannel.id}`, true);
        }
      } catch (err) {
        console.error('Failed to route to guild:', err);
        setIsHomeActive(true);
        setHomeView('friends');
        navigateTo('/@me', true);
      }
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, []);

  // Push-to-Talk (PTT) Global Key Listener
  useEffect(() => {
    let isPTTPressed = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const mode = localStorage.getItem('zerovc_input_mode');
      if (mode !== 'ptt') return;

      const pttKey = localStorage.getItem('zerovc_ptt_key') || 'Space';
      if (e.code === pttKey && !isPTTPressed) {
        if (e.code === 'Space') {
          e.preventDefault();
        }
        isPTTPressed = true;
        livekit.setMuted(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const mode = localStorage.getItem('zerovc_input_mode');
      if (mode !== 'ptt') return;

      const pttKey = localStorage.getItem('zerovc_ptt_key') || 'Space';
      if (e.code === pttKey) {
        isPTTPressed = false;
        livekit.setMuted(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (token && user) {
      fetchGuilds();
      handleRoute(window.location.pathname);

      // Auto join pending invite upon login/register
      const pendingInvite = sessionStorage.getItem('pending_invite_code');
      if (pendingInvite) {
        api.invites
          .join(pendingInvite)
          .then(async (res) => {
            sessionStorage.removeItem('pending_invite_code');
            await fetchGuilds();
            const joinedGuild = await api.guilds.getDetails(res.guild_id);
            useGuildStore.setState({ activeGuild: joinedGuild });
            setIsHomeActive(false);
            const defaultChannel =
              joinedGuild.channels?.find((c) => c.type === 'text') || joinedGuild.channels?.[0];
            if (defaultChannel) {
              useGuildStore.getState().selectChannel(defaultChannel);
              navigateTo(`/${joinedGuild.id}/${defaultChannel.id}`, true);
            }
          })
          .catch(async () => {
            try {
              const preview = await api.invites.get(pendingInvite);
              if (preview?.invite?.guild_id) {
                const joinedGuild = await api.guilds.getDetails(preview.invite.guild_id);
                useGuildStore.setState({ activeGuild: joinedGuild });
                setIsHomeActive(false);
                const defaultChannel =
                  joinedGuild.channels?.find((c) => c.type === 'text') || joinedGuild.channels?.[0];
                if (defaultChannel) {
                  useGuildStore.getState().selectChannel(defaultChannel);
                  navigateTo(`/${joinedGuild.id}/${defaultChannel.id}`, true);
                }
                sessionStorage.removeItem('pending_invite_code');
              }
            } catch {}
          });
      }

      const onPopState = () => {
        handleRoute(window.location.pathname);
      };
      window.addEventListener('popstate', onPopState);

      // WebSocket Event Subscriptions
      const handleMessageCreate = (event: any) => {
        addMessage(event.data);
      };

      const handleMessageUpdate = (event: any) => {
        updateMessageInStore(event.data);
      };

      const handleMessageDelete = (event: any) => {
        removeMessageFromStore(event.data.id);
      };

      const handleDMMessageCreate = (event: any) => {
        addDMMessage(event.data);
      };

      const handleVoiceStateUpdate = (event: any) => {
        updateVoiceState(event.data.action, event.data.session, event.data.channel_id, event.data.user_id);
      };

      const handleTypingStart = (event: any) => {
        setTyping(event.data.channel_id, event.data.user_id);
      };

      const handleFriendUpdate = (event: any) => {
        handleFriendEvent(event.data);
      };

      const handleUserUpdate = (event: any) => {
        const currentUserId = useAuthStore.getState().user?.id;
        if (event.data?.id && currentUserId && event.data.id === currentUserId) {
          useAuthStore.getState().setUser(event.data);
        }
        useGuildStore.getState().updateMemberInGuild(event.data);
      };

      const handleMessageReactionAdd = (event: any) => {
        useGuildStore.getState().handleReactionEvent({ ...event.data, is_add: true });
      };

      const handleMessageReactionRemove = (event: any) => {
        useGuildStore.getState().handleReactionEvent({ ...event.data, is_add: false });
      };

      const handleMessagePin = (event: any) => {
        useGuildStore.getState().handlePinEvent(event.data);
      };

      const handleDMReactionAdd = (event: any) => {
        useDMStore.getState().handleDMReactionEvent({ ...event.data, is_add: true });
      };

      const handleDMReactionRemove = (event: any) => {
        useDMStore.getState().handleDMReactionEvent({ ...event.data, is_add: false });
      };

      const handleCallIncoming = (event: any) => {
        useCallStore.getState().handleIncomingCall(event.data.room_id, event.data.caller);
      };

      const handleCallAccept = (event: any) => {
        useCallStore.getState().handleCallAccepted(event.data.token, event.data.livekit_url, event.data.room_name);
      };

      const handleCallEnd = () => {
        useCallStore.getState().handleCallEnded();
      };

      const handleGroupMessageCreate = (event: any) => {
        useDMGroupStore.getState().handleGroupMessageCreate(event.data);
      };

      const handleGuildMemberAdd = (event: any) => {
        if (event.data?.guild_id && event.data?.member) {
          useGuildStore.getState().handleGuildMemberAdd(event.data.guild_id, event.data.member);
        }
      };

      const handleGuildMemberRemove = (event: any) => {
        if (event.data?.guild_id && event.data?.user_id) {
          useGuildStore.getState().handleGuildMemberRemove(event.data.guild_id, event.data.user_id);
        }
      };

      const handleGuildMemberUpdate = (event: any) => {
        if (event.data?.guild_id && event.data?.user_id) {
          useGuildStore.getState().handleGuildMemberUpdate(event.data.guild_id, event.data.user_id, event.data);
        }
      };

      const handlePresenceUpdate = (event: any) => {
        if (event.data?.user_id) {
          useGuildStore.getState().handlePresenceUpdate(event.data.user_id, event.data.status, event.data.custom_status);
        }
      };

      socket.on('MESSAGE_CREATE', handleMessageCreate);
      socket.on('MESSAGE_UPDATE', handleMessageUpdate);
      socket.on('MESSAGE_DELETE', handleMessageDelete);
      socket.on('MESSAGE_REACTION_ADD', handleMessageReactionAdd);
      socket.on('MESSAGE_REACTION_REMOVE', handleMessageReactionRemove);
      socket.on('MESSAGE_PIN', handleMessagePin);
      socket.on('MESSAGE_UNPIN', handleMessagePin);
      socket.on('DM_MESSAGE_CREATE', handleDMMessageCreate);
      socket.on('DM_REACTION_ADD', handleDMReactionAdd);
      socket.on('DM_REACTION_REMOVE', handleDMReactionRemove);
      socket.on('GROUP_MESSAGE_CREATE', handleGroupMessageCreate);
      socket.on('CALL_INCOMING', handleCallIncoming);
      socket.on('CALL_ACCEPT', handleCallAccept);
      socket.on('CALL_REJECT', handleCallEnd);
      socket.on('CALL_LEAVE', handleCallEnd);
      socket.on('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
      socket.on('TYPING_START', handleTypingStart);
      socket.on('FRIEND_REQUEST_CREATE', handleFriendUpdate);
      socket.on('FRIEND_REQUEST_UPDATE', handleFriendUpdate);
      socket.on('USER_UPDATE', handleUserUpdate);
      socket.on('GUILD_MEMBER_ADD', handleGuildMemberAdd);
      socket.on('GUILD_MEMBER_REMOVE', handleGuildMemberRemove);
      socket.on('GUILD_BAN_ADD', handleGuildMemberRemove);
      socket.on('GUILD_MEMBER_UPDATE', handleGuildMemberUpdate);
      socket.on('PRESENCE_UPDATE', handlePresenceUpdate);

      return () => {
        window.removeEventListener('popstate', onPopState);
        socket.off('MESSAGE_CREATE', handleMessageCreate);
        socket.off('MESSAGE_UPDATE', handleMessageUpdate);
        socket.off('MESSAGE_DELETE', handleMessageDelete);
        socket.off('MESSAGE_REACTION_ADD', handleMessageReactionAdd);
        socket.off('MESSAGE_REACTION_REMOVE', handleMessageReactionRemove);
        socket.off('MESSAGE_PIN', handleMessagePin);
        socket.off('MESSAGE_UNPIN', handleMessagePin);
        socket.off('DM_MESSAGE_CREATE', handleDMMessageCreate);
        socket.off('DM_REACTION_ADD', handleDMReactionAdd);
        socket.off('DM_REACTION_REMOVE', handleDMReactionRemove);
        socket.off('GROUP_MESSAGE_CREATE', handleGroupMessageCreate);
        socket.off('CALL_INCOMING', handleCallIncoming);
        socket.off('CALL_ACCEPT', handleCallAccept);
        socket.off('CALL_REJECT', handleCallEnd);
        socket.off('CALL_LEAVE', handleCallEnd);
        socket.off('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
        socket.off('TYPING_START', handleTypingStart);
        socket.off('FRIEND_REQUEST_CREATE', handleFriendUpdate);
        socket.off('FRIEND_REQUEST_UPDATE', handleFriendUpdate);
        socket.off('USER_UPDATE', handleUserUpdate);
        socket.off('GUILD_MEMBER_ADD', handleGuildMemberAdd);
        socket.off('GUILD_MEMBER_REMOVE', handleGuildMemberRemove);
        socket.off('GUILD_BAN_ADD', handleGuildMemberRemove);
        socket.off('GUILD_MEMBER_UPDATE', handleGuildMemberUpdate);
        socket.off('PRESENCE_UPDATE', handlePresenceUpdate);
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

      {/* 1 & 2. Sidebars */}
      <div
        className={`fixed md:static inset-y-0 left-0 z-40 md:z-0 flex h-full transition-transform duration-200 ease-in-out ${
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* 1. Server List */}
        <ServerList
          isHomeActive={isHomeActive}
          onSelectHome={() => {
            setIsHomeActive(true);
            setHomeView('friends');
            navigateTo('/@me');
            setIsMobileDrawerOpen(false);
          }}
          onSelectGuild={async (guildId) => {
            setIsHomeActive(false);
            await selectGuild(guildId);
            const active = useGuildStore.getState().activeGuild;
            const ch = useGuildStore.getState().activeChannel;
            if (active && ch) {
              navigateTo(`/${active.id}/${ch.id}`);
            }
            setIsMobileDrawerOpen(false);
          }}
          onOpenCreateServer={() => {
            setIsCreateServerOpen(true);
            setIsMobileDrawerOpen(false);
          }}
        />

        {/* 2. Channels Sidebar OR DMs Sidebar */}
        {isHomeActive ? (
          <DMChannelList
            currentView={homeView}
            onSelectFriends={() => {
              setHomeView('friends');
              navigateTo('/@me');
            }}
            onSelectRoom={(room: DMRoom) => {
              setHomeView('dm');
              navigateTo(`/@me/${room.id}`);
            }}
            onSelectGroup={(group) => {
              setHomeView('group');
              navigateTo(`/@me/group/${group.id}`);
            }}
            onOpenSettings={() => setIsProfileModalOpen(true)}
            onOpenScreenShare={() => setIsScreenShareOpen(true)}
            onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
          />
        ) : (
          <ChannelList
            isHomeActive={false}
            onSelectChannel={(channel) => {
              if (activeGuild) {
                navigateTo(`/${activeGuild.id}/${channel.id}`);
              }
            }}
            onOpenCreateChannel={(type, categoryId) => {
              setCreateChannelType(type);
              setCreateChannelCategoryId(categoryId);
              setIsCreateChannelOpen(true);
              setIsMobileDrawerOpen(false);
            }}
            onOpenInviteModal={() => {
              setIsInviteModalOpen(true);
              setIsMobileDrawerOpen(false);
            }}
            onOpenSettings={() => {
              setIsProfileModalOpen(true);
              setIsMobileDrawerOpen(false);
            }}
            onOpenServerSettings={() => {
              setIsServerSettingsOpen(true);
              setIsMobileDrawerOpen(false);
            }}
            onOpenChannelSettings={(channel) => {
              setChannelToEdit(channel);
            }}
            onOpenMemberList={() => {
              setIsMemberListOpen(true);
            }}
            onOpenScreenShare={() => {
              setIsScreenShareOpen(true);
              setIsMobileDrawerOpen(false);
            }}
            onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
          />
        )}
      </div>

      {/* 3. Main Stage */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        {isHomeActive ? (
          homeView === 'friends' ? (
            <FriendsView
              onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
              onOpenDM={(userId, room) => {
                setIsHomeActive(true);
                setHomeView('dm');
                setIsMobileDrawerOpen(false);
                const targetRoom = room || useDMStore.getState().activeRoom;
                if (targetRoom) {
                  navigateTo(`/@me/${targetRoom.id}`);
                } else {
                  navigateTo('/@me');
                }
              }}
            />
          ) : homeView === 'group' ? (
            <DMGroupChatArea
              onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
              onOpenUserProfile={(targetUser, pos) =>
                setSelectedUserForProfile({ user: targetUser, position: pos })
              }
              onPreviewImage={(url) => setPreviewImageUrl(url)}
            />
          ) : (
            <DMChatArea
              onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
              onOpenUserProfile={(targetUser, pos) =>
                setSelectedUserForProfile({ user: targetUser, position: pos })
              }
              onPreviewImage={(url) => setPreviewImageUrl(url)}
            />
          )
        ) : activeChannel?.type === 'voice' ? (
          <VoiceRoom
            channel={activeChannel}
            onOpenScreenShare={() => setIsScreenShareOpen(true)}
            onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          />
        ) : (
          <ChatArea
            onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
            onOpenUserProfile={(targetUser, pos) =>
              setSelectedUserForProfile({ user: targetUser, position: pos })
            }
            onOpenDM={async (userId) => {
              setIsHomeActive(true);
              setHomeView('dm');
              setIsMobileDrawerOpen(false);
              const room = await useDMStore.getState().openDMWithUser(userId);
              if (room) {
                navigateTo(`/@me/${room.id}`);
              }
            }}
            onPreviewImage={(url) => setPreviewImageUrl(url)}
            isMemberListOpen={isMemberListOpen}
            onToggleMemberList={(open) => setIsMemberListOpen(open)}
          />
        )}

        {/* Floating Mini Voice Dock */}
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

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />

      <CreateChannelModal
        isOpen={isCreateChannelOpen}
        initialType={createChannelType}
        initialCategoryId={createChannelCategoryId}
        onClose={() => {
          setIsCreateChannelOpen(false);
          setCreateChannelCategoryId(undefined);
        }}
      />

      <ScreenShareModal
        isOpen={isScreenShareOpen}
        onClose={() => setIsScreenShareOpen(false)}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      <UserProfileModal
        user={selectedUserForProfile?.user || null}
        position={selectedUserForProfile?.position || null}
        isOpen={!!selectedUserForProfile}
        onClose={() => setSelectedUserForProfile(null)}
        onOpenDM={async (userId) => {
          setSelectedUserForProfile(null);
          setIsHomeActive(true);
          setHomeView('dm');
          setIsMobileDrawerOpen(false);
          const room = await useDMStore.getState().openDMWithUser(userId);
          if (room) {
            navigateTo(`/@me/${room.id}`);
          }
        }}
        onEditOwnProfile={() => {
          setSelectedUserForProfile(null);
          setIsProfileModalOpen(true);
        }}
      />

      <ImageModal
        imageUrl={previewImageUrl}
        isOpen={!!previewImageUrl}
        onClose={() => setPreviewImageUrl(null)}
      />

      <ServerSettingsModal
        isOpen={isServerSettingsOpen}
        onClose={() => setIsServerSettingsOpen(false)}
      />

      <ChannelSettingsModal
        channel={channelToEdit}
        isOpen={!!channelToEdit}
        onClose={() => setChannelToEdit(null)}
      />

      {/* Global Incoming Call Popup */}
      <IncomingCallModal />
    </div>
  );
};
