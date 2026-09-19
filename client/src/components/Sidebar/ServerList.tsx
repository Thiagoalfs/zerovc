import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, MessageSquare, CheckCheck, Bell, BellOff, Copy, LogOut, Check, Folder, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import { formatAssetUrl, api } from '../../lib/api';
import { ContextMenu } from '../ContextMenu/ContextMenu';
import { useContextMenu, ContextMenuItem } from '../ContextMenu/useContextMenu';
import { ServerFolder } from '../../types';

interface ServerListProps {
  isHomeActive: boolean;
  onSelectHome: () => void;
  onSelectGuild?: (guildId: string) => void;
  onOpenCreateServer: () => void;
}

export const ServerList: React.FC<ServerListProps> = ({
  isHomeActive,
  onSelectHome,
  onSelectGuild,
  onOpenCreateServer,
}) => {
  const { user } = useAuthStore();
  const {
    guilds,
    activeGuild,
    selectGuild,
    unreadChannels,
    guildMentions,
    markGuildAsRead,
    toggleMuteGuild,
    isGuildMuted,
    leaveGuild,
    deleteGuild,
  } = useGuildStore();
  const { roomUnreadCounts } = useDMStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const [copiedGuildId, setCopiedGuildId] = useState<string | null>(null);

  // Server Folders State with Local Storage Cache & Database Sync
  const [folders, setFolders] = useState<ServerFolder[]>(() => {
    try {
      if (user?.server_folders && Array.isArray(user.server_folders) && user.server_folders.length > 0) {
        return user.server_folders;
      }
      const saved = localStorage.getItem('zerovc_server_folders');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Ordered Guild IDs
  const [orderedGuildIds, setOrderedGuildIds] = useState<string[]>(() => {
    try {
      if (user?.guild_positions && Array.isArray(user.guild_positions) && user.guild_positions.length > 0) {
        return user.guild_positions;
      }
      const saved = localStorage.getItem('zerovc_guild_positions');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [draggedGuildId, setDraggedGuildId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; type: 'guild' | 'folder'; position?: 'top' | 'bottom' | 'center' } | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state to local storage & backend with debounce
  const syncFoldersAndPositions = (newFolders: ServerFolder[], newPositions: string[]) => {
    setFolders(newFolders);
    setOrderedGuildIds(newPositions);

    try {
      localStorage.setItem('zerovc_server_folders', JSON.stringify(newFolders));
      localStorage.setItem('zerovc_guild_positions', JSON.stringify(newPositions));
    } catch {}

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        await api.users.updateProfile({
          server_folders: newFolders as any,
          guild_positions: newPositions as any,
        });
      } catch (err) {
        console.warn('[ServerList] Failed to sync folder positions:', err);
      }
    }, 800);
  };

  const totalUnreadDMs = Object.values(roomUnreadCounts).reduce((acc, count) => acc + count, 0);

  // Map of guild ID to folder ID
  const guildToFolderMap = useMemo(() => {
    const map = new Map<string, ServerFolder>();
    folders.forEach((f) => {
      f.guild_ids.forEach((gid) => {
        map.set(gid, f);
      });
    });
    return map;
  }, [folders]);

  // Compute final display list: includes standalone guilds and folder groups
  const displayItems = useMemo(() => {
    const guildMap = new Map(guilds.map((g) => [g.id, g]));
    const handledGuildIds = new Set<string>();
    const items: Array<{ type: 'folder'; folder: ServerFolder } | { type: 'guild'; guild: (typeof guilds)[0] }> = [];

    // First process existing folders
    folders.forEach((folder) => {
      const validGuilds = folder.guild_ids.filter((gid) => guildMap.has(gid));
      if (validGuilds.length > 0) {
        items.push({
          type: 'folder',
          folder: { ...folder, guild_ids: validGuilds },
        });
        validGuilds.forEach((gid) => handledGuildIds.add(gid));
      }
    });

    // Then process ordered standalone guilds
    const remainingGuilds = guilds.filter((g) => !handledGuildIds.has(g.id));
    remainingGuilds.forEach((guild) => {
      items.push({ type: 'guild', guild });
    });

    return items;
  }, [guilds, folders]);

  const toggleFolderCollapse = (folderId: string) => {
    const updated = folders.map((f) =>
      f.id === folderId ? { ...f, is_collapsed: !f.is_collapsed } : f
    );
    syncFoldersAndPositions(updated, orderedGuildIds);
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, guildId: string) => {
    setDraggedGuildId(guildId);
    e.dataTransfer.setData('text/plain', guildId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string, type: 'guild' | 'folder') => {
    e.preventDefault();
    if (!draggedGuildId || draggedGuildId === targetId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const height = rect.height;

    let position: 'top' | 'bottom' | 'center' = 'center';
    if (offsetY < height * 0.28) position = 'top';
    else if (offsetY > height * 0.72) position = 'bottom';
    else position = 'center';

    setDragOverTarget({ id: targetId, type, position });
  };

  const handleDrop = (
    e: React.DragEvent,
    targetId: string,
    type: 'guild' | 'folder' | 'root',
    targetFolderId?: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const srcGuildId = draggedGuildId;
    setDraggedGuildId(null);
    setDragOverTarget(null);

    if (!srcGuildId) return;

    // Case 0: Dropped onto root area (outside any folder) -> pull out of folder if it was inside one
    if (type === 'root' || !targetId) {
      const cleanFolders = folders
        .map((f) => ({
          ...f,
          guild_ids: f.guild_ids.filter((id) => id !== srcGuildId),
        }))
        .filter((f) => f.guild_ids.length > 1);

      const currentList = orderedGuildIds.length > 0 ? [...orderedGuildIds] : guilds.map((g) => g.id);
      const filtered = currentList.filter((id) => id !== srcGuildId);
      filtered.push(srcGuildId);

      syncFoldersAndPositions(cleanFolders, filtered);
      return;
    }

    if (srcGuildId === targetId) return;

    const srcFolder = guildToFolderMap.get(srcGuildId);

    // 1. Dropped into / onto existing Folder Header
    if (type === 'folder' || (dragOverTarget?.position === 'center' && guildToFolderMap.has(targetId))) {
      const targetFolder = type === 'folder'
        ? folders.find((f) => f.id === targetId)
        : guildToFolderMap.get(targetId);

      if (targetFolder) {
        // Remove srcGuild from old folder if different
        const cleanFolders = folders
          .map((f) => ({
            ...f,
            guild_ids: f.guild_ids.filter((id) => id !== srcGuildId),
          }))
          .filter((f) => f.guild_ids.length > 1);

        // Add to target folder
        const updated = cleanFolders.map((f) =>
          f.id === targetFolder.id && !f.guild_ids.includes(srcGuildId)
            ? { ...f, guild_ids: [...f.guild_ids, srcGuildId], is_collapsed: false }
            : f
        );

        syncFoldersAndPositions(updated, orderedGuildIds);
        return;
      }
    }

    // 2. Dropped in center of another standalone guild -> Create New Folder
    if (dragOverTarget?.position === 'center' && type === 'guild') {
      const cleanFolders = folders
        .map((f) => ({
          ...f,
          guild_ids: f.guild_ids.filter((id) => id !== srcGuildId && id !== targetId),
        }))
        .filter((f) => f.guild_ids.length > 1);

      const newFolder: ServerFolder = {
        id: `folder-${Date.now()}`,
        name: 'Pasta de Servidores',
        guild_ids: [targetId, srcGuildId],
        is_collapsed: false,
      };

      syncFoldersAndPositions([...cleanFolders, newFolder], orderedGuildIds);
      return;
    }

    // 3. Dropped top/bottom inside the SAME folder -> Reorder inside that folder
    if (
      srcFolder &&
      targetFolderId &&
      srcFolder.id === targetFolderId &&
      (dragOverTarget?.position === 'top' || dragOverTarget?.position === 'bottom')
    ) {
      const folderGuilds = [...srcFolder.guild_ids.filter((id) => id !== srcGuildId)];
      const targetIdx = folderGuilds.indexOf(targetId);
      const insertIdx = dragOverTarget.position === 'bottom' ? targetIdx + 1 : Math.max(0, targetIdx);
      folderGuilds.splice(insertIdx, 0, srcGuildId);

      const updated = folders.map((f) =>
        f.id === srcFolder.id ? { ...f, guild_ids: folderGuilds } : f
      );
      syncFoldersAndPositions(updated, orderedGuildIds);
      return;
    }

    // 4. Dropped top/bottom of a standalone server OR outside folder -> Pull out of folder!
    const cleanFolders = folders
      .map((f) => ({
        ...f,
        guild_ids: f.guild_ids.filter((id) => id !== srcGuildId),
      }))
      .filter((f) => f.guild_ids.length > 1);

    const currentList = orderedGuildIds.length > 0 ? [...orderedGuildIds] : guilds.map((g) => g.id);
    const filtered = currentList.filter((id) => id !== srcGuildId);
    const targetIdx = filtered.indexOf(targetId);
    const insertIdx = targetIdx >= 0
      ? (dragOverTarget?.position === 'bottom' ? targetIdx + 1 : Math.max(0, targetIdx))
      : filtered.length;

    filtered.splice(insertIdx, 0, srcGuildId);
    syncFoldersAndPositions(cleanFolders, filtered);
  };

  const handleServerContextMenu = (e: React.MouseEvent, guild: (typeof guilds)[0]) => {
    const isOwner = user?.id === guild.owner_id;
    const isMuted = isGuildMuted(guild.id);
    const currentFolder = guildToFolderMap.get(guild.id);

    const items: ContextMenuItem[] = [
      {
        id: 'mark-as-read',
        label: 'Marcar como lido',
        icon: <CheckCheck className="w-4 h-4 text-emerald-400" />,
        onClick: () => {
          markGuildAsRead(guild.id);
        },
      },
      {
        id: 'toggle-mute',
        label: isMuted ? 'Desmutar Servidor' : 'Mutar Servidor',
        icon: isMuted ? <Bell className="w-4 h-4 text-amber-400" /> : <BellOff className="w-4 h-4 text-gray-400" />,
        onClick: () => {
          toggleMuteGuild(guild.id);
        },
      },
      ...(currentFolder
        ? [
            {
              id: 'remove-from-folder',
              label: 'Remover da Pasta',
              icon: <Folder className="w-4 h-4 text-amber-400" />,
              onClick: () => {
                const updated = folders
                  .map((f) =>
                    f.id === currentFolder.id
                      ? { ...f, guild_ids: f.guild_ids.filter((id) => id !== guild.id) }
                      : f
                  )
                  .filter((f) => f.guild_ids.length > 1);
                syncFoldersAndPositions(updated, orderedGuildIds);
              },
            },
          ]
        : []),
      {
        id: 'copy-id',
        label: copiedGuildId === guild.id ? 'ID Copiado!' : 'Copiar ID do Servidor',
        icon: copiedGuildId === guild.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />,
        onClick: () => {
          navigator.clipboard.writeText(guild.id);
          setCopiedGuildId(guild.id);
          setTimeout(() => setCopiedGuildId(null), 2000);
        },
      },
      {
        separator: true,
        label: '',
      },
      {
        id: 'leave-server',
        label: isOwner ? 'Sair do Servidor (Dono)' : 'Sair do Servidor',
        icon: <LogOut className="w-4 h-4" />,
        variant: 'danger',
        disabled: isOwner,
        tooltip: isOwner ? 'Donos de servidor não podem sair sem antes transferir ou excluir o servidor nas configurações' : undefined,
        onClick: async () => {
          if (isOwner) {
            alert('Você é o dono deste servidor. Transfira a posse ou exclua o servidor nas configurações.');
            return;
          }
          if (window.confirm(`Tem certeza que deseja sair do servidor "${guild.name}"?`)) {
            try {
              await leaveGuild(guild.id);
              if (activeGuild?.id === guild.id) {
                onSelectHome();
              }
            } catch (err: any) {
              alert(err?.message || 'Erro ao sair do servidor');
            }
          }
        },
      },
    ];

    openContextMenu(e, items, guild.name);
  };

  const renderGuildIcon = (guild: (typeof guilds)[0], inFolder = false, parentFolderId?: string) => {
    const isActive = !isHomeActive && activeGuild?.id === guild.id;
    const mentionCount = guildMentions[guild.id] || 0;
    const hasUnread = guild.channels?.some((c) => unreadChannels.has(c.id));
    const initials = guild.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();

    const isOver = dragOverTarget?.id === guild.id;
    const isCenterOver = isOver && dragOverTarget.position === 'center';

    return (
      <div
        key={guild.id}
        draggable
        onDragStart={(e) => handleDragStart(e, guild.id)}
        onDragOver={(e) => handleDragOver(e, guild.id, 'guild')}
        onDrop={(e) => handleDrop(e, guild.id, 'guild', parentFolderId)}
        className="relative group flex items-center justify-center"
      >
        {/* Drop Insertion Line (Top / Bottom) */}
        {isOver && dragOverTarget.position === 'top' && (
          <div className="absolute -top-1.5 inset-x-2 h-1 bg-brand-400 rounded-full z-30 animate-pulse shadow-md shadow-brand-500/50" />
        )}
        {isOver && dragOverTarget.position === 'bottom' && (
          <div className="absolute -bottom-1.5 inset-x-2 h-1 bg-brand-400 rounded-full z-30 animate-pulse shadow-md shadow-brand-500/50" />
        )}

        <button
          onClick={() => {
            if (onSelectGuild) {
              onSelectGuild(guild.id);
            } else {
              selectGuild(guild.id);
            }
          }}
          onContextMenu={(e) => handleServerContextMenu(e, guild)}
          className={`relative group w-12 h-12 flex items-center justify-center font-semibold text-sm transition-all duration-150 origin-center ${
            isCenterOver
              ? 'scale-[0.80] rounded-[18px] ring-2 ring-brand-400 bg-brand-500/40 shadow-inner'
              : isActive
              ? 'rounded-[16px] bg-brand-500 text-white shadow-lg shadow-brand-500/30'
              : inFolder
              ? 'rounded-[24px] hover:rounded-[16px] bg-background-darkest/90 hover:bg-brand-500 text-gray-200 hover:text-white'
              : 'rounded-[24px] hover:rounded-[16px] bg-background-dark hover:bg-brand-500 text-gray-200 hover:text-white'
          }`}
          title={guild.name}
        >
          {/* Left Indicator Pill */}
          <div
            className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
              isActive ? 'h-10' : hasUnread ? 'h-2' : 'h-0 group-hover:h-5'
            }`}
          />

          {guild.icon_url ? (
            <img
              src={formatAssetUrl(guild.icon_url)}
              alt={guild.name}
              className="w-full h-full object-cover rounded-[inherit] transition-all duration-150"
            />
          ) : (
            <span>{initials}</span>
          )}

          {/* Mention Notification Badge */}
          {mentionCount > 0 && !isActive && (
            <div className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 bg-dnd text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-background-darkest shadow-lg animate-in zoom-in-50">
              {mentionCount > 99 ? '99+' : mentionCount}
            </div>
          )}
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="w-[72px] flex-shrink-0 bg-background-darkest flex flex-col items-center py-3 gap-2 select-none z-20 border-r border-black/20">
        {/* Home / Friends / Direct Messages */}
        <button
          onClick={onSelectHome}
          className={`relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all duration-200 shadow-md ${
            isHomeActive
              ? 'rounded-[16px] bg-brand-500 text-white shadow-lg shadow-brand-500/30'
              : 'bg-background-dark hover:bg-brand-500 text-gray-200 hover:text-white'
          }`}
          title="Amigos e Mensagens"
        >
          <MessageSquare className="w-6 h-6" />

          {/* Left active pill */}
          <div
            className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
              isHomeActive ? 'h-10' : totalUnreadDMs > 0 ? 'h-2' : 'h-0 group-hover:h-5'
            }`}
          />

          {/* Discord-style Unread DM Notification Badge */}
          {totalUnreadDMs > 0 && !isHomeActive && (
            <div className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 bg-dnd text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-background-darkest shadow-lg animate-in zoom-in-50">
              {totalUnreadDMs > 99 ? '99+' : totalUnreadDMs}
            </div>
          )}
        </button>

        <div className="w-8 h-[2px] bg-white/10 rounded-full my-1" />

        {/* Guilds & Folders List */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (draggedGuildId) {
              handleDrop(e, '', 'root');
            }
          }}
          className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto overflow-x-hidden no-scrollbar pb-6"
        >
          {displayItems.map((item) => {
            if (item.type === 'folder') {
              const folder = item.folder;
              const isCollapsed = folder.is_collapsed !== false;
              const folderGuilds = folder.guild_ids
                .map((gid) => guilds.find((g) => g.id === gid))
                .filter(Boolean) as typeof guilds;

              const isOverFolder = dragOverTarget?.id === folder.id;

              return (
                <div
                  key={folder.id}
                  onDragOver={(e) => handleDragOver(e, folder.id, 'folder')}
                  onDrop={(e) => handleDrop(e, folder.id, 'folder')}
                  className={`w-full flex flex-col items-center gap-2 p-1 rounded-[28px] transition-all duration-200 ${
                    !isCollapsed
                      ? 'bg-background-darker/60 border border-white/5 shadow-inner'
                      : isOverFolder
                      ? 'bg-brand-500/20 ring-2 ring-brand-400'
                      : ''
                  }`}
                >
                  {/* Folder Icon Button (Toggles collapse) */}
                  <button
                    type="button"
                    onClick={() => toggleFolderCollapse(folder.id)}
                    className={`relative w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all duration-200 cursor-pointer shadow-md overflow-hidden ${
                      isCollapsed ? 'bg-background-dark hover:bg-brand-500/30' : 'bg-brand-500/20 text-brand-300'
                    }`}
                    title={`${folder.name} (${folderGuilds.length} servidores)`}
                  >
                    {isCollapsed ? (
                      <div className="grid grid-cols-2 gap-1 p-2 w-full h-full">
                        {folderGuilds.slice(0, 4).map((fg) => (
                          <div
                            key={fg.id}
                            className="w-full h-full rounded-md bg-background-darkest flex items-center justify-center overflow-hidden text-[8px] font-bold text-gray-300"
                          >
                            {fg.icon_url ? (
                              <img src={formatAssetUrl(fg.icon_url)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span>{fg.name.slice(0, 1)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Folder className="w-6 h-6 text-brand-400" />
                    )}
                  </button>

                  {/* Expanded Server Items in Folder */}
                  {!isCollapsed && (
                    <div className="flex flex-col items-center gap-2 w-full animate-in fade-in slide-in-from-top-1">
                      {folderGuilds.map((fg) => renderGuildIcon(fg, true, folder.id))}
                    </div>
                  )}
                </div>
              );
            }

            return renderGuildIcon(item.guild);
          })}

          {/* Unified Add/Join Server Button (+) */}
          <button
            onClick={onOpenCreateServer}
            className="relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-background-dark hover:bg-online flex items-center justify-center text-online hover:text-white transition-all duration-200 shadow-md"
            title="Adicionar ou Entrar em um Servidor"
          >
            <Plus className="w-6 h-6 transition-transform group-hover:rotate-90 duration-200" />
          </button>
        </div>
      </div>

      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
