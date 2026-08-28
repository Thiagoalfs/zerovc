import React, { useEffect, useRef } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  Video,
  VideoOff,
  Monitor,
  Volume2,
} from 'lucide-react';
import { useCallStore } from '../../stores/callStore';
import { useAuthStore } from '../../stores/authStore';

export const ActiveCallOverlay: React.FC = () => {
  const {
    callState,
    targetUser,
    isMuted,
    isDeafened,
    isCameraOn,
    isScreensharing,
    participants,
    speakingUserIds,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    endCall,
  } = useCallStore();

  const { user: currentUser } = useAuthStore();

  if (callState !== 'calling' && callState !== 'connected') return null;

  return (
    <div className="w-full bg-background-darkest/90 border-b border-white/10 p-4 flex flex-col items-center justify-between transition-all select-none animate-in fade-in">
      {/* Calling State (Waiting for answer) */}
      {callState === 'calling' && (
        <div className="w-full flex items-center justify-between max-w-2xl mx-auto py-2">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-base shadow-lg">
              {targetUser?.avatar_url ? (
                <img src={targetUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span>{targetUser?.display_name?.[0]?.toUpperCase() || targetUser?.username?.[0]?.toUpperCase() || 'U'}</span>
              )}
              <div className="absolute inset-0 rounded-full border-2 border-brand-400 animate-ping opacity-50" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Chamando {targetUser?.display_name || targetUser?.username}...</h4>
              <p className="text-xs text-gray-400 animate-pulse">Aguardando atendimento</p>
            </div>
          </div>

          <button
            onClick={endCall}
            className="flex items-center gap-2 bg-dnd hover:bg-rose-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-lg cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Cancelar</span>
          </button>
        </div>
      )}

      {/* Connected State (Active Voice/Video Call) */}
      {callState === 'connected' && (
        <div className="w-full max-w-4xl mx-auto space-y-4">
          {/* Participants Grid / Cards */}
          <div className="grid grid-cols-2 gap-4 w-full h-44 sm:h-52">
            {/* Self Card */}
            <div className="bg-background-darker/80 rounded-2xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden shadow-inner p-3">
              <div className={`w-16 h-16 rounded-full bg-brand-500 flex items-center justify-center text-white text-xl font-bold relative ${
                speakingUserIds.includes(currentUser?.id || '') ? 'ring-4 ring-online ring-offset-2 ring-offset-background-darker' : ''
              }`}>
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span>{currentUser?.display_name?.[0]?.toUpperCase() || currentUser?.username?.[0]?.toUpperCase()}</span>
                )}
              </div>
              <span className="text-xs font-semibold text-white mt-2 truncate">
                {currentUser?.display_name || currentUser?.username} (Você)
              </span>

              {/* Status Icons */}
              <div className="absolute top-2 right-2 flex items-center gap-1">
                {isMuted && (
                  <span className="p-1 rounded-md bg-dnd/20 text-dnd text-[10px]">
                    <MicOff className="w-3.5 h-3.5" />
                  </span>
                )}
                {isDeafened && (
                  <span className="p-1 rounded-md bg-dnd/20 text-dnd text-[10px]">
                    <Headphones className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </div>

            {/* Target Peer Card */}
            <div className="bg-background-darker/80 rounded-2xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden shadow-inner p-3">
              <div className={`w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center text-white text-xl font-bold relative ${
                speakingUserIds.includes(targetUser?.id || '') ? 'ring-4 ring-online ring-offset-2 ring-offset-background-darker' : ''
              }`}>
                {targetUser?.avatar_url ? (
                  <img src={targetUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span>{targetUser?.display_name?.[0]?.toUpperCase() || targetUser?.username?.[0]?.toUpperCase()}</span>
                )}
              </div>
              <span className="text-xs font-semibold text-white mt-2 truncate">
                {targetUser?.display_name || targetUser?.username}
              </span>
            </div>
          </div>

          {/* Call Controls Bar */}
          <div className="flex items-center justify-center gap-3 pt-1">
            {/* Mute */}
            <button
              onClick={toggleMute}
              className={`p-3 rounded-full transition-all cursor-pointer shadow-md ${
                isMuted
                  ? 'bg-dnd text-white hover:bg-rose-700'
                  : 'bg-background-light hover:bg-white/15 text-white'
              }`}
              title={isMuted ? 'Desmutar' : 'Mutar'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Deafen */}
            <button
              onClick={toggleDeafen}
              className={`p-3 rounded-full transition-all cursor-pointer shadow-md ${
                isDeafened
                  ? 'bg-dnd text-white hover:bg-rose-700'
                  : 'bg-background-light hover:bg-white/15 text-white'
              }`}
              title={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
            >
              <Headphones className="w-5 h-5" />
            </button>

            {/* Camera */}
            <button
              onClick={toggleCamera}
              className={`p-3 rounded-full transition-all cursor-pointer shadow-md ${
                isCameraOn
                  ? 'bg-online text-white hover:bg-emerald-600'
                  : 'bg-background-light hover:bg-white/15 text-white'
              }`}
              title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
            >
              {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>

            {/* Screen Share */}
            <button
              onClick={isScreensharing ? stopScreenShare : startScreenShare}
              className={`p-3 rounded-full transition-all cursor-pointer shadow-md ${
                isScreensharing
                  ? 'bg-online text-white hover:bg-emerald-600'
                  : 'bg-background-light hover:bg-white/15 text-white'
              }`}
              title={isScreensharing ? 'Parar Compartilhamento' : 'Compartilhar Tela'}
            >
              <Monitor className="w-5 h-5" />
            </button>

            {/* End Call Button */}
            <button
              onClick={endCall}
              className="bg-dnd hover:bg-rose-700 text-white p-3 rounded-full transition-all shadow-lg cursor-pointer ml-2"
              title="Desligar Chamada"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
