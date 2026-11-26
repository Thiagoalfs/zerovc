import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Lock, Mic, MicOff, Monitor, Shield, VolumeX } from 'lucide-react';
import { ClipTabs } from './ClipTabs';

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// 28 deterministic bar heights for clean voice vs raw room-noise demonstration
const VOICE_BARS_CLEAN = [
  10, 14, 24, 48, 72, 86, 62, 34, 16, 12, 22, 58, 92, 78, 44, 18, 12, 10, 30, 68, 84, 52, 26, 14,
  10, 12, 10, 10,
];
const VOICE_BARS_RAW = [
  42, 54, 48, 66, 84, 94, 76, 60, 46, 52, 58, 74, 98, 86, 68, 50, 44, 48, 56, 82, 92, 70, 54, 48,
  40, 52, 46, 42,
];

type CaptureBackend = 'windows' | 'linux' | 'web';

const CAPTURE_BACKENDS: Record<
  CaptureBackend,
  {
    engine: string;
    capturedSource: string;
    excludedSource: string;
    detail: string;
  }
> = {
  windows: {
    engine: 'WASAPI Process Loopback',
    capturedSource: 'Jogo ou janela selecionada (48 kHz estéreo)',
    excludedSource: 'Processo ZeroVC.exe excluído na captura',
    detail: 'Isolamento nativo por PID no Windows sem precisar de cabos virtuais.',
  },
  linux: {
    engine: 'PipeWire Native Node',
    capturedSource: 'Stream da aplicação capturado sem alterar o sink padrão',
    excludedSource: 'Sink do próprio ZeroVC ignorado automaticamente',
    detail: 'Roteamento direto no PipeWire sem eco nem retorno de voz dos amigos.',
  },
  web: {
    engine: 'DisplayMedia Self-Suppression',
    capturedSource: 'Áudio da aba ou tela compartilhada em tempo real',
    excludedSource: 'Guia atual do ZeroVC excluída da captura',
    detail: 'Flags nativas de supressão da aba atual no navegador.',
  },
};

