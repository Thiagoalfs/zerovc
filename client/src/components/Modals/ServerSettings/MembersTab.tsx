import React from 'react';
import {
  Search,
  Crown,
  MoreVertical,
  Clock,
  UserX,
  Ban,
  Check,
} from 'lucide-react';
import { Guild, Role, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';

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
  user,
  roles,
  members,
  filteredMembers,
  memberSearchQuery,
  setMemberSearchQuery,
  selectedRoleFilter,
  setSelectedRoleFilter,
  activeMemberMenuId,
  setActiveMemberMenuId,
  handleToggleMemberRole,
  setMuteModalUser,
  setBanModalUser,
  kickMember,
  isOwner,
}) => {
  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      {/* Search and Role Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={memberSearchQuery}
            onChange={(e) => setMemberSearchQuery(e.target.value)}
            placeholder="Buscar por nome de usuário ou apelido..."
            className="w-full pl-10 pr-4 py-2 bg-[#1e1f22] border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500"
          />
        </div>

        <select
          value={selectedRoleFilter}
          onChange={(e) => setSelectedRoleFilter(e.target.value)}
          className="px-4 py-2 bg-[#1e1f22] border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-brand-500"
        >
          <option value="all">Todos os Cargos ({members.length})</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs text-gray-400">
        Mostrando {filteredMembers.length} de {members.length} membros
      </div>

      {/* Members List Table */}
      <div className="space-y-2.5">
        {filteredMembers.map((member) => {
          const isMemberOwner = member.id === activeGuild.owner_id;
          const memberRoles = member.roles || [];
          const isMuted = !!member.muted_until && new Date(member.muted_until) > new Date();
          const isMenuOpen = activeMemberMenuId === member.id;

          return (
            <div
              key={member.id}
              className="p-3.5 rounded-2xl bg-[#1e1f22] border border-white/10 flex items-center justify-between gap-4 hover:border-white/15 transition-colors"
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
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#1e1f22] ${
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
                  <span className="text-xs text-gray-400">@{member.username}</span>
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
                {isOwner && member.id !== user?.id && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveMemberMenuId(isMenuOpen ? null : member.id)}
                      className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 top-10 z-30 w-56 p-2 bg-[#111214] border border-white/10 rounded-2xl shadow-2xl space-y-1 animate-fade-in">
                        <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 font-mono">
                          Cargos
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-0.5 custom-scrollbar pr-1">
                          {roles
                            .filter((r) => r.name !== '@everyone')
                            .map((r) => {
                            const hasThisRole = memberRoles.some((mr) => mr.id === r.id);
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => handleToggleMemberRole(member.id, r.id, hasThisRole)}
                                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-[#18191c] text-left transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: r.color || '#99AAB5' }}
                                  />
                                  <span className="truncate text-white">{r.name}</span>
                                </div>
                                {hasThisRole && <Check className="w-3.5 h-3.5 text-brand-400" />}
                              </button>
                            );
                          })}
                        </div>

                        <div className="pt-2 mt-1 border-t border-white/10 space-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMemberMenuId(null);
                              setMuteModalUser(member);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-amber-300 hover:bg-amber-500/15 transition-colors cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>{isMuted ? 'Alterar Silenciamento' : 'Silenciar (Timeout)'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMemberMenuId(null);
                              if (confirm(`Expulsar @${member.username} do servidor?`)) {
                                kickMember(activeGuild.id, member.id);
                              }
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Expulsar Membro</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMemberMenuId(null);
                              setBanModalUser(member);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-500/20 font-semibold transition-colors cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Banir Membro</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
