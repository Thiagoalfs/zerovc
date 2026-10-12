import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Shield,
  GripVertical,
} from 'lucide-react';
import { Role, User, Permissions } from '../../../types';
import { PRESET_ROLE_COLORS, PERMISSION_GROUPS } from './constants';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_DIVIDER_CLASS,
} from '../../../constants/modalTypography';

interface RolesTabProps {
  roles: Role[];
  members: User[];
  isOwner: boolean;
  canManageRoles: boolean;
  selectedRoleId: string | null;
  setSelectedRoleId: (id: string | null) => void;
  selectedRole: Role | undefined;
  newRoleName?: string;
  setNewRoleName?: (val: string) => void;
  isCreatingRole: boolean;
  isReorderingRoles: boolean;
  handleMoveRoleHierarchy?: (roleId: string, direction: 'up' | 'down') => Promise<void>;
  handleReorderRoles?: (newOrderedRoles: Role[]) => Promise<void>;
  handleCreateRole: () => Promise<void>;
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
  isCreatingRole,
  isReorderingRoles,
  handleMoveRoleHierarchy,
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
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; position: 'top' | 'bottom' } | null>(null);

  const sortedRoles = useMemo(() => {
    const seen = new Set<string>();
    const res: Role[] = [];
    for (const r of roles || []) {
      if (r && r.id && !seen.has(String(r.id))) {
        seen.add(String(r.id));
        res.push(r);
      }
    }
    return res.sort((a, b) => a.position - b.position);
  }, [roles]);

  const handleDropRole = async (sourceId: string, targetId: string, position: 'top' | 'bottom') => {
    if (sourceId === targetId) return;

    const currentList = [...sortedRoles];
    const sourceIndex = currentList.findIndex((r) => r.id === sourceId);
    const targetIndex = currentList.findIndex((r) => r.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const [draggedRole] = currentList.splice(sourceIndex, 1);

    let newIndex = currentList.findIndex((r) => r.id === targetId);
    if (position === 'bottom') {
      newIndex += 1;
    }

    const everyoneIndex = currentList.findIndex((r) => r.name === '@everyone');
    if (everyoneIndex !== -1 && newIndex > everyoneIndex) {
      newIndex = everyoneIndex;
    }

    currentList.splice(newIndex, 0, draggedRole);

    const finalEveryoneIdx = currentList.findIndex((r) => r.name === '@everyone');
    if (finalEveryoneIdx !== -1 && finalEveryoneIdx !== currentList.length - 1) {
      const [everyoneRole] = currentList.splice(finalEveryoneIdx, 1);
      currentList.push(everyoneRole);
    }

    if (handleReorderRoles) {
      await handleReorderRoles(currentList);
    } else if (handleMoveRoleHierarchy) {
      const dir = newIndex < sourceIndex ? 'up' : 'down';
      await handleMoveRoleHierarchy(sourceId, dir);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 min-h-0 h-auto md:h-[calc(100vh-140px)] animate-fade-in py-4 md:py-6">
      {/* Roles Sidebar / Hierarchy List */}
      <div className="w-full md:w-72 flex flex-col md:pr-6 md:border-r border-white/10 shrink-0 max-h-56 md:max-h-none border-b md:border-b-0 pb-4 md:pb-0">
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10 px-1">
          <span className={MODAL_SECTION_HEADER_CLASS}>
            Cargos ({sortedRoles.length})
          </span>
          {canManageRoles && (
            <button
              type="button"
              disabled={isCreatingRole}
              onClick={() => handleCreateRole()}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors cursor-pointer"
              title="Novo Cargo"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1 chat-scrollbar min-h-0 touch-pan-y">
          {sortedRoles.map((role, idx) => {
            const isSelected = (selectedRoleId === role.id) || (!selectedRoleId && idx === 0);
            const isEveryone = role.name === '@everyone';
            const isDragging = draggedRoleId === role.id;
            const isDragOverTop = dragOverTarget?.id === role.id && dragOverTarget.position === 'top';
            const isDragOverBottom = dragOverTarget?.id === role.id && dragOverTarget.position === 'bottom';

            return (
              <div key={role.id} className="relative">
                {/* Top drop indicator bar */}
                {isDragOverTop && (
                  <div className="absolute -top-[2px] left-1 right-1 h-[2px] bg-brand-500 rounded-full z-30 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,1)]">
                    <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand-500 shadow-sm" />
                  </div>
                )}

                {/* Bottom drop indicator bar */}
                {isDragOverBottom && (
                  <div className="absolute -bottom-[2px] left-1 right-1 h-[2px] bg-brand-500 rounded-full z-30 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,1)]">
                    <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand-500 shadow-sm" />
                  </div>
                )}

                <div
                  draggable={canManageRoles && !isEveryone && !isReorderingRoles}
                  onDragStart={(e) => {
                    if (!canManageRoles || isEveryone || isReorderingRoles) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData('text/plain', role.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggedRoleId(role.id);
                  }}
                  onDragOver={(e) => {
                    if (!canManageRoles || !draggedRoleId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';

                    if (draggedRoleId === role.id) {
                      if (dragOverTarget) setDragOverTarget(null);
                      return;
                    }

                    if (isEveryone) {
                      if (dragOverTarget?.id !== role.id || dragOverTarget?.position !== 'top') {
                        setDragOverTarget({ id: role.id, position: 'top' });
                      }
                      return;
                    }

                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const position: 'top' | 'bottom' = e.clientY < midY ? 'top' : 'bottom';

                    if (dragOverTarget?.id !== role.id || dragOverTarget?.position !== position) {
                      setDragOverTarget({ id: role.id, position });
                    }
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && e.currentTarget.contains(related)) {
                      return;
                    }
                    if (dragOverTarget?.id === role.id) {
                      setDragOverTarget(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!canManageRoles || !draggedRoleId || draggedRoleId === role.id) return;
                    let pos = dragOverTarget?.position;
                    if (!pos) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const midY = rect.top + rect.height / 2;
                      pos = isEveryone || e.clientY < midY ? 'top' : 'bottom';
                    }
                    handleDropRole(draggedRoleId, role.id, pos);
                    setDraggedRoleId(null);
                    setDragOverTarget(null);
                  }}
                  onDragEnd={() => {
                    setDraggedRoleId(null);
                    setDragOverTarget(null);
                  }}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all select-none relative ${
                    canManageRoles && !isEveryone
                      ? 'cursor-grab active:cursor-grabbing'
                      : 'cursor-pointer'
                  } ${isDragging ? 'opacity-30 scale-[0.98]' : ''} ${
                    isSelected
                      ? 'bg-brand-500/15 text-white border border-brand-500/30 font-semibold'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {canManageRoles && !isEveryone && (
                      <GripVertical className="w-3.5 h-3.5 text-gray-500 opacity-0 group-hover:opacity-70 flex-shrink-0 -ml-1 transition-opacity pointer-events-none" />
                    )}
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: role.color || '#99AAB5' }}
                    />
                    <span className="truncate font-medium">
                      {role.name}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Role Details Editor */}
      {selectedRole ? (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 md:pl-2 max-w-3xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0 min-h-[48px]">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="w-5 h-5 rounded-full shadow shrink-0"
                style={{ backgroundColor: selectedRole.color || '#99AAB5' }}
              />
              <h2 className={`${MODAL_DIALOG_TITLE_CLASS} truncate`}>{selectedRole.name}</h2>
            </div>

            {canManageRoles && selectedRole.name !== '@everyone' && (
              <button
                onClick={() => handleDeleteRole(selectedRole.id)}
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Cargo</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pt-5 pr-4 md:pr-6 chat-scrollbar touch-pan-y min-h-0">
            {/* Role Name */}
            <div className="space-y-1.5">
              <label className={MODAL_FIELD_LABEL_CLASS}>
                Nome do Cargo
              </label>
              <input
                type="text"
                defaultValue={selectedRole.name}
                key={selectedRole.id + selectedRole.name}
                onBlur={(e) => handleUpdateRoleName(e.target.value)}
                disabled={!canManageRoles || selectedRole.name === '@everyone'}
                className="w-full px-4 py-2 bg-background-darkest border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500 disabled:opacity-60"
              />
              {selectedRole.name === '@everyone' && (
                <p className="text-xs text-gray-500">
                  O cargo @everyone representa as permissões padrão atribuídas a todos os membros do servidor.
                </p>
              )}
            </div>

            {/* Role Color */}
            <div className="space-y-2">
              <label className={MODAL_FIELD_LABEL_CLASS}>
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
                  <span className="text-xs text-gray-400">{selectedRole.color || '#5865F2'}</span>
                </div>
              </div>
            </div>

            <div className={MODAL_DIVIDER_CLASS} />

            {/* Role Display Switches (Hoist & Mentionable) */}
            <div className="space-y-3">
              <label className={MODAL_SECTION_HEADER_CLASS}>
                Exibição de Membros
              </label>
              <div className="space-y-4">
                <div
                  onClick={() => {
                    if (canManageRoles && selectedRole.name !== '@everyone') {
                      handleToggleRoleHoist();
                    }
                  }}
                  className={`flex items-center justify-between transition-all ${
                    canManageRoles && selectedRole.name !== '@everyone' ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="pr-4 select-none">
                    <div className={MODAL_TOGGLE_HEADER_CLASS}>
                      Exibir membros deste cargo separadamente
                    </div>
                    <div className="text-xs text-gray-400 mt-1 leading-relaxed">
                      {selectedRole.name === '@everyone'
                        ? 'O cargo @everyone engloba todos os membros e não pode ser exibido separadamente.'
                        : 'Membros com este cargo aparecerão em uma categoria própria na lista lateral de membros.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canManageRoles || selectedRole.name === '@everyone'}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleRoleHoist();
                    }}
                    className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors cursor-pointer ${
                      selectedRole.hoist ? 'bg-online' : 'bg-gray-600'
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
                  className={`flex items-center justify-between transition-all ${
                    canManageRoles ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="pr-4 select-none">
                    <div className={MODAL_TOGGLE_HEADER_CLASS}>
                      Permitir que qualquer um @mencione este cargo
                    </div>
                    <div className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Permite que membros enviem mensagens com @cargo para notificar todos com este cargo.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canManageRoles}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleRoleMentionable();
                    }}
                    className={`w-11 h-6 flex items-center rounded-full p-1 shrink-0 transition-colors cursor-pointer ${
                      selectedRole.mentionable ? 'bg-online' : 'bg-gray-600'
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

            <div className={MODAL_DIVIDER_CLASS} />

            {/* Permission Groups */}
            <div className="space-y-5">
              <label className={MODAL_SECTION_HEADER_CLASS}>
                Permissões do Cargo
              </label>

              {PERMISSION_GROUPS.map((group) => (
                <div key={group.category} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
                    {group.icon}
                    <span>{group.category}</span>
                  </div>

                  <div className="divide-y divide-white/5">
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
                          className={`flex items-start justify-between py-3.5 transition-all ${
                            canManageRoles ? 'cursor-pointer' : 'opacity-70'
                          }`}
                        >
                          <div className="pr-4 select-none">
                            <div className={MODAL_TOGGLE_HEADER_CLASS}>
                              {perm.name}
                            </div>
                            <div className="text-xs text-gray-400 mt-1 leading-relaxed">{perm.description}</div>
                          </div>

                          <button
                            type="button"
                            disabled={!canManageRoles || (isRoleAdmin && perm.flag !== Permissions.ADMINISTRATOR)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canManageRoles && (!isRoleAdmin || perm.flag === Permissions.ADMINISTRATOR)) {
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
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-12">
          <Shield className="w-12 h-12 stroke-1 mb-2 text-gray-500" />
          <p className="text-sm">Selecione ou crie um cargo na lista ao lado.</p>
        </div>
      )}
    </div>
  );
};
