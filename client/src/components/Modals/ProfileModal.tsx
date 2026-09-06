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
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore, ThemeMode, AccentColor, ChatDensity, ScreenshareQuality, DmPrivacy } from '../../stores/settingsStore';
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

  // Audio / Device Fields
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>('');
  const [selectedOutput, setSelectedOutput] = useState<string>('');
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [inputMode, setInputMode] = useState<'activity' | 'ptt'>('activity');
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
    echoCancellation,
    noiseSuppression,
    autoGainControl,
    screenshareQuality,
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
    setEchoCancellation,
    setNoiseSuppression,
    setAutoGainControl,
    setScreenshareQuality,
    setDmPrivacy,
  } = useSettingsStore();

  // Video devices & camera testing
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
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

      navigator.mediaDevices?.enumerateDevices().then((devices) => {
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        const videos = devices.filter((d) => d.kind === 'videoinput');
        setAudioInputs(inputs);
        setAudioOutputs(outputs);
        setVideoDevices(videos);
        if (inputs[0]) setSelectedInput(inputs[0].deviceId);
        if (outputs[0]) setSelectedOutput(outputs[0].deviceId);
        if (videos[0]) setSelectedVideoDevice(videos[0].deviceId);
      }).catch(() => {});
    } else {
      stopMicTest();
      stopCameraTest();
    }
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
    const trimmed = newUsername.trim();
    if (!/^[a-zA-Z0-9]{2,32}$/.test(trimmed)) {
      setUsernameError('O @ deve conter apenas letras e números (2 a 32 caracteres), sem espaços ou símbolos.');
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

  // Mic test logic
  const startMicTest = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedInput ? { exact: selectedInput } : undefined },
      });
      micStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(checkLevel);
      };

      checkLevel();
      setIsTestingMic(true);
    } catch (err) {
      console.error('Failed to start mic test:', err);
    }
  };

  const stopMicTest = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setMicLevel(0);
  };

  const handleDeviceChange = async (type: 'input' | 'output', deviceId: string) => {
    if (type === 'input') {
      setSelectedInput(deviceId);
      await livekit.setAudioInputDevice(deviceId);
      if (isTestingMic) {
        stopMicTest();
        setTimeout(startMicTest, 100);
      }
    } else {
      setSelectedOutput(deviceId);
      await livekit.setAudioOutputDevice(deviceId);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in select-none">
      {/* Unified Fixed Container */}
      <div className="bg-background-dark w-full max-w-5xl h-[680px] rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row relative animate-in zoom-in-95">
        {/* Left Sidebar */}
        <div className="w-full md:w-60 bg-background-darker p-4 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/5 flex-shrink-0">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-2 block">
              Configurações de Usuário
            </span>

            {/* Tab 1: Minha Conta */}
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'account'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Minha Conta</span>
            </button>

            {/* Tab: Privacidade & Segurança */}
            <button
              type="button"
              onClick={() => setActiveTab('privacy')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'privacy'
                  ? 'bg-brand-500 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Privacidade</span>
            </button>

            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 my-2 block pt-2">
              Configurações do App
            </span>

            {/* Tab: Aparência */}
            <button
              type="button"
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
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
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
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
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
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
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
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
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
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
          <div className="pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-xs font-semibold text-dnd hover:bg-dnd/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>

        {/* Right Main Content Area */}
        <div className="flex-1 flex flex-col h-full bg-background-dark overflow-hidden">
          {/* Top Bar with Title and Close Button */}
          <div className="p-5 pb-3 flex items-center justify-between border-b border-white/5 flex-shrink-0">
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
                  {activeTab === 'privacy' && 'Privacidade & Segurança'}
                  {activeTab === 'appearance' && 'Aparência & Customização'}
                  {activeTab === 'audio' && 'Voz & Vídeo'}
                  {activeTab === 'notifications' && 'Notificações & Sons'}
                  {activeTab === 'preferences' && 'Preferências do Sistema'}
                  {activeTab === 'keybinds' && 'Atalhos do Teclado'}
                </h3>
                <p className="text-xs text-gray-400">
                  {activeTab === 'account' && 'Gerencie seus dados de acesso, nome de usuário, e-mail e segurança.'}
                  {activeTab === 'profile' && 'Personalize seu avatar, banner, nome de exibição e recado.'}
                  {activeTab === 'privacy' && 'Controle quem pode interagir com você e suas preferências de privacidade.'}
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
          <div className="flex-1 p-5 overflow-y-auto no-scrollbar space-y-5">
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

                          {/* Status Indicator Dot */}
                          <span
                            className={`absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-2 border-background-darker z-10 ${
                              user.status === 'online'
                                ? 'bg-online'
                                : user.status === 'idle'
                                ? 'bg-idle'
                                : user.status === 'dnd'
                                ? 'bg-dnd'
                                : 'bg-offline'
                            }`}
                          />
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

                    {/* Email row */}
                    <div className="flex items-center justify-between py-1 border-b border-white/5">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          E-mail
                        </span>
                        <div className="flex items-center gap-2">
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

                {/* Group 3: Senha e Autenticação */}
                <div className="p-5 bg-background-darker/80 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-brand-400" />
                    <span>Senha e Autenticação</span>
                  </h4>

                  {/* Password row */}
                  <div className="p-3.5 bg-background-darkest/80 rounded-2xl border border-white/5 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white block">Senha da Conta</span>
                      <span className="text-xs text-gray-500 font-mono tracking-widest">••••••••••••••••</span>
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

                  {/* 2FA Card */}
                  <div className="p-3.5 bg-background-darkest/80 rounded-2xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Autenticação de Dois Fatores (2FA)</span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.2 rounded-full border ${
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

                  {/* Active Session Info */}
                  <div className="p-3.5 bg-background-darkest/80 rounded-2xl border border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">Sessão Atual</span>
                        <span className="text-[11px] text-gray-400">ZeroVC Desktop • Online agora</span>
                      </div>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                  </div>
                </div>

                {/* Group 4: Privacidade e Gerenciamento de Dados (LGPD / GDPR) */}
                <div className="p-5 bg-background-darker/80 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                    <span>Privacidade e Gestão de Dados</span>
                  </h4>

                  {/* Export Data */}
                  <div className="p-3.5 bg-background-darkest/80 rounded-2xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            )}

            {/* TAB: PRIVACIDADE & SEGURANÇA */}
            {activeTab === 'privacy' && (
              <div className="space-y-6 animate-in fade-in">
                {/* DMs Section */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Mensagens Diretas (DMs)
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

                {/* 2FA Status Shortcut */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Segurança da Conta
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white block">Autenticação em Dois Fatores (2FA)</span>
                      <p className="text-[11px] text-gray-400">
                        {user.two_factor_enabled
                          ? 'Sua conta está protegida com autenticação via código TOTP.'
                          : 'Adicione uma camada extra de segurança à sua conta.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('account')}
                      className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3.5 py-1.5 rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      {user.two_factor_enabled ? 'Gerenciar 2FA' : 'Configurar 2FA'}
                    </button>
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
                </div>

                {/* Voice Mode: Activity vs PTT */}
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                    Modo de Entrada de Voz
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setInputMode('activity')}
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
                      onClick={() => setInputMode('ptt')}
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

                {/* WebRTC Advanced Audio Processing Filters */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Processamento de Áudio Avançado (WebRTC)
                  </h4>
                  <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 divide-y divide-white/5 space-y-3.5">
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
                        className={`w-11 h-5.5 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
                          echoCancellation ? 'bg-brand-500' : 'bg-white/10'
                        }`}
                      >
                        <div
                          className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                            echoCancellation ? 'translate-x-5.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Noise Suppression */}
                    <div className="flex items-center justify-between pt-3.5">
                      <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-bold text-white block">Supressão de Ruído de Fundo</span>
                        <p className="text-[11px] text-gray-400">
                          Filtra barulhos de teclado, ventilador e ruídos estáticos do ambiente.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={noiseSuppression}
                        onClick={() => setNoiseSuppression(!noiseSuppression)}
                        className={`w-11 h-5.5 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
                          noiseSuppression ? 'bg-brand-500' : 'bg-white/10'
                        }`}
                      >
                        <div
                          className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                            noiseSuppression ? 'translate-x-5.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Auto Gain Control */}
                    <div className="flex items-center justify-between pt-3.5">
                      <div className="space-y-0.5 pr-4">
                        <span className="text-xs font-bold text-white block">Controle Automático de Ganho</span>
                        <p className="text-[11px] text-gray-400">
                          Normaliza o volume da sua voz automaticamente para que você não fique muito baixo ou estourado.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoGainControl}
                        onClick={() => setAutoGainControl(!autoGainControl)}
                        className={`w-11 h-5.5 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
                          autoGainControl ? 'bg-brand-500' : 'bg-white/10'
                        }`}
                      >
                        <div
                          className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                            autoGainControl ? 'translate-x-5.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
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
                        onChange={(e) => setSelectedVideoDevice(e.target.value)}
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

                {/* Default Screen Share Quality */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Transmissão de Tela Padrão
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { id: '720p30', label: '720p (30 FPS)', desc: 'Leve / Econômico' },
                      { id: '1080p30', label: '1080p (30 FPS)', desc: 'Recomendado' },
                      { id: '1080p60', label: '1080p (60 FPS)', desc: 'Fluido (Jogos)' },
                      { id: 'source', label: 'Original', desc: 'Resolução Máxima' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setScreenshareQuality(item.id as ScreenshareQuality)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          screenshareQuality === item.id
                            ? 'border-brand-500 bg-brand-500/15 text-white'
                            : 'border-white/10 bg-background-darkest text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        <span className="font-bold text-xs block mb-0.5">{item.label}</span>
                        <span className="text-[10px] text-gray-400 block">{item.desc}</span>
                      </button>
                    ))}
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
                          className={`w-11 h-5.5 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
                            soundChannelEvents ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                              soundChannelEvents ? 'translate-x-5.5' : 'translate-x-0'
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
                          className={`w-11 h-5.5 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
                            soundMuteEvents ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                              soundMuteEvents ? 'translate-x-5.5' : 'translate-x-0'
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
                          className={`w-11 h-5.5 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
                            soundMessageEvents ? 'bg-brand-500' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                              soundMessageEvents ? 'translate-x-5.5' : 'translate-x-0'
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
                    <div className="flex items-center justify-between pt-4">
                      <div className="space-y-1 pr-4">
                        <span className="text-sm font-bold text-white block">
                          Aceleração Gráfica por Hardware (GPU)
                        </span>
                        <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
                          Utiliza a placa de vídeo do computador para renderização ultra-fluida e menor consumo de processador (CPU).
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <form
            onSubmit={handleSaveDisplayName}
            className="bg-background-darkest w-full max-w-sm rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Alterar Nome de Exibição</h4>
              <button
                type="button"
                onClick={() => setIsEditDisplayNameOpen(false)}
                className="text-gray-400 hover:text-white"
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
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <form
            onSubmit={handleSaveUsername}
            className="bg-background-darkest w-full max-w-sm rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Alterar Nome de Usuário</h4>
              <button
                type="button"
                onClick={() => setIsEditUsernameOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              Digite seu novo identificador <strong>@</strong>. Permitido apenas letras e números, sem espaços ou símbolos.
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
                    setNewUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''));
                    setUsernameError(null);
                  }}
                  maxLength={32}
                  className="w-full bg-background-darker border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
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
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingUsername}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md"
              >
                {isSavingUsername ? 'Salvando...' : 'Salvar @'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Edit Email Modal */}
      {isEditEmailOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <form
            onSubmit={handleSaveEmail}
            className="bg-background-darkest w-full max-w-sm rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Alterar E-mail</h4>
              <button
                type="button"
                onClick={() => setIsEditEmailOpen(false)}
                className="text-gray-400 hover:text-white"
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
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingEmail}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md"
              >
                {isSavingEmail ? 'Salvando...' : 'Salvar E-mail'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Edit Phone Modal */}
      {isEditPhoneOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <form
            onSubmit={handleSavePhone}
            className="bg-background-darkest w-full max-w-sm rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                {user.phone_number ? 'Editar Número de Telefone' : 'Adicionar Número de Telefone'}
              </h4>
              <button
                type="button"
                onClick={() => setIsEditPhoneOpen(false)}
                className="text-gray-400 hover:text-white"
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
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingPhone}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md"
              >
                {isSavingPhone ? 'Salvando...' : 'Salvar Telefone'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Change Password Modal */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <form
            onSubmit={handleSavePassword}
            className="bg-background-darkest w-full max-w-sm rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Mudar Senha</h4>
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(false)}
                className="text-gray-400 hover:text-white"
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
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingPassword || passwordSuccess}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md"
              >
                {isSavingPassword ? 'Salvando...' : 'Salvar Nova Senha'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. 2FA Modal */}
      {is2FAModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <form
            onSubmit={handleToggle2FA}
            className="bg-background-darkest w-full max-w-md rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-400" />
                <span>{user.two_factor_enabled ? 'Desativar Autenticação 2FA' : 'Configurar Autenticação 2FA (TOTP)'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIs2FAModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!user.two_factor_enabled && qrCodeData && (
              <div className="flex flex-col items-center p-3 bg-white rounded-2xl">
                <img src={qrCodeData} alt="2FA QR Code" className="w-44 h-44 object-contain" />
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
                className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={is2FALoading || totpCode.length < 6}
                className={`text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md transition-all ${
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-background-darkest w-full max-w-md rounded-3xl p-6 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <span>Códigos de Backup de 2FA</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowBackupCodesModal(false)}
                className="text-gray-400 hover:text-white"
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
            <div className="grid grid-cols-2 gap-2 p-4 bg-background-darker rounded-2xl border border-white/5 font-mono text-center text-sm font-bold text-emerald-400 tracking-wider">
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <form
            onSubmit={handleDeleteAccount}
            className="bg-background-darkest w-full max-w-md rounded-3xl p-6 border border-dnd/30 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-dnd flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Excluir Conta Permanentemente</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsDeleteAccountOpen(false)}
                className="text-gray-400 hover:text-white"
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
