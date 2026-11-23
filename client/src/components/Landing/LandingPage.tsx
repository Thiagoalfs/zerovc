import React from 'react';
import {
  Download,
  Globe,
  ArrowRight,
  Headphones,
  Smile,
  ChevronDown,
  Hash,
  Volume2,
  Mic,
  MicOff,
  Settings,
  Plus,
  Lock,
} from 'lucide-react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';
import { HeadphonesOff } from '../Common/HeadphonesOff';

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
        text: 'O ZeroVC tá rodando liso demais! A voz não tem atraso nenhum 🚀',
      },
      {
        initial: 'M',
        color: 'bg-emerald-500',
        author: 'Marina',
        time: 'Hoje às 11:43',
        text: 'E o compartilhamento de tela a 60fps ficou perfeito pro gameplay!',
      },
    ],
  },
  novidades: {
    title: 'novidades',
    topic: 'Atualizações e notas de versão do ZeroVC',
    messages: [
      {
        initial: 'Z',
        color: 'bg-brand-600',
        author: 'ZeroVC Bot',
        time: 'Hoje às 09:15',
        text: 'Captura nativa de áudio WASAPI em 60 FPS liberada no app desktop.',
      },
      {
        initial: 'L',
        color: 'bg-amber-500',
        author: 'Lucas',
        time: 'Hoje às 10:02',
        text: 'Testei no Linux com AppImage e conectou instantâneo na sala!',
      },
    ],
  },
  voz: {
    title: 'Sala Principal',
    topic: 'Áudio 48 kHz • Baixa latência via LiveKit',
    messages: [
      {
        initial: 'A',
        color: 'bg-indigo-500',
        author: 'Alexandre',
        time: 'Agora',
        text: 'Entrando na call — quem vai fechar squad?',
      },
      {
        initial: 'M',
        color: 'bg-emerald-500',
        author: 'Marina',
        time: 'Agora',
        text: 'Já abri a stream da tela aqui, só colar!',
      },
    ],
  },
} as const;

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, user }) => {
  const [os, setOs] = React.useState<'android' | 'windows' | 'linux' | 'ios' | 'other'>('windows');
  const [activeMockChannel, setActiveMockChannel] = React.useState<'geral' | 'novidades' | 'voz'>('geral');
  const [mockMuted, setMockMuted] = React.useState(false);
  const [mockDeafened, setMockDeafened] = React.useState(false);

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

  return (
    <div className="min-h-screen w-full bg-background-darkest text-gray-100 flex flex-col font-sans selection:bg-brand-500/30 selection:text-white">

      {/* -------------------------------------------------------------
          1. NAVBAR
      ------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background-darkest/80 border-b border-white/5 px-6 py-4 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div
            onClick={() => onNavigate('/')}
            className="flex items-center gap-2.5 cursor-pointer group select-none"
          >
            <ZeroVCLogo className="w-10 h-10 group-hover:scale-105 transition-transform" />
            <span className="text-xl font-bold tracking-tight text-white">
              ZeroVC
            </span>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-4 sm:gap-8 text-sm font-medium text-gray-300">
            <a href="#features" className="hidden sm:inline hover:text-white transition-colors">
              Recursos
            </a>
            <button
              onClick={() => onNavigate('/download')}
              className="hover:text-brand-400 transition-colors cursor-pointer"
            >
              Download
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {user ? (
              <button
                onClick={() => onNavigate('/@me')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <span>Abrir Chat (@{user.username})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => onNavigate('/signin')}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                >
                  Entrar
                </button>
                <button
                  onClick={() => onNavigate('/signup')}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  Criar Conta
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------
          2. HERO SECTION
      ------------------------------------------------------------- */}
      <section className="relative pt-20 pb-16 md:pt-28 md:pb-24 px-6 text-center max-w-5xl mx-auto flex flex-col items-center">

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
          Voz cristalina. Latência zero.
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
          Uma plataforma moderna, rápida e ultra-leve de comunicação em tempo real. Chamadas de voz cristalinas,
          compartilhamento de tela fluido e chat completo sem sobrecarregar sua máquina.
        </p>

        {/* CTA Button Group */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto justify-center mb-16">
          <button
            onClick={handleDownload}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-base transition-colors cursor-pointer group"
          >
            <Download className="w-5 h-5" />
            <span>
              {os === 'android' && 'Baixar para Android'}
              {os === 'windows' && 'Baixar para Windows'}
              {os === 'linux' && 'Baixar para Linux'}
              {os === 'ios' && 'Instalar no iOS'}
              {os === 'other' && 'Baixar o Aplicativo'}
            </span>
          </button>

          <button
            onClick={() => onNavigate('/@me')}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-100 font-semibold text-base border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
          >
            <Globe className="w-5 h-5 text-gray-400" />
            <span>Abrir no Navegador</span>
          </button>
        </div>

        {/* -------------------------------------------------------------
            3. PRODUCT SHOWCASE MOCKUP
        ------------------------------------------------------------- */}
        <div className="w-full max-w-5xl rounded-3xl p-2 bg-white/5 border border-white/10">
          <div className="w-full bg-[#1e1f22] rounded-2xl overflow-hidden border border-white/5 flex flex-col aspect-[16/10] sm:aspect-[16/9] relative text-left">
            {/* Mock Titlebar */}
            <div className="h-9 bg-[#1e1f22] border-b border-black/30 px-4 flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                <span className="text-xs font-semibold text-gray-400 ml-2">ZeroVC • Comunidade</span>
              </div>
            </div>

            {/* Mock Body */}
            <div className="flex-1 flex overflow-hidden">
              {/* Sidebars Left Column (ServerList + ChannelList + Unified UserBar) */}
              <div className="hidden sm:flex flex-col h-full bg-[#1e1f22] border-r border-black/30 flex-shrink-0">
                {/* Top: ServerList & ChannelList */}
                <div className="flex-1 flex overflow-hidden">
                  {/* Guilds bar */}
                  <div className="w-16 bg-[#1e1f22] py-3 flex flex-col items-center gap-2 select-none border-r border-black/10">
                    <div className="relative group flex items-center justify-center">
                      <div className="w-11 h-11 rounded-[24px] hover:rounded-2xl bg-[#2b2d31] hover:bg-brand-500 text-gray-200 flex items-center justify-center transition-all cursor-pointer">
                        <ZeroVCLogo className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="w-8 h-0.5 bg-white/10 rounded-full my-1" />
                    <div className="relative group flex items-center justify-center">
                      <div className="absolute -left-3 w-1.5 h-8 bg-white rounded-r-full" />
                      <div className="w-11 h-11 rounded-2xl bg-brand-600 flex items-center justify-center text-xs font-semibold text-white transition-all">
                        ZC
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-[#2b2d31] hover:bg-brand-500 transition-all flex items-center justify-center text-base">
                      🎮
                    </div>
                  </div>

                  {/* Channels Sidebar */}
                  <div className="w-52 bg-[#2b2d31] flex flex-col justify-between overflow-hidden">
                    <div>
                      {/* Server Header */}
                      <div className="h-12 border-b border-black/20 px-4 flex items-center justify-between font-semibold text-gray-100 text-sm">
                        <span className="truncate">ZeroVC HQ</span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </div>

                      {/* Channels list */}
                      <div className="p-2 space-y-3">
                        <div>
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">
                            Canais de Texto
                          </div>
                          <div className="space-y-0.5 text-xs font-medium">
                            <button
                              type="button"
                              onClick={() => setActiveMockChannel('geral')}
                              className={`w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
                                activeMockChannel === 'geral'
                                  ? 'bg-white/10 text-white'
                                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                              }`}
                            >
                              <Hash className={`w-4 h-4 ${activeMockChannel === 'geral' ? 'text-gray-300' : 'text-gray-500'}`} />
                              <span className={activeMockChannel === 'geral' ? 'font-semibold' : ''}>geral</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveMockChannel('novidades')}
                              className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                                activeMockChannel === 'novidades'
                                  ? 'bg-white/10 text-white'
                                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Hash className={`w-4 h-4 ${activeMockChannel === 'novidades' ? 'text-gray-300' : 'text-gray-500'}`} />
                                <span className={activeMockChannel === 'novidades' ? 'font-semibold' : ''}>novidades</span>
                              </div>
                              {activeMockChannel !== 'novidades' && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">
                            Canais de Voz
                          </div>
                          <div className="space-y-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => setActiveMockChannel('voz')}
                              className={`w-full px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-between transition-colors cursor-pointer ${
                                activeMockChannel === 'voz'
                                  ? 'text-online bg-online/15 border border-online/30'
                                  : 'text-online bg-online/10 border border-online/20 hover:bg-online/15'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Volume2 className="w-4 h-4 text-online" />
                                <span>Sala Principal</span>
                              </div>
                              <span className="text-[10px] font-mono font-medium bg-online/20 px-1.5 py-0.5 rounded text-online">3/∞</span>
                            </button>
                            {/* Connected voice participants preview */}
                            <div className="pl-6 pt-1 space-y-1">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
                                <div className="w-4 h-4 rounded-full bg-indigo-500 ring-1 ring-online flex items-center justify-center text-[9px] font-semibold text-white">A</div>
                                <span className="truncate">Alexandre</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
                                <div className="w-4 h-4 rounded-full bg-emerald-500 ring-1 ring-online flex items-center justify-center text-[9px] font-semibold text-white">M</div>
                                <span className="truncate">Marina</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Unified UserBar Footer */}
                <div className="p-2 bg-[#1e1f22] border-t border-black/20">
                  <div className="w-full bg-[#111214] border border-white/5 rounded-2xl px-2.5 py-1.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="relative w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                        <span>U</span>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-online border-2 border-[#111214]" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1 truncate">
                        <span className="text-[13px] font-semibold text-white truncate leading-tight">Você</span>
                        <span className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">
                          {mockDeafened ? 'Áudio desativado' : mockMuted ? 'Microfone mutado' : 'Disponível'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 text-gray-400 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setMockMuted((v) => !v)}
                        aria-label={mockMuted || mockDeafened ? 'Ativar microfone na prévia' : 'Silenciar microfone na prévia'}
                        aria-pressed={mockMuted || mockDeafened}
                        title={mockMuted || mockDeafened ? 'Ativar microfone' : 'Silenciar microfone'}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                          mockMuted || mockDeafened
                            ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
                            : 'hover:bg-white/10 hover:text-gray-200'
                        }`}
                      >
                        {mockMuted || mockDeafened ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMockDeafened((v) => !v)}
                        aria-label={mockDeafened ? 'Reativar áudio na prévia' : 'Desativar áudio na prévia'}
                        aria-pressed={mockDeafened}
                        title={mockDeafened ? 'Reativar áudio' : 'Desativar áudio'}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                          mockDeafened
                            ? 'text-red-400 bg-red-500/15 hover:bg-red-500/25'
                            : 'hover:bg-white/10 hover:text-gray-200'
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

              {/* Main Chat Area Mockup */}
              <div className="flex-1 bg-[#313338] flex flex-col justify-between overflow-hidden">
                {/* Chat Header */}
                <div className="h-12 border-b border-black/20 px-4 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2 truncate">
                    {activeMockChannel === 'voz' ? (
                      <Volume2 className="w-5 h-5 text-online" />
                    ) : (
                      <Hash className="w-5 h-5 text-gray-400" />
                    )}
                    <span className="font-semibold text-gray-100 text-sm">{MOCK_CHANNELS[activeMockChannel].title}</span>
                    <span className="text-gray-600 hidden sm:inline">|</span>
                    <span className="text-xs text-gray-400 hidden sm:inline truncate">{MOCK_CHANNELS[activeMockChannel].topic}</span>
                  </div>
                </div>

                {/* Messages List */}
                <div className="flex-1 p-4 space-y-4 overflow-hidden">
                  {MOCK_CHANNELS[activeMockChannel].messages.map((msg, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className={`w-9 h-9 rounded-full ${msg.color} flex items-center justify-center text-xs font-semibold text-white flex-shrink-0`}>
                        {msg.initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold text-white">{msg.author}</span>
                          <span className="text-[10px] text-gray-400">{msg.time}</span>
                        </div>
                        <div className="text-xs text-gray-200 mt-0.5 leading-relaxed">
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chat Input Bar */}
                <div className="p-4 pt-0">
                  <div className="h-11 bg-[#383a40] rounded-xl px-3 flex items-center justify-between text-xs text-gray-400 select-none">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white cursor-pointer">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">Conversar em #geral...</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <Smile className="w-4 h-4 hover:text-white cursor-pointer" />
                      <span className="px-1.5 py-0.5 rounded-[4px] border border-current text-[10px] font-semibold tracking-wider leading-none select-none">
                        GIF
                      </span>
                      <Mic className="w-4 h-4 hover:text-white cursor-pointer" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------
          4. FEATURES SECTION (Bento Grid)
      ------------------------------------------------------------- */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
            Construído para latência zero e foco total.
          </h2>
          <p className="text-base sm:text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Feito para chamadas em tempo real, compartilhamento de tela e mensagens protegidas — leve no consumo e sem rastreamento.
          </p>
        </div>

        {/* Features Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* CARD 1 */}
          <div className="md:col-span-2 rounded-2xl bg-[#22242b] border border-white/10 hover:border-white/20 p-7 sm:p-8 flex flex-col justify-between gap-5 transition-all duration-200">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Voz cristalina com resposta instantânea</h3>
              <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
                Áudio em 48 kHz com ajuste automático de qualidade e redução de ruído para chamadas sem cortes, atraso ou eco.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/5 text-xs font-mono text-gray-400">
              <span className="inline-flex items-center gap-1.5 text-online">
                <span className="w-2 h-2 rounded-full bg-online" />
                Baixa Latência
              </span>
              <span>•</span>
              <span>48 kHz Estéreo</span>
              <span>•</span>
              <span>Redução de Ruído</span>
            </div>
          </div>

          {/* CARD 2 */}
          <div className="rounded-2xl bg-[#22242b] border border-white/10 hover:border-white/20 p-7 flex flex-col justify-between gap-4 transition-all duration-200">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Stream a 60 FPS com som do sistema</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Transmita sua tela ou jogo em até 60 FPS com o áudio do sistema em estéreo no app desktop.
              </p>
            </div>
            <div className="text-xs font-mono text-brand-400 pt-2 border-t border-white/5">
              1080p • 60 FPS • Áudio do Sistema
            </div>
          </div>

          {/* CARD 3 */}
          <div className="rounded-2xl bg-[#22242b] border border-white/10 hover:border-white/20 p-7 flex flex-col justify-between gap-4 transition-all duration-200">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Criptografia Ponta a Ponta</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Suas mensagens são cifradas antes de sair do dispositivo. Só você e quem participa da conversa têm as chaves.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 pt-2 border-t border-white/5">
              <Lock className="w-3.5 h-3.5" />
              <span>Chaves locais • E2EE</span>
            </div>
          </div>

          {/* CARD 4 */}
          <div className="rounded-2xl bg-[#22242b] border border-white/10 hover:border-white/20 p-7 flex flex-col justify-between gap-4 transition-all duration-200">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Markdown, código e reações</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Blocos de código com destaque, spoilers, busca de GIFs e prévias instantâneas de imagens e vídeos direto no chat.
              </p>
            </div>
            <div className="text-xs font-mono text-gray-400 pt-2 border-t border-white/5">
              Código • Spoiler • GIFs
            </div>
          </div>

          {/* CARD 5 */}
          <div className="rounded-2xl bg-[#22242b] border border-white/10 hover:border-white/20 p-7 flex flex-col justify-between gap-4 transition-all duration-200">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Push-to-talk global</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Ative ou silencie o microfone e o áudio usando atalhos de teclado ou botões do mouse, mesmo com o app minimizado.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-gray-300 pt-2 border-t border-white/5">
              <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/15">Mouse4</kbd>
              <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/15">Ctrl+M</kbd>
            </div>
          </div>

        </div>
      </section>

      {/* -------------------------------------------------------------
          5. CTA DOWNLOAD BANNER
      ------------------------------------------------------------- */}
      <section className="py-16 px-6 max-w-5xl mx-auto w-full">
        <div className="rounded-3xl bg-brand-600 p-8 sm:p-12 text-center text-white relative overflow-hidden">
          <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              Pronto para elevar suas conversas a outro nível?
            </h2>
            <p className="text-white/80 text-base leading-relaxed">
              {os === 'linux' && 'Baixe o aplicativo para Linux ou entre direto pelo navegador sem instalar nada.'}
              {os === 'android' && 'Baixe o aplicativo para Android ou entre direto pelo navegador sem instalar nada.'}
              {os === 'windows' && 'Baixe o aplicativo para Windows ou entre direto pelo navegador sem instalar nada.'}
              {(os === 'ios' || os === 'other') && 'Baixe o aplicativo ou entre direto pelo navegador sem instalar nada.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <button
                onClick={handleDownload}
                className="px-8 py-3.5 rounded-2xl bg-white text-gray-900 font-bold hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5 text-brand-600" />
                <span>
                  {os === 'linux' && 'Baixar Instalador Linux'}
                  {os === 'windows' && 'Baixar Instalador Windows'}
                  {os === 'android' && 'Baixar para Android'}
                  {os === 'ios' && 'Instalar no iOS'}
                  {os === 'other' && 'Baixar o Aplicativo'}
                </span>
              </button>
              <button
                onClick={() => onNavigate(user ? '/@me' : '/signup')}
                className="px-8 py-3.5 rounded-2xl bg-brand-700/60 hover:bg-brand-700 text-white font-semibold border border-white/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{user ? 'Abrir Chat' : 'Criar Conta Grátis'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------
          6. FOOTER
      ------------------------------------------------------------- */}
      <footer className="mt-auto border-t border-white/5 py-10 px-6 bg-[#090d12] text-sm text-gray-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <ZeroVCLogo className="w-7 h-7 flex-shrink-0" />
            <span className="font-bold text-white">ZeroVC</span>
            <span className="text-xs text-gray-500">© 2026 • Todos os direitos reservados</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium">
            <button onClick={() => onNavigate('/')} className="hover:text-white transition-colors cursor-pointer">
              Início
            </button>
            <button onClick={() => onNavigate('/download')} className="hover:text-white transition-colors cursor-pointer">
              Download
            </button>
            <button onClick={() => onNavigate('/signin')} className="hover:text-white transition-colors cursor-pointer">
              Entrar
            </button>
            <button onClick={() => onNavigate('/signup')} className="hover:text-white transition-colors cursor-pointer">
              Criar Conta
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
