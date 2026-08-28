import React, { useState } from 'react';
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
} from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { Permissions } from '../../types';

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
  const { activeGuild, createRole, updateRole, deleteRole, assignRole, removeRole } = useGuildStore();

  const [activeTab, setActiveTab] = useState<'roles' | 'members'>('roles');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#5865F2');
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  if (!isOpen || !activeGuild) return null;

  const isOwner = activeGuild.owner_id === user?.id;
  const roles = activeGuild.roles || [];
  const members = activeGuild.members || [];
  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

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
      // Toggle admin master switch
      if (hasAdmin) {
        newPermissions = currentPermissions & ~Permissions.ADMINISTRATOR;
      } else {
        newPermissions = currentPermissions | Permissions.ADMINISTRATOR;
      }
    } else {
      // Toggle specific flag
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="bg-background-darkest w-full max-w-5xl h-[650px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex animate-in fade-in zoom-in-95">
        
        {/* Left Navigation Sidebar */}
        <div className="w-56 bg-background-darker/60 p-4 border-r border-white/5 flex flex-col justify-between flex-shrink-0">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 block mb-3 truncate">
              {activeGuild.name}
            </span>

            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('roles')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
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
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
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

          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
          >
            Fechar Configurações
          </button>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col no-scrollbar">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/5">
            <div>
              <h2 className="text-lg font-bold text-white">
                {activeTab === 'roles' ? 'Cargos e Permissões do Servidor' : 'Gerenciador de Membros'}
              </h2>
              <p className="text-xs text-gray-400">
                {activeTab === 'roles'
                  ? 'Configure nomes, cores e permissões granulares dos cargos'
                  : 'Atribua cargos aos membros do seu servidor'}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {activeTab === 'roles' ? (
            <div className="flex-1 flex gap-6 overflow-hidden">
              {/* Roles List */}
              <div className="w-60 flex flex-col gap-3 flex-shrink-0">
                {/* Create Role Input */}
                {isOwner && (
                  <form onSubmit={handleCreateRole} className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Novo cargo..."
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      className="flex-1 bg-background-darker border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                    />
                    <button
                      type="submit"
                      disabled={isCreatingRole || !newRoleName.trim()}
                      className="p-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white cursor-pointer"
                      title="Criar Cargo"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1 no-scrollbar">
                  {roles.map((role) => {
                    const isSelected = selectedRole?.id === role.id;
                    const hasMaster = (Number(role.permissions || 0) & Permissions.ADMINISTRATOR) !== 0;

                    return (
                      <div
                        key={role.id}
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-white/10 text-white shadow-sm border border-white/10'
                            : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                            style={{ backgroundColor: role.color }}
                          />
                          <span className="truncate">{role.name}</span>
                          {hasMaster && (
                            <span title="Administrador Mestre">
                              <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            </span>
                          )}
                        </div>

                        {isOwner && roles.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(role.id);
                            }}
                            className="text-gray-500 hover:text-dnd p-1 rounded transition-colors"
                            title="Excluir cargo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Role Details & Permissions Editor */}
              {selectedRole ? (
                <div className="flex-1 overflow-y-auto space-y-5 pl-4 border-l border-white/5 pr-1 no-scrollbar">
                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                        Nome do Cargo
                      </label>
                      <input
                        type="text"
                        disabled={!isOwner}
                        value={selectedRole.name}
                        onChange={(e) => handleUpdateRoleName(e.target.value)}
                        className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    {/* Role Color Picker */}
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                        Cor do Cargo
                      </label>
                      <div className="flex flex-wrap gap-2.5">
                        {PRESET_ROLE_COLORS.map((color) => (
                          <button
                            key={color}
                            disabled={!isOwner}
                            type="button"
                            onClick={() => handleUpdateRoleColor(color)}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow cursor-pointer"
                            style={{ backgroundColor: color }}
                          >
                            {selectedRole.color.toUpperCase() === color.toUpperCase() && (
                              <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Permissions Section */}
                  <div className="pt-3 border-t border-white/5 space-y-5">
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
                        Permissões do Cargo
                      </h3>
                      <p className="text-xs text-gray-400">
                        Defina o que os membros com este cargo podem fazer no servidor.
                      </p>
                    </div>

                    {/* Master Admin Notice if active */}
                    {isRoleAdmin && (
                      <div className="p-3 bg-brand-500/10 border border-brand-500/30 rounded-xl flex items-start gap-2.5 text-xs text-brand-300 animate-in fade-in">
                        <AlertTriangle className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block">Permissão Mestre de Administrador Ativa</span>
                          Este cargo possui permissão mestre irrestrita. Ele tem acesso automático a todas as funções e canais privados.
                        </div>
                      </div>
                    )}

                    {/* Permission Groups */}
                    <div className="space-y-4">
                      {PERMISSION_GROUPS.map((group) => (
                        <div key={group.category} className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-gray-300 uppercase tracking-wider">
                            {group.icon}
                            <span>{group.category}</span>
                          </div>

                          <div className="space-y-2">
                            {group.permissions.map((perm) => {
                              const rolePerms = Number(selectedRole.permissions || 0);
                              const isChecked = perm.isMaster
                                ? (rolePerms & perm.flag) !== 0
                                : isRoleAdmin || (rolePerms & perm.flag) !== 0;

                              return (
                                <div
                                  key={perm.flag}
                                  className={`flex items-start justify-between p-3 rounded-xl border transition-all ${
                                    perm.isMaster && isChecked
                                      ? 'bg-brand-500/10 border-brand-500/40'
                                      : isChecked
                                      ? 'bg-background-darker border-white/10'
                                      : 'bg-background-darker/40 border-white/5 opacity-70 hover:opacity-100'
                                  }`}
                                >
                                  <div className="pr-4 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-bold ${perm.isMaster ? 'text-brand-300' : 'text-white'}`}>
                                        {perm.name}
                                      </span>
                                      {perm.isMaster && (
                                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                                      )}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                                      {perm.description}
                                    </p>
                                  </div>

                                  {/* Toggle Switch */}
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
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
                  Nenhum cargo selecionado.
                </div>
              )}
            </div>
          ) : (
            /* Members Tab: Assign Roles */
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

                  {/* Member Roles Badges & Selector */}
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
  );
};
