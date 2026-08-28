import React, { useState } from 'react';
import { X, Camera, Image, Sparkles, Check, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile, logout } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [bannerUrl, setBannerUrl] = useState(user?.banner_url || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
  const [status, setStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>(user?.status || 'online');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen || !user) return null;

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
      case 'dnd': return 'Não Perturbe / Ocupado';
      default: return 'Invisível';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="bg-background-darkest w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row max-h-[90vh] animate-in fade-in zoom-in-95">
        
        {/* Left Side: Form Controls */}
        <div className="flex-1 p-6 overflow-y-auto border-r border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-500" />
              Meu Perfil
            </h2>
            <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            {/* Display Name */}
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                Nome de Exibição (Apelido)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={user.username}
                className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Username (Read-only) */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Nome de Usuário (@)
              </label>
              <input
                type="text"
                disabled
                value={`@${user.username}`}
                className="w-full bg-background-darker/50 border border-white/5 rounded-lg px-3.5 py-2 text-sm text-gray-400 cursor-not-allowed"
              />
            </div>

            {/* Avatar URL */}
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                URL da Foto de Perfil (Avatar)
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://exemplo.com/avatar.png"
                className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Banner URL */}
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5" />
                URL da Imagem de Banner
              </label>
              <input
                type="url"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                placeholder="https://exemplo.com/banner.jpg"
                className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
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
                placeholder="Ex: Ouvindo música 🎧"
                className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Status Selector */}
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                Estado Online
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['online', 'idle', 'dnd', 'offline'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatus(st)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      status === st
                        ? 'border-brand-500 bg-brand-500/10 text-white'
                        : 'border-white/5 bg-background-darker text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(st)}`} />
                    <span>{getStatusLabel(st)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                Sobre Mim (Bio)
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Escreva algo sobre você..."
                className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>

            {/* Footer Buttons: Logout + Cancel + Save */}
            <div className="pt-4 mt-2 border-t border-white/5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  logout();
                }}
                className="px-3.5 py-2 rounded-xl bg-dnd/15 hover:bg-dnd text-dnd hover:text-white text-xs md:text-sm font-semibold transition-all flex items-center gap-2"
                title="Sair da sua conta"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da Conta</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs md:text-sm font-medium text-gray-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs md:text-sm transition-all shadow-md shadow-brand-500/20 flex items-center gap-1.5"
                >
                  {savedSuccess ? (
                    <>
                      <Check className="w-4 h-4" /> Salvo!
                    </>
                  ) : isSaving ? (
                    'Salvando...'
                  ) : (
                    'Salvar'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Side: Live Profile Preview */}
        <div className="hidden md:flex w-80 bg-background-darker flex-col items-center justify-center p-6 select-none relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>

          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Pré-visualização</span>

          {/* Profile Card Mockup */}
          <div className="w-full bg-background-darkest rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            {/* Banner */}
            <div
              className="h-24 bg-gradient-to-r from-brand-600 to-indigo-800 bg-cover bg-center"
              style={bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : {}}
            />

            <div className="px-4 pb-4 relative">
              {/* Avatar */}
              <div className="relative -mt-10 mb-3 inline-block">
                <div className="w-20 h-20 rounded-full bg-brand-500 border-4 border-background-darkest flex items-center justify-center text-2xl font-bold text-white shadow-xl overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{displayName?.[0]?.toUpperCase() || user.username[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div
                  className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-background-darkest ${getStatusColor(
                    status
                  )}`}
                />
              </div>

              {/* Names */}
              <div className="mb-3">
                <h3 className="text-lg font-bold text-white leading-tight">
                  {displayName || user.username}
                </h3>
                <span className="text-xs text-gray-400">@{user.username}</span>
              </div>

              {/* Custom Status */}
              {customStatus && (
                <div className="mb-3 p-2 bg-background-darker/80 rounded-lg text-xs text-gray-200 border border-white/5">
                  {customStatus}
                </div>
              )}

              {/* Bio */}
              {bio && (
                <div className="pt-2 border-t border-white/5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Sobre mim
                  </span>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap">{bio}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
