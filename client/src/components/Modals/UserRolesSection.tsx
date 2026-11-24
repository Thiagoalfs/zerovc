import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Plus, X } from 'lucide-react';
import { User, Role, Guild } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useGuildPermissions } from '../../hooks/useGuildPermissions';
import { ModalButton } from '@/components/ui/modal-button';
import { CONTEXT_MENU_PANEL_CLASS } from '@/components/ui/context-menu-1';
import { RoleSelectorMenu } from '../ContextMenu/RoleSelectorMenu';

export interface UserRolesSectionProps {
  user: User | null;
  guild?: Guild | null;
  size?: 'sm' | 'md';
}

export const UserRolesSection: React.FC<UserRolesSectionProps> = ({
  user,
  guild,
  size = 'sm',
}) => {
  const currentAuthUser = useAuthStore((s) => s.user);
  const storeActiveGuild = useGuildStore((s) => s.activeGuild);
  const storeGuilds = useGuildStore((s) => s.guilds);
  const activeGuild = useMemo(() => {
    if (!guild) return null;
    if (storeActiveGuild && storeActiveGuild.id === guild.id) {
      return storeActiveGuild;
    }
    return storeGuilds.find((g) => g.id === guild.id) || guild;
  }, [guild, storeActiveGuild, storeGuilds]);
  const assignRole = useGuildStore((s) => s.assignRole);
  const removeRole = useGuildStore((s) => s.removeRole);
  const perms = useGuildPermissions(activeGuild);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [operatingRoleId, setOperatingRoleId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with active guild member if inside a server context
  const memberInGuild = useMemo(() => {
    if (!activeGuild || !user || !Array.isArray(activeGuild.members)) return null;
    return activeGuild.members.find((m) => m && String(m.id).toLowerCase() === String(user.id).toLowerCase()) || null;
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
    if (!activeGuild || !user || !perms?.canManageRoles) return false;
    if (perms.isCurrentOwner) return true;
    try {
      const target = memberInGuild || user;
      const mod = perms.canModerateMember?.(target);
      if (!mod) return false;
      const isMe = Boolean(
        currentAuthUser?.id && String(currentAuthUser.id).toLowerCase() === String(user.id).toLowerCase()
      );
      if (isMe) return true;
      return !mod.isTargetOwner && mod.isHierarchyAllowed;
    } catch {
      return false;
    }
  }, [activeGuild, memberInGuild, user, perms, currentAuthUser]);

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

  const calculateDropdownPos = () => {
    if (!buttonRef.current) return null;
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

    return { top, left };
  };

  const updateDropdownPos = () => {
    const pos = calculateDropdownPos();
    if (pos) {
      setDropdownPos(pos);
    }
  };

  const handleToggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDropdownOpen) {
      setIsDropdownOpen(false);
      setDropdownPos(null);
    } else {
      const pos = calculateDropdownPos();
      if (pos) {
        setDropdownPos(pos);
      }
      setIsDropdownOpen(true);
    }
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
        setDropdownPos(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
        setDropdownPos(null);
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

    const hasRole = displayRoles.some((r) => r && String(r.id).toLowerCase() === String(role.id).toLowerCase());
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

  if (!activeGuild || (displayRoles.length === 0 && !canManageMemberRoles)) {
    return null;
  }

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
                <ModalButton
                  type="tertiary"
                  size="tiny"
                  svgOnly
                  loading={isOperating}
                  onClick={(e) => handleRemoveRole(role, e)}
                  className="!w-4 !h-4 ml-0.5 text-gray-400 hover:text-red-400"
                  title={`Remover cargo ${role.name}`}
                >
                  <X className={isSmall ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                </ModalButton>
              )}
            </span>
          );
        })}

        {canManageMemberRoles && (
          <>
            <ModalButton
              ref={buttonRef}
              type="secondary"
              size="tiny"
              svgOnly
              onClick={handleToggleDropdown}
              className={isSmall ? '!w-5 !h-5' : '!w-6 !h-6'}
              title="Adicionar ou alterar cargos"
            >
              <Plus className={isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </ModalButton>

            {isDropdownOpen && dropdownPos && typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={dropdownRef}
                  data-floating-overlay="true"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed',
                    top: `${dropdownPos.top}px`,
                    left: `${dropdownPos.left}px`,
                    zIndex: 100000000,
                  }}
                  className={`min-w-[216px] max-w-[260px] select-none animate-in fade-in zoom-in-95 duration-75 font-sans flex flex-col ${CONTEXT_MENU_PANEL_CLASS}`}
                >
                  <RoleSelectorMenu guild={activeGuild} targetUser={user} />
                </div>,
                document.body
              )}
          </>
        )}
      </div>
    </div>
  );
};
