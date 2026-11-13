import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Camera,
  Sparkles,
  Check,
  LogOut,
  Mic,
  Volume2,
  Lock,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  Loader2,
  Laptop,
  Smile,
  FileText,
  Edit3,
  Pencil,
  ArrowLeft,
  Keyboard,
  Key,
  Download,
  Trash2,
  Sliders,
  Palette,
  Bell,
  Shield,
  Play,
  Video,
  VideoOff,
  Monitor,
  Radio,
  Tv,
  Sun,
  Moon,
  VolumeX,
  ChevronDown,
  ChevronRight,
  Brain,
  Globe,
  Activity,
  Gamepad2,
  Zap,
  Gauge,
  Headphones,
  Smartphone,
  Bot,
  Hash,
  Send,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { UserAvatar } from '../Common/UserAvatar';
import { DropdownSelect } from '../Common/DropdownSelect';
import {
  useSettingsStore,
  ThemeMode,
  AccentColor,
  ChatDensity,
  DmPrivacy,
  AudioProcessingMode,
  RNNoiseLevel,
} from '../../stores/settingsStore';
import { audioProcessor } from '../../lib/audioProcessor';
import { pushBackHandler } from '../../lib/mobileBackHandler';
import { setMobileMicTesting } from '../../lib/audioRouting';

import { livekit } from '../../lib/livekit';
import { api, formatAssetUrl } from '../../lib/api';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_TITLE_CLASS,
  MODAL_CARD_PADDING_CLASS,
  MODAL_ITEM_ROW_PADDING_CLASS,
  MODAL_DIVIDER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_SECONDARY_BUTTON_CLASS,
  MODAL_PRIMARY_BUTTON_CLASS,
  MODAL_DANGER_BUTTON_CLASS,
  MODAL_SWITCH_CONTAINER_CLASS,
  MODAL_SWITCH_KNOB_CLASS,
} from '../../constants/modalTypography';
import { isElectron } from '../../lib/platform';
import { AccountSubModals, AccountSubModalType } from './ProfileSettings/AccountSubModals';
import { ImageCropModal } from './ImageCropModal';
import { KeybindSettingsView } from './KeybindSettingsView';
import { SessionsSettingsView } from './SessionsSettingsView';
import { AccessibilitySettingsView } from './AccessibilitySettingsView';
import { RegisteredGamesView } from './RegisteredGamesView';
import { ActivityPrivacySettingsView } from './ActivityPrivacySettingsView';
import { StreamerModeTab } from './ProfileSettings/StreamerModeTab';
import { useStreamerModeStore } from '../../stores/streamerModeStore';
import { SecurityView } from './SecurityView';
import { NotificationsSettingsView } from './NotificationsSettingsView';
import { PreferencesSettingsView } from './PreferencesSettingsView';

