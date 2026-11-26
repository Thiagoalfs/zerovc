import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import {
  Apple,
  ArrowRight,
  Check,
  Copy,
  Download,
  Globe,
  Laptop,
  Share2,
  Smartphone,
  Terminal,
} from 'lucide-react';
import { PublicNavbar } from './PublicNavbar';
import { PublicFooter } from './PublicFooter';
import { ClipTabs } from './ClipTabs';

interface DownloadPageProps {
  onNavigate: (path: string) => void;
  user?: any;
}

type PlatformType = 'windows' | 'linux' | 'android' | 'ios';
type LinuxFormat = 'deb' | 'rpm' | 'pacman' | 'appimage';

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const APP_VERSION = 'v1.1.6';

const PLATFORM_ORDER: PlatformType[] = ['windows', 'linux', 'android', 'ios'];

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

const PLATFORM_SPECS: Record<
  PlatformType,
  {
    name: string;
    arch: string;
    highlights: string[];
  }
> = {
  windows: {
    name: 'Windows',
    arch: 'x64 · Instalador .exe',
    highlights: [
      'Áudio 48 kHz com supressão neural RNNoise local',
      'Captura de tela a 60 FPS com isolamento WASAPI sem eco',
      'Push-to-talk global em jogos em tela cheia',
      'Inicialização rápida e atualização automática',
    ],
  },
  linux: {
    name: 'Linux',
    arch: 'x64 · .deb, .rpm, Arch e AppImage',
    highlights: [
      'Áudio nativo 48 kHz + RNNoise rodando no dispositivo',
      'Captura de áudio do sistema via PipeWire sem alterar o sink padrão',
      'Auto-exclusão da própria saída para evitar eco na sala',
      'Pacotes nativos para Debian, Fedora, Arch e AppImage universal',
    ],
  },
  android: {
    name: 'Android',
    arch: 'ARM64 / Universal · .apk',
    highlights: [
      'Aplicativo nativo leve construído para uso diário no celular',
      'Chamadas de voz estáveis em segundo plano',
      'Interface mobile-first com gestos e gavetas retráteis',
      'Chat criptografado ponta a ponta sincronizado com o desktop',
    ],
  },
  ios: {
    name: 'iOS',
    arch: 'Safari · Web App instalável',
    highlights: [
      'Experiência em tela cheia adicionando à Tela de Início',
      'Sem necessidade de conta de desenvolvedor ou loja externa',
      'Voz em tempo real, visualização de transmissões e chat E2EE',
      'Sempre na versão mais recente ao abrir pelo ícone',
    ],
  },
};

const LINUX_DISTRO_MATCHERS: {
  pattern: RegExp;
  format: LinuxFormat;
  name: string;
}[] = [
  { pattern: /\bubuntu\b/i, format: 'deb', name: 'Ubuntu' },
  { pattern: /\blinux\s*mint\b|\bmint\b/i, format: 'deb', name: 'Linux Mint' },
  { pattern: /\bpop!?_?os\b/i, format: 'deb', name: 'Pop!_OS' },
  { pattern: /\belementary\b/i, format: 'deb', name: 'elementary OS' },
  { pattern: /\bzorin\b/i, format: 'deb', name: 'Zorin OS' },
  { pattern: /\bkali\b/i, format: 'deb', name: 'Kali Linux' },
  { pattern: /\bdebian\b/i, format: 'deb', name: 'Debian' },
  { pattern: /\bfedora\b/i, format: 'rpm', name: 'Fedora' },
  { pattern: /\bopensuse\b|\bsuse\b/i, format: 'rpm', name: 'openSUSE' },
  { pattern: /\bcentos\b/i, format: 'rpm', name: 'CentOS' },
  { pattern: /\brockylinux\b|\brocky\b/i, format: 'rpm', name: 'Rocky Linux' },
  { pattern: /\balmalinux\b/i, format: 'rpm', name: 'AlmaLinux' },
  { pattern: /\brhel\b|\bred\s*hat\b/i, format: 'rpm', name: 'Red Hat' },
  { pattern: /\bmanjaro\b/i, format: 'pacman', name: 'Manjaro' },
  { pattern: /\bendeavouros\b/i, format: 'pacman', name: 'EndeavourOS' },
  { pattern: /\bgaruda\b/i, format: 'pacman', name: 'Garuda' },
  { pattern: /\bcachyos\b/i, format: 'pacman', name: 'CachyOS' },
  { pattern: /\barch\s*linux\b|\barchlinux\b|\barch\b/i, format: 'pacman', name: 'Arch Linux' },
];

