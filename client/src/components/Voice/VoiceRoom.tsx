import React from 'react';
import { Volume2, Mic, MicOff, Headphones, Monitor, PhoneOff } from 'lucide-react';
import { Channel } from '../../types';
import { useVoiceStore } from '../../stores/voiceStore';
import { ParticipantCard } from './ParticipantCard';

interface VoiceRoomProps {
  channel: Channel;
  onOpenScreenShare: () => void;
}

export const VoiceRoom: React.FC<VoiceRoomProps> = ({ channel, onOpenScreenShare }) => {
  const {
    isConnected,
    isConnecting,
    isMuted,
    isDeafened,
    isScreensharing,
    participants,
    toggleMute,
    toggleDeafen,
    leaveVoice,
    stopScreenShare,
  } = useVoiceStore();

  const getGridColsClass = () => {
    const count = participants.length;
    if (count <= 1) return 'grid-cols-1 max-w-2xl';
    if (count <= 2) return 'grid-cols-1 md:grid-cols-2 max-w-4xl';
    if (count <= 4) return 'grid-cols-2 max-w-4xl';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-6xl';
    return 'grid-cols-3 md:grid-cols-4 max-w-7xl';
  };

  return (
    <div className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden select-none">
      {/* Voice Room Header */}
      <div className="h-12 border-b border-black/20 px-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2">
          <Volume2 className="w-6 h-6 text-online" />
          <span className="font-bold text-gray-100">{channel.name}</span>
          <span className="text-xs text-gray-400">({participants.length} conectados)</span>
        </div>
      </div>

      {/* Main Voice / Video Grid */}
      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
        {isConnecting ? (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Conectando ao canal de voz...</span>
          </div>
        ) : participants.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Volume2 className="w-12 h-12 stroke-1" />
            <span className="text-sm">Nenhum participante conectado</span>
          </div>
        ) : (
          <div className={`w-full grid gap-4 ${getGridColsClass()}`}>
            {participants.map((p) => (
              <ParticipantCard key={p.sid || p.identity} participant={p} />
            ))}
          </div>
        )}
      </div>

      {/* Floating Bottom Voice Controls */}
      <div className="p-4 flex justify-center bg-background-darker/60 border-t border-black/20">
        <div className="bg-background-darkest/90 backdrop-blur-md px-6 py-2.5 rounded-2xl shadow-xl flex items-center gap-4 border border-white/5">
          {/* Mute Mic */}
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full transition-all ${
              isMuted
                ? 'bg-dnd text-white hover:bg-dnd/80'
                : 'bg-background-light text-gray-200 hover:bg-white/20'
            }`}
            title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Deafen */}
          <button
            onClick={toggleDeafen}
            className={`p-3 rounded-full transition-all ${
              isDeafened
                ? 'bg-dnd text-white hover:bg-dnd/80'
                : 'bg-background-light text-gray-200 hover:bg-white/20'
            }`}
            title={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
          >
            <Headphones className="w-5 h-5" />
          </button>

          {/* Screen Share */}
          <button
            onClick={() => {
              if (isScreensharing) {
                stopScreenShare();
              } else {
                onOpenScreenShare();
              }
            }}
            className={`p-3 rounded-full transition-all ${
              isScreensharing
                ? 'bg-online text-white hover:bg-online/80'
                : 'bg-background-light text-gray-200 hover:bg-white/20'
            }`}
            title={isScreensharing ? 'Parar Compartilhamento' : 'Compartilhar Tela'}
          >
            <Monitor className="w-5 h-5" />
          </button>

          <div className="w-[1px] h-8 bg-white/10 mx-1" />

          {/* Disconnect */}
          <button
            onClick={leaveVoice}
            className="p-3 rounded-full bg-dnd/20 text-dnd hover:bg-dnd hover:text-white transition-all"
            title="Desconectar da Sala"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
