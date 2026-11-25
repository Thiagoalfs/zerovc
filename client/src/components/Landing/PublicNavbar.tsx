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
  const [isScrolled, setIsScrolled] = useState(false);

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

    const handleScroll = () => setIsScrolled(readScrollTop() > 12);
    handleScroll();

    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [transparentAtTop]);

  const showSurface = !transparentAtTop || isScrolled;

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-50 px-4 sm:px-6 py-3.5 transition-[background-color,border-color,backdrop-filter] duration-200 flex-shrink-0 ${
        showSurface
          ? 'bg-background-darkest/85 backdrop-blur-md border-b border-white/[0.06]'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="flex items-center gap-2.5 cursor-pointer group select-none text-left flex-shrink-0"
        >
          <ZeroVCLogo className="w-9 h-9 transition-transform duration-200 ease-out group-hover:scale-105" />
          <span className="text-[22px] font-extrabold tracking-[-0.03em] text-white">
            ZeroVC
          </span>
        </button>

        <nav className="flex items-center gap-4 sm:gap-7 text-sm font-medium text-gray-300">
          {activePage === 'landing' ? (
            <>
              <a
                href="#recursos"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('recursos')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="hidden sm:inline hover:text-white transition-colors duration-150"
              >
                Recursos
              </a>
              <button
                type="button"
                onClick={() => onNavigate('/download')}
                className="hover:text-white transition-colors duration-150 cursor-pointer"
              >
                Download
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="hover:text-white transition-colors duration-150 cursor-pointer"
            >
              Início
            </button>
          )}
        </nav>

        <div className="flex items-center gap-4 flex-shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => onNavigate('/@me')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition-colors duration-150 cursor-pointer"
            >
              <span>{activePage === 'landing' ? `Abrir chat (@${user.username})` : 'Abrir chat'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onNavigate('/signin')}
                className="hidden sm:inline text-sm font-medium text-gray-300 hover:text-white transition-colors duration-150 cursor-pointer"
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/signup')}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-colors duration-150 cursor-pointer"
              >
                Criar conta
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
