import React, { useState, useEffect } from 'react';
import { X, Mic, Volume2, Globe, LogOut, Shield, UserX, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getApiBaseUrl, setApiBaseUrl, api } from '../../lib/api';
import { User } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuthStore();
  const [serverUrl, setServerUrlState] = useState(getApiBaseUrl());
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [activeTab, setActiveTab] = useState<'voice' | 'account' | 'connection' | 'blocked'>('voice');
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Enumerate audio devices
    navigator.mediaDevices?.enumerateDevices().then((devices) => {
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      setAudioInputs(inputs);
      setAudioOutputs(outputs);
      if (inputs.length > 0) setSelectedInput(inputs[0].deviceId);
      if (outputs.length > 0) setSelectedOutput(outputs[0].deviceId);
    });

    if (activeTab === 'blocked') {
      loadBlockedUsers();
    }
  }, [isOpen, activeTab]);

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

  if (!isOpen) return null;

  const handleSaveServerUrl = () => {
    setApiBaseUrl(serverUrl.trim());
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex h-[580px] animate-in fade-in zoom-in-95 duration-150">
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
              <span>Minha Conta</span>
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
              {activeTab === 'voice' && 'Configurações de Voz'}
              {activeTab === 'account' && 'Minha Conta'}
              {activeTab === 'blocked' && 'Usuários Bloqueados'}
              {activeTab === 'connection' && 'Conexão e Servidor'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 flex-1 overflow-y-auto no-scrollbar">
            {activeTab === 'voice' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                    Dispositivo de Entrada (Microfone)
                  </label>
                  <select
                    value={selectedInput}
                    onChange={(e) => setSelectedInput(e.target.value)}
                    className="w-full bg-background-darkest text-white px-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm cursor-pointer"
                  >
                    {audioInputs.length === 0 ? (
                      <option value="">Microfone Padrão</option>
                    ) : (
                      audioInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microfone ${d.deviceId.slice(0, 5)}`}
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
                    onChange={(e) => setSelectedOutput(e.target.value)}
                    className="w-full bg-background-darkest text-white px-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm cursor-pointer"
                  >
                    {audioOutputs.length === 0 ? (
                      <option value="">Alto-falante Padrão</option>
                    ) : (
                      audioOutputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Alto-falante ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 bg-background-darkest p-4 rounded-xl border border-white/5">
                  <div className="w-16 h-16 rounded-full bg-brand-500 flex items-center justify-center text-2xl font-bold text-white">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span>{user?.username?.[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{user?.username}</h3>
                    <p className="text-sm text-gray-400">{user?.email}</p>
                  </div>
                </div>
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
                              <img src={bUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
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