function detectLinuxDistro(ua: string): { format: LinuxFormat; distroName: string | null } {
  for (const matcher of LINUX_DISTRO_MATCHERS) {
    if (matcher.pattern.test(ua)) {
      return { format: matcher.format, distroName: matcher.name };
    }
  }
  return { format: 'appimage', distroName: null };
}

export const DownloadPage: React.FC<DownloadPageProps> = ({ onNavigate, user }) => {
  const prefersReducedMotion = useReducedMotion();
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('windows');
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformType | null>(null);
  const [detectedDistro, setDetectedDistro] = useState<string | null>(null);
  const [direction, setDirection] = useState<number>(1);
  const [linuxFormat, setLinuxFormat] = useState<LinuxFormat>('appimage');
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Measure inner panel height for smooth resizing container (Emil Kowalski pattern)
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number>(0);
  const [panelHeight, setPanelHeight] = useState<number | 'auto'>('auto');
  const [fadeDuration, setFadeDuration] = useState<number>(0.18);

  useEffect(() => {
    const rawUa = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    const ua = rawUa.toLowerCase();
    let detected: PlatformType = 'windows';
    if (/android/i.test(ua)) detected = 'android';
    else if (/iphone|ipad|ipod/i.test(ua)) detected = 'ios';
    else if (/linux/i.test(ua)) {
      detected = 'linux';
      const { format, distroName } = detectLinuxDistro(rawUa);
      setLinuxFormat(format);
      setDetectedDistro(distroName);
    } else {
      detected = 'windows';
    }

    setSelectedPlatform(detected);
    setDetectedPlatform(detected);
  }, []);

  useLayoutEffect(() => {
    const node = contentMeasureRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const updateHeight = () => {
      const nextHeight = node.getBoundingClientRect().height;
      if (nextHeight <= 0) return;

      if (prevHeightRef.current > 0) {
        const delta = Math.abs(nextHeight - prevHeightRef.current);
        const computed = Math.min(Math.max(delta / 500, 0.15), 0.27);
        setFadeDuration(computed);
      }
      prevHeightRef.current = nextHeight;
      setPanelHeight(nextHeight);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [selectedPlatform, linuxFormat, downloadStarted]);

  const handleSelectPlatform = (next: PlatformType) => {
    if (next === selectedPlatform) return;
    const prevIdx = PLATFORM_ORDER.indexOf(selectedPlatform);
    const nextIdx = PLATFORM_ORDER.indexOf(next);
    setDirection(nextIdx >= prevIdx ? 1 : -1);
    setSelectedPlatform(next);
    setDownloadStarted(false);
  };

  const handleCopyLinuxCmd = () => {
    navigator.clipboard?.writeText(LINUX_FORMATS[linuxFormat].cmd).catch(() => {});
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

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

  const platformTabs = useMemo(
    () => [
      { id: 'windows' as const, label: 'Windows', icon: <Laptop className="w-4 h-4 flex-shrink-0" /> },
      { id: 'linux' as const, label: 'Linux', icon: <Terminal className="w-4 h-4 flex-shrink-0" /> },
      { id: 'android' as const, label: 'Android', icon: <Smartphone className="w-4 h-4 flex-shrink-0" /> },
      { id: 'ios' as const, label: 'iOS', icon: <Apple className="w-4 h-4 flex-shrink-0" /> },
    ],
    []
  );

  const linuxFormatTabs = useMemo(
    () =>
      (Object.keys(LINUX_FORMATS) as LinuxFormat[]).map((fmt) => ({
        id: fmt,
        label: LINUX_FORMATS[fmt].label,
      })),
    []
  );

  const activeSpec = PLATFORM_SPECS[selectedPlatform];
  const isDetectedActive = detectedPlatform === selectedPlatform;

  const iconSwap = prefersReducedMotion
    ? { duration: 0.12 }
    : { duration: 0.16, ease: EASE_OUT };

  return (
    <MotionConfig reducedMotion="user">
      <div className="public-surface relative min-h-screen w-full flex flex-col font-sans overflow-x-hidden">
        {/* Cohesive subtle obsidian + cobalt atmosphere matching LandingPage */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[440px] overflow-hidden"
        >
          <div className="absolute -top-36 right-[-8%] w-[580px] h-[380px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.24)_0%,transparent_72%)]" />
        </div>

        {/* Header */}
        <PublicNavbar onNavigate={onNavigate} user={user} activePage="download" />

        {/* Main Download Workspace */}
        <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-5 sm:px-6 py-10 sm:py-16 flex flex-col">
          {/* Page Header — Plus Jakarta Sans (display font reserved for LandingPage) */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/[0.08]">
            <div>
              <h1 className="text-[clamp(2rem,4.5vw,3.35rem)] font-extrabold tracking-[-0.035em] text-white leading-[1.03] text-balance">
                Baixe o ZeroVC
              </h1>
              <p className="mt-3 text-base text-gray-300 max-w-[54ch] leading-relaxed">
                Escolha sua plataforma para instalar o cliente nativo ou entre direto pelo navegador sem instalar nada.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-gray-400 tabular-nums">
              <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-gray-200">
                {APP_VERSION}
              </span>
              {detectedPlatform && (
                <span className="inline-flex items-center gap-1.5 text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                  <span>
                    Detectado: {PLATFORM_SPECS[detectedPlatform].name}
                    {detectedPlatform === 'linux' && detectedDistro ? ` (${detectedDistro})` : ''}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Connected Segmented Platform Switcher (clip-path seamless inversion) */}
          <div className="mt-8">
            <ClipTabs
              items={platformTabs}
              value={selectedPlatform}
              onChange={handleSelectPlatform}
              ariaLabel="Selecionar plataforma"
              className="grid grid-cols-2 sm:grid-cols-4 p-1 rounded-2xl bg-[#0C1018] border border-white/[0.09] w-full"
              buttonClassName="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold"
              radiusPx={12}
            />
          </div>

          {/* 2-Column Workspace: Resizing Action Panel + Native Capabilities */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Platform Action Panel */}
            <section className="lg:col-span-7 rounded-2xl bg-[#0C1018] border border-white/[0.1] pub-specular overflow-hidden">
              <motion.div
                animate={
                  panelHeight === 'auto' || prefersReducedMotion
                    ? undefined
                    : { height: panelHeight }
                }
                transition={{ duration: 0.26, ease: EASE_OUT }}
                style={{ overflow: 'hidden' }}
              >
                <div ref={contentMeasureRef} className="p-6 sm:p-8">
                  <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                    <motion.div
                      key={selectedPlatform}
                      custom={direction}
                      variants={{
                        enter: (dir: number) =>
                          prefersReducedMotion
                            ? { opacity: 0 }
                            : { opacity: 0, x: dir * 14, filter: 'blur(2px)' },
                        center: { opacity: 1, x: 0, filter: 'blur(0px)' },
                        exit: (dir: number) =>
                          prefersReducedMotion
                            ? { opacity: 0 }
                            : { opacity: 0, x: dir * -14, filter: 'blur(2px)' },
                      }}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{
                        duration: prefersReducedMotion ? 0.14 : fadeDuration,
                        ease: EASE_OUT,
                      }}
                    >
                      {selectedPlatform === 'windows' && (
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-2xl font-bold tracking-[-0.025em] text-white">
                              ZeroVC para Windows
                            </h2>
                            {isDetectedActive && (
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/25">
                                Recomendado para este PC
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm text-gray-400">
                            Windows 10 e 11 (64-bit) · Instalador executável{' '}
                            <span className="font-mono text-gray-300">.exe</span>
                          </p>

                          <div className="mt-7">
                            <button
                              type="button"
                              onClick={() => handleDownload('windows')}
                              className="pub-press w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#2563EB] hover:bg-[#3B82F6] text-white font-semibold text-base cursor-pointer shadow-[0_14px_32px_-10px_rgba(37,99,235,0.7)]"
                            >
                              <AnimatePresence mode="wait" initial={false}>
                                {downloadStarted ? (
                                  <motion.span
                                    key="check"
                                    initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    transition={iconSwap}
                                    className="inline-flex"
                                  >
                                    <Check className="w-5 h-5" />
                                  </motion.span>
                                ) : (
                                  <motion.span
                                    key="dl"
                                    initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    transition={iconSwap}
                                    className="inline-flex"
                                  >
                                    <Download className="w-5 h-5" />
                                  </motion.span>
                                )}
                              </AnimatePresence>
                              <span>
                                {downloadStarted ? 'Download iniciado' : 'Baixar ZeroVC Setup (.exe)'}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedPlatform === 'android' && (
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-2xl font-bold tracking-[-0.025em] text-white">
                              ZeroVC para Android
                            </h2>
                            {isDetectedActive && (
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/25">
                                Recomendado para este aparelho
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm text-gray-400">
                            Android 8.0 ou superior (ARM64 / Universal) · Pacote{' '}
                            <span className="font-mono text-gray-300">.apk</span> direto
                          </p>

                          <div className="mt-7">
                            <button
                              type="button"
                              onClick={() => handleDownload('android')}
                              className="pub-press w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#2563EB] hover:bg-[#3B82F6] text-white font-semibold text-base cursor-pointer shadow-[0_14px_32px_-10px_rgba(37,99,235,0.7)]"
                            >
                              <AnimatePresence mode="wait" initial={false}>
                                {downloadStarted ? (
                                  <motion.span
                                    key="check"
                                    initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    transition={iconSwap}
                                    className="inline-flex"
                                  >
                                    <Check className="w-5 h-5" />
                                  </motion.span>
                                ) : (
                                  <motion.span
                                    key="dl"
                                    initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    transition={iconSwap}
                                    className="inline-flex"
                                  >
                                    <Download className="w-5 h-5" />
                                  </motion.span>
                                )}
                              </AnimatePresence>
                              <span>
                                {downloadStarted ? 'Download iniciado' : 'Baixar ZeroVC APK (.apk)'}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedPlatform === 'linux' && (
                        <div>
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2.5">
                                <h2 className="text-2xl font-bold tracking-[-0.025em] text-white">
                                  ZeroVC para Linux
                                </h2>
                                {isDetectedActive && (
                                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/25">
                                    {detectedDistro ? `Seu sistema (${detectedDistro})` : 'Seu sistema'}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1.5 text-sm text-gray-400">
                                Linux x64 · {LINUX_FORMATS[linuxFormat].distro}
                              </p>
                            </div>

                            {/* Linux Format Switcher with clip-path */}
                            <ClipTabs
                              items={linuxFormatTabs}
                              value={linuxFormat}
                              onChange={(fmt) => {
                                setLinuxFormat(fmt);
                                setDownloadStarted(false);
                              }}
                              ariaLabel="Formato de pacote Linux"
                              role="radiogroup"
                              className="inline-flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/[0.09] self-start"
                              buttonClassName="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap"
                              radiusPx={8}
                            />
                          </div>

                          <div className="mt-7">
                            <button
                              type="button"
                              onClick={() => handleDownload('linux')}
                              className="pub-press w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#2563EB] hover:bg-[#3B82F6] text-white font-semibold text-base cursor-pointer shadow-[0_14px_32px_-10px_rgba(37,99,235,0.7)]"
                            >
                              <AnimatePresence mode="wait" initial={false}>
                                {downloadStarted ? (
                                  <motion.span
                                    key="check"
                                    initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    transition={iconSwap}
                                    className="inline-flex"
                                  >
                                    <Check className="w-5 h-5" />
                                  </motion.span>
                                ) : (
                                  <motion.span
                                    key="dl"
                                    initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                    transition={iconSwap}
                                    className="inline-flex"
                                  >
                                    <Download className="w-5 h-5" />
                                  </motion.span>
                                )}
                              </AnimatePresence>
                              <span>
                                {downloadStarted
                                  ? 'Download iniciado'
                                  : LINUX_FORMATS[linuxFormat].buttonLabel}
                              </span>
                            </button>
                          </div>

                          <div className="mt-7 pt-6 border-t border-white/[0.08]">
                            <p className="text-sm font-semibold text-gray-200 mb-2.5">
                              {linuxFormat === 'appimage'
                                ? 'Como executar pelo terminal:'
                                : 'Como instalar pelo terminal:'}
                            </p>
                            <div className="flex items-center justify-between gap-3 bg-[#07090F] px-3.5 py-2.5 rounded-xl border border-white/[0.08]">
                              <code className="font-mono text-xs sm:text-sm text-gray-200 truncate">
                                {LINUX_FORMATS[linuxFormat].cmd}
                              </code>
                              <button
                                type="button"
                                onClick={handleCopyLinuxCmd}
                                aria-label="Copiar comando de instalação"
                                className="pub-press flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-gray-100 text-xs sm:text-sm font-semibold cursor-pointer flex-shrink-0"
                              >
                                <AnimatePresence mode="wait" initial={false}>
                                  {copiedCmd ? (
                                    <motion.span
                                      key="copied"
                                      initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                      exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                      transition={iconSwap}
                                      className="inline-flex items-center gap-1.5 text-[#4ADE80]"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Copiado</span>
                                    </motion.span>
                                  ) : (
                                    <motion.span
                                      key="copy"
                                      initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                      exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                                      transition={iconSwap}
                                      className="inline-flex items-center gap-1.5"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copiar</span>
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedPlatform === 'ios' && (
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-2xl font-bold tracking-[-0.025em] text-white">
                              ZeroVC no iOS
                            </h2>
                            {isDetectedActive && (
                              <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#22C55E]/15 text-[#4ADE80] border border-[#22C55E]/25">
                                Recomendado para este aparelho
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm text-gray-400">
                            iPhone e iPad (iOS 16 ou superior) via Safari
                          </p>

                          <div className="mt-7">
                            <button
                              type="button"
                              onClick={() => onNavigate('/@me')}
                              className="pub-press w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#2563EB] hover:bg-[#3B82F6] text-white font-semibold text-base cursor-pointer shadow-[0_14px_32px_-10px_rgba(37,99,235,0.7)]"
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
                                Acesse{' '}
                                <span className="font-mono text-white font-semibold">
                                  zerovc.safiroko.xyz
                                </span>{' '}
                                no Safari do iPhone ou iPad.
                              </li>
                              <li>
                                Toque no botão de compartilhar (
                                <Share2 className="inline w-4 h-4 text-[#60A5FA] mx-0.5 align-text-bottom" />
                                ) na barra inferior.
                              </li>
                              <li>
                                Role a lista e escolha{' '}
                                <span className="text-white font-semibold">
                                  Adicionar à Tela de Início
                                </span>
                                .
                              </li>
                            </ol>
                          </div>
                        </div>
                      )}

                      {/* Conditional download confirmation — occupies zero height when idle */}
                      <AnimatePresence initial={false}>
                        {selectedPlatform !== 'ios' && downloadStarted && (
                          <motion.div
                            key="dl-notice"
                            initial={
                              prefersReducedMotion
                                ? { opacity: 0 }
                                : { opacity: 0, height: 0 }
                            }
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={
                              prefersReducedMotion
                                ? { opacity: 0 }
                                : { opacity: 0, height: 0 }
                            }
                            transition={{ duration: 0.2, ease: EASE_OUT }}
                            style={{ overflow: 'hidden' }}
                          >
                            <p
                              aria-live="polite"
                              className="mt-4 pt-4 border-t border-white/[0.08] text-sm text-blue-200"
                            >
                              Iniciando o download de{' '}
                              <span className="font-mono font-semibold text-white">
                                {activeFileName}
                              </span>
                              . Se não começar,{' '}
                              <a
                                href={`/downloads/${activeFileName}`}
                                className="underline underline-offset-4 font-semibold text-white hover:text-blue-200"
                              >
                                baixar manualmente
                              </a>
                              .
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            </section>

            {/* Right: Native Build Specs & Web Fallback */}
            <aside className="lg:col-span-5 flex flex-col gap-6">
              <div className="rounded-2xl bg-[#0A0E16] border border-white/[0.08] p-6">
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
                  <span className="text-sm font-semibold text-white">
                    Incluído no {activeSpec.name}
                  </span>
                  <span className="font-mono text-[11px] text-gray-400">
                    {activeSpec.arch}
                  </span>
                </div>

                <ul className="mt-4 space-y-3">
                  {activeSpec.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-gray-300 leading-relaxed">
                      <Check className="w-4 h-4 text-[#3B82F6] flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Clean Web Fallback */}
              <div className="rounded-2xl bg-[#0A0E16] border border-white/[0.08] p-6 flex flex-col gap-4">
                <div>
                  <p className="text-base font-semibold text-white">
                    Prefere não instalar agora?
                  </p>
                  <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                    Voz em tempo real, compartilhamento de tela e chat criptografado também funcionam direto no navegador.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/@me')}
                  className="pub-press pub-hover-arrow self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.09] text-white font-semibold text-sm whitespace-nowrap cursor-pointer"
                >
                  <span>Acessar pela web</span>
                  <ArrowRight className="w-4 h-4 pub-arrow" />
                </button>
              </div>
            </aside>
          </div>
        </main>

        {/* Shared Footer (Plus Jakarta Sans, no Landing display font) */}
        <PublicFooter onNavigate={onNavigate} activePage="download" useDisplayFont={false} />
      </div>
    </MotionConfig>
  );
};
