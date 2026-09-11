import React, { useRef, useLayoutEffect, useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ContextMenuState } from './useContextMenu';
import { pushBackHandler } from '../../lib/mobileBackHandler';
import { hapticLight } from '../../lib/haptics';

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
}

const ContextMenuContent: React.FC<{ menu: ContextMenuState; onClose: () => void }> = ({ menu, onClose }) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const menuRef = useRef<HTMLDivElement>(null);

  // Hardware Back button support on mobile
  useEffect(() => {
    if (!isMobile) return;
    return pushBackHandler('context_menu_sheet', () => {
      onClose();
      return true;
    });
  }, [isMobile, onClose]);

  // 1. Calculate initial clamped position synchronously for desktop
  const initialPosition = useMemo(() => {
    if (isMobile) return { x: 0, y: 0 };
    const approxWidth = 220;
    const approxHeight = Math.min(350, menu.items.length * 36 + (menu.title ? 40 : 0));
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
  }, [menu.x, menu.y, menu.items.length, menu.title, isMobile]);

  const [position, setPosition] = useState<{ x: number; y: number }>(initialPosition);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    return menu.x + 220 + 200 > vw - 10 ? 'left' : 'right';
  });

  // 2. Exact bounding box adjustment on layout paint (Desktop only)
  useLayoutEffect(() => {
    if (isMobile || !menuRef.current) return;

    const menuEl = menuRef.current;
    const rect = menuEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = menu.x;
    let adjustedY = menu.y;

    if (adjustedX + rect.width > viewportWidth - 10) {
      adjustedX = Math.max(10, viewportWidth - rect.width - 10);
    }

    if (adjustedY + rect.height > viewportHeight - 10) {
      adjustedY = Math.max(10, viewportHeight - rect.height - 10);
    }

    if (adjustedX + rect.width + 200 > viewportWidth - 10) {
      setSubmenuSide('left');
    } else {
      setSubmenuSide('right');
    }

    setPosition({ x: adjustedX, y: adjustedY });
  }, [menu.x, menu.y, isMobile]);

  // ==================== MOBILE BOTTOM SHEET ====================
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[99999] pointer-events-auto flex flex-col justify-end">
        {/* Dark translucent backdrop */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
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

        {/* Bottom Sheet Modal */}
        <div
          ref={menuRef}
          style={{
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)',
          }}
          className="relative z-[100000] w-full max-h-[85vh] bg-[#111214] border-t border-white/10 rounded-t-3xl p-4 shadow-2xl overflow-y-auto no-scrollbar flex flex-col text-gray-200 select-none animate-in slide-in-from-bottom duration-200 font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top drag pill handle */}
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />

          {/* Title Header */}
          {menu.title && (
            <div className="px-3 py-2 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider bg-white/5 rounded-xl border border-white/5 truncate">
              {menu.title}
            </div>
          )}

          {/* Menu Items */}
          <div className="space-y-1">
            {menu.items.map((item, index) => {
              if (item.separator) {
                return (
                  <div
                    key={`sep-${index}`}
                    className="h-px bg-white/10 my-2 mx-1"
                  />
                );
              }

              if (item.customRender) {
                return (
                  <div key={item.id || index} className="relative py-1">
                    {item.customRender}
                  </div>
                );
              }

              const isDanger = item.variant === 'danger';
              const hasSubmenu = Boolean(item.subItems && item.subItems.length > 0);
              const isSubmenuOpen = activeSubmenuIndex === index;

              return (
                <div key={item.id || index} className="flex flex-col">
                  <button
                    type="button"
                    disabled={item.disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.disabled) return;
                      hapticLight();
                      if (hasSubmenu) {
                        setActiveSubmenuIndex(isSubmenuOpen ? null : index);
                        return;
                      }
                      item.onClick?.();
                      onClose();
                    }}
                    className={`w-full min-h-[46px] flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                      item.disabled
                        ? 'opacity-40 cursor-not-allowed text-gray-500'
                        : isDanger
                        ? 'text-red-400 hover:bg-red-500/15 active:bg-red-500/25'
                        : isSubmenuOpen
                        ? 'bg-white/10 text-white'
                        : 'text-gray-200 hover:bg-white/5 active:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      {item.icon && (
                        <span
                          className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${
                            isDanger ? 'text-red-400' : 'text-gray-400'
                          }`}
                        >
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>

                    {hasSubmenu && (
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
                          isSubmenuOpen ? 'rotate-180 text-white' : ''
                        }`}
                      />
                    )}
                  </button>

                  {/* Accordion Submenu on Mobile */}
                  {hasSubmenu && isSubmenuOpen && (
                    <div className="mt-1 ml-4 pl-3.5 border-l-2 border-brand-500/40 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150">
                      {item.subItems!.map((subItem, subIndex) => {
                        if (subItem.separator) {
                          return (
                            <div
                              key={`sub-sep-${subIndex}`}
                              className="h-px bg-white/10 my-1 mx-1"
                            />
                          );
                        }

                        const isSubDanger = subItem.variant === 'danger';

                        return (
                          <button
                            key={subItem.id || subIndex}
                            type="button"
                            disabled={subItem.disabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (subItem.disabled) return;
                              hapticLight();
                              subItem.onClick?.();
                              onClose();
                            }}
                            className={`w-full min-h-[42px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
                              subItem.disabled
                                ? 'opacity-40 cursor-not-allowed text-gray-500'
                                : isSubDanger
                                ? 'text-red-400 hover:bg-red-500/15 active:bg-red-500/25'
                                : 'text-gray-300 hover:bg-white/5 active:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              {subItem.icon && (
                                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-gray-400">
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
  }

  // ==================== DESKTOP CURSOR CONTEXT MENU ====================
  return (
    <div className="fixed inset-0 z-[99999] pointer-events-auto">
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
            const hasSubmenu = Boolean(item.subItems && item.subItems.length > 0);
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
                      ? 'text-red-500 hover:bg-red-500/15 hover:text-red-400 cursor-pointer font-medium'
                      : isSubmenuOpen
                      ? 'bg-brand-500/20 text-brand-300'
                      : 'text-gray-200 hover:bg-brand-500 hover:text-white cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {item.icon && (
                      <span
                        className={`w-4 h-4 flex items-center justify-center flex-shrink-0 ${
                          isDanger ? 'text-red-500 group-hover:text-red-400' : 'text-gray-400 group-hover:text-white'
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
