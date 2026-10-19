import React, { useState, useEffect, useRef } from 'react';
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

export const AudioDeviceDropup: React.FC<AudioDeviceDropupProps> = ({
  type,
  isOpen,
  onClose,
  onOpenSettings,
  anchorRef,
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [coords, setCoords] = useState<{ bottom: number; left: number }>({ bottom: 60, left: 10 });
  const popoutRef = useRef<HTMLDivElement>(null);

  const {
    audioInputDeviceId,
    audioOutputDeviceId,
    setAudioInputDevice,
    setAudioOutputDevice,
  } = useSettingsStore();

  const activeDeviceId = type === 'input' ? audioInputDeviceId : audioOutputDeviceId;

  // Calculate position relative to anchor element
  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    const updatePosition = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const popoutWidth = 270;
      const spacing = 8;

      const bottom = Math.max(10, window.innerHeight - rect.top + spacing);
      
      // Center roughly over the anchor button, keeping within screen bounds
      let left = rect.left - 40;
      if (left + popoutWidth > window.innerWidth - 12) {
        left = window.innerWidth - popoutWidth - 12;
      }
      if (left < 12) {
        left = 12;
      }

      setCoords({ bottom, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorRef]);

  // Load available devices
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

  if (!isOpen) return null;

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
    // Fallback: if no device selected in store/localStorage yet
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

      {/* Dropup Container */}
      <div
        ref={popoutRef}
        style={{
          bottom: `${coords.bottom}px`,
          left: `${coords.left}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[130] w-64 sm:w-72 bg-background-darkest/95 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 select-none text-gray-200"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 pb-2 mb-1">
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
        <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar py-0.5">
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
                  onClick={() => handleSelectDevice(device.deviceId)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors text-left group cursor-pointer ${
                    selected
                      ? 'bg-brand-500/15 text-white font-semibold'
                      : 'text-gray-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="truncate flex-1 pr-2" title={label}>
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
          onClick={() => {
            onClose();
            onOpenSettings('audio');
          }}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="truncate">Configurações de Voz & Vídeo...</span>
        </button>
      </div>
    </>,
    document.body
  );
};
