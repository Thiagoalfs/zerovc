import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Shield,
  GripVertical,
} from 'lucide-react';
import { Role, User, Permissions } from '../../../types';
import { PRESET_ROLE_COLORS, PERMISSION_GROUPS } from './constants';

interface RolesTabProps {
  roles: Role[];
  members: User[];
  isOwner: boolean;
  canManageRoles: boolean;
  selectedRoleId: string | null;
  setSelectedRoleId: (id: string | null) => void;
  selectedRole: Role | undefined;
  newRoleName: string;
  setNewRoleName: (val: string) => void;
  isCreatingRole: boolean;
  isReorderingRoles: boolean;
  handleReorderRoles?: (newOrderedRoles: Role[]) => Promise<void>;
  handleMoveRoleHierarchy?: (roleId: string, direction: 'up' | 'down') => Promise<void>;
  handleCreateRole: (e: React.FormEvent) => Promise<void>;
  handleDeleteRole: (roleId: string) => Promise<void>;
  handleUpdateRoleName: (name: string) => Promise<void>;
  handleUpdateRoleColor: (color: string) => Promise<void>;
  handleToggleRoleHoist: () => Promise<void>;
  handleToggleRoleMentionable: () => Promise<void>;
  handleTogglePermission: (flag: number) => Promise<void>;
  isRoleAdmin: boolean;
}

