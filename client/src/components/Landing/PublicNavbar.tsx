import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';

interface PublicNavbarProps {
  onNavigate: (path: string) => void;
  user?: any;
  activePage: 'landing' | 'download';
  transparentAtTop?: boolean;
}

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  onNavigate,
  user,
  activePage,
  transparentAtTop = false,
}) => {
  const headerRef = useRef<HTMLElement>(null);
  const [isScrolled, setIsScrolled] = useState(!transparentAtTop);

  useEffect(() => {
    if (!transparentAtTop) {
      setIsScrolled(true);
      return;
    }

    const findScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
      let current = node?.parentElement ?? null;
      while (current) {
        const { overflowY } = window.getComputedStyle(current);
        if (overflowY === 'auto' || overflowY === 'scroll') {
          return current;
        }
        current = current.parentElement;
      }
      return window;
    };

    const target = findScrollParent(headerRef.current);
    const readScrollTop = () =>
      target === window ? window.scrollY : (target as HTMLElement).scrollTop;

    const handleScroll = () => setIsScrolled(readScrollTop() > 14);
    handleScroll();

    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [transparentAtTop]);

  const showSurface = !transparentAtTop || isScrolled;
  const isLanding = activePage === 'landing';

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 px-5 sm:px-6 h-16 flex items-center flex-shrink-0"
    >
      {/* Compositor-only opacity surface layer (avoids animating backdrop-filter) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[#06080D]/82 backdrop-blur-md border-b border-white/[0.08] transition-opacity duration-200"
        style={{
          opacity: showSurface ? 1 : 0,
          transitionTimingFunction: 'var(--ease-out)',
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto w-full flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="flex items-center gap-2.5 cursor-pointer group select-none text-left flex-shrink-0 pub-press"
        >
          <span className="pub-hover-scale inline-flex">
            <ZeroVCLogo className="w-8 h-8 sm:w-9 sm:h-9" />
          </span>
          <span
            className={`text-[21px] font-extrabold tracking-[-0.03em] text-white ${
              isLanding ? 'font-display' : 'font-sans'
            }`}
          >
            ZeroVC
          </span>
        </button>

        <nav
          aria-label="Navegação principal"
          className="flex items-center gap-1 sm:gap-2 text-sm font-medium"
        >
          {isLanding ? (
            <>
              <a
                href="#arquitetura"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('arquitetura')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/[0.05] transition-colors duration-150 pub-press"
              >
                Arquitetura
              </a>
              <button
                type="button"
                onClick={() => onNavigate('/download')}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer pub-press"
              >
                Download
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onNavigate('/')}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer pub-press"
              >
                Início
              </button>
              <span
                aria-current="page"
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-white bg-white/[0.07] font-semibold select-none"
              >
                Download
              </span>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => onNavigate('/@me')}
              className="pub-press pub-hover-arrow flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#3B82F6] text-white font-semibold text-sm cursor-pointer shadow-[0_8px_24px_-8px_rgba(37,99,235,0.65)]"
            >
              <span>{isLanding ? `Abrir chat (@${user.username})` : 'Abrir chat'}</span>
              <ArrowRight className="w-4 h-4 pub-arrow" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onNavigate('/signin')}
                className="hidden sm:inline-flex items-center px-3.5 py-2 rounded-xl text-sm font-medium text-gray-300 hover:text-white hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer pub-press"
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/signup')}
                className="pub-press pub-hover-arrow inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563EB] hover:bg-[#3B82F6] text-white cursor-pointer shadow-[0_8px_24px_-8px_rgba(37,99,235,0.65)]"
              >
                <span>Criar conta</span>
                <ArrowRight className="w-3.5 h-3.5 pub-arrow hidden sm:inline" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
