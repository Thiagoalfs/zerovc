import React, { useState, useEffect } from 'react';
import {
  Download,
  Check,
  Copy,
  Laptop,
  Smartphone,
  Apple,
  Globe,
  Share2,
  Terminal,
} from 'lucide-react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';
import { PublicNavbar } from './PublicNavbar';

interface DownloadPageProps {
  onNavigate: (path: string) => void;
  user?: any;
}

type PlatformType = 'android' | 'windows' | 'linux' | 'ios';
type LinuxFormat = 'deb' | 'rpm' | 'pacman' | 'appimage';

const LINUX_FORMATS: Record<
  LinuxFormat,
  { label: string; distro: string; fileName: string; buttonLabel: string; cmd: string }
> = {
  deb: {
    label: '.deb',
    distro: 'Debian / Ubuntu',
    fileName: 'ZeroVC.deb',
    buttonLabel: 'Baixar ZeroVC (.deb)',
    cmd: 'sudo apt install ./ZeroVC.deb',
  },
  rpm: {
    label: '.rpm',
    distro: 'Fedora / openSUSE',
    fileName: 'ZeroVC.rpm',
    buttonLabel: 'Baixar ZeroVC (.rpm)',
    cmd: 'sudo dnf install ./ZeroVC.rpm',
  },
  pacman: {
    label: 'Arch',
    distro: 'Arch / Manjaro',
    fileName: 'ZeroVC.pacman',
    buttonLabel: 'Baixar ZeroVC (.pacman)',
    cmd: 'sudo pacman -U ZeroVC.pacman',
  },
  appimage: {
    label: 'AppImage',
    distro: 'Universal',
    fileName: 'ZeroVC.AppImage',
    buttonLabel: 'Baixar ZeroVC AppImage',
    cmd: 'chmod +x ZeroVC.AppImage && ./ZeroVC.AppImage',
  },
};

const PLATFORM_TABS: { id: PlatformType; label: string; icon: React.ReactNode }[] = [
  { id: 'windows', label: 'Windows', icon: <Laptop className="w-4 h-4 flex-shrink-0" /> },
  { id: 'linux', label: 'Linux', icon: <Terminal className="w-4 h-4 flex-shrink-0" /> },
  { id: 'android', label: 'Android', icon: <Smartphone className="w-4 h-4 flex-shrink-0" /> },
  { id: 'ios', label: 'iOS', icon: <Apple className="w-4 h-4 flex-shrink-0" /> },
];

