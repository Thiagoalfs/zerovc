import React from 'react';
import { formatAssetUrl } from '../../lib/api';
import { User } from '../../types';
import { AvatarImage } from './AvatarImage';

export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

export interface UserAvatarProps {
  user?: Partial<User> | null;
  size?: UserAvatarSize;
  showStatus?: boolean;
  status?: 'online' | 'idle' | 'dnd' | 'offline';
  className?: string;
  statusBorderColor?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  title?: string;
}

const SIZE_CONFIGS: Record<
  UserAvatarSize,
  { container: string; text: string; badge: string; badgeBorder: string; badgeOffset: string; px: number }
> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]', badge: 'w-2 h-2', badgeBorder: 'border', badgeOffset: '-bottom-0.5 -right-0.5', px: 24 },
  sm: { container: 'w-7 h-7', text: 'text-xs', badge: 'w-2.5 h-2.5', badgeBorder: 'border-2', badgeOffset: '-bottom-0.5 -right-0.5', px: 28 },
  md: { container: 'w-8 h-8 md:w-9 md:h-9', text: 'text-xs md:text-sm', badge: 'w-3 h-3', badgeBorder: 'border-2', badgeOffset: '-bottom-0.5 -right-0.5', px: 36 },
  lg: { container: 'w-9 h-9 md:w-10 md:h-10', text: 'text-sm font-bold', badge: 'w-3 h-3', badgeBorder: 'border-2', badgeOffset: '-bottom-0.5 -right-0.5', px: 40 },
  xl: { container: 'w-12 h-12', text: 'text-base font-bold', badge: 'w-3.5 h-3.5', badgeBorder: 'border-2', badgeOffset: '-bottom-0.5 -right-0.5', px: 48 },
  '2xl': { container: 'w-16 h-16', text: 'text-xl font-bold', badge: 'w-4 h-4', badgeBorder: 'border-2', badgeOffset: 'bottom-0 right-0', px: 64 },
  '3xl': { container: 'w-20 h-20', text: 'text-2xl font-bold', badge: 'w-5 h-5', badgeBorder: 'border-2', badgeOffset: 'bottom-0 right-0', px: 80 },
};

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-online',
  idle: 'bg-idle',
  dnd: 'bg-dnd',
  offline: 'bg-offline',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  size = 'md',
  showStatus = false,
  status: propStatus,
  className = '',
  statusBorderColor = 'border-background-darker',
  onClick,
  onContextMenu,
  title,
}) => {
  const cfg = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  const initial = user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U';
  const effectiveStatus = propStatus || user?.status || 'offline';
  const statusColor = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.offline;

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`relative flex-shrink-0 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div
        className={`${cfg.container} rounded-full bg-brand-500 flex items-center justify-center font-bold text-white shadow-sm overflow-hidden`}
      >
        {user?.avatar_url ? (
          <AvatarImage
            src={formatAssetUrl(user.avatar_url)}
            displaySize={cfg.px}
            alt={user.username || 'Avatar'}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={cfg.text}>{initial}</span>
        )}
      </div>

      {showStatus && (
        <div
          className={`absolute ${cfg.badgeOffset} ${cfg.badge} rounded-full ${cfg.badgeBorder} ${statusBorderColor} ${statusColor}`}
        />
      )}
    </div>
  );
};
