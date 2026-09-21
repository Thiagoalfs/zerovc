import React from 'react';
import {
  Search,
  Crown,
  MoreVertical,
  VolumeX,
} from 'lucide-react';
import { Guild, Role, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';
import { ContextMenu } from '../../ContextMenu';
import { useUserContextMenu } from '../../../hooks/useUserContextMenu';

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
  activeMemberMenuId: string | null;
  setActiveMemberMenuId: (id: string | null) => void;
  handleToggleMemberRole: (userId: string, roleId: string, hasRole: boolean) => Promise<void>;
  setMuteModalUser: (u: User | null) => void;
  setBanModalUser: (u: User | null) => void;
  kickMember: (guildId: string, userId: string) => Promise<void>;
  isOwner: boolean;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  activeGuild,
  roles,
  members,
  filteredMembers,
  memberSearchQuery,
  setMemberSearchQuery,
  selectedRoleFilter,
  setSelectedRoleFilter,
}) => {
  const { menu, closeContextMenu, handleUserContextMenu } = useUserContextMenu();

  return (
    <div id="members-list" className="max-w-4xl space-y-6 animate-fade-in scroll-mt-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-base font-bold text-white">Membros do Servidor</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Gerencie permissões, cargos e moderação dos membros da comunidade.
          </p>
        </div>
        <div className="text-xs font-mono text-gray-400 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 w-fit">
          {filteredMembers.length} de {members.length} {members.length === 1 ? 'membro' : 'membros'}
        </div>
      </div>

      {/* Search and Role Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={memberSearchQuery}
            onChange={(e) => setMemberSearchQuery(e.target.value)}
            placeholder="Buscar por nome de usuário ou apelido..."
            className="w-full pl-10 pr-4 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        <select
          value={selectedRoleFilter}
          onChange={(e) => setSelectedRoleFilter(e.target.value)}
          className="px-4 py-2 bg-[#111214] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
        >
          <option value="all">Todos os Cargos ({members.length})</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Members List Table / Clean Rows */}
      <div className="border border-white/10 rounded-2xl bg-[#111214]/50 overflow-hidden divide-y divide-white/5">
        {filteredMembers.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Nenhum membro encontrado com os filtros aplicados.
          </div>
        ) : (
          filteredMembers.map((member) => {
            const isMemberOwner = member.id === activeGuild.owner_id;
            const memberRoles = member.roles || [];
            const isMuted = !!member.muted_until && new Date(member.muted_until) > new Date();

            return (
              <div
                key={member.id}
                onContextMenu={(e) =>
                  handleUserContextMenu(e, member, {
                    contextType: 'guild',
                  })
                }
                className="p-3 sm:px-4 flex items-center justify-between gap-4 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden shrink-0 ring-1 ring-white/10">
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
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#111214] ${
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
                        <span className="p-0.5 text-amber-400 shrink-0" title="Dono do Servidor">
                          <Crown className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {isMuted && (
                        <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shrink-0">
                          <VolumeX className="w-3 h-3" />
                          Silenciado
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 block truncate">@{member.username}</span>
                  </div>
                </div>

                {/* Member Roles & Quick Actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:flex flex-wrap items-center gap-1.5 max-w-xs md:max-w-md justify-end">
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
                        <span className="truncate max-w-[120px]">{r.name}</span>
                      </span>
                    ))}
                  </div>

                  {/* Context Menu Button (3 Dots) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUserContextMenu(e, member, {
                        contextType: 'guild',
                      });
                    }}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Opções do Membro"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Global Context Menu Portal */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