export const LandingArchitecture: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();

  // Interactive demo states (purely local, purposeful explanation)
  const [rnnoiseMode, setRnnoiseMode] = useState<'active' | 'raw'>('active');
  const [captureBackend, setCaptureBackend] = useState<CaptureBackend>('linux');
  const [e2eeView, setE2eeView] = useState<'device' | 'transit'>('transit');
  const [pttActive, setPttActive] = useState(false);

  const rnnoiseTabs = useMemo(
    () => [
      { id: 'active' as const, label: 'RNNoise ativo' },
      { id: 'raw' as const, label: 'Sem filtro' },
    ],
    []
  );

  const backendTabs = useMemo(
    () => [
      { id: 'windows' as const, label: 'Windows' },
      { id: 'linux' as const, label: 'Linux' },
      { id: 'web' as const, label: 'Web' },
    ],
    []
  );

  const e2eeTabs = useMemo(
    () => [
      { id: 'device' as const, label: 'No dispositivo' },
      { id: 'transit' as const, label: 'Em trânsito' },
    ],
    []
  );

  const bars = rnnoiseMode === 'active' ? VOICE_BARS_CLEAN : VOICE_BARS_RAW;
  const activeBackend = CAPTURE_BACKENDS[captureBackend];

  const swapTransition = prefersReducedMotion
    ? { duration: 0.16 }
    : { duration: 0.2, ease: EASE_OUT };

  return (
    <section
      id="arquitetura"
      className="py-20 md:py-28 px-5 sm:px-6 max-w-6xl mx-auto w-full"
    >
      {/* Section Header — no kicker/eyebrow, pure editorial authority */}
      <div className="max-w-3xl pb-12 md:pb-16 border-b border-white/[0.08]">
        <h2 className="font-display text-[clamp(2rem,4.4vw,3.35rem)] font-bold tracking-[-0.035em] text-white leading-[1.02] text-balance">
          Engenharia pensada para sumir quando a conversa começa.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-gray-300 leading-relaxed max-w-[58ch]">
          Cada camada do ZeroVC existe para cortar latência, eliminar eco e proteger suas mensagens sem exigir configuração complexa.
        </p>
      </div>

      {/* Alternating Editorial Chapters with Interactive Proof */}
      <div className="divide-y divide-white/[0.08]">
        {/* Chapter 1: 48 kHz + RNNoise */}
        <div className="py-12 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-5">
            <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-white leading-tight text-balance">
              Voz em 48 kHz com supressão de ruído neural local
            </h3>
            <p className="mt-3.5 text-base text-gray-300 leading-relaxed max-w-[48ch]">
              Processamento em quadros de 10 ms com filtro passa-alta de 85 Hz e RNNoise rodando no seu dispositivo para isolar sua voz de teclado, ventoinha e ruído ambiente.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-gray-400 tabular-nums">
              <span>48.000 Hz PCM</span>
              <span>Frame 10 ms</span>
              <span>High-pass 85 Hz</span>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl bg-[#0C1018] border border-white/[0.09] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
                <div className="font-mono text-xs text-gray-300 tabular-nums">
                  {rnnoiseMode === 'active'
                    ? 'Piso de ruído: -64 dB · Voz isolada'
                    : 'Piso de ruído: -28 dB · Teclado + ambiente'}
                </div>
                <ClipTabs
                  items={rnnoiseTabs}
                  value={rnnoiseMode}
                  onChange={setRnnoiseMode}
                  ariaLabel="Alternar demonstração de RNNoise"
                  role="radiogroup"
                  className="inline-grid grid-cols-2 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] self-start sm:self-auto"
                  buttonClassName="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                  radiusPx={8}
                />
              </div>

              {/* Waveform visual proof */}
              <div
                className="mt-5 h-32 sm:h-36 flex items-end justify-between gap-1 sm:gap-1.5 px-1"
                aria-hidden="true"
              >
                {bars.map((heightPct, idx) => {
                  const isVoicePeak = VOICE_BARS_CLEAN[idx] > 30;
                  const barColor =
                    rnnoiseMode === 'active'
                      ? isVoicePeak
                        ? 'bg-[#3B82F6]'
                        : 'bg-white/15'
                      : isVoicePeak
                      ? 'bg-[#3B82F6]/70'
                      : 'bg-amber-400/55';

                  return (
                    <div
                      key={idx}
                      className="flex-1 h-full flex items-end"
                    >
                      <div
                        className={`w-full rounded-t-sm transition-[transform,background-color] duration-[240ms] ${barColor}`}
                        style={{
                          height: '100%',
                          transformOrigin: 'bottom center',
                          transform: `scaleY(${heightPct / 100})`,
                          transitionTimingFunction: 'var(--ease-out)',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between font-mono text-[11px] text-gray-500 tabular-nums">
                <span>0 ms</span>
                <span>
                  {rnnoiseMode === 'active'
                    ? 'Gate adaptativo · histerese -4 dB'
                    : 'Sinal bruto sem atenuação'}
                </span>
                <span>280 ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chapter 2: 60 FPS Screen Share + Audio Isolation */}
        <div className="py-12 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div className="rounded-2xl bg-[#0C1018] border border-white/[0.09] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
                <span className="font-mono text-xs text-gray-300">
                  {activeBackend.engine}
                </span>
                <ClipTabs
                  items={backendTabs}
                  value={captureBackend}
                  onChange={setCaptureBackend}
                  ariaLabel="Selecionar plataforma de captura"
                  role="radiogroup"
                  className="inline-grid grid-cols-3 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] self-start sm:self-auto"
                  buttonClassName="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  radiusPx={8}
                />
              </div>

              <div className="mt-5 relative min-h-[156px]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={captureBackend}
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
                    transition={swapTransition}
                    className="space-y-3"
                  >
                    <div className="rounded-xl bg-[#111827]/90 border border-[#3B82F6]/30 p-3.5 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <Monitor className="w-4 h-4 text-[#3B82F6] mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">
                            {activeBackend.capturedSource}
                          </div>
                          <div className="font-mono text-[11px] text-[#93C5FD] mt-0.5">
                            Enviado para a sala a 60 FPS
                          </div>
                        </div>
                      </div>
                      <Check className="w-4 h-4 text-[#22C55E] flex-shrink-0 mt-0.5" />
                    </div>

                    <div className="rounded-xl bg-[#0A0E16] border border-white/[0.07] p-3.5 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <VolumeX className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-200">
                            {activeBackend.excludedSource}
                          </div>
                          <div className="font-mono text-[11px] text-gray-500 mt-0.5">
                            Bloqueado na origem · 0% retorno de voz
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-gray-500 flex-shrink-0">
                        ISOLADO
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 pt-1">
                      {activeBackend.detail}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 order-1 lg:order-2">
            <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-white leading-tight text-balance">
              Tela a 60 FPS com som do sistema e zero eco
            </h3>
            <p className="mt-3.5 text-base text-gray-300 leading-relaxed max-w-[48ch]">
              Compartilhe jogos ou janelas com áudio estéreo nítido. O ZeroVC exclui automaticamente a própria saída de som para ninguém ouvir a própria voz duplicada na transmissão.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-gray-400 tabular-nums">
              <span>Até 60 FPS</span>
              <span>Áudio estéreo nativo</span>
              <span>Auto-exclusão</span>
            </div>
          </div>
        </div>

        {/* Chapter 3: End-to-End Encryption */}
        <div className="py-12 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-5">
            <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-white leading-tight text-balance">
              Mensagens cifradas antes de sair da sua máquina
            </h3>
            <p className="mt-3.5 text-base text-gray-300 leading-relaxed max-w-[48ch]">
              Criptografia ponta a ponta baseada em Megolm/Vodozemac no próprio cliente. O servidor encaminha apenas pacotes cifrados e não tem acesso às suas chaves privadas.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-gray-400">
              <span>Vodozemac WASM</span>
              <span>Chaves locais</span>
              <span>Verificação por dispositivo</span>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl bg-[#0C1018] border border-white/[0.09] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
                <div className="inline-flex items-center gap-2 font-mono text-xs text-gray-300">
                  <Shield className="w-4 h-4 text-[#3B82F6]" />
                  <span>m.megolm.v1.aes-sha2</span>
                </div>
                <ClipTabs
                  items={e2eeTabs}
                  value={e2eeView}
                  onChange={setE2eeView}
                  ariaLabel="Alternar visualização da mensagem criptografada"
                  role="radiogroup"
                  className="inline-grid grid-cols-2 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08] self-start sm:self-auto"
                  buttonClassName="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                  radiusPx={8}
                />
              </div>

              <div className="mt-5 relative min-h-[124px]">
                <AnimatePresence mode="popLayout" initial={false}>
                  {e2eeView === 'device' ? (
                    <motion.div
                      key="device"
                      initial={
                        prefersReducedMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: 'blur(2px)' }
                      }
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      exit={
                        prefersReducedMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: 'blur(2px)' }
                      }
                      transition={swapTransition}
                      className="rounded-xl bg-[#111622] border border-white/[0.08] p-4"
                    >
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                        <span className="font-semibold text-white">Marina · #geral</span>
                        <span className="font-mono text-[#22C55E]">Decifrado localmente</span>
                      </div>
                      <p className="text-sm sm:text-base text-gray-100 leading-relaxed">
                        &ldquo;Subi o servidor privado da partida. A senha da sala é 4829-zvc.&rdquo;
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="transit"
                      initial={
                        prefersReducedMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: 'blur(2px)' }
                      }
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      exit={
                        prefersReducedMotion
                          ? { opacity: 0 }
                          : { opacity: 0, filter: 'blur(2px)' }
                      }
                      transition={swapTransition}
                      className="rounded-xl bg-[#090C13] border border-[#3B82F6]/25 p-4 font-mono text-xs text-gray-300 space-y-1.5 overflow-x-auto"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#93C5FD]">
                        <span className="inline-flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          <span>O que o servidor enxerga</span>
                        </span>
                        <span>AES-256-CBC + HMAC</span>
                      </div>
                      <div className="text-gray-400 break-all leading-relaxed">
                        {`{"alg":"m.megolm.v1.aes-sha2","sid":"9fK2mP...q8R","ciphertext":"AwgAEk4x9vQ2mK7pL0x8T3nR5bW1yC6dF9hJ2kM4pS7vX0zA8=="}`}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Chapter 4: Global Push-to-Talk & Markdown */}
        <div className="py-12 md:py-16 pb-0 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 order-2 lg:order-1">
            <div className="rounded-2xl bg-[#0C1018] border border-white/[0.09] p-5 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-6">
              <div>
                <div className="text-xs text-gray-400 mb-3">
                  Clique para testar o atalho global
                </div>
                <button
                  type="button"
                  onClick={() => setPttActive((v) => !v)}
                  aria-pressed={pttActive}
                  className="pub-press inline-flex items-center gap-2 cursor-pointer select-none text-left"
                >
                  {['Ctrl', 'Shift', 'M'].map((keyLabel) => (
                    <kbd
                      key={keyLabel}
                      className={`inline-flex items-center justify-center min-w-[44px] h-11 px-3 rounded-xl font-mono text-sm font-semibold border transition-colors duration-150 ${
                        pttActive
                          ? 'bg-[#2563EB] text-white border-[#60A5FA] shadow-[0_2px_0_0_#1E40AF]'
                          : 'bg-[#141A27] text-gray-100 border-white/15 shadow-[0_4px_0_0_rgba(0,0,0,0.6)]'
                      }`}
                    >
                      {keyLabel}
                    </kbd>
                  ))}
                </button>
              </div>

              <div className="sm:border-l sm:border-white/[0.08] sm:pl-6 flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-150 ${
                    pttActive
                      ? 'bg-[#22C55E]/20 text-[#22C55E]'
                      : 'bg-white/[0.05] text-gray-400'
                  }`}
                >
                  {pttActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {pttActive ? 'Transmitindo voz' : 'Microfone em espera'}
                  </div>
                  <div className="font-mono text-xs text-gray-400">
                    {pttActive ? 'PTT ativo em qualquer janela' : 'Atalho global no desktop'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 order-1 lg:order-2">
            <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-white leading-tight text-balance">
              Atalhos globais de teclado e chat com Markdown
            </h3>
            <p className="mt-3.5 text-base text-gray-300 leading-relaxed max-w-[48ch]">
              Ative push-to-talk ou silencie o áudio mesmo com um jogo em tela cheia. No texto, compartilhe blocos de código, spoilers e mídia com prévia instantânea.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-gray-400">
              <span>Global Shortcuts</span>
              <span>Markdown + Code</span>
              <span>Spoilers & Mídia</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
