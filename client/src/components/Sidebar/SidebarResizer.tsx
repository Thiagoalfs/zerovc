import React, { useCallback, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

interface SidebarResizerProps {
  side?: 'left' | 'right';
  target?: 'channelList' | 'memberList';
}

export const SidebarResizer: React.FC<SidebarResizerProps> = ({
  side = 'right',
  target = 'channelList',
}) => {
  const channelListWidth = useSettingsStore((s) => s.channelListWidth);
  const setChannelListWidth = useSettingsStore((s) => s.setChannelListWidth);
  const memberListWidth = useSettingsStore((s) => s.memberListWidth);
  const setMemberListWidth = useSettingsStore((s) => s.setMemberListWidth);

  const currentWidth = target === 'memberList' ? memberListWidth : channelListWidth;
  const setWidth = target === 'memberList' ? setMemberListWidth : setChannelListWidth;

  const isDraggingRef = useRef(false);

  const startResize = useCallback(
    (clientX: number) => {
      isDraggingRef.current = true;
      const startX = clientX;
      const startWidth = currentWidth;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handlePointerMove = (e: MouseEvent | TouchEvent) => {
        if (!isDraggingRef.current) return;
        const currentX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
        const deltaX = currentX - startX;
        const newWidth = side === 'left' ? startWidth - deltaX : startWidth + deltaX;
        setWidth(newWidth);
      };

      const handlePointerUp = () => {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('mouseup', handlePointerUp);
        window.removeEventListener('touchmove', handlePointerMove);
        window.removeEventListener('touchend', handlePointerUp);
      };

      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove, { passive: true });
      window.addEventListener('touchend', handlePointerUp);
    },
    [currentWidth, setWidth, side]
  );

  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        startResize(e.clientX);
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          startResize(e.touches[0].clientX);
        }
      }}
      onDoubleClick={() => setWidth(240)}
      className={`absolute top-0 ${
        side === 'left' ? 'left-0 -ml-1.5' : 'right-0 -mr-1.5'
      } w-3 h-full cursor-col-resize z-30 select-none hidden md:block`}
      title="Arraste para redimensionar (duplo clique para restaurar 240px)"
    />
  );
};
