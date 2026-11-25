import React, { useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ModalButton } from '@/components/ui/modal-button';
import { UnsavedChangesBar } from './UnsavedChangesBar';
import { ChatHeader } from '../Chat/ChatHeader';
import { MODAL_DIALOG_TITLE_CLASS } from '../../constants/modalTypography';

export interface SettingsModalTab {
  id: string;
  label: string;
  mobileTitle?: string;
  desktopTitle: string;
  desktopDescription?: string;
  badge?: React.ReactNode;
}

export interface SettingsModalLayoutProps {
  isOpen: boolean;
  titleId: string;
  reducedMotion?: boolean;
  mobileMenuTitle: string;
  closeAriaLabel: string;
  mobileView: 'menu' | 'content';
  onMobileViewChange: (view: 'menu' | 'content') => void;
  mobileMenuContent: React.ReactNode;
  sidebarHeader: React.ReactNode;
  tabs: SettingsModalTab[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  sidebarFooter?: React.ReactNode;
  desktopHeaderActions?: React.ReactNode;
  mobileBottomBar?: React.ReactNode;
  onAttemptClose: () => void;
  unsavedBar?: {
    show: boolean;
    isShaking: boolean;
    isSaving: boolean;
    error: string | null;
    onSave: () => void;
    onRevert: () => void;
  };
  children: React.ReactNode;
}

export const SettingsModalLayout: React.FC<SettingsModalLayoutProps> = ({
  isOpen,
  titleId,
  reducedMotion = false,
  mobileMenuTitle,
  closeAriaLabel,
  mobileView,
  onMobileViewChange,
  mobileMenuContent,
  sidebarHeader,
  tabs,
  activeTab,
  onSelectTab,
  sidebarFooter,
  desktopHeaderActions,
  mobileBottomBar,
  onAttemptClose,
  unsavedBar,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onAttemptClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onAttemptClose]);

  if (!isOpen) return null;

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={`fixed inset-0 z-50 flex flex-col md:flex-row w-screen h-screen md:pt-8 bg-background-dark overflow-hidden text-gray-200 select-none ${
        reducedMotion ? '' : 'animate-in fade-in duration-150'
      }`}
    >
      {/* MOBILE MENU VIEW */}
      {mobileView === 'menu' && (
        <div className="flex md:hidden flex-col w-full h-full bg-background-dark overflow-hidden">
          <div
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
            className="px-4 pb-3.5 border-b border-white/10 bg-background-darkest flex items-center justify-between flex-shrink-0"
          >
            <div className="flex items-center gap-3">
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                onClick={onAttemptClose}
                aria-label={closeAriaLabel}
                title="Fechar"
                className="-ml-1"
              >
                <X className="w-5 h-5" />
              </ModalButton>
              <h2 className={MODAL_DIALOG_TITLE_CLASS}>{mobileMenuTitle}</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 overscroll-contain touch-pan-y no-scrollbar">
            {mobileMenuContent}
          </div>
        </div>
      )}

      {/* DESKTOP LEFT SIDEBAR */}
      <div className="hidden md:flex flex-1 max-w-[280px] lg:max-w-[320px] xl:max-w-[360px] 2xl:max-w-[400px] min-w-[220px] justify-end bg-background-darkest border-r border-white/10 shrink-0 overflow-y-auto no-scrollbar">
        <div className="w-56 lg:w-60 flex flex-col p-4 py-6 xl:py-8 shrink-0">
          <div className="flex flex-col items-stretch flex-1 flex-shrink-0">
            {sidebarHeader}

            <nav className="flex flex-col items-stretch gap-0.5 flex-1 flex-shrink-0">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      isActive
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{tab.label}</span>
                    {tab.badge}
                  </button>
                );
              })}

              {sidebarFooter}
            </nav>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div
        className={`${
          mobileView === 'content' ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col overflow-hidden bg-background-dark relative min-w-0 min-h-0`}
      >
        {/* Mobile Drilldown Top Bar */}
        <div
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 2.75rem)' }}
          className="flex md:hidden items-center justify-between px-4 pb-3.5 border-b border-white/10 bg-background-darkest flex-shrink-0"
        >
          <div className="flex items-center gap-2">
            <ModalButton
              type="tertiary"
              size="small"
              onClick={() => onMobileViewChange('menu')}
              aria-label="Voltar ao menu"
              prefix={<ArrowLeft className="w-5 h-5" />}
              className="-ml-1"
            >
              Voltar
            </ModalButton>
          </div>
          <h2 className="text-sm font-bold text-white truncate max-w-[180px]">
            {currentTab?.mobileTitle || currentTab?.label}
          </h2>
          <ModalButton
            type="tertiary"
            shape="circle"
            size="small"
            svgOnly
            onClick={onAttemptClose}
            aria-label={closeAriaLabel}
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </ModalButton>
        </div>

        {/* Desktop Top Header */}
        <div className="hidden md:block shrink-0">
          <ChatHeader
            showSearch={false}
            title={
              <h1 id={titleId} className="font-bold text-gray-100 truncate text-base">
                {currentTab?.desktopTitle}
              </h1>
            }
            actions={
              <div className="flex items-center gap-3">
                {desktopHeaderActions}
                <ModalButton
                  type="tertiary"
                  shape="circle"
                  size="small"
                  svgOnly
                  onClick={onAttemptClose}
                  aria-label={closeAriaLabel}
                  title="Fechar Configurações (ESC)"
                >
                  <X className="w-5 h-5" />
                </ModalButton>
              </div>
            }
          />
        </div>

        {children}

        {mobileBottomBar}
      </div>

      {unsavedBar && (
        <UnsavedChangesBar
          show={unsavedBar.show}
          isShaking={unsavedBar.isShaking}
          isSaving={unsavedBar.isSaving}
          error={unsavedBar.error}
          onSave={unsavedBar.onSave}
          onRevert={unsavedBar.onRevert}
        />
      )}
    </div>
  );
};
