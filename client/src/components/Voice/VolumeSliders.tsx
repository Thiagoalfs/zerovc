import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Monitor } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';

interface UserVolumeSliderProps {
  userId: string;
  className?: string;
  showIcon?: boolean;
  label?: string;
}

export const UserVolumeSlider: React.FC<UserVolumeSliderProps> = ({
  userId,
  className = '',
  showIcon = true,
  label = 'Volume de Usuário',
}) => {
  const storeVol = useVoiceStore((state) => state.userVolumes[userId] ?? 1);
  const setUserVolume = useVoiceStore((state) => state.setUserVolume);
  const [localVol, setLocalVol] = useState(storeVol);

  useEffect(() => {
    setLocalVol(storeVol);
  }, [storeVol]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalVol(val);
    setUserVolume(userId, val);
  };

  return (
    <div
      className={`px-2.5 py-1.5 flex flex-col gap-1.5 select-none ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
        <div className="flex items-center gap-1.5">
          {showIcon && (
            localVol === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-dnd flex-shrink-0" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            )
          )}
          <span>{label}</span>
        </div>
        <span className="text-brand-400 font-mono text-[11px] font-bold">
          {Math.round(localVol * 100)}%
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={2}
        step={0.01}
        value={localVol}
        onChange={handleChange}
        onInput={handleChange as any}
        className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer"
      />
    </div>
  );
};

interface StreamVolumeSliderProps {
  userId: string;
  className?: string;
  showIcon?: boolean;
  label?: string;
}

export const StreamVolumeSlider: React.FC<StreamVolumeSliderProps> = ({
  userId,
  className = '',
  showIcon = true,
  label = 'Volume da Transmissão',
}) => {
  const storeVol = useVoiceStore((state) => state.streamVolumes[userId] ?? 1);
  const setStreamVolume = useVoiceStore((state) => state.setStreamVolume);
  const [localVol, setLocalVol] = useState(storeVol);

  useEffect(() => {
    setLocalVol(storeVol);
  }, [storeVol]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalVol(val);
    setStreamVolume(userId, val);
  };

  return (
    <div
      className={`px-2.5 py-1.5 flex flex-col gap-1.5 select-none ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
        <div className="flex items-center gap-1.5">
          {showIcon && <Monitor className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />}
          <span>{label}</span>
        </div>
        <span className="text-brand-400 font-mono text-[11px] font-bold">
          {Math.round(localVol * 100)}%
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={2}
        step={0.01}
        value={localVol}
        onChange={handleChange}
        onInput={handleChange as any}
        className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer"
      />
    </div>
  );
};
