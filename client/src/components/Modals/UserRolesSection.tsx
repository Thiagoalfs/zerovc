import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Shield, Plus, Check, Loader2 } from 'lucide-react';
import { User, Role } from '../../types';
import { useGuildStore } from '../../stores/guildStore';
import { useGuildPermissions } from '../../hooks/useGuildPermissions';

export interface UserRolesSectionProps {
  user: User | null;
  size?: 'sm' | 'md';
}

export const UserRolesSection: React.FC<UserRolesSectionProps> = ({
  user,
  size = 'sm',
}) => {
  const activeGuild = useGuildStore((s) => s.activeGuild);
  const assignRole = useGuildStore((s) => s.assignRole);
  const removeRole = useGuildStore((s) => s.removeRole);
  const perms = useGuildPermissions(activeGuild);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [operatingRoleId, setOperatingRoleId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with active guild member if inside a server context
  const memberInGuild = useMemo(() => {
    if (!activeGuild || !user) return null;
    return activeGuild.members?.find((m) => m.id === user.id) || null;
  }, [activeGuild, user]);

  const displayRoles = useMemo(() => {
    if (memberInGuild) {
      return memberInGuild.roles || [];
    }
    return user?.roles || [];
  }, [memberInGuild, user?.roles]);

  const canManageMemberRoles = useMemo(() => {
    if (!activeGuild || !memberInGuild || !perms.canManageRoles) return false;
    const mod = perms.canModerateMember(memberInGuild);
    return perms.isCurrentOwner || (!mod.isTargetOwner && mod.isHierarchyAllowed);
  }, [activeGuild, memberInGuild, perms]);

  const availableRoles = useMemo(() => {
    if (!activeGuild?.roles) return [];
    return [...activeGuild.roles]
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  }, [activeGuild?.roles]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  if (!user) return null;
  if (displayRoles.length === 0 && !canManageMemberRoles) return null;

  const handleToggleRole = async (role: Role) => {
    if (!activeGuild || operatingRoleId) return;
    const isManageable = perms.isCurrentOwner || role.position > perms.currentUserHighestPos;
    if (!isManageable) return;

    const hasRole = displayRoles.some((r) => r.id === role.id);
    setOperatingRoleId(role.id);
    try {
      if (hasRole) {
        await removeRole(activeGuild.id, user.id, role.id);
      } else {
        await assignRole(activeGuild.id, user.id, role.id);
      }
    } catch (err) {
      console.error('Falha ao atualizar cargo:', err);
    } finally {
      setOperatingRoleId(null);
    }
  };

  const isSmall = size === 'sm';

  return (
    <div>
      <span
        className={`${
          isSmall ? 'text-[10px] mb-1' : 'text-[11px] mb-1.5'
        } font-bold text-gray-400 uppercase tracking-wider block flex items-center gap-1`}
      >
        <Shield className={`${isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-brand-400`} />
        <span>Cargos {displayRoles.length > 0 ? `(${displayRoles.length})` : ''}</span>
      </span>

      <div className={`flex flex-wrap items-center ${isSmall ? 'gap-1' : 'gap-1.5'}`}>
        {displayRoles.map((role) => (
          <span
            key={role.id}
            className={`${
              isSmall
                ? 'text-[10px] px-2 py-0.5'
                : 'text-xs px-2.5 py-1 shadow-sm'
            } font-semibold rounded-md bg-white/5 border border-white/10 flex items-center gap-1`}
            style={{ color: role.color || '#99aab5' }}
          >
            <span
              className={`${isSmall ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full shrink-0`}
              style={{ backgroundColor: role.color || '#99aab5' }}
            />
            <span className="truncate max-w-[140px]">{role.name}</span>
          </span>
        ))}

        {canManageMemberRoles && (
          <div className="relative inline-block" ref={dropdownRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDropdownOpen((prev) => !prev);
              }}
              className={`rounded-md bg-white/5 hover:bg-white/15 active:scale-95 border border-white/10 text-gray-300 hover:text-white flex items-center justify-center cursor-pointer transition-all ${
                isSmall ? 'p-0.5 px-1.5 text-[10px]' : 'p-1 px-2 text-xs'
              }`}
              title="Adicionar ou alterar cargos"
            >
              <Plus className={isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </button>

            {isDropdownOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 top-full mt-1.5 z-50 w-52 sm:w-56 bg-background-darkest border border-white/10 rounded-xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5"
              >
                <div className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 mb-0.5 flex items-center justify-between">
                  <span>Cargos do Servidor</span>
                  <span className="text-[9px] text-gray-500 font-normal">{availableRoles.length}</span>
                </div>

                <div className="max-h-[160px] overflow-y-auto no-scrollbar space-y-0.5">
                  {availableRoles.length === 0 ? (
                    <div className="p-2.5 text-center text-xs text-gray-500">
                      Nenhum outro cargo disponível
                    </div>
                  ) : (
                    availableRoles.map((role) => {
                      const hasRole = displayRoles.some((r) => r.id === role.id);
                      const isManageable =
                        perms.isCurrentOwner || role.position > perms.currentUserHighestPos;
                      const isCurrentOperating = operatingRoleId === role.id;

                      return (
                        <button
                          key={role.id}
                          type="button"
                          disabled={!isManageable || isCurrentOperating}
                          onClick={() => handleToggleRole(role)}
                          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                            !isManageable
                              ? 'opacity-40 cursor-not-allowed text-gray-500'
                              : 'hover:bg-white/10 text-gray-200 cursor-pointer'
                          } ${hasRole ? 'bg-brand-500/10 text-brand-300 font-medium' : ''}`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: role.color || '#99aab5' }}
                            />
                            <span
                              className="truncate text-xs font-medium"
                              style={{ color: role.color || undefined }}
                            >
                              {role.name}
                            </span>
                          </div>

                          <div className="shrink-0 flex items-center">
                            {isCurrentOperating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                            ) : hasRole ? (
                              <Check className="w-3.5 h-3.5 text-online" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded border border-white/20" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
