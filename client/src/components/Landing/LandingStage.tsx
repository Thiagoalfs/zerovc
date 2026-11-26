import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  Hash,
  Headphones,
  Mic,
  MicOff,
  Monitor,
  Plus,
  SendHorizontal,
  Settings,
  Video,
  Volume2,
} from 'lucide-react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';
import { HeadphonesOff } from '../Common/HeadphonesOff';
import { VoiceControlBar } from '../Voice/VoiceControlBar';
import { ClipTabs } from './ClipTabs';

type ChannelKey = 'geral' | 'novidades' | 'voz';

interface DemoMessage {
  id: string;
  initial: string;
  color: string;
  author: string;
  time: string;
  text: string;
}

const INITIAL_CHANNELS: Record<
  Exclude<ChannelKey, 'voz'>,
  { title: string; topic: string; messages: DemoMessage[] }
> = {
  geral: {
    title: 'geral',
    topic: 'Canal principal da comunidade',
    messages: [
      {
        id: 'g-1',
        initial: 'A',
        color: 'bg-indigo-500',
        author: 'Alexandre',
        time: 'Hoje às 11:42',
        text: 'O ZeroVC tá rodando liso demais. A voz não tem atraso nenhum.',
      },
      {
        id: 'g-2',
        initial: 'M',
        color: 'bg-emerald-500',
        author: 'Marina',
        time: 'Hoje às 11:43',
        text: 'E o compartilhamento de tela a 60 FPS ficou perfeito para jogar junto.',
      },
    ],
  },
  novidades: {
    title: 'novidades',
    topic: 'Atualizações e notas de versão do ZeroVC',
    messages: [
      {
        id: 'n-1',
        initial: 'V',
        color: 'bg-[#2563EB]',
        author: 'Você',
        time: 'Hoje às 09:15',
        text: 'Captura nativa de áudio do sistema a 60 FPS liberada no app desktop.',
      },
      {
        id: 'n-2',
        initial: 'L',
        color: 'bg-amber-500',
        author: 'Lucas',
        time: 'Hoje às 10:02',
        text: 'Testei no Linux com AppImage e conectou instantâneo na sala.',
      },
    ],
  },
};

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export const LandingStage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [activeChannel, setActiveChannel] = useState<ChannelKey>('voz');
  const [mockMuted, setMockMuted] = useState(false);
  const [mockDeafened, setMockDeafened] = useState(false);
  const [mockCameraOn, setMockCameraOn] = useState(false);
  const [mockScreensharing, setMockScreensharing] = useState(false);
  const [draft, setDraft] = useState('');
  const [messagesByChannel, setMessagesByChannel] = useState<
    Record<Exclude<ChannelKey, 'voz'>, DemoMessage[]>
  >({
    geral: INITIAL_CHANNELS.geral.messages,
    novidades: INITIAL_CHANNELS.novidades.messages,
  });

  const effectiveMuted = mockMuted || mockDeafened;

  const mobileTabs = useMemo(
    () => [
      {
        id: 'voz' as const,
        label: 'Voz',
        icon: <Volume2 className="w-3.5 h-3.5 flex-shrink-0" />,
      },
      {
        id: 'geral' as const,
        label: 'geral',
        icon: <Hash className="w-3.5 h-3.5 flex-shrink-0" />,
      },
      {
        id: 'novidades' as const,
        label: 'novidades',
        icon: <Hash className="w-3.5 h-3.5 flex-shrink-0" />,
      },
    ],
    []
  );

  const handleSendDemoMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeChannel === 'voz') return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setMessagesByChannel((prev) => ({
      ...prev,
      [activeChannel]: [
        ...prev[activeChannel].slice(-4),
        {
          id: `u-${Date.now()}`,
          initial: 'V',
          color: 'bg-[#2563EB]',
          author: 'Você',
          time: `Hoje às ${hh}:${mm}`,
          text: trimmed,
        },
      ],
    }));
    setDraft('');
  };

  const viewTransition = prefersReducedMotion
    ? { duration: 0.16 }
    : { duration: 0.2, ease: EASE_OUT };

  const activeTextMeta =
    activeChannel === 'voz' ? null : INITIAL_CHANNELS[activeChannel];
  const activeTextMessages =
    activeChannel === 'voz' ? [] : messagesByChannel[activeChannel];

  const participantCount = mockCameraOn || mockScreensharing ? 3 : 2;

  return (
    <div className="w-full">
      <div className="w-full rounded-2xl bg-[#0D1017] border border-white/[0.11] pub-specular overflow-hidden text-left">
        {/* Window Titlebar */}
        <div className="h-10 bg-[#0A0D13] border-b border-white/[0.07] px-3.5 sm:px-4 flex items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="text-xs font-semibold text-gray-300 ml-2 truncate">
              ZeroVC Desktop
            </span>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-400 tabular-nums">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  mockDeafened ? 'bg-red-400' : 'bg-[#22C55E]'
                }`}
              />
              {mockDeafened ? 'Áudio pausado' : '48 kHz · 12 ms'}
            </span>
            <span className="font-mono text-[11px] text-gray-500 hidden md:inline">
              Prévia interativa
            </span>
          </div>
        </div>

        {/* Mobile Channel Bar (< sm) so mobile visitors can test every view */}
        <div className="sm:hidden bg-[#0C0F16] border-b border-white/[0.07] px-3 py-2 flex items-center justify-between gap-2">
          <ClipTabs
            items={mobileTabs}
            value={activeChannel}
            onChange={setActiveChannel}
            ariaLabel="Canais da prévia"
            className="grid grid-cols-3 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] flex-1"
            buttonClassName="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold"
            radiusPx={8}
          />
          <button
            type="button"
            onClick={() => setMockMuted((v) => !v)}
            aria-label={effectiveMuted ? 'Ativar microfone na prévia' : 'Silenciar microfone na prévia'}
            aria-pressed={effectiveMuted}
            className={`pub-press w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer ${
              effectiveMuted
                ? 'bg-red-500/20 text-red-400'
                : 'bg-white/[0.06] text-gray-300'
            }`}
          >
            {effectiveMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        {/* Main App Body */}
        <div className="flex min-h-[430px] sm:min-h-[480px] lg:h-[540px] overflow-hidden">
          {/* Desktop Left Sidebars */}
          <div className="hidden sm:flex flex-col h-full bg-[#10141D] border-r border-white/[0.07] flex-shrink-0">
            <div className="flex-1 flex overflow-hidden">
              {/* Guild Rail */}
              <div className="w-16 bg-[#0B0E14] py-3.5 flex flex-col items-center gap-2.5 select-none border-r border-white/[0.06]">
                <div className="w-11 h-11 rounded-2xl bg-white/[0.06] flex items-center justify-center">
                  <ZeroVCLogo className="w-6 h-6" />
                </div>
                <div className="w-7 h-px bg-white/10" />
                <div className="relative flex items-center justify-center">
                  <div className="absolute -left-3 w-1 h-7 bg-white rounded-r-full" />
                  <div className="w-11 h-11 rounded-2xl bg-[#2563EB] flex items-center justify-center text-sm font-bold text-white shadow-[0_6px_18px_-6px_rgba(37,99,235,0.8)]">
                    ZC
                  </div>
                </div>
              </div>

              {/* Channels Sidebar */}
              <div className="w-56 bg-[#111520] flex flex-col justify-between overflow-hidden">
                <div>
                  <div className="h-12 border-b border-white/[0.07] px-4 flex items-center justify-between font-semibold text-gray-100 text-sm">
                    <span className="truncate">Comunidade ZeroVC</span>
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>

                  <div className="p-2.5 space-y-5">
                    <div>
                      <div className="text-[11px] font-semibold text-gray-400 px-2 mb-1.5 tracking-[0.04em] uppercase">
                        Canais de texto
                      </div>
                      <div className="space-y-1 text-sm">
                        <button
                          type="button"
                          onClick={() => setActiveChannel('geral')}
                          className={`pub-press w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer ${
                            activeChannel === 'geral'
                              ? 'bg-white/10 text-white font-semibold'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                          }`}
                        >
                          <Hash className="w-4 h-4 flex-shrink-0 text-gray-400" />
                          <span>geral</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveChannel('novidades')}
                          className={`pub-press w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer ${
                            activeChannel === 'novidades'
                              ? 'bg-white/10 text-white font-semibold'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <Hash className="w-4 h-4 flex-shrink-0 text-gray-400" />
                            <span>novidades</span>
                          </span>
                          {activeChannel !== 'novidades' && (
                            <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-gray-400 px-2 mb-1.5 tracking-[0.04em] uppercase">
                        Canais de voz
                      </div>
                      <div className="space-y-2 text-sm">
                        <button
                          type="button"
                          onClick={() => setActiveChannel('voz')}
                          className={`pub-press w-full px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-between cursor-pointer ${
                            activeChannel === 'voz'
                              ? 'text-[#22C55E] bg-[#22C55E]/15'
                              : 'text-[#22C55E] bg-[#22C55E]/10 hover:bg-[#22C55E]/15'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Volume2 className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">Sala Principal</span>
                          </span>
                          <span className="font-mono tabular-nums text-xs font-semibold text-[#22C55E]">
                            {participantCount}
                          </span>
                        </button>

                        <div className="pl-5 space-y-1.5 text-sm text-gray-300">
                          <div className="flex items-center justify-between pr-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                                A
                              </span>
                              <span className="truncate">Alexandre</span>
                            </div>
                            {!mockDeafened && (
                              <span className="flex items-end gap-0.5 h-3" aria-hidden="true">
                                <span className="w-0.5 h-3 bg-[#22C55E] rounded-full pub-eq-bar" />
                                <span
                                  className="w-0.5 h-2 bg-[#22C55E] rounded-full pub-eq-bar"
                                  style={{ animationDelay: '180ms' }}
                                />
                                <span
                                  className="w-0.5 h-2.5 bg-[#22C55E] rounded-full pub-eq-bar"
                                  style={{ animationDelay: '340ms' }}
                                />
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                              M
                            </span>
                            <span className="truncate">Marina</span>
                          </div>
                          {(mockCameraOn || mockScreensharing) && (
                            <div className="flex items-center gap-2 text-white">
                              <span className="w-4 h-4 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                                V
                              </span>
                              <span className="truncate">Você</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* UserBar Footer */}
            <div className="p-2 bg-[#0C0F16] border-t border-white/[0.07]">
              <div className="w-full bg-[#090B11] rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 border border-white/[0.05]">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="relative w-8 h-8 rounded-full bg-[#2563EB] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    <span>V</span>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22C55E] border-2 border-[#090B11]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-white truncate leading-tight">
                      Você
                    </span>
                    <span className="text-xs text-gray-400 truncate leading-tight">
                      {mockDeafened
                        ? 'Áudio desativado'
                        : mockMuted
                        ? 'Microfone mutado'
                        : mockScreensharing
                        ? 'Transmitindo 60 FPS'
                        : 'Disponível'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-gray-400 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setMockMuted((v) => !v)}
                    aria-label={
                      effectiveMuted
                        ? 'Ativar microfone na prévia'
                        : 'Silenciar microfone na prévia'
                    }
                    aria-pressed={effectiveMuted}
                    className={`pub-press w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${
                      effectiveMuted
                        ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
                        : 'hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {effectiveMuted ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMockDeafened((v) => !v)}
                    aria-label={
                      mockDeafened
                        ? 'Reativar áudio na prévia'
                        : 'Desativar áudio na prévia'
                    }
                    aria-pressed={mockDeafened}
                    className={`pub-press w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer ${
                      mockDeafened
                        ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
                        : 'hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {mockDeafened ? (
                      <HeadphonesOff className="w-4 h-4" />
                    ) : (
                      <Headphones className="w-4 h-4" />
                    )}
                  </button>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500">
                    <Settings className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Area (Crossfaded smoothly on channel change) */}
          <div className="relative flex-1 flex overflow-hidden bg-[#141925]">
            <AnimatePresence mode="popLayout" initial={false}>
              {activeChannel === 'voz' ? (
                <motion.div
                  key="voz"
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: 'blur(2px)', y: 4 }
                  }
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: 'blur(2px)', y: -4 }
                  }
                  transition={viewTransition}
                  className="flex-1 bg-[#111622] flex flex-col justify-between overflow-hidden"
                >
                  {/* Voice Header */}
                  <div className="h-12 border-b border-white/[0.07] px-4 flex items-center justify-between gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Volume2 className="w-5 h-5 text-[#22C55E] flex-shrink-0" />
                      <span className="font-semibold text-white text-sm truncate">
                        Sala Principal
                      </span>
                      <span className="font-mono text-xs text-gray-400 tabular-nums">
                        ({participantCount})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px] text-gray-400 tabular-nums">
                      {mockScreensharing && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#2563EB]/20 text-[#93C5FD] border border-[#3B82F6]/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
                          AO VIVO · 60 FPS
                        </span>
                      )}
                      <span className="hidden sm:inline text-gray-500">RNNoise · 48 kHz</span>
                    </div>
                  </div>

                  {/* Interactive Stage Area */}
                  <div className="flex-1 min-h-0 p-3.5 sm:p-5 flex flex-col items-center justify-center gap-3 overflow-hidden">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {mockScreensharing ? (
                        <motion.div
                          key="screenshare-active"
                          initial={
                            prefersReducedMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.97, filter: 'blur(2px)' }
                          }
                          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                          exit={
                            prefersReducedMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.97, filter: 'blur(2px)' }
                          }
                          transition={viewTransition}
                          className="w-full h-full flex flex-col sm:flex-row gap-3 min-h-0"
                        >
                          {/* Simulated 60 FPS Screen Share Window */}
                          <div className="relative flex-1 min-h-[190px] rounded-xl bg-[#090D16] border border-[#3B82F6]/35 overflow-hidden flex flex-col justify-between p-3.5 sm:p-4">
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute -right-12 -top-12 w-56 h-56 rounded-full bg-[#2563EB]/20 blur-3xl"
                            />

                            <div className="relative z-10 flex items-center justify-between gap-2">
                              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/55 border border-white/10 text-xs font-medium text-white">
                                <Monitor className="w-3.5 h-3.5 text-[#3B82F6]" />
                                <span>Tela de Você</span>
                              </div>
                              <div className="font-mono text-[11px] text-[#93C5FD] bg-[#2563EB]/15 border border-[#3B82F6]/30 px-2 py-0.5 rounded-md tabular-nums">
                                1080p · 60 FPS
                              </div>
                            </div>

                            {/* Crisp live frame readout */}
                            <div className="relative z-10 my-auto py-3">
                              <div className="rounded-lg bg-[#0D1320]/90 border border-white/[0.08] p-3 font-mono text-[11px] sm:text-xs text-gray-300 space-y-1.5 max-w-md">
                                <div className="flex items-center justify-between text-gray-400">
                                  <span>capture_pipeline</span>
                                  <span className="text-[#22C55E]">ACTIVE</span>
                                </div>
                                <div className="h-px bg-white/[0.06]" />
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">video.codec</span>
                                  <span className="text-white">VP8 / H.264 HW</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">system.audio</span>
                                  <span className="text-[#93C5FD]">Estéreo (ZeroVC isolado)</span>
                                </div>
                              </div>
                            </div>

                            <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-gray-400">
                              <span>Sem loop de eco no aplicativo</span>
                              <button
                                type="button"
                                onClick={() => setMockScreensharing(false)}
                                className="pub-press text-white/85 hover:text-white underline underline-offset-4 cursor-pointer"
                              >
                                Encerrar prévia
                              </button>
                            </div>
                          </div>

                          {/* Compact participant strip during screenshare */}
                          <div className="flex sm:flex-col gap-2 sm:w-36 flex-shrink-0">
                            <div
                              className={`relative flex-1 rounded-xl bg-[#181E2C] p-2.5 flex flex-col items-center justify-center border ${
                                mockDeafened ? 'border-white/10' : 'border-[#22C55E]/70'
                              }`}
                            >
                              <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold text-xs">
                                A
                              </div>
                              <span className="mt-1.5 text-[11px] font-medium text-gray-200">
                                Alexandre
                              </span>
                            </div>
                            <div className="relative flex-1 rounded-xl bg-[#181E2C] p-2.5 flex flex-col items-center justify-center border border-white/10">
                              <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold text-xs">
                                M
                              </div>
                              <span className="mt-1.5 text-[11px] font-medium text-gray-200">
                                Marina
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="voice-grid"
                          initial={
                            prefersReducedMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.97, filter: 'blur(2px)' }
                          }
                          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                          exit={
                            prefersReducedMotion
                              ? { opacity: 0 }
                              : { opacity: 0, scale: 0.97, filter: 'blur(2px)' }
                          }
                          transition={viewTransition}
                          className={`grid gap-3 w-full max-w-2xl ${
                            mockCameraOn ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'
                          }`}
                        >
                          {/* Alexandre tile */}
                          <div
                            className={`relative aspect-video rounded-2xl bg-[#171D2B] flex items-center justify-center overflow-hidden transition-colors duration-200 ${
                              mockDeafened
                                ? 'border border-white/10'
                                : 'border-2 border-[#22C55E]'
                            }`}
                          >
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold text-base shadow-[0_10px_24px_-8px_rgba(99,102,241,0.7)]">
                              A
                            </div>
                            <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/65 text-xs font-semibold text-white flex items-center gap-1.5">
                              <Mic
                                className={`w-3.5 h-3.5 ${
                                  mockDeafened ? 'text-gray-400' : 'text-[#22C55E]'
                                }`}
                              />
                              <span>Alexandre</span>
                            </div>
                            {!mockDeafened && (
                              <div
                                aria-hidden="true"
                                className="absolute top-2.5 right-2.5 flex items-end gap-0.5 h-3.5 px-1.5 py-0.5 rounded bg-black/45"
                              >
                                <span className="w-0.5 h-3 bg-[#22C55E] rounded-full pub-eq-bar" />
                                <span
                                  className="w-0.5 h-2 bg-[#22C55E] rounded-full pub-eq-bar"
                                  style={{ animationDelay: '160ms' }}
                                />
                                <span
                                  className="w-0.5 h-2.5 bg-[#22C55E] rounded-full pub-eq-bar"
                                  style={{ animationDelay: '320ms' }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Marina tile */}
                          <div className="relative aspect-video rounded-2xl bg-[#171D2B] border border-white/10 flex items-center justify-center overflow-hidden">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold text-base">
                              M
                            </div>
                            <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/65 text-xs font-semibold text-white flex items-center gap-1.5">
                              <Mic className="w-3.5 h-3.5 text-gray-300" />
                              <span>Marina</span>
                            </div>
                          </div>

                          {/* Interactive Camera Tile when mockCameraOn is toggled */}
                          {mockCameraOn && (
                            <motion.div
                              initial={
                                prefersReducedMotion
                                  ? { opacity: 0 }
                                  : { opacity: 0, scale: 0.94 }
                              }
                              animate={{ opacity: 1, scale: 1 }}
                              transition={viewTransition}
                              className="relative col-span-2 sm:col-span-1 aspect-video rounded-2xl bg-[#0E1629] border border-[#3B82F6]/50 flex items-center justify-center overflow-hidden"
                            >
                              <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(59,130,246,0.28),transparent_62%)]"
                              />
                              <div className="relative z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#2563EB] flex items-center justify-center text-white font-semibold text-base ring-4 ring-[#3B82F6]/20">
                                V
                              </div>
                              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/60 font-mono text-[10px] text-[#93C5FD] flex items-center gap-1">
                                <Video className="w-3 h-3" />
                                <span>720p</span>
                              </div>
                              <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/65 text-xs font-semibold text-white flex items-center gap-1.5">
                                {effectiveMuted ? (
                                  <MicOff className="w-3.5 h-3.5 text-red-400" />
                                ) : (
                                  <Mic className="w-3.5 h-3.5 text-[#22C55E]" />
                                )}
                                <span>Você</span>
                              </div>
                            </motion.div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Voice Control Bar */}
                  <div className="pb-4 px-3 flex flex-col items-center gap-2 flex-shrink-0">
                    <VoiceControlBar
                      previewState={{
                        isMuted: mockMuted,
                        isDeafened: mockDeafened,
                        isCameraOn: mockCameraOn,
                        isScreensharing: mockScreensharing,
                        onToggleMute: () => setMockMuted((v) => !v),
                        onToggleDeafen: () => setMockDeafened((v) => !v),
                        onToggleCamera: () => setMockCameraOn((v) => !v),
                        onToggleScreenShare: () => setMockScreensharing((v) => !v),
                        onDisconnect: () => {
                          setMockScreensharing(false);
                          setMockCameraOn(false);
                          setActiveChannel('geral');
                        },
                      }}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={activeChannel}
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: 'blur(2px)', y: 4 }
                  }
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, filter: 'blur(2px)', y: -4 }
                  }
                  transition={viewTransition}
                  className="flex-1 flex overflow-hidden"
                >
                  <div className="flex-1 bg-[#141925] flex flex-col justify-between overflow-hidden">
                    <div className="h-12 border-b border-white/[0.07] px-4 flex items-center gap-2.5 flex-shrink-0">
                      <Hash className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <span className="font-semibold text-white text-sm">
                        {activeTextMeta?.title}
                      </span>
                      <span className="text-gray-400 hidden sm:inline text-sm truncate">
                        {activeTextMeta?.topic}
                      </span>
                    </div>

                    <div className="flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto">
                      {activeTextMessages.map((msg) => (
                        <div key={msg.id} className="flex gap-3 items-start">
                          <div
                            className={`w-9 h-9 rounded-full ${msg.color} flex items-center justify-center text-sm font-semibold text-white flex-shrink-0`}
                          >
                            {msg.initial}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2.5">
                              <span className="text-sm font-semibold text-white">
                                {msg.author}
                              </span>
                              <span className="font-mono text-[11px] text-gray-400 tabular-nums">
                                {msg.time}
                              </span>
                            </div>
                            <p className="text-sm text-gray-200 mt-1 leading-relaxed break-words">
                              {msg.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Working local-only demo composer */}
                    <form onSubmit={handleSendDemoMessage} className="p-3.5 sm:p-4 pt-0">
                      <div className="h-11 bg-[#1C2232] border border-white/[0.08] focus-within:border-[#3B82F6]/60 rounded-xl px-3 flex items-center gap-2.5 transition-colors duration-150">
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-gray-300 flex-shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="text"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder={`Testar mensagem em #${activeTextMeta?.title}...`}
                          aria-label={`Testar mensagem em #${activeTextMeta?.title}`}
                          className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-gray-400 focus:outline-none"
                        />
                        <button
                          type="submit"
                          aria-label="Enviar mensagem na prévia"
                          disabled={!draft.trim()}
                          className={`pub-press w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer ${
                            draft.trim()
                              ? 'bg-[#2563EB] text-white'
                              : 'text-gray-500 cursor-default'
                          }`}
                        >
                          <SendHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* MemberList Sidebar */}
                  <aside className="hidden lg:flex w-52 bg-[#111520] border-l border-white/[0.07] flex-col p-3 gap-5 overflow-hidden flex-shrink-0 select-none">
                    <div>
                      <div className="font-mono text-[11px] font-medium text-gray-400 px-2 mb-2 tabular-nums">
                        Disponível (3)
                      </div>
                      <div className="space-y-1">
                        {[
                          {
                            name: 'Alexandre',
                            initial: 'A',
                            color: 'bg-indigo-500',
                            status: 'Em chamada',
                          },
                          {
                            name: 'Marina',
                            initial: 'M',
                            color: 'bg-emerald-500',
                            status: 'Sala Principal',
                          },
                          {
                            name: 'Você',
                            initial: 'V',
                            color: 'bg-[#2563EB]',
                            status: mockDeafened
                              ? 'Áudio desativado'
                              : mockMuted
                              ? 'Mutado'
                              : mockScreensharing
                              ? 'Transmitindo 60 FPS'
                              : 'Online',
                          },
                        ].map((member) => (
                          <div
                            key={member.name}
                            className="px-2 py-1.5 rounded-lg flex items-center gap-2.5 hover:bg-white/[0.04] transition-colors duration-150"
                          >
                            <div
                              className={`relative w-8 h-8 rounded-full ${member.color} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}
                            >
                              <span>{member.initial}</span>
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22C55E] border-2 border-[#111520]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-100 truncate leading-tight">
                                {member.name}
                              </div>
                              <div className="text-xs text-gray-400 truncate leading-tight">
                                {member.status}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="font-mono text-[11px] font-medium text-gray-400 px-2 mb-2 tabular-nums">
                        Offline (1)
                      </div>
                      <div className="px-2 py-1.5 rounded-lg flex items-center gap-2.5 opacity-55">
                        <div className="relative w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          <span>L</span>
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-offline border-2 border-[#111520]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-300 truncate leading-tight">
                            Lucas
                          </div>
                        </div>
                      </div>
                    </div>
                  </aside>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Subtle interactive caption below the stage */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400 px-1">
        <span>
          Experimente na prévia: alterne entre canais, ative a câmera ou teste o compartilhamento de tela.
        </span>
        <span className="font-mono text-[11px] text-gray-500">
          Simulação local · sem conexão externa
        </span>
      </div>
    </div>
  );
};
