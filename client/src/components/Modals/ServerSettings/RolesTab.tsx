import React from 'react';
import {
  Plus,
  Trash2,
  Check,
  ArrowUp,
  ArrowDown,
  Shield,
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
  handleMoveRoleHierarchy: (roleId: string, direction: 'up' | 'down') => Promise<void>;
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
  handleMoveRoleHierarchy,
  handleCreateRole,
  handleDeleteRole,
  handleUpdateRoleName,
  handleUpdateRoleColor,
  handleToggleRoleHoist,
  handleToggleRoleMentionable,
  handleTogglePermission,
  isRoleAdmin,
}) => {
  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 min-h-0 h-auto md:h-[68vh] animate-fade-in">
      {/* Roles Sidebar / Hierarchy List */}
      <div id="roles-list" className="w-full md:w-72 bg-[#1e1f22] rounded-2xl border border-white/10 flex flex-col p-3 shrink-0 max-h-56 md:max-h-none scroll-mt-6">
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10 px-2">
          <span className="text-xs font-bold uppercase text-gray-400 font-mono">
            Cargos ({roles.length})
          </span>
          {isOwner && (
            <button
              onClick={() => {
                setSelectedRoleId(null);
                setNewRoleName('');
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Novo Cargo"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-0 touch-pan-y">
          {roles
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((role, idx) => {
              const isSelected = (selectedRoleId === role.id) || (!selectedRoleId && idx === 0);
              const isEveryone = role.name === '@everyone';
              const memberCount = isEveryone
                ? members.length
                : members.filter((m) => m.roles && m.roles.some((r) => r.id === role.id)).length;

              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-sm cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-brand-500/15 text-white border border-brand-500/30'
                      : 'text-gray-300 hover:bg-[#18191c]/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: role.color || '#99AAB5' }}
                    />
                    <span className="truncate font-medium">
                      {role.name}
                    </span>
                    {isEveryone && (
                      <span className="text-[10px] bg-white/10 text-gray-300 px-1.5 py-0.5 rounded font-mono">
                        Padrão
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <span className="text-[11px] text-gray-500 mr-1">{memberCount}</span>
                    {canManageRoles && !isEveryone && (
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={idx === 0 || isReorderingRoles}
                          onClick={() => handleMoveRoleHierarchy(role.id, 'up')}
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-20 cursor-pointer"
                          title="Subir na Hierarquia"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === roles.length - 1 || isReorderingRoles || roles[idx + 1]?.name === '@everyone'}
                          onClick={() => handleMoveRoleHierarchy(role.id, 'down')}
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-20 cursor-pointer"
                          title="Descer na Hierarquia"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {canManageRoles && (
          <form onSubmit={handleCreateRole} className="mt-3 pt-3 border-t border-white/10 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Nome do novo cargo..."
                className="flex-1 px-3 py-1.5 bg-[#111214] border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={isCreatingRole || !newRoleName.trim()}
                className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors cursor-pointer"
              >
                Criar
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Role Details Editor */}
      {selectedRole ? (
        <div className="flex-1 bg-[#1e1f22] rounded-2xl border border-white/10 flex flex-col p-4 sm:p-6 overflow-hidden min-h-0">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <span
                className="w-5 h-5 rounded-full shadow"
                style={{ backgroundColor: selectedRole.color || '#99AAB5' }}
              />
              <h2 className="text-base font-bold text-white">{selectedRole.name}</h2>
              {selectedRole.name === '@everyone' && (
                <span className="text-[10px] bg-white/10 text-gray-200 px-2 py-0.5 rounded-full font-medium">
                  Cargo Base de Todos
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
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Cargo</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pt-5 pr-2 custom-scrollbar touch-pan-y min-h-0">
            {/* Role Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                Nome do Cargo
              </label>
              <input
                type="text"
                defaultValue={selectedRole.name}
                key={selectedRole.id + selectedRole.name}
                onBlur={(e) => handleUpdateRoleName(e.target.value)}
                disabled={!canManageRoles || selectedRole.name === '@everyone'}
                className="w-full px-4 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500 disabled:opacity-60"
              />
              {selectedRole.name === '@everyone' && (
                <p className="text-xs text-gray-500">
                  O cargo @everyone representa as permissões padrão atribuídas a todos os membros do servidor.
                </p>
              )}
            </div>

            {/* Role Color */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
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
            <div className="space-y-3 pt-3 border-t border-white/10">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                Exibição de Membros
              </label>
              <div className="space-y-3">
                <div
                  onClick={() => {
                    if (canManageRoles && selectedRole.name !== '@everyone') {
                      handleToggleRoleHoist();
                    }
                  }}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    selectedRole.hoist
                      ? 'bg-[#111214]/80 border-white/15'
                      : 'bg-[#111214]/50 border-white/10 hover:border-white/15'
                  } ${canManageRoles && selectedRole.name !== '@everyone' ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                >
                  <div className="pr-4 select-none">
                    <div className="text-sm font-semibold text-white">
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
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    selectedRole.mentionable
                      ? 'bg-[#111214]/80 border-white/15'
                      : 'bg-[#111214]/50 border-white/10 hover:border-white/15'
                  } ${canManageRoles ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
                >
                  <div className="pr-4 select-none">
                    <div className="text-sm font-semibold text-white">
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
            <div id="roles-permissions" className="space-y-5 pt-3 border-t border-white/10 scroll-mt-6">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                Permissões do Cargo
              </label>

              {PERMISSION_GROUPS.map((group) => (
                <div key={group.category} className="space-y-3">
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
                          className={`flex items-start justify-between p-4 rounded-xl border transition-all ${
                            perm.isMaster
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : isChecked
                              ? 'bg-[#111214]/80 border-white/15'
                              : 'bg-[#111214]/50 border-white/10 hover:border-white/15'
                          } ${canManageRoles ? 'cursor-pointer' : 'opacity-70'}`}
                        >
                          <div className="pr-4 select-none">
                            <div className="text-sm font-semibold text-white flex items-center gap-2">
                              <span>{perm.name}</span>
                              {perm.isMaster && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                                  Mestre
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-1 leading-relaxed">{perm.description}</div>
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
        <div className="flex-1 bg-[#1e1f22] rounded-2xl border border-white/10 flex flex-col items-center justify-center text-gray-400">
          <Shield className="w-12 h-12 stroke-1 mb-2 text-gray-500" />
          <p className="text-sm">Selecione ou crie um cargo na lista ao lado.</p>
        </div>
      )}
    </div>
  );
};
