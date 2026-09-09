import React, { useState } from 'react';
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
} from 'lucide-react';
import { ZeroVCLogo } from '../Common/ZeroVCLogo';

interface DownloadPageProps {
  onNavigate: (path: string) => void;
  user?: any;
}

export const DownloadPage: React.FC<DownloadPageProps> = ({ onNavigate, user }) => {
  const [downloadStarted, setDownloadStarted] = useState(false);

  const handleDownload = () => {
    setDownloadStarted(true);
    // Trigger download of the standalone NSIS setup executable
    const link = document.createElement('a');
    link.href = '/downloads/ZeroVC-Setup.exe';
    link.download = 'ZeroVC-Setup.exe';
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
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 md:py-20 flex flex-col items-center text-center">

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight mb-4">
          Baixe o aplicativo desktop do{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-emerald-400">
            ZeroVC
          </span>
        </h1>

        <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-12">
          Desfrute de menor latência, atalhos globais de teclado, Push-to-Talk nativo e aceleração de vídeo por
          hardware instalando o ZeroVC no seu computador.
        </p>

        {/* Multi-Platform Download Cards Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* 1. Windows (Principal) */}
          <div className="rounded-3xl bg-background-dark/90 border border-brand-500/40 p-6 sm:p-7 shadow-2xl relative overflow-hidden backdrop-blur-md flex flex-col items-center text-center group hover:border-brand-500 transition-all">
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-brand-500/20 border border-brand-500/40 text-[10px] font-bold text-brand-300 uppercase tracking-wider">
              Recomendado
            </div>

            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-brand-500/30 mb-4 animate-in zoom-in-90 duration-300">
              <Laptop className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold text-white mb-1">Computador (Windows)</h2>
            <span className="text-xs text-gray-400 mb-6 font-mono">Windows 10 / 11 (64-bit)</span>

            <button
              onClick={handleDownload}
              className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl font-bold text-sm shadow-xl transition-all cursor-pointer mt-auto ${
                downloadStarted
                  ? 'bg-emerald-600 text-white shadow-emerald-600/40'
                  : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/40 hover:shadow-brand-500/50 hover:-translate-y-0.5'
              }`}
            >
              {downloadStarted ? (
                <>
                  <Check className="w-4 h-4 animate-bounce" />
                  <span>Download Iniciado!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar para Windows (.exe)</span>
                </>
              )}
            </button>
          </div>

          {/* 2. Apple (macOS / iOS) */}
          <div className="rounded-3xl bg-background-dark/80 border border-white/10 p-6 sm:p-7 shadow-xl relative overflow-hidden backdrop-blur-md flex flex-col items-center text-center group hover:border-white/20 transition-all">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-white shadow-lg mb-4">
              <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.87-.94.04-2.03.63-2.67 1.38-.56.65-1.05 1.71-.92 2.74 1.05.08 2.06-.5 2.67-1.25z" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-white mb-1">Apple (macOS / iOS)</h2>
            <span className="text-xs text-gray-400 mb-6 font-mono">MacBook, iMac & iPhones</span>

            <button
              onClick={() => onNavigate('/signin')}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl font-bold text-sm bg-white/10 hover:bg-white/15 text-white border border-white/10 shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer mt-auto"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Acessar Web / PWA</span>
            </button>
          </div>

          {/* 3. Android */}
          <div className="rounded-3xl bg-background-dark/80 border border-white/10 p-6 sm:p-7 shadow-xl relative overflow-hidden backdrop-blur-md flex flex-col items-center text-center group hover:border-white/20 transition-all">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg mb-4">
              <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.411 13.8533 8.083 12 8.083c-1.8534 0-3.5902.328-5.1368.8667L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-white mb-1">Android</h2>
            <span className="text-xs text-gray-400 mb-6 font-mono">Smartphones e Tablets</span>

            <button
              onClick={() => onNavigate('/signin')}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-xl font-bold text-sm bg-white/10 hover:bg-white/15 text-white border border-white/10 shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer mt-auto"
            >
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Acessar Web / PWA</span>
            </button>
          </div>
        </div>

        {/* Exclusive Desktop Features Checklist */}
        <div className="w-full max-w-3xl rounded-3xl bg-background-dark/60 border border-white/5 p-6 sm:p-8 text-left space-y-3.5 backdrop-blur-md mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-400 mb-2">
            Vantagens da Versão Desktop Instalada (Windows):
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Push-to-Talk Global (funciona dentro de qualquer jogo em tela cheia)</span>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Transmissão de tela 60 FPS com áudio do sistema (loopback nativo)</span>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Aceleração por hardware GPU e menor consumo de bateria/CPU</span>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>Atalhos globais de teclado para Mutar e Ensurdecer</span>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
            3. INSTALLATION STEPS
        ------------------------------------------------------------- */}
        <div className="max-w-3xl w-full mt-20 text-left">
          <h3 className="text-xl font-bold text-white text-center mb-8">
            Como instalar em 3 passos simples
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-2">
              <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-300 font-bold flex items-center justify-center text-sm border border-brand-500/30">
                1
              </div>
              <h4 className="font-bold text-white text-sm">Baixe o Setup</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                Clique no botão de download acima e salve o executável do instalador no seu computador.
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

        {/* Web Version Alternative Callout */}
        <div className="mt-16 p-5 rounded-2xl bg-white/5 border border-white/10 max-w-xl w-full flex items-center justify-between gap-4 text-left">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-brand-400 flex-shrink-0" />
            <div className="text-xs">
              <div className="font-semibold text-white">Não pode instalar agora?</div>
              <div className="text-gray-400">Você pode usar todas as funções principais direto no navegador.</div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('/signin')}
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
            <span>Instalador Setup Wizard Windows</span>
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
