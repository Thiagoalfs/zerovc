import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Image,
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
  ArrowLeft,
  Keyboard,
  Key,
  Download,
  Copy,
  Trash2,
  AlertTriangle,
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
  Zap,
  Gauge,
  Headphones,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
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
import {
  playMessageSound,
  playJoinVoiceSound,
  playLeaveVoiceSound,
  playMuteSound,
  playUnmuteSound,
  playDeafenSound,
  playUndeafenSound,
} from '../../utils/audio';
import { livekit } from '../../lib/livekit';
import { api, formatAssetUrl } from '../../lib/api';
import { ImageCropModal } from './ImageCropModal';
import { KeybindSettingsView } from './KeybindSettingsView';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile, logout, setUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState<
    'account' | 'profile' | 'privacy' | 'appearance' | 'audio' | 'notifications' | 'preferences' | 'keybinds'
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
      setMobileView('menu');
    }
  }, [isOpen]);

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

  // Display Name Edit Modal
  const [isEditDisplayNameOpen, setIsEditDisplayNameOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user?.display_name || '');
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);

  // Username Edit Modal
  const [isEditUsernameOpen, setIsEditUsernameOpen] = useState(false);
  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // Email Edit Modal
  const [isEditEmailOpen, setIsEditEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Phone Edit Modal
  const [isEditPhoneOpen, setIsEditPhoneOpen] = useState(false);
  const [newPhone, setNewPhone] = useState(user?.phone_number || '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // Password Edit Modal
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // 2FA Modal & Backup Codes
  const [is2FAModalOpen, setIs2FAModalOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodesModal, setShowBackupCodesModal] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // Export Data & Delete Account (LGPD/GDPR)
  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCropOpen) {
          setIsCropOpen(false);
          return;
        }
        if (isEditDisplayNameOpen) {
          setIsEditDisplayNameOpen(false);
          return;
        }
        if (isEditUsernameOpen) {
          setIsEditUsernameOpen(false);
          return;
        }
        if (isEditEmailOpen) {
          setIsEditEmailOpen(false);
          return;
        }
        if (isEditPhoneOpen) {
          setIsEditPhoneOpen(false);
          return;
        }
        if (isChangePasswordOpen) {
          setIsChangePasswordOpen(false);
          return;
        }
        if (is2FAModalOpen) {
          setIs2FAModalOpen(false);
          return;
        }
        if (showBackupCodesModal) {
          setShowBackupCodesModal(false);
          return;
        }
        if (isDeleteAccountOpen) {
          setIsDeleteAccountOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    onClose,
    isCropOpen,
    isEditDisplayNameOpen,
    isEditUsernameOpen,
    isEditEmailOpen,
    isEditPhoneOpen,
    isChangePasswordOpen,
    is2FAModalOpen,
    showBackupCodesModal,
    isDeleteAccountOpen,
  ]);

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
  const [inputMode, setInputMode] = useState<'activity' | 'ptt'>(() => {
    try {
      return (localStorage.getItem('zerovc_input_mode') as 'activity' | 'ptt') || 'activity';
    } catch {
      return 'activity';
    }
  });
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

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
    soundMuteEvents,
    soundMessageEvents,
    notificationsDesktop,
    audioProcessingMode,
    rnnoiseLevel,
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
    setSoundMuteEvents,
    setSoundMessageEvents,
    setNotificationsDesktop,
    setAudioProcessingMode,
    setRnnoiseLevel,
    setVadSensitivity,
    setVadHangover,
    setEchoCancellation,
    setNoiseSuppression,
    setAutoGainControl,
    setDmPrivacy,
  } = useSettingsStore();

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
      setNewDisplayName(user.display_name || '');
      setAvatarUrl(user.avatar_url || '');
      setBannerUrl(user.banner_url || '');
      setBio(user.bio || '');
      setCustomStatus(user.custom_status || '');
      setStatus(user.status || 'online');
      setNewUsername(user.username || '');
      setNewEmail(user.email || '');
      setNewPhone(user.phone_number || '');

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

  // Masking helpers
  const getMaskedEmail = (email?: string) => {
    if (!email) return 'Não informado';
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

  // Display Name Save
  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDisplayName(true);
    try {
      const updated = await updateProfile({ display_name: newDisplayName.trim() });
      setUser(updated);
      setDisplayName(updated.display_name || '');
      setIsEditDisplayNameOpen(false);
    } catch (err: any) {
      console.error('Failed to update display name:', err);
    } finally {
      setIsSavingDisplayName(false);
    }
  };

  // Username Save
  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    const trimmed = newUsername.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,32}$/.test(trimmed)) {
      setUsernameError('O @ deve conter apenas letras minúsculas, números e sublinhado (_) (2 a 32 caracteres), sem espaços, acentos, maiúsculas ou símbolos.');
      return;
    }

    setIsSavingUsername(true);
    try {
      const updated = await updateProfile({ username: trimmed });
      setUser(updated);
      setIsEditUsernameOpen(false);
    } catch (err: any) {
      setUsernameError(err.message || 'Este nome de usuário (@) já está em uso.');
    } finally {
      setIsSavingUsername(false);
    }
  };

  // Email Save
  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailError('Insira um e-mail válido.');
      return;
    }
    if (!emailCurrentPassword) {
      setEmailError('Insira sua senha atual para confirmar.');
      return;
    }

    setIsSavingEmail(true);
    try {
      const res = await api.auth.changeEmail({
        password: emailCurrentPassword,
        new_email: newEmail.trim(),
      });
      setUser({ email: res.email });
      setIsEditEmailOpen(false);
      setEmailCurrentPassword('');
    } catch (err: any) {
      setEmailError(err.message || 'Falha ao atualizar e-mail. Verifique sua senha.');
    } finally {
      setIsSavingEmail(false);
    }
  };

  // Phone Save
  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    const trimmed = newPhone.trim();

    setIsSavingPhone(true);
    try {
      const updated = await updateProfile({ phone_number: trimmed });
      setUser(updated);
      setIsEditPhoneOpen(false);
    } catch (err: any) {
      setPhoneError(err.message || 'Falha ao atualizar número.');
    } finally {
      setIsSavingPhone(false);
    }
  };

  // Password Save
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não confere.');
      return;
    }

    setIsSavingPassword(true);
    try {
      await api.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setPasswordSuccess(false);
      }, 1500);
    } catch (err: any) {
      setPasswordError(err.message || 'Senha atual incorreta.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  // 2FA Setup
  const handleOpen2FAModal = async () => {
    setIs2FAModalOpen(true);
    setTwoFactorError(null);
    setTotpCode('');
    if (!user?.two_factor_enabled) {
      setIs2FALoading(true);
      try {
        const res = await api.auth.generate2FA();
        setQrCodeData(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(res.otpauth_uri)}`);
        setSecretKey(res.secret);
      } catch (err: any) {
        setTwoFactorError(err.message || 'Erro ao gerar QR Code.');
      } finally {
        setIs2FALoading(false);
      }
    }
  };

  const handleToggle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorError(null);
    if (!totpCode.trim()) {
      setTwoFactorError('Digite o código de 6 dígitos.');
      return;
    }

    setIs2FALoading(true);
    try {
      if (user?.two_factor_enabled) {
        await api.auth.disable2FA({ code: totpCode.trim() });
        if (user) setUser({ ...user, two_factor_enabled: false });
        setIs2FAModalOpen(false);
      } else {
        const res = await api.auth.enable2FA({ secret: secretKey || '', code: totpCode.trim() });
        if (user) setUser({ ...user, two_factor_enabled: true });
        setIs2FAModalOpen(false);
        if (res.backup_codes && res.backup_codes.length > 0) {
          setBackupCodes(res.backup_codes);
          setShowBackupCodesModal(true);
          setCopiedBackupCodes(false);
        }
      }
    } catch (err: any) {
      setTwoFactorError(err.message || 'Código inválido.');
    } finally {
      setIs2FALoading(false);
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

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteAccountError(null);
    if (!deleteAccountPassword.trim()) {
      setDeleteAccountError('Digite sua senha para confirmar a exclusão.');
      return;
    }

    setIsDeletingAccount(true);
    try {
      await api.auth.deleteAccount({ password: deleteAccountPassword });
      setIsDeleteAccountOpen(false);
      logout();
      window.location.href = '/';
    } catch (err: any) {
      setDeleteAccountError(err.message || 'Senha incorreta ao tentar excluir conta.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Mic test logic with real-time AudioProcessor (WebRTC / RNNoise / Silero VAD)
  const startMicTest = async () => {
    try {
      setIsTestingMic(true);
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
          vadSensitivity,
          vadHangover,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        });
      }
    } catch (err) {
      console.error('Failed to start mic test:', err);
      setIsTestingMic(false);
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
    setMicLevel(0);
    setVadLiveState({ isSpeaking: false, volume: 0, speechProbability: 0, gateOpen: false });
  };

  const handleDeviceChange = async (type: 'input' | 'output' | 'video', deviceId: string) => {
    if (type === 'input') {
      setSelectedInput(deviceId);
      try {
        localStorage.setItem('zerovc_audio_input_device', deviceId);
      } catch {}
      await livekit.setAudioInputDevice(deviceId);
      if (isTestingMic) {
        stopMicTest();
        setTimeout(startMicTest, 100);
      }
    } else if (type === 'output') {
      setSelectedOutput(deviceId);
      try {
        localStorage.setItem('zerovc_audio_output_device', deviceId);
      } catch {}
      await livekit.setAudioOutputDevice(deviceId);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-0 md:p-4 overflow-hidden animate-in fade-in"
    >
      {/* Unified Fixed Container (Full-screen on mobile, centered card on desktop) */}
      <div className="bg-background-dark w-full h-full md:max-w-5xl md:h-[680px] md:max-h-[92dvh] md:my-auto md:rounded-3xl rounded-none overflow-hidden shadow-2xl border-0 md:border md:border-white/10 flex flex-col md:flex-row relative animate-in zoom-in-95">
        
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
                  className="p-1.5 -ml-1 text-gray-400 hover:text-white rounded-xl active:bg-white/10 transition-colors"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-base font-bold text-white">Configurações</h2>
              </div>
            </div>

            {/* Mobile Navigation List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 overscroll-contain touch-pan-y no-scrollbar">
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Minha Conta</div>
                        <div className="text-xs text-gray-400">Perfil, avatar, display name, dados</div>
                      </div>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                        <Shield className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Privacidade e Segurança</div>
                        <div className="text-xs text-gray-400">E-mail, senha, 2FA, sessões</div>
                      </div>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                        <Palette className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Aparência</div>
                        <div className="text-xs text-gray-400">Temas visuais, cores de destaque, densidade</div>
                      </div>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                        <Volume2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Voz & Vídeo</div>
                        <div className="text-xs text-gray-400">Microfone, autofalante, câmera, VAD</div>
                      </div>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-white/5 text-gray-300">
                        <Bell className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">Notificações & Sons</div>
                        <div className="text-xs text-gray-400">Sons do sistema, alertas na área de trabalho</div>
                      </div>
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
                    onClick={logout}
                    className="w-full flex items-center justify-between p-3.5 text-left hover:bg-red-500/10 active:bg-red-500/20 text-red-400 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
                        <LogOut className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">Sair da Conta</div>
                        <div className="text-xs text-red-400/70">Desconectar desta sessão</div>
                      </div>
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
        <div className="hidden md:flex w-60 bg-background-darker p-4 flex-col justify-between border-r border-white/5 flex-shrink-0">
          <div className="flex flex-col items-stretch gap-1 flex-shrink-0">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">
              Configurações de Usuário
            </span>

            {/* Tab 1: Minha Conta */}
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'account'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Minha Conta</span>
            </button>

            {/* Tab: Privacidade e Segurança */}
            <button
              type="button"
              onClick={() => setActiveTab('privacy')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'privacy'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Privacidade e Segurança</span>
            </button>

            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 my-2 pt-2">
              Configurações do App
            </span>

            {/* Tab: Aparência */}
            <button
              type="button"
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'appearance'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>Aparência</span>
            </button>

            {/* Tab: Voz & Vídeo */}
            <button
              type="button"
              onClick={() => setActiveTab('audio')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'audio'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>Voz & Vídeo</span>
            </button>

            {/* Tab: Notificações & Sons */}
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'notifications'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Notificações & Sons</span>
            </button>

            {/* Tab: Preferências */}
            <button
              type="button"
              onClick={() => setActiveTab('preferences')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'preferences'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Preferências</span>
            </button>

            {/* Tab: Atalhos do Teclado */}
            <button
              type="button"
              onClick={() => setActiveTab('keybinds')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'keybinds'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>Atalhos do Teclado</span>
            </button>
          </div>

          {/* Bottom Logout */}
          <div className="pt-3 border-t border-white/5 flex-shrink-0">
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2.5 px-3 py-2 rounded-2xl text-xs font-semibold text-dnd hover:bg-dnd/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MAIN CONTENT AREA (Visible on desktop OR on mobile when mobileView === 'content') */}
        {/* ======================================================== */}
        <div className={`${mobileView === 'content' ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 min-h-0 overflow-hidden bg-background-dark/95`}>
          
          {/* Mobile Drilldown Top Bar (Back Arrow + Title + Close) */}
          <div
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
            className="flex md:hidden items-center justify-between px-4 pb-3.5 border-b border-white/5 bg-background-darker/70 flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileView('menu')}
                className="p-1.5 -ml-1 text-gray-300 hover:text-white rounded-xl active:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Voltar</span>
              </button>
            </div>
            <h2 className="text-sm font-bold text-white truncate max-w-[180px]">
              {activeTab === 'account' && 'Minha Conta'}
              {activeTab === 'profile' && 'Perfil de Usuário'}
              {activeTab === 'privacy' && 'Privacidade'}
              {activeTab === 'appearance' && 'Aparência'}
              {activeTab === 'audio' && 'Voz & Vídeo'}
              {activeTab === 'notifications' && 'Notificações'}
              {activeTab === 'preferences' && 'Preferências'}
              {activeTab === 'keybinds' && 'Atalhos'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-xl active:bg-white/10 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop Top Bar with Title and Close Button */}
          <div className="hidden md:flex min-h-14 sm:h-16 px-4 sm:px-6 py-2 border-b border-white/5 items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              {activeTab === 'profile' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('account')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-white/5"
                  title="Voltar para Minha Conta"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>
              )}
              <div>
                <h3 className="text-lg font-bold text-white">
                  {activeTab === 'account' && 'Minha Conta'}
                  {activeTab === 'profile' && 'Perfil de Usuário'}
                  {activeTab === 'privacy' && 'Privacidade e Segurança'}
                  {activeTab === 'appearance' && 'Aparência & Customização'}
                  {activeTab === 'audio' && 'Voz & Vídeo'}
                  {activeTab === 'notifications' && 'Notificações & Sons'}
                  {activeTab === 'preferences' && 'Preferências do Sistema'}
                  {activeTab === 'keybinds' && 'Atalhos do Teclado'}
                </h3>
                <p className="text-xs text-gray-400">
                  {activeTab === 'account' && 'Personalize seu perfil, avatar, banner, nome de exibição e recado.'}
                  {activeTab === 'profile' && 'Personalize seu avatar, banner, nome de exibição e recado.'}
                  {activeTab === 'privacy' && 'Gerencie credenciais de acesso, e-mail, senha, autenticação 2FA, sessões ativas e dados.'}
                  {activeTab === 'appearance' && 'Personalize temas visuais, cores de destaque, densidade e zoom.'}
                  {activeTab === 'audio' && 'Ajuste dispositivos, microfone, webcam e filtros avançados de áudio WebRTC.'}
                  {activeTab === 'notifications' && 'Configure sons do sistema, alertas sonoros e notificações na área de trabalho.'}
                  {activeTab === 'preferences' && 'Configure o comportamento da janela, inicialização e integração com o sistema.'}
                  {activeTab === 'keybinds' && 'Configure atalhos rápidos e Push-to-Talk globais para controle de voz.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Fechar (Esc)"
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
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto no-scrollbar space-y-5 min-h-0 overscroll-contain touch-pan-y">
            {/* TAB 1: MINHA CONTA (UNIFIED WITH PROFILE CUSTOMIZATION) */}
            {activeTab === 'account' && (
              <div className="space-y-5 animate-in fade-in">
                {/* Profile Top Banner Card with Clickable Banner & Avatar Upload */}
                <div className="rounded-3xl overflow-hidden bg-background-darker border border-white/5 shadow-lg relative">
                  {/* Banner (Interactive / Click to Upload) */}
                  <div
                    className="h-32 w-full bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 relative group cursor-pointer bg-cover bg-center"
                    style={{ backgroundImage: user.banner_url ? `url(${formatAssetUrl(user.banner_url)})` : undefined }}
                    onClick={() => bannerFileInputRef.current?.click()}
                    title="Clique para alterar seu banner"
                  >
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-semibold backdrop-blur-xs">
                      <Camera className="w-4 h-4" />
                      <span>{isUploadingBanner ? 'Processando Banner...' : 'Alterar Banner'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        bannerFileInputRef.current?.click();
                      }}
                      className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                    >
                      <Image className="w-3.5 h-3.5" />
                      <span>Mudar Banner</span>
                    </button>
                  </div>

                  {/* Header Row: Avatar + Name + Status */}
                  <div className="px-6 pb-4 pt-0 bg-background-darker">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                      <div className="flex items-end gap-4 -mt-12">
                        {/* Avatar (Interactive / Click to Upload) */}
                        <div
                          className="w-24 h-24 rounded-full border-4 border-background-darker bg-brand-500 overflow-hidden shadow-2xl flex-shrink-0 flex items-center justify-center text-white font-bold text-3xl relative group cursor-pointer"
                          onClick={() => avatarFileInputRef.current?.click()}
                          title="Clique para alterar seu avatar"
                        >
                          {user.avatar_url ? (
                            <img src={formatAssetUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span>{user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}</span>
                          )}

                          {/* Camera Overlay on Hover */}
                          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-0.5">
                            <Camera className="w-5 h-5" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Mudar</span>
                          </div>
                        </div>

                        {/* Name & Username tag cleanly aligned in dark area */}
                        <div className="pt-2 pb-0.5">
                          <h4 className="text-lg font-bold text-white leading-tight tracking-tight">
                            {user.display_name || user.username}
                          </h4>
                          <span className="text-xs text-gray-400 font-mono font-medium block mt-0.5">
                            @{user.username}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => avatarFileInputRef.current?.click()}
                        className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white text-xs font-semibold px-4 py-2 rounded-xl border border-white/10 shadow-sm transition-all cursor-pointer self-start sm:self-auto flex items-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{isUploadingAvatar ? 'Enviando...' : 'Mudar Avatar'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Group 1: Informações da Conta */}
                  <div className="m-4 mt-1 p-4 bg-background-darkest/90 rounded-2xl border border-white/5 space-y-3.5">
                    {/* Display Name (Nome de Exibição) row */}
                    <div className="flex items-center justify-between py-1 border-b border-white/5">
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
                        onClick={() => {
                          setNewDisplayName(user.display_name || '');
                          setIsEditDisplayNameOpen(true);
                        }}
                        className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>

                    {/* Username row */}
                    <div className="flex items-center justify-between py-1 border-b border-white/5">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Nome de Usuário
                        </span>
                        <span className="text-xs font-semibold text-white font-mono">@{user.username}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewUsername(user.username);
                          setUsernameError(null);
                          setIsEditUsernameOpen(true);
                        }}
                        className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>

                    {/* Phone row */}
                    <div className="flex items-center justify-between py-1">
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
                        onClick={() => {
                          setNewPhone(user.phone_number || '');
                          setPhoneError(null);
                          setIsEditPhoneOpen(true);
                        }}
                        className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                      >
                        {user.phone_number ? 'Editar' : 'Adicionar'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Group 2: Personalização do Perfil (Recado & Bio) */}
                <div className="p-5 bg-background-darker/80 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                      <Smile className="w-3.5 h-3.5 text-brand-400" />
                      <span>Recado e Sobre Mim</span>
                    </h4>
                  </div>

                  <form onSubmit={handleSaveBioAndStatus} className="space-y-4">
                    {/* Recado / Status Personalizado */}
                    <div>
                      <label className="block text-[11px] font-bold text-gray-300 uppercase tracking-wider mb-1.5">
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
                        <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText className="w-3 h-3 text-brand-400" />
                          <span>Sobre Mim (Bio)</span>
                        </label>
                        <span className="text-[10px] text-gray-500">{bio.length}/255</span>
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
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold text-xs px-5 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
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
                {/* 1. Credenciais de Acesso (E-mail & Senha) */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-brand-400" />
                    <span>Credenciais de Acesso</span>
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 divide-y divide-white/5 space-y-3.5">
                    {/* E-mail */}
                    <div className="flex items-center justify-between pt-1 first:pt-0">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Endereço de E-mail
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-200 font-mono">{getMaskedEmail(user.email)}</span>
                          <button
                            type="button"
                            onClick={() => setRevealEmail(!revealEmail)}
                            className="text-[11px] text-brand-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            {revealEmail ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{revealEmail ? 'Ocultar' : 'Revelar e-mail'}</span>
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewEmail(user.email || '');
                          setEmailError(null);
                          setEmailCurrentPassword('');
                          setIsEditEmailOpen(true);
                        }}
                        className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>

                    {/* Senha */}
                    <div className="flex items-center justify-between pt-3.5">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Senha da Conta
                        </span>
                        <span className="text-xs text-gray-500 font-mono tracking-widest block mt-0.5">••••••••••••••••</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordError(null);
                          setPasswordSuccess(false);
                          setCurrentPassword('');
                          setNewPassword('');
                          setConfirmPassword('');
                          setIsChangePasswordOpen(true);
                        }}
                        className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
                      >
                        Mudar Senha
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Autenticação & Sessões (2FA & Sessão Atual) */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                    <span>Autenticação & Sessões</span>
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 divide-y divide-white/5 space-y-3.5">
                    {/* 2FA */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 first:pt-0">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">Autenticação de Dois Fatores (2FA)</span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                              user.two_factor_enabled
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            }`}
                          >
                            {user.two_factor_enabled ? 'ATIVADO' : 'DESATIVADO'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-relaxed max-w-md">
                          Proteja sua conta adicionando uma etapa de confirmação via código TOTP (Google Authenticator / Authy).
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleOpen2FAModal}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer self-start sm:self-auto ${
                          user.two_factor_enabled
                            ? 'bg-dnd/10 hover:bg-dnd/20 text-dnd border-dnd/30'
                            : 'bg-brand-500 hover:bg-brand-600 text-white border-transparent'
                        }`}
                      >
                        {user.two_factor_enabled ? 'Desativar 2FA' : 'Habilitar 2FA'}
                      </button>
                    </div>

                    {/* Sessão Atual */}
                    <div className="flex items-center justify-between pt-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">Sessão Atual</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Dispositivo Atual
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-400">ZeroVC Desktop • Online agora</span>
                        </div>
                      </div>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    </div>
                  </div>
                </div>

                {/* 3. Mensagens Diretas (DMs) */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-brand-400" />
                    <span>Mensagens Diretas (DMs)</span>
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 space-y-3">
                    <span className="text-xs font-semibold text-white block">
                      Quem pode enviar mensagens diretas para você:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDmPrivacy('everyone')}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          dmPrivacy === 'everyone'
                            ? 'border-brand-500 bg-brand-500/10 text-white'
                            : 'border-white/10 bg-background-darker text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs">Todos os Membros</span>
                          {dmPrivacy === 'everyone' && <Check className="w-4 h-4 text-brand-400" />}
                        </div>
                        <span className="text-[11px] text-gray-400">
                          Qualquer pessoa em servidores compartilhados pode te chamar.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDmPrivacy('friends_only')}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                          dmPrivacy === 'friends_only'
                            ? 'border-brand-500 bg-brand-500/10 text-white'
                            : 'border-white/10 bg-background-darker text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs">Apenas Amigos</span>
                          {dmPrivacy === 'friends_only' && <Check className="w-4 h-4 text-brand-400" />}
                        </div>
                        <span className="text-[11px] text-gray-400">
                          Apenas usuários adicionados à sua lista de amigos podem te enviar DM.
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Gestão de Dados e Conta (LGPD / GDPR) */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-brand-400" />
                    <span>Gestão de Dados e Conta (LGPD)</span>
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 divide-y divide-white/5 space-y-3.5">
                    {/* Export Data */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 first:pt-0">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-white block">Exportar Meus Dados (JSON)</span>
                        <p className="text-[11px] text-gray-400 leading-relaxed max-w-md">
                          Baixe uma cópia estruturada em JSON com todas as suas informações de perfil, servidores associados e lista de contatos.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleExportData}
                        disabled={isExportingData}
                        className="bg-background-dark hover:bg-white/10 disabled:opacity-50 text-gray-200 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
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
                    <div className="pt-3.5">
                      <div className="p-3.5 bg-dnd/10 rounded-2xl border border-dnd/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-dnd block">Excluir Conta Permanentemente</span>
                          <p className="text-[11px] text-dnd/80 leading-relaxed max-w-md">
                            Esta ação é irreversível. Todos os seus dados, mensagens, servidores próprios e amizades serão permanentemente apagados.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteAccountPassword('');
                            setDeleteAccountError(null);
                            setIsDeleteAccountOpen(true);
                          }}
                          className="bg-dnd hover:bg-dnd/80 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
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

            {/* TAB: APARÊNCIA & TEMA */}
            {activeTab === 'appearance' && (
              <div className="space-y-6 animate-in fade-in">
                {/* Theme Selector */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Tema da Interface
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Dark Slate */}
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                        theme === 'dark'
                          ? 'border-brand-500 bg-brand-500/10 shadow-lg'
                          : 'border-white/10 bg-background-darkest text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Moon className="w-4 h-4 text-brand-400" />
                        <span className="text-xs font-bold text-white">Escuro Padrão</span>
                      </div>
                      <div className="h-8 rounded-lg bg-[#313338] border border-white/10 flex items-center px-2 gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                        <div className="h-1.5 w-10 bg-white/20 rounded" />
                      </div>
                      <span className="text-[10px] text-gray-400 block mt-2">Visual clássico ZeroVC</span>
                    </button>

                    {/* OLED Pitch Black */}
                    <button
                      type="button"
                      onClick={() => setTheme('oled')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                        theme === 'oled'
                          ? 'border-brand-500 bg-brand-500/10 shadow-lg'
                          : 'border-white/10 bg-background-darkest text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold text-white">Preto OLED</span>
                      </div>
                      <div className="h-8 rounded-lg bg-black border border-white/20 flex items-center px-2 gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                        <div className="h-1.5 w-10 bg-white/30 rounded" />
                      </div>
                      <span className="text-[10px] text-gray-400 block mt-2">100% Preto para telas OLED</span>
                    </button>

                    {/* Light Mode */}
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                        theme === 'light'
                          ? 'border-brand-500 bg-brand-500/10 shadow-lg'
                          : 'border-white/10 bg-background-darkest text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Sun className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-white">Claro Diurno</span>
                      </div>
                      <div className="h-8 rounded-lg bg-[#e3e5e8] border border-black/10 flex items-center px-2 gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                        <div className="h-1.5 w-10 bg-black/20 rounded" />
                      </div>
                      <span className="text-[10px] text-gray-400 block mt-2">Interface clara de alto contraste</span>
                    </button>
                  </div>
                </div>

                {/* Accent Color */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Cor de Destaque
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 flex flex-wrap gap-3 items-center">
                    {[
                      { id: 'indigo', name: 'Índigo', color: '#5865F2' },
                      { id: 'purple', name: 'Roxo Elétrico', color: '#8b5cf6' },
                      { id: 'emerald', name: 'Esmeralda', color: '#10b981' },
                      { id: 'rose', name: 'Rosa Fúcsia', color: '#ec4899' },
                      { id: 'cyan', name: 'Ciano Aqua', color: '#06b6d4' },
                      { id: 'amber', name: 'Âmbar Solar', color: '#f59e0b' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAccentColor(item.id as AccentColor)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          accentColor === item.id
                            ? 'border-white text-white shadow-md bg-white/10'
                            : 'border-white/10 text-gray-400 hover:text-white bg-background-darker'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shadow-sm flex items-center justify-center"
                          style={{ backgroundColor: item.color }}
                        >
                          {accentColor === item.id && <Check className="w-2.5 h-2.5 text-white" />}
                        </span>
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Density */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Densidade de Exibição do Chat
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setChatDensity('cozy')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        chatDensity === 'cozy'
                          ? 'border-brand-500 bg-brand-500/10 text-white'
                          : 'border-white/10 bg-background-darkest text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">Confortável (Padrão)</span>
                        {chatDensity === 'cozy' && <Check className="w-4 h-4 text-brand-400" />}
                      </div>
                      <span className="text-[11px] text-gray-400">
                        Visual moderno com fotos de perfil em destaque e espaçamento generoso.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setChatDensity('compact')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        chatDensity === 'compact'
                          ? 'border-brand-500 bg-brand-500/10 text-white'
                          : 'border-white/10 bg-background-darkest text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">Compacto (Estilo IRC)</span>
                        {chatDensity === 'compact' && <Check className="w-4 h-4 text-brand-400" />}
                      </div>
                      <span className="text-[11px] text-gray-400">
                        Sem avatares grandes, otimizado para ler muitas mensagens por tela.
                      </span>
                    </button>
                  </div>
                </div>

                {/* UI Scale / Zoom */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Escala da Interface (Zoom)
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 space-y-3">
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

                {/* Media and GIFs */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Mídia & Animações
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 flex items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <span className="text-xs font-bold text-white block">Reproduzir GIFs automaticamente</span>
                      <p className="text-[11px] text-gray-400">
                        Se desativado, GIFs só serão reproduzidos ao passar o cursor do mouse por cima.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoplayGifs}
                      onClick={() => setAutoplayGifs(!autoplayGifs)}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                        autoplayGifs ? 'bg-brand-500' : 'bg-white/10'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
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
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-brand-400" />
                        Dispositivo de Entrada (Microfone)
                      </label>
                      <select
                        value={selectedInput}
                        onChange={(e) => handleDeviceChange('input', e.target.value)}
                        className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500 cursor-pointer"
                      >
                        {audioInputs.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Microfone (${d.deviceId.slice(0, 6)})`}
                          </option>
                        ))}
                        {audioInputs.length === 0 && <option value="">Microfone Padrão do Sistema</option>}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-brand-400" />
                        Dispositivo de Saída (Fone / Alto-falante)
                      </label>
                      <select
                        value={selectedOutput}
                        onChange={(e) => handleDeviceChange('output', e.target.value)}
                        className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500 cursor-pointer"
                      >
                        {audioOutputs.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Alto-falante (${d.deviceId.slice(0, 6)})`}
                          </option>
                        ))}
                        {audioOutputs.length === 0 && <option value="">Saída Padrão do Sistema</option>}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-background-darker/80 rounded-2xl border border-white/5 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-brand-500/15 flex items-center justify-center text-brand-400 flex-shrink-0 mt-0.5">
                      <Headphones className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-gray-200 block">Roteamento Automático de Áudio</span>
                      <span className="text-[11px] text-gray-400 block leading-relaxed">
                        No celular, o áudio e microfone são gerenciados automaticamente pelo sistema ao conectar ou desconectar fones Bluetooth e com fio.
                      </span>
                    </div>
                  </div>
                )}

                {/* Mic Test Section */}
                <div className="p-4 bg-background-darker/80 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-200 block">Teste de Microfone</span>
                      <span className="text-[11px] text-gray-400">
                        Fale para verificar se o microfone está captando seu áudio.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={isTestingMic ? stopMicTest : startMicTest}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isTestingMic ? 'bg-dnd text-white' : 'bg-brand-500 text-white'
                      }`}
                    >
                      {isTestingMic ? 'Parar Teste' : 'Testar Mic'}
                    </button>
                  </div>

                  <div className="w-full h-3 bg-background-darkest rounded-full overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-75"
                      style={{ width: `${isTestingMic ? micLevel : 0}%` }}
                    />
                  </div>
                </div>

                {/* Voice Mode: Activity vs PTT */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                    Modo de Entrada de Voz
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleInputModeChange('activity')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        inputMode === 'activity'
                          ? 'bg-brand-500/15 border-brand-500 text-white'
                          : 'bg-background-darker border-white/5 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">Detecção de Voz</span>
                        <Radio className="w-4 h-4 text-brand-400" />
                      </div>
                      <span className="text-[11px] text-gray-400">Transmite automaticamente ao falar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleInputModeChange('ptt')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        inputMode === 'ptt'
                          ? 'bg-brand-500/15 border-brand-500 text-white'
                          : 'bg-background-darker border-white/5 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">Push-to-Talk (PTT)</span>
                        <Keyboard className="w-4 h-4 text-brand-400" />
                      </div>
                      <span className="text-[11px] text-gray-400">Transmite apenas ao segurar a tecla configurada</span>
                    </button>
                  </div>
                </div>

                {/* Audio Processing Mode Dropdown & Interactive Sub-Settings */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-brand-400" />
                      Processamento de Áudio
                    </label>
                    <span className="text-[10px] font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/20">
                      {audioProcessingMode === 'rnnoise_silero'
                        ? 'IA Dupla Camada'
                        : audioProcessingMode === 'rnnoise'
                        ? 'RNNoise IA'
                        : 'WebRTC Clássico'}
                    </span>
                  </div>

                  {/* Custom Modern Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsProcDropdownOpen(!isProcDropdownOpen)}
                      className="w-full bg-background-darkest/95 hover:bg-background-darkest border border-white/10 hover:border-white/20 p-3.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer shadow-lg group"
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center flex-shrink-0 text-brand-400 group-hover:scale-105 transition-transform">
                          {audioProcessingMode === 'rnnoise_silero' ? (
                            <Brain className="w-5 h-5 text-brand-400" />
                          ) : audioProcessingMode === 'rnnoise' ? (
                            <Zap className="w-5 h-5 text-amber-400" />
                          ) : (
                            <Globe className="w-5 h-5 text-blue-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white block">
                              {audioProcessingMode === 'rnnoise_silero'
                                ? 'RNNoise + Silero VAD (IA Avançada)'
                                : audioProcessingMode === 'rnnoise'
                                ? 'RNNoise (IA)'
                                : 'WebRTC Padrão'}
                            </span>
                            {audioProcessingMode === 'rnnoise_silero' && (
                              <span className="bg-brand-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded uppercase">
                                Recomendado
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-400 line-clamp-1">
                            {audioProcessingMode === 'rnnoise_silero'
                              ? 'Filtro espectral neural com portão de voz inteligente (silêncio total)'
                              : audioProcessingMode === 'rnnoise'
                              ? 'Rede neural em tempo real para eliminação de ruídos e cliques'
                              : 'Filtros tradicionais nativos do navegador'}
                          </span>
                        </div>
                      </div>

                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 group-hover:text-white transition-transform duration-200 ${
                          isProcDropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Dropdown Menu Options */}
                    {isProcDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setIsProcDropdownOpen(false)}
                        />
                        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-background-darkest/95 backdrop-blur-md border border-white/10 p-2 rounded-2xl shadow-2xl space-y-1 animate-in fade-in zoom-in-95">
                          {/* Option 1: WebRTC */}
                          <button
                            type="button"
                            onClick={() => {
                              setAudioProcessingMode('webrtc');
                              setIsProcDropdownOpen(false);
                            }}
                            className={`w-full p-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer ${
                              audioProcessingMode === 'webrtc'
                                ? 'bg-brand-500/20 border border-brand-500/40 text-white'
                                : 'hover:bg-white/5 text-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                                <Globe className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-xs font-bold block">WebRTC Padrão</span>
                                <span className="text-[11px] text-gray-400">
                                  Filtros nativos clássicos (baixo consumo de CPU)
                                </span>
                              </div>
                            </div>
                            {audioProcessingMode === 'webrtc' && (
                              <Check className="w-4 h-4 text-brand-400" />
                            )}
                          </button>

                          {/* Option 2: RNNoise */}
                          <button
                            type="button"
                            onClick={() => {
                              setAudioProcessingMode('rnnoise');
                              setIsProcDropdownOpen(false);
                            }}
                            className={`w-full p-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer ${
                              audioProcessingMode === 'rnnoise'
                                ? 'bg-brand-500/20 border border-brand-500/40 text-white'
                                : 'hover:bg-white/5 text-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                                <Zap className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-xs font-bold block">RNNoise (IA)</span>
                                <span className="text-[11px] text-gray-400">
                                  Rede neural contínua para ventiladores, teclados e ruídos
                                </span>
                              </div>
                            </div>
                            {audioProcessingMode === 'rnnoise' && (
                              <Check className="w-4 h-4 text-brand-400" />
                            )}
                          </button>

                          {/* Option 3: RNNoise + Silero VAD */}
                          <button
                            type="button"
                            onClick={() => {
                              setAudioProcessingMode('rnnoise_silero');
                              setIsProcDropdownOpen(false);
                            }}
                            className={`w-full p-3 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer ${
                              audioProcessingMode === 'rnnoise_silero'
                                ? 'bg-brand-500/20 border border-brand-500/40 text-white'
                                : 'hover:bg-white/5 text-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center text-brand-400">
                                <Brain className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold block">RNNoise + Silero VAD</span>
                                  <span className="bg-brand-500 text-white text-[8px] font-bold px-1 rounded uppercase">
                                    Recomendado
                                  </span>
                                </div>
                                <span className="text-[11px] text-gray-400">
                                  Filtro neural espectral com portão de voz (silêncio total sem falar)
                                </span>
                              </div>
                            </div>
                            {audioProcessingMode === 'rnnoise_silero' && (
                              <Check className="w-4 h-4 text-brand-400" />
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Interactive Sub-Settings Panel based on selected mode */}
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 space-y-4">
                    {/* MODE 1: WEBRTC STANDARD */}
                    {audioProcessingMode === 'webrtc' && (
                      <div className="divide-y divide-white/5 space-y-3.5 animate-in fade-in duration-150">
                        {/* Echo Cancellation */}
                        <div className="flex items-center justify-between pt-1 first:pt-0">
                          <div className="space-y-0.5 pr-4">
                            <span className="text-xs font-bold text-white block">Cancelamento de Eco</span>
                            <p className="text-[11px] text-gray-400">
                              Impede que o áudio das caixas de som retorne ao microfone criando microfonia.
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={echoCancellation}
                            onClick={() => setEchoCancellation(!echoCancellation)}
                            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                              echoCancellation ? 'bg-brand-500' : 'bg-white/10'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                echoCancellation ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Noise Suppression */}
                        <div className="flex items-center justify-between pt-3.5">
                          <div className="space-y-0.5 pr-4">
                            <span className="text-xs font-bold text-white block">Supressão de Ruído de Fundo</span>
                            <p className="text-[11px] text-gray-400">
                              Filtra ruídos estáticos contínuos do ambiente.
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={noiseSuppression}
                            onClick={() => setNoiseSuppression(!noiseSuppression)}
                            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                              noiseSuppression ? 'bg-brand-500' : 'bg-white/10'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                noiseSuppression ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Auto Gain Control */}
                        <div className="flex items-center justify-between pt-3.5">
                          <div className="space-y-0.5 pr-4">
                            <span className="text-xs font-bold text-white block">Controle Automático de Ganho</span>
                            <p className="text-[11px] text-gray-400">
                              Normaliza o volume da voz automaticamente.
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={autoGainControl}
                            onClick={() => setAutoGainControl(!autoGainControl)}
                            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                              autoGainControl ? 'bg-brand-500' : 'bg-white/10'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                autoGainControl ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* MODE 2: RNNOISE (IA) */}
                    {audioProcessingMode === 'rnnoise' && (
                      <div className="space-y-4 animate-in fade-in duration-150">
                        {/* RNNoise Aggressiveness Level */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <Gauge className="w-3.5 h-3.5 text-amber-400" />
                              Intensidade da Supressão de Ruído (IA)
                            </span>
                            <span className="text-[11px] text-amber-400 font-bold uppercase">
                              {rnnoiseLevel === 'light' ? 'Leve (70%)' : rnnoiseLevel === 'aggressive' ? 'Agressivo (140%)' : 'Equilibrado (100%)'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {(['light', 'balanced', 'aggressive'] as RNNoiseLevel[]).map((lvl) => (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => setRnnoiseLevel(lvl)}
                                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                                  rnnoiseLevel === lvl
                                    ? 'bg-amber-500/20 border-amber-500 text-white shadow-sm'
                                    : 'bg-background-darker border-white/5 text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                              >
                                {lvl === 'light' ? 'Leve' : lvl === 'balanced' ? 'Equilibrado' : 'Agressivo'}
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-2">
                            {rnnoiseLevel === 'light'
                              ? 'Preserva 100% dos tons e nuances da voz, ideal para ambientes silenciosos.'
                              : rnnoiseLevel === 'aggressive'
                              ? 'Filtra ruídos pesados e cliques altos de teclado mecânico.'
                              : 'Equilíbrio perfeito entre clareza vocal e remoção profunda de ruídos.'}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-white/5 divide-y divide-white/5 space-y-3.5">
                          {/* Echo Cancellation */}
                          <div className="flex items-center justify-between pt-1 first:pt-0">
                            <div className="space-y-0.5 pr-4">
                              <span className="text-xs font-bold text-white block">Cancelamento de Eco</span>
                              <p className="text-[11px] text-gray-400">
                                Impede microfonia ao usar caixas de som.
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={echoCancellation}
                              onClick={() => setEchoCancellation(!echoCancellation)}
                              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                                echoCancellation ? 'bg-brand-500' : 'bg-white/10'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                  echoCancellation ? 'translate-x-6' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          {/* Auto Gain Control */}
                          <div className="flex items-center justify-between pt-3.5">
                            <div className="space-y-0.5 pr-4">
                              <span className="text-xs font-bold text-white block">Controle Automático de Ganho</span>
                              <p className="text-[11px] text-gray-400">
                                Estabiliza o ganho para não estourar.
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={autoGainControl}
                              onClick={() => setAutoGainControl(!autoGainControl)}
                              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                                autoGainControl ? 'bg-brand-500' : 'bg-white/10'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                  autoGainControl ? 'translate-x-6' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* MODE 3: RNNOISE + SILERO VAD (IA AVANÇADA) */}
                    {audioProcessingMode === 'rnnoise_silero' && (
                      <div className="space-y-4 animate-in fade-in duration-150">
                        {/* Live VAD Intelligent Gate Status Banner */}
                        <div className="p-3 bg-background-darker/90 rounded-xl border border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            {isTestingMic ? (
                              vadLiveState.gateOpen ? (
                                <span className="relative flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                                </span>
                              ) : (
                                <span className="h-3 w-3 rounded-full bg-gray-500 inline-block" />
                              )
                            ) : (
                              <Activity className="w-4 h-4 text-brand-400" />
                            )}
                            <div>
                              <span className="text-xs font-bold text-white block">
                                {isTestingMic
                                  ? vadLiveState.gateOpen
                                    ? 'Portão de Voz Aberto • Transmitindo'
                                    : 'Silêncio Absoluto • Fundo Isolado (0 dB)'
                                  : 'Portão Neural Inteligente Ativo'}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {isTestingMic
                                  ? `Probabilidade de voz: ${Math.round(vadLiveState.speechProbability * 100)}%`
                                  : 'Corta 100% de respirações e barulhos residuais ao parar de falar'}
                              </span>
                            </div>
                          </div>

                          <span className="text-[10px] font-mono font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-500/20">
                            Silero VAD
                          </span>
                        </div>

                        {/* VAD Sensitivity Slider */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
                            <span>Sensibilidade do Portão de Fala</span>
                            <span className="text-brand-400 font-mono font-bold">
                              {Math.round(vadSensitivity * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="0.9"
                            step="0.05"
                            value={vadSensitivity}
                            onChange={(e) => setVadSensitivity(parseFloat(e.target.value))}
                            className="w-full accent-brand-500 h-1.5 bg-background-darker rounded-lg cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] text-gray-500">
                            <span>Falar Firme (10%)</span>
                            <span>Equilibrada (50%)</span>
                            <span>Alta Sensibilidade (90%)</span>
                          </div>
                        </div>

                        {/* VAD Hangover (ms) Slider */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
                            <span>Tempo de Liberação Suave (Hangover)</span>
                            <span className="text-brand-400 font-mono font-bold">
                              {vadHangover} ms
                            </span>
                          </div>
                          <input
                            type="range"
                            min="100"
                            max="500"
                            step="25"
                            value={vadHangover}
                            onChange={(e) => setVadHangover(parseInt(e.target.value, 10))}
                            className="w-full accent-brand-500 h-1.5 bg-background-darker rounded-lg cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] text-gray-500">
                            <span>Corte Rápido (100ms)</span>
                            <span>Suave Padrão (250ms)</span>
                            <span>Frases Longas (500ms)</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-white/5 divide-y divide-white/5 space-y-3.5">
                          {/* Echo Cancellation */}
                          <div className="flex items-center justify-between pt-1 first:pt-0">
                            <div className="space-y-0.5 pr-4">
                              <span className="text-xs font-bold text-white block">Cancelamento de Eco</span>
                              <p className="text-[11px] text-gray-400">
                                Impede microfonia e retorno de caixas de som.
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={echoCancellation}
                              onClick={() => setEchoCancellation(!echoCancellation)}
                              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                                echoCancellation ? 'bg-brand-500' : 'bg-white/10'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                  echoCancellation ? 'translate-x-6' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          {/* Auto Gain Control */}
                          <div className="flex items-center justify-between pt-3.5">
                            <div className="space-y-0.5 pr-4">
                              <span className="text-xs font-bold text-white block">Controle Automático de Ganho</span>
                              <p className="text-[11px] text-gray-400">
                                Normaliza o ganho automaticamente.
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={autoGainControl}
                              onClick={() => setAutoGainControl(!autoGainControl)}
                              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                                autoGainControl ? 'bg-brand-500' : 'bg-white/10'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                  autoGainControl ? 'translate-x-6' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Webcam & Video Section with Live Preview */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Configuração de Vídeo / Câmera
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-brand-400" />
                        Dispositivo de Câmera / Webcam
                      </label>
                      <select
                        value={selectedVideoDevice}
                        onChange={(e) => handleDeviceChange('video', e.target.value)}
                        className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500 cursor-pointer"
                      >
                        {videoDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Câmera (${d.deviceId.slice(0, 6)})`}
                          </option>
                        ))}
                        {videoDevices.length === 0 && <option value="">Nenhuma câmera detectada</option>}
                      </select>
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
                      <Video className="w-3.5 h-3.5" />
                      <span>{isTestingCamera ? 'Parar Teste de Vídeo' : 'Testar Câmera'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: NOTIFICAÇÕES & SONS */}
            {activeTab === 'notifications' && (
              <div className="space-y-6 animate-in fade-in">
                {/* Desktop Notifications */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Notificações de Área de Trabalho
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 flex items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <span className="text-xs font-bold text-white block">
                        Exibir Notificações no Computador
                      </span>
                      <p className="text-[11px] text-gray-400 leading-relaxed max-w-lg">
                        Receba avisos instantâneos na área de trabalho quando alguém enviar mensagens diretas ou mencionar você.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notificationsDesktop}
                      onClick={() => setNotificationsDesktop(!notificationsDesktop)}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
                        notificationsDesktop ? 'bg-brand-500' : 'bg-white/10'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          notificationsDesktop ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Sound Volume Slider */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Volume dos Efeitos Sonoros
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {soundVolume === 0 ? (
                          <VolumeX className="w-4 h-4 text-gray-500" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-brand-400" />
                        )}
                        <span className="text-xs font-semibold text-white">Volume dos Sons</span>
                      </div>
                      <span className="text-xs font-bold font-mono text-brand-400">{soundVolume}%</span>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={soundVolume}
                      onChange={(e) => setSoundVolume(Number(e.target.value))}
                      className="w-full accent-brand-500 cursor-pointer h-2 bg-background-dark rounded-lg"
                    />
                  </div>
                </div>

                {/* Individual Sound Toggles with Test Buttons */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Efeitos Sonoros do Aplicativo
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 divide-y divide-white/5 space-y-3.5">
                    {/* Voice Channel Join / Leave */}
                    <div className="flex items-center justify-between pt-1 first:pt-0">
                      <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-bold text-white block">Entrada e Saída de Chamadas</span>
                        <p className="text-[11px] text-gray-400">Toca o chime ao entrar ou desconectar de um canal de voz.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            playJoinVoiceSound();
                            setTimeout(playLeaveVoiceSound, 350);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
                        >
                          <Play className="w-3 h-3 text-brand-400" />
                          <span>Ouvir</span>
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={soundChannelEvents}
                          onClick={() => setSoundChannelEvents(!soundChannelEvents)}
                          className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                            soundChannelEvents ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                              soundChannelEvents ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Mute / Unmute */}
                    <div className="flex items-center justify-between pt-3.5">
                      <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-bold text-white block">Mutar e Desmutar Microfone</span>
                        <p className="text-[11px] text-gray-400">Feedback sonoro imediato ao alternar seu microfone.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            playMuteSound();
                            setTimeout(playUnmuteSound, 250);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
                        >
                          <Play className="w-3 h-3 text-brand-400" />
                          <span>Ouvir</span>
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={soundMuteEvents}
                          onClick={() => setSoundMuteEvents(!soundMuteEvents)}
                          className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                            soundMuteEvents ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                              soundMuteEvents ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Messages and Mentions */}
                    <div className="flex items-center justify-between pt-3.5">
                      <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-bold text-white block">Novas Mensagens e Menções</span>
                        <p className="text-[11px] text-gray-400">Alerta sonoro sutil ao receber mensagens no chat.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => playMessageSound(false)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
                        >
                          <Play className="w-3 h-3 text-brand-400" />
                          <span>Ouvir</span>
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={soundMessageEvents}
                          onClick={() => setSoundMessageEvents(!soundMessageEvents)}
                          className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                            soundMessageEvents ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                              soundMessageEvents ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PREFERÊNCIAS DO SISTEMA */}
            {activeTab === 'preferences' && (
              <div className="space-y-6 animate-in fade-in">
                {/* Desktop and Window Behavior */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Comportamento do Aplicativo (Desktop)
                  </h4>

                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 divide-y divide-white/5 space-y-4">
                    {/* Item: Manter na Gaveta / Bandeja */}
                    <div className="flex items-center justify-between pt-1 first:pt-0">
                      <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">
                            Manter na bandeja do sistema ao fechar
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                            Ativo por padrão
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                          Ao clicar no botão de fechar (✕), o ZeroVC permanece aberto na gaveta / bandeja do sistema (próximo ao relógio) para você continuar em chamadas de voz e receber notificações sem interrupções.
                        </p>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={minimizeToTray}
                        onClick={() => setMinimizeToTray(!minimizeToTray)}
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                          minimizeToTray ? 'bg-brand-500' : 'bg-white/10'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                            minimizeToTray ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Item: Iniciar com o Windows / Sistema */}
                    <div className="flex items-center justify-between pt-4">
                      <div className="space-y-1 pr-4">
                        <span className="text-sm font-bold text-white block">
                          Inicializar com o Sistema Operacional
                        </span>
                        <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                          Abre o ZeroVC automaticamente ao ligar o computador (em segundo plano na bandeja), pronto para uso imediato.
                        </p>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoStart}
                        onClick={() => setAutoStart(!autoStart)}
                        className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                          autoStart ? 'bg-brand-500' : 'bg-white/10'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                            autoStart ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Item: Aceleração por Hardware */}
                    <div className="pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 pr-4">
                          <span className="text-sm font-bold text-white block">
                            Aceleração Gráfica por Hardware (GPU)
                          </span>
                          <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                            Utiliza a placa de vídeo para renderização com alto desempenho e codificação nativa (NVENC/AMF/QSV) nas transmissões.
                          </p>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={hardwareAcceleration}
                          onClick={() => setHardwareAcceleration(!hardwareAcceleration)}
                          className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                            hardwareAcceleration ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                              hardwareAcceleration ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {typeof window !== 'undefined' && window.electronAPI?.relaunchApp && (
                        <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-between gap-3 text-xs text-brand-300">
                          <span>A alteração da aceleração de hardware no Electron requer reiniciar o app.</span>
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.relaunchApp?.()}
                            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex-shrink-0 shadow"
                          >
                            Reiniciar Agora
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ATALHOS DO TECLADO */}
            {activeTab === 'keybinds' && (
              <div className="space-y-6 flex-1 overflow-y-auto no-scrollbar pr-1">
                <KeybindSettingsView />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- SUBMODALS FOR ACCOUNT EDITING --- */}

      {/* 0. Edit Display Name Modal */}
      {isEditDisplayNameOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditDisplayNameOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <form
            onSubmit={handleSaveDisplayName}
            className="bg-background-darkest w-full max-w-sm max-h-[92dvh] my-auto rounded-3xl p-4 sm:p-5 border border-white/10 shadow-2xl space-y-4 overflow-y-auto no-scrollbar animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Alterar Nome de Exibição</h4>
              <button
                type="button"
                onClick={() => setIsEditDisplayNameOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Este é o nome visível para os outros usuários nos servidores e conversas.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Nome de Exibição
              </label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                maxLength={64}
                className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                placeholder={user.username}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditDisplayNameOpen(false)}
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingDisplayName}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md cursor-pointer"
              >
                {isSavingDisplayName ? 'Salvando...' : 'Salvar Nome'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 1. Edit Username Modal */}
      {isEditUsernameOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditUsernameOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <form
            onSubmit={handleSaveUsername}
            className="bg-background-darkest w-full max-w-sm max-h-[92dvh] my-auto rounded-3xl p-4 sm:p-5 border border-white/10 shadow-2xl space-y-4 overflow-y-auto no-scrollbar animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Alterar Nome de Usuário</h4>
              <button
                type="button"
                onClick={() => setIsEditUsernameOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Digite seu novo identificador <strong>@</strong>. Permitido apenas letras minúsculas, números e sublinhado (_), sem espaços, acentos, maiúsculas ou símbolos.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Novo @
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">@</span>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => {
                    setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                    setUsernameError(null);
                  }}
                  maxLength={32}
                  className="w-full bg-background-darker border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono lowercase"
                  placeholder="novo_usuario"
                  autoFocus
                />
              </div>
              {usernameError && <span className="text-[11px] text-dnd block mt-1">{usernameError}</span>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditUsernameOpen(false)}
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingUsername}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md cursor-pointer"
              >
                {isSavingUsername ? 'Salvando...' : 'Salvar @'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Edit Email Modal */}
      {isEditEmailOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditEmailOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <form
            onSubmit={handleSaveEmail}
            className="bg-background-darkest w-full max-w-sm max-h-[92dvh] my-auto rounded-3xl p-4 sm:p-5 border border-white/10 shadow-2xl space-y-4 overflow-y-auto no-scrollbar animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Alterar E-mail</h4>
              <button
                type="button"
                onClick={() => setIsEditEmailOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Novo E-mail
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
                  placeholder="seu_novo_email@dominio.com"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Senha Atual (Confirmação)
                </label>
                <input
                  type="password"
                  value={emailCurrentPassword}
                  onChange={(e) => setEmailCurrentPassword(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                  placeholder="Digite sua senha atual..."
                />
              </div>

              {emailError && <span className="text-[11px] text-dnd block">{emailError}</span>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditEmailOpen(false)}
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingEmail}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md cursor-pointer"
              >
                {isSavingEmail ? 'Salvando...' : 'Salvar E-mail'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Edit Phone Modal */}
      {isEditPhoneOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditPhoneOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <form
            onSubmit={handleSavePhone}
            className="bg-background-darkest w-full max-w-sm max-h-[92dvh] my-auto rounded-3xl p-4 sm:p-5 border border-white/10 shadow-2xl space-y-4 overflow-y-auto no-scrollbar animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                {user.phone_number ? 'Editar Número de Telefone' : 'Adicionar Número de Telefone'}
              </h4>
              <button
                type="button"
                onClick={() => setIsEditPhoneOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Vincule seu número para recuperação de conta e notificações.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Número de Celular
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => {
                  setNewPhone(e.target.value);
                  setPhoneError(null);
                }}
                className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
                placeholder="(11) 98765-4321"
                autoFocus
              />
              {phoneError && <span className="text-[11px] text-dnd block mt-1">{phoneError}</span>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditPhoneOpen(false)}
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingPhone}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md cursor-pointer"
              >
                {isSavingPhone ? 'Salvando...' : 'Salvar Telefone'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Change Password Modal */}
      {isChangePasswordOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsChangePasswordOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <form
            onSubmit={handleSavePassword}
            className="bg-background-darkest w-full max-w-sm max-h-[92dvh] my-auto rounded-3xl p-4 sm:p-5 border border-white/10 shadow-2xl space-y-4 overflow-y-auto no-scrollbar animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Mudar Senha</h4>
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Senha Atual
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Confirmar Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  placeholder="Repita a nova senha"
                />
              </div>

              {passwordError && <span className="text-[11px] text-dnd block">{passwordError}</span>}
              {passwordSuccess && <span className="text-[11px] text-emerald-400 block font-semibold">Senha alterada com sucesso!</span>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(false)}
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingPassword || passwordSuccess}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md cursor-pointer"
              >
                {isSavingPassword ? 'Salvando...' : 'Salvar Nova Senha'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. 2FA Modal */}
      {is2FAModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIs2FAModalOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <form
            onSubmit={handleToggle2FA}
            className="bg-background-darkest w-full max-w-md max-h-[92dvh] my-auto rounded-3xl p-4 sm:p-5 border border-white/10 shadow-2xl space-y-4 overflow-y-auto no-scrollbar animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-400" />
                <span>{user.two_factor_enabled ? 'Desativar Autenticação 2FA' : 'Configurar Autenticação 2FA (TOTP)'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIs2FAModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!user.two_factor_enabled && qrCodeData && (
              <div className="flex flex-col items-center p-3 bg-white rounded-2xl">
                <img src={qrCodeData} alt="2FA QR Code" className="w-36 h-36 sm:w-44 sm:h-44 object-contain" />
                {secretKey && (
                  <span className="text-[10px] text-gray-800 font-mono select-all mt-1">
                    Chave manual: {secretKey}
                  </span>
                )}
              </div>
            )}

            <p className="text-xs text-gray-400 leading-relaxed">
              {user.two_factor_enabled
                ? 'Para desativar a autenticação de dois fatores, insira o código de 6 dígitos gerado pelo seu app autenticador.'
                : 'Escaneie o QR Code acima no Google Authenticator ou Authy e digite o código de 6 dígitos para ativar.'}
            </p>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Código de 6 dígitos
              </label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-center text-base tracking-widest text-white font-mono placeholder-gray-500 focus:outline-none focus:border-brand-500"
                placeholder="123456"
                autoFocus
              />
              {twoFactorError && <span className="text-[11px] text-dnd block mt-1">{twoFactorError}</span>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIs2FAModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={is2FALoading || totpCode.length < 6}
                className={`text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md transition-all cursor-pointer ${
                  user.two_factor_enabled
                    ? 'bg-dnd hover:bg-dnd/80 text-white'
                    : 'bg-brand-500 hover:bg-brand-600 text-white'
                }`}
              >
                {is2FALoading ? 'Validando...' : user.two_factor_enabled ? 'Desativar 2FA' : 'Ativar 2FA'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. 2FA Backup Codes Presentation Modal */}
      {showBackupCodesModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBackupCodesModal(false);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <div className="bg-background-darkest w-full max-w-md max-h-[92dvh] my-auto rounded-3xl p-4 sm:p-6 border border-white/10 shadow-2xl space-y-4 overflow-y-auto no-scrollbar animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <span>Códigos de Backup de 2FA</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowBackupCodesModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-200/90 leading-relaxed">
                Salve estes códigos em um local seguro! Cada código só pode ser usado <strong>uma única vez</strong> para acessar sua conta caso você perca seu aplicativo autenticador.
              </p>
            </div>

            {/* Grid of backup codes */}
            <div className="grid grid-cols-2 gap-2 p-3 sm:p-4 bg-background-darker rounded-2xl border border-white/5 font-mono text-center text-xs sm:text-sm font-bold text-emerald-400 tracking-wider">
              {backupCodes.map((code, idx) => (
                <div key={idx} className="p-2 bg-background-darkest/60 rounded-xl border border-white/5 select-all">
                  {code}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(backupCodes.join('\n'));
                    setCopiedBackupCodes(true);
                    setTimeout(() => setCopiedBackupCodes(false), 2000);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedBackupCodes ? 'Copiado!' : 'Copiar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `zerovc-2fa-backup-codes-${user?.username || 'user'}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar .txt</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowBackupCodesModal(false)}
                className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-5 py-1.5 rounded-xl shadow-md transition-all cursor-pointer"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Delete Account Confirmation Modal */}
      {isDeleteAccountOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDeleteAccountOpen(false);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in"
        >
          <form
            onSubmit={handleDeleteAccount}
            className="bg-background-darkest w-full max-w-md max-h-[92dvh] my-auto rounded-3xl p-4 sm:p-6 border border-dnd/30 shadow-2xl space-y-4 overflow-y-auto no-scrollbar animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-dnd flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Excluir Conta Permanentemente</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsDeleteAccountOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Você está prestes a excluir sua conta no ZeroVC. Esta ação <strong>NÃO pode ser desfeita</strong>. Digite sua senha atual para confirmar a exclusão.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Sua Senha Atual
              </label>
              <input
                type="password"
                value={deleteAccountPassword}
                onChange={(e) => setDeleteAccountPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-dnd"
                autoFocus
              />
              {deleteAccountError && <span className="text-[11px] text-dnd block mt-1">{deleteAccountError}</span>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteAccountOpen(false)}
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isDeletingAccount || !deleteAccountPassword.trim()}
                className="bg-dnd hover:bg-dnd/80 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isDeletingAccount ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <span>Confirmar Exclusão</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

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
