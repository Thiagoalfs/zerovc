import React from 'react';
import { Check } from 'lucide-react';
import { User } from '../../types';
import { UserAvatar } from '../Common/UserAvatar';
import {
  MODAL_DESCRIPTION_CLASS,
  MODAL_FIELD_LABEL_CLASS,
} from '../../constants/modalTypography';

export interface FriendMultiSelectProps {
  friends: User[];
  selectedIds: string[];
  onToggle: (friendId: string) => void;
  counterText: string;
  emptyMessage: string;
  label?: string;
}

export const FriendMultiSelect: React.FC<FriendMultiSelectProps> = ({
  friends,
  selectedIds,
  onToggle,
  counterText,
  emptyMessage,
  label = 'Selecione Amigos',
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={MODAL_FIELD_LABEL_CLASS}>{label}</label>
        <span className={MODAL_DESCRIPTION_CLASS}>{counterText}</span>
      </div>

      {friends.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-white/10 rounded-xl">
          <p className="text-xs text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1 pr-1 no-scrollbar">
          {friends.map((friendUser) => {
            const isSelected = selectedIds.includes(friendUser.id);
            return (
              <div
                key={friendUser.id}
                onClick={() => onToggle(friendUser.id)}
                className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-brand-500/20 text-white border border-brand-500/30'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <UserAvatar user={friendUser} size="sm" />
                  <div className="truncate">
                    <span className="font-semibold block truncate">
                      {friendUser.display_name || friendUser.username}
                    </span>
                    <span className="text-[10px] text-gray-400">@{friendUser.username}</span>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'border-white/20 bg-background-darkest'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
