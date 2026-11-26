import React, { useEffect, useState } from 'react';
import { motion, MotionConfig, useReducedMotion } from 'motion/react';
import { ArrowRight, Download, Globe } from 'lucide-react';
import { PublicNavbar } from './PublicNavbar';
import { PublicFooter } from './PublicFooter';
import { LandingStage } from './LandingStage';
import { LandingArchitecture } from './LandingArchitecture';

interface LandingPageProps {
  onNavigate: (path: string) => void;
  user?: any;
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, user }) => {
  const prefersReducedMotion = useReducedMotion();
  const [os, setOs] = useState<'android' | 'windows' | 'linux' | 'ios' | 'other'>('windows');

  useEffect(() => {
    const ua = (navigator.userAgent || '').toLowerCase();
    if (/android/i.test(ua)) setOs('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setOs('ios');
    else if (/linux/i.test(ua)) setOs('linux');
    else if (/windows|win32|win64/i.test(ua)) setOs('windows');
    else setOs('other');
  }, []);

  const handleDownload = () => {
    if (os === 'linux' || os === 'ios' || os === 'other') {
      onNavigate('/download');
      return;
    }
    let fileUrl = '/downloads/ZeroVC-Setup.exe';
    let fileName = 'ZeroVC-Setup.exe';
    if (os === 'android') {
      fileUrl = '/downloads/ZeroVC.apk';
      fileName = 'ZeroVC.apk';
    }
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCtaLabel =
    os === 'android'
      ? 'Baixar para Android'
      : os === 'windows'
      ? 'Baixar para Windows'
      : os === 'linux'
      ? 'Baixar para Linux'
      : os === 'ios'
      ? 'Instalar no iOS'
      : 'Baixar o aplicativo';

  // Non-uniform hero entrance choreography (Emil Kowalski choreograph rules):
  // Lead moves first & furthest; support follows with shrinking gaps; stage enters as one unit.
  const leadAnim = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 } }
    : {
        initial: { opacity: 0, y: 14, filter: 'blur(4px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        transition: { duration: 0.54, ease: EASE_OUT, delay: 0 },
      };

  const supportAnim = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.46, ease: EASE_OUT, delay: 0.075 },
      };

  const stageAnim = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25 } }
    : {
        initial: { opacity: 0, y: 16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: 0.6, ease: EASE_OUT, delay: 0.14 },
      };

  return (
    <MotionConfig reducedMotion="user">
      <div className="public-surface relative min-h-screen w-full flex flex-col font-sans overflow-x-hidden">
        {/* Architectural studio atmosphere (part of page flow, not fixed viewport trap) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[760px] overflow-hidden"
        >
          <div className="absolute -top-40 right-[-10%] w-[780px] h-[540px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.32)_0%,rgba(29,78,216,0.11)_44%,transparent_72%)]" />
          <div className="absolute top-20 left-[-12%] w-[540px] h-[400px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.14)_0%,transparent_70%)]" />
        </div>

        {/* Navbar */}
        <PublicNavbar
          onNavigate={onNavigate}
          user={user}
          activePage="landing"
          transparentAtTop
        />

        {/* Bold Asymmetric Editorial Hero + Interactive Product Stage */}
        <section className="relative z-10 pt-10 pb-16 md:pt-16 md:pb-24 px-5 sm:px-6 max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end">
            {/* Lead Display Typography (7 cols) — no eyebrow, full typographic presence */}
            <motion.div className="lg:col-span-7" {...leadAnim}>
              <h1 className="font-display text-[clamp(2.85rem,6.6vw,5.65rem)] font-extrabold tracking-[-0.04em] text-white leading-[0.94] text-balance">
                Voz cristalina. Latência zero.
              </h1>
            </motion.div>

            {/* Supporting Editorial Copy + Dual Actions (5 cols) */}
            <motion.div className="lg:col-span-5 lg:pb-1.5" {...supportAnim}>
              <p className="text-base sm:text-lg text-gray-300 leading-relaxed max-w-[46ch]">
                Chamadas de voz em tempo real, compartilhamento de tela a 60 FPS e chat criptografado em um aplicativo leve de verdade.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="pub-press inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#2563EB] hover:bg-[#3B82F6] text-white font-semibold text-sm sm:text-base cursor-pointer shadow-[0_14px_34px_-10px_rgba(37,99,235,0.75)]"
                >
                  <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{downloadCtaLabel}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate(user ? '/@me' : '/signin')}
                  className="pub-press pub-hover-arrow inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.1] text-white font-semibold text-sm sm:text-base cursor-pointer"
                >
                  <Globe className="w-4 h-4 text-gray-300" />
                  <span>{user ? 'Abrir chat' : 'Abrir no navegador'}</span>
                </button>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-xs text-gray-400 tabular-nums">
                <span>v1.1.6</span>
                <span aria-hidden="true" className="text-white/20">
                  ·
                </span>
                <span>48 kHz RNNoise</span>
                <span aria-hidden="true" className="text-white/20">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('/download')}
                  className="text-gray-300 hover:text-white underline underline-offset-4 decoration-white/25 hover:decoration-white transition-colors duration-150 cursor-pointer"
                >
                  Outras plataformas
                </button>
              </div>
            </motion.div>
          </div>

          {/* Interactive Product Stage — single entrance container */}
          <motion.div className="mt-10 md:mt-14" {...stageAnim}>
            <LandingStage />
          </motion.div>
        </section>

        {/* Architectural Capability Strip */}
        <section
          aria-label="Especificações principais"
          className="relative z-10 border-y border-white/[0.08] bg-[#080B12]"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-6 grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]">
            {[
              { spec: '48 kHz', detail: 'Áudio nativo com RNNoise' },
              { spec: '60 FPS', detail: 'Tela + som do sistema sem eco' },
              { spec: 'E2EE', detail: 'Chaves geradas no dispositivo' },
              { spec: 'Multi-OS', detail: 'Windows, Linux, Android e Web' },
            ].map((item) => (
              <div
                key={item.spec}
                className="py-5 sm:py-6 px-0 lg:px-6 first:lg:pl-0 last:lg:pr-0 flex flex-col gap-1"
              >
                <span className="font-mono text-sm font-semibold text-white tabular-nums">
                  {item.spec}
                </span>
                <span className="text-xs sm:text-sm text-gray-400 leading-snug">
                  {item.detail}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Editorial Architecture Showcase */}
        <LandingArchitecture />

        {/* Full-Bleed Electric Cobalt Closing Statement (no generic rounded card) */}
        <section className="relative z-10 mt-10 bg-gradient-to-br from-[#1D4ED8] via-[#2563EB] to-[#1E40AF] border-t border-white/15 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 right-[-6%] w-[560px] h-[420px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(147,197,253,0.25)_0%,transparent_70%)]"
          />
          <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-24 flex flex-col lg:flex-row items-start lg:items-end justify-between gap-10">
            <div className="max-w-2xl">
              <h2 className="font-display text-[clamp(2.15rem,5vw,4rem)] font-extrabold tracking-[-0.04em] text-white leading-[0.96] text-balance">
                Pronto para conversar sem travamentos?
              </h2>
              <p className="mt-4 text-base sm:text-lg text-blue-100 leading-relaxed max-w-[50ch]">
                Instale o aplicativo nativo no seu computador ou celular, ou entre direto pelo navegador em segundos.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={handleDownload}
                className="pub-press inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl bg-[#06080D] hover:bg-[#0F1420] text-white font-semibold text-base cursor-pointer shadow-[0_18px_40px_-14px_rgba(6,8,13,0.7)]"
              >
                <Download className="w-5 h-5 text-[#60A5FA]" />
                <span>{downloadCtaLabel}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('/download')}
                className="pub-press pub-hover-arrow inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-white/15 hover:bg-white/22 text-white font-semibold text-sm sm:text-base cursor-pointer"
              >
                <span>Ver instaladores</span>
                <ArrowRight className="w-4 h-4 pub-arrow" />
              </button>
            </div>
          </div>
        </section>

        {/* Shared Footer */}
        <PublicFooter onNavigate={onNavigate} activePage="landing" useDisplayFont />
      </div>
    </MotionConfig>
  );
};
