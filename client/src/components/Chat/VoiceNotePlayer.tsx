import React, { useMemo } from 'react';
import { VoiceNote } from '../ui/voice-note';

interface VoiceNotePlayerProps {
  src: string;
  className?: string;
}

const hashSeed = (input: string) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ src, className = '' }) => {
  const seed = useMemo(() => hashSeed(src), [src]);

  return (
    <VoiceNote
      src={src}
      seed={seed}
      size="md"
      accent="#6366f1"
      className={`w-[280px] sm:w-[320px] ${className}`.trim()}
    />
  );
};
