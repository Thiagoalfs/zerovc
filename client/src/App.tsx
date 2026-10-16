import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuthStore } from './stores/authStore';
import { useGuildStore } from './stores/guildStore';
import { useFriendStore } from './stores/friendStore';
import { useVoiceStore } from './stores/voiceStore';
import { useDMStore } from './stores/dmStore';
import { useCallStore } from './stores/callStore';
import { socket } from './lib/socket';
import { Message, VoiceSession, Channel, DMRoom, UserProfilePosition, Guild } from './types';
import { api } from './lib/api';
import { sendNativeNotification, requestNotificationPermission } from './lib/notifications';
import { ServerList } from './components/Sidebar/ServerList';
import { ChannelList } from './components/Sidebar/ChannelList';
import { UserBar } from './components/Sidebar/UserBar';
import { DMChannelList } from './components/DM/DMChannelList';
import { ChatArea } from './components/Chat/ChatArea';
import { VoiceRoom } from './components/Voice/VoiceRoom';
import { VoiceFloatingPiP } from './components/Voice/VoiceFloatingPiP';
import { FriendsView } from './components/Friends/FriendsView';
import { DMChatArea } from './components/DM/DMChatArea';
import { DMGroupChatArea } from './components/DM/DMGroupChatArea';
import { useDMGroupStore } from './stores/dmGroupStore';
import { useSettingsStore } from './stores/settingsStore';
import { useRegisteredGamesStore } from './stores/registeredGamesStore';
import { AuthScreen } from './components/Auth/AuthScreen';
import { LandingPage } from './components/Landing/LandingPage';
import { DownloadPage } from './components/Landing/DownloadPage';
const CreateServerModal = React.lazy(() => import('./components/Modals/CreateServerModal').then(m => ({ default: m.CreateServerModal })));
const CreateDMGroupModal = React.lazy(() => import('./components/Modals/CreateDMGroupModal').then(m => ({ default: m.CreateDMGroupModal })));
const CreateChannelModal = React.lazy(() => import('./components/Modals/CreateChannelModal').then(m => ({ default: m.CreateChannelModal })));
const CreateCategoryModal = React.lazy(() => import('./components/Modals/CreateCategoryModal').then(m => ({ default: m.CreateCategoryModal })));
const ScreenShareModal = React.lazy(() => import('./components/Modals/ScreenShareModal').then(m => ({ default: m.ScreenShareModal })));
const ProfileModal = React.lazy(() => import('./components/Modals/ProfileModal').then(m => ({ default: m.ProfileModal })));
const ServerSettingsModal = React.lazy(() => import('./components/Modals/ServerSettingsModal').then(m => ({ default: m.ServerSettingsModal })));
const ChannelSettingsModal = React.lazy(() => import('./components/Modals/ChannelSettingsModal').then(m => ({ default: m.ChannelSettingsModal })));
const InviteModal = React.lazy(() => import('./components/Modals/InviteModal').then(m => ({ default: m.InviteModal })));
const UserProfileModal = React.lazy(() => import('./components/Modals/UserProfileModal').then(m => ({ default: m.UserProfileModal })));
const UserProfileModalFocus = React.lazy(() => import('./components/Modals/UserProfileModalFocus').then(m => ({ default: m.UserProfileModalFocus })));
const ImageModal = React.lazy(() => import('./components/Modals/ImageModal').then(m => ({ default: m.ImageModal })));
import { IncomingCallModal } from './components/DM/IncomingCallModal';
import { TitleBar } from './components/Desktop/TitleBar';
import { ErrorBoundary } from './components/Common/ErrorBoundary';
import { NetworkStatusBanner } from './components/Common/NetworkStatusBanner';
import { StreamerModeBanner } from './components/Streamer/StreamerModeBanner';
import { useStreamerModeStore } from './stores/streamerModeStore';
import { livekit } from './lib/livekit';
import { User } from './types';
import { Volume2, Mic, MicOff, PhoneOff } from 'lucide-react';
import { initMobileBackHandler, pushBackHandler } from './lib/mobileBackHandler';
import { initAudioRouting } from './lib/audioRouting';
import {
  playUserJoinCallSound,
  playUserLeaveCallSound,
  playStartStreamSound,
  playStopStreamSound,
} from './utils/audio';
import { keyRequestManager } from './crypto/keyRequestManager';
import { megolmManager, RoomKeyToDevicePayload } from './crypto/megolmSession';
import { rosterManager } from './crypto/rosterManager';
import { callKeyManager } from './crypto/callKeys';
import { deviceManager } from './crypto/deviceManager';
import { safeCryptoLogger } from './crypto/safeLogger';
import { messageCodec } from './messaging/messageCodec';

