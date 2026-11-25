import React from 'react';
import {
  Download,
  Headphones,
  Smile,
  ChevronDown,
  Hash,
  Volume2,
  Mic,
  MicOff,
  Settings,
  Plus,
} from 'lucide-react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';
import { HeadphonesOff } from '../Common/HeadphonesOff';
import { VoiceControlBar } from '../Voice/VoiceControlBar';
import { PublicNavbar } from './PublicNavbar';

interface LandingPageProps {
  onNavigate: (path: string) => void;
  user?: any;
}

const MOCK_CHANNELS = {
  geral: {
    title: 'geral',
    topic: 'Canal principal da comunidade',
    messages: [
      {
        initial: 'A',
        color: 'bg-indigo-500',
        author: 'Alexandre',
        time: 'Hoje às 11:42',
        text: 'O ZeroVC tá rodando liso demais. A voz não tem atraso nenhum.',
      },
      {
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
        initial: 'V',
        color: 'bg-brand-600',
        author: 'Você',
        time: 'Hoje às 09:15',
        text: 'Captura nativa de áudio do sistema a 60 FPS liberada no app desktop.',
      },
      {
        initial: 'L',
        color: 'bg-amber-500',
        author: 'Lucas',
        time: 'Hoje às 10:02',
        text: 'Testei no Linux com AppImage e conectou instantâneo na sala.',
      },
    ],
  },
  voz: {
    title: 'Sala Principal',
    topic: 'Áudio 48 kHz com baixa latência',
    messages: [
      {
        initial: 'A',
        color: 'bg-indigo-500',
        author: 'Alexandre',
        time: 'Agora',
        text: 'Entrando na chamada. Quem vai fechar o grupo?',
      },
      {
        initial: 'M',
        color: 'bg-emerald-500',
        author: 'Marina',
        time: 'Agora',
        text: 'Já abri a transmissão da tela aqui, pode entrar.',
      },
    ],
  },
} as const;

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, user }) => {
  const [os, setOs] = React.useState<'android' | 'windows' | 'linux' | 'ios' | 'other'>('windows');
  const [activeMockChannel, setActiveMockChannel] = React.useState<'geral' | 'novidades' | 'voz'>('geral');
  const [mockMuted, setMockMuted] = React.useState(false);
  const [mockDeafened, setMockDeafened] = React.useState(false);
  const [mockCameraOn, setMockCameraOn] = React.useState(false);
  const [mockScreensharing, setMockScreensharing] = React.useState(false);

  React.useEffect(() => {
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

  return (
    <div className="min-h-screen w-full bg-background-darkest text-gray-100 flex flex-col font-sans selection:bg-brand-500/30 selection:text-white overflow-x-hidden">
      {/* Subtle architectural atmosphere bleeding from y=0 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(59,130,246,0.18),transparent)]"
      />

      {/* Navbar */}
      <PublicNavbar
        onNavigate={onNavigate}
        user={user}
        activePage="landing"
        transparentAtTop
      />

      {/* Hero + Interactive Product Stage */}
      <section className="relative pt-14 pb-20 md:pt-20 md:pb-24 px-6 max-w-6xl mx-auto w-full flex flex-col items-center text-center">
        <h1 className="text-[clamp(2.5rem,6.5vw,5.25rem)] font-extrabold tracking-[-0.04em] text-white leading-[0.96] max-w-4xl">
          Voz cristalina. Latência zero.
        </h1>

        <p className="mt-6 text-base text-gray-300 max-w-[54ch] leading-relaxed">
          Chamadas de voz em tempo real, compartilhamento de tela fluido e chat criptografado sem pesar na sua máquina.
        </p>

        <div className="mt-8 mb-14 flex items-center justify-center">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-base transition-colors duration-150 cursor-pointer shadow-[0_12px_32px_-8px_rgba(37,99,235,0.55)]"
          >
            <Download className="w-5 h-5" />
            <span>{downloadCtaLabel}</span>
          </button>
        </div>

        {/* Interactive Stage Preview */}
        <div className="w-full rounded-2xl bg-[#181a1f] border border-white/10 shadow-[0_28px_80px_-20px_rgba(0,0,0,0.85)] overflow-hidden text-left">
          <div className="h-9 bg-[#14161b] border-b border-white/[0.06] px-4 flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
              <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
              <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
              <span className="text-sm font-semibold text-gray-400 ml-2">ZeroVC</span>
            </div>
            <span className="text-sm text-gray-400 hidden sm:inline">Prévia interativa</span>
          </div>

          <div className="flex aspect-[16/10] sm:aspect-[16/9] overflow-hidden">
            {/* Left Sidebars */}
            <div className="hidden sm:flex flex-col h-full bg-[#1b1d22] border-r border-white/[0.06] flex-shrink-0">
              <div className="flex-1 flex overflow-hidden">
                {/* Guild Rail */}
                <div className="w-16 bg-[#14161b] py-3 flex flex-col items-center gap-2.5 select-none border-r border-white/[0.05]">
                  <div className="w-11 h-11 rounded-2xl bg-[#262930] flex items-center justify-center">
                    <ZeroVCLogo className="w-6 h-6" />
                  </div>
                  <div className="w-7 h-px bg-white/10" />
                  <div className="relative flex items-center justify-center">
                    <div className="absolute -left-3 w-1 h-7 bg-white rounded-r-full" />
                    <div className="w-11 h-11 rounded-2xl bg-brand-600 flex items-center justify-center text-sm font-bold text-white">
                      ZC
                    </div>
                  </div>
                </div>

                {/* Channels Sidebar */}
                <div className="w-56 bg-[#1e2026] flex flex-col justify-between overflow-hidden">
                  <div>
                    <div className="h-12 border-b border-white/[0.06] px-4 flex items-center justify-between font-semibold text-gray-100 text-sm">
                      <span className="truncate">Comunidade ZeroVC</span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </div>

                    <div className="p-2.5 space-y-4">
                      <div>
                        <div className="text-sm font-medium text-gray-400 px-2 mb-1.5">
                          Canais de texto
                        </div>
                        <div className="space-y-1 text-sm">
                          <button
                            type="button"
                            onClick={() => setActiveMockChannel('geral')}
                            className={`w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors duration-150 cursor-pointer ${
                              activeMockChannel === 'geral'
                                ? 'bg-white/10 text-white font-semibold'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                            }`}
                          >
                            <Hash className="w-4 h-4 flex-shrink-0" />
                            <span>geral</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveMockChannel('novidades')}
                            className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors duration-150 cursor-pointer ${
                              activeMockChannel === 'novidades'
                                ? 'bg-white/10 text-white font-semibold'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Hash className="w-4 h-4 flex-shrink-0" />
                              <span>novidades</span>
                            </span>
                            {activeMockChannel !== 'novidades' && (
                              <span className="w-2 h-2 rounded-full bg-brand-500" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-medium text-gray-400 px-2 mb-1.5">
                          Canais de voz
                        </div>
                        <div className="space-y-1.5 text-sm">
                          <button
                            type="button"
                            onClick={() => setActiveMockChannel('voz')}
                            className={`w-full px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-between transition-colors duration-150 cursor-pointer ${
                              activeMockChannel === 'voz'
                                ? 'text-online bg-online/15'
                                : 'text-online bg-online/10 hover:bg-online/15'
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <Volume2 className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">Sala Principal</span>
                            </span>
                            <span className="tabular-nums text-sm font-medium text-online">2</span>
                          </button>

                          <div className="pl-5 space-y-1.5 text-sm text-gray-300">
                            <div className="flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold">
                                A
                              </span>
                              <span className="truncate">Alexandre</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-semibold">
                                M
                              </span>
                              <span className="truncate">Marina</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* UserBar Footer */}
              <div className="p-2 bg-[#16181d] border-t border-white/[0.06]">
                <div className="w-full bg-[#111216] rounded-xl px-2.5 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="relative w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      <span>V</span>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-online border-2 border-[#111216]" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-white truncate leading-tight">Você</span>
                      <span className="text-xs text-gray-400 truncate leading-tight">
                        {mockDeafened ? 'Áudio desativado' : mockMuted ? 'Microfone mutado' : 'Disponível'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-gray-400 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setMockMuted((v) => !v)}
                      aria-label={mockMuted || mockDeafened ? 'Ativar microfone na prévia' : 'Silenciar microfone na prévia'}
                      aria-pressed={mockMuted || mockDeafened}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                        mockMuted || mockDeafened
                          ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
                          : 'hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {mockMuted || mockDeafened ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMockDeafened((v) => !v)}
                      aria-label={mockDeafened ? 'Reativar áudio na prévia' : 'Desativar áudio na prévia'}
                      aria-pressed={mockDeafened}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                        mockDeafened
                          ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
                          : 'hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {mockDeafened ? <HeadphonesOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
                    </button>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500">
                      <Settings className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Area: VoiceRoom for Sala Principal, Chat for text channels */}
            {activeMockChannel === 'voz' ? (
              <div className="flex-1 bg-[#1e2026] flex flex-col justify-between overflow-hidden">
                <div className="h-12 border-b border-white/[0.06] px-4 flex items-center gap-2.5 flex-shrink-0">
                  <Volume2 className="w-5 h-5 text-online flex-shrink-0" />
                  <span className="font-semibold text-white text-sm">Sala Principal</span>
                  <span className="text-xs text-gray-400 tabular-nums">(2)</span>
                </div>

                <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col items-center justify-center gap-4">
                  <div className="grid grid-cols-2 gap-3 w-full max-w-xl">
                    <div className="relative aspect-video rounded-2xl bg-[#26282e] border-2 border-online flex items-center justify-center overflow-hidden">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold text-base">
                        A
                      </div>
                      <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/60 text-xs font-semibold text-white flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-online" />
                        <span>Alexandre</span>
                      </div>
                    </div>

                    <div className="relative aspect-video rounded-2xl bg-[#26282e] border border-white/10 flex items-center justify-center overflow-hidden">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold text-base">
                        M
                      </div>
                      <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/60 text-xs font-semibold text-white flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-gray-300" />
                        <span>Marina</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pb-4 flex justify-center flex-shrink-0">
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
                      onDisconnect: () => setActiveMockChannel('geral'),
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 bg-[#26282e] flex flex-col justify-between overflow-hidden">
                  <div className="h-12 border-b border-white/[0.06] px-4 flex items-center gap-2.5 flex-shrink-0">
                    <Hash className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className="font-semibold text-white text-sm">{MOCK_CHANNELS[activeMockChannel].title}</span>
                    <span className="text-gray-400 hidden sm:inline text-sm truncate">
                      {MOCK_CHANNELS[activeMockChannel].topic}
                    </span>
                  </div>

                  <div className="flex-1 p-5 space-y-5 overflow-hidden">
                    {MOCK_CHANNELS[activeMockChannel].messages.map((msg, i) => (
                      <div key={i} className="flex gap-3.5 items-start">
                        <div className={`w-9 h-9 rounded-full ${msg.color} flex items-center justify-center text-sm font-semibold text-white flex-shrink-0`}>
                          {msg.initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2.5">
                            <span className="text-sm font-semibold text-white">{msg.author}</span>
                            <span className="text-xs text-gray-400 tabular-nums">{msg.time}</span>
                          </div>
                          <p className="text-sm text-gray-200 mt-1 leading-relaxed">
                            {msg.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 pt-0">
                    <div className="h-11 bg-[#31333b] rounded-xl px-3.5 flex items-center justify-between text-sm text-gray-400 select-none">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-gray-300">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                        <span className="truncate">Conversar em #{MOCK_CHANNELS[activeMockChannel].title}...</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-gray-400">
                        <Smile className="w-4 h-4" />
                        <Mic className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* MemberList Sidebar */}
                <aside className="hidden lg:flex w-52 bg-[#1e2026] border-l border-white/[0.06] flex-col p-3 gap-5 overflow-hidden flex-shrink-0 select-none">
                  <div>
                    <div className="text-xs font-medium text-gray-400 px-2 mb-2 tabular-nums">
                      Disponível (3)
                    </div>
                    <div className="space-y-1">
                      {[
                        { name: 'Alexandre', initial: 'A', color: 'bg-indigo-500', status: 'Em chamada' },
                        { name: 'Marina', initial: 'M', color: 'bg-emerald-500', status: 'Transmitindo tela' },
                        {
                          name: 'Você',
                          initial: 'V',
                          color: 'bg-brand-600',
                          status: mockDeafened ? 'Áudio desativado' : mockMuted ? 'Mutado' : 'Online',
                        },
                      ].map((member) => (
                        <div
                          key={member.name}
                          className="px-2 py-1.5 rounded-lg flex items-center gap-2.5 hover:bg-white/[0.04] transition-colors duration-150"
                        >
                          <div className={`relative w-8 h-8 rounded-full ${member.color} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}>
                            <span>{member.initial}</span>
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-online border-2 border-[#1e2026]" />
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
                    <div className="text-xs font-medium text-gray-400 px-2 mb-2 tabular-nums">
                      Offline (1)
                    </div>
                    <div className="px-2 py-1.5 rounded-lg flex items-center gap-2.5 opacity-55">
                      <div className="relative w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        <span>L</span>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-offline border-2 border-[#1e2026]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-300 truncate leading-tight">
                          Lucas
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Feature Editorial Section */}
      <section id="recursos" className="py-20 md:py-28 px-6 max-w-6xl mx-auto w-full border-t border-white/[0.08]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          <div className="lg:col-span-5">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-white leading-tight">
              Construído para voz sem atraso e foco total.
            </h2>
            <p className="mt-4 text-base text-gray-300 leading-relaxed max-w-[46ch]">
              Projetado para chamadas contínuas, compartilhamento de tela em alta taxa de quadros e mensagens protegidas sem consumir memória à toa.
            </p>
          </div>

          <div className="lg:col-span-7 divide-y divide-white/[0.08] border-t lg:border-t-0 border-white/[0.08]">
            <div className="py-6 first:pt-0">
              <h3 className="text-base font-semibold text-white">
                Áudio cristalino com resposta instantânea
              </h3>
              <p className="mt-2 text-base text-gray-300 leading-relaxed max-w-[60ch]">
                Voz em 48 kHz com ajuste automático de qualidade e redução de ruído para conversar sem cortes, atraso ou eco.
              </p>
            </div>

            <div className="py-6">
              <h3 className="text-base font-semibold text-white">
                Transmissão de tela a 60 FPS com som do sistema
              </h3>
              <p className="mt-2 text-base text-gray-300 leading-relaxed max-w-[60ch]">
                Compartilhe sua janela ou jogo em até 60 quadros por segundo com captura nativa de áudio estéreo no aplicativo desktop.
              </p>
            </div>

            <div className="py-6">
              <h3 className="text-base font-semibold text-white">
                Criptografia ponta a ponta
              </h3>
              <p className="mt-2 text-base text-gray-300 leading-relaxed max-w-[60ch]">
                Suas mensagens são cifradas no dispositivo antes do envio. Só você e quem participa da conversa têm acesso às chaves.
              </p>
            </div>

            <div className="py-6 last:pb-0">
              <h3 className="text-base font-semibold text-white">
                Push-to-talk global e chat com Markdown
              </h3>
              <p className="mt-2 text-base text-gray-300 leading-relaxed max-w-[60ch]">
                Alterne microfone e áudio por atalhos globais de teclado ou mouse, e envie blocos de código, spoilers e mídia com prévia imediata.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-20 px-6 max-w-6xl mx-auto w-full border-t border-white/[0.08]">
        <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 px-8 py-14 sm:px-14 sm:py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="max-w-xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-white leading-tight">
              Pronto para conversar sem travamentos?
            </h2>
            <p className="mt-3 text-base text-white/85 leading-relaxed max-w-[50ch]">
              Baixe o aplicativo para o seu dispositivo ou entre direto pelo navegador sem instalar nada.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="flex-shrink-0 flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-white text-gray-900 hover:bg-gray-100 font-semibold text-base transition-colors duration-150 cursor-pointer"
          >
            <Download className="w-5 h-5 text-brand-600" />
            <span>{downloadCtaLabel}</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.06] py-8 px-6 text-sm text-gray-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ZeroVCLogo className="w-6 h-6 flex-shrink-0" />
            <span className="font-semibold text-white">ZeroVC</span>
            <span className="text-gray-500 tabular-nums">© 2026</span>
          </div>

          <div className="flex items-center gap-6">
            <button type="button" onClick={() => onNavigate('/')} className="hover:text-white transition-colors duration-150 cursor-pointer">
              Início
            </button>
            <button type="button" onClick={() => onNavigate('/download')} className="hover:text-white transition-colors duration-150 cursor-pointer">
              Download
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
