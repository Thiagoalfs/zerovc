import React, { useState, useEffect } from 'react';
import { Activity, X, Wifi, Server, Shield, Radio, Sparkles, RefreshCw } from 'lucide-react';
import { livekit } from '../../lib/livekit';
import { useVoiceStore } from '../../stores/voiceStore';

interface VoiceDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VoiceDiagnosticModal: React.FC<VoiceDiagnosticModalProps> = ({ isOpen, onClose }) => {
  const { isConnected, currentChannelId } = useVoiceStore();
  const [stats, setStats] = useState<{
    isConnected: boolean;
    roomName: string;
    serverUrl: string;
    pingMs: number;
    iceState: string;
    packetLossPercent: number;
    audioBitrateKbps: number;
    videoBitrateKbps: number;
    codec: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const updateStats = async () => {
      const data = await livekit.getDiagnosticStats();
      setStats(data);
    };

    updateStats();
    const interval = setInterval(updateStats, 1500);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const ping = stats?.pingMs || 0;
  const pingColor = ping <= 50 ? 'text-emerald-400' : ping <= 120 ? 'text-amber-400' : 'text-red-400';
  const pingBg = ping <= 50 ? 'bg-emerald-500/10 border-emerald-500/20' : ping <= 120 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in select-none">
      <div className="bg-background-darker border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-background-darkest/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-100">Diagnóstico da Conexão WebRTC</h3>
              <p className="text-[11px] text-gray-400">Estatísticas de transmissão de áudio em tempo real</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Status Bar */}
          <div className={`flex items-center justify-between p-3 rounded-xl border ${pingBg}`}>
            <div className="flex items-center gap-2">
              <Wifi className={`w-4 h-4 ${pingColor}`} />
              <span className="text-xs font-semibold text-gray-200">
                {isConnected ? 'Conexão Estabelecida' : 'Desconectado'}
              </span>
            </div>
            <span className={`font-mono text-sm font-bold ${pingColor}`}>
              {ping} ms
            </span>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Audio Bitrate */}
            <div className="p-3 bg-background-darkest/60 border border-white/5 rounded-xl flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                <Radio className="w-3.5 h-3.5 text-brand-400" />
                <span>Bitrate de Áudio</span>
              </div>
              <span className="text-sm font-bold font-mono text-gray-100">
                {stats?.audioBitrateKbps || 48} kbps
              </span>
            </div>

            {/* Packet Loss */}
            <div className="p-3 bg-background-darkest/60 border border-white/5 rounded-xl flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Perda de Pacotes</span>
              </div>
              <span className="text-sm font-bold font-mono text-emerald-400">
                {stats?.packetLossPercent || 0}%
              </span>
            </div>

            {/* Audio Codec */}
            <div className="p-3 bg-background-darkest/60 border border-white/5 rounded-xl flex flex-col gap-1 col-span-2">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Codec & Perfil de Áudio</span>
              </div>
              <span className="text-xs font-mono text-gray-200">
                {stats?.codec || 'Opus 48kHz Stereo (RED + DTX)'}
              </span>
            </div>

            {/* ICE State */}
            <div className="p-3 bg-background-darkest/60 border border-white/5 rounded-xl flex flex-col gap-1 col-span-2">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                <Server className="w-3.5 h-3.5 text-blue-400" />
                <span>Estado ICE / Servidor de Voz</span>
              </div>
              <span className="text-xs font-mono text-gray-300 truncate">
                {stats?.iceState === 'connected' ? '🟢 Conectado via LiveKit Gateway' : stats?.iceState || 'Desconectado'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-background-darkest/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-gray-200 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