const FONT_SIZE_STEPS = [
  { value: 12, label: '12px (Compacto)' },
  { value: 14, label: '14px (Padrão)' },
  { value: 18, label: '18px (Grande)' },
  { value: 22, label: '22px (Extra Grande)' },
];

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?:
    | 'account'
    | 'profile'
    | 'privacy'
    | 'sessions'
    | 'registered_games'
    | 'activity_privacy'
    | 'appearance'
    | 'accessibility'
    | 'audio'
    | 'notifications'
    | 'streamer_mode'
    | 'preferences'
    | 'keybinds';
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, initialTab }) => {
  const { user, updateProfile, logout, setUser } = useAuthStore();
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const [activeTab, setActiveTab] = useState<
    | 'account'
    | 'profile'
    | 'privacy'
    | 'sessions'
    | 'registered_games'
    | 'activity_privacy'
    | 'appearance'
    | 'accessibility'
    | 'audio'
    | 'notifications'
    | 'streamer_mode'
    | 'preferences'
    | 'keybinds'
  >('account');

  // Mobile full-screen drilldown navigation state ('menu' -> 'content')
  const [mobileView, setMobileView] = useState<'menu' | 'content'>('menu');
  const isMobileDevice = typeof window !== 'undefined' && (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    Boolean((window as any).Capacitor?.isNativePlatform?.() || (window as any).Capacitor !== undefined) ||
    window.innerWidth < 768
  );

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
        setMobileView('content');
      } else {
        setMobileView('menu');
      }
      initialHwAccelRef.current = hardwareAcceleration;
    }
  }, [isOpen, initialTab]);

  // Crop Modal State
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'banner'>('avatar');
  const [isCropOpen, setIsCropOpen] = useState(false);

  // Profile Form Fields
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bannerUrl, setBannerUrl] = useState(user?.banner_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
  const [status, setStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>(user?.status || 'online');
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [bioSuccess, setBioSuccess] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  // Account Submodals & Reveal States
  const [revealEmail, setRevealEmail] = useState(false);
  const [revealPhone, setRevealPhone] = useState(false);

  const [activeAccountModal, setActiveAccountModal] = useState<AccountSubModalType>(null);

  // Export Data (LGPD/GDPR)
  const [isExportingData, setIsExportingData] = useState(false);

  const modalContainerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: save/restore trigger focus when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      requestAnimationFrame(() => {
        if (
          modalContainerRef.current &&
          !modalContainerRef.current.contains(document.activeElement)
        ) {
          modalContainerRef.current.focus();
        }
      });
      return () => {
        previousFocusRef.current?.focus();
        previousFocusRef.current = null;
      };
    }
  }, [isOpen]);

  // Desktop ESC key & lightweight Tab focus-trap handling
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCropOpen) {
          setIsCropOpen(false);
          return;
        }
        if (activeAccountModal) {
          setActiveAccountModal(null);
          return;
        }
        onClose();
        return;
      }

      if (e.key === 'Tab' && !isCropOpen && !activeAccountModal && modalContainerRef.current) {
        const focusables = Array.from(
          modalContainerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (
            document.activeElement === first ||
            !modalContainerRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            last.focus();
          }
        } else if (
          document.activeElement === last ||
          !modalContainerRef.current.contains(document.activeElement)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isCropOpen, activeAccountModal]);

  // Hardware Back Button integration for mobile
  useEffect(() => {
    if (!isOpen) return;

    const unregister = pushBackHandler('profile_modal', () => {
      if (isCropOpen) {
        setIsCropOpen(false);
        return true;
      }
      if (activeAccountModal) {
        setActiveAccountModal(null);
        return true;
      }
      if (mobileView === 'content') {
        setMobileView('menu');
        return true;
      }
      onClose();
      return true;
    });

    return () => {
      unregister();
    };
  }, [isOpen, mobileView, isCropOpen, activeAccountModal, onClose]);

  // Audio / Device Fields
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>(() => {
    try {
      return localStorage.getItem('zerovc_audio_input_device') || '';
    } catch {
      return '';
    }
  });
  const [selectedOutput, setSelectedOutput] = useState<string>(() => {
    try {
      return localStorage.getItem('zerovc_audio_output_device') || '';
    } catch {
      return '';
    }
  });
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const liveGainNodeRef = useRef<GainNode | null>(null);

  // Settings Store
  const {
    theme,
    accentColor,
    chatDensity,
    uiZoom,
    autoplayGifs,
    minimizeToTray,
    autoStart,
    hardwareAcceleration,
    soundsEnabled,
    soundVolume,
    soundChannelEvents,
    soundUserJoinLeave,
    soundStreamEvents,
    soundMuteEvents,
    soundMessageEvents,
    notificationsDesktop,
    hapticFeedback,
    audioProcessingMode,
    rnnoiseLevel,
    vadAutoSensitivity,
    vadSensitivity,
    vadHangover,
    echoCancellation,
    noiseSuppression,
    autoGainControl,
    dmPrivacy,
    setTheme,
    setAccentColor,
    setChatDensity,
    setUiZoom,
    setAutoplayGifs,
    setMinimizeToTray,
    setAutoStart,
    setHardwareAcceleration,
    setSoundsEnabled,
    setSoundVolume,
    setSoundChannelEvents,
    setSoundUserJoinLeave,
    setSoundStreamEvents,
    setSoundMuteEvents,
    setSoundMessageEvents,
    setNotificationsDesktop,
    setHapticFeedback,
    setAudioProcessingMode,
    setRnnoiseLevel,
    setVadAutoSensitivity,
    setVadSensitivity,
    setVadHangover,
    setEchoCancellation,
    setNoiseSuppression,
    setAutoGainControl,
    setDmPrivacy,
    inputMode,
    inputVolume,
    outputVolume,
    showVoiceUsersInBar,
    chatFontSize,
    setInputMode,
    setInputVolume,
    setOutputVolume,
    setShowVoiceUsersInBar,
    setChatFontSize,
    setAudioInputDevice,
    setAudioOutputDevice,
  } = useSettingsStore();

  useEffect(() => {
    const handleInputChanged = (e: any) => {
      if (e.detail?.deviceId !== undefined) {
        setSelectedInput(e.detail.deviceId);
      }
    };
    const handleOutputChanged = (e: any) => {
      if (e.detail?.deviceId !== undefined) {
        setSelectedOutput(e.detail.deviceId);
      }
    };
    window.addEventListener('zerovc:audio-input-device-changed', handleInputChanged);
    window.addEventListener('zerovc:audio-output-device-changed', handleOutputChanged);
    return () => {
      window.removeEventListener('zerovc:audio-input-device-changed', handleInputChanged);
      window.removeEventListener('zerovc:audio-output-device-changed', handleOutputChanged);
    };
  }, []);

  useEffect(() => {
    if (liveGainNodeRef.current) {
      liveGainNodeRef.current.gain.value = (inputVolume ?? 100) / 100;
    }
  }, [inputVolume]);

  const currentFontSizeIndex = useMemo(() => {
    const exactIndex = FONT_SIZE_STEPS.findIndex((s) => s.value === chatFontSize);
    if (exactIndex !== -1) return exactIndex;
    let closestIdx = 1;
    let minDiff = Infinity;
    FONT_SIZE_STEPS.forEach((step, idx) => {
      const diff = Math.abs(step.value - chatFontSize);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    return closestIdx;
  }, [chatFontSize]);

  const initialHwAccelRef = useRef(hardwareAcceleration);
  const hasHwAccelChanged = hardwareAcceleration !== initialHwAccelRef.current;

  // Audio Processing Dropdown & Live VAD state
  const [isProcDropdownOpen, setIsProcDropdownOpen] = useState(false);
  const [vadLiveState, setVadLiveState] = useState({
    isSpeaking: false,
    volume: 0,
    speechProbability: 0,
    gateOpen: false,
  });

  // Video devices & camera testing
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>(() => {
    try {
      return localStorage.getItem('zerovc_video_device') || '';
    } catch {
      return '';
    }
  });
  const [isTestingCamera, setIsTestingCamera] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const startCameraTest = async () => {
    try {
      setIsTestingCamera(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true,
      });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Failed to start camera test:', err);
      setIsTestingCamera(false);
    }
  };

  const stopCameraTest = () => {
    setIsTestingCamera(false);
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  };

  const loadMediaDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some((d) => (d.kind === 'audioinput' || d.kind === 'videoinput') && d.label !== '');

      // Probe permission briefly if labels are hidden
      if (!hasLabels && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(async () => null);
          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
          }
        } catch {}
      }

      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      const videos = devices.filter((d) => d.kind === 'videoinput');

      setAudioInputs(inputs);
      setAudioOutputs(outputs);
      setVideoDevices(videos);

      const savedInput = localStorage.getItem('zerovc_audio_input_device');
      if (savedInput && inputs.some((d) => d.deviceId === savedInput)) {
        setSelectedInput(savedInput);
      } else if (inputs.length > 0 && !selectedInput) {
        setSelectedInput(inputs[0].deviceId);
      }

      const savedOutput = localStorage.getItem('zerovc_audio_output_device');
      if (savedOutput && outputs.some((d) => d.deviceId === savedOutput)) {
        setSelectedOutput(savedOutput);
      } else if (outputs.length > 0 && !selectedOutput) {
        setSelectedOutput(outputs[0].deviceId);
      }

      const savedVideo = localStorage.getItem('zerovc_video_device');
      if (savedVideo && videos.some((d) => d.deviceId === savedVideo)) {
        setSelectedVideoDevice(savedVideo);
      } else if (videos.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videos[0].deviceId);
      }
    } catch (err) {
      console.warn('[ProfileModal] Error enumerating media devices:', err);
    }
  };

  // Load media devices & sync user state
  useEffect(() => {
    if (isOpen && user) {
      setDisplayName(user.display_name || '');
      setAvatarUrl(user.avatar_url || '');
      setBannerUrl(user.banner_url || '');
      setBio(user.bio || '');
      setCustomStatus(user.custom_status || '');
      setStatus(user.status || 'online');

      loadMediaDevices();
      navigator.mediaDevices?.addEventListener?.('devicechange', loadMediaDevices);
    } else {
      stopMicTest();
      stopCameraTest();
    }

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadMediaDevices);
    };
  }, [isOpen, user]);

  const streamerModeActive = useStreamerModeStore((s) => s.enabled && s.hidePersonalData);

  // Masking helpers
  const getMaskedEmail = (email?: string) => {
    if (!email) return 'Não informado';
    if (streamerModeActive) return '••••••••••••@•••••••';
    if (revealEmail) return email;
    const parts = email.split('@');
    if (parts.length !== 2) return '••••••••••••';
    const name = parts[0];
    const domain = parts[1];
    const maskedName = name.length > 2 ? name[0] + '••••••' + name.slice(-1) : '••••••';
    return `${maskedName}@${domain}`;
  };

  const getMaskedPhone = (phone?: string) => {
    if (!phone) return 'Nenhum adicionado';
    if (revealPhone) return phone;
    return `(••) •••••-••${phone.slice(-2)}`;
  };

  // Avatar / Banner Cropping & Direct Upload
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropType('avatar');
    setIsCropOpen(true);
    e.target.value = '';
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropType('banner');
    setIsCropOpen(true);
    e.target.value = '';
  };

  const handleCropConfirmed = async (croppedFile: File) => {
    setIsCropOpen(false);
    if (cropType === 'avatar') {
      setIsUploadingAvatar(true);
      try {
        const res = await api.upload.avatar(croppedFile);
        setAvatarUrl(res.url);
        await updateProfile({ avatar_url: res.url });
      } catch (err) {
        console.error('Failed to upload avatar:', err);
      } finally {
        setIsUploadingAvatar(false);
      }
    } else {
      setIsUploadingBanner(true);
      try {
        const res = await api.upload.banner(croppedFile);
        setBannerUrl(res.url);
        await updateProfile({ banner_url: res.url });
      } catch (err) {
        console.error('Failed to upload banner:', err);
      } finally {
        setIsUploadingBanner(false);
      }
    }
  };

  // Save Bio & Custom Status
  const handleSaveBioAndStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBio(true);
    try {
      await updateProfile({
        bio: bio.trim(),
        custom_status: customStatus.trim(),
        status,
      });
      setBioSuccess(true);
      setTimeout(() => setBioSuccess(false), 2500);
    } catch (err: any) {
      console.error('Failed to update bio & status:', err);
    } finally {
      setIsSavingBio(false);
    }
  };

  // Status quick change
  const handleStatusChange = async (newStatus: 'online' | 'idle' | 'dnd' | 'offline') => {
    setStatus(newStatus);
    try {
      await updateProfile({ status: newStatus });
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const handleExportData = async () => {
    setIsExportingData(true);
    try {
      const data = await api.auth.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zerovc-data-${user?.username || 'user'}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Erro ao exportar dados da conta.');
    } finally {
      setIsExportingData(false);
    }
  };

  // Mic test logic with real-time AudioProcessor (WebRTC / RNNoise / Silero VAD)
  const startMicTest = async () => {
    try {
      setIsTestingMic(true);
      setMobileMicTesting(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInput ? { deviceId: { exact: selectedInput } } : true,
      });
      micStreamRef.current = stream;

      audioProcessor.setVadCallback((data) => {
        setMicLevel(data.volume);
        setVadLiveState(data);
      });

      const track = stream.getAudioTracks()[0];
      if (track) {
        await audioProcessor.processMicrophoneTrack(track, {
          mode: audioProcessingMode,
          rnnoiseLevel,
          vadAutoSensitivity,
          vadSensitivity,
          vadHangover,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
          volume: inputVolume,
        });
      }
    } catch (err) {
      console.error('Failed to start mic test:', err);
      setIsTestingMic(false);
      setMobileMicTesting(false);
    }
  };

  const stopMicTest = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    audioProcessor.setVadCallback(null);
    audioProcessor.cleanup();
    setIsTestingMic(false);
    setMobileMicTesting(false);
    setMicLevel(0);
    setVadLiveState({ isSpeaking: false, volume: 0, speechProbability: 0, gateOpen: false });
  };

  // Live mic volume monitoring for input sensitivity preview
  useEffect(() => {
    if (!isOpen || activeTab !== 'audio' || isTestingMic) return;

    let localAudioCtx: AudioContext | null = null;
    let localStream: MediaStream | null = null;
    let localAnim: number | null = null;
    let isMounted = true;

    const startLiveMonitor = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedInput ? { deviceId: { exact: selectedInput } } : true,
        });
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStream = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        localAudioCtx = new AudioCtx();
        if (localAudioCtx.state === 'suspended') {
          await localAudioCtx.resume();
        }

        const source = localAudioCtx.createMediaStreamSource(stream);
        const gainNode = localAudioCtx.createGain();
        gainNode.gain.value = (inputVolume ?? 100) / 100;
        liveGainNodeRef.current = gainNode;

        const analyser = localAudioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(gainNode);
        gainNode.connect(analyser);

        const timeData = new Float32Array(analyser.fftSize);
        let smoothed = 0;
        let lastVoiceTime = 0;
        let isSpeaking = false;

        const tick = () => {
          if (!isMounted) return;
          analyser.getFloatTimeDomainData(timeData);

          let sumSquares = 0;
          for (let i = 0; i < timeData.length; i++) {
            const sample = timeData[i];
            sumSquares += sample * sample;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);

          // Decibel scale: -100 dBFS (silence) to 0 dBFS (peak) mapped directly to 0..100%
          const db = 20 * Math.log10(Math.max(rms, 1e-5));
          const currentLevelRaw = Math.max(0, Math.min(100, Math.round(db + 100)));

          // Smooth transitions for natural meter response (fast attack, smooth release)
          const smoothingFactor = currentLevelRaw > smoothed ? 0.45 : 0.2;
          smoothed = smoothed * (1 - smoothingFactor) + currentLevelRaw * smoothingFactor;
          const currentLevel = Math.round(smoothed);
          setMicLevel(currentLevel);

          const now = performance.now();
          const speechThreshold = (vadSensitivity ?? 0.5) * 100;
          const isVocalDetected = currentLevel >= (vadAutoSensitivity ? 48 : speechThreshold);

          if (isVocalDetected) {
            lastVoiceTime = now;
            isSpeaking = true;
          } else if (now - lastVoiceTime > (vadHangover ?? 250)) {
            isSpeaking = false;
          }

          setVadLiveState({
            isSpeaking,
            volume: currentLevel,
            speechProbability: isSpeaking ? 1.0 : 0.0,
            gateOpen: isSpeaking,
          });

          localAnim = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // Microphone permission or device busy
      }
    };

    startLiveMonitor();

    return () => {
      isMounted = false;
      if (localAnim) cancelAnimationFrame(localAnim);
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (localAudioCtx && localAudioCtx.state !== 'closed') {
        localAudioCtx.close().catch(() => {});
      }
      liveGainNodeRef.current = null;
      setMicLevel(0);
    };
  }, [isOpen, activeTab, isTestingMic, selectedInput]);

  const handleDeviceChange = async (type: 'input' | 'output' | 'video', deviceId: string) => {
    if (type === 'input') {
      setSelectedInput(deviceId);
      await setAudioInputDevice(deviceId);
      if (isTestingMic) {
        stopMicTest();
        setTimeout(startMicTest, 100);
      }
    } else if (type === 'output') {
      setSelectedOutput(deviceId);
      await setAudioOutputDevice(deviceId);
    } else if (type === 'video') {
      setSelectedVideoDevice(deviceId);
      try {
        localStorage.setItem('zerovc_video_device', deviceId);
      } catch {}
      await livekit.setVideoInputDevice(deviceId);
      if (isTestingCamera) {
        stopCameraTest();
        setTimeout(startCameraTest, 100);
      }
    }
  };

  const handleInputModeChange = (mode: 'activity' | 'ptt') => {
    setInputMode(mode);
    try {
      localStorage.setItem('zerovc_input_mode', mode);
    } catch {}
  };

  if (!isOpen || !user) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-0 md:p-4 md:pt-10 overflow-hidden animate-in fade-in"
    >
      {/* Unified Container (Full-screen on mobile, matching ServerSettingsModal on desktop) */}
      <div
        ref={modalContainerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        tabIndex={-1}
        className={`flex flex-col md:flex-row w-full h-full md:max-w-5xl md:h-[88vh] md:max-h-[92dvh] md:my-auto bg-background-dark rounded-none md:rounded-xl shadow-2xl border-0 md:border md:border-white/10 overflow-hidden text-gray-200 focus:outline-none ${reducedMotion ? '' : 'animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none'}`}
      >
        
        {/* ======================================================== */}
        {/* MOBILE MENU VIEW (Visible only on mobile when mobileView === 'menu') */}
        {/* ======================================================== */}
        {mobileView === 'menu' && (
          <div className="flex md:hidden flex-col w-full h-full bg-background-dark overflow-hidden">
            {/* Mobile Header */}
            <div
              style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
              className="px-4 pb-3.5 border-b border-white/5 bg-background-darker/70 flex items-center justify-between flex-shrink-0"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  className="p-2 -ml-1 text-gray-400 hover:text-white rounded-xl active:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
                <h2 className={MODAL_DIALOG_TITLE_CLASS}>Configurações</h2>
              </div>
            </div>

            {/* Mobile Navigation List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 overscroll-contain touch-pan-y chat-scrollbar">
              {/* User Mini Profile Card */}
              <div
                onClick={() => {
                  setActiveTab('account');
                  setMobileView('content');
                }}
                className="p-3.5 bg-background-darker rounded-2xl border border-white/5 flex items-center justify-between cursor-pointer active:bg-white/5 transition-colors shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-brand-500 overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-bold text-lg shadow">
                    {user.avatar_url ? (
                      <img src={formatAssetUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{user.display_name?.[0]?.toUpperCase() || user.username[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{user.display_name || user.username}</h3>
                    <p className="text-xs text-gray-400 font-mono truncate">@{user.username}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
              </div>

              {/* Group 1: Configurações de Usuário */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                  Configurações de Usuário
                </span>
                <div className="bg-background-darker rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('account');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Minha Conta</div>
                      <div className="text-xs text-gray-400">Perfil, avatar, display name, dados</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('privacy');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Privacidade e Segurança</div>
                      <div className="text-xs text-gray-400">E-mail, senha, 2FA, criptografia E2EE e dados</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('sessions');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Dispositivos & Sessões</div>
                      <div className="text-xs text-gray-400">Aparelhos conectados, encerrar sessões</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Group: Configurações de Atividade */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                  Configurações de Atividade
                </span>
                <div className="bg-background-darker rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('registered_games');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Jogos Registrados</div>
                      <div className="text-xs text-gray-400">Jogos detectados e customizados</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('activity_privacy');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Privacidade de Atividade</div>
                      <div className="text-xs text-gray-400">Exibição de status e detecção de jogos</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Group 2: Configurações do App */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 block">
                  Configurações do App
                </span>
                <div className="bg-background-darker rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('appearance');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Aparência</div>
                      <div className="text-xs text-gray-400">Temas, cores, densidade, escala</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('accessibility');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Acessibilidade</div>
                      <div className="text-xs text-gray-400">Tamanho do texto, contraste, movimento</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('audio');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Voz & Vídeo</div>
                      <div className="text-xs text-gray-400">Microfone, autofalante, câmera, VAD</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('notifications');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Notificações & Sons</div>
                      <div className="text-xs text-gray-400">Sons do sistema, alertas na área de trabalho</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('streamer_mode');
                      setMobileView('content');
                    }}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">Modo Streamer</div>
                      <div className="text-xs text-gray-400">Proteção de dados, censura e silêncio em transmissões</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Group 3: Sair da Conta */}
              <div className="pt-2">
                <div className="bg-background-darker rounded-2xl border border-white/5 overflow-hidden">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-red-500/10 active:bg-red-500/20 text-red-400 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Sair da Conta</div>
                      <div className="text-xs text-red-400/70">Desconectar desta sessão</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-red-400/50 shrink-0" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* DESKTOP SIDEBAR (Visible on md: and above) */}
        {/* ======================================================== */}
        <div className="hidden md:flex w-60 bg-background-darkest border-r border-white/10 flex-col p-3 shrink-0 overflow-y-auto chat-scrollbar justify-between">
          <div className="flex flex-col items-stretch gap-0.5 flex-1 flex-shrink-0">
            <nav className="flex flex-col items-stretch gap-0.5 flex-1 flex-shrink-0">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2.5 mb-1 mt-1">
                Configurações de Usuário
              </span>

              {/* Tab: Minha Conta */}
              <button
                type="button"
                onClick={() => setActiveTab('account')}
                aria-current={activeTab === 'account' || activeTab === 'profile' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'account' || activeTab === 'profile'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Minha Conta</span>
              </button>

              {/* Tab: Privacidade e Segurança */}
              <button
                type="button"
                onClick={() => setActiveTab('privacy')}
                aria-current={activeTab === 'privacy' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'privacy'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Privacidade e Segurança</span>
              </button>

              {/* Tab: Dispositivos & Sessões */}
              <button
                type="button"
                onClick={() => setActiveTab('sessions')}
                aria-current={activeTab === 'sessions' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'sessions'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Dispositivos & Sessões</span>
              </button>

              <div className="h-[1px] bg-white/10 my-2 mx-1" />

              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2.5 mb-1 mt-1">
                Configurações de Atividade
              </span>

              {/* Tab: Jogos Registrados */}
              <button
                type="button"
                onClick={() => setActiveTab('registered_games')}
                aria-current={activeTab === 'registered_games' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'registered_games'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Jogos Registrados</span>
              </button>

              {/* Tab: Privacidade de Atividade */}
              <button
                type="button"
                onClick={() => setActiveTab('activity_privacy')}
                aria-current={activeTab === 'activity_privacy' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'activity_privacy'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Privacidade de Atividade</span>
              </button>

              <div className="h-[1px] bg-white/10 my-2 mx-1" />

              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2.5 mb-1 mt-1">
                Configurações do App
              </span>

              {/* Tab: Aparência */}
              <button
                type="button"
                onClick={() => setActiveTab('appearance')}
                aria-current={activeTab === 'appearance' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'appearance'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Aparência</span>
              </button>

              {/* Tab: Acessibilidade */}
              <button
                type="button"
                onClick={() => setActiveTab('accessibility')}
                aria-current={activeTab === 'accessibility' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'accessibility'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Acessibilidade</span>
              </button>

              {/* Tab: Voz & Vídeo */}
              <button
                type="button"
                onClick={() => setActiveTab('audio')}
                aria-current={activeTab === 'audio' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'audio'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Voz & Vídeo</span>
              </button>

              {/* Tab: Notificações & Sons */}
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                aria-current={activeTab === 'notifications' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'notifications'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Notificações & Sons</span>
              </button>

              {/* Tab: Modo Streamer */}
              <button
                type="button"
                onClick={() => setActiveTab('streamer_mode')}
                aria-current={activeTab === 'streamer_mode' ? 'page' : undefined}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'streamer_mode'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Modo Streamer</span>
                {useStreamerModeStore.getState().enabled && (
                  <span
                    className={`w-2 h-2 rounded-full bg-brand-500 ${
                      reducedMotion ? '' : 'animate-pulse motion-reduce:animate-none'
                    }`}
                  />
                )}
              </button>

              {/* Tab: Preferências */}
              <button
                type="button"
                onClick={() => setActiveTab('preferences')}
                aria-current={activeTab === 'preferences' ? 'page' : undefined}
                className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  activeTab === 'preferences'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <span>Preferências</span>
              </button>

              {/* Tab: Atalhos do Teclado (Apenas Electron) */}
              {isElectron() && (
                <button
                  type="button"
                  onClick={() => setActiveTab('keybinds')}
                  aria-current={activeTab === 'keybinds' ? 'page' : undefined}
                  className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    activeTab === 'keybinds'
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <span>Atalhos do Teclado</span>
                </button>
              )}
            </nav>
          </div>

          {/* Bottom Logout */}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-1 flex-shrink-0 mt-auto">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MAIN CONTENT AREA (Visible on desktop OR on mobile when mobileView === 'content') */}
        {/* ======================================================== */}
        <div className={`${mobileView === 'content' ? 'flex' : 'hidden md:flex'} flex-1 flex-col overflow-hidden bg-background-dark relative min-w-0 min-h-0`}>
          
          {/* Mobile Drilldown Top Bar (Back Arrow + Title + Close) */}
          <div
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
            className="flex md:hidden items-center justify-between px-4 pb-3.5 border-b border-white/10 bg-background-darkest flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileView('menu')}
                aria-label="Voltar"
                className="p-2 -ml-1 text-gray-300 hover:text-white rounded-xl active:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Voltar</span>
              </button>
            </div>
            <h2 className="text-sm font-bold text-white truncate max-w-[180px]">
              {activeTab === 'account' && 'Minha Conta'}
              {activeTab === 'profile' && 'Perfil de Usuário'}
              {activeTab === 'privacy' && 'Privacidade e Segurança'}
              {activeTab === 'sessions' && 'Sessões & Dispositivos'}
              {activeTab === 'registered_games' && 'Jogos Registrados'}
              {activeTab === 'activity_privacy' && 'Privacidade de Atividade'}
              {activeTab === 'appearance' && 'Aparência'}
              {activeTab === 'accessibility' && 'Acessibilidade'}
              {activeTab === 'audio' && 'Voz & Vídeo'}
              {activeTab === 'notifications' && 'Notificações'}
              {activeTab === 'streamer_mode' && 'Modo Streamer'}
              {activeTab === 'preferences' && 'Preferências'}
              {activeTab === 'keybinds' && 'Atalhos'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 text-gray-400 hover:text-white rounded-xl active:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop Top Header */}
          <div className="hidden md:flex items-center justify-between px-4 sm:px-8 py-3 sm:py-5 border-b border-white/10 shrink-0 bg-background-darker/40">
            <div className="flex items-center gap-3">
              {activeTab === 'profile' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('account')}
                  aria-label="Voltar para Minha Conta"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  title="Voltar para Minha Conta"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>
              )}
              <div>
                <h1 id="profile-modal-title" className={`${MODAL_TITLE_CLASS} flex items-center gap-2`}>
                  {activeTab === 'account' && 'Minha Conta e Perfil'}
                  {activeTab === 'profile' && 'Perfil de Usuário'}
                  {activeTab === 'privacy' && 'Privacidade e Segurança'}
                  {activeTab === 'sessions' && 'Sessões Ativas e Dispositivos'}
                  {activeTab === 'registered_games' && 'Jogos Registrados'}
                  {activeTab === 'activity_privacy' && 'Privacidade de Atividade'}
                  {activeTab === 'appearance' && 'Aparência & Customização'}
                  {activeTab === 'accessibility' && 'Central de Acessibilidade'}
                  {activeTab === 'audio' && 'Voz & Vídeo'}
                  {activeTab === 'notifications' && 'Notificações & Sons'}
                  {activeTab === 'streamer_mode' && 'Modo Streamer'}
                  {activeTab === 'preferences' && 'Preferências do Sistema'}
                  {activeTab === 'keybinds' && 'Atalhos do Teclado'}
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeTab === 'account' && 'Personalize seu perfil, avatar, banner, nome de exibição e recado.'}
                  {activeTab === 'profile' && 'Personalize seu avatar, banner, nome de exibição e recado.'}
                  {activeTab === 'privacy' && 'Gerencie credenciais de acesso, e-mail, senha, autenticação 2FA, criptografia E2EE e dados.'}
                  {activeTab === 'sessions' && 'Visualize aparelhos conectados e encerre sessões ativas remotamente.'}
                  {activeTab === 'registered_games' && 'Gerencie jogos detectados no seu computador, adicione jogos customizados e controle status.'}
                  {activeTab === 'activity_privacy' && 'Configure a exibição de status de jogo e detecção automática de processos em segundo plano.'}
                  {activeTab === 'appearance' && 'Personalize temas visuais, cores de destaque, densidade e zoom.'}
                  {activeTab === 'accessibility' && 'Ajuste escala tipográfica do chat, alto contraste, redução de movimento, daltonismo e TTS.'}
                  {activeTab === 'audio' && 'Ajuste dispositivos, microfone, webcam e filtros avançados de áudio WebRTC.'}
                  {activeTab === 'notifications' && 'Configure sons do sistema, alertas sonoros e notificações na área de trabalho.'}
                  {activeTab === 'streamer_mode' && 'Proteja suas informações pessoais, censure nomes de usuários e silencie alertas ao transmitir.'}
                  {activeTab === 'preferences' && 'Configure o comportamento da janela, inicialização e integração com o sistema.'}
                  {activeTab === 'keybinds' && 'Configure atalhos rápidos e Push-to-Talk globais para controle de voz.'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Fechar configurações"
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title="Fechar Configurações (ESC)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Hidden File Inputs for Avatar and Banner */}
          <input
            ref={bannerFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerUpload}
            className="hidden"
          />
          <input
            ref={avatarFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="hidden"
          />

          {/* Scrollable Tab Content Container */}
          <div className="flex-1 p-4 sm:p-8 overflow-y-auto chat-scrollbar space-y-5 min-h-0 overscroll-contain touch-pan-y">
            {/* TAB 1: MINHA CONTA (UNIFIED WITH PROFILE CUSTOMIZATION) */}
            {activeTab === 'account' && (
              <div className="space-y-5 animate-in fade-in">
                {/* Profile Top Banner Card with Clickable Banner & Avatar Upload */}
                <div className="rounded-3xl overflow-hidden bg-background-darker border border-white/5 shadow-lg relative">
                  {/* Banner (Interactive / Click to Upload) */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Alterar imagem de banner do perfil"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') bannerFileInputRef.current?.click(); }}
                    className="w-full h-28 sm:h-32 bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 relative group cursor-pointer bg-cover bg-center flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    style={{ backgroundImage: user.banner_url ? `url(${formatAssetUrl(user.banner_url)})` : undefined }}
                    onClick={() => bannerFileInputRef.current?.click()}
                    title="Clique para alterar seu banner"
                  >
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-semibold backdrop-blur-xs">
                      <Camera className="w-4 h-4" />
                      <span>{isUploadingBanner ? 'Processando Banner...' : 'Alterar Banner'}</span>
                    </div>
                  </div>

                  {/* Header Row: Avatar + Name */}
                  <div className="px-6 pb-4 pt-0 bg-background-darker">
                    <div className="flex items-end gap-4 -mt-12">
                      {/* Avatar (Interactive / Click to Upload) */}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Alterar imagem de avatar do perfil"
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') avatarFileInputRef.current?.click(); }}
                        className="w-24 h-24 rounded-full border-4 border-background-darker bg-brand-500 overflow-hidden shadow-2xl flex-shrink-0 flex items-center justify-center text-white font-bold text-3xl relative group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                        onClick={() => avatarFileInputRef.current?.click()}
                        title="Clique para alterar seu avatar"
                      >
                        {user.avatar_url ? (
                          <img
                            src={formatAssetUrl(user.avatar_url)}
                            alt={`Avatar de ${user.display_name || user.username}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}</span>
                        )}

                        {/* Camera Overlay on Hover */}
                        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-0.5">
                          <Camera className="w-5 h-5" />
                          <span className="text-[9px] font-bold uppercase tracking-wider">{isUploadingAvatar ? '...' : 'Mudar'}</span>
                        </div>
                      </div>

                      {/* Name & Username tag cleanly aligned in dark area */}
                      <div className="pt-2 pb-0.5 min-w-0">
                        <h4 className="text-lg font-bold text-white leading-tight tracking-tight truncate">
                          {user.display_name || user.username}
                        </h4>
                        <span className="text-xs text-gray-400 font-mono font-medium block mt-0.5">
                          @{user.username}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Group 1: Informações da Conta */}
                  <div className="px-6 pb-5 pt-3 space-y-3.5 border-t border-white/5">
                    {/* Display Name (Nome de Exibição) row */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Nome de Exibição
                        </span>
                        <span className="text-xs font-semibold text-white">
                          {user.display_name || user.username}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="Editar nome de exibição"
                        onClick={() => setActiveAccountModal('displayName')}
                        className={MODAL_SECONDARY_BUTTON_CLASS}
                      >
                        Editar
                      </button>
                    </div>

                    {/* Username row */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Nome de Usuário
                        </span>
                        <span className="text-xs font-semibold text-white font-mono">@{user.username}</span>
                      </div>
                      <button
                        type="button"
                        aria-label="Editar nome de usuário"
                        onClick={() => setActiveAccountModal('username')}
                        className={MODAL_SECONDARY_BUTTON_CLASS}
                      >
                        Editar
                      </button>
                    </div>

                    {/* Phone row */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Número de Telefone
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-200 font-mono">
                            {getMaskedPhone(user.phone_number)}
                          </span>
                          {user.phone_number && (
                            <button
                              type="button"
                              onClick={() => setRevealPhone(!revealPhone)}
                              className="text-[11px] text-brand-400 hover:underline cursor-pointer flex items-center gap-1"
                            >
                              {revealPhone ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              <span>{revealPhone ? 'Ocultar' : 'Revelar número'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={user.phone_number ? 'Editar número de telefone' : 'Adicionar número de telefone'}
                        onClick={() => setActiveAccountModal('phone')}
                        className={MODAL_SECONDARY_BUTTON_CLASS}
                      >
                        {user.phone_number ? 'Editar' : 'Adicionar'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* Group 2: Personalização do Perfil (Recado & Bio) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className={MODAL_SECTION_HEADER_CLASS}>
                      Recado e Sobre Mim
                    </h4>
                  </div>

                  <form onSubmit={handleSaveBioAndStatus} className="space-y-4">
                    {/* Recado / Status Personalizado */}
                    <div>
                      <label className={MODAL_FIELD_LABEL_CLASS}>
                        Recado / Status Personalizado
                      </label>
                      <input
                        type="text"
                        value={customStatus}
                        onChange={(e) => setCustomStatus(e.target.value)}
                        placeholder="Definir um status personalizado..."
                        maxLength={128}
                        className="w-full bg-background-darkest border border-white/10 rounded-xl px-3.5 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    {/* Bio / Sobre Mim */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className={MODAL_FIELD_LABEL_CLASS}>
                          Sobre Mim (Bio)
                        </label>
                        <span className="text-[10px] text-gray-400 font-medium">{bio.length}/255</span>
                      </div>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Escreva algo sobre você..."
                        rows={3}
                        maxLength={255}
                        className="w-full bg-background-darkest border border-white/10 rounded-xl p-3 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none leading-relaxed"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={isSavingBio}
                        className={MODAL_PRIMARY_BUTTON_CLASS}
                      >
                        {bioSuccess ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                            <span>Salvo com Sucesso!</span>
                          </>
                        ) : isSavingBio ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Salvando...</span>
                          </>
                        ) : (
                          'Salvar Recado e Bio'
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* TAB: PRIVACIDADE E SEGURANÇA */}
            {activeTab === 'privacy' && (
              <div className="space-y-6 animate-in fade-in">
                {/* 1. Credenciais de Acesso (E-mail, Senha & 2FA) */}
                <div>
                  <h4 className={MODAL_SECTION_HEADER_CLASS}>
                    Credenciais de Acesso
                  </h4>
                  <div className="rounded-2xl bg-background-darker/60 border border-white/5 p-4 divide-y divide-white/5">
                    {/* E-mail */}
                    <div className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                      <div>
                        <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                          Endereço de E-mail
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-200 font-mono">{getMaskedEmail(user.email)}</span>
                          {!streamerModeActive ? (
                            <button
                              type="button"
                              onClick={() => setRevealEmail(!revealEmail)}
                              className="text-[11px] text-brand-400 hover:underline cursor-pointer flex items-center gap-1"
                            >
                              {revealEmail ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              <span>{revealEmail ? 'Ocultar' : 'Revelar e-mail'}</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-indigo-400 font-semibold flex items-center gap-1">
                              <EyeOff className="w-2.5 h-2.5" />
                              <span>Oculto pelo Modo Streamer</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveAccountModal('email')}
                        className={`${MODAL_SECONDARY_BUTTON_CLASS} self-start sm:self-auto shrink-0`}
                      >
                        Editar
                      </button>
                    </div>

                    {/* Senha */}
                    <div className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                      <div>
                        <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                          Senha da Conta
                        </span>
                        <span className="text-xs text-gray-500 font-mono tracking-widest block mt-0.5">••••••••••••••••</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveAccountModal('password')}
                        className={`${MODAL_PRIMARY_BUTTON_CLASS} !px-4 !py-2 sm:!py-1.5 self-start sm:self-auto shrink-0`}
                      >
                        Mudar Senha
                      </button>
                    </div>

                    {/* Autenticação de Dois Fatores (2FA) */}
                    <div className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={MODAL_TOGGLE_HEADER_CLASS}>Autenticação de Dois Fatores (2FA)</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              user.two_factor_enabled
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {user.two_factor_enabled ? 'ATIVADO' : 'DESATIVADO'}
                          </span>
                        </div>
                        <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
                          Proteja sua conta adicionando uma etapa de confirmação via código TOTP (Google Authenticator / Authy).
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveAccountModal('2fa')}
                        className={
                          user.two_factor_enabled
                            ? 'bg-dnd/10 hover:bg-dnd/20 active:scale-95 text-dnd border border-dnd/30 px-4 py-2 sm:py-1.5 sm:px-3.5 rounded-xl text-xs font-semibold transition-all cursor-pointer self-start sm:self-auto shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-darker'
                            : `${MODAL_PRIMARY_BUTTON_CLASS} !px-4 !py-2 sm:!py-1.5 self-start sm:self-auto shrink-0`
                        }
                      >
                        {user.two_factor_enabled ? 'Desativar 2FA' : 'Habilitar 2FA'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* 2. Mensagens Diretas (DMs) */}
                <div>
                  <h4 className={MODAL_SECTION_HEADER_CLASS}>
                    Mensagens Diretas (DMs)
                  </h4>
                  <div className="space-y-2.5">
                    <label
                      onClick={() => setDmPrivacy('everyone')}
                      className="flex items-center gap-3 cursor-pointer select-none group w-fit"
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                          dmPrivacy === 'everyone'
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-white/25 bg-transparent group-hover:border-white/45'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full bg-brand-500 transition-transform duration-150 ${
                            dmPrivacy === 'everyone' ? 'scale-100' : 'scale-0'
                          }`}
                        />
                      </div>
                      <span
                        className={`text-xs md:text-sm font-medium transition-colors ${
                          dmPrivacy === 'everyone' ? 'text-white' : 'text-gray-300 group-hover:text-gray-100'
                        }`}
                      >
                        Todos os Membros
                      </span>
                    </label>

                    <label
                      onClick={() => setDmPrivacy('friends_only')}
                      className="flex items-center gap-3 cursor-pointer select-none group w-fit"
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                          dmPrivacy === 'friends_only'
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-white/25 bg-transparent group-hover:border-white/45'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full bg-brand-500 transition-transform duration-150 ${
                            dmPrivacy === 'friends_only' ? 'scale-100' : 'scale-0'
                          }`}
                        />
                      </div>
                      <span
                        className={`text-xs md:text-sm font-medium transition-colors ${
                          dmPrivacy === 'friends_only' ? 'text-white' : 'text-gray-300 group-hover:text-gray-100'
                        }`}
                      >
                        Apenas Amigos
                      </span>
                    </label>
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* 3. Criptografia de Ponta a Ponta (E2EE) */}
                <SecurityView />

                <div className={MODAL_DIVIDER_CLASS} />

                {/* 4. Gestão de Dados e Conta (LGPD / GDPR) */}
                <div>
                  <h4 className={MODAL_SECTION_HEADER_CLASS}>
                    Gestão de Dados e Conta (LGPD)
                  </h4>
                  <div className="space-y-4">
                    {/* Export Data */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Exportar Meus Dados (JSON)</span>
                        <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
                          Baixe uma cópia estruturada em JSON com todas as suas informações de perfil, servidores associados e lista de contatos.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportData}
                        disabled={isExportingData}
                        className={`${MODAL_SECONDARY_BUTTON_CLASS} flex items-center gap-1.5 self-start sm:self-auto shrink-0`}
                      >
                        {isExportingData ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Exportando...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Exportar Dados</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Delete Account (Danger Zone) */}
                    <div>
                      <div className="p-3.5 bg-dnd/10 rounded-2xl border border-dnd/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="text-sm font-bold text-dnd block">Excluir Conta Permanentemente</span>
                          <p className="text-[11px] text-dnd/80 leading-relaxed max-w-md">
                            Esta ação é irreversível. Todos os seus dados, mensagens, servidores próprios e amizades serão permanentemente apagados.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveAccountModal('deleteAccount')}
                          className={`${MODAL_DANGER_BUTTON_CLASS} !px-3.5 !py-2 sm:!py-1.5 self-start sm:self-auto shrink-0`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir Conta</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SESSÕES ATIVAS & DISPOSITIVOS */}
            {activeTab === 'sessions' && (
              <div className="animate-in fade-in">
                <SessionsSettingsView />
              </div>
            )}

            {/* TAB: JOGOS REGISTRADOS */}
            {activeTab === 'registered_games' && (
              <div className="animate-in fade-in">
                <RegisteredGamesView />
              </div>
            )}

            {/* TAB: PRIVACIDADE DE ATIVIDADE */}
            {activeTab === 'activity_privacy' && (
              <div className="animate-in fade-in">
                <ActivityPrivacySettingsView />
              </div>
            )}

            {/* TAB: CENTRAL DE ACESSIBILIDADE */}
            {activeTab === 'accessibility' && (
              <div className="animate-in fade-in">
                <AccessibilitySettingsView />
              </div>
            )}

            {/* TAB: APARÊNCIA & TEMA */}
            {activeTab === 'appearance' && (
              <div className="space-y-6 animate-in fade-in">
                {/* Live Interactive Appearance Preview */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`${MODAL_SECTION_HEADER_CLASS} flex items-center gap-1.5 !mb-0`}>
                      <Palette className="w-3.5 h-3.5 text-brand-400" />
                      Prévia de Aparência
                    </h4>
                    <span className="text-[11px] text-gray-500">
                      Atualização em tempo real
                    </span>
                  </div>

                  {/* Simulated App / Chat Box */}
                  {(() => {
                    const ACCENT_COLOR_PREVIEWS: Record<AccentColor, { hex: string; bgSoft: string; border: string; text: string; label: string }> = {
                      indigo: { hex: '#5865F2', bgSoft: 'rgba(88, 101, 242, 0.15)', border: 'rgba(88, 101, 242, 0.35)', text: '#818cf8', label: 'Índigo' },
                      purple: { hex: '#8b5cf6', bgSoft: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.35)', text: '#c084fc', label: 'Roxo Elétrico' },
                      emerald: { hex: '#10b981', bgSoft: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.35)', text: '#34d399', label: 'Esmeralda' },
                      rose: { hex: '#ec4899', bgSoft: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.35)', text: '#f472b6', label: 'Rosa Fúcsia' },
                      cyan: { hex: '#06b6d4', bgSoft: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.35)', text: '#22d3ee', label: 'Ciano Aqua' },
                      amber: { hex: '#f59e0b', bgSoft: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)', text: '#fbbf24', label: 'Âmbar Solar' },
                    };
                    const activeAccent = ACCENT_COLOR_PREVIEWS[accentColor] || ACCENT_COLOR_PREVIEWS.indigo;
                    const isCompact = chatDensity === 'compact';
                    const isLight = theme === 'light';
                    const isOled = theme === 'oled';

                    return (
                      <div
                        className={`border transition-all duration-200 overflow-hidden relative ${
                          isLight
                            ? 'bg-[#ffffff] border-black/10 text-gray-800'
                            : isOled
                            ? 'bg-[#000000] border-white/15 text-gray-100'
                            : 'bg-[#313338] border-white/10 text-gray-100'
                        }`}
                      >
                        {/* Simulated Messages Area */}
                        <div className="p-3 sm:p-4 space-y-3">
                          {/* Message 1: ZeroVC Bot */}
                          {isCompact ? (
                            /* IRC Compact Message 1 */
                            <div
                              className="flex items-baseline gap-2 leading-relaxed"
                              style={{ fontSize: `${chatFontSize}px` }}
                            >
                              <span
                                className="font-mono text-gray-500 select-none w-10 shrink-0 text-right"
                                style={{ fontSize: `${Math.max(10, chatFontSize - 2)}px` }}
                              >
                                11:42
                              </span>
                              <div className="flex-1 min-w-0">
                                <span
                                  className="font-semibold mr-1.5 cursor-pointer hover:underline inline-flex items-center gap-1"
                                  style={{ color: activeAccent.text }}
                                >
                                  ZeroVC Bot:
                                </span>
                                <span className={isLight ? 'text-gray-800' : 'text-gray-200'}>
                                  Bem-vindo ao servidor! Experimente personalizar suas cores e temas no perfil{' '}
                                </span>
                                <span
                                  className="px-1.5 py-0.2 rounded font-semibold inline-flex items-center gap-0.5"
                                  style={{
                                    backgroundColor: activeAccent.bgSoft,
                                    color: activeAccent.text,
                                    border: `1px solid ${activeAccent.border}`,
                                    fontSize: `${Math.max(10, chatFontSize - 2)}px`,
                                  }}
                                >
                                  @{user?.display_name || user?.username || 'Você'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            /* Cozy Message 1 */
                            <div className="flex gap-3 items-start">
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0"
                                style={{ backgroundColor: activeAccent.hex }}
                              >
                                <Bot className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 mb-0.5">
                                  <span
                                    className="font-bold hover:underline cursor-pointer"
                                    style={{ color: activeAccent.text, fontSize: `${Math.max(12, chatFontSize)}px` }}
                                  >
                                    ZeroVC Bot
                                  </span>
                                  <span
                                    className="px-1 py-0.2 text-[9px] font-extrabold uppercase rounded text-white"
                                    style={{ backgroundColor: activeAccent.hex }}
                                  >
                                    BOT
                                  </span>
                                  <span className="text-[10px] text-gray-400">Hoje às 11:42</span>
                                </div>
                                <div
                                  className={`leading-relaxed ${isLight ? 'text-gray-700' : 'text-gray-300'}`}
                                  style={{ fontSize: `${chatFontSize}px` }}
                                >
                                  Bem-vindo ao servidor! Experimente personalizar suas cores e temas no perfil{' '}
                                  <span
                                    className="px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-0.5"
                                    style={{
                                      backgroundColor: activeAccent.bgSoft,
                                      color: activeAccent.text,
                                      border: `1px solid ${activeAccent.border}`,
                                      fontSize: `${Math.max(11, chatFontSize - 1)}px`,
                                    }}
                                  >
                                    @{user?.display_name || user?.username || 'Você'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Message 2: Current User */}
                          {isCompact ? (
                            /* IRC Compact Message 2 */
                            <div>
                              <div
                                className="flex items-baseline gap-2 leading-relaxed"
                                style={{ fontSize: `${chatFontSize}px` }}
                              >
                                <span
                                  className="font-mono text-gray-500 select-none w-10 shrink-0 text-right"
                                  style={{ fontSize: `${Math.max(10, chatFontSize - 2)}px` }}
                                >
                                  11:43
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className={`font-semibold mr-1.5 cursor-pointer hover:underline ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
                                    {user?.display_name || user?.username || 'Você'}:
                                  </span>
                                  <span className={isLight ? 'text-gray-800' : 'text-gray-200'}>
                                    Ficou sensacional! O visual responde instantaneamente em tempo real. 🚀
                                  </span>
                                </div>
                              </div>
                              {/* Reaction pill */}
                              <div className="ml-12 mt-1">
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border cursor-pointer select-none font-semibold transition-transform active:scale-95"
                                  style={{
                                    backgroundColor: activeAccent.bgSoft,
                                    borderColor: activeAccent.border,
                                    color: activeAccent.text,
                                    fontSize: `${Math.max(10, chatFontSize - 2)}px`,
                                  }}
                                >
                                  <span>🚀</span>
                                  <span>3</span>
                                </span>
                              </div>
                            </div>
                          ) : (
                            /* Cozy Message 2 */
                            <div className="flex gap-3 items-start">
                              <UserAvatar user={user} size="md" className="flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 mb-0.5">
                                  <span
                                    className={`font-bold hover:underline cursor-pointer ${isLight ? 'text-gray-900' : 'text-gray-100'}`}
                                    style={{ fontSize: `${Math.max(12, chatFontSize)}px` }}
                                  >
                                    {user?.display_name || user?.username || 'Você'}
                                  </span>
                                  <span className="text-[10px] text-gray-400">Hoje às 11:43</span>
                                </div>
                                <div
                                  className={`leading-relaxed ${isLight ? 'text-gray-700' : 'text-gray-300'}`}
                                  style={{ fontSize: `${chatFontSize}px` }}
                                >
                                  Ficou sensacional! O visual responde instantaneamente em tempo real. 🚀
                                </div>
                                <div className="flex items-center gap-1 mt-1.5">
                                  <span
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border cursor-pointer select-none font-semibold transition-transform active:scale-95"
                                    style={{
                                      backgroundColor: activeAccent.bgSoft,
                                      borderColor: activeAccent.border,
                                      color: activeAccent.text,
                                      fontSize: `${Math.max(10, chatFontSize - 2)}px`,
                                    }}
                                  >
                                    <span>🚀</span>
                                    <span>3</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* Theme Selector */}
                <div>
                  <h4 className={MODAL_SECTION_HEADER_CLASS}>
                    Tema da Interface
                  </h4>
                  <div className="flex flex-wrap gap-3 items-center">
                    {[
                      { id: 'dark', name: 'Escuro Padrão', color: '#313338', isLight: false },
                      { id: 'oled', name: 'Preto OLED', color: '#000000', isLight: false },
                      { id: 'light', name: 'Claro Diurno', color: '#ffffff', isLight: true },
                    ].map((item) => {
                      const isSelected = theme === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTheme(item.id as ThemeMode)}
                          title={item.name}
                          aria-label={item.name}
                          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl transition-all cursor-pointer flex items-center justify-center relative shadow-md hover:scale-105 active:scale-95 ${
                            isSelected
                              ? 'ring-2 ring-white ring-offset-2 ring-offset-background-darkest scale-105'
                              : 'opacity-85 hover:opacity-100 border border-white/10 hover:border-white/30'
                          }`}
                          style={{ backgroundColor: item.color }}
                        >
                          {isSelected && (
                            <Check
                              className={`w-5 h-5 stroke-[3] drop-shadow-sm ${
                                item.isLight ? 'text-gray-900' : 'text-white'
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* Accent Color */}
                <div>
                  <h4 className={MODAL_SECTION_HEADER_CLASS}>
                    Cor de Destaque
                  </h4>
                  <div className="flex flex-wrap gap-3 items-center">
                    {[
                      { id: 'indigo', name: 'Índigo', color: '#5865F2' },
                      { id: 'purple', name: 'Roxo Elétrico', color: '#8b5cf6' },
                      { id: 'emerald', name: 'Esmeralda', color: '#10b981' },
                      { id: 'rose', name: 'Rosa Fúcsia', color: '#ec4899' },
                      { id: 'cyan', name: 'Ciano Aqua', color: '#06b6d4' },
                      { id: 'amber', name: 'Âmbar Solar', color: '#f59e0b' },
                    ].map((item) => {
                      const isSelected = accentColor === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setAccentColor(item.id as AccentColor)}
                          title={item.name}
                          aria-label={item.name}
                          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl transition-all cursor-pointer flex items-center justify-center relative shadow-md hover:scale-105 active:scale-95 ${
                            isSelected
                              ? 'ring-2 ring-white ring-offset-2 ring-offset-background-darkest scale-105'
                              : 'opacity-85 hover:opacity-100 border border-white/10 hover:border-white/30'
                          }`}
                          style={{ backgroundColor: item.color }}
                        >
                          {isSelected && <Check className="w-5 h-5 text-white drop-shadow-sm stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* Chat Density / Estilo de Exibição */}
                <div>
                  <h4 className={MODAL_SECTION_HEADER_CLASS}>
                    Densidade de Exibição do Chat
                  </h4>
                  <div className="space-y-2.5">
                    <label
                      onClick={() => setChatDensity('cozy')}
                      className="flex items-center gap-3 cursor-pointer select-none group w-fit"
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                          chatDensity === 'cozy'
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-white/25 bg-transparent group-hover:border-white/45'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full bg-brand-500 transition-transform duration-150 ${
                            chatDensity === 'cozy' ? 'scale-100' : 'scale-0'
                          }`}
                        />
                      </div>
                      <span
                        className={`text-xs md:text-sm font-medium transition-colors ${
                          chatDensity === 'cozy' ? 'text-white' : 'text-gray-300 group-hover:text-gray-100'
                        }`}
                      >
                        Confortável
                      </span>
                    </label>

                    <label
                      onClick={() => setChatDensity('compact')}
                      className="flex items-center gap-3 cursor-pointer select-none group w-fit"
                    >
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                          chatDensity === 'compact'
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-white/25 bg-transparent group-hover:border-white/45'
                        }`}
                      >
                        <div
                          className={`w-2 h-2 rounded-full bg-brand-500 transition-transform duration-150 ${
                            chatDensity === 'compact' ? 'scale-100' : 'scale-0'
                          }`}
                        />
                      </div>
                      <span
                        className={`text-xs md:text-sm font-medium transition-colors ${
                          chatDensity === 'compact' ? 'text-white' : 'text-gray-300 group-hover:text-gray-100'
                        }`}
                      >
                        Compacto
                      </span>
                    </label>
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* Font Size Scaling */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={MODAL_SECTION_HEADER_CLASS}>
                      Tamanho da Fonte das Mensagens
                    </h4>
                    <span className="text-xs font-bold text-brand-400 bg-brand-500/10 px-2.5 py-1 rounded-xl border border-brand-500/20 font-mono">
                      {chatFontSize}px
                    </span>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="range"
                      min={0}
                      max={FONT_SIZE_STEPS.length - 1}
                      step={1}
                      value={currentFontSizeIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setChatFontSize(FONT_SIZE_STEPS[idx].value);
                      }}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
                    />
                    <div className="flex justify-between text-[10px] font-medium px-1 select-none">
                      {FONT_SIZE_STEPS.map((step, idx) => {
                        const isActive = idx === currentFontSizeIndex;
                        return (
                          <button
                            key={step.value}
                            type="button"
                            onClick={() => setChatFontSize(step.value)}
                            className={`transition-colors cursor-pointer ${
                              isActive ? 'text-brand-400 font-bold' : 'text-gray-500 hover:text-gray-300'
                            } ${idx === FONT_SIZE_STEPS.length - 1 ? 'text-right' : idx > 0 ? 'text-center' : 'text-left'}`}
                          >
                            {step.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* UI Scale / Zoom */}
                <div>
                  <h4 className={MODAL_SECTION_HEADER_CLASS}>
                    Escala da Interface (Zoom)
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">Nível de Zoom</span>
                      <span className="text-xs font-bold font-mono text-brand-400">{uiZoom}%</span>
                    </div>

                    <input
                      type="range"
                      min={85}
                      max={125}
                      step={5}
                      value={uiZoom}
                      onChange={(e) => setUiZoom(Number(e.target.value))}
                      className="w-full accent-brand-500 cursor-pointer h-2 bg-background-dark rounded-lg"
                    />

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex gap-1.5">
                        {[90, 100, 110, 125].map((z) => (
                          <button
                            key={z}
                            type="button"
                            onClick={() => setUiZoom(z)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                              uiZoom === z ? 'bg-brand-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
                            }`}
                          >
                            {z}%
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setUiZoom(100)}
                        className="text-[11px] text-gray-400 hover:text-white hover:underline cursor-pointer"
                      >
                        Restaurar Padrão
                      </button>
                    </div>
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* Media and GIFs */}
                <div>
                  <h4 className={MODAL_SECTION_HEADER_CLASS}>
                    Mídia & Animações
                  </h4>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Reproduzir GIFs automaticamente</span>
                      <p className={MODAL_DESCRIPTION_CLASS}>
                        Se desativado, GIFs só serão reproduzidos ao passar o cursor do mouse por cima.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Reproduzir GIFs automaticamente"
                      aria-checked={autoplayGifs}
                      onClick={() => setAutoplayGifs(!autoplayGifs)}
                      className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                        autoplayGifs ? 'bg-brand-500' : 'bg-white/10'
                      }`}
                    >
                      <div
                        className={`${MODAL_SWITCH_KNOB_CLASS} ${
                          autoplayGifs ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: VOZ & VÍDEO */}
            {activeTab === 'audio' && (
              <div className="space-y-6 animate-in fade-in">
                {/* Audio Devices */}
                {!isMobileDevice ? (
                  <div className="space-y-4">
                    {/* Linha 1: Dropdowns de Entrada e Saída inline */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-2">
                        <label className={MODAL_FIELD_LABEL_CLASS}>
                          Dispositivo de Entrada
                        </label>
                        <DropdownSelect
                          prefixIcon={<Mic className="w-4 h-4" />}
                          value={selectedInput}
                          onChange={(val) => handleDeviceChange('input', val)}
                          options={
                            audioInputs.length > 0
                              ? audioInputs.map((d) => ({
                                  value: d.deviceId,
                                  label: d.label || `Microfone (${d.deviceId.slice(0, 6)})`,
                                }))
                              : [{ value: '', label: 'Microfone Padrão do Sistema' }]
                          }
                          placeholder="Microfone Padrão do Sistema"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className={MODAL_FIELD_LABEL_CLASS}>
                          Dispositivo de Saída
                        </label>
                        <DropdownSelect
                          prefixIcon={<Headphones className="w-4 h-4" />}
                          value={selectedOutput}
                          onChange={(val) => handleDeviceChange('output', val)}
                          options={
                            audioOutputs.length > 0
                              ? audioOutputs.map((d) => ({
                                  value: d.deviceId,
                                  label: d.label || `Alto-falante (${d.deviceId.slice(0, 6)})`,
                                }))
                              : [{ value: '', label: 'Saída Padrão do Sistema' }]
                          }
                          placeholder="Saída Padrão do Sistema"
                        />
                      </div>
                    </div>

                    {/* Linha 2: Sliders de Volume de Entrada e Saída inline */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`${MODAL_FIELD_LABEL_CLASS} !mb-0`}>Volume de Entrada</span>
                          <span className="font-mono font-bold text-brand-400">{inputVolume}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={inputVolume}
                          onChange={(e) => setInputVolume(Number(e.target.value))}
                          className="w-full accent-brand-500 h-1.5 bg-background-darkest rounded-lg cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`${MODAL_FIELD_LABEL_CLASS} !mb-0`}>Volume de Saída</span>
                          <span className="font-mono font-bold text-brand-400">{outputVolume}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={outputVolume}
                          onChange={(e) => setOutputVolume(Number(e.target.value))}
                          className="w-full accent-brand-500 h-1.5 bg-background-darkest rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-background-darker/80 rounded-2xl border border-white/5 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center text-brand-400 flex-shrink-0 mt-0.5">
                      <Headphones className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-gray-200 block">Roteamento Automático de Áudio</span>
                      <span className={`${MODAL_DESCRIPTION_CLASS} block`}>
                        No celular, o áudio e microfone são gerenciados automaticamente pelo sistema ao conectar ou desconectar fones Bluetooth e com fio.
                      </span>
                    </div>
                  </div>
                )}

                {/* Mic Test Section */}
                <div className="space-y-2 pt-1">
                  <div>
                    <span className={MODAL_FIELD_LABEL_CLASS}>Teste de Microfone</span>
                    <span className={`${MODAL_DESCRIPTION_CLASS} block`}>
                      Está tendo problemas? Faça um teste para verificar seu microfone.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-0.5">
                    <button
                      type="button"
                      onClick={isTestingMic ? stopMicTest : startMicTest}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                        isTestingMic
                          ? 'bg-dnd text-white hover:bg-dnd/90'
                          : 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25'
                      }`}
                    >
                      {isTestingMic ? 'Parar Teste' : 'Testar Mic'}
                    </button>
                    <div className="flex-1 flex items-center gap-[3px] h-8 px-3 bg-background-darkest rounded-xl border border-white/5 overflow-hidden">
                      {Array.from({ length: 48 }).map((_, i) => {
                        const threshold = (i / 48) * 100;
                        const isActive = isTestingMic && micLevel >= threshold;
                        return (
                          <div
                            key={i}
                            className={`flex-1 h-3.5 rounded-full transition-colors duration-75 ${
                              isActive
                                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                                : 'bg-white/10'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Input Sensitivity Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                        Determinar sensibilidade de entrada automaticamente
                      </span>
                      <p className={MODAL_DESCRIPTION_CLASS}>
                        Controla a quantidade de som que o ZeroVC transmite do seu microfone.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Determinar sensibilidade de entrada automaticamente"
                      aria-checked={vadAutoSensitivity}
                      onClick={() => {
                        const nextVal = !vadAutoSensitivity;
                        setVadAutoSensitivity(nextVal);
                        audioProcessor.updateConfig({ vadAutoSensitivity: nextVal, vadSensitivity });
                      }}
                      className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                        vadAutoSensitivity ? 'bg-brand-500' : 'bg-white/10'
                      }`}
                    >
                      <div
                        className={`${MODAL_SWITCH_KNOB_CLASS} ${
                          vadAutoSensitivity ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Dual-Color Volume Bar & Interactive Slider */}
                  <div className="space-y-1.5 pt-1">
                    <div className="relative w-full h-3 rounded-full overflow-hidden bg-background-darkest border border-white/10">
                      {/* Background track */}
                      {vadAutoSensitivity ? (
                        /* Automatic Sensitivity: All gray neutral track */
                        <div className="absolute inset-0 bg-background-darker/60" />
                      ) : (
                        /* Manual Sensitivity: Dimmed Amber on left (below threshold), Dimmed Green on right (above threshold) */
                        <div className="absolute inset-0 flex">
                          <div
                            className="h-full bg-amber-500/20 transition-all duration-75"
                            style={{ width: `${vadSensitivity * 100}%` }}
                          />
                          <div className="h-full bg-emerald-500/20 flex-1" />
                        </div>
                      )}

                      {/* Live Mic Level Active Overlay */}
                      {micLevel > 0 && (
                        vadAutoSensitivity ? (
                          /* In Auto Sensitivity Mode:
                             Colores vibrant green (#23a55a) when voice is actively detected within threshold;
                             stays subtle muted gray when quiet or non-voice background sound */
                          <div
                            className={`absolute top-0 bottom-0 left-0 transition-all duration-75 ${
                              vadLiveState.isSpeaking || vadLiveState.gateOpen
                                ? 'bg-[#23a55a] shadow-[0_0_10px_rgba(35,165,90,0.6)]'
                                : 'bg-white/15'
                            }`}
                            style={{
                              width: `${micLevel}%`,
                            }}
                          />
                        ) : (
                          /* In Manual Mode: Dual-color threshold fill */
                          <>
                            {/* Below threshold fill (Vibrant Amber/Yellow #faa61a) */}
                            <div
                              className="absolute top-0 bottom-0 left-0 bg-[#faa61a] transition-all duration-75 shadow-[0_0_8px_rgba(250,166,26,0.6)]"
                              style={{
                                width: `${Math.min(micLevel, vadSensitivity * 100)}%`,
                              }}
                            />
                            {/* Above threshold fill (Vibrant Green #3ba55c) */}
                            {micLevel > vadSensitivity * 100 && (
                              <div
                                className="absolute top-0 bottom-0 bg-[#3ba55c] transition-all duration-75 shadow-[0_0_8px_rgba(59,165,92,0.7)]"
                                style={{
                                  left: `${vadSensitivity * 100}%`,
                                  width: `${Math.min(micLevel - vadSensitivity * 100, 100 - vadSensitivity * 100)}%`,
                                }}
                              />
                            )}
                          </>
                        )
                      )}
                    </div>

                    {/* Range input and visual thumb (only rendered when manual sensitivity is active) */}
                    <div className="relative h-4 -mt-3.5">
                      <input
                        type="range"
                        min="0.05"
                        max="0.95"
                        step="0.01"
                        value={vadSensitivity}
                        disabled={vadAutoSensitivity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setVadSensitivity(val);
                          audioProcessor.updateConfig({ vadSensitivity: val });
                        }}
                        className={`absolute inset-0 w-full opacity-0 z-10 ${
                          vadAutoSensitivity ? 'cursor-not-allowed pointer-events-none' : 'cursor-grab active:cursor-grabbing'
                        }`}
                      />

                      {/* Custom Thumb (Hidden when automatic sensitivity is active) */}
                      {!vadAutoSensitivity && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg border border-black/20 pointer-events-none transition-all duration-75 hover:scale-110"
                          style={{ left: `${vadSensitivity * 100}%` }}
                        />
                      )}
                    </div>

                    {/* Scale labels */}
                    <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono pt-0.5">
                      <span>-100 dB</span>
                      <span className={`font-semibold ${vadAutoSensitivity ? 'text-brand-400' : 'text-gray-300'}`}>
                        {vadAutoSensitivity ? 'Automático' : `${Math.round(-100 + vadSensitivity * 100)} dB`}
                      </span>
                      <span>0 dB</span>
                    </div>
                  </div>
                </div>

                {/* Noise Suppression Selector Row */}
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="space-y-0.5 pr-2">
                      <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                        Redução de ruído
                      </span>
                      <p className={MODAL_DESCRIPTION_CLASS}>
                        Reduz o ruído de fundo do seu microfone.
                      </p>
                    </div>

                    {/* Compact Modern Dropdown Button & Popover */}
                    <DropdownSelect
                      className="w-56 flex-shrink-0"
                      align="right"
                      value={audioProcessingMode}
                      onChange={(val: any) => {
                        setAudioProcessingMode(val);
                        audioProcessor.updateConfig({ mode: val });
                      }}
                      options={[
                        { value: 'rnnoise_silero', label: 'RNNoise + Silero VAD' },
                        { value: 'webrtc', label: 'Padrão' },
                        { value: 'none', label: 'Nenhum' },
                      ]}
                    />
                  </div>

                  {/* Sub-Settings Options (Echo Cancellation, Auto Gain, Push-to-Talk) */}
                  <div className="pt-1">
                    <div className="space-y-4 animate-in fade-in duration-150">
                      {/* Echo Cancellation */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 pr-4">
                          <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Cancelamento de Eco</span>
                          <p className={MODAL_DESCRIPTION_CLASS}>
                            Impede que o áudio das caixas de som retorne ao microfone criando microfonia.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Cancelamento de Eco"
                          aria-checked={echoCancellation}
                          onClick={() => setEchoCancellation(!echoCancellation)}
                          className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                            echoCancellation ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`${MODAL_SWITCH_KNOB_CLASS} ${
                              echoCancellation ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Auto Gain Control */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 pr-4">
                          <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Controle Automático de Ganho</span>
                          <p className={MODAL_DESCRIPTION_CLASS}>
                            Normaliza o volume da voz automaticamente.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Controle Automático de Ganho"
                          aria-checked={autoGainControl}
                          onClick={() => setAutoGainControl(!autoGainControl)}
                          className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                            autoGainControl ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`${MODAL_SWITCH_KNOB_CLASS} ${
                              autoGainControl ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Modo de Entrada (Aberto / Push to Talk) */}
                      <div className="space-y-2">
                        <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                          Modo de Entrada
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleInputModeChange('activity')}
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                              inputMode === 'activity'
                                ? 'bg-brand-500/10 border-brand-500/50 text-white shadow-sm shadow-brand-500/10'
                                : 'bg-background-darker/60 border-white/5 text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                inputMode === 'activity' ? 'bg-brand-500/20 text-brand-400' : 'bg-white/5 text-gray-400'
                              }`}>
                                <Mic className="w-3.5 h-3.5" />
                              </div>
                              <div className="text-left">
                                <span className="text-xs font-bold block">Aberto</span>
                                <span className="text-[10px] text-gray-400 block">Atividade de voz contínua</span>
                              </div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                              inputMode === 'activity' ? 'border-brand-400 bg-brand-500' : 'border-gray-500 bg-transparent'
                            }`}>
                              {inputMode === 'activity' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleInputModeChange('ptt')}
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                              inputMode === 'ptt'
                                ? 'bg-brand-500/10 border-brand-500/50 text-white shadow-sm shadow-brand-500/10'
                                : 'bg-background-darker/60 border-white/5 text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                inputMode === 'ptt' ? 'bg-brand-500/20 text-brand-400' : 'bg-white/5 text-gray-400'
                              }`}>
                                <Radio className="w-3.5 h-3.5" />
                              </div>
                              <div className="text-left">
                                <span className="text-xs font-bold block">Push to Talk</span>
                                <span className="text-[10px] text-gray-400 block">Aperte para falar</span>
                              </div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                              inputMode === 'ptt' ? 'border-brand-400 bg-brand-500' : 'border-gray-500 bg-transparent'
                            }`}>
                              {inputMode === 'ptt' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Mostrar usuários na barra de voz */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 pr-4">
                          <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                            Mostrar usuários na barra de voz
                          </span>
                          <p className={MODAL_DESCRIPTION_CLASS}>
                            Exibe fotos e animação de fala dos participantes conectados abaixo do nome da chamada.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Mostrar usuários na barra de voz"
                          aria-checked={showVoiceUsersInBar}
                          onClick={() => setShowVoiceUsersInBar(!showVoiceUsersInBar)}
                          className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                            showVoiceUsersInBar ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`${MODAL_SWITCH_KNOB_CLASS} ${
                              showVoiceUsersInBar ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={MODAL_DIVIDER_CLASS} />

                {/* Webcam & Video Section with Live Preview */}
                <div>
                  <div className="space-y-3">
                    <div>
                      <label className={MODAL_FIELD_LABEL_CLASS}>
                        Dispositivo de Vídeo
                      </label>
                      <DropdownSelect
                        prefixIcon={<Video className="w-4 h-4" />}
                        value={selectedVideoDevice}
                        onChange={(val) => handleDeviceChange('video', val)}
                        options={
                          videoDevices.length > 0
                            ? videoDevices.map((d) => ({
                                value: d.deviceId,
                                label: d.label || `Câmera (${d.deviceId.slice(0, 6)})`,
                              }))
                            : [{ value: '', label: 'Nenhuma câmera detectada' }]
                        }
                        placeholder="Nenhuma câmera detectada"
                      />
                    </div>

                    {/* Video preview container */}
                    <div className="relative rounded-2xl overflow-hidden bg-black/40 border border-white/5 min-h-[160px] flex items-center justify-center">
                      <video
                        ref={cameraVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-44 object-cover rounded-2xl ${isTestingCamera ? 'block' : 'hidden'}`}
                      />
                      {!isTestingCamera && (
                        <div className="text-center p-6 text-gray-500 space-y-1">
                          <VideoOff className="w-8 h-8 mx-auto text-gray-600 mb-1" />
                          <span className="text-xs block text-gray-400 font-semibold">Preview de Câmera Desativado</span>
                          <span className="text-[11px] block">Clique abaixo para testar a captura de vídeo</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={isTestingCamera ? stopCameraTest : startCameraTest}
                      disabled={videoDevices.length === 0 && !isTestingCamera}
                      className={`w-full py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        isTestingCamera
                          ? 'bg-dnd text-white shadow-md'
                          : 'bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white shadow-md'
                      }`}
                    >
                      <span>{isTestingCamera ? 'Parar Teste de Vídeo' : 'Testar Câmera'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: NOTIFICAÇÕES & SONS */}
            {activeTab === 'notifications' && (
              <NotificationsSettingsView />
            )}

            {/* TAB: MODO STREAMER */}
            {activeTab === 'streamer_mode' && (
              <StreamerModeTab />
            )}

            {/* TAB: PREFERÊNCIAS DO SISTEMA */}
            {activeTab === 'preferences' && (
              <PreferencesSettingsView />
            )}

            {/* TAB: ATALHOS DO TECLADO (Apenas Electron) */}
            {activeTab === 'keybinds' && isElectron() && (
              <div className="space-y-6 flex-1 overflow-y-auto chat-scrollbar pr-1">
                <KeybindSettingsView />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- SUBMODALS FOR ACCOUNT EDITING --- */}
      <AccountSubModals
        activeModal={activeAccountModal}
        onOpenModal={setActiveAccountModal}
        onClose={() => setActiveAccountModal(null)}
        onDisplayNameUpdated={setDisplayName}
      />

      {/* Image Crop & Framing Modal */}
      <ImageCropModal
        isOpen={isCropOpen}
        file={cropFile}
        cropType={cropType}
        onConfirm={handleCropConfirmed}
        onCancel={() => setIsCropOpen(false)}
      />
    </div>
  );
};
