import React, { useEffect } from 'react';
import { Users, MessageSquare } from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { DMRoom } from '../../types';
import { UserBar } from '../Sidebar/UserBar';

interface DMChannelListProps {
  currentView: 'friends' | 'dm';
  onSelectFriends: () => void;
  onOpenSettings: () => void;
  onOpenScreenShare: () => void;
  onCloseMobileDrawer?: () => void;
}

export const DMChannelList: React.FC<DMChannelListProps> = ({
  currentView,
  onSelectFriends,
  onOpenSettings,
  onOpenScreenShare,
  onCloseMobileDrawer,
}) => {
  const { rooms, activeRoom, selectRoom, fetchRooms } = useDMStore();

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleSelectRoom = (room: DMRoom) => {
    selectRoom(room);
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const handleSelectFriends = () => {
    onSelectFriends();
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const getStatusColor = (s?: string) => {
    switch (s) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
  };

  return (
    <div className="w-60 bg-background-darker flex flex-col h-full select-none border-r border-black/20">
      {/* Header */}
      <div className="h-12 border-b border-black/20 px-4 flex items-center justify-between shadow-sm">
        <span className="font-bold text-gray-100 text-sm">Mensagens Diretas</span>
      </div>

      {/* Friends Button */}
      <div className="p-3 pb-1">
        <button
          onClick={handleSelectFriends}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
            currentView === 'friends'
              ? 'bg-brand-500 text-white shadow-md'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Amigos</span>
        </button>
      </div>

      {/* DM Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 block">
          Mensagens Diretas
        </span>

        {rooms.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-gray-500">
            Nenhuma conversa recente.
          </div>
        ) : (
          rooms.map((room) => {
            const isSelected = currentView === 'dm' && activeRoom?.id === room.id;
            const recipient = room.recipient;

            return (
              <button
                key={room.id}
                onClick={() => handleSelectRoom(room)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                <div className="relative w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {recipient?.avatar_url ? (
                    <img src={recipient.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span>{recipient?.display_name?.[0]?.toUpperCase() || recipient?.username[0]?.toUpperCase() || 'U'}</span>
                  )}
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background-darker ${getStatusColor(recipient?.status)}`} />
                </div>

                <div className="flex flex-col text-left truncate flex-1">
                  <span className="text-gray-200 truncate">
                    {recipient?.display_name || recipient?.username}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate">
                    @{recipient?.username}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* User Footer */}
      <UserBar onOpenSettings={onOpenSettings} onOpenScreenShare={onOpenScreenShare} />
    </div>
  );
};