export const RolesTab: React.FC<RolesTabProps> = ({
  roles,
  members,
  isOwner,
  canManageRoles,
  selectedRoleId,
  setSelectedRoleId,
  selectedRole,
  newRoleName,
  setNewRoleName,
  isCreatingRole,
  isReorderingRoles,
  handleReorderRoles,
  handleCreateRole,
  handleDeleteRole,
  handleUpdateRoleName,
  handleUpdateRoleColor,
  handleToggleRoleHoist,
  handleToggleRoleMentionable,
  handleTogglePermission,
  isRoleAdmin,
}) => {
  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const sortedRoles = roles.slice().sort((a, b) => a.position - b.position);

  const handleDragStart = (e: React.DragEvent, roleId: string) => {
    if (!canManageRoles || isReorderingRoles) return;
    setDraggedRoleId(roleId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', roleId);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!canManageRoles || isReorderingRoles || !draggedRoleId) return;
    const targetRole = sortedRoles[index];
    if (!targetRole || targetRole.name === '@everyone') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (!canManageRoles || isReorderingRoles || !draggedRoleId) return;

    const sourceIndex = sortedRoles.findIndex((r) => r.id === draggedRoleId);
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDraggedRoleId(null);
      return;
    }

    const targetRole = sortedRoles[targetIndex];
    if (!targetRole || targetRole.name === '@everyone') {
      setDraggedRoleId(null);
      return;
    }

    const reordered = [...sortedRoles];
    const [movedRole] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedRole);

    setDraggedRoleId(null);
    if (handleReorderRoles) {
      await handleReorderRoles(reordered);
    }
  };

  const handleDragEnd = () => {
    setDraggedRoleId(null);
    setDragOverIndex(null);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-0">
      {/* Roles Sidebar / Left Column */}
      <div id="roles-list" className="w-full md:w-60 flex flex-col gap-2 shrink-0 pr-0 md:pr-4 border-b md:border-b-0 md:border-r border-white/10 pb-4 md:pb-0 scroll-mt-6">
        <div className="flex items-center justify-between mb-1 px-1">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Cargos do Servidor
            </span>
          </div>
          {isOwner && (
            <button
              onClick={() => {
                setSelectedRoleId(null);
                setNewRoleName('');
              }}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Novo Cargo"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto max-h-none md:max-h-[460px] gap-1.5 md:gap-1 pr-0 md:pr-1 no-scrollbar">
          {sortedRoles.map((role, idx) => {
            const isSelected = (selectedRoleId === role.id) || (!selectedRoleId && idx === 0);
            const isEveryone = role.name === '@everyone';
            const memberCount = isEveryone
              ? members.length
              : members.filter((m) => m.roles && m.roles.some((r) => r.id === role.id)).length;
            const isDraggingThis = draggedRoleId === role.id;
            const isDropTarget = dragOverIndex === idx && !isDraggingThis;

            return (
              <div
                key={role.id}
                draggable={canManageRoles && !isEveryone && !isReorderingRoles}
                onDragStart={(e) => handleDragStart(e, role.id)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => setSelectedRoleId(role.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex-shrink-0 relative ${
                  isDraggingThis
                    ? 'opacity-40 bg-white/5 border border-dashed border-brand-500'
                    : isDropTarget
                    ? 'bg-brand-500/20 border-t-2 border-brand-500'
                    : isSelected
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                    : 'text-gray-300 hover:bg-white/5 bg-[#111214] md:bg-transparent'
                }`}
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  {canManageRoles && !isEveryone && (
                    <span
                      className={`cursor-grab active:cursor-grabbing p-0.5 rounded touch-none ${
                        isSelected ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                      title="Arrastar hierarquia"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>
                  )}

                  <span
                    className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: role.color || '#99AAB5' }}
                  />
                  <span className="truncate">{role.name}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <span className={`text-[10px] ${isSelected ? 'text-white/80 font-mono' : 'text-gray-500 font-mono'}`}>
                    {memberCount}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {canManageRoles && (
          <form onSubmit={handleCreateRole} className="mt-2 pt-2 border-t border-white/10 space-y-2">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Nome do cargo..."
                className="flex-1 px-3 py-1.5 bg-[#111214] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
              />
              <button
                type="submit"
                disabled={isCreatingRole || !newRoleName.trim()}
                className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer shrink-0"
              >
                Criar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Role Details & Permissions / Right Column */}
      {selectedRole ? (
        <div className="flex-1 space-y-6 overflow-y-auto max-h-[500px] pr-2 no-scrollbar scroll-mt-6">
          {/* Header Info of selected role */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <span
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: selectedRole.color || '#99AAB5' }}
              />
              <span className="font-bold text-sm text-white">{selectedRole.name}</span>
              {selectedRole.name === '@everyone' && (
                <span className="text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded-full font-medium">
                  Cargo Padrão
                </span>
              )}
              {selectedRole.hoist && (
                <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full font-medium">
                  Separado
                </span>
              )}
              {selectedRole.mentionable && (
                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full font-medium">
                  Mencionável
                </span>
              )}
            </div>

            {canManageRoles && selectedRole.name !== '@everyone' && (
              <button
                onClick={() => handleDeleteRole(selectedRole.id)}
                className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Excluir este cargo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Cargo</span>
              </button>
            )}
          </div>

          <div className="space-y-6">
            {/* Role Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                Nome do Cargo
              </label>
              <input
                type="text"
                defaultValue={selectedRole.name}
                key={selectedRole.id + selectedRole.name}
                onBlur={(e) => handleUpdateRoleName(e.target.value)}
                disabled={!canManageRoles || selectedRole.name === '@everyone'}
                className="w-full bg-[#111214] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-60"
              />
              {selectedRole.name === '@everyone' && (
                <p className="text-xs text-gray-500 mt-1">
                  O cargo @everyone representa as permissões padrão atribuídas a todos os membros do servidor.
                </p>
              )}
            </div>

            {/* Role Color */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                Cor do Cargo
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_ROLE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleUpdateRoleColor(c)}
                    disabled={!canManageRoles}
                    className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                      selectedRole.color?.toLowerCase() === c.toLowerCase()
                        ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#111214]'
                        : 'hover:scale-105'
                    } disabled:opacity-50 cursor-pointer`}
                    style={{ backgroundColor: c }}
                  >
                    {selectedRole.color?.toLowerCase() === c.toLowerCase() && (
                      <Check className="w-3.5 h-3.5 text-black drop-shadow" />
                    )}
                  </button>
                ))}
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="color"
                    value={selectedRole.color || '#5865F2'}
                    onChange={(e) => handleUpdateRoleColor(e.target.value)}
                    disabled={!canManageRoles}
                    className="w-8 h-8 rounded-lg bg-transparent border-0 cursor-pointer disabled:opacity-50"
                    title="Cor personalizada"
                  />
                  <span className="text-xs font-mono text-gray-400">{selectedRole.color || '#5865F2'}</span>
                </div>
              </div>
            </div>

            {/* Role Display Switches (Hoist & Mentionable) */}
            <div className="space-y-3 pt-2">
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Exibição de Membros
              </h4>
              <div className="space-y-2">
                <div
                  onClick={() => {
                    if (canManageRoles && selectedRole.name !== '@everyone') {
                      handleToggleRoleHoist();
                    }
                  }}
                  className={`p-3.5 rounded-2xl bg-[#111214] border border-white/5 flex items-center justify-between gap-4 transition-all hover:border-white/10 ${
                    canManageRoles && selectedRole.name !== '@everyone' ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="pr-4 select-none min-w-0 flex-1">
                    <div className="text-xs font-bold text-gray-100">
                      Exibir membros deste cargo separadamente
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                      {selectedRole.name === '@everyone'
                        ? 'O cargo @everyone engloba todos os membros e não pode ser exibido separadamente.'
                        : 'Membros com este cargo aparecerão em uma categoria própria na lista lateral de membros.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canManageRoles || selectedRole.name === '@everyone'}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleRoleHoist();
                    }}
                    className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors cursor-pointer ${
                      selectedRole.hoist ? 'bg-[#23a55a]' : 'bg-[#4e5058]'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                        selectedRole.hoist ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div
                  onClick={() => {
                    if (canManageRoles) {
                      handleToggleRoleMentionable();
                    }
                  }}
                  className={`p-3.5 rounded-2xl bg-[#111214] border border-white/5 flex items-center justify-between gap-4 transition-all hover:border-white/10 ${
                    canManageRoles ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="pr-4 select-none min-w-0 flex-1">
                    <div className="text-xs font-bold text-gray-100">
                      Permitir que qualquer um @mencione este cargo
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                      Permite que membros enviem mensagens com @cargo para notificar todos com este cargo.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canManageRoles}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleRoleMentionable();
                    }}
                    className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors cursor-pointer ${
                      selectedRole.mentionable ? 'bg-[#23a55a]' : 'bg-[#4e5058]'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                        selectedRole.mentionable ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Permission Groups */}
            <div id="roles-permissions" className="space-y-6 pt-2 scroll-mt-6">
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Permissões do Cargo
              </h4>

              {PERMISSION_GROUPS.map((group) => (
                <div key={group.category} className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
                    {group.icon}
                    <span>{group.category}</span>
                  </div>

                  <div className="space-y-2">
                    {group.permissions.map((perm) => {
                      const currentPerms = Number(selectedRole.permissions || 0);
                      const isChecked = isRoleAdmin || (currentPerms & perm.flag) !== 0;

                      return (
                        <div
                          key={perm.flag}
                          onClick={() => {
                            if (canManageRoles && (!isRoleAdmin || perm.flag === Permissions.ADMINISTRATOR)) {
                              handleTogglePermission(perm.flag);
                            }
                          }}
                          className={`p-3.5 rounded-2xl bg-[#111214] border border-white/5 flex items-start justify-between gap-4 transition-all hover:border-white/10 ${
                            perm.isMaster ? 'border-amber-500/20 bg-amber-500/5' : ''
                          } ${canManageRoles ? 'cursor-pointer' : 'opacity-70'}`}
                        >
                          <div className="pr-4 select-none min-w-0 flex-1">
                            <div className="text-xs font-bold text-gray-100 flex items-center gap-2">
                              <span>{perm.name}</span>
                              {perm.isMaster && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                                  Mestre
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{perm.description}</p>
                          </div>

                          <button
                            type="button"
                            disabled={!isOwner || (isRoleAdmin && perm.flag !== Permissions.ADMINISTRATOR)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isOwner && (!isRoleAdmin || perm.flag === Permissions.ADMINISTRATOR)) {
                                handleTogglePermission(perm.flag);
                              }
                            }}
                            className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors cursor-pointer ${
                              isChecked ? 'bg-[#23a55a]' : 'bg-[#4e5058]'
                            } disabled:opacity-50`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                                isChecked ? 'translate-x-5' : 'translate-x-0'
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
        <div className="flex-1 border border-white/10 rounded-2xl bg-[#111214]/50 flex flex-col items-center justify-center text-gray-400 py-16">
          <Shield className="w-12 h-12 stroke-1 mb-2 text-gray-500" />
          <p className="text-sm">Selecione ou crie um cargo na lista ao lado.</p>
        </div>
      )}
    </div>
  );
};
