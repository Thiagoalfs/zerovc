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
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  title?: string;
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const openContextMenu = useCallback((e: React.MouseEvent, items: ContextMenuItem[], title?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
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
