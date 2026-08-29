import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  Volume2,
  Globe,
  LogOut,
  Shield,
  UserX,
  Trash2,
  KeyRound,
  QrCode,
  Check,
  Copy,
  Lock,
  Mail,
  Keyboard,
  Radio,
  RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getApiBaseUrl, setApiBaseUrl, api, formatAssetUrl } from '../../lib/api';
import { livekit } from '../../lib/livekit';
import { User } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, logout, setUser } = useAuthStore();
  const [serverUrl, setServerUrlState] = useState(getApiBaseUrl());
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState(
    localStorage.getItem('zerovc_audio_input_device') || ''
  );
  const [selectedOutput, setSelectedOutput] = useState(
    localStorage.getItem('zerovc_audio_output_device') || ''
  );
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [activeTab, setActiveTab] = useState<'voice' | 'account' | 'connection' | 'blocked'>('voice');
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);

  // Mic test state
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 2FA state
  const [twoFactorData, setTwoFactorData] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [isGenerating2FA, setIsGenerating2FA] = useState(false);
  const [isEnabling2FA, setIsEnabling2FA] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Change Email state
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  // Voice Input Mode & Push-to-Talk
  const [inputMode, setInputMode] = useState<'activity' | 'ptt'>(
    (localStorage.getItem('zerovc_input_mode') as 'activity' | 'ptt') || 'activity'
  );
  const [pttKey, setPttKey] = useState<string>(
    localStorage.getItem('zerovc_ptt_key') || 'Space'
  );
  const [isRecordingPTT, setIsRecordingPTT] = useState(false);

  const loadAudioDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setIsLoadingDevices(true);

    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some((d) => d.kind === 'audioinput' && d.label !== '');

      // If browser hasn't granted mic permission yet, prompt briefly to retrieve device names
      if (!hasLabels && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch (permErr) {
          console.warn('[AudioDevices] Mic permission not granted yet:', permErr);
        }
      }

      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');

      setAudioInputs(inputs);
      setAudioOutputs(outputs);

      const savedInput = localStorage.getItem('zerovc_audio_input_device');
      if (savedInput && inputs.some((d) => d.deviceId === savedInput)) {
        setSelectedInput(savedInput);
      } else if (inputs.length > 0) {
        const defaultId = inputs[0].deviceId;
        setSelectedInput(defaultId);
        localStorage.setItem('zerovc_audio_input_device', defaultId);
      }

      const savedOutput = localStorage.getItem('zerovc_audio_output_device');
      if (savedOutput && outputs.some((d) => d.deviceId === savedOutput)) {
        setSelectedOutput(savedOutput);
      } else if (outputs.length > 0) {
        const defaultOutId = outputs[0].deviceId;
        setSelectedOutput(defaultOutId);
        localStorage.setItem('zerovc_audio_output_device', defaultOutId);
      }
    } catch (err) {
      console.error('Failed to load audio devices:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopMicTest();
      return;
    }

    loadAudioDevices();

    const handleDeviceChange = () => {
      loadAudioDevices();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    if (activeTab === 'blocked') {
      loadBlockedUsers();
    }

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
      stopMicTest();
    };
  }, [isOpen, activeTab]);

  const handleInputChange = (deviceId: string) => {
    setSelectedInput(deviceId);
    localStorage.setItem('zerovc_audio_input_device', deviceId);
    livekit.setAudioInputDevice(deviceId);

    if (isTestingMic) {
      stopMicTest();
      setTimeout(() => startMicTest(deviceId), 100);
    }
  };

  const handleOutputChange = (deviceId: string) => {
    setSelectedOutput(deviceId);
    localStorage.setItem('zerovc_audio_output_device', deviceId);
    livekit.setAudioOutputDevice(deviceId);
  };

  const startMicTest = async (overrideDeviceId?: string) => {
    const targetDevice = overrideDeviceId || selectedInput;
    try {
      setIsTestingMic(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: targetDevice ? { deviceId: { exact: targetDevice } } : true,
      });
      micStreamRef.current = stream;

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(checkLevel);
      };

      checkLevel();
    } catch (err) {
      console.error('Failed to test microphone:', err);
      setIsTestingMic(false);
    }
  };

  const stopMicTest = () => {
    setIsTestingMic(false);
    setMicLevel(0);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Handle PTT key recording
  useEffect(() => {
    if (!isRecordingPTT) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPttKey(e.code);
      localStorage.setItem('zerovc_ptt_key', e.code);
      setIsRecordingPTT(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isRecordingPTT]);

  const loadBlockedUsers = async () => {
    setIsLoadingBlocks(true);
    try {
      const list = await api.users.listBlocks();
      setBlockedUsers(list || []);
    } catch (err) {
      console.error('Failed to load blocked users:', err);
    } finally {
      setIsLoadingBlocks(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    try {
      await api.users.unblock(userId);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      console.error('Failed to unblock user:', err);
    }
  };

  const handleInputModeChange = (mode: 'activity' | 'ptt') => {
    setInputMode(mode);
    localStorage.setItem('zerovc_input_mode', mode);
  };

  const handleStart2FASetup = async () => {
    setIsGenerating2FA(true);
    setTwoFactorError('');
    try {
      const res = await api.auth.generate2FA();
      setTwoFactorData(res);
    } catch (err: any) {
      setTwoFactorError(err.message || 'Falha ao iniciar configuração 2FA');
    } finally {
      setIsGenerating2FA(false);
    }
  };

  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorData || twoFactorCode.trim().length !== 6) return;

    setIsEnabling2FA(true);
    setTwoFactorError('');
    try {
      await api.auth.enable2FA({
        secret: twoFactorData.secret,
        code: twoFactorCode.trim(),
      });
      setUser({ two_factor_enabled: true });
      setTwoFactorData(null);
      setTwoFactorCode('');
    } catch (err: any) {
      setTwoFactorError(err.message || 'Código de 2FA inválido');
    } finally {
      setIsEnabling2FA(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword.trim()) return;

    setIsDisabling2FA(true);
    setTwoFactorError('');
    try {
      await api.auth.disable2FA({ password: disablePassword });
      setUser({ two_factor_enabled: false });
      setShowDisableModal(false);
      setDisablePassword('');
    } catch (err: any) {
      setTwoFactorError(err.message || 'Senha incorreta');
    } finally {
      setIsDisabling2FA(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'A confirmação da nova senha não confere.' });
      return;
    }

    setIsChangingPassword(true);
    try {
      await api.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordMsg({ type: 'success', text: 'Senha alterada com sucesso!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Erro ao alterar senha' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg(null);

    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailMsg({ type: 'error', text: 'Digite um e-mail válido.' });
      return;
    }

    setIsChangingEmail(true);
    try {
      const res = await api.auth.changeEmail({
        password: emailPassword,
        new_email: newEmail.trim(),
      });
      setUser({ email: res.email });
      setEmailMsg({ type: 'success', text: 'E-mail atualizado com sucesso!' });
      setNewEmail('');
      setEmailPassword('');
    } catch (err: any) {
      setEmailMsg({ type: 'error', text: err.message || 'Erro ao alterar e-mail' });
    } finally {
      setIsChangingEmail(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveServerUrl = () => {
    setApiBaseUrl(serverUrl.trim());
    window.location.reload();
  };

  const formatKeyName = (key: string) => {
    if (key === 'Space') return 'Espaço';
    if (key === 'ControlLeft' || key === 'ControlRight') return 'Ctrl';
    if (key === 'ShiftLeft' || key === 'ShiftRight') return 'Shift';
    if (key === 'AltLeft' || key === 'AltRight') return 'Alt';
    return key.replace('Key', '');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex h-[620px] animate-in fade-in zoom-in-95 duration-150">
        {/* Left Sidebar Tabs */}
        <div className="w-56 bg-background-darker p-4 flex flex-col justify-between border-r border-black/20">
          <div className="space-y-1">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">
              Configurações
            </div>

            <button
              onClick={() => setActiveTab('voice')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'voice' ? 'bg-background-light text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Voz e Vídeo</span>
            </button>

            <button
              onClick={() => setActiveTab('account')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'account' ? 'bg-background-light text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Conta & Segurança</span>
            </button>

            <button
              onClick={() => setActiveTab('blocked')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'blocked' ? 'bg-background-light text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              <UserX className="w-4 h-4" />
              <span>Bloqueados</span>
            </button>

            <button
              onClick={() => setActiveTab('connection')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'connection' ? 'bg-background-light text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Servidor / Conexão</span>
            </button>
          </div>

          {/* Logout button */}
          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-dnd hover:bg-dnd/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da Conta</span>
          </button>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col bg-background-dark">
          {/* Header */}
          <div className="p-6 pb-2 flex items-center justify-between border-b border-white/5">
            <h2 className="text-xl font-bold text-white">
              {activeTab === 'voice' && 'Configurações de Voz & Áudio'}
              {activeTab === 'account' && 'Conta & Segurança'}
              {activeTab === 'blocked' && 'Usuários Bloqueados'}
              {activeTab === 'connection' && 'Conexão e Servidor'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 flex-1 overflow-y-auto no-scrollbar space-y-6">
            {activeTab === 'voice' && (
              <div className="space-y-6">
                {/* Audio Devices */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-gray-300 uppercase">
                        Dispositivo de Entrada (Microfone)
                      </label>
                      <button
                        type="button"
                        onClick={loadAudioDevices}
                        disabled={isLoadingDevices}
                        className="text-[11px] text-brand-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                        <span>Recarregar</span>
                      </button>
                    </div>

                    <select
                      value={selectedInput}
                      onChange={(e) => handleInputChange(e.target.value)}
                      className="w-full bg-background-darkest text-white px-3 py-2.5 rounded-lg border border-white/10 focus:outline-none focus:border-brand-500 text-sm cursor-pointer"
                    >
                      {audioInputs.length === 0 ? (
                        <option value="">Microfone Padrão do Sistema</option>
                      ) : (
                        audioInputs.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Microfone ${i + 1}`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                      Dispositivo de Saída (Alto-falante / Fone)
                    </label>
                    <select
                      value={selectedOutput}
                      onChange={(e) => handleOutputChange(e.target.value)}
                      className="w-full bg-background-darkest text-white px-3 py-2.5 rounded-lg border border-white/10 focus:outline-none focus:border-brand-500 text-sm cursor-pointer"
                    >
                      {audioOutputs.length === 0 ? (
                        <option value="">Alto-falante Padrão do Sistema</option>
                      ) : (
                        audioOutputs.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Alto-falante / Fone ${i + 1}`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Mic Test Section */}
                  <div className="p-4 bg-background-darkest rounded-xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-white block">Teste de Microfone</span>
                        <span className="text-[11px] text-gray-400">
                          Fale para verificar se seu microfone está captando áudio corretamente.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={isTestingMic ? stopMicTest : () => startMicTest()}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          isTestingMic
                            ? 'bg-dnd hover:bg-rose-700 text-white'
                            : 'bg-brand-500 hover:bg-brand-600 text-white'
                        }`}
                      >
                        {isTestingMic ? 'Parar Teste' : 'Testar'}
                      </button>
                    </div>

                    <div className="h-2.5 bg-background-dark rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-75"
                        style={{ width: `${isTestingMic ? micLevel : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Input Mode (Voice Activity vs Push-to-Talk) */}
                <div className="pt-4 border-t border-white/5">
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-3">
                    Modo de Entrada de Voz
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleInputModeChange('activity')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        inputMode === 'activity'
                          ? 'border-brand-500 bg-brand-500/10 text-white'
                          : 'border-white/10 bg-background-darkest text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">Detecção de Voz</span>
                        <Radio className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] text-gray-400">
                        O microfone transmite automaticamente quando você fala.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleInputModeChange('ptt')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        inputMode === 'ptt'
                          ? 'border-brand-500 bg-brand-500/10 text-white'
                          : 'border-white/10 bg-background-darkest text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">Aperte para Falar (PTT)</span>
                        <Keyboard className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] text-gray-400">
                        Transmita voz apenas enquanto segura a tecla configurada.
                      </span>
                    </button>
                  </div>

                  {/* PTT Key Binding Config */}
                  {inputMode === 'ptt' && (
                    <div className="mt-4 p-4 bg-background-darkest rounded-xl border border-white/5 flex items-center justify-between animate-in fade-in">
                      <div>
                        <span className="text-xs font-semibold text-white block">Atalho do PTT</span>
                        <span className="text-[11px] text-gray-400">
                          Pressione e segure esta tecla para falar nos canais de voz.
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsRecordingPTT(true)}
                        className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                          isRecordingPTT
                            ? 'bg-dnd/20 border-dnd text-dnd animate-pulse'
                            : 'bg-background-light border-white/10 text-brand-300 hover:bg-white/10'
                        }`}
                      >
                        {isRecordingPTT ? 'Pressione qualquer tecla...' : formatKeyName(pttKey)}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                {/* Profile Card */}
                <div className="flex items-center gap-4 bg-background-darkest p-4 rounded-xl border border-white/5">
                  <div className="w-14 h-14 rounded-full bg-brand-500 flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
                    {user?.avatar_url ? (
                      <img src={formatAssetUrl(user.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span>{user?.username?.[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="truncate">
                    <h3 className="text-base font-bold text-white truncate">{user?.display_name || user?.username}</h3>
                    <p className="text-xs text-gray-400 truncate">@{user?.username} • {user?.email}</p>
                  </div>
                </div>

                {/* 2FA / TOTP Section */}
                <div className="p-4 bg-background-darkest rounded-xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-brand-400" />
                        <h4 className="text-sm font-bold text-white">Autenticação em Dois Fatores (2FA)</h4>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Proteja sua conta solicitando um código temporário de 6 dígitos no login.
                      </p>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        user?.two_factor_enabled
                          ? 'bg-online/20 text-online border border-online/30'
                          : 'bg-gray-500/20 text-gray-400 border border-white/10'
                      }`}
                    >
                      {user?.two_factor_enabled ? 'Ativado' : 'Desativado'}
                    </span>
                  </div>

                  {twoFactorError && (
                    <div className="p-2.5 bg-dnd/20 text-dnd text-xs rounded-lg">{twoFactorError}</div>
                  )}

                  {!user?.two_factor_enabled ? (
                    !twoFactorData ? (
                      <button
                        type="button"
                        onClick={handleStart2FASetup}
                        disabled={isGenerating2FA}
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors shadow cursor-pointer flex items-center gap-2"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>{isGenerating2FA ? 'Gerando...' : 'Configurar 2FA via Aplicativo'}</span>
                      </button>
                    ) : (
                      /* QR Code Setup Box */
                      <form onSubmit={handleConfirm2FA} className="pt-3 border-t border-white/5 space-y-4 animate-in fade-in">
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                          <div className="bg-white p-2 rounded-xl shadow">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                                twoFactorData.otpauth_uri
                              )}`}
                              alt="2FA QR Code"
                              className="w-32 h-32"
                            />
                          </div>

                          <div className="space-y-2 flex-1 text-center sm:text-left">
                            <p className="text-xs text-gray-300">
                              Escaneie o código QR com o <strong>Google Authenticator</strong> ou <strong>Authy</strong>.
                            </p>
                            <div className="flex items-center gap-2 bg-background-dark p-2 rounded-lg border border-white/10 text-xs font-mono">
                              <span className="text-gray-300 truncate flex-1">{twoFactorData.secret}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(twoFactorData.secret);
                                  setCopiedSecret(true);
                                  setTimeout(() => setCopiedSecret(false), 1500);
                                }}
                                className="text-brand-400 hover:text-brand-300 p-1 cursor-pointer"
                                title="Copiar chave"
                              >
                                {copiedSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                            Código de Verificação de 6 Dígitos
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              required
                              maxLength={6}
                              value={twoFactorCode}
                              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="123456"
                              className="w-36 bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-center font-mono tracking-widest text-white text-sm focus:outline-none focus:border-brand-500"
                            />
                            <button
                              type="submit"
                              disabled={isEnabling2FA || twoFactorCode.length !== 6}
                              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
                            >
                              {isEnabling2FA ? 'Verificando...' : 'Ativar 2FA'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setTwoFactorData(null)}
                              className="text-xs text-gray-400 hover:text-white px-2 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </form>
                    )
                  ) : (
                    <div>
                      {!showDisableModal ? (
                        <button
                          type="button"
                          onClick={() => setShowDisableModal(true)}
                          className="text-xs text-dnd hover:bg-dnd/10 px-3 py-1.5 rounded-lg font-medium transition-colors border border-dnd/20 cursor-pointer"
                        >
                          Desativar Autenticação em 2 Etapas
                        </button>
                      ) : (
                        <form onSubmit={handleDisable2FA} className="p-3 bg-background-dark rounded-xl border border-white/10 space-y-3 animate-in fade-in">
                          <label className="block text-xs font-bold text-gray-300 uppercase">
                            Digite sua senha para desativar o 2FA:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              required
                              value={disablePassword}
                              onChange={(e) => setDisablePassword(e.target.value)}
                              placeholder="••••••••"
                              className="flex-1 bg-background-darkest border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                            />
                            <button
                              type="submit"
                              disabled={isDisabling2FA || !disablePassword}
                              className="bg-dnd hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              {isDisabling2FA ? 'Desativando...' : 'Confirmar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowDisableModal(false);
                                setDisablePassword('');
                              }}
                              className="text-xs text-gray-400 hover:text-white px-2 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>

                {/* Change Password Form */}
                <form onSubmit={handleChangePassword} className="p-4 bg-background-darkest rounded-xl border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-brand-400" />
                    <h4 className="text-sm font-bold text-white">Trocar Senha</h4>
                  </div>

                  {passwordMsg && (
                    <div
                      className={`p-2.5 text-xs rounded-lg ${
                        passwordMsg.type === 'error' ? 'bg-dnd/20 text-dnd' : 'bg-online/20 text-online'
                      }`}
                    >
                      {passwordMsg.text}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Senha atual"
                      className="bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nova senha (min 6)"
                      className="bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirmar nova senha"
                      className="bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    {isChangingPassword ? 'Salvando...' : 'Salvar Nova Senha'}
                  </button>
                </form>

                {/* Change Email Form */}
                <form onSubmit={handleChangeEmail} className="p-4 bg-background-darkest rounded-xl border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-brand-400" />
                    <h4 className="text-sm font-bold text-white">Trocar E-mail</h4>
                  </div>

                  {emailMsg && (
                    <div
                      className={`p-2.5 text-xs rounded-lg ${
                        emailMsg.type === 'error' ? 'bg-dnd/20 text-dnd' : 'bg-online/20 text-online'
                      }`}
                    >
                      {emailMsg.text}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Novo endereço de e-mail"
                      className="bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    />
                    <input
                      type="password"
                      required
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      placeholder="Senha atual para confirmar"
                      className="bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingEmail || !newEmail || !emailPassword}
                    className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    {isChangingEmail ? 'Atualizando...' : 'Atualizar E-mail'}
                  </button>
                </form>
              </div>
            )}

            {activeTab === 'blocked' && (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">
                  Usuários bloqueados não podem enviar mensagens para você ou adicionar você como amigo.
                </p>

                {isLoadingBlocks ? (
                  <div className="text-sm text-gray-400 py-6 text-center">Carregando bloqueados...</div>
                ) : blockedUsers.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
                    <UserX className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Você não tem nenhum usuário bloqueado.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {blockedUsers.map((bUser) => (
                      <div
                        key={bUser.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-background-darkest border border-white/5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
                            {bUser.avatar_url ? (
                              <img src={formatAssetUrl(bUser.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <span>{bUser.display_name?.[0]?.toUpperCase() || bUser.username?.[0]?.toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-white block">
                              {bUser.display_name || bUser.username}
                            </span>
                            <span className="text-xs text-gray-400">@{bUser.username}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleUnblock(bUser.id)}
                          className="text-xs text-dnd hover:bg-dnd/10 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer border border-dnd/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Desbloquear</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'connection' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                    Endereço da API do Servidor ZeroVC
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Para conectar a uma VPS remota, altere para o IP ou domínio público (ex: http://123.45.67.89:8080).
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={serverUrl}
                      onChange={(e) => setServerUrlState(e.target.value)}
                      placeholder="http://localhost:8080"
                      className="flex-1 bg-background-darkest text-white px-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm font-mono"
                    />
                    <button
                      onClick={handleSaveServerUrl}
                      className="bg-brand-500 hover:bg-brand-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer"
                    >
                      Salvar & Recarregar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
