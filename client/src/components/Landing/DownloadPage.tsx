import React, { useState, useEffect } from 'react';
import {
  Zap,
  Download,
  CheckCircle2,
  Monitor,
  Headphones,
  Sliders,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  ArrowLeft,
  Info,
  Check,
  Laptop,
  Smartphone,
  Apple,
  Globe,
  Share2,
  PlusSquare,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';

interface DownloadPageProps {
  onNavigate: (path: string) => void;
  user?: any;
}

type PlatformType = 'android' | 'windows' | 'ios' | 'web';

export const DownloadPage: React.FC<DownloadPageProps> = ({ onNavigate, user }) => {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformType>('windows');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('windows');

  useEffect(() => {
    const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
    let detected: PlatformType = 'windows';

    if (/android/i.test(ua)) {
      detected = 'android';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      detected = 'ios';
    } else if (/windows|win32|win64/i.test(ua)) {
      detected = 'windows';
    } else {
      detected = 'windows';
    }

    setDetectedPlatform(detected);
    setSelectedPlatform(detected);
  }, []);

  const handleDownload = (platform: PlatformType) => {
    setDownloadStarted(true);

    let fileUrl = '/downloads/ZeroVC-Setup.exe';
    let fileName = 'ZeroVC-Setup.exe';

    if (platform === 'android') {
      fileUrl = '/downloads/ZeroVC.apk';
      fileName = 'ZeroVC.apk';
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

  return (
    <div className="min-h-screen w-full bg-background-darkest text-gray-100 flex flex-col font-sans selection:bg-brand-500/30 selection:text-white">
      {/* Background Ambient Glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-b from-brand-600/20 via-brand-500/5 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="fixed top-80 -right-40 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />

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

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Início</span>
            </button>
            {user ? (
              <button
                onClick={() => onNavigate('/@me')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-600/30 transition-all cursor-pointer"
              >
                <span>Abrir Chat</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onNavigate('/signin')}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/10 transition-all cursor-pointer"
              >
                Entrar na Web
              </button>
            )}
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------
          2. DOWNLOAD HERO & CARD
      ------------------------------------------------------------- */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 md:py-16 flex flex-col items-center text-center">

        {/* Auto-detected Platform Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold mb-6 animate-in fade-in duration-300">
          <Sparkles className="w-3.5 h-3.5 text-brand-400" />
          <span>
            {detectedPlatform === 'android' && 'Detectamos que você está usando um dispositivo Android'}
            {detectedPlatform === 'windows' && 'Detectamos que você está usando Windows'}
            {detectedPlatform === 'ios' && 'Detectamos que você está usando iPhone / iPad (iOS)'}
            {detectedPlatform === 'web' && 'Detectamos o seu navegador'}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4">
          Baixe o{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-emerald-400">
            ZeroVC
          </span>{' '}
          para o seu dispositivo
        </h1>

        <p className="text-sm sm:text-base md:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-8">
          Desfrute de chamadas com latência zero, áudio cristalino, menor uso de bateria e conexão ultra-rápida.
        </p>

        {/* Platform Selector Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10 p-1.5 rounded-2xl bg-white/5 border border-white/10 max-w-lg w-full">
          <button
            onClick={() => setSelectedPlatform('android')}
            className={`flex-1 min-w-[110px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              selectedPlatform === 'android'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Android (.apk)</span>
          </button>

          <button
            onClick={() => setSelectedPlatform('windows')}
            className={`flex-1 min-w-[110px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              selectedPlatform === 'windows'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Windows (.exe)</span>
          </button>

          <button
            onClick={() => setSelectedPlatform('ios')}
            className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              selectedPlatform === 'ios'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Apple className="w-4 h-4" />
            <span>iOS (PWA)</span>
          </button>
        </div>

        {/* -------------------------------------------------------------
            PLATFORM CARD: ANDROID
        ------------------------------------------------------------- */}
        {selectedPlatform === 'android' && (
          <div className="w-full max-w-2xl rounded-3xl bg-background-dark/90 border border-white/10 p-7 sm:p-10 shadow-2xl relative overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 mb-6">
                <Smartphone className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-1">ZeroVC para Android</h2>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-8 font-mono">
                <span>Android 8.0+ (ARM64 / Universal)</span>
                <span>•</span>
                <span>Pacote APK Direto</span>
              </div>

              {/* Download APK Button */}
              <button
                onClick={() => handleDownload('android')}
                className={`w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-4.5 rounded-2xl font-black text-base sm:text-lg shadow-2xl transition-all cursor-pointer group ${
                  downloadStarted
                    ? 'bg-emerald-600 text-white shadow-emerald-600/40'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/40 hover:shadow-emerald-500/50 hover:-translate-y-1'
                }`}
              >
                {downloadStarted ? (
                  <>
                    <Check className="w-6 h-6 animate-bounce" />
                    <span>Download Iniciado!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-6 h-6 group-hover:translate-y-0.5 transition-transform" />
                    <span>Baixar ZeroVC APK (.apk)</span>
                  </>
                )}
              </button>

              {downloadStarted && (
                <p className="text-xs text-emerald-400 mt-4 animate-in fade-in">
                  O arquivo <code className="font-mono font-bold">ZeroVC.apk</code> está sendo baixado. Se o download
                  não começar,{' '}
                  <a href="/downloads/ZeroVC.apk" className="underline font-bold hover:text-white">
                    clique aqui
                  </a>
                  .
                </p>
              )}

              <div className="w-full h-px bg-white/10 my-8" />

              {/* Android Features */}
              <div className="w-full text-left space-y-3.5">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Destaques da Versão Android:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Áudio WebRTC de alta fidelidade em segundo plano</span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Gestos de swipe para navegação fluida em canais</span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Suporte a câmera frontal/traseira em chamadas</span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Leve, rápido e sem anúncios</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            PLATFORM CARD: WINDOWS
        ------------------------------------------------------------- */}
        {selectedPlatform === 'windows' && (
          <div className="w-full max-w-2xl rounded-3xl bg-background-dark/90 border border-white/10 p-7 sm:p-10 shadow-2xl relative overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-brand-500/30 mb-6">
                <Laptop className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-1">ZeroVC para Windows</h2>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-8 font-mono">
                <span>Windows 10 / 11 (64-bit)</span>
                <span>•</span>
                <span>Instalador Setup Wizard (.exe)</span>
              </div>

              {/* Main Download Button */}
              <button
                onClick={() => handleDownload('windows')}
                className={`w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-4.5 rounded-2xl font-black text-base sm:text-lg shadow-2xl transition-all cursor-pointer group ${
                  downloadStarted
                    ? 'bg-emerald-600 text-white shadow-emerald-600/40'
                    : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/40 hover:shadow-brand-500/50 hover:-translate-y-1'
                }`}
              >
                {downloadStarted ? (
                  <>
                    <Check className="w-6 h-6 animate-bounce" />
                    <span>Download Iniciado!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-6 h-6 group-hover:translate-y-0.5 transition-transform" />
                    <span>Baixar ZeroVC Setup (.exe)</span>
                  </>
                )}
              </button>

              {downloadStarted && (
                <p className="text-xs text-emerald-400 mt-4 animate-in fade-in">
                  O arquivo <code className="font-mono font-bold">ZeroVC-Setup.exe</code> está sendo baixado. Se o download
                  não começar,{' '}
                  <a href="/downloads/ZeroVC-Setup.exe" className="underline font-bold hover:text-white">
                    clique aqui
                  </a>
                  .
                </p>
              )}

              <div className="w-full h-px bg-white/10 my-8" />

              {/* Desktop Features */}
              <div className="w-full text-left space-y-3.5">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Recursos Exclusivos da Versão Desktop:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Push-to-Talk Global (funciona dentro de qualquer jogo)</span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Transmissão de tela 60 FPS com áudio do sistema</span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Aceleração por hardware GPU e menor uso de CPU</span>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>Atalhos globais para Mutar e Ensurdecer</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            PLATFORM CARD: iOS
        ------------------------------------------------------------- */}
        {selectedPlatform === 'ios' && (
          <div className="w-full max-w-2xl rounded-3xl bg-background-dark/90 border border-white/10 p-7 sm:p-10 shadow-2xl relative overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-gray-700 to-gray-900 flex items-center justify-center text-white shadow-xl shadow-black/50 mb-6">
                <Apple className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-1">ZeroVC no iOS (iPhone / iPad)</h2>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-8 font-mono">
                <span>iOS 16+ / iPadOS</span>
                <span>•</span>
                <span>Instalação PWA via Safari</span>
              </div>

              {/* iOS Direct Action */}
              <button
                onClick={() => onNavigate(user ? '/@me' : '/signin')}
                className="w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-4.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-black text-base sm:text-lg shadow-2xl shadow-brand-600/40 hover:shadow-brand-500/50 hover:-translate-y-1 transition-all cursor-pointer"
              >
                <Globe className="w-6 h-6" />
                <span>Abrir App no Safari</span>
              </button>

              <div className="w-full h-px bg-white/10 my-8" />

              {/* iOS Step by Step Instructions */}
              <div className="w-full text-left space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Como instalar na Tela de Início do iOS:
                </div>

                <div className="space-y-3 text-xs text-gray-300">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-xs flex-shrink-0">
                      1
                    </div>
                    <div>
                      <span className="font-semibold text-white">Abra no Safari:</span> Acesse{' '}
                      <span className="text-brand-400 font-mono">zerovc.safiroko.xyz</span> no Safari do seu iPhone ou iPad.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-xs flex-shrink-0">
                      2
                    </div>
                    <div>
                      <span className="font-semibold text-white">Toque em Compartilhar:</span> Toque no ícone de compartilhamento{' '}
                      <Share2 className="inline w-3.5 h-3.5 text-brand-400 mx-1" /> na barra inferior do Safari.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-xs flex-shrink-0">
                      3
                    </div>
                    <div>
                      <span className="font-semibold text-white">Adicionar à Tela de Início:</span> Role a lista para baixo e toque em{' '}
                      <span className="font-semibold text-white">"Adicionar à Tela de Início"</span> (+).
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            3. INSTALLATION STEPS (DYNAMIC FOR SELECTED PLATFORM)
        ------------------------------------------------------------- */}
        {selectedPlatform === 'android' && (
          <div className="max-w-3xl w-full mt-16 text-left">
            <h3 className="text-xl font-bold text-white text-center mb-8">
              Como instalar o APK no Android
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                  1
                </div>
                <h4 className="font-bold text-white text-sm">Baixe o APK</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Toque no botão de download acima para baixar o arquivo <code className="text-emerald-400 font-mono">ZeroVC.apk</code>.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                  2
                </div>
                <h4 className="font-bold text-white text-sm">Permita a Instalação</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Abra o arquivo baixado. Se o Android perguntar, toque em "Configurações" e marque "Permitir desta fonte".
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                  3
                </div>
                <h4 className="font-bold text-white text-sm">Abra e Converse</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Toque em "Instalar" e pronto! O app aparecerá na gaveta de aplicativos pronto para uso.
                </p>
              </div>
            </div>
          </div>
        )}

        {selectedPlatform === 'windows' && (
          <div className="max-w-3xl w-full mt-16 text-left">
            <h3 className="text-xl font-bold text-white text-center mb-8">
              Como instalar no Windows em 3 passos
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-sm border border-brand-500/30">
                  1
                </div>
                <h4 className="font-bold text-white text-sm">Baixe o Setup</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Clique no botão de download acima e salve o instalador no seu computador.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-sm border border-brand-500/30">
                  2
                </div>
                <h4 className="font-bold text-white text-sm">Execute o Assistente</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Abra o instalador e avance pelo Setup Wizard. Ele criará os atalhos automaticamente.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-sm border border-brand-500/30">
                  3
                </div>
                <h4 className="font-bold text-white text-sm">Faça Login e Aproveite</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Entre com sua conta do ZeroVC ou crie uma nova em segundos para começar a conversar!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Web Version Alternative Callout */}
        <div className="mt-14 p-5 rounded-2xl bg-white/5 border border-white/10 max-w-xl w-full flex items-center justify-between gap-4 text-left">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-brand-400 flex-shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-white">Não quer instalar agora?</div>
              <div className="text-gray-400">Você pode usar todas as funções principais direto no navegador.</div>
            </div>
          </div>
          <button
            onClick={() => onNavigate(user ? '/@me' : '/signin')}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs whitespace-nowrap transition-colors cursor-pointer"
          >
            Acessar Web
          </button>
        </div>
      </main>

      {/* -------------------------------------------------------------
          4. FOOTER
      ------------------------------------------------------------- */}
      <footer className="border-t border-white/5 py-8 px-6 bg-[#090d12] text-xs text-gray-500 text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-brand-600 flex items-center justify-center text-white">
              <Zap className="w-3.5 h-3.5 fill-white" />
            </div>
            <span className="font-bold text-white">ZeroVC</span>
            <span>•</span>
            <span>Disponível para Windows, Android e Web</span>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => onNavigate('/')} className="hover:text-gray-300 transition-colors cursor-pointer">
              Início
            </button>
            <button onClick={() => onNavigate('/signin')} className="hover:text-gray-300 transition-colors cursor-pointer">
              Entrar
            </button>
            <button onClick={() => onNavigate('/signup')} className="hover:text-gray-300 transition-colors cursor-pointer">
              Cadastrar
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
