import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Image, Sparkles, Check, LogOut, Mic, Volume2, Shield, Lock, UploadCloud } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { livekit } from '../../lib/livekit';
import { api } from '../../lib/api';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile, logout } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'profile' | 'audio' | 'security'>('profile');

  // Profile Fields
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bannerUrl, setBannerUrl] = useState(user?.banner_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
  const [status, setStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>(user?.status || 'online');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

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

  // Load media devices
  useEffect(() => {
    if (isOpen) {
      navigator.mediaDevices?.enumerateDevices().then((devices) => {
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        setAudioInputs(inputs);
        setAudioOutputs(outputs);
        if (inputs[0]) setSelectedInput(inputs[0].deviceId);
        if (outputs[0]) setSelectedOutput(outputs[0].deviceId);
      }).catch(() => {});
    } else {
      stopMicTest();
    }
  }, [isOpen]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAvatar(true);
    try {
      const res = await api.upload.avatar(file);
      setAvatarUrl(res.url);
    } catch (err: any) {
      alert(err?.message || 'Erro ao enviar foto de perfil');
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBanner(true);
    try {
      const res = await api.upload.banner(file);
      setBannerUrl(res.url);
    } catch (err: any) {
      alert(err?.message || 'Erro ao enviar banner');
    } finally {
      setIsUploadingBanner(false);
      e.target.value = '';
    }
  };

  const startMicTest = async () => {
    try {
      setIsTestingMic(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInput ? { deviceId: { exact: selectedInput } } : true,
      });
      micStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
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
        const normalized = Math.min(Math.round((avg / 128) * 100), 100);
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

  const handleDeviceChange = (type: 'input' | 'output', deviceId: string) => {
    if (type === 'input') {
      setSelectedInput(deviceId);
      livekit.setAudioInputDevice(deviceId);
    } else {
      setSelectedOutput(deviceId);
      livekit.setAudioOutputDevice(deviceId);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile({
        display_name: displayName,
        avatar_url: avatarUrl,
        banner_url: bannerUrl,
        bio: bio,
        custom_status: customStatus,
        status: status,
      });
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 600);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !user) return null;

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'online': return 'Disponível';
      case 'idle': return 'Ausente';
      case 'dnd': return 'Não Perturbe';
      default: return 'Invisível';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="bg-background-darkest w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row max-h-[90vh] animate-in fade-in zoom-in-95">
        
        {/* Left Side: Navigation Tabs */}
        <div className="w-full md:w-56 bg-background-darker/60 p-4 border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 mb-3">
              Configurações
            </h3>

            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs md:text-sm font-semibold transition-colors ${
                activeTab === 'profile'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Meu Perfil</span>
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs md:text-sm font-semibold transition-colors ${
                activeTab === 'audio'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Áudio & Voz</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs md:text-sm font-semibold transition-colors ${
                activeTab === 'security'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Segurança</span>
            </button>
          </div>

          {/* Logout Button */}
          <div className="pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={() => {
                onClose();
                logout();
              }}
              className="w-full px-3 py-2 rounded-xl bg-dnd/15 hover:bg-dnd text-dnd hover:text-white text-xs md:text-sm font-semibold transition-all flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>

        {/* Right Side: Tab Contents */}
        <div className="flex-1 p-5 md:p-6 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              {activeTab === 'profile' && 'Perfil de Usuário'}
              {activeTab === 'audio' && 'Configurações de Áudio & Voz'}
              {activeTab === 'security' && 'Segurança da Conta'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* TAB 1: Profile */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSave} className="space-y-5">
              {/* Hidden File Inputs */}
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <input
                ref={bannerFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerUpload}
                className="hidden"
              />

              {/* Interactive Profile Visual Header (Banner & Avatar Previews) */}
              <div className="bg-background-darker rounded-3xl overflow-hidden border border-white/5 shadow-xl">
                {/* 1. Banner Preview & Clickable Upload Button */}
                <div
                  onClick={() => bannerFileInputRef.current?.click()}
                  className="relative h-28 md:h-32 w-full bg-gradient-to-r from-brand-600 via-indigo-700 to-purple-800 cursor-pointer group flex items-center justify-center overflow-hidden"
                  title="Clique para alterar o banner"
                >
                  {bannerUrl ? (
                    <img
                      src={bannerUrl}
                      alt="Banner"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : null}

                  {/* Banner Hover Action Overlay */}
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white text-xs font-semibold">
                    <Image className="w-4 h-4 text-brand-300" />
                    <span>{isUploadingBanner ? 'Enviando banner...' : 'Clique para alterar o banner'}</span>
                  </div>

                  <div className="absolute top-2.5 right-2.5 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-xl text-[11px] text-white/90 font-medium flex items-center gap-1.5 border border-white/10 group-hover:bg-brand-500 transition-colors">
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>{isUploadingBanner ? 'Enviando...' : 'Trocar Banner'}</span>
                  </div>
                </div>

                {/* 2. Avatar Preview & Clickable Upload Button */}
                <div className="px-5 pb-5 flex items-end justify-between -mt-10">
                  <div className="relative">
                    <div
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="relative w-20 h-20 rounded-full border-4 border-background-darker bg-brand-500 cursor-pointer group overflow-hidden shadow-2xl transition-transform hover:scale-105"
                      title="Clique para alterar a foto de perfil"
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={displayName || user.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                          {displayName?.[0]?.toUpperCase() || user.username[0]?.toUpperCase() || 'U'}
                        </div>
                      )}

                      {/* Avatar Hover Action Overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold">
                        <Camera className="w-5 h-5 mb-0.5" />
                        <span>{isUploadingAvatar ? 'ENVIANDO...' : 'MUDAR'}</span>
                      </div>
                    </div>

                    {/* Status Dot */}
                    <div
                      className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background-darker ${getStatusColor(
                        status
                      )}`}
                    />
                  </div>

                  <div className="text-right pb-1">
                    <span className="text-xs text-gray-400 font-medium block">
                      Toque na foto ou no banner para fazer upload
                    </span>
                  </div>
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Nome de Exibição
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={user.username}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Status de Conexão
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['online', 'idle', 'dnd', 'offline'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                        status === s
                          ? 'bg-white/10 border-white/30 text-white shadow-sm'
                          : 'bg-background-darker border-white/5 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(s)}`} />
                      <span>{getStatusLabel(s)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Status */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Status Personalizado
                </label>
                <input
                  type="text"
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
                  placeholder="Ex: 🎧 Ouvindo música"
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Sobre Mim (Bio)
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  placeholder="Fale um pouco sobre você..."
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>

              {/* Save Profile Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving || isUploadingAvatar || isUploadingBanner}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-xs md:text-sm transition-all shadow-md shadow-brand-500/20 flex items-center gap-1.5"
                >
                  {savedSuccess ? (
                    <>
                      <Check className="w-4 h-4" /> Salvo!
                    </>
                  ) : isSaving ? (
                    'Salvando...'
                  ) : (
                    'Salvar Alterações'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Audio & Voice */}
          {activeTab === 'audio' && (
            <div className="space-y-5">
              {/* Input Device */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-brand-400" />
                  Dispositivo de Entrada (Microfone)
                </label>
                <select
                  value={selectedInput}
                  onChange={(e) => handleDeviceChange('input', e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                >
                  {audioInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microfone (${d.deviceId.slice(0, 6)})`}
                    </option>
                  ))}
                  {audioInputs.length === 0 && <option value="">Microfone Padrão do Sistema</option>}
                </select>
              </div>

              {/* Output Device */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-brand-400" />
                  Dispositivo de Saída (Fone / Alto-falante)
                </label>
                <select
                  value={selectedOutput}
                  onChange={(e) => handleDeviceChange('output', e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
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
                  <span className="text-xs font-bold text-gray-200">Teste de Microfone</span>
                  <button
                    type="button"
                    onClick={isTestingMic ? stopMicTest : startMicTest}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isTestingMic ? 'bg-dnd text-white' : 'bg-brand-500 text-white'
                    }`}
                  >
                    {isTestingMic ? 'Parar Teste' : 'Testar Mic'}
                  </button>
                </div>

                {/* Level Meter */}
                <div className="w-full h-3 bg-background-darkest rounded-full overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-75"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
                <span className="text-[11px] text-gray-400 block">
                  {isTestingMic
                    ? `Nível de captação: ${micLevel}%`
                    : 'Fale algo para verificar se o microfone está captando seu áudio.'}
                </span>
              </div>

              {/* Voice Mode: Activity vs PTT */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Modo de Entrada
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInputMode('activity')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      inputMode === 'activity'
                        ? 'bg-brand-500/15 border-brand-500 text-white'
                        : 'bg-background-darker border-white/5 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <span className="font-bold text-xs block mb-0.5">Detecção de Voz</span>
                    <span className="text-[11px] text-gray-400">Ativa o microfone automaticamente ao falar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInputMode('ptt')}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      inputMode === 'ptt'
                        ? 'bg-brand-500/15 border-brand-500 text-white'
                        : 'bg-background-darker border-white/5 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <span className="font-bold text-xs block mb-0.5">Push-to-Talk</span>
                    <span className="text-[11px] text-gray-400">Aperte uma tecla para transmitir seu áudio</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Security */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-4 bg-background-darker rounded-2xl border border-white/5 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-brand-400" />
                  Autenticação & Senha
                </h4>
                <p className="text-xs text-gray-400">
                  Sua conta está protegida com criptografia hash Bcrypt e tokens JWT assinados.
                </p>

                <div className="pt-2">
                  <span className="text-xs text-gray-300 font-semibold block mb-1">E-mail Cadastrado</span>
                  <span className="text-xs text-gray-400 bg-background-darkest px-3 py-1.5 rounded-lg border border-white/5 inline-block font-mono">
                    {user.email || 'Não informado'}
                  </span>
                </div>
              </div>

              {/* 2FA Card */}
              <div className="p-4 bg-background-darker rounded-2xl border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white mb-0.5">Autenticação em 2 Etapas (2FA TOTP)</h4>
                  <span className="text-[11px] text-gray-400">Proteja sua conta com Google Authenticator ou Authy</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ATIVO
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
