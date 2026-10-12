import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Plus, Check, Loader2, X } from 'lucide-react';
import { User, Role } from '../../types';
import { useAuthStore } from '../../stores/authStore';
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
  const currentAuthUser = useAuthStore((s) => s.user);
  const activeGuild = useGuildStore((s) => s.activeGuild);
  const assignRole = useGuildStore((s) => s.assignRole);
  const removeRole = useGuildStore((s) => s.removeRole);
  const perms = useGuildPermissions(activeGuild);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [operatingRoleId, setOperatingRoleId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with active guild member if inside a server context
  const memberInGuild = useMemo(() => {
    if (!activeGuild || !user || !Array.isArray(activeGuild.members)) return null;
    return activeGuild.members.find((m) => m && m.id === user.id) || null;
  }, [activeGuild, user]);

  const displayRoles: Role[] = useMemo(() => {
    const rawRoles = memberInGuild?.roles || user?.roles || [];
    if (!Array.isArray(rawRoles)) return [];

    return rawRoles
      .map((r: any) => {
        if (!r) return null;
        if (typeof r === 'string' && activeGuild?.roles) {
          return activeGuild.roles.find((gr) => gr && gr.id === r) || null;
        }
        if (typeof r === 'object' && r.id && r.name) {
          if (activeGuild?.roles) {
            return activeGuild.roles.find((gr) => gr && gr.id === r.id) || r;
          }
          return r;
        }
        return null;
      })
      .filter((r): r is Role => !!r && typeof r.id === 'string' && typeof r.name === 'string' && r.name !== '@everyone');
  }, [memberInGuild, user?.roles, activeGuild?.roles]);

  const canManageMemberRoles = useMemo(() => {
    if (!activeGuild || !memberInGuild || !perms?.canManageRoles) return false;
    try {
      const mod = perms.canModerateMember?.(memberInGuild);
      if (!mod) return false;
      return Boolean(perms.isCurrentOwner || (!mod.isTargetOwner && mod.isHierarchyAllowed));
    } catch {
      return false;
    }
  }, [activeGuild, memberInGuild, perms]);

  const availableRoles = useMemo(() => {
    if (!activeGuild?.roles || !Array.isArray(activeGuild.roles)) return [];
    return [...activeGuild.roles]
      .filter((r) => {
        if (!r || typeof r !== 'object' || !r.name || r.name === '@everyone') return false;
        if (perms.isCurrentOwner) return true;
        const rolePos = typeof r.position === 'number' ? r.position : 999;
        return rolePos > perms.currentUserHighestPos;
      })
      .sort(
        (a, b) =>
          (typeof a.position === 'number' ? a.position : 999) -
          (typeof b.position === 'number' ? b.position : 999)
      );
  }, [activeGuild?.roles, perms.isCurrentOwner, perms.currentUserHighestPos]);

  const updateDropdownPos = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = 224;
    const dropdownHeight = 220;
    const margin = 12;

    let left = rect.left;
    let top = rect.bottom + 6;

    if (top + dropdownHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - dropdownHeight - 6);
    }

    if (left + dropdownWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - dropdownWidth - margin);
    }

    setDropdownPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!isDropdownOpen) return;
    updateDropdownPos();
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleScrollOrResize = () => {
      updateDropdownPos();
    };
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
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
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isDropdownOpen]);

  if (!user) return null;
  if (displayRoles.length === 0 && !canManageMemberRoles) return null;

  const canRemoveRole = (role: Role) => {
    if (!activeGuild || !user || !role?.id) return false;
    if (!perms?.canManageRoles) return false;
    if (perms.isCurrentOwner) return true;

    const isTargetOwner = Boolean(
      activeGuild.owner_id && String(user.id).toLowerCase() === String(activeGuild.owner_id).toLowerCase()
    );
    if (isTargetOwner) return false;

    const isMe = Boolean(
      currentAuthUser?.id && String(currentAuthUser.id).toLowerCase() === String(user.id).toLowerCase()
    );
    const rolePos = typeof role.position === 'number' ? role.position : 999999;

    if (isMe) {
      // Não permite remover o seu próprio maior cargo na hierarquia (exceto caso seja dono, já tratado acima)
      return rolePos > perms.currentUserHighestPos;
    }

    const targetMod = perms.canModerateMember?.(memberInGuild || user);
    if (!targetMod?.isHierarchyAllowed) return false;

    return rolePos > perms.currentUserHighestPos;
  };

  const handleRemoveRole = async (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeGuild || !user || !role?.id || operatingRoleId) return;
    if (!canRemoveRole(role)) return;

    setOperatingRoleId(role.id);
    try {
      await removeRole(activeGuild.id, user.id, role.id);
    } catch (err) {
      console.error('Falha ao remover cargo:', err);
    } finally {
      setOperatingRoleId(null);
    }
  };

  const handleToggleRole = async (role: Role) => {
    if (!activeGuild || !role?.id || operatingRoleId) return;
    const rolePos = typeof role.position === 'number' ? role.position : 999;
    const isManageable = perms.isCurrentOwner || rolePos > (perms.currentUserHighestPos ?? 999999);
    if (!isManageable) return;

    const hasRole = displayRoles.some((r) => r && r.id === role.id);
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
        {displayRoles.map((role) => {
          const removable = canRemoveRole(role);
          const isOperating = operatingRoleId === role.id;

          return (
            <span
              key={role.id}
              className={`${
                isSmall
                  ? `text-[10px] ${removable ? 'pl-2 pr-1' : 'px-2'} py-0.5`
                  : `text-xs ${removable ? 'pl-2.5 pr-1.5' : 'px-2.5'} py-1 shadow-sm`
              } font-semibold rounded-md bg-white/5 border border-white/10 flex items-center gap-1 group/role`}
              style={{ color: role.color || '#99aab5' }}
            >
              <span
                className={`${isSmall ? 'w-1.5 h-1.5' : 'w-2 h-2'} rounded-full shrink-0`}
                style={{ backgroundColor: role.color || '#99aab5' }}
              />
              <span className="truncate max-w-[140px]">{role.name}</span>

              {removable && (
                <button
                  type="button"
                  disabled={isOperating}
                  onClick={(e) => handleRemoveRole(role, e)}
                  className="ml-0.5 p-0.5 rounded hover:bg-white/10 text-gray-400 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  title={`Remover cargo ${role.name}`}
                >
                  {isOperating ? (
                    <Loader2 className={`${isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3'} animate-spin`} />
                  ) : (
                    <X className={`${isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
                  )}
                </button>
              )}
            </span>
          );
        })}

        {canManageMemberRoles && (
          <>
            <button
              ref={buttonRef}
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

            {isDropdownOpen && typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={dropdownRef}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed',
                    top: `${dropdownPos.top}px`,
                    left: `${dropdownPos.left}px`,
                    width: '224px',
                    zIndex: 99999,
                  }}
                  className="bg-background-darkest border border-white/10 rounded-xl shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 select-none"
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
                        const hasRole = displayRoles.some((r) => r && r.id === role.id);
                        const isManageable =
                          perms.isCurrentOwner || (role.position ?? 999) > (perms.currentUserHighestPos ?? 999999);
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
                </div>,
                document.body
              )}
          </>
        )}
      </div>
    </div>
  );
};
