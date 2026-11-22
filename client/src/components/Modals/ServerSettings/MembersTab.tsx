import React from 'react';
import {
  Search,
  Crown,
  MoreVertical,
  Clock,
  UserX,
  Ban,
  Check,
  Shield,
} from 'lucide-react';
import { Guild, Role, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';
import { DropdownSelect } from '../../Common/DropdownSelect';
import { useGuildPermissions } from '../../../hooks/useGuildPermissions';
import {
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../../constants/modalTypography';
import { ModalButton } from '@/components/ui/modal-button';
import { showConfirm } from '../../../stores/confirmModalStore';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../../ContextMenu';

interface MembersTabProps {
  activeGuild: Guild;
  user: User | null;
  roles: Role[];
  members: User[];
  filteredMembers: User[];
  memberSearchQuery: string;
  setMemberSearchQuery: (val: string) => void;
  selectedRoleFilter: string;
  setSelectedRoleFilter: (val: string) => void;
  handleToggleMemberRole: (userId: string, roleId: string, hasRole: boolean) => Promise<void>;
  setMuteModalUser: (u: User | null) => void;
  setBanModalUser: (u: User | null) => void;
  kickMember: (guildId: string, userId: string) => Promise<void>;
  isOwner: boolean;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  activeGuild,
  user,
  roles,
  members,
  filteredMembers,
  memberSearchQuery,
  setMemberSearchQuery,
  selectedRoleFilter,
  setSelectedRoleFilter,
  handleToggleMemberRole,
  setMuteModalUser,
  setBanModalUser,
  kickMember,
  isOwner,
}) => {
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const perms = useGuildPermissions(activeGuild);
  const currentMember = activeGuild?.members?.find((m) => m.id === user?.id);
  const currentUserHighestPos = perms.currentUserHighestPos;

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in py-6">
      {/* Search Bar (Full Width) */}
      <div className="space-y-3">
        <div className="w-full relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={memberSearchQuery}
            onChange={(e) => setMemberSearchQuery(e.target.value)}
            placeholder="Buscar por nome de usuário ou apelido..."
            className="w-full pl-10 pr-4 py-2 bg-background-darkest border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500"
          />
        </div>

        {/* Mobile-only role selector */}
        {roles.length > 0 && (
          <div className="md:hidden">
            <DropdownSelect
              className="w-full"
              value={selectedRoleFilter}
              onChange={(val) => setSelectedRoleFilter(String(val))}
              options={[
                { value: 'all', label: `Todos os Cargos (${members.length})` },
                ...roles.map((r) => ({
                  value: r.id,
                  label: r.name,
                  icon: <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color || '#99aab5' }} />,
                })),
              ]}
              placeholder={`Todos os Cargos (${members.length})`}
            />
          </div>
        )}
      </div>

      <div className={MODAL_DESCRIPTION_CLASS}>
        Mostrando {filteredMembers.length} de {members.length} membros
      </div>

      {/* Members List Table */}
      <div className="space-y-2.5">
        {filteredMembers.map((member) => {
          const isMemberOwner = member.id === activeGuild.owner_id;
          const memberRoles = member.roles || [];
          const isMuted = !!member.muted_until && new Date(member.muted_until) > new Date();

          return (
            <div
              key={member.id}
              className="p-3.5 rounded-2xl bg-background-darker border border-white/10 flex items-center justify-between gap-4 hover:border-white/15 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0">
                    {member.avatar_url ? (
                      <img
                        src={formatAssetUrl(member.avatar_url)}
                        alt={member.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-white text-sm bg-brand-600">
                        {member.username[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background-darker ${
                      member.status === 'online'
                        ? 'bg-emerald-500'
                        : member.status === 'idle'
                        ? 'bg-amber-500'
                        : member.status === 'dnd'
                        ? 'bg-red-500'
                        : 'bg-gray-500'
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm truncate">
                      {member.display_name || member.username}
                    </span>
                    {isMemberOwner && (
                      <span className="p-0.5 text-amber-400" title="Dono do Servidor">
                        <Crown className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {isMuted && (
                      <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full font-medium">
                        Silenciado
                      </span>
                    )}
                  </div>
                  <span className={MODAL_DESCRIPTION_CLASS}>@{member.username}</span>
                </div>
              </div>

              {/* Member Roles & Quick Actions */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-wrap items-center gap-1.5 max-w-md justify-end">
                  {memberRoles
                    .filter((r) => r.name !== '@everyone')
                    .map((r) => (
                    <span
                      key={r.id}
                      className="text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5"
                      style={{
                        backgroundColor: `${r.color || '#5865F2'}20`,
                        color: r.color || '#5865F2',
                        border: `1px solid ${r.color || '#5865F2'}40`,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: r.color || '#5865F2' }}
                      />
                      <span>{r.name}</span>
                    </span>
                  ))}
                </div>

                {/* Moderation Popover Menu */}
                {(() => {
                  const isMe = member.id === user?.id;
                  const mod = perms.canModerateMember(member);
                  const canModerateThisMember = !isMe && !isMemberOwner && (perms.isCurrentOwner || mod.isHierarchyAllowed);
                  const hasAnyModerationPerm = perms.canManageRoles || perms.canMute || perms.canKick || perms.canBan;

                  if (!canModerateThisMember || !hasAnyModerationPerm) return null;

                  const manageableRoles = roles.filter((r) => {
                    if (r.name === '@everyone') return false;
                    if (perms.isCurrentOwner) return true;
                    const rolePos = typeof r.position === 'number' ? r.position : 999;
                    return rolePos > currentUserHighestPos;
                  });

                  const openMemberActions = (e: React.MouseEvent) => {
                    const items: ContextMenuItem[] = [];

                    if (perms.canManageRoles && manageableRoles.length > 0) {
                      items.push({
                        id: 'roles',
                        label: 'Cargos',
                        icon: <Shield className="w-4 h-4" />,
                        subItems: manageableRoles.map((r) => {
                          const hasThisRole = memberRoles.some((mr) => mr.id === r.id);
                          return {
                            id: `role-${r.id}`,
                            label: r.name,
                            icon: hasThisRole ? (
                              <Check className="w-3.5 h-3.5 text-brand-400" />
                            ) : (
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: r.color || '#99AAB5' }}
                              />
                            ),
                            onClick: () => handleToggleMemberRole(member.id, r.id, hasThisRole),
                          };
                        }),
                      });
                    }

                    if (items.length > 0 && (perms.canMute || perms.canKick || perms.canBan)) {
                      items.push({ separator: true, label: '' });
                    }

                    if (perms.canMute) {
                      items.push({
                        id: 'mute',
                        label: isMuted ? 'Alterar Silenciamento' : 'Silenciar (Timeout)',
                        icon: <Clock className="w-4 h-4 text-amber-400" />,
                        onClick: () => setMuteModalUser(member),
                      });
                    }

                    if (perms.canKick) {
                      items.push({
                        id: 'kick',
                        label: 'Expulsar Membro',
                        icon: <UserX className="w-4 h-4" />,
                        variant: 'danger',
                        onClick: async () => {
                          const ok = await showConfirm({
                            title: 'Expulsar membro',
                            message: `Expulsar @${member.username} do servidor?`,
                            confirmText: 'Expulsar',
                            variant: 'danger',
                          });
                          if (ok) {
                            kickMember(activeGuild.id, member.id);
                          }
                        },
                      });
                    }

                    if (perms.canBan) {
                      items.push({
                        id: 'ban',
                        label: 'Banir Membro',
                        icon: <Ban className="w-4 h-4" />,
                        variant: 'danger',
                        onClick: () => setBanModalUser(member),
                      });
                    }

                    openContextMenu(e, items, member.display_name || member.username);
                  };

                  return (
                    <ModalButton
                      type="tertiary"
                      shape="circle"
                      size="small"
                      svgOnly
                      onClick={openMemberActions}
                      title="Moderar membro"
                      aria-label="Moderar membro"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </ModalButton>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
