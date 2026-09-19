import React, { useState, useRef, useEffect } from 'react';
import { Mic, Trash2, SendHorizontal, Square } from 'lucide-react';

interface VoiceRecorderProps {
  onSendVoice: (file: File) => Promise<void>;
  onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSendVoice, onCancel }) => {
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
          },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }

        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.start(100);

        timerRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } catch (err) {
        console.error('[VoiceRecorder] Could not access microphone:', err);
        alert('Não foi possível acessar o microfone para gravar a mensagem de voz.');
        onCancel();
      }
    }

    startRecording();

    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [onCancel]);

  const handleStopAndSend = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive' || isProcessing) return;

    setIsProcessing(true);
    if (timerRef.current) clearInterval(timerRef.current);

    recorder.onstop = async () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const mime = recorder.mimeType || 'audio/webm';
      const extension = mime.includes('mp4') ? 'm4a' : 'webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mime });
      const audioFile = new File([audioBlob], `voice-message-${Date.now()}.${extension}`, {
        type: mime,
      });

      try {
        await onSendVoice(audioFile);
      } finally {
        setIsProcessing(false);
      }
    };

    recorder.stop();
  };

  const handleDiscard = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onCancel();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex items-center gap-3 w-full min-h-[48px] md:min-h-[52px] bg-background-darkest/95 border border-red-500/30 px-3 md:px-4 py-2.5 rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-2 select-none">
      {/* Blinking Red Dot & Mic Icon */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </span>
        <Mic className="w-4 h-4 text-red-400 animate-pulse" />
      </div>

      {/* Recording Timer */}
      <span className="font-mono text-xs font-bold text-red-300">
        {formatTime(recordingSeconds)}
      </span>

      {/* Pulsing Audio Waves Visualizer */}
      <div className="flex-1 flex items-center justify-center gap-1 overflow-hidden px-2">
        {[20, 60, 90, 40, 75, 100, 50, 80, 30, 95, 45, 70, 85, 35, 65].map((h, i) => (
          <span
            key={i}
            style={{
              height: `${Math.max(6, Math.min(22, (h * (recordingSeconds % 3 + 1)) / 3))}px`,
              animationDelay: `${i * 0.08}s`,
            }}
            className="w-1 bg-red-500/60 rounded-full transition-all duration-150"
          />
        ))}
      </div>

      {/* Cancel / Trash Button */}
      <button
        type="button"
        onClick={handleDiscard}
        className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
        title="Descartar Gravação"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Send Button */}
      <button
        type="button"
        onClick={handleStopAndSend}
        disabled={isProcessing}
        className="p-2 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
        title="Enviar Mensagem de Voz"
      >
        <SendHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
};