export const DownloadPage: React.FC<DownloadPageProps> = ({ onNavigate, user }) => {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('windows');
  const [linuxFormat, setLinuxFormat] = useState<LinuxFormat>('deb');
  const [copiedCmd, setCopiedCmd] = useState(false);

  const handleCopyLinuxCmd = () => {
    navigator.clipboard?.writeText(LINUX_FORMATS[linuxFormat].cmd).catch(() => {});
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  useEffect(() => {
    const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
    if (/android/i.test(ua)) setSelectedPlatform('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setSelectedPlatform('ios');
    else if (/linux/i.test(ua)) setSelectedPlatform('linux');
    else setSelectedPlatform('windows');
  }, []);

  const handleDownload = (platform: PlatformType) => {
    setDownloadStarted(true);

    let fileUrl = '/downloads/ZeroVC-Setup.exe';
    let fileName = 'ZeroVC-Setup.exe';

    if (platform === 'android') {
      fileUrl = '/downloads/ZeroVC.apk';
      fileName = 'ZeroVC.apk';
    } else if (platform === 'linux') {
      fileName = LINUX_FORMATS[linuxFormat].fileName;
      fileUrl = `/downloads/${fileName}`;
    }

    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadStarted(false);
    }, 6000);
  };

  const activeFileName =
    selectedPlatform === 'android'
      ? 'ZeroVC.apk'
      : selectedPlatform === 'windows'
      ? 'ZeroVC-Setup.exe'
      : LINUX_FORMATS[linuxFormat].fileName;

  return (
    <div className="min-h-full w-full bg-background-darkest text-gray-100 flex flex-col font-sans selection:bg-brand-500/30 selection:text-white overflow-x-hidden">
      {/* Compact Header */}
      <PublicNavbar
        onNavigate={onNavigate}
        user={user}
        activePage="download"
      />

      {/* Direct Download Workspace */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16 flex flex-col">
        <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold tracking-[-0.035em] text-white leading-[1.05]">
          Baixe o ZeroVC
        </h1>
        <p className="mt-3 text-base text-gray-300 max-w-[56ch] leading-relaxed">
          Escolha sua plataforma para instalar o aplicativo nativo ou entre direto pelo navegador.
        </p>

        {/* Connected Segmented Platform Switcher */}
        <div
          role="tablist"
          aria-label="Selecionar plataforma"
          className="mt-8 inline-grid grid-cols-2 sm:grid-cols-4 p-1 rounded-2xl bg-white/[0.04] border border-white/10 w-full"
        >
          {PLATFORM_TABS.map((tab) => {
            const active = selectedPlatform === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSelectedPlatform(tab.id);
                  setDownloadStarted(false);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Platform Panel */}
        <section className="mt-6 rounded-2xl bg-[#161920] border border-white/10 p-6 sm:p-10">
          {selectedPlatform === 'windows' && (
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">
                ZeroVC para Windows
              </h2>
              <p className="mt-1.5 text-sm text-gray-400">
                Windows 10 e 11 (64-bit), instalador executável (.exe)
              </p>

              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => handleDownload('windows')}
                  className="w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-base transition-colors duration-150 cursor-pointer"
                >
                  {downloadStarted ? <Check className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                  <span>{downloadStarted ? 'Download iniciado' : 'Baixar ZeroVC Setup (.exe)'}</span>
                </button>
              </div>
            </div>
          )}

          {selectedPlatform === 'android' && (
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">
                ZeroVC para Android
              </h2>
              <p className="mt-1.5 text-sm text-gray-400">
                Android 8.0 ou superior (ARM64 / Universal), pacote APK direto
              </p>

              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => handleDownload('android')}
                  className="w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-base transition-colors duration-150 cursor-pointer"
                >
                  {downloadStarted ? <Check className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                  <span>{downloadStarted ? 'Download iniciado' : 'Baixar ZeroVC APK (.apk)'}</span>
                </button>
              </div>
            </div>
          )}

          {selectedPlatform === 'linux' && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">
                    ZeroVC para Linux
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-400">
                    Linux x64 ({LINUX_FORMATS[linuxFormat].distro})
                  </p>
                </div>

                {/* Connected Format Selector */}
                <div
                  role="radiogroup"
                  aria-label="Formato de pacote Linux"
                  className="inline-flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10 self-start"
                >
                  {(Object.keys(LINUX_FORMATS) as LinuxFormat[]).map((fmt) => {
                    const active = linuxFormat === fmt;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setLinuxFormat(fmt);
                          setDownloadStarted(false);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors duration-150 cursor-pointer ${
                          active
                            ? 'bg-brand-600 text-white'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {LINUX_FORMATS[fmt].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => handleDownload('linux')}
                  className="w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-base transition-colors duration-150 cursor-pointer"
                >
                  {downloadStarted ? <Check className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                  <span>{downloadStarted ? 'Download iniciado' : LINUX_FORMATS[linuxFormat].buttonLabel}</span>
                </button>
              </div>

              <div className="mt-7 pt-6 border-t border-white/[0.08]">
                <p className="text-sm font-semibold text-gray-200 mb-2.5">
                  {linuxFormat === 'appimage' ? 'Como executar pelo terminal:' : 'Como instalar pelo terminal:'}
                </p>
                <div className="flex items-center justify-between gap-3 bg-[#0f1218] px-3.5 py-2.5 rounded-xl border border-white/[0.08]">
                  <code className="font-mono text-sm text-gray-200 truncate">
                    {LINUX_FORMATS[linuxFormat].cmd}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyLinuxCmd}
                    aria-label="Copiar comando de instalação"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-gray-100 text-sm font-semibold transition-colors duration-150 cursor-pointer flex-shrink-0"
                  >
                    {copiedCmd ? <Check className="w-4 h-4 text-online" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCmd ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedPlatform === 'ios' && (
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">
                ZeroVC no iOS
              </h2>
              <p className="mt-1.5 text-sm text-gray-400">
                iPhone e iPad (iOS 16 ou superior) via Safari
              </p>

              <div className="mt-7">
                <button
                  type="button"
                  onClick={() => onNavigate('/@me')}
                  className="w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-base transition-colors duration-150 cursor-pointer"
                >
                  <Globe className="w-5 h-5" />
                  <span>Abrir aplicativo no Safari</span>
                </button>
              </div>

              <div className="mt-7 pt-6 border-t border-white/[0.08]">
                <p className="text-sm font-semibold text-gray-200 mb-3">
                  Para instalar na Tela de Início:
                </p>
                <ol className="list-decimal list-inside space-y-2.5 text-sm text-gray-300 leading-relaxed">
                  <li>
                    Acesse <span className="text-white font-semibold">zerovc.safiroko.xyz</span> no Safari do iPhone ou iPad.
                  </li>
                  <li>
                    Toque no botão de compartilhar (<Share2 className="inline w-4 h-4 text-brand-400 mx-0.5 align-text-bottom" />) na barra inferior.
                  </li>
                  <li>
                    Role a lista e escolha <span className="text-white font-semibold">Adicionar à Tela de Início</span>.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {selectedPlatform !== 'ios' && (
            <p
              aria-live="polite"
              className={`mt-4 text-sm text-brand-300 transition-opacity duration-200 ${
                downloadStarted ? 'opacity-100' : 'opacity-0 pointer-events-none select-none'
              }`}
            >
              Iniciando o download de <span className="font-semibold text-white">{activeFileName}</span>. Se não começar,{' '}
              <a href={`/downloads/${activeFileName}`} className="underline font-semibold hover:text-white">
                baixar manualmente
              </a>
              .
            </p>
          )}
        </section>

        {/* Browser Fallback */}
        <div className="mt-8 pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-white">Prefere não instalar agora?</p>
            <p className="text-sm text-gray-400 mt-0.5">
              Todas as funções principais de voz, tela e chat funcionam direto no navegador.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/@me')}
            className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold text-sm whitespace-nowrap transition-colors duration-150 cursor-pointer"
          >
            Acessar pela web
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.06] py-8 px-6 text-sm text-gray-400">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ZeroVCLogo className="w-6 h-6 flex-shrink-0" />
            <span className="font-semibold text-white">ZeroVC</span>
            <span className="text-gray-500">Windows, Linux, Android, iOS e Web</span>
          </div>

          <div className="flex items-center gap-6">
            <button type="button" onClick={() => onNavigate('/')} className="hover:text-white transition-colors duration-150 cursor-pointer">
              Início
            </button>
            <button type="button" onClick={() => onNavigate('/signin')} className="hover:text-white transition-colors duration-150 cursor-pointer">
              Entrar
            </button>
            <button type="button" onClick={() => onNavigate('/signup')} className="hover:text-white transition-colors duration-150 cursor-pointer">
              Criar conta
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
