import React from 'react';
import {
  Download,
  Globe,
  Radio,
  Monitor,
  ShieldCheck,
  Users,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Headphones,
  Sliders,
  Smile,
  ChevronRight,
  ChevronDown,
  Hash,
  Volume2,
  Mic,
  Settings,
  Plus,
} from 'lucide-react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';

interface LandingPageProps {
  onNavigate: (path: string) => void;
  user?: any;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, user }) => {
  const [os, setOs] = React.useState<'android' | 'windows' | 'ios' | 'other'>('windows');

  React.useEffect(() => {
    const ua = (navigator.userAgent || '').toLowerCase();
    if (/android/i.test(ua)) setOs('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setOs('ios');
    else if (/windows|win32|win64/i.test(ua)) setOs('windows');
    else setOs('other');
  }, []);

  return (
    <div className="min-h-screen w-full bg-background-darkest text-gray-100 flex flex-col font-sans selection:bg-brand-500/30 selection:text-white">
      {/* Background Ambient Glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] bg-gradient-to-b from-brand-600/15 via-brand-500/5 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="fixed top-96 -left-40 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-40 -right-40 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />

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
            <ZeroVCLogo className="w-10 h-10 shadow-lg shadow-brand-500/25 group-hover:scale-105 transition-transform" />
            <span className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
              Zero<span className="text-brand-400">VC</span>
            </span>
          </div>

          {/* Nav Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
            <a href="#features" className="hover:text-white transition-colors">
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-600/30 hover:shadow-brand-500/40 hover:-translate-y-0.5 transition-all cursor-pointer"
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
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/30 hover:shadow-brand-500/40 hover:-translate-y-0.5 transition-all cursor-pointer"
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
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.15] mb-6">
          Converse, jogue e conecte-se com{' '}
          <span className="bg-clip-text bg-gradient-to-r from-brand-400 via-indigo-300 to-emerald-400">
            latência zero.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
          Uma alternativa moderna, ultra-leve e aberta ao Discord. Chamadas de voz cristalinas via WebRTC,
          compartilhamento de tela a 60 FPS, chat rico com Markdown e GIFs sem sobrecarregar sua máquina.
        </p>

        {/* CTA Button Group */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto justify-center mb-16">
          <button
            onClick={() => onNavigate('/download')}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-base shadow-xl shadow-brand-600/35 hover:shadow-brand-500/45 hover:-translate-y-1 transition-all cursor-pointer group"
          >
            <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
            <span>
              {os === 'android' && 'Baixar para Android (.apk)'}
              {os === 'windows' && 'Baixar para Windows (Setup)'}
              {os === 'ios' && 'Instalar no iOS (PWA)'}
              {os === 'other' && 'Baixar o Aplicativo'}
            </span>
          </button>

          <button
            onClick={() => onNavigate(user ? '/@me' : '/signin')}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-100 font-semibold text-base border border-white/10 hover:border-white/20 shadow-lg hover:-translate-y-1 transition-all cursor-pointer"
          >
            <Globe className="w-5 h-5 text-gray-400" />
            <span>Abrir no Navegador</span>
          </button>
        </div>

        {/* -------------------------------------------------------------
            3. PRODUCT SHOWCASE MOCKUP
        ------------------------------------------------------------- */}
        <div className="w-full max-w-5xl rounded-3xl p-2 bg-gradient-to-b from-white/15 via-white/5 to-transparent border border-white/10 shadow-2xl shadow-black/80">
          <div className="w-full bg-[#1e1f22] rounded-2xl overflow-hidden border border-white/5 flex flex-col aspect-[16/10] sm:aspect-[16/9] relative text-left shadow-inner">
            {/* Mock Titlebar */}
            <div className="h-9 bg-[#1e1f22] border-b border-black/30 px-4 flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                <span className="text-xs font-semibold text-gray-400 ml-2">ZeroVC — Comunidade</span>
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
                      <div className="absolute -left-3 w-1.5 h-8 bg-white rounded-r-full" />
                      <div className="w-11 h-11 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-600/30">
                        <ZeroVCLogo className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="w-8 h-0.5 bg-white/10 rounded-full my-1" />
                    <div className="w-11 h-11 rounded-2xl bg-[#2b2d31] hover:bg-brand-500 hover:text-white transition-all flex items-center justify-center text-xs font-bold text-gray-200">
                      ZC
                    </div>
                    <div className="w-11 h-11 rounded-2xl bg-[#2b2d31] hover:bg-brand-500 transition-all flex items-center justify-center text-base">
                      🎮
                    </div>
                  </div>

                  {/* Channels Sidebar */}
                  <div className="w-52 bg-[#2b2d31] flex flex-col justify-between overflow-hidden">
                    <div>
                      {/* Server Header */}
                      <div className="h-12 border-b border-black/20 px-4 flex items-center justify-between font-bold text-gray-100 shadow-sm text-sm">
                        <span className="truncate">ZeroVC HQ</span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </div>

                      {/* Channels list */}
                      <div className="p-2 space-y-3">
                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-1">
                            Canais de Texto
                          </div>
                          <div className="space-y-0.5 text-xs font-medium">
                            <div className="px-2.5 py-1.5 rounded-lg bg-white/10 text-white flex items-center gap-2 shadow-sm">
                              <Hash className="w-4 h-4 text-gray-300" />
                              <span className="font-semibold">geral</span>
                            </div>
                            <div className="px-2.5 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Hash className="w-4 h-4 text-gray-500" />
                                <span>novidades</span>
                              </div>
                              <span className="w-2 h-2 rounded-full bg-brand-500" />
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-1">
                            Canais de Voz
                          </div>
                          <div className="space-y-0.5 text-xs">
                            <div className="px-2.5 py-1.5 rounded-lg text-online bg-online/10 border border-online/20 font-medium flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Volume2 className="w-4 h-4 text-online" />
                                <span>Sala Principal</span>
                              </div>
                              <span className="text-[10px] font-mono font-bold bg-online/20 px-1.5 py-0.5 rounded text-online">3/∞</span>
                            </div>
                            {/* Connected voice participants preview */}
                            <div className="pl-6 pt-1 space-y-1">
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
                                <div className="w-4 h-4 rounded-full bg-indigo-500 ring-1 ring-online flex items-center justify-center text-[9px] font-bold text-white">A</div>
                                <span className="truncate">Alexandre</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
                                <div className="w-4 h-4 rounded-full bg-emerald-500 ring-1 ring-online flex items-center justify-center text-[9px] font-bold text-white">M</div>
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
                <div className="h-14 px-2.5 flex items-center justify-between bg-[#1e1f22] border-t border-black/20 text-xs">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="relative w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      <span>U</span>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-online border-2 border-[#1e1f22]" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1 truncate">
                      <span className="font-bold text-white truncate leading-tight">Você</span>
                      <span className="text-[11px] text-gray-400 truncate leading-tight">Disponível</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 text-gray-400 flex-shrink-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 hover:text-gray-200 transition-colors">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 hover:text-gray-200 transition-colors">
                      <Headphones className="w-4 h-4" />
                    </div>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 hover:text-gray-200 transition-colors">
                      <Settings className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Chat Area Mockup */}
              <div className="flex-1 bg-[#313338] flex flex-col justify-between overflow-hidden">
                {/* Chat Header */}
                <div className="h-12 border-b border-black/20 px-4 flex items-center justify-between shadow-sm flex-shrink-0">
                  <div className="flex items-center gap-2 truncate">
                    <Hash className="w-5 h-5 text-gray-400" />
                    <span className="font-bold text-gray-100 text-sm">geral</span>
                    <span className="text-gray-600 hidden sm:inline">|</span>
                    <span className="text-xs text-gray-400 hidden sm:inline truncate">Canal principal da comunidade</span>
                  </div>
                </div>

                {/* Messages List */}
                <div className="flex-1 p-4 space-y-4 overflow-hidden">
                  {/* Message 1 */}
                  <div className="flex gap-3 items-start">
                    <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
                      A
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold text-white">Alexandre</span>
                        <span className="text-[10px] text-gray-400">Hoje às 11:42</span>
                      </div>
                      <div className="text-xs text-gray-200 mt-0.5 leading-relaxed">
                        O ZeroVC tá rodando liso demais! A voz não tem atraso nenhum 🚀
                      </div>
                    </div>
                  </div>

                  {/* Message 2 */}
                  <div className="flex gap-3 items-start">
                    <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
                      M
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-bold text-white">Marina</span>
                        <span className="text-[10px] text-gray-400">Hoje às 11:43</span>
                      </div>
                      <div className="text-xs text-gray-200 mt-0.5 leading-relaxed">
                        E o compartilhamento de tela a 60fps ficou perfeito pro gameplay!
                      </div>

                      {/* Modern Embed Preview */}
                      <div className="mt-2.5 max-w-sm rounded-xl bg-[#2b2d31] border border-white/10 p-3 flex flex-col gap-2 shadow-lg">
                        <div className="flex items-center gap-2 text-[11px] text-brand-400 font-bold uppercase tracking-wider">
                          <Monitor className="w-3.5 h-3.5" />
                          <span>Transmissão ao Vivo • 60 FPS</span>
                        </div>
                        <div className="text-xs font-bold text-white">CS2 Highlights & Clutch Moments</div>
                        <div className="text-[11px] text-gray-400">1080p @ 60 FPS • Áudio do Sistema • 0% de perda de pacotes</div>
                      </div>

                      {/* Reactions */}
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-brand-500/20 border border-brand-500/40 text-brand-300 text-[11px] font-bold">
                          <span>🔥</span>
                          <span>4</span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px] font-medium">
                          <span>🚀</span>
                          <span>6</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chat Input Bar */}
                <div className="p-4 pt-0">
                  <div className="h-11 bg-[#383a40] rounded-xl px-3 flex items-center justify-between text-xs text-gray-400 select-none shadow-sm">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:text-white cursor-pointer">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">Conversar em #geral...</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-gray-400">
                      <span className="text-[10px] font-bold bg-white/10 px-1.5 py-0.5 rounded text-gray-300">GIF</span>
                      <Smile className="w-4 h-4 hover:text-white cursor-pointer" />
                      <Sparkles className="w-4 h-4 hover:text-brand-400 text-brand-400 cursor-pointer" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------
          4. FEATURES SECTION
      ------------------------------------------------------------- */}
      <section id="features" className="py-20 px-6 max-w-7xl mx-auto border-t border-white/5">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-xs font-bold uppercase tracking-widest text-brand-400 mb-3">Recursos Poderosos</h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Tudo o que você precisa para se comunicar sem interrupções.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="p-7 rounded-3xl bg-background-dark/80 border border-white/5 hover:border-brand-500/30 transition-all duration-300 group hover:-translate-y-1 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-5 group-hover:scale-110 transition-transform">
              <Headphones className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Voz Cristalina via LiveKit</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Infraestrutura WebRTC dedicada com cancelamento de ruído e codecs modernos que entregam áudio nítido
              com mínima latência.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-7 rounded-3xl bg-background-dark/80 border border-white/5 hover:border-brand-500/30 transition-all duration-300 group hover:-translate-y-1 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform">
              <Monitor className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Screen Share 60 FPS</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Compartilhe suas partidas ou janelas com áudio do sistema (loopback nativo) e aceleração de vídeo por
              GPU no aplicativo desktop.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-7 rounded-3xl bg-background-dark/80 border border-white/5 hover:border-brand-500/30 transition-all duration-300 group hover:-translate-y-1 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Chat Rico & Markdown</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Formatação completa (spoilers, negrito, blocos de código), busca de GIFs integrada e prévias ricas de
              imagens, vídeos e áudios.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-7 rounded-3xl bg-background-dark/80 border border-white/5 hover:border-brand-500/30 transition-all duration-300 group hover:-translate-y-1 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Segurança & Autenticação 2FA</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Proteção contra CSRF, tokens seguros de sessão e autenticação em duas etapas (TOTP) com códigos de
              backup para máxima tranquilidade.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="p-7 rounded-3xl bg-background-dark/80 border border-white/5 hover:border-brand-500/30 transition-all duration-300 group hover:-translate-y-1 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5 group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Servidores, Canais & DMs</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Organize comunidades completas com categorias, canais de texto e voz, cargos personalizados, DMs
              privadas e grupos de amigos.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="p-7 rounded-3xl bg-background-dark/80 border border-white/5 hover:border-brand-500/30 transition-all duration-300 group hover:-translate-y-1 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-5 group-hover:scale-110 transition-transform">
              <Sliders className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Push-to-Talk & Atalhos</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Atalhos de teclado globais no app Desktop para mutar, ensurdecer e alternar microfone mesmo minimizado
              durante seus jogos.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------
          5. CTA DOWNLOAD BANNER
      ------------------------------------------------------------- */}
      <section className="py-16 px-6 max-w-5xl mx-auto w-full">
        <div className="rounded-3xl bg-gradient-to-r from-brand-600 to-indigo-600 p-8 sm:p-12 text-center text-white relative overflow-hidden shadow-2xl">
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              Pronto para elevar suas conversas a outro nível?
            </h2>
            <p className="text-white/80 text-base leading-relaxed">
              Baixe o aplicativo para Windows ou entre diretamente pelo navegador em menos de 10 segundos.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <button
                onClick={() => onNavigate('/download')}
                className="px-8 py-3.5 rounded-2xl bg-white text-gray-900 font-bold hover:bg-gray-100 shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5 text-brand-600" />
                <span>Baixar Instalador Windows</span>
              </button>
              <button
                onClick={() => onNavigate(user ? '/@me' : '/signup')}
                className="px-8 py-3.5 rounded-2xl bg-brand-700/60 hover:bg-brand-700 text-white font-semibold border border-white/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Criar Conta Grátis</span>
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
            <ZeroVCLogo className="w-7 h-7 shadow-md shadow-brand-500/25 flex-shrink-0" />
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
              Cadastrar
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
