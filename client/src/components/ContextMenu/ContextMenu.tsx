import React, { useRef, useLayoutEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { ContextMenuState } from './useContextMenu';

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
}

const ContextMenuContent: React.FC<{ menu: ContextMenuState; onClose: () => void }> = ({ menu, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 1. Calculate initial clamped position synchronously so frame 0 renders directly at cursor
  const initialPosition = useMemo(() => {
    const approxWidth = 220;
    const approxHeight = Math.min(350, (menu.items.length * 36) + (menu.title ? 40 : 0));
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

    let x = menu.x;
    let y = menu.y;

    if (x + approxWidth > vw - 10) {
      x = Math.max(10, vw - approxWidth - 10);
    }
    if (y + approxHeight > vh - 10) {
      y = Math.max(10, vh - approxHeight - 10);
    }

    return { x, y };
  }, [menu.x, menu.y, menu.items.length, menu.title]);

  const [position, setPosition] = useState<{ x: number; y: number }>(initialPosition);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    return menu.x + 220 + 200 > vw - 10 ? 'left' : 'right';
  });

  // 2. Exact bounding box adjustment on layout paint
  useLayoutEffect(() => {
    if (!menuRef.current) return;

    const menuEl = menuRef.current;
    const rect = menuEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = menu.x;
    let adjustedY = menu.y;

    // Adjust horizontal position if overflowing right edge
    if (adjustedX + rect.width > viewportWidth - 10) {
      adjustedX = Math.max(10, viewportWidth - rect.width - 10);
    }

    // Adjust vertical position if overflowing bottom edge
    if (adjustedY + rect.height > viewportHeight - 10) {
      adjustedY = Math.max(10, viewportHeight - rect.height - 10);
    }

    // Determine if submenus have room to open on the right
    if (adjustedX + rect.width + 200 > viewportWidth - 10) {
      setSubmenuSide('left');
    } else {
      setSubmenuSide('right');
    }

    setPosition({ x: adjustedX, y: adjustedY });
  }, [menu.x, menu.y]);

  return (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
      {/* Invisible backdrop to dismiss on click outside */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Context Menu Container */}
      <div
        ref={menuRef}
        style={{
          top: `${position.y}px`,
          left: `${position.x}px`,
          transition: 'none',
        }}
        className="fixed z-[100000] min-w-[200px] max-w-[280px] bg-background-darkest rounded-xl p-1.5 shadow-2xl border border-white/10 text-gray-200 select-none animate-in fade-in zoom-in-95 duration-75 font-sans"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {menu.title && (
          <div className="px-2.5 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5 mb-1 truncate">
            {menu.title}
          </div>
        )}

        <div className="space-y-0.5">
          {menu.items.map((item, index) => {
            if (item.separator) {
              return (
                <div
                  key={`sep-${index}`}
                  className="h-px bg-white/10 my-1 mx-1.5"
                />
              );
            }

            if (item.customRender) {
              return (
                <div key={item.id || index} className="relative">
                  {item.customRender}
                </div>
              );
            }

            const isDanger = item.variant === 'danger';
            const hasSubmenu = item.subItems && item.subItems.length > 0;
            const isSubmenuOpen = activeSubmenuIndex === index;

            return (
              <div
                key={item.id || index}
                className="relative"
                onMouseEnter={() => {
                  if (hasSubmenu) {
                    setActiveSubmenuIndex(index);
                  } else {
                    setActiveSubmenuIndex(null);
                  }
                }}
              >
                <button
                  type="button"
                  disabled={item.disabled}
                  title={item.tooltip}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    if (hasSubmenu) {
                      setActiveSubmenuIndex(isSubmenuOpen ? null : index);
                      return;
                    }
                    item.onClick?.();
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left group ${
                    item.disabled
                      ? 'opacity-40 cursor-not-allowed text-gray-500'
                      : isDanger
                      ? 'text-dnd hover:bg-dnd/15 hover:text-red-400 cursor-pointer'
                      : isSubmenuOpen
                      ? 'bg-brand-500/20 text-brand-300'
                      : 'text-gray-200 hover:bg-brand-500 hover:text-white cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {item.icon && (
                      <span
                        className={`w-4 h-4 flex items-center justify-center flex-shrink-0 ${
                          isDanger ? 'text-dnd group-hover:text-red-400' : 'text-gray-400 group-hover:text-white'
                        }`}
                      >
                        {item.icon}
                      </span>
                    )}
                    <span className="truncate">{item.label}</span>
                  </div>

                  {hasSubmenu && (
                    <ChevronRight
                      className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${
                        submenuSide === 'left' ? 'rotate-180 text-gray-400 group-hover:text-white' : 'text-gray-400 group-hover:text-white'
                      }`}
                    />
                  )}
                </button>

                {/* Submenu with adaptive horizontal & vertical alignment */}
                {hasSubmenu && isSubmenuOpen && (
                  <div
                    className={`absolute top-0 min-w-[190px] max-w-[260px] max-h-[300px] overflow-y-auto no-scrollbar bg-background-darkest rounded-xl p-1.5 shadow-2xl border border-white/10 space-y-0.5 z-[100001] animate-in fade-in zoom-in-95 duration-100 ${
                      submenuSide === 'left'
                        ? 'right-full mr-1'
                        : 'left-full ml-1'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.subItems!.map((subItem, subIndex) => {
                      if (subItem.separator) {
                        return (
                          <div
                            key={`sub-sep-${subIndex}`}
                            className="h-px bg-white/10 my-1 mx-1.5"
                          />
                        );
                      }

                      const isSubDanger = subItem.variant === 'danger';

                      return (
                        <button
                          key={subItem.id || subIndex}
                          type="button"
                          disabled={subItem.disabled}
                          title={subItem.tooltip}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (subItem.disabled) return;
                            subItem.onClick?.();
                            onClose();
                          }}
                          className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left group ${
                            subItem.disabled
                              ? 'opacity-40 cursor-not-allowed text-gray-500'
                              : isSubDanger
                              ? 'text-dnd hover:bg-dnd/15 hover:text-red-400 cursor-pointer'
                              : 'text-gray-200 hover:bg-brand-500 hover:text-white cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {subItem.icon && (
                              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-gray-400 group-hover:text-white">
                                {subItem.icon}
                              </span>
                            )}
                            <span className="truncate">{subItem.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const ContextMenu: React.FC<ContextMenuProps> = ({ menu, onClose }) => {
  if (!menu) return null;

  return createPortal(
    <ContextMenuContent
      key={`${menu.x}-${menu.y}-${menu.title || ''}-${menu.items.length}`}
      menu={menu}
      onClose={onClose}
    />,
    document.body
  );
};