export const App: React.FC = () => {
  const { user, token, isCheckingAuth, checkAuth, setUser } = useAuthStore();
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
  const {
    isConnected,
    currentChannelId,
    isMuted,
    isScreensharing,
    watchedParticipantId,
    toggleMute,
    leaveVoice,
  } = useVoiceStore();
  const { addMessage: addDMMessage } = useDMStore();
  const activeRoom = useDMStore((s) => s.activeRoom);
  const activeGroup = useDMGroupStore((s) => s.activeGroup);
  const channelListWidth = useSettingsStore((s) => s.channelListWidth);

  const [isHomeActive, setIsHomeActive] = useState(true);
  const [homeView, setHomeView] = useState<'friends' | 'dm' | 'group'>('friends');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Auto-sync view to 'friends' if active DM or group is closed/deleted
  useEffect(() => {
    if (isHomeActive) {
      if (homeView === 'dm' && !activeRoom) {
        setHomeView('friends');
        navigateTo('/@me', true);
      } else if (homeView === 'group' && !activeGroup) {
        setHomeView('friends');
        navigateTo('/@me', true);
      }
    }
  }, [isHomeActive, homeView, activeRoom, activeGroup]);

  // Global custom navigation events for instant transitions
  useEffect(() => {
    const handleNavHome = () => {
      setIsHomeActive(true);
      setHomeView('friends');
      navigateTo('/@me', true);
    };

    const handleNavChannel = (e: any) => {
      const { guildId, channelId } = e.detail || {};
      if (guildId) {
        setIsHomeActive(false);
        if (channelId) {
          navigateTo(`/${guildId}/${channelId}`, true);
        } else {
          navigateTo(`/${guildId}`, true);
        }
      }
    };

    window.addEventListener('zerovc:nav-home', handleNavHome);
    window.addEventListener('zerovc:nav-channel', handleNavChannel);
    return () => {
      window.removeEventListener('zerovc:nav-home', handleNavHome);
      window.removeEventListener('zerovc:nav-channel', handleNavChannel);
    };
  }, []);

  // Modals
  const [isCreateServerOpen, setIsCreateServerOpen] = useState(false);
  const [isCreateDMGroupOpen, setIsCreateDMGroupOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState<'text' | 'voice'>('text');
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>(undefined);
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedUserForProfile, setSelectedUserForProfile] = useState<{
    user: User;
    position?: UserProfilePosition;
    guild?: Guild | null;
  } | null>(null);
  const [focusedUserProfile, setFocusedUserProfile] = useState<{
    user: User;
    guild?: Guild | null;
  } | null>(null);
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isMemberListOpen, setIsMemberListOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zerovc_server_members_open');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {}
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });

  const handleToggleMemberList = (open: boolean) => {
    setIsMemberListOpen(open);
    try {
      localStorage.setItem('zerovc_server_members_open', String(open));
    } catch {}
  };

  // Dynamic visual viewport height for mobile browsers (keeps header stuck at top when keyboard opens)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportTop, setViewportTop] = useState<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleViewportChange = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
        setViewportTop(window.visualViewport.offsetTop);
      } else {
        setViewportHeight(window.innerHeight);
        setViewportTop(0);
      }
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };

    handleViewportChange();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    initMobileBackHandler();
    initAudioRouting();
  }, []);

  // Periodic and focus/visibility voice state sync
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const curActiveGuild = useGuildStore.getState().activeGuild;
        if (curActiveGuild) {
          useGuildStore.getState().syncVoiceStates(curActiveGuild.id).catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);

  // Back button stack for modals and mobile drawers in App.tsx
  useEffect(() => {
    if (!previewImageUrl) return;
    return pushBackHandler('preview_image', () => {
      setPreviewImageUrl(null);
      return true;
    });
  }, [previewImageUrl]);

  useEffect(() => {
    if (!selectedUserForProfile) return;
    return pushBackHandler('user_profile_modal', () => {
      setSelectedUserForProfile(null);
      return true;
    });
  }, [selectedUserForProfile]);

  useEffect(() => {
    if (!channelToEdit) return;
    return pushBackHandler('channel_settings_modal', () => {
      setChannelToEdit(null);
      return true;
    });
  }, [channelToEdit]);

  useEffect(() => {
    if (!isCreateServerOpen) return;
    return pushBackHandler('create_server_modal', () => {
      setIsCreateServerOpen(false);
      return true;
    });
  }, [isCreateServerOpen]);

  useEffect(() => {
    if (!isCreateDMGroupOpen) return;
    return pushBackHandler('create_dm_group_modal', () => {
      setIsCreateDMGroupOpen(false);
      return true;
    });
  }, [isCreateDMGroupOpen]);

  useEffect(() => {
    if (!isInviteModalOpen) return;
    return pushBackHandler('invite_modal', () => {
      setIsInviteModalOpen(false);
      return true;
    });
  }, [isInviteModalOpen]);

  useEffect(() => {
    if (!isCreateChannelOpen) return;
    return pushBackHandler('create_channel_modal', () => {
      setIsCreateChannelOpen(false);
      return true;
    });
  }, [isCreateChannelOpen]);

  useEffect(() => {
    if (!isCreateCategoryOpen) return;
    return pushBackHandler('create_category_modal', () => {
      setIsCreateCategoryOpen(false);
      return true;
    });
  }, [isCreateCategoryOpen]);

  useEffect(() => {
    if (!isScreenShareOpen) return;
    return pushBackHandler('screen_share_modal', () => {
      setIsScreenShareOpen(false);
      return true;
    });
  }, [isScreenShareOpen]);

  useEffect(() => {
    if (!isMemberListOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) return;
    return pushBackHandler('mobile_member_list', () => {
      setIsMemberListOpen(false);
      return true;
    });
  }, [isMemberListOpen]);

  useEffect(() => {
    if (!isMobileDrawerOpen) return;
    return pushBackHandler('mobile_drawer', () => {
      setIsMobileDrawerOpen(false);
      return true;
    });
  }, [isMobileDrawerOpen]);

  // Mobile swipe & drag gesture state
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    initialLeftOpen: boolean;
    initialRightOpen: boolean;
    gestureIntent: 'horizontal' | 'vertical' | null;
    activeDrawer: 'left' | 'right' | null;
    leftDrawerWidth: number;
    rightDrawerWidth: number;
  } | null>(null);

  const [dragState, setDragState] = useState<{
    drawer: 'left' | 'right';
    offset: number;
    progress: number;
  } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement;

    // Ignore touches starting inside modals, inputs, textareas, sliders, or resizers
    if (
      isProfileModalOpen ||
      isServerSettingsOpen ||
      isCreateServerOpen ||
      isCreateDMGroupOpen ||
      isCreateChannelOpen ||
      isCreateCategoryOpen ||
      isInviteModalOpen ||
      isScreenShareOpen ||
      selectedUserForProfile ||
      previewImageUrl ||
      channelToEdit ||
      target.closest('.fixed.z-50') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('input[type=range]') ||
      target.closest('.cursor-col-resize')
    ) {
      return;
    }

    const startX = e.touches[0].clientX;
    const startY = e.touches[0].clientY;
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const leftWidth = winWidth; // Full width on mobile
    const rightWidth = winWidth; // Full width on mobile

    touchStateRef.current = {
      startX,
      startY,
      startTime: Date.now(),
      initialLeftOpen: isMobileDrawerOpen,
      initialRightOpen: Boolean(isMemberListOpen && !isHomeActive && activeGuild),
      gestureIntent: null,
      activeDrawer: null,
      leftDrawerWidth: leftWidth,
      rightDrawerWidth: rightWidth,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStateRef.current || e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStateRef.current.startX;
    const deltaY = currentY - touchStateRef.current.startY;

    // Detect gesture intent if not locked yet
    if (!touchStateRef.current.gestureIntent) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absY > 7 && absY >= absX) {
        touchStateRef.current.gestureIntent = 'vertical';
        return;
      }

      if (absX > 7 && absX > absY) {
        touchStateRef.current.gestureIntent = 'horizontal';

        const { initialLeftOpen, initialRightOpen, startX, leftDrawerWidth } = touchStateRef.current;
        const winWidth = typeof window !== 'undefined' ? window.innerWidth : leftDrawerWidth;
        const EDGE_THRESHOLD = 38; // Only trigger drawer from screen edge when closed to prevent conflict with message swipe-to-reply

        if (initialLeftOpen) {
          touchStateRef.current.activeDrawer = 'left';
        } else if (initialRightOpen) {
          touchStateRef.current.activeDrawer = 'right';
        } else {
          if (deltaX > 0) {
            touchStateRef.current.activeDrawer = 'left';
          }
        }
      }
    }

    if (touchStateRef.current.gestureIntent === 'horizontal' && touchStateRef.current.activeDrawer) {
      const { activeDrawer, initialLeftOpen, initialRightOpen, leftDrawerWidth, rightDrawerWidth } =
        touchStateRef.current;

      if (activeDrawer === 'left') {
        const L = leftDrawerWidth;
        let offset: number;
        let progress: number;

        if (initialLeftOpen) {
          offset = Math.min(0, Math.max(-L, deltaX));
          progress = Math.max(0, Math.min(1, 1 + offset / L));
        } else {
          offset = Math.min(0, Math.max(-L, -L + deltaX));
          progress = Math.max(0, Math.min(1, deltaX / L));
        }

        setDragState({ drawer: 'left', offset, progress });
      } else if (activeDrawer === 'right') {
        const R = rightDrawerWidth;
        let offset: number;
        let progress: number;

        if (initialRightOpen) {
          offset = Math.max(0, Math.min(R, deltaX));
          progress = Math.max(0, Math.min(1, 1 - offset / R));
        } else {
          offset = Math.max(0, Math.min(R, R + deltaX));
          progress = Math.max(0, Math.min(1, -deltaX / R));
        }

        setDragState({ drawer: 'right', offset, progress });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStateRef.current) return;

    const { gestureIntent, activeDrawer, startX, startTime, initialLeftOpen, initialRightOpen } =
      touchStateRef.current;

    if (gestureIntent === 'horizontal' && activeDrawer) {
      const endX = e.changedTouches[0]?.clientX ?? startX;
      const deltaX = endX - startX;
      const deltaTime = Math.max(1, Date.now() - startTime);
      const velocityX = deltaX / deltaTime;

      if (activeDrawer === 'left') {
        if (initialLeftOpen) {
          if (deltaX < -50 || velocityX < -0.3) {
            setIsMobileDrawerOpen(false);
          } else {
            setIsMobileDrawerOpen(true);
          }
        } else {
          if (deltaX > 50 || velocityX > 0.3) {
            setIsMobileDrawerOpen(true);
          } else {
            setIsMobileDrawerOpen(false);
          }
        }
      } else if (activeDrawer === 'right') {
        if (initialRightOpen) {
          if (deltaX > 50 || velocityX > 0.3) {
            handleToggleMemberList(false);
          } else {
            handleToggleMemberList(true);
          }
        }
      }
    }

    touchStateRef.current = null;
    setDragState(null);
  };

  const isElectron =
    typeof window !== 'undefined' &&
    Boolean((window as any).electronAPI || (window as any).electron || navigator.userAgent.includes('Electron'));

  const getCurrentRoute = () => {
    if (typeof window === 'undefined') return '/';
    // Se houver hash router (ex: #/reset-password?token=... ou #/signin)
    if (window.location.hash) {
      return window.location.hash.replace(/^#/, '');
    }
    if (window.location.protocol === 'file:') {
      return '/@me';
    }
    return window.location.pathname + window.location.search;
  };

  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const r = getCurrentRoute();
    if (isElectron && (!r || r === '/' || r === '#/' || r === '#')) {
      return '/signin';
    }
    return r;
  });

  const navigateTo = (path: string, replace = false) => {
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      const hashPath = '#' + (path.startsWith('/') ? path : '/' + path);
      if (window.location.hash !== hashPath) {
        if (replace) {
          window.history.replaceState(null, '', hashPath);
        } else {
          window.history.pushState(null, '', hashPath);
        }
      }
      setCurrentRoute(path);
      return;
    }
    if (window.location.pathname !== path) {
      if (replace) {
        window.history.replaceState(null, '', path);
      } else {
        window.history.pushState(null, '', path);
      }
    }
    setCurrentRoute(path);
  };

  const handleRoute = useCallback(async (pathname: string) => {
    const rawPath = pathname.split('?')[0].split('#')[0];
    const cleanPath = rawPath.replace(/^\/+|\/+$/g, '');
    const segments = cleanPath ? cleanPath.split('/') : [];

    // Root / Landing / Download / Priority Auth Routes (Reset Password, Forgot Password, Verify Email)
    if (
      segments.length === 0 ||
      segments[0] === 'download' ||
      segments[0] === 'reset-password' ||
      segments[0] === 'forgot-password' ||
      segments[0] === 'verify-email'
    ) {
      return;
    }

    if (segments[0] === 'signin' || segments[0] === 'login' || segments[0] === 'signup' || segments[0] === 'register') {
      const { user, token } = useAuthStore.getState();
      if (token && user) {
        navigateTo('/@me', true);
      }
      return;
    }

    // 0. Handle /invite/:code or /invites/:code
    if (segments.length >= 1 && (segments[0] === 'invite' || segments[0] === 'invites')) {
      const code = segments[1];
      if (code) {
        sessionStorage.setItem('pending_invite_code', code);
        const { user, token } = useAuthStore.getState();
        if (token && user) {
          try {
            const res = await api.invites.join(code);
            sessionStorage.removeItem('pending_invite_code');
            sessionStorage.removeItem('pending_redirect_path');
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
                sessionStorage.removeItem('pending_redirect_path');
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
    if (segments[0] === '@me') {
      setIsHomeActive(true);
      if (segments.length > 1 && segments[1] && segments[1] !== 'friends') {
        if (segments[1] === 'group' && segments[2]) {
          const groupId = segments[2];
          setHomeView('group');
          const curGroup = useDMGroupStore.getState().activeGroup;
          if (!curGroup || curGroup.id !== groupId) {
            await useDMGroupStore.getState().selectGroupById(groupId);
          }
        } else {
          const roomId = segments[1];
          setHomeView('dm');
          const { rooms, fetchRooms, selectRoom, activeRoom } = useDMStore.getState();
          if (rooms.length === 0) await fetchRooms();
          const targetRoom = useDMStore.getState().rooms.find((r) => r.id === roomId);
          if (targetRoom && (!activeRoom || activeRoom.id !== roomId)) {
            selectRoom(targetRoom);
          }
        }
      } else {
        if (!segments[1]) {
          let savedTarget: string | null = null;
          try {
            savedTarget = localStorage.getItem('zerovc_last_dm_target');
          } catch {}
          if (savedTarget && savedTarget !== '/@me' && savedTarget.startsWith('/@me/')) {
            navigateTo(savedTarget, true);
            return;
          }
        }
        setHomeView('friends');
      }
      return;
    }

    // 2. Server & Channel: /channels/:guildId/:channelId OR /guilds/:guildId/:channelId OR /:guildId/:channelId
    let guildId = '';
    let channelId = '';

    if (segments[0] === 'channels' || segments[0] === 'guilds') {
      guildId = segments[1] || '';
      channelId = segments[2] || '';
    } else {
      guildId = segments[0] || '';
      channelId = segments[1] || '';
    }

    if (guildId) {
      setIsHomeActive(false);
      try {
        const { activeGuild, activeChannel } = useGuildStore.getState();
        let currentGuild = activeGuild;

        if (!currentGuild || currentGuild.id !== guildId) {
          currentGuild = await api.guilds.getDetails(guildId);
          useGuildStore.setState({ activeGuild: currentGuild });
        }

        if (currentGuild && currentGuild.channels && currentGuild.channels.length > 0) {
          let resolvedChannelId = channelId;
          if (!resolvedChannelId && typeof window !== 'undefined') {
            try {
              resolvedChannelId = localStorage.getItem(`zerovc_last_channel_${guildId}`) || '';
            } catch {}
          }

          const targetChannel =
            (resolvedChannelId ? currentGuild.channels.find((c) => c.id === resolvedChannelId) : null) ||
            currentGuild.channels.find((c) => c.type === 'text') ||
            currentGuild.channels[0];

          if (!activeChannel || activeChannel.id !== targetChannel.id) {
            useGuildStore.getState().selectChannel(targetChannel);
          }
          if (!channelId) {
            navigateTo(`/${guildId}/${targetChannel.id}`, true);
          }
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
    useSettingsStore.getState().applyThemeToDOM();

    const onRouteEvent = () => {
      const nextRoute = getCurrentRoute();
      setCurrentRoute(nextRoute);
      handleRoute(nextRoute);
    };

    window.addEventListener('popstate', onRouteEvent);
    window.addEventListener('hashchange', onRouteEvent);

    const onNavigateChannel = (e: any) => {
      const { guildId, channelId } = e.detail || {};
      if (guildId) {
        setIsHomeActive(false);
        selectGuild(guildId, channelId);
      }
    };
    window.addEventListener('navigate-channel', onNavigateChannel as any);

    // Capture initial route/invite before login
    const initialRoute = getCurrentRoute();
    const initialRaw = initialRoute.split('?')[0].split('#')[0];
    const cleanPath = initialRaw.replace(/^\/+|\/+$/g, '');
    const segments = cleanPath ? cleanPath.split('/') : [];
    if (segments.length >= 1 && (segments[0] === 'invite' || segments[0] === 'invites') && segments[1]) {
      sessionStorage.setItem('pending_invite_code', segments[1]);
    } else if (
      cleanPath &&
      cleanPath !== '@me' &&
      cleanPath !== 'signin' &&
      cleanPath !== 'login' &&
      cleanPath !== 'signup' &&
      cleanPath !== 'register' &&
      cleanPath !== 'download' &&
      cleanPath !== 'reset-password' &&
      cleanPath !== 'forgot-password' &&
      cleanPath !== 'verify-email' &&
      !cleanPath.startsWith('invite')
    ) {
      sessionStorage.setItem('pending_redirect_path', initialRoute);
    }

    return () => {
      window.removeEventListener('popstate', onRouteEvent);
      window.removeEventListener('hashchange', onRouteEvent);
      window.removeEventListener('navigate-channel', onNavigateChannel as any);
    };
  }, [handleRoute, selectGuild]);

  // Initialize desktop preferences & apply DOM themes / accessibility
  useEffect(() => {
    useSettingsStore.getState().applyThemeToDOM();

    if (window.electronAPI) {
      try {
        const { minimizeToTray, autoStart } = useSettingsStore.getState();
        if (window.electronAPI.setMinimizeToTray) {
          window.electronAPI.setMinimizeToTray(minimizeToTray);
        }
        if (window.electronAPI.setAutoStart) {
          window.electronAPI.setAutoStart(autoStart);
        }
      } catch {}
    }
  }, []);

  // Rich Presence & Game Activity Detection in Electron
  useEffect(() => {
    if (window.electronAPI && user) {
      // Check current activity immediately on mount in Electron
      if (window.electronAPI.getCurrentActivity) {
        window.electronAPI
          .getCurrentActivity()
          .then((currentAct: any) => {
            const currentUser = useAuthStore.getState().user;
            if (!currentUser || currentUser.auto_detect_activity === false) return;

            // Clear legacy or stray OBS Studio activity if previously stored
            if (currentUser.custom_activity?.name === 'OBS Studio' || currentUser.custom_activity?.name?.toLowerCase().includes('obs')) {
              useAuthStore.getState().setUser({ custom_activity: null });
              if (currentUser.id) {
                useGuildStore.getState().updateMemberInGuild({ id: currentUser.id, custom_activity: null });
              }
              api.users.updateProfile({ custom_activity: null }).catch(() => {});
            }

            if (currentAct && (currentAct.name === 'OBS Studio' || currentAct.name.toLowerCase().includes('obs'))) {
              currentAct = null;
            }

            if (!currentAct && currentUser.custom_activity) {
              useAuthStore.getState().setUser({ custom_activity: null });
              if (currentUser.id) {
                useGuildStore.getState().updateMemberInGuild({ id: currentUser.id, custom_activity: null });
              }
              api.users
                .updateProfile({ custom_activity: null })
                .then((updated) => {
                  useAuthStore.getState().setUser(updated);
                  if (updated.id) {
                    useGuildStore.getState().updateMemberInGuild(updated);
                  }
                })
                .catch(() => {});
            } else if (currentAct && currentAct.name) {
              let currentIconUrl = currentAct.icon_url;
              if (currentAct.name.toLowerCase() === 'minecraft') {
                if (!currentIconUrl || currentIconUrl.includes('java') || currentIconUrl.startsWith('data:image/x-icon') || currentIconUrl.includes('games/minecraft')) {
                  currentIconUrl = '/assets/minecraft.webp';
                  currentAct.icon_url = currentIconUrl;
                }
              }
              useRegisteredGamesStore.getState().addOrUpdateGame(currentAct.name, true, undefined, currentIconUrl);
              const isEnabled = useRegisteredGamesStore.getState().isGameEnabled(currentAct.name);
              if (isEnabled && !currentUser.custom_activity) {
                const actWithTime = {
                  ...currentAct,
                  icon_url: currentIconUrl,
                  type: currentAct.type || 'playing',
                  start_time: currentAct.start_time || Math.floor(Date.now() / 1000),
                };
                useAuthStore.getState().setUser({ custom_activity: actWithTime });
                if (currentUser.id) {
                  useGuildStore.getState().updateMemberInGuild({ id: currentUser.id, custom_activity: actWithTime });
                }
                api.users.updateProfile({ custom_activity: actWithTime }).catch(() => {});
              } else if (!isEnabled && currentUser.custom_activity) {
                useAuthStore.getState().setUser({ custom_activity: null });
                if (currentUser.id) {
                  useGuildStore.getState().updateMemberInGuild({ id: currentUser.id, custom_activity: null });
                }
                api.users.updateProfile({ custom_activity: null }).catch(() => {});
              }
            }
          })
          .catch(() => {});
      }

      if (window.electronAPI.onActivityDetected) {
        const removeListener = window.electronAPI.onActivityDetected(async (detectedActivity: any) => {
          const currentUser = useAuthStore.getState().user;
          if (!currentUser || currentUser.auto_detect_activity === false) return;

          let resolvedActivity = detectedActivity;
          if (detectedActivity && (detectedActivity.name === 'OBS Studio' || detectedActivity.name?.toLowerCase().includes('obs'))) {
            resolvedActivity = null;
          } else if (detectedActivity && detectedActivity.name) {
            let iconUrl = detectedActivity.icon_url;
            if (detectedActivity.name.toLowerCase() === 'minecraft') {
              if (!iconUrl || iconUrl.includes('java') || iconUrl.startsWith('data:image/x-icon') || iconUrl.includes('games/minecraft')) {
                iconUrl = '/assets/minecraft.webp';
              }
              resolvedActivity = { ...detectedActivity, icon_url: iconUrl };
            } else if (!iconUrl) {
              try {
                const gameMatches = await api.games.search(detectedActivity.name);
                if (gameMatches && gameMatches.length > 0) {
                  iconUrl = gameMatches[0].icon_url || gameMatches[0].background_image;
                  resolvedActivity = { ...detectedActivity, icon_url: iconUrl };
                }
              } catch {}
            }

            useRegisteredGamesStore.getState().addOrUpdateGame(detectedActivity.name, true, undefined, iconUrl);
            const isEnabled = useRegisteredGamesStore.getState().isGameEnabled(detectedActivity.name);
            if (!isEnabled) {
              resolvedActivity = null;
            }
          }

          const currentAct = currentUser.custom_activity;

          if (resolvedActivity) {
            if (currentAct && currentAct.name === resolvedActivity.name && currentAct.start_time) {
              resolvedActivity.start_time = currentAct.start_time;
            } else if (!resolvedActivity.start_time) {
              resolvedActivity.start_time = Math.floor(Date.now() / 1000);
            }
          }

          if (
            (!currentAct && !resolvedActivity) ||
            (currentAct && resolvedActivity && currentAct.name === resolvedActivity.name && currentAct.type === resolvedActivity.type && currentAct.icon_url === resolvedActivity.icon_url)
          ) {
            return;
          }

          // Optimistically update store immediately
          const targetActivity = resolvedActivity || null;
          useAuthStore.getState().setUser({ custom_activity: targetActivity });
          if (currentUser.id) {
            useGuildStore.getState().updateMemberInGuild({ id: currentUser.id, custom_activity: targetActivity });
          }

          api.users
            .updateProfile({ custom_activity: targetActivity })
            .then((updated) => {
              useAuthStore.getState().setUser(updated);
              if (updated.id) {
                useGuildStore.getState().updateMemberInGuild(updated);
              }
            })
            .catch((err) => {
              console.warn('[Activity] Failed to auto-update activity:', err);
            });
        });

        return () => {
          removeListener?.();
        };
      }
    }
  }, [user?.id, user?.auto_detect_activity]);

  // Automatic E2EE Device Identity Registration
  useEffect(() => {
    if (user?.id) {
      deviceManager.ensureRegistered(user.id, api.e2ee).catch((err) => {
        safeCryptoLogger.warn('App: Failed to auto-register E2EE device', err);
      });
    }
  }, [user?.id]);

  // Retroactive re-decryption of undecryptable messages after cloud key vault auto-restore
  useEffect(() => {
    if (!user?.id) return;

    const handleKeysRestored = async () => {
      // 1. Re-attempt decrypting active DM messages
      try {
        const dmState = useDMStore.getState();
        const activeRoomId = dmState.activeRoom?.id;
        if (activeRoomId) {
          const roomMsgs = dmState.messagesByRoom[activeRoomId] || dmState.messages || [];
          const undecrypted = roomMsgs.filter(
            (m) => m.encrypted && m.decryption_status === 'undecryptable'
          );
          for (const msg of undecrypted) {
            const decoded = await messageCodec.decodeMessage(msg);
            if (decoded.decryptionStatus === 'decrypted') {
              useDMStore.setState((s) => {
                const updateMsg = (m: any) =>
                  m.id === msg.id
                    ? {
                        ...m,
                        content: decoded.content,
                        attachments: decoded.attachments,
                        decryption_status: decoded.decryptionStatus,
                      }
                    : m;
                return {
                  messages: s.activeRoom?.id === activeRoomId ? s.messages.map(updateMsg) : s.messages,
                  messagesByRoom: {
                    ...s.messagesByRoom,
                    [activeRoomId]: (s.messagesByRoom[activeRoomId] || []).map(updateMsg),
                  },
                };
              });
            }
          }
        }
      } catch (e) {
        safeCryptoLogger.warn('App: Failed to re-decrypt DM messages after auto-restore', e);
      }

      // 2. Re-attempt decrypting active DM Group messages
      try {
        const groupState = useDMGroupStore.getState();
        const activeGroupId = groupState.activeGroup?.id;
        if (activeGroupId) {
          const groupMsgs = groupState.messagesByGroup[activeGroupId] || groupState.messages || [];
          const undecrypted = groupMsgs.filter(
            (m) => m.encrypted && m.decryption_status === 'undecryptable'
          );
          for (const msg of undecrypted) {
            const decoded = await messageCodec.decodeMessage(msg);
            if (decoded.decryptionStatus === 'decrypted') {
              useDMGroupStore.setState((s) => {
                const updateMsg = (m: any) =>
                  m.id === msg.id
                    ? {
                        ...m,
                        content: decoded.content,
                        attachments: decoded.attachments,
                        decryption_status: decoded.decryptionStatus,
                      }
                    : m;
                return {
                  messages: s.activeGroup?.id === activeGroupId ? s.messages.map(updateMsg) : s.messages,
                  messagesByGroup: {
                    ...s.messagesByGroup,
                    [activeGroupId]: (s.messagesByGroup[activeGroupId] || []).map(updateMsg),
                  },
                };
              });
            }
          }
        }
      } catch (e) {
        safeCryptoLogger.warn('App: Failed to re-decrypt DM group messages after auto-restore', e);
      }

      // 3. Re-attempt decrypting active Channel messages
      try {
        const guildState = useGuildStore.getState();
        const activeChannelId = guildState.activeChannel?.id;
        if (activeChannelId) {
          const channelMsgs = guildState.messagesByChannel[activeChannelId] || guildState.messages || [];
          const undecrypted = channelMsgs.filter(
            (m) => m.encrypted && m.decryption_status === 'undecryptable'
          );
          for (const msg of undecrypted) {
            const decoded = await messageCodec.decodeMessage(msg);
            if (decoded.decryptionStatus === 'decrypted') {
              useGuildStore.setState((s) => {
                const updateMsg = (m: any) =>
                  m.id === msg.id
                    ? {
                        ...m,
                        content: decoded.content,
                        attachments: decoded.attachments,
                        decryption_status: decoded.decryptionStatus,
                      }
                    : m;
                return {
                  messages: s.activeChannel?.id === activeChannelId ? s.messages.map(updateMsg) : s.messages,
                  messagesByChannel: {
                    ...s.messagesByChannel,
                    [activeChannelId]: (s.messagesByChannel[activeChannelId] || []).map(updateMsg),
                  },
                };
              });
            }
          }
        }
      } catch (e) {
        safeCryptoLogger.warn('App: Failed to re-decrypt channel messages after auto-restore', e);
      }
    };

    window.addEventListener('zerovc:keys-restored', handleKeysRestored);
    return () => {
      window.removeEventListener('zerovc:keys-restored', handleKeysRestored);
    };
  }, [user?.id]);

  // Streamer Mode Software Detection & Synchronization
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Sync initial custom processes
      const customProcs = useStreamerModeStore.getState().customProcesses;
      if (customProcs.length > 0 && window.electronAPI.setCustomStreamerProcesses) {
        window.electronAPI.setCustomStreamerProcesses(customProcs);
      }

      // Check current initial status
      if (window.electronAPI.getStreamerSoftwareStatus) {
        window.electronAPI.getStreamerSoftwareStatus().then((status) => {
          if (status?.runningApps) {
            useStreamerModeStore.getState().handleStreamAppsUpdate(status.runningApps);
          }
        }).catch(() => {});
      }

      // Subscribe to real-time status updates
      if (window.electronAPI.onStreamerSoftwareStatus) {
        const removeListener = window.electronAPI.onStreamerSoftwareStatus((status) => {
          if (status?.runningApps) {
            useStreamerModeStore.getState().handleStreamAppsUpdate(status.runningApps);
          }
        });
        return () => {
          removeListener?.();
        };
      }
    }
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

    // Electron global shortcut event listener
    let removeShortcutListener: (() => void) | undefined;
    if ((window as any).electronAPI?.onGlobalShortcut) {
      removeShortcutListener = (window as any).electronAPI.onGlobalShortcut((action: string) => {
        if (action === 'toggle-mute') {
          useVoiceStore.getState().toggleMute();
        } else if (action === 'toggle-deafen') {
          useVoiceStore.getState().toggleDeafen();
        } else if (action === 'toggle-screenshare') {
          const vs = useVoiceStore.getState();
          if (vs.isConnected) {
            if (vs.isScreensharing) {
              livekit.setScreenShareEnabled(false);
              useVoiceStore.setState({ isScreensharing: false });
            } else {
              setIsScreenShareOpen(true);
            }
          }
        }
      });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      removeShortcutListener?.();
    };
  }, []);

  useEffect(() => {
    if (token && user) {
      fetchGuilds();
      useFriendStore.getState().fetchFriends().catch(() => {});
      useDMStore.getState().fetchRooms().catch(() => {});
      useDMGroupStore.getState().fetchGroups().catch(() => {});

      // Check pending invite or pending redirect
      const pendingInvite = sessionStorage.getItem('pending_invite_code');
      const pendingRedirect = sessionStorage.getItem('pending_redirect_path');

      if (pendingInvite) {
        api.invites
          .join(pendingInvite)
          .then(async (res) => {
            sessionStorage.removeItem('pending_invite_code');
            sessionStorage.removeItem('pending_redirect_path');
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
                sessionStorage.removeItem('pending_redirect_path');
              }
            } catch {}
          });
      } else if (pendingRedirect) {
        sessionStorage.removeItem('pending_redirect_path');
        handleRoute(pendingRedirect);
      } else {
        const cur = getCurrentRoute();
        const curBase = cur.split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '');
        if (
          curBase !== 'reset-password' &&
          curBase !== 'forgot-password' &&
          curBase !== 'verify-email'
        ) {
          handleRoute(cur);
        }
      }

      // Request notification permissions gracefully on login
      requestNotificationPermission();

      // WebSocket Event Subscriptions
      const handleMessageCreate = (event: any) => {
        const msg = event.data;
        addMessage(msg);

        // Native notification if backgrounded and not author
        const currentUser = useAuthStore.getState().user;
        if (msg && msg.author_id !== currentUser?.id && typeof document !== 'undefined' && document.hidden) {
          if (currentUser?.status === 'dnd') return;

          const guilds = useGuildStore.getState().guilds;
          let guildName = 'Servidor';
          let channelName = 'chat';

          for (const g of guilds) {
            const ch = g.channels?.find((c: any) => c.id === msg.channel_id);
            if (ch) {
              guildName = g.name;
              channelName = ch.name;
              break;
            }
          }

          const authorName = msg.author?.display_name || msg.author?.username || 'Usuário';
          sendNativeNotification({
            title: `ZeroVC - ${guildName} - #${channelName}`,
            body: `${authorName}: ${msg.content || 'Enviou um anexo'}`,
            tag: `msg-${msg.id}`,
            icon: `${window.location.origin}/icon.png`,
          });
        }
      };

      const handleMessageUpdate = (event: any) => {
        updateMessageInStore(event.data);
      };

      const handleMessageDelete = (event: any) => {
        removeMessageFromStore(event.data.id);
      };

      const handleDMMessageCreate = (event: any) => {
        const msg = event.data;
        addDMMessage(msg);

        // Native notification for direct messages
        const currentUser = useAuthStore.getState().user;
        if (msg && msg.author_id !== currentUser?.id && typeof document !== 'undefined' && document.hidden) {
          if (currentUser?.status === 'dnd') return;

          const authorName = msg.author?.display_name || msg.author?.username || 'Usuário';
          sendNativeNotification({
            title: `ZeroVC - ${authorName}`,
            body: msg.content || 'Enviou um anexo',
            tag: `dm-${msg.id}`,
            icon: `${window.location.origin}/icon.png`,
          });
        }
      };

      const handleDMMessageUpdate = (event: any) => {
        if (event.data) {
          useDMStore.getState().handleDMMessageUpdateEvent(event.data);
        }
      };

      const handleDMMessageDelete = (event: any) => {
        if (event.data) {
          useDMStore.getState().handleDMMessageDeleteEvent(event.data);
        }
      };

      const handleVoiceStateUpdate = (event: any) => {
        updateVoiceState(event.data.action, event.data.session, event.data.channel_id, event.data.user_id);

        const currentUserId = useAuthStore.getState().user?.id;
        const currentVoiceChannelId = useVoiceStore.getState().currentChannelId;
        const isVoiceConnected = useVoiceStore.getState().isConnected;

        // Sound triggers when another user joins, leaves, moves or updates stream in the current active voice channel
        if (
          isVoiceConnected &&
          currentVoiceChannelId &&
          event.data.user_id !== currentUserId
        ) {
          if (event.data.channel_id === currentVoiceChannelId) {
            if (event.data.action === 'join') {
              playUserJoinCallSound();
            } else if (event.data.action === 'leave' || event.data.action === 'move') {
              playUserLeaveCallSound();
            } else if ((event.data.action === 'update' || event.data.action === 'state') && event.data.session) {
              if (event.data.session.is_screensharing === true) {
                playStartStreamSound();
              } else if (event.data.session.is_screensharing === false) {
                playStopStreamSound();
              }
            }
          } else if (event.data.target_channel_id === currentVoiceChannelId && event.data.action === 'move') {
            playUserJoinCallSound();
          }
        }

        if (event.data.forced) {
          if (event.data.action === 'leave' && event.data.user_id === currentUserId) {
            useVoiceStore.getState().leaveVoice();
          } else if (event.data.action === 'move' && event.data.user_id === currentUserId) {
            if (event.data.target_channel_id) {
              useVoiceStore.getState().joinVoice(event.data.target_channel_id, event.data.guild_id);
            }
          } else if (event.data.action === 'update' && event.data.session?.user_id === currentUserId) {
            if (event.data.session.is_muted !== undefined) {
              livekit.setMuted(event.data.session.is_muted);
              useVoiceStore.setState({ isMuted: event.data.session.is_muted });
            }
            if (event.data.session.is_deafened !== undefined) {
              livekit.setDeafened(event.data.session.is_deafened);
              useVoiceStore.setState({ isDeafened: event.data.session.is_deafened });
            }
          }
        }
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
        if (event.data?.group_id) {
          useDMGroupStore.getState().handleGroupPinEvent(event.data);
        } else if (event.data?.room_id) {
          useDMStore.getState().handlePinEvent(event.data);
        } else {
          useGuildStore.getState().handlePinEvent(event.data);
        }
      };

      const handleDMReactionAdd = (event: any) => {
        useDMStore.getState().handleDMReactionEvent({ ...event.data, is_add: true });
      };

      const handleDMReactionRemove = (event: any) => {
        useDMStore.getState().handleDMReactionEvent({ ...event.data, is_add: false });
      };

      const handleCallIncoming = (event: any) => {
        useCallStore.getState().handleIncomingCall(event.data.room_id, event.data.caller, event.data.e2ee_enabled);
      };

      const handleCallAccept = (event: any) => {
        useCallStore.getState().handleCallAccepted(event.data.token, event.data.livekit_url, event.data.room_name, event.data.e2ee_enabled);
      };

      const handleCallEnd = () => {
        useCallStore.getState().handleCallEnded();
      };

      const handleGroupMessageCreate = (event: any) => {
        const msg = event.data;
        useDMGroupStore.getState().handleGroupMessageCreate(msg);

        // Native notification for group messages
        const currentUser = useAuthStore.getState().user;
        if (msg && msg.author_id !== currentUser?.id && typeof document !== 'undefined' && document.hidden) {
          if (currentUser?.status === 'dnd') return;

          const groups = useDMGroupStore.getState().groups;
          const group = groups.find((g: any) => g.id === msg.group_id);
          const groupName = group?.name || 'Grupo';
          const authorName = msg.author?.display_name || msg.author?.username || 'Usuário';

          sendNativeNotification({
            title: `ZeroVC - ${groupName} - ${authorName}`,
            body: msg.content || 'Enviou um anexo',
            tag: `group-msg-${msg.id}`,
            icon: `${window.location.origin}/icon.png`,
          });
        }
      };

      const handleGroupMessageUpdate = (event: any) => {
        if (event.data) {
          useDMGroupStore.getState().handleGroupMessageUpdate(event.data);
        }
      };

      const handleGroupMessageDelete = (event: any) => {
        if (event.data) {
          useDMGroupStore.getState().handleGroupMessageDelete(event.data);
        }
      };

      const handleGroupUpdate = (event: any) => {
        if (event.data) {
          useDMGroupStore.getState().handleGroupUpdate(event.data);
        }
      };

      const handleGroupLeave = (event: any) => {
        if (event.data?.group_id) {
          const activeG = useDMGroupStore.getState().activeGroup;
          if (activeG?.id === event.data.group_id) {
            setHomeView('friends');
          }
          useDMGroupStore.getState().handleGroupLeave(event.data);
        }
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

      const handleChannelAck = (event: any) => {
        if (event.data?.channel_id) {
          useGuildStore.setState((state) => {
            const unread = new Set(state.unreadChannels);
            unread.delete(event.data.channel_id);
            return { unreadChannels: unread };
          });
        }
      };

      const handleGuildUpdate = (event: any) => {
        if (event.data?.id) {
          useGuildStore.getState().handleGuildUpdateEvent(event.data);
        }
      };

      const handleGuildDelete = (event: any) => {
        const deletedId = event.data?.guild_id || event.data?.id;
        if (deletedId) {
          useGuildStore.getState().handleGuildDeleteEvent(deletedId);
          const currentActive = useGuildStore.getState().activeGuild;
          if (!currentActive || currentActive.id === deletedId) {
            setIsHomeActive(true);
            navigateTo('/@me', true);
          }
        }
      };

      const handleRoleCreate = (event: any) => {
        if (event.data?.id) {
          useGuildStore.getState().handleRoleCreateEvent(event.data);
        }
      };

      const handleRoleUpdate = (event: any) => {
        if (event.data?.id) {
          useGuildStore.getState().handleRoleUpdateEvent(event.data);
        }
      };

      const handleRoleDelete = (event: any) => {
        const roleId = event.data?.role_id || event.data?.id;
        const guildId = event.data?.guild_id;
        if (roleId && guildId) {
          useGuildStore.getState().handleRoleDeleteEvent(guildId, roleId);
        }
      };

      const handleChannelDelete = (event: any) => {
        const channelId = event.data?.id || event.data?.channel_id;
        const guildId = event.data?.guild_id;
        if (channelId && guildId) {
          useGuildStore.getState().handleChannelDeleteEvent(guildId, channelId);
        }
      };

      const handleGuildEmojiCreate = (event: any) => {
        if (event.data?.id) {
          useGuildStore.getState().handleEmojiCreateEvent(event.data);
        }
      };

      const handleGuildEmojiUpdate = (event: any) => {
        if (event.data?.id) {
          useGuildStore.getState().handleEmojiUpdateEvent(event.data);
        }
      };

      const handleGuildEmojiDelete = (event: any) => {
        if (event.data) {
          useGuildStore.getState().handleEmojiDeleteEvent(event.data);
        }
      };

      const handleSessionRevoked = async (event: any) => {
        try {
          const data = event?.data || {};
          const currentToken = useAuthStore.getState().token;
          if (!currentToken) return;

          const msgUint8 = new TextEncoder().encode(currentToken);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const currentTokenHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

          if (data.except_token_hash && data.except_token_hash === currentTokenHash) {
            return;
          }

          if (data.token_hash && data.token_hash !== currentTokenHash) {
            return;
          }

          useAuthStore.getState().logout();
        } catch {
          // Prevent accidental logout on hashing exception
        }
      };

      const handleE2EEToDevice = async (event: any) => {
        const msg = event?.data || event;
        if (!msg) return;

        if (msg.msg_type === 'room_key') {
          try {
            const payload: RoomKeyToDevicePayload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
            await keyRequestManager.handleRoomKeyReceived(payload);
          } catch (e) {
            safeCryptoLogger.error('Falha ao processar room_key to-device recebida', e);
          }
        } else if (msg.msg_type === 'key_request') {
          try {
            const payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
            const myDeviceId = (typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : '') || '';
            await megolmManager.handleIncomingKeyRequest(payload, myDeviceId);
          } catch (e) {
            safeCryptoLogger.error('Falha ao processar key_request to-device recebida', e);
          }
        } else if (msg.msg_type === 'call_key') {
          try {
            const payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
            await callKeyManager.handleIncomingCallKey(payload);
          } catch (e) {
            safeCryptoLogger.error('Falha ao processar call_key to-device recebida', e);
          }
        }

        if (msg.id) {
          api.e2ee.ackToDevice([msg.id]).catch(() => {});
        }
      };

      const handleE2EERosterUpdate = async (event: any) => {
        const roster = event?.data?.roster || event?.roster || event?.data;
        if (roster && roster.conversation_id) {
          try {
            await rosterManager.handleRosterUpdate(roster);
          } catch (e) {
            safeCryptoLogger.error('Falha ao processar roster update recebido', e);
          }
        }
      };

      const handleE2EERotationRequired = (event: any) => {
        const data = event?.data || event;
        const targetId = data?.conversation_id || data?.channel_id;
        const conversation_type = data?.conversation_type || (data?.channel_id ? 'channel' : undefined);
        const epoch = data?.epoch ?? data?.new_epoch;
        if (targetId) {
          megolmManager.invalidateOutboundSession(targetId).catch(() => {});
          if (conversation_type === 'dm') {
            useDMStore.setState((s) => ({
              rooms: s.rooms.map((r) => (r.id === targetId ? { ...r, rotation_epoch: epoch } : r)),
              activeRoom: s.activeRoom && s.activeRoom.id === targetId ? { ...s.activeRoom, rotation_epoch: epoch } : s.activeRoom,
            }));
          } else if (conversation_type === 'dm_group') {
            useDMGroupStore.setState((s) => ({
              groups: s.groups.map((g) => (g.id === targetId ? { ...g, rotation_epoch: epoch } : g)),
              activeGroup: s.activeGroup && s.activeGroup.id === targetId ? { ...s.activeGroup, rotation_epoch: epoch } : s.activeGroup,
            }));
          } else if (conversation_type === 'channel') {
            useGuildStore.setState((s) => ({
              guilds: s.guilds.map((g) => ({
                ...g,
                channels: g.channels ? g.channels.map((c) => (c.id === targetId ? { ...c, rotation_epoch: epoch } : c)) : g.channels,
              })),
              activeGuild: s.activeGuild ? {
                ...s.activeGuild,
                channels: s.activeGuild.channels ? s.activeGuild.channels.map((c) => (c.id === targetId ? { ...c, rotation_epoch: epoch } : c)) : s.activeGuild.channels,
              } : s.activeGuild,
              activeChannel: s.activeChannel && s.activeChannel.id === targetId ? { ...s.activeChannel, rotation_epoch: epoch } : s.activeChannel,
            }));
          }
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
      socket.on('DM_MESSAGE_UPDATE', handleDMMessageUpdate);
      socket.on('DM_MESSAGE_DELETE', handleDMMessageDelete);
      socket.on('DM_REACTION_ADD', handleDMReactionAdd);
      socket.on('DM_REACTION_REMOVE', handleDMReactionRemove);
      socket.on('GROUP_MESSAGE_CREATE', handleGroupMessageCreate);
      socket.on('GROUP_MESSAGE_UPDATE', handleGroupMessageUpdate);
      socket.on('GROUP_MESSAGE_DELETE', handleGroupMessageDelete);
      socket.on('GROUP_UPDATE', handleGroupUpdate);
      socket.on('GROUP_LEAVE', handleGroupLeave);
      socket.on('CALL_INCOMING', handleCallIncoming);
      socket.on('CALL_ACCEPT', handleCallAccept);
      socket.on('CALL_REJECT', handleCallEnd);
      socket.on('CALL_LEAVE', handleCallEnd);
      socket.on('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
      socket.on('TYPING_START', handleTypingStart);
      socket.on('FRIEND_REQUEST_CREATE', handleFriendUpdate);
      socket.on('FRIEND_REQUEST_UPDATE', handleFriendUpdate);
      socket.on('USER_UPDATE', handleUserUpdate);
      socket.on('GUILD_UPDATE', handleGuildUpdate);
      socket.on('GUILD_DELETE', handleGuildDelete);
      socket.on('GUILD_MEMBER_ADD', handleGuildMemberAdd);
      socket.on('GUILD_MEMBER_REMOVE', handleGuildMemberRemove);
      socket.on('GUILD_BAN_ADD', handleGuildMemberRemove);
      socket.on('GUILD_MEMBER_UPDATE', handleGuildMemberUpdate);
      socket.on('PRESENCE_UPDATE', handlePresenceUpdate);
      socket.on('CHANNEL_ACK', handleChannelAck);
      socket.on('CHANNEL_DELETE', handleChannelDelete);
      socket.on('ROLE_CREATE', handleRoleCreate);
      socket.on('ROLE_UPDATE', handleRoleUpdate);
      socket.on('ROLE_DELETE', handleRoleDelete);
      socket.on('GUILD_EMOJI_CREATE', handleGuildEmojiCreate);
      socket.on('GUILD_EMOJI_UPDATE', handleGuildEmojiUpdate);
      socket.on('GUILD_EMOJI_DELETE', handleGuildEmojiDelete);
      socket.on('SESSION_REVOKED', handleSessionRevoked);
      socket.on('E2EE_TO_DEVICE', handleE2EEToDevice);
      socket.on('E2EE_ROSTER_UPDATE', handleE2EERosterUpdate);
      socket.on('E2EE_ROTATION_REQUIRED', handleE2EERotationRequired);

      // Drain pending offline to-device messages on initial connection
      api.e2ee.getToDevice().then(async (pending) => {
        if (Array.isArray(pending) && pending.length > 0) {
          for (const msg of pending) {
            await handleE2EEToDevice(msg);
          }
        }
      }).catch((e) => {
        safeCryptoLogger.debug('Failed to drain initial to-device messages', e);
      });

      const unsubscribeReconnect = socket.onReconnect(async () => {
        try {
          // 1. Resync active channel messages
          const curActiveChannel = useGuildStore.getState().activeChannel;
          if (curActiveChannel && curActiveChannel.type === 'text') {
            const msgs = await api.channels.getMessages(curActiveChannel.id, 50);
            useGuildStore.setState((state) => ({
              messages: state.activeChannel?.id === curActiveChannel.id ? msgs : state.messages,
              messagesByChannel: {
                ...state.messagesByChannel,
                [curActiveChannel.id]: msgs,
              },
            }));
          }

          // 2. Resync active guild read states & voice states
          const curActiveGuild = useGuildStore.getState().activeGuild;
          if (curActiveGuild) {
            useGuildStore.getState().syncVoiceStates(curActiveGuild.id).catch(() => {});
            const readStates = await api.guilds.getReadStates(curActiveGuild.id);
            if (readStates) {
              useGuildStore.setState((state) => {
                const unread = new Set(state.unreadChannels);
                for (const rs of readStates) {
                  if (rs.unread_count > 0) unread.add(rs.channel_id);
                  else unread.delete(rs.channel_id);
                }
                return { unreadChannels: unread };
              });
            }
          }

          // 3. Resync friends list
          useFriendStore.getState().fetchFriends().catch(() => {});

          // 4. Resync DM rooms & groups
          useDMStore.getState().fetchRooms().catch(() => {});
          useDMGroupStore.getState().fetchGroups().catch(() => {});

          // 5. Drain pending to-device messages on reconnect
          try {
            const pendingToDevice = await api.e2ee.getToDevice();
            if (Array.isArray(pendingToDevice) && pendingToDevice.length > 0) {
              for (const toDevMsg of pendingToDevice) {
                await handleE2EEToDevice(toDevMsg);
              }
            }
          } catch (e) {
            safeCryptoLogger.debug('Failed to drain to-device messages on reconnect', e);
          }
        } catch (err) {
          console.error('[Socket Resync] Failed to resync on reconnection:', err);
        }
      });

      return () => {
        unsubscribeReconnect();
        socket.off('MESSAGE_CREATE', handleMessageCreate);
        socket.off('MESSAGE_UPDATE', handleMessageUpdate);
        socket.off('MESSAGE_DELETE', handleMessageDelete);
        socket.off('MESSAGE_REACTION_ADD', handleMessageReactionAdd);
        socket.off('MESSAGE_REACTION_REMOVE', handleMessageReactionRemove);
        socket.off('MESSAGE_PIN', handleMessagePin);
        socket.off('MESSAGE_UNPIN', handleMessagePin);
        socket.off('DM_MESSAGE_CREATE', handleDMMessageCreate);
        socket.off('DM_MESSAGE_UPDATE', handleDMMessageUpdate);
        socket.off('DM_MESSAGE_DELETE', handleDMMessageDelete);
        socket.off('DM_REACTION_ADD', handleDMReactionAdd);
        socket.off('DM_REACTION_REMOVE', handleDMReactionRemove);
        socket.off('GROUP_MESSAGE_CREATE', handleGroupMessageCreate);
        socket.off('GROUP_MESSAGE_UPDATE', handleGroupMessageUpdate);
        socket.off('GROUP_MESSAGE_DELETE', handleGroupMessageDelete);
        socket.off('GROUP_UPDATE', handleGroupUpdate);
        socket.off('GROUP_LEAVE', handleGroupLeave);
        socket.off('CALL_INCOMING', handleCallIncoming);
        socket.off('CALL_ACCEPT', handleCallAccept);
        socket.off('CALL_REJECT', handleCallEnd);
        socket.off('CALL_LEAVE', handleCallEnd);
        socket.off('VOICE_STATE_UPDATE', handleVoiceStateUpdate);
        socket.off('TYPING_START', handleTypingStart);
        socket.off('FRIEND_REQUEST_CREATE', handleFriendUpdate);
        socket.off('FRIEND_REQUEST_UPDATE', handleFriendUpdate);
        socket.off('USER_UPDATE', handleUserUpdate);
        socket.off('GUILD_UPDATE', handleGuildUpdate);
        socket.off('GUILD_DELETE', handleGuildDelete);
        socket.off('GUILD_MEMBER_ADD', handleGuildMemberAdd);
        socket.off('GUILD_MEMBER_REMOVE', handleGuildMemberRemove);
        socket.off('GUILD_BAN_ADD', handleGuildMemberRemove);
        socket.off('GUILD_MEMBER_UPDATE', handleGuildMemberUpdate);
        socket.off('PRESENCE_UPDATE', handlePresenceUpdate);
        socket.off('CHANNEL_ACK', handleChannelAck);
        socket.off('CHANNEL_DELETE', handleChannelDelete);
        socket.off('ROLE_CREATE', handleRoleCreate);
        socket.off('ROLE_UPDATE', handleRoleUpdate);
        socket.off('ROLE_DELETE', handleRoleDelete);
        socket.off('GUILD_EMOJI_CREATE', handleGuildEmojiCreate);
        socket.off('GUILD_EMOJI_UPDATE', handleGuildEmojiUpdate);
        socket.off('GUILD_EMOJI_DELETE', handleGuildEmojiDelete);
        socket.off('SESSION_REVOKED', handleSessionRevoked);
        socket.off('E2EE_TO_DEVICE', handleE2EEToDevice);
        socket.off('E2EE_ROSTER_UPDATE', handleE2EERosterUpdate);
        socket.off('E2EE_ROTATION_REQUIRED', handleE2EERotationRequired);
      };
    }
  }, [token, user]);

  if (isCheckingAuth) {
    return (
      <div className="w-screen h-[100dvh] flex flex-col bg-background-darkest text-gray-400">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const cleanRoute = currentRoute.replace(/^\/+|\/+$/g, '').split('?')[0];

  const isCapacitor =
    typeof window !== 'undefined' &&
    (typeof (window as any).Capacitor !== 'undefined' &&
      ((window as any).Capacitor?.isNativePlatform?.() ||
        (window as any).Capacitor?.getPlatform?.() === 'android' ||
        (window as any).Capacitor?.getPlatform?.() === 'ios') ||
      window.matchMedia?.('(display-mode: standalone)')?.matches);

  const isResetPassword =
    cleanRoute === 'reset-password' ||
    Boolean(
      typeof window !== 'undefined' &&
        (window.location.pathname.includes('reset-password') ||
          window.location.hash.includes('reset-password') ||
          (window.location.search.includes('token=') &&
            !window.location.pathname.startsWith('/channels/') &&
            !window.location.pathname.startsWith('/@me')))
    );

  const isForgotPassword =
    cleanRoute === 'forgot-password' ||
    Boolean(
      typeof window !== 'undefined' &&
        (window.location.pathname.includes('forgot-password') || window.location.hash.includes('forgot-password'))
    );

  const isVerifyEmail =
    cleanRoute === 'verify-email' ||
    Boolean(
      typeof window !== 'undefined' &&
        (window.location.pathname.includes('verify-email') || window.location.hash.includes('verify-email'))
    );

  // 1. Priority Auth Routes (Reset Password, Forgot Password, Verify Email)
  // These MUST be accessible even if the user is already logged in!
  if (isResetPassword) {
    return (
      <div
        style={{
          paddingTop: isCapacitor && typeof window !== 'undefined' && window.innerWidth < 768 ? 'max(env(safe-area-inset-top, 0px), 28px)' : undefined,
        }}
        className="w-screen h-[100dvh] flex flex-col bg-background-darkest"
      >
        {isElectron && <TitleBar />}
        <div className="flex-1 overflow-hidden">
          <AuthScreen initialMode="reset_password" onNavigate={navigateTo} />
        </div>
      </div>
    );
  }

  if (isForgotPassword) {
    return (
      <div
        style={{
          paddingTop: isCapacitor && typeof window !== 'undefined' && window.innerWidth < 768 ? 'max(env(safe-area-inset-top, 0px), 28px)' : undefined,
        }}
        className="w-screen h-[100dvh] flex flex-col bg-background-darkest"
      >
        {isElectron && <TitleBar />}
        <div className="flex-1 overflow-hidden">
          <AuthScreen initialMode="forgot_password" onNavigate={navigateTo} />
        </div>
      </div>
    );
  }

  if (isVerifyEmail) {
    return (
      <div
        style={{
          paddingTop: isCapacitor && typeof window !== 'undefined' && window.innerWidth < 768 ? 'max(env(safe-area-inset-top, 0px), 28px)' : undefined,
        }}
        className="w-screen h-[100dvh] flex flex-col bg-background-darkest"
      >
        {isElectron && <TitleBar />}
        <div className="flex-1 overflow-hidden">
          <AuthScreen initialMode="verify_email" onNavigate={navigateTo} />
        </div>
      </div>
    );
  }

  if (!user) {
    // Native Electron or Capacitor app: Always opens directly on AuthScreen (never the landing page)
    if (isElectron || isCapacitor) {
      const isRegister = cleanRoute === 'signup' || cleanRoute === 'register';
      return (
        <div
          style={{
            paddingTop: isCapacitor && typeof window !== 'undefined' && window.innerWidth < 768 ? 'max(env(safe-area-inset-top, 0px), 28px)' : undefined,
          }}
          className="w-screen h-[100dvh] flex flex-col bg-background-darkest"
        >
          {isElectron && <TitleBar />}
          <div className="flex-1 overflow-hidden">
            <AuthScreen initialMode={isRegister ? 'register' : 'login'} onNavigate={navigateTo} />
          </div>
        </div>
      );
    }

    // Web Browser routes:
    if (cleanRoute === 'download') {
      return (
        <div className="w-full h-[100dvh] overflow-y-auto overflow-x-hidden flex flex-col bg-background-darkest overscroll-contain">
          <DownloadPage onNavigate={navigateTo} user={user} />
        </div>
      );
    }

    if (cleanRoute === 'signup' || cleanRoute === 'register') {
      return (
        <div className="w-screen h-[100dvh] flex flex-col bg-background-darkest">
          <AuthScreen initialMode="register" onNavigate={navigateTo} />
        </div>
      );
    }

    if (
      cleanRoute === 'signin' ||
      cleanRoute === 'login' ||
      cleanRoute.startsWith('invite') ||
      cleanRoute.startsWith('invites')
    ) {
      return (
        <div className="w-screen h-[100dvh] flex flex-col bg-background-darkest">
          <AuthScreen initialMode="login" onNavigate={navigateTo} />
        </div>
      );
    }

    // Default Web Root (/): Landing Page
    return (
      <div className="w-full h-[100dvh] overflow-y-auto overflow-x-hidden flex flex-col bg-background-darkest overscroll-contain">
        <LandingPage onNavigate={navigateTo} user={user} />
      </div>
    );
  }

  // Authenticated user on Web accessing root or download:
  if (!isElectron && !isCapacitor && cleanRoute === '') {
    return (
      <div className="w-full h-[100dvh] overflow-y-auto overflow-x-hidden flex flex-col bg-background-darkest overscroll-contain">
        <LandingPage onNavigate={navigateTo} user={user} />
      </div>
    );
  }

  if (cleanRoute === 'download') {
    return (
      <div className="w-full h-[100dvh] overflow-y-auto overflow-x-hidden flex flex-col bg-background-darkest overscroll-contain">
        <DownloadPage onNavigate={navigateTo} user={user} />
      </div>
    );
  }

  const connectedVoiceChannel = isConnected
    ? activeGuild?.channels?.find((c) => c.id === currentChannelId)
    : null;

  return (
    <div
      style={{
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
        top: `${viewportTop}px`,
        paddingTop: isCapacitor && typeof window !== 'undefined' && window.innerWidth < 768 ? 'max(env(safe-area-inset-top, 0px), 28px)' : undefined,
      }}
      className="fixed inset-x-0 bottom-auto w-full flex flex-col bg-background-dark overflow-hidden select-none"
    >
      <TitleBar />
      <NetworkStatusBanner />
      <StreamerModeBanner onOpenSettings={() => setIsProfileModalOpen(true)} />
      <div
        className="flex-1 flex w-full h-full overflow-hidden relative min-h-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Mobile Left Drawer Backdrop */}
        {(isMobileDrawerOpen || dragState?.drawer === 'left') && (
          <div
            style={{
              opacity:
                dragState?.drawer === 'left' && dragState.progress !== undefined
                  ? dragState.progress * 0.7
                  : isMobileDrawerOpen
                  ? 0.7
                  : 0,
              transition: dragState?.drawer === 'left' ? 'none' : 'opacity 0.25s ease',
            }}
            className="fixed inset-0 bg-black backdrop-blur-sm z-30 md:hidden"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
        )}

        {/* 1 & 2. Sidebars */}
        <div
          style={{
            width: typeof window !== 'undefined' && window.innerWidth < 768 ? undefined : `${72 + channelListWidth}px`,
            maxWidth: typeof window !== 'undefined' && window.innerWidth < 768 ? undefined : `${72 + channelListWidth}px`,
            transform:
              dragState?.drawer === 'left'
                ? `translateX(${dragState.offset}px)`
                : undefined,
            transition:
              dragState?.drawer === 'left'
                ? 'none'
                : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            paddingTop: isCapacitor && typeof window !== 'undefined' && window.innerWidth < 768 ? 'max(env(safe-area-inset-top, 0px), 28px)' : undefined,
          }}
          className={`fixed md:static inset-y-0 left-0 z-40 md:z-0 flex-shrink-0 flex flex-col h-full w-full md:w-auto min-w-0 overflow-hidden bg-background-darkest ${
            dragState?.drawer === 'left'
              ? ''
              : isMobileDrawerOpen
              ? 'translate-x-0'
              : '-translate-x-full md:translate-x-0'
          }`}
        >
          {/* Top Section: ServerList + Channels/DMs */}
          <div className="flex-1 flex flex-row min-h-0 overflow-hidden">
            {/* 1. Server List */}
            <ServerList
              isHomeActive={isHomeActive}
              onSelectHome={() => {
                setIsHomeActive(true);
                let targetPath = '/@me';
                try {
                  const saved = localStorage.getItem('zerovc_last_dm_target');
                  if (saved && (saved === '/@me' || saved.startsWith('/@me/'))) {
                    targetPath = saved;
                  }
                } catch {}
                navigateTo(targetPath);
                setIsMobileDrawerOpen(false);
              }}
              onSelectDM={(room) => {
                setIsHomeActive(true);
                setHomeView('dm');
                useDMStore.getState().selectRoom(room);
                navigateTo(`/@me/${room.id}`);
                setIsMobileDrawerOpen(false);
              }}
              onSelectGroup={(group) => {
                setIsHomeActive(true);
                setHomeView('group');
                useDMGroupStore.getState().selectGroup(group);
                navigateTo(`/@me/group/${group.id}`);
                setIsMobileDrawerOpen(false);
              }}
              onSelectGuild={async (guildId) => {
                const currentActive = useGuildStore.getState().activeGuild;
                if (!isHomeActive && currentActive?.id === guildId) {
                  setIsMobileDrawerOpen(false);
                  return;
                }
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
                onOpenUserProfile={(targetUser, pos) =>
                  setSelectedUserForProfile({ user: targetUser, position: pos, guild: null })
                }
                onOpenSettings={() => setIsProfileModalOpen(true)}
                onOpenScreenShare={() => setIsScreenShareOpen(true)}
                onOpenCreateGroup={() => {
                  setIsCreateDMGroupOpen(true);
                  setIsMobileDrawerOpen(false);
                }}
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
                  setCreateChannelType(type || 'text');
                  setCreateChannelCategoryId(categoryId);
                  setIsCreateChannelOpen(true);
                  setIsMobileDrawerOpen(false);
                }}
                onOpenCreateCategory={() => {
                  setIsCreateCategoryOpen(true);
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
                  handleToggleMemberList(true);
                }}
                onSelectUser={(targetUser, pos) => {
                  setSelectedUserForProfile({ user: targetUser, position: pos, guild: activeGuild });
                }}
                onOpenDM={async (userId) => {
                  setIsHomeActive(true);
                  setHomeView('dm');
                  setIsMobileDrawerOpen(false);
                  const room = await useDMStore.getState().openDMWithUser(userId);
                  if (room) {
                    navigateTo(`/@me/${room.id}`);
                  }
                }}
                onOpenScreenShare={() => {
                  setIsScreenShareOpen(true);
                  setIsMobileDrawerOpen(false);
                }}
                onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
              />
            )}
          </div>

          {/* Unified UserBar Footer extending across ServerList and ChannelList */}
          <UserBar
            onOpenSettings={() => setIsProfileModalOpen(true)}
            onOpenScreenShare={() => setIsScreenShareOpen(true)}
          />
        </div>

      {/* 3. Main Stage */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full min-w-0 min-h-0 relative">
        <ErrorBoundary>
          {isHomeActive ? (
            homeView === 'friends' ? (
              <FriendsView
                onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
                onOpenUserProfile={(targetUser, pos) =>
                  setSelectedUserForProfile({ user: targetUser, position: pos, guild: null })
                }
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
            ) : homeView === 'group' && activeGroup ? (
              <DMGroupChatArea
                onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
                onOpenUserProfile={(targetUser, pos) =>
                  setSelectedUserForProfile({ user: targetUser, position: pos, guild: null })
                }
                onPreviewImage={(url) => setPreviewImageUrl(url)}
                onOpenScreenShare={() => setIsScreenShareOpen(true)}
                onOpenDM={(userId) => {
                  setIsHomeActive(true);
                  setHomeView('dm');
                  setIsMobileDrawerOpen(false);
                }}
                onSelectFriends={() => {
                  setHomeView('friends');
                  navigateTo('/@me', true);
                }}
              />
            ) : homeView === 'dm' && activeRoom ? (
              <DMChatArea
                onOpenScreenShare={() => setIsScreenShareOpen(true)}
                onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
                onOpenUserProfile={(targetUser, pos) =>
                  setSelectedUserForProfile({ user: targetUser, position: pos, guild: null })
                }
                onPreviewImage={(url) => setPreviewImageUrl(url)}
              />
            ) : (
              <FriendsView
                onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
                onOpenUserProfile={(targetUser, pos) =>
                  setSelectedUserForProfile({ user: targetUser, position: pos, guild: null })
                }
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
            )
          ) : activeChannel?.type === 'voice' ? (
            <VoiceRoom
              channel={activeChannel}
              onOpenScreenShare={() => setIsScreenShareOpen(true)}
              onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
              onOpenUserProfile={(targetUser, pos) =>
                setSelectedUserForProfile({ user: targetUser, position: pos, guild: activeGuild })
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
            />
          ) : (
            <ChatArea
              onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
              onOpenUserProfile={(targetUser, pos) =>
                setSelectedUserForProfile({ user: targetUser, position: pos, guild: activeGuild })
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
              onToggleMemberList={handleToggleMemberList}
              isDraggingMemberList={dragState?.drawer === 'right'}
              memberListDragOffset={dragState?.drawer === 'right' ? dragState.offset : null}
              memberListDragProgress={dragState?.drawer === 'right' ? dragState.progress : null}
            />
          )}
        </ErrorBoundary>

        {/* Floating Live Screen PiP (Shown ONLY when someone in the call is actively sharing screen) */}
        {isConnected && (isHomeActive || activeChannel?.type !== 'voice' || activeChannel?.id !== currentChannelId) && (
          <VoiceFloatingPiP
            onNavigateToVoiceChannel={async (chId, gId) => {
              setIsHomeActive(false);
              if (gId && chId) {
                await useGuildStore.getState().selectGuild(gId, chId);
                navigateTo(`/${gId}/${chId}`);
              }
            }}
            onOpenUserProfile={(targetUser, pos) => {
              setSelectedUserForProfile({ user: targetUser, position: pos, guild: !isHomeActive ? activeGuild : null });
            }}
          />
        )}
      </div>

      {/* Modals with Suspense Lazy Loading */}
      <React.Suspense fallback={null}>
        <CreateServerModal
          isOpen={isCreateServerOpen}
          onClose={() => setIsCreateServerOpen(false)}
        />

        <CreateDMGroupModal
          isOpen={isCreateDMGroupOpen}
          onClose={() => setIsCreateDMGroupOpen(false)}
          onGroupCreated={(groupId) => {
            setIsHomeActive(true);
            setHomeView('group');
            navigateTo(`/@me/group/${groupId}`);
            useDMGroupStore.getState().selectGroupById(groupId);
          }}
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

        <CreateCategoryModal
          isOpen={isCreateCategoryOpen}
          onClose={() => setIsCreateCategoryOpen(false)}
        />

        <ScreenShareModal
          isOpen={isScreenShareOpen}
          onClose={() => setIsScreenShareOpen(false)}
        />

        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
        />

        <ErrorBoundary>
          <UserProfileModal
            user={selectedUserForProfile?.user || null}
            position={selectedUserForProfile?.position || null}
            guild={selectedUserForProfile?.guild ?? (!isHomeActive ? activeGuild : null)}
            isOpen={!!selectedUserForProfile}
            onClose={() => setSelectedUserForProfile(null)}
            onOpenFullProfile={(u, g) => {
              const targetGuild = g !== undefined ? g : (selectedUserForProfile?.guild ?? (!isHomeActive ? activeGuild : null));
              setSelectedUserForProfile(null);
              setFocusedUserProfile({ user: u, guild: targetGuild });
            }}
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
        </ErrorBoundary>

        <ErrorBoundary>
          <UserProfileModalFocus
            user={focusedUserProfile?.user || null}
            guild={focusedUserProfile?.guild || null}
            isOpen={!!focusedUserProfile}
            onClose={() => setFocusedUserProfile(null)}
            onOpenDM={async (userId) => {
              setFocusedUserProfile(null);
              setIsHomeActive(true);
              setHomeView('dm');
              setIsMobileDrawerOpen(false);
              const room = await useDMStore.getState().openDMWithUser(userId);
              if (room) {
                navigateTo(`/@me/${room.id}`);
              }
            }}
            onEditOwnProfile={() => {
              setFocusedUserProfile(null);
              setIsProfileModalOpen(true);
            }}
            onPreviewImage={(url) => {
              setPreviewImageUrl(url);
            }}
          />
        </ErrorBoundary>

        <ImageModal
          imageUrl={previewImageUrl}
          isOpen={!!previewImageUrl}
          onClose={() => setPreviewImageUrl(null)}
        />

        <ErrorBoundary>
          <ServerSettingsModal
            isOpen={isServerSettingsOpen}
            onClose={() => setIsServerSettingsOpen(false)}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ChannelSettingsModal
            channel={channelToEdit}
            isOpen={!!channelToEdit}
            onClose={() => setChannelToEdit(null)}
          />
        </ErrorBoundary>
      </React.Suspense>

      {/* Global Incoming Call Popup */}
      <IncomingCallModal />
      </div>
    </div>
  );
};
