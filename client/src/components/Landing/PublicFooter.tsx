import React from 'react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';

interface PublicFooterProps {
  onNavigate: (path: string) => void;
  activePage: 'landing' | 'download';
  useDisplayFont?: boolean;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({
  onNavigate,
  activePage,
  useDisplayFont = false,
}) => {
  return (
    <footer className="mt-auto border-t border-white/[0.08] bg-[#05070B] py-10 px-5 sm:px-6 text-sm text-gray-400">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2.5 cursor-pointer group select-none pub-press"
          >
            <ZeroVCLogo className="w-6 h-6 flex-shrink-0" />
            <span
              className={`font-bold text-white tracking-[-0.02em] ${
                useDisplayFont ? 'font-display text-base' : 'text-sm'
              }`}
            >
              ZeroVC
            </span>
          </button>
          <span aria-hidden="true" className="text-white/15">
            /
          </span>
          <span className="font-mono text-xs text-gray-500 tabular-nums">v1.1.6</span>
          <span aria-hidden="true" className="text-white/15 hidden sm:inline">
            ·
          </span>
          <span className="text-xs text-gray-500 hidden sm:inline">
            Windows, Linux, Android, iOS e Web
          </span>
        </div>

        <nav
          aria-label="Links do rodapé"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
        >
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className={`pub-press cursor-pointer transition-colors duration-150 ${
              activePage === 'landing' ? 'text-white font-medium' : 'text-gray-400 hover:text-white'
            }`}
          >
            Início
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/download')}
            className={`pub-press cursor-pointer transition-colors duration-150 ${
              activePage === 'download' ? 'text-white font-medium' : 'text-gray-400 hover:text-white'
            }`}
          >
            Download
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/signin')}
            className="pub-press cursor-pointer text-gray-400 hover:text-white transition-colors duration-150"
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/signup')}
            className="pub-press cursor-pointer text-gray-400 hover:text-white transition-colors duration-150"
          >
            Criar conta
          </button>
          <span className="text-xs text-gray-600 tabular-nums sm:ml-2">© 2026</span>
        </nav>
      </div>
    </footer>
  );
};
