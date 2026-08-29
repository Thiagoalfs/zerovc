import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Shield,
  Plus,
  Trash2,
  Check,
  Users,
  Lock,
  Crown,
  MessageSquare,
  Volume2,
  Settings as SettingsIcon,
  UserCheck,
  AlertTriangle,
  Palette,
  Upload,
  Image as ImageIcon,
  ChevronDown,
} from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { Permissions } from '../../types';
import { api } from '../../lib/api';
import { ImageCropModal } from './ImageCropModal';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_ROLE_COLORS = [
  '#5865F2', // Blurple
  '#57F287', // Green
  '#FEE75C', // Yellow
  '#EB459E', // Fuchsia
  '#ED4245', // Red
  '#9B59B6', // Purple
  '#1ABC9C', // Teal
  '#E67E22', // Orange
  '#3498DB', // Blue
  '#99AAB5', // Gray
];

interface PermissionDefinition {
  flag: number;
  name: string;
  description: string;
  isMaster?: boolean;
}

const PERMISSION_GROUPS: { category: string; icon: React.ReactNode; permissions: PermissionDefinition[] }[] = [
  {
    category: 'Permissões Gerais',
    icon: <SettingsIcon className="w-4 h-4 text-brand-400" />,
    permissions: [
      {
        flag: Permissions.ADMINISTRATOR,
        name: 'Administrador (Permissão Mestre)',
        description: 'Membros com esta permissão têm acesso total irrestrito e ignoram todos os bloqueios de canais.',
        isMaster: true,
      },
      {
        flag: Permissions.MANAGE_GUILD,
        name: 'Gerenciar Servidor',
        description: 'Permite alterar o nome do servidor, ícone e configurações gerais.',
      },
      {
        flag: Permissions.MANAGE_ROLES,
        name: 'Gerenciar Cargos',
        description: 'Permite criar novos cargos e editar permissões de cargos inferiores.',
      },
      {
        flag: Permissions.MANAGE_CHANNELS,
        name: 'Gerenciar Canais e Categorias',
        description: 'Permite criar, editar, reordenar ou excluir canais e categorias.',
      },
    ],
  },
  {
    category: 'Moderação de Membros',
    icon: <UserCheck className="w-4 h-4 text-amber-400" />,
    permissions: [
      {
        flag: Permissions.KICK_MEMBERS,
        name: 'Expulsar Membros',
        description: 'Permite expulsar membros com cargos inferiores do servidor.',
      },
      {
        flag: Permissions.BAN_MEMBERS,
        name: 'Banir Membros',
        description: 'Permite banir membros com cargos inferiores permanentemente.',
      },
      {
        flag: Permissions.MUTE_MEMBERS,
        name: 'Silenciar Membros no Servidor',
        description: 'Permite aplicar timeout/silenciamento temporário ou permanente a membros.',
      },
    ],
  },
  {
    category: 'Permissões de Chat de Texto',
    icon: <MessageSquare className="w-4 h-4 text-sky-400" />,
    permissions: [
      {
        flag: Permissions.SEND_MESSAGES,
        name: 'Enviar Mensagens',
        description: 'Permite enviar mensagens de texto e iniciar conversas nos canais.',
      },
      {
        flag: Permissions.MANAGE_MESSAGES,
        name: 'Gerenciar Mensagens',
        description: 'Permite deletar mensagens de outros usuários e fixar mensagens.',
      },
      {
        flag: Permissions.ATTACH_FILES,
        name: 'Anexar Arquivos e Imagens',
        description: 'Permite enviar fotos, arquivos e mídias nos canais de texto.',
      },
    ],
  },
  {
    category: 'Permissões de Voz',
    icon: <Volume2 className="w-4 h-4 text-emerald-400" />,
    permissions: [
      {
        flag: Permissions.CONNECT_VOICE,
        name: 'Conectar em Canais de Voz',
        description: 'Permite entrar e ouvir conversas nos canais de voz.',
      },
      {
        flag: Permissions.SPEAK_VOICE,
        name: 'Falar em Voz',
        description: 'Permite ativar o microfone e transmitir áudio nos canais de voz.',
      },
      {
        flag: Permissions.MUTE_VOICE,
        name: 'Silenciar Membros em Voz',
        description: 'Permite silenciar o microfone de outros usuários na sala de voz.',
      },
      {
        flag: Permissions.DEAFEN_VOICE,
        name: 'Ensurdecer Membros em Voz',
        description: 'Permite desativar o áudio de outros usuários na sala de voz.',
      },
    ],
  },
];

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const {
    activeGuild,
    updateGuild,
    deleteGuild,
    createRole,
    updateRole,
    deleteRole,
    assignRole,
    removeRole,
  } = useGuildStore();

  const [activeTab, setActiveTab] = useState<'appearance' | 'roles' | 'members'>('appearance');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#5865F2');
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const [guildName, setGuildName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [appearanceMsg, setAppearanceMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Crop Modal State
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropType, setCropType] = useState<'guildIcon' | 'guildBanner'>('guildIcon');
  const [isCropOpen, setIsCropOpen] = useState(false);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (activeGuild) {
      setGuildName(activeGuild.name || '');
    }
  }, [activeGuild]);

  if (!isOpen || !activeGuild) return null;

  const isOwner = activeGuild.owner_id === user?.id;
  const roles = activeGuild.roles || [];
  const members = activeGuild.members || [];
  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  const handleSaveGuildName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guildName.trim() || guildName.trim() === activeGuild.name) return;

    setIsSavingName(true);
    setAppearanceMsg(null);
    try {
      await updateGuild(activeGuild.id, { name: guildName.trim() });
      setAppearanceMsg({ text: 'Nome do servidor atualizado com sucesso!', type: 'success' });
    } catch (err: any) {
      setAppearanceMsg({ text: err.message || 'Erro ao alterar nome do servidor', type: 'error' });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropType('guildIcon');
    setIsCropOpen(true);
    if (iconInputRef.current) iconInputRef.current.value = '';
  };

  const handleRemoveIcon = async () => {
    if (!confirm('Deseja remover o ícone do servidor?')) return;
    setIsUploadingIcon(true);
    try {
      await updateGuild(activeGuild.id, { icon_url: '' });
      setAppearanceMsg({ text: 'Ícone do servidor removido.', type: 'success' });
    } catch (err: any) {
      setAppearanceMsg({ text: err.message || 'Erro ao remover ícone', type: 'error' });
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropType('guildBanner');
    setIsCropOpen(true);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const handleCropConfirmed = async (croppedFile: File) => {
    setIsCropOpen(false);
    if (cropType === 'guildIcon') {
      setIsUploadingIcon(true);
      setAppearanceMsg(null);
      try {
        const res = await api.upload.guildIcon(croppedFile);
        await updateGuild(activeGuild.id, { icon_url: res.url });
        setAppearanceMsg({ text: 'Ícone do servidor alterado com sucesso!', type: 'success' });
      } catch (err: any) {
        setAppearanceMsg({ text: err.message || 'Erro ao enviar ícone', type: 'error' });
      } finally {
        setIsUploadingIcon(false);
      }
    } else {
      setIsUploadingBanner(true);
      setAppearanceMsg(null);
      try {
        const res = await api.upload.guildBanner(croppedFile);
        await updateGuild(activeGuild.id, { banner_url: res.url });
        setAppearanceMsg({ text: 'Banner do servidor alterado com sucesso!', type: 'success' });
      } catch (err: any) {
        setAppearanceMsg({ text: err.message || 'Erro ao enviar banner', type: 'error' });
      } finally {
        setIsUploadingBanner(false);
      }
    }
  };

  const handleRemoveBanner = async () => {
    if (!confirm('Deseja remover o banner do servidor?')) return;
    setIsUploadingBanner(true);
    try {
      await updateGuild(activeGuild.id, { banner_url: '' });
      setAppearanceMsg({ text: 'Banner do servidor removido.', type: 'success' });
    } catch (err: any) {
      setAppearanceMsg({ text: err.message || 'Erro ao remover banner', type: 'error' });
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleConfirmDeleteGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmText.trim() !== activeGuild.name.trim()) return;

    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteGuild(activeGuild.id);
      setIsDeleteModalOpen(false);
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir servidor');
      setIsDeleting(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    setIsCreatingRole(true);
    try {
      const created = await createRole(activeGuild.id, newRoleName.trim(), newRoleColor, 0);
      setSelectedRoleId(created.id);
      setNewRoleName('');
    } catch (err) {
      console.error('Failed to create role:', err);
    } finally {
      setIsCreatingRole(false);
    }
  };

  const handleUpdateRoleColor = async (color: string) => {
    if (!selectedRole) return;
    try {
      await updateRole(activeGuild.id, selectedRole.id, { color });
    } catch (err) {
      console.error('Failed to update role color:', err);
    }
  };

  const handleUpdateRoleName = async (name: string) => {
    if (!selectedRole || !name.trim()) return;
    try {
      await updateRole(activeGuild.id, selectedRole.id, { name });
    } catch (err) {
      console.error('Failed to update role name:', err);
    }
  };

  const handleTogglePermission = async (flag: number) => {
    if (!selectedRole || !isOwner) return;

    const currentPermissions = Number(selectedRole.permissions || 0);
    const hasAdmin = (currentPermissions & Permissions.ADMINISTRATOR) !== 0;

    let newPermissions: number;

    if (flag === Permissions.ADMINISTRATOR) {
      if (hasAdmin) {
        newPermissions = currentPermissions & ~Permissions.ADMINISTRATOR;
      } else {
        newPermissions = currentPermissions | Permissions.ADMINISTRATOR;
      }
    } else {
      const hasFlag = (currentPermissions & flag) !== 0;
      if (hasFlag) {
        newPermissions = currentPermissions & ~flag;
      } else {
        newPermissions = currentPermissions | flag;
      }
    }

    try {
      await updateRole(activeGuild.id, selectedRole.id, { permissions: newPermissions });
    } catch (err) {
      console.error('Failed to toggle permission:', err);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (confirm('Tem certeza que deseja excluir este cargo?')) {
      try {
        await deleteRole(activeGuild.id, roleId);
        if (selectedRoleId === roleId) {
          setSelectedRoleId(null);
        }
      } catch (err) {
        console.error('Failed to delete role:', err);
      }
    }
  };

  const handleToggleMemberRole = async (memberId: string, roleId: string, hasRole: boolean) => {
    try {
      if (hasRole) {
        await removeRole(activeGuild.id, memberId, roleId);
      } else {
        await assignRole(activeGuild.id, memberId, roleId);
      }
    } catch (err) {
      console.error('Failed to toggle role:', err);
    }
  };

  const isRoleAdmin = selectedRole ? (Number(selectedRole.permissions || 0) & Permissions.ADMINISTRATOR) !== 0 : false;
  const initials = activeGuild.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
        <div className="bg-background-darkest w-full max-w-5xl h-[650px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex animate-in fade-in zoom-in-95">
          
          <div className="w-60 bg-background-darker/60 p-4 border-r border-white/5 flex flex-col justify-between flex-shrink-0">
            <div className="space-y-4">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 block truncate">
                {activeGuild.name}
              </span>

              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('appearance')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'appearance'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <Palette className="w-4 h-4" />
                  <span>Aparência</span>
                </button>

                <button
                  onClick={() => setActiveTab('roles')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'roles'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Cargos e Permissões</span>
                </button>

                <button
                  onClick={() => setActiveTab('members')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'members'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Membros ({members.length})</span>
                </button>
              </nav>
            </div>

            <div className="space-y-2 pt-4 border-t border-white/5">
              {isOwner && (
                <button
                  onClick={() => {
                    setDeleteConfirmText('');
                    setDeleteError('');
                    setIsDeleteModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-dnd hover:bg-dnd/10 rounded-xl transition-colors cursor-pointer"
                >
                  <span>Excluir Servidor</span>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={onClose}
                className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
              >
                Fechar Configurações
              </button>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto flex flex-col no-scrollbar">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {activeTab === 'appearance' && 'Aparência do Servidor'}
                  {activeTab === 'roles' && 'Cargos e Permissões do Servidor'}
                  {activeTab === 'members' && 'Gerenciador de Membros'}
                </h2>
                <p className="text-xs text-gray-400">
                  {activeTab === 'appearance' && 'Personalize o nome, imagem de ícone e o banner de cabeçalho do seu servidor'}
                  {activeTab === 'roles' && 'Configure nomes, cores e permissões granulares dos cargos'}
                  {activeTab === 'members' && 'Atribua cargos aos membros do seu servidor'}
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {appearanceMsg && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in ${
                  appearanceMsg.type === 'success'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-dnd/15 text-dnd border border-dnd/30'
                }`}
              >
                <span>{appearanceMsg.text}</span>
                <button onClick={() => setAppearanceMsg(null)} className="text-gray-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="flex-1 overflow-y-auto space-y-6 no-scrollbar pr-1">
                <input
                  type="file"
                  ref={iconInputRef}
                  onChange={handleIconChange}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                />
                <input
                  type="file"
                  ref={bannerInputRef}
                  onChange={handleBannerChange}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                />

                <div className="bg-background-darker/60 border border-white/5 rounded-2xl p-4 space-y-3">
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                    Nome do Servidor
                  </label>
                  <form onSubmit={handleSaveGuildName} className="flex gap-2">
                    <input
                      type="text"
                      disabled={!isOwner}
                      value={guildName}
                      onChange={(e) => setGuildName(e.target.value)}
                      placeholder="Ex: Servidor dos Amigos"
                      maxLength={64}
                      className="flex-1 bg-background-darkest border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-50"
                    />
                    {isOwner && (
                      <button
                        type="submit"
                        disabled={isSavingName || !guildName.trim() || guildName.trim() === activeGuild.name}
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-brand-500/20 cursor-pointer"
                      >
                        {isSavingName ? 'Salvando...' : 'Salvar Nome'}
                      </button>
                    )}
                  </form>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-background-darker/60 border border-white/5 rounded-2xl p-4 flex flex-col justify-between space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                        Ícone do Servidor
                      </h4>
                      <p className="text-[11px] text-gray-400">
                        Aparece na barra lateral de servidores à esquerda.
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-background-dark border border-white/10 flex items-center justify-center font-bold text-white text-xl overflow-hidden shadow-lg flex-shrink-0 relative group">
                        {activeGuild.icon_url ? (
                          <img
                            src={activeGuild.icon_url}
                            alt={activeGuild.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{initials}</span>
                        )}
                        {isOwner && (
                          <div
                            onClick={() => iconInputRef.current?.click()}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-[10px] text-white font-semibold cursor-pointer transition-opacity"
                          >
                            <Upload className="w-5 h-5 mb-0.5" />
                            <span>Trocar</span>
                          </div>
                        )}
                      </div>

                      {isOwner && (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={isUploadingIcon}
                            onClick={() => iconInputRef.current?.click()}
                            className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>{isUploadingIcon ? 'Enviando...' : 'Carregar Imagem'}</span>
                          </button>
                          {activeGuild.icon_url && (
                            <button
                              type="button"
                              disabled={isUploadingIcon}
                              onClick={handleRemoveIcon}
                              className="text-gray-400 hover:text-dnd text-xs font-medium px-2 py-1 text-left transition-colors cursor-pointer"
                            >
                              Remover Imagem
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-background-darker/60 border border-white/5 rounded-2xl p-4 flex flex-col justify-between space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                        Banner do Servidor
                      </h4>
                      <p className="text-[11px] text-gray-400">
                        Exibido atrás do menu do servidor no topo dos canais.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="w-full h-24 rounded-xl bg-background-dark border border-white/10 overflow-hidden relative group flex items-center justify-center">
                        {activeGuild.banner_url ? (
                          <img
                            src={activeGuild.banner_url}
                            alt="Banner do Servidor"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-gray-500 text-xs">
                            <ImageIcon className="w-6 h-6 opacity-60" />
                            <span>Nenhum banner configurado</span>
                          </div>
                        )}

                        {isOwner && (
                          <div
                            onClick={() => bannerInputRef.current?.click()}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-xs text-white font-semibold cursor-pointer transition-opacity"
                          >
                            <Upload className="w-4 h-4" />
                            <span>{activeGuild.banner_url ? 'Alterar Banner' : 'Carregar Banner'}</span>
                          </div>
                        )}
                      </div>

                      {isOwner && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isUploadingBanner}
                            onClick={() => bannerInputRef.current?.click()}
                            className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>{isUploadingBanner ? 'Enviando...' : 'Carregar Banner'}</span>
                          </button>
                          {activeGuild.banner_url && (
                            <button
                              type="button"
                              disabled={isUploadingBanner}
                              onClick={handleRemoveBanner}
                              className="text-gray-400 hover:text-dnd text-xs font-medium px-2 py-1 transition-colors cursor-pointer"
                            >
                              Remover Banner
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-background-darker/60 border border-white/5 rounded-2xl p-4 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">
                      Pré-visualização do Cabeçalho
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      Veja como o topo da sua barra de canais está sendo exibido para os membros:
                    </p>
                  </div>

                  <div className="w-60 bg-background-darker rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                    <div
                      style={
                        activeGuild.banner_url
                          ? {
                              backgroundImage: `url(${activeGuild.banner_url})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : undefined
                      }
                      className={`w-full px-4 border-b border-black/20 flex justify-between font-bold text-gray-100 relative overflow-hidden ${
                        activeGuild.banner_url ? 'h-36 pt-3.5 items-start' : 'h-12 items-center'
                      }`}
                    >
                      {activeGuild.banner_url && (
                        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/35 to-transparent pointer-events-none" />
                      )}
                      <span className="truncate max-w-[170px] text-sm font-bold text-white relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                        {activeGuild.name}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0 relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                    </div>

                    <div className="p-3 space-y-1.5 opacity-60">
                      <div className="h-4 bg-white/10 rounded w-3/4" />
                      <div className="h-4 bg-white/5 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="flex-1 flex gap-6 overflow-hidden">
                <div className="w-60 flex flex-col gap-3 flex-shrink-0">
                  {isOwner && (
                    <form onSubmit={handleCreateRole} className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Novo cargo..."
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        className="flex-1 bg-background-darker border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                      />
                      <button
                        type="submit"
                        disabled={isCreatingRole || !newRoleName.trim()}
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white p-1.5 rounded-xl transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </form>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar pr-1">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          selectedRole?.id === role.id
                            ? 'bg-white/10 text-white border border-white/10 shadow-sm'
                            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: role.color }}
                          />
                          <span className="truncate">{role.name}</span>
                        </div>
                        {isOwner && roles.length > 1 && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(role.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 hover:text-dnd p-1 rounded transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedRole ? (
                  <div className="flex-1 overflow-y-auto space-y-6 no-scrollbar pr-1">
                    <div className="bg-background-darker/60 border border-white/5 rounded-2xl p-4 space-y-4">
                      <div>
                        <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-2">
                          Nome do Cargo
                        </label>
                        <input
                          type="text"
                          disabled={!isOwner}
                          value={selectedRole.name}
                          onChange={(e) => handleUpdateRoleName(e.target.value)}
                          className="w-full bg-background-darkest border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-brand-500 disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block mb-2">
                          Cor do Cargo
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {PRESET_ROLE_COLORS.map((c) => (
                            <button
                              key={c}
                              disabled={!isOwner}
                              onClick={() => handleUpdateRoleColor(c)}
                              className={`w-7 h-7 rounded-xl transition-transform hover:scale-110 flex items-center justify-center shadow-md cursor-pointer ${
                                selectedRole.color === c ? 'ring-2 ring-white scale-110' : ''
                              }`}
                              style={{ backgroundColor: c }}
                            >
                              {selectedRole.color === c && <Check className="w-4 h-4 text-white drop-shadow" />}
                            </button>
                          ))}
                          {isOwner && (
                            <input
                              type="color"
                              value={selectedRole.color}
                              onChange={(e) => handleUpdateRoleColor(e.target.value)}
                              className="w-7 h-7 rounded-xl bg-transparent border-0 cursor-pointer p-0"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {PERMISSION_GROUPS.map((group) => (
                        <div
                          key={group.category}
                          className="bg-background-darker/60 border border-white/5 rounded-2xl p-4 space-y-3"
                        >
                          <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-white/5 pb-2">
                            {group.icon}
                            <span>{group.category}</span>
                          </div>

                          <div className="space-y-3">
                            {group.permissions.map((perm) => {
                              const permValue = Number(selectedRole.permissions || 0);
                              const isChecked = (permValue & perm.flag) !== 0 || (!perm.isMaster && isRoleAdmin);

                              return (
                                <div
                                  key={perm.flag}
                                  className="flex items-center justify-between py-1 gap-4"
                                >
                                  <div>
                                    <span className="text-xs font-semibold text-gray-200 block">
                                      {perm.name}
                                    </span>
                                    <span className="text-[11px] text-gray-400 block leading-tight">
                                      {perm.description}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={!isOwner || (!perm.isMaster && isRoleAdmin)}
                                    onClick={() => handleTogglePermission(perm.flag)}
                                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isChecked ? 'bg-brand-500' : 'bg-gray-700'
                                    } ${(!isOwner || (!perm.isMaster && isRoleAdmin)) ? 'opacity-80 cursor-not-allowed' : ''}`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                        isChecked ? 'translate-x-4' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
                    Nenhum cargo selecionado.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'members' && (
              <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-background-darker/60 border border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.username}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span>{member.display_name?.[0]?.toUpperCase() || member.username[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-white block">
                          {member.display_name || member.username}
                        </span>
                        <span className="text-xs text-gray-400">@{member.username}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {roles.map((role) => {
                        const hasRole = (member.roles || []).some((r) => r.id === role.id);
                        return (
                          <button
                            key={role.id}
                            disabled={!isOwner}
                            onClick={() => handleToggleMemberRole(member.id, role.id, hasRole)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                              hasRole
                                ? 'bg-white/10 text-white border border-white/20'
                                : 'opacity-40 hover:opacity-100 text-gray-400 border border-transparent'
                            }`}
                            style={hasRole ? { color: role.color } : {}}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: role.color }}
                            />
                            <span>{role.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-background-darkest w-full max-w-md rounded-2xl p-6 shadow-2xl border border-dnd/30 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-dnd">
              <div className="p-3 bg-dnd/15 rounded-2xl">
                <AlertTriangle className="w-6 h-6 text-dnd" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Excluir '{activeGuild.name}'</h3>
                <span className="text-xs text-dnd font-medium">Esta ação não pode ser desfeita</span>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Você tem certeza de que deseja excluir o servidor <strong className="text-white">{activeGuild.name}</strong>?
              Todos os canais, mensagens, mídias e cargos associados serão permanentemente destruídos.
            </p>

            {deleteError && (
              <div className="p-2.5 rounded-xl bg-dnd/15 border border-dnd/30 text-xs font-semibold text-dnd">
                {deleteError}
              </div>
            )}

            <form onSubmit={handleConfirmDeleteGuild} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Digite o nome do servidor para confirmar:
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder={activeGuild.name}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-dnd transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || deleteConfirmText.trim() !== activeGuild.name.trim()}
                  className="bg-dnd hover:bg-red-600 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-lg shadow-dnd/20 cursor-pointer"
                >
                  {isDeleting ? 'Excluindo...' : 'Excluir Servidor'}
                </button>
              </div>
            </form>
          </div>
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
    </>
  );
};
