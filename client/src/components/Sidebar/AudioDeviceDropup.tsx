import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Headphones, Check, Settings, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';

interface AudioDeviceDropupProps {
  type: 'input' | 'output';
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: (tab?: string) => void;
  anchorRef: React.RefObject<HTMLElement>;
}

const calculateCoords = (anchor: HTMLElement | null): { bottom: number; left: number } | null => {
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const popoutWidth = 270;
  const spacing = 8;
  const bottom = Math.max(10, window.innerHeight - rect.top + spacing);

  let left = rect.left - 40;
  if (left + popoutWidth > window.innerWidth - 12) {
    left = window.innerWidth - popoutWidth - 12;
  }
  if (left < 12) {
    left = 12;
  }

  return { bottom, left };
};

export const AudioDeviceDropup: React.FC<AudioDeviceDropupProps> = ({
  type,
  isOpen,
  onClose,
  onOpenSettings,
  anchorRef,
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const popoutRef = useRef<HTMLDivElement>(null);

  // Synchronous calculation: Never start with arbitrary default coordinates
  const [coords, setCoords] = useState<{ bottom: number; left: number } | null>(() => {
    return calculateCoords(anchorRef.current);
  });

  const {
    audioInputDeviceId,
    audioOutputDeviceId,
    setAudioInputDevice,
    setAudioOutputDevice,
  } = useSettingsStore();

  const activeDeviceId = type === 'input' ? audioInputDeviceId : audioOutputDeviceId;

  // Immediate synchronous layout effect before DOM paint
  useLayoutEffect(() => {
    if (!isOpen) return;
    const initialCoords = calculateCoords(anchorRef.current);
    if (initialCoords) {
      setCoords(initialCoords);
    }
  }, [isOpen, anchorRef]);

  // Close immediately if page scrolls or window resizes (never animate or drag along)
  useEffect(() => {
    if (!isOpen) return;

    const handleImmediateClose = () => {
      onClose();
    };

    window.addEventListener('resize', handleImmediateClose);
    window.addEventListener('scroll', handleImmediateClose, true);

    return () => {
      window.removeEventListener('resize', handleImmediateClose);
      window.removeEventListener('scroll', handleImmediateClose, true);
    };
  }, [isOpen, onClose]);

  // Load available audio devices
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      setIsLoading(true);
      try {
        let allDevices = await navigator.mediaDevices.enumerateDevices();
        const hasLabels = allDevices.some(
          (d) => (d.kind === 'audioinput' || d.kind === 'audiooutput') && d.label !== ''
        );

        // Probe permission briefly if labels are obscured
        if (!hasLabels && navigator.mediaDevices.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
            if (stream) {
              stream.getTracks().forEach((t) => t.stop());
              allDevices = await navigator.mediaDevices.enumerateDevices();
            }
          } catch {}
        }

        if (!isMounted) return;

        const targetKind = type === 'input' ? 'audioinput' : 'audiooutput';
        const filtered = allDevices.filter((d) => d.kind === targetKind);
        setDevices(filtered);
      } catch (err) {
        console.warn('[AudioDeviceDropup] Failed to enumerate devices:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadDevices();

    const handleDeviceChange = () => {
      loadDevices();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      isMounted = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [isOpen, type]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Strict check: if closed or coordinates not ready yet, never render to prevent visual jumps
  if (!isOpen || !coords) return null;

  const handleSelectDevice = async (deviceId: string) => {
    if (type === 'input') {
      await setAudioInputDevice(deviceId);
    } else {
      await setAudioOutputDevice(deviceId);
    }
    onClose();
  };

  const getCleanLabel = (device: MediaDeviceInfo, index: number) => {
    if (device.label) return device.label;
    if (device.deviceId === 'default') return 'Padrão do Sistema';
    if (device.deviceId === 'communications') return 'Comunicação do Sistema';
    return type === 'input' ? `Microfone ${index + 1}` : `Alto-falante ${index + 1}`;
  };

  const isDeviceSelected = (device: MediaDeviceInfo, index: number) => {
    if (activeDeviceId) {
      return device.deviceId === activeDeviceId;
    }
    if (device.deviceId === 'default') return true;
    return index === 0;
  };

  return createPortal(
    <>
      {/* Invisible backdrop to dismiss on click outside */}
      <div
        className="fixed inset-0 z-[120]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Dropup Container: explicitly transition-none, non-draggable, non-selectable */}
      <div
        ref={popoutRef}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        style={{
          bottom: `${coords.bottom}px`,
          left: `${coords.left}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[130] w-64 sm:w-72 bg-background-darkest/95 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 select-none text-gray-200 transition-none pointer-events-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 pb-2 mb-1 select-none">
          {type === 'input' ? (
            <>
              <Mic className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
              <span>Dispositivo de Entrada</span>
            </>
          ) : (
            <>
              <Headphones className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
              <span>Dispositivo de Saída</span>
            </>
          )}
        </div>

        {/* Device List */}
        <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar py-0.5 select-none">
          {isLoading && devices.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Buscando dispositivos...</span>
            </div>
          ) : devices.length === 0 ? (
            <div className="px-2.5 py-3 text-xs text-gray-500 italic text-center">
              Nenhum dispositivo encontrado
            </div>
          ) : (
            devices.map((device, idx) => {
              const selected = isDeviceSelected(device, idx);
              const label = getCleanLabel(device, idx);

              return (
                <button
                  key={`${device.deviceId}-${idx}`}
                  type="button"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onClick={() => handleSelectDevice(device.deviceId)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors text-left group cursor-pointer select-none ${
                    selected
                      ? 'bg-brand-500/15 text-white font-semibold'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="truncate flex-1 pr-2 select-none" title={label}>
                    {label}
                  </span>
                  {selected && (
                    <Check className="w-3.5 h-3.5 text-brand-400 flex-shrink-0 stroke-[2.5]" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Separator */}
        <div className="h-px bg-white/10 my-1 mx-1" />

        {/* Quick Link to Voice & Video Settings */}
        <button
          type="button"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onClick={() => {
            onClose();
            onOpenSettings('audio');
          }}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer select-none"
        >
          <Settings className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="truncate select-none">Configurações de Voz & Vídeo...</span>
        </button>
      </div>
    </>,
    document.body
  );
};
