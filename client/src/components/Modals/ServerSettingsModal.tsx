import React, { useState } from 'react';
import { X, Shield, Plus, Trash2, Check, Users } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';

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
      const created = await createRole(activeGuild.id, newRoleName.trim(), newRoleColor);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="bg-background-darkest w-full max-w-4xl h-[600px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex animate-in fade-in zoom-in-95">
        
        {/* Left Navigation Sidebar */}
        <div className="w-56 bg-background-darker/60 p-4 border-r border-white/5 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 block mb-3">
              {activeGuild.name}
            </span>

            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('roles')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activeTab === 'roles'
                    ? 'bg-brand-500 text-white'
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
                    ? 'bg-brand-500 text-white'
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
            className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition-colors"
          >
            Fechar Configurações
          </button>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/5">
            <h2 className="text-lg font-bold text-white">
              {activeTab === 'roles' ? 'Gerenciador de Cargos' : 'Gerenciador de Membros'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {activeTab === 'roles' ? (
            <div className="flex-1 flex gap-6 overflow-hidden">
              {/* Roles List */}
              <div className="w-64 flex flex-col gap-3">
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
                      className="p-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white"
                      title="Criar Cargo"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                  {roles.map((role) => {
                    const isSelected = selectedRole?.id === role.id;
                    return (
                      <div
                        key={role.id}
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-white/10 text-white shadow-sm'
                            : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: role.color }}
                          />
                          <span className="truncate">{role.name}</span>
                        </div>

                        {isOwner && roles.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(role.id);
                            }}
                            className="text-gray-500 hover:text-dnd p-1 rounded"
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

              {/* Role Details Editor */}
              {selectedRole ? (
                <div className="flex-1 overflow-y-auto space-y-6 pl-4 border-l border-white/5">
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
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 shadow"
                          style={{ backgroundColor: color }}
                        >
                          {selectedRole.color.toUpperCase() === color.toUpperCase() && (
                            <Check className="w-4 h-4 text-white drop-shadow" />
                          )}
                        </button>
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
            <div className="flex-1 overflow-y-auto space-y-2">
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
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
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
