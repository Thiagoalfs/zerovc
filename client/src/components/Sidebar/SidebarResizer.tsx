import React, { useCallback, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

export const SidebarResizer: React.FC = () => {
  const channelListWidth = useSettingsStore((s) => s.channelListWidth);
  const setChannelListWidth = useSettingsStore((s) => s.setChannelListWidth);
  const isDraggingRef = useRef(false);

  const startResize = useCallback(
    (clientX: number) => {
      isDraggingRef.current = true;
      const startX = clientX;
      const startWidth = channelListWidth;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handlePointerMove = (e: MouseEvent | TouchEvent) => {
        if (!isDraggingRef.current) return;
        const currentX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
        const deltaX = currentX - startX;
        setChannelListWidth(startWidth + deltaX);
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
    [channelListWidth, setChannelListWidth]
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
      onDoubleClick={() => setChannelListWidth(240)}
      className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-brand-500/20 active:bg-brand-500/30 transition-colors z-30 select-none group hidden md:flex items-center justify-center"
      title="Arraste para redimensionar a barra lateral (duplo clique para restaurar 240px)"
    >
      <div className="w-0.5 h-8 rounded-full bg-white/20 group-hover:bg-brand-400 group-hover:h-12 group-active:bg-brand-400 transition-all duration-150" />
    </div>
  );
};
