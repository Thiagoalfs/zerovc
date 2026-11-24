import React, { useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Guild, Role, User } from '../../types';
import { useGuildStore } from '../../stores/guildStore';
import { useGuildPermissions } from '../../hooks/useGuildPermissions';
import {
  CONTEXT_MENU_ITEM_CLASS,
  CONTEXT_MENU_SEPARATOR_CLASS,
} from '@/components/ui/context-menu-1';

export interface RoleSelectorMenuProps {
  guild?: Guild | null;
  targetUser: User | null;
  showHeader?: boolean;
  maxHeightClass?: string;
}

export const RoleSelectorMenu: React.FC<RoleSelectorMenuProps> = ({
  guild,
  targetUser,
  showHeader = true,
  maxHeightClass = 'max-h-[180px]',
}) => {
  const storeActiveGuild = useGuildStore((s) => s.activeGuild);
  const storeGuilds = useGuildStore((s) => s.guilds);
  const assignRole = useGuildStore((s) => s.assignRole);
  const removeRole = useGuildStore((s) => s.removeRole);

  const activeGuild = useMemo(() => {
    if (!guild) return storeActiveGuild ?? null;
    if (storeActiveGuild && storeActiveGuild.id === guild.id) {
      return storeActiveGuild;
    }
    return storeGuilds.find((g) => g.id === guild.id) || guild;
  }, [guild, storeActiveGuild, storeGuilds]);

  const perms = useGuildPermissions(activeGuild);
  const [operatingRoleId, setOperatingRoleId] = useState<string | null>(null);

  const memberInGuild = useMemo(() => {
    if (!activeGuild || !targetUser || !Array.isArray(activeGuild.members)) return null;
    return (
      activeGuild.members.find(
        (m) => m && String(m.id).toLowerCase() === String(targetUser.id).toLowerCase()
      ) || null
    );
  }, [activeGuild, targetUser]);

  const assignedRoleIds = useMemo(() => {
    const rawRoles = memberInGuild?.roles || targetUser?.roles || [];
    if (!Array.isArray(rawRoles)) return new Set<string>();
    const ids = new Set<string>();
    for (const r of rawRoles) {
      const id = typeof r === 'string' ? r : (r as any)?.id;
      if (id) ids.add(String(id).toLowerCase());
    }
    return ids;
  }, [memberInGuild, targetUser?.roles]);

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

  if (!activeGuild || !targetUser) return null;

  const handleToggleRole = async (role: Role) => {
    if (!role?.id || operatingRoleId) return;
    const rolePos = typeof role.position === 'number' ? role.position : 999;
    const isManageable = perms.isCurrentOwner || rolePos > (perms.currentUserHighestPos ?? 999999);
    if (!isManageable) return;

    const hasRole = assignedRoleIds.has(String(role.id).toLowerCase());
    setOperatingRoleId(role.id);
    try {
      if (hasRole) {
        await removeRole(activeGuild.id, targetUser.id, role.id);
      } else {
        await assignRole(activeGuild.id, targetUser.id, role.id);
      }
    } catch (err) {
      console.error('Falha ao atualizar cargo:', err);
    } finally {
      setOperatingRoleId(null);
    }
  };

  return (
    <div className="flex flex-col select-none">
      {showHeader && (
        <>
          <div className="px-2.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
            <span>Cargos do Servidor</span>
            <span className="text-[10px] text-gray-500 font-normal">{availableRoles.length}</span>
          </div>
          <div className={CONTEXT_MENU_SEPARATOR_CLASS} />
        </>
      )}

      <div className={`${maxHeightClass} overflow-y-auto no-scrollbar space-y-0.5`}>
        {availableRoles.length === 0 ? (
          <div className="px-2.5 py-2 text-center text-xs text-gray-500">
            Nenhum cargo disponível
          </div>
        ) : (
          availableRoles.map((role) => {
            const hasRole = assignedRoleIds.has(String(role.id).toLowerCase());
            const isManageable =
              perms.isCurrentOwner || (role.position ?? 999) > (perms.currentUserHighestPos ?? 999999);
            const isCurrentOperating = operatingRoleId === role.id;

            return (
              <button
                key={role.id}
                type="button"
                disabled={!isManageable || isCurrentOperating}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleToggleRole(role);
                }}
                className={`w-full justify-between gap-3 text-xs text-left group ${CONTEXT_MENU_ITEM_CLASS} ${
                  !isManageable
                    ? 'opacity-40 cursor-not-allowed text-gray-500 pointer-events-none'
                    : ''
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: role.color || '#99aab5' }}
                  />
                  <span
                    className="truncate"
                    style={{ color: role.color || undefined }}
                  >
                    {role.name}
                  </span>
                </div>

                <span
                  className={`w-4 h-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 transition-colors ${
                    hasRole
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'border-white/25 bg-transparent'
                  }`}
                  aria-hidden="true"
                >
                  {isCurrentOperating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : hasRole ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
