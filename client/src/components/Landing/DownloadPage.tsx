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
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 via-brand-500 to-indigo-400 flex items-center justify-center shadow-lg shadow-brand-500/25 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
              Zero<span className="text-brand-400">VC</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                v1.0
              </span>
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
        {/* Release Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-xs font-semibold text-brand-300 mb-6 backdrop-blur-sm shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-brand-400" />
          <span>Instalador Oficial Standalone para Windows (64-bit)</span>
        </div>

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

        {/* Download Card */}
        <div className="w-full max-w-2xl rounded-3xl bg-background-dark/90 border border-white/10 p-8 sm:p-10 shadow-2xl relative overflow-hidden backdrop-blur-md">
          {/* Card Top Icon & Details */}
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-brand-500/30 mb-6 animate-in zoom-in-90 duration-300">
              <Laptop className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">ZeroVC para Windows</h2>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-8 font-mono">
              <span>Versão 1.0.0</span>
              <span>•</span>
              <span>Windows 10 / 11 (64-bit)</span>
              <span>•</span>
              <span>Instalador Setup Wizard (.exe)</span>
            </div>

            {/* Main Download Button */}
            <button
              onClick={handleDownload}
              className={`w-full sm:w-auto flex items-center justify-center gap-3 px-10 py-5 rounded-2xl font-black text-lg shadow-2xl transition-all cursor-pointer group ${
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
                não começar automaticamente,{' '}
                <a href="/downloads/ZeroVC-Setup.exe" className="underline font-bold hover:text-white">
                  clique aqui
                </a>
                .
              </p>
            )}

            <div className="w-full h-px bg-white/10 my-8" />

            {/* Exclusive Desktop Features Checklist */}
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
