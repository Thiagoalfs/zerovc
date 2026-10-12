import React from 'react';
import { Mic, Volume2, VolumeX, Radio, Users, Check, Sliders } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';

interface UserBarContextMenuControlsProps {
  onOpenSettings: () => void;
}

export const UserBarContextMenuControls: React.FC<UserBarContextMenuControlsProps> = ({
  onOpenSettings,
}) => {
  const {
    inputMode,
    inputVolume,
    outputVolume,
    showVoiceUsersInBar,
    setInputMode,
    setInputVolume,
    setOutputVolume,
    setShowVoiceUsersInBar,
  } = useSettingsStore();

  return (
    <div
      className="w-64 p-1 flex flex-col gap-1 select-none text-gray-200"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 1. Radio: Modo de Entrada (Aberto / Push to Talk) */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-2 py-1">
          Modo de Entrada
        </div>
        <div className="space-y-0.5">
          {/* Aberto */}
          <button
            type="button"
            onClick={() => setInputMode('activity')}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              inputMode === 'activity'
                ? 'bg-brand-500/15 text-brand-300 font-semibold'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <Mic className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <span className="truncate">Aberto</span>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${
                inputMode === 'activity' ? 'border-brand-400 bg-brand-500' : 'border-gray-500 bg-transparent'
              }`}
            >
              {inputMode === 'activity' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>

          {/* Push to Talk */}
          <button
            type="button"
            onClick={() => setInputMode('ptt')}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              inputMode === 'ptt'
                ? 'bg-brand-500/15 text-brand-300 font-semibold'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <Radio className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <span className="truncate">Push to Talk</span>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${
                inputMode === 'ptt' ? 'border-brand-400 bg-brand-500' : 'border-gray-500 bg-transparent'
              }`}
            >
              {inputMode === 'ptt' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>
        </div>
      </div>

      <div className="h-px bg-white/10 mx-2 my-1" />

      {/* 2. Sliders: Volume de entrada & Volume de saída */}
      <div className="space-y-2.5 py-0.5">
        {/* Volume de entrada */}
        <div className="px-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <Mic className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <span className="truncate">Volume de entrada</span>
            </div>
            <span className="text-brand-400 font-mono text-[11px] font-bold flex-shrink-0">{inputVolume}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={inputVolume}
            onChange={(e) => setInputVolume(Number(e.target.value))}
            className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer block"
          />
        </div>

        {/* Volume de saída */}
        <div className="px-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {outputVolume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-dnd" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                )}
              </div>
              <span className="truncate">Volume de saída</span>
            </div>
            <span className="text-brand-400 font-mono text-[11px] font-bold flex-shrink-0">{outputVolume}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={outputVolume}
            onChange={(e) => setOutputVolume(Number(e.target.value))}
            className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer block"
          />
        </div>
      </div>

      <div className="h-px bg-white/10 mx-2 my-1" />

      {/* 3. Checkbox: Mostrar usuários */}
      <div>
        <button
          type="button"
          onClick={() => setShowVoiceUsersInBar(!showVoiceUsersInBar)}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <Users className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <span className="truncate">Mostrar usuários</span>
          </div>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
              showVoiceUsersInBar ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-500 bg-transparent'
            }`}
          >
            {showVoiceUsersInBar && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
        </button>
      </div>

      {/* 4. Link to Full Audio Settings */}
      <div className="h-px bg-white/10 mx-2 my-1" />
      <div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <span className="truncate">Configurações de voz...</span>
        </button>
      </div>
    </div>
  );
};
