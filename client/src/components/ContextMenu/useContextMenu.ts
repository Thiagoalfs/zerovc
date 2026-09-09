import { useState, useCallback, useEffect } from 'react';

export interface ContextMenuItem {
  id?: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  tooltip?: string;
  separator?: boolean;
  onClick?: () => void;
  subItems?: ContextMenuItem[];
  customRender?: React.ReactNode;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  title?: string;
}

export type ContextMenuEvent =
  | React.MouseEvent
  | React.TouchEvent
  | MouseEvent
  | { clientX?: number; clientY?: number; x?: number; y?: number; preventDefault?: () => void; stopPropagation?: () => void };

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const openContextMenu = useCallback((e: ContextMenuEvent, items: ContextMenuItem[], title?: string) => {
    if (typeof e?.preventDefault === 'function') e.preventDefault();
    if (typeof e?.stopPropagation === 'function') e.stopPropagation();

    const x =
      'clientX' in e && typeof e.clientX === 'number'
        ? e.clientX
        : 'x' in e && typeof e.x === 'number'
        ? e.x
        : 0;
    const y =
      'clientY' in e && typeof e.clientY === 'number'
        ? e.clientY
        : 'y' in e && typeof e.y === 'number'
        ? e.y
        : 0;

    setMenu({
      x,
      y,
      items,
      title,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setMenu(null);
  }, []);

  // Close on Escape or window resize/scroll
  useEffect(() => {
    if (!menu) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    const handleScroll = () => {
      closeContextMenu();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [menu, closeContextMenu]);

  return {
    menu,
    openContextMenu,
    closeContextMenu,
  };
}
