import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Shield,
  Search,
  Lock,
  RotateCcw,
  Users,
} from 'lucide-react';
import { Role, User, Permissions } from '../../../types';
import { PRESET_ROLE_COLORS, PERMISSION_GROUPS } from './constants';
import { SquishSwitch } from '../../ui/squish-switch';
import { useGuildPermissions } from '../../../hooks/useGuildPermissions';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_DIVIDER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_SWITCH_CONTAINER_CLASS,
  MODAL_SWITCH_KNOB_CLASS,
} from '../../../constants/modalTypography';
import { ModalButton } from '@/components/ui/modal-button';

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
  handleClearPermissions?: () => Promise<void>;
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
  handleClearPermissions,
  isRoleAdmin,
}) => {
  const { currentUserHighestPos } = useGuildPermissions();
  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; position: 'top' | 'bottom' } | null>(null);
  const [roleSubTab, setRoleSubTab] = useState<'display' | 'permissions'>('display');
  const [permSearch, setPermSearch] = useState('');

  const memberCountByRoleId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of members || []) {
      for (const r of (m as any).roles || []) {
        const rid = typeof r === 'string' ? r : r?.id;
        if (rid) counts[String(rid)] = (counts[String(rid)] || 0) + 1;
      }
    }
    return counts;
  }, [members]);

  const canEditRole = (role: Role | undefined): boolean => {
    if (!canManageRoles || !role) return false;
    if (isOwner || role.name === '@everyone') return true;
    const pos = typeof role.position === 'number' ? role.position : 999;
    return pos > currentUserHighestPos;
  };

  const canEditSelectedRole = canEditRole(selectedRole);

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
    <div className="flex flex-col md:flex-row gap-6 min-h-0 h-auto md:h-[calc(100vh-175px)] animate-fade-in py-4 md:py-6">
      {/* Roles Sidebar / Hierarchy List */}
      <div className="w-full md:w-72 flex flex-col md:pr-6 md:border-r border-white/10 shrink-0 max-h-56 md:max-h-none border-b md:border-b-0 pb-4 md:pb-0">
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10 px-1">
          <span className={MODAL_SECTION_HEADER_CLASS}>
            Cargos ({sortedRoles.length})
          </span>
          {canManageRoles && (
            <ModalButton
              type="tertiary"
              shape="circle"
              size="tiny"
              svgOnly
              loading={isCreatingRole}
              onClick={() => handleCreateRole()}
              title="Novo Cargo"
              aria-label="Novo Cargo"
            >
              <Plus className="w-4 h-4" />
            </ModalButton>
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
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: role.color || '#99AAB5' }}
                    />
                    <span className="truncate font-medium">
                      {role.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {!canEditRole(role) && (
                      <span title="Cargo igual ou superior ao seu na hierarquia">
                        <Lock className="w-3 h-3 text-amber-400/80" />
                      </span>
                    )}
                    <span
                      className="text-[11px] text-gray-500 flex items-center gap-0.5 tabular-nums"
                      title={
                        isEveryone
                          ? `${members.length} membro(s)`
                          : `${memberCountByRoleId[String(role.id)] || 0} membro(s) com este cargo`
                      }
                    >
                      <Users className="w-3 h-3" />
                      {isEveryone ? members.length : (memberCountByRoleId[String(role.id)] || 0)}
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

            {canEditSelectedRole && selectedRole.name !== '@everyone' && (
              <ModalButton
                type="error"
                size="small"
                onClick={() => handleDeleteRole(selectedRole.id)}
                prefix={<Trash2 className="w-3.5 h-3.5" />}
                className="shrink-0"
              >
                Excluir Cargo
              </ModalButton>
            )}
          </div>

          {/* Sub-tabs: Exibição | Permissões */}
          <div className="flex items-center gap-1 border-b border-white/10 pt-3 pb-2 shrink-0">
            <button
              type="button"
              onClick={() => setRoleSubTab('display')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                roleSubTab === 'display'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              Exibição
            </button>
            <button
              type="button"
              onClick={() => setRoleSubTab('permissions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                roleSubTab === 'permissions'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              Permissões
            </button>
          </div>

          {!canEditSelectedRole && (
            <div className="mt-4 p-3 rounded-xl text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-2 shrink-0">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Você não pode editar um cargo igual ou superior ao seu na hierarquia.</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-6 pt-5 pr-4 md:pr-6 chat-scrollbar touch-pan-y min-h-0">
            {roleSubTab === 'display' && (
              <>
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
                disabled={!canEditSelectedRole || selectedRole.name === '@everyone'}
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
                    disabled={!canEditSelectedRole}
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
                    disabled={!canEditSelectedRole}
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
                    if (canEditSelectedRole && selectedRole.name !== '@everyone') {
                      handleToggleRoleHoist();
                    }
                  }}
                  className={`flex items-center justify-between transition-all ${
                    canEditSelectedRole && selectedRole.name !== '@everyone' ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="pr-4 select-none">
                    <div className={MODAL_TOGGLE_HEADER_CLASS}>
                      Exibir membros deste cargo separadamente
                    </div>
                    <div className={`${MODAL_DESCRIPTION_CLASS} mt-1`}>
                      {selectedRole.name === '@everyone'
                        ? 'O cargo @everyone engloba todos os membros e não pode ser exibido separadamente.'
                        : 'Membros com este cargo aparecerão em uma categoria própria na lista lateral de membros.'}
                    </div>
                  </div>
                  <SquishSwitch
                    checked={Boolean(selectedRole.hoist)}
                    onCheckedChange={() => handleToggleRoleHoist()}
                    disabled={!canEditSelectedRole || selectedRole.name === '@everyone'}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div
                  onClick={() => {
                    if (canEditSelectedRole) {
                      handleToggleRoleMentionable();
                    }
                  }}
                  className={`flex items-center justify-between transition-all ${
                    canEditSelectedRole ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="pr-4 select-none">
                    <div className={MODAL_TOGGLE_HEADER_CLASS}>
                      Permitir que qualquer um @mencione este cargo
                    </div>
                    <div className={`${MODAL_DESCRIPTION_CLASS} mt-1`}>
                      Permite que membros enviem mensagens com @cargo para notificar todos com este cargo.
                    </div>
                  </div>
                  <SquishSwitch
                    checked={Boolean(selectedRole.mentionable)}
                    onCheckedChange={() => handleToggleRoleMentionable()}
                    disabled={!canEditSelectedRole}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            </div>
              </>
            )}

            {roleSubTab === 'permissions' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <label className={MODAL_SECTION_HEADER_CLASS}>
                  Permissões do Cargo
                </label>

                {canEditSelectedRole &&
                  selectedRole.name !== '@everyone' &&
                  Number(selectedRole.permissions || 0) !== 0 &&
                  handleClearPermissions && (
                    <ModalButton
                      type="secondary"
                      size="small"
                      onClick={() => handleClearPermissions()}
                      prefix={<RotateCcw className="w-3.5 h-3.5" />}
                      title="Remover todas as permissões deste cargo"
                    >
                      Limpar permissões
                    </ModalButton>
                  )}
              </div>


              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={permSearch}
                  onChange={(e) => setPermSearch(e.target.value)}
                  placeholder="Filtrar permissões..."
                  className="w-full bg-background-darkest border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {PERMISSION_GROUPS.map((group) => {
                const q = permSearch.trim().toLowerCase();
                const filteredPerms = q
                  ? group.permissions.filter(
                      (p) =>
                        p.name.toLowerCase().includes(q) ||
                        p.description.toLowerCase().includes(q)
                    )
                  : group.permissions;
                if (filteredPerms.length === 0) return null;

                return (
                <div key={group.category} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
                    {group.icon}
                    <span>{group.category}</span>
                  </div>

                  <div className="divide-y divide-white/5">
                    {filteredPerms.map((perm) => {
                      const currentPerms = Number(selectedRole.permissions || 0);
                      const isChecked = isRoleAdmin || (currentPerms & perm.flag) !== 0;

                      return (
                        <div
                          key={perm.flag}
                          onClick={() => {
                            if (canEditSelectedRole && (!isRoleAdmin || perm.flag === Permissions.ADMINISTRATOR)) {
                              handleTogglePermission(perm.flag);
                            }
                          }}
                          className={`flex items-start justify-between py-3.5 transition-all ${
                            canEditSelectedRole ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'
                          }`}
                        >
                          <div className="pr-4 select-none">
                            <div className={MODAL_TOGGLE_HEADER_CLASS}>
                              {perm.name}
                            </div>
                            <div className={`${MODAL_DESCRIPTION_CLASS} mt-1`}>{perm.description}</div>
                          </div>

                          <SquishSwitch
                            checked={isChecked}
                            onCheckedChange={() => {
                              if (canEditSelectedRole && (!isRoleAdmin || perm.flag === Permissions.ADMINISTRATOR)) {
                                handleTogglePermission(perm.flag);
                              }
                            }}
                            disabled={!canEditSelectedRole || (isRoleAdmin && perm.flag !== Permissions.ADMINISTRATOR)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
            )}
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
