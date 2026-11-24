import React, { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Headphones, Check, Settings, Loader2, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { Slider } from '@/components/ui/slider';
import {
  CONTEXT_MENU_PANEL_CLASS,
  CONTEXT_MENU_ITEM_CLASS,
  CONTEXT_MENU_SEPARATOR_CLASS,
} from '@/components/ui/context-menu-1';

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

  const popoutWidth = 240;
  const spacing = 8;
  const bottom = Math.max(10, window.innerHeight - rect.top + spacing);

  let left = rect.left - 24;
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
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right');
  const [submenuBottomOffset, setSubmenuBottomOffset] = useState(0);
  const popoutRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{ bottom: number; left: number } | null>(() => {
    return calculateCoords(anchorRef.current);
  });

  const {
    audioInputDeviceId,
    audioOutputDeviceId,
    setAudioInputDevice,
    setAudioOutputDevice,
    inputVolume,
    outputVolume,
    setInputVolume,
    setOutputVolume,
  } = useSettingsStore();

  const activeDeviceId = type === 'input' ? audioInputDeviceId : audioOutputDeviceId;
  const volume = type === 'input' ? inputVolume : outputVolume;
  const setVolume = type === 'input' ? setInputVolume : setOutputVolume;

  useLayoutEffect(() => {
    if (!isOpen) {
      setIsSubmenuOpen(false);
      return;
    }
    const initialCoords = calculateCoords(anchorRef.current);
    if (initialCoords) {
      setCoords(initialCoords);
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
      setSubmenuSide(initialCoords.left + 240 + 240 > vw - 10 ? 'left' : 'right');
    }
  }, [isOpen, anchorRef]);

  useLayoutEffect(() => {
    if (!isSubmenuOpen || !submenuRef.current) {
      setSubmenuBottomOffset(0);
      return;
    }
    const subEl = submenuRef.current;
    const subRect = subEl.getBoundingClientRect();
    const margin = 10;
    if (subRect.top < margin) {
      setSubmenuBottomOffset(subRect.top - margin);
    } else if (subRect.bottom > window.innerHeight - margin) {
      setSubmenuBottomOffset(subRect.bottom - (window.innerHeight - margin));
    } else {
      setSubmenuBottomOffset(0);
    }
  }, [isSubmenuOpen, devices.length]);

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

  const submenuLabel = type === 'input' ? 'Dispositivos de entrada' : 'Dispositivos de saída';

  return createPortal(
    <>
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

      <div
        ref={popoutRef}
        data-floating-overlay="true"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        style={{
          bottom: `${coords.bottom}px`,
          left: `${coords.left}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        className={`fixed z-[130] w-[240px] select-none animate-in fade-in zoom-in-95 duration-75 font-sans pointer-events-auto ${CONTEXT_MENU_PANEL_CLASS}`}
      >
        <div className="space-y-0.5">
          {/* Volume Slider (synced with Voice & Video settings) */}
          <div
            className="px-2.5 py-1.5 flex flex-col gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsSubmenuOpen(false)}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
              <div className="flex items-center gap-2 min-w-0">
                {type === 'input' ? (
                  <Mic className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                ) : volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-dnd flex-shrink-0" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                )}
                <span className="truncate">
                  {type === 'input' ? 'Volume de entrada' : 'Volume de saída'}
                </span>
              </div>
              <span className="text-brand-400 font-mono text-[11px] font-bold flex-shrink-0">
                {volume}%
              </span>
            </div>

            <Slider
              min={0}
              max={100}
              step={1}
              value={[volume]}
              onValueChange={([val]) => setVolume(val)}
            />
          </div>

          <div className={CONTEXT_MENU_SEPARATOR_CLASS} />

          {/* Devices Submenu */}
          <div
            className="relative"
            onMouseEnter={() => setIsSubmenuOpen(true)}
            onMouseLeave={() => setIsSubmenuOpen(false)}
          >
            <button
              type="button"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setIsSubmenuOpen((prev) => !prev);
              }}
              className={`w-full justify-between gap-3 text-xs text-left group ${CONTEXT_MENU_ITEM_CLASS} ${
                isSubmenuOpen ? 'bg-brand-500/15 text-white' : ''
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-current [&_svg]:!text-current">
                  {type === 'input' ? (
                    <Mic className="w-4 h-4" />
                  ) : (
                    <Headphones className="w-4 h-4" />
                  )}
                </span>
                <span className="truncate">{submenuLabel}</span>
              </div>
              <ChevronRight
                className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${
                  submenuSide === 'left'
                    ? 'rotate-180 text-gray-400 group-hover:text-white'
                    : 'text-gray-400 group-hover:text-white'
                }`}
              />
            </button>

            {isSubmenuOpen && (
              <div
                ref={submenuRef}
                style={{ bottom: `${submenuBottomOffset}px` }}
                className={`absolute min-w-[220px] max-w-[280px] max-h-[260px] overflow-y-auto no-scrollbar space-y-0.5 z-[131] animate-in fade-in zoom-in-95 duration-100 ${CONTEXT_MENU_PANEL_CLASS} ${
                  submenuSide === 'left' ? 'right-full mr-1' : 'left-full ml-1'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {isLoading && devices.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-400">
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
                        className={`w-full justify-between gap-3 text-xs text-left group ${CONTEXT_MENU_ITEM_CLASS} ${
                          selected ? 'bg-brand-500/15 text-white font-semibold' : ''
                        }`}
                      >
                        <span className="truncate flex-1">{label}</span>
                        {selected && (
                          <Check className="w-3.5 h-3.5 text-brand-400 flex-shrink-0 stroke-[2.5]" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className={CONTEXT_MENU_SEPARATOR_CLASS} />

          {/* Quick Link to Voice & Video Settings */}
          <button
            type="button"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onMouseEnter={() => setIsSubmenuOpen(false)}
            onClick={() => {
              onClose();
              onOpenSettings('audio');
            }}
            className={`w-full justify-start gap-2 text-xs text-left ${CONTEXT_MENU_ITEM_CLASS}`}
          >
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-current [&_svg]:!text-current">
              <Settings className="w-4 h-4" />
            </span>
            <span className="truncate">Configurações de Voz & Vídeo...</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};
