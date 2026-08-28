import { Volume2, Mic, MicOff, Headphones, Monitor, PhoneOff, Menu, Video, VideoOff } from 'lucide-react';
import { Channel } from '../../types';
import { useVoiceStore } from '../../stores/voiceStore';
import { ParticipantCard } from './ParticipantCard';

interface VoiceRoomProps {
  channel: Channel;
  onOpenScreenShare: () => void;
  onOpenMobileDrawer?: () => void;
}

export const VoiceRoom: React.FC<VoiceRoomProps> = ({ channel, onOpenScreenShare, onOpenMobileDrawer }) => {
  const {
    isConnected,
    isConnecting,
    isMuted,
    isDeafened,
    isScreensharing,
    isCameraOn,
    participants,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    leaveVoice,
    startScreenShare,
    stopScreenShare,
  } = useVoiceStore();

  const handleScreenShareClick = () => {
    if (isScreensharing) {
      stopScreenShare();
    } else {
      onOpenScreenShare();
    }
  };

  const getGridColsClass = () => {
    const count = participants.length;
    if (count <= 1) return 'grid-cols-1 max-w-2xl';
    if (count <= 2) return 'grid-cols-1 sm:grid-cols-2 max-w-4xl';
    if (count <= 4) return 'grid-cols-2 max-w-4xl';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-6xl';
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 max-w-7xl';
  };

  return (
    <div className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden select-none">
      {/* Voice Room Header */}
      <div className="h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2 truncate">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1 -ml-1 rounded hover:bg-white/10 transition-colors"
              title="Menu de Canais"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <Volume2 className="w-5 h-5 md:w-6 md:h-6 text-online flex-shrink-0" />
          <span className="font-bold text-gray-100 truncate text-sm md:text-base">{channel.name}</span>
          <span className="text-xs text-gray-400">({participants.length})</span>
        </div>
      </div>

      {/* Main Voice / Video Grid */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6 flex items-center justify-center">
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
          <div className={`w-full grid gap-3 md:gap-4 ${getGridColsClass()}`}>
            {participants.map((p) => (
              <ParticipantCard key={p.sid || p.identity} participant={p} />
            ))}
          </div>
        )}
      </div>

      {/* Floating Bottom Voice Controls */}
      <div className="p-3 md:p-4 flex justify-center bg-background-darker/80 backdrop-blur-md border-t border-black/20">
        <div className="bg-background-darkest/95 px-4 md:px-6 py-2 rounded-2xl shadow-2xl flex items-center gap-3 md:gap-4 border border-white/10">
          {/* Mute Mic */}
          <button
            onClick={toggleMute}
            className={`p-2.5 md:p-3 rounded-full transition-all ${
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
            className={`p-2.5 md:p-3 rounded-full transition-all ${
              isDeafened
                ? 'bg-dnd text-white hover:bg-dnd/80'
                : 'bg-background-light text-gray-200 hover:bg-white/20'
            }`}
            title={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
          >
            <Headphones className="w-5 h-5" />
          </button>

          {/* Camera WebCam */}
          <button
            onClick={toggleCamera}
            className={`p-2.5 md:p-3 rounded-full transition-all ${
              isCameraOn
                ? 'bg-online text-white hover:bg-online/80 ring-2 ring-online/50'
                : 'bg-background-light text-gray-200 hover:bg-white/20'
            }`}
            title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
          >
            {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={handleScreenShareClick}
            className={`p-2.5 md:p-3 rounded-full transition-all ${
              isScreensharing
                ? 'bg-online text-white hover:bg-online/80 ring-2 ring-online/50'
                : 'bg-background-light text-gray-200 hover:bg-white/20'
            }`}
            title={isScreensharing ? 'Parar Compartilhamento de Tela' : 'Compartilhar Tela'}
          >
            <Monitor className="w-5 h-5" />
          </button>

          <div className="w-[1px] h-7 bg-white/10 mx-0.5" />

          {/* Disconnect */}
          <button
            onClick={leaveVoice}
            className="p-2.5 md:p-3 rounded-full bg-dnd/20 text-dnd hover:bg-dnd hover:text-white transition-all"
            title="Desconectar da Sala"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
