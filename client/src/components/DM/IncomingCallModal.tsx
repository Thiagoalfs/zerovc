import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useCallStore } from '../../stores/callStore';
import { formatAssetUrl } from '../../lib/api';

export const IncomingCallModal: React.FC = () => {
  const { callState, incomingCaller, acceptCall, rejectCall } = useCallStore();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (callState === 'ringing') {
      // Synthesize Discord-like ringtone via Web Audio API
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          audioCtxRef.current = ctx;

          const playRing = () => {
            if (ctx.state === 'suspended') {
              ctx.resume();
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
            osc.frequency.setValueAtTime(480, ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.8);
          };

          playRing();
          ringIntervalRef.current = setInterval(playRing, 2000);
        }
      } catch (err) {
        console.error('Audio ringtone error:', err);
      }
    } else {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    }

    return () => {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [callState]);

  if (callState !== 'ringing' || !incomingCaller) return null;

  return (
    <div className="fixed top-6 right-6 z-50 bg-background-darkest/95 backdrop-blur-xl border border-brand-500/40 p-4 rounded-3xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-4 duration-200 select-none max-w-sm">
      {/* Avatar with pulse ring */}
      <div className="relative">
        <div className="w-14 h-14 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-lg overflow-hidden relative z-10 shadow-lg">
          {incomingCaller.avatar_url ? (
            <img src={formatAssetUrl(incomingCaller.avatar_url)} alt="" className="w-full h-full object-cover" />
          ) : (
            <span>{incomingCaller.display_name?.[0]?.toUpperCase() || incomingCaller.username?.[0]?.toUpperCase()}</span>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-brand-500/40 animate-ping" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 pr-2">
        <span className="text-xs font-bold text-brand-400 uppercase tracking-wider block">Chamada Recebida</span>
        <h4 className="text-sm font-bold text-white truncate">
          {incomingCaller.display_name || incomingCaller.username}
        </h4>
        <span className="text-[11px] text-gray-400">Chamada de voz/vídeo 1x1</span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={rejectCall}
          className="w-10 h-10 rounded-full bg-dnd/20 text-dnd hover:bg-dnd hover:text-white flex items-center justify-center transition-all cursor-pointer shadow"
          title="Recusar"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
        <button
          onClick={acceptCall}
          className="w-10 h-10 rounded-full bg-online hover:bg-emerald-600 text-white flex items-center justify-center transition-all cursor-pointer shadow animate-bounce"
          title="Atender"
        >
          <Phone className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
