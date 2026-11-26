import { useEffect, useState } from 'react';
import { isTauri } from '../lib/platform';
import { rustMediaAdapter } from '../lib/rustMediaAdapter';

/**
 * Detects whether at least one camera (videoinput) is available on the device.
 * Uses native device enumeration on Tauri and `navigator.mediaDevices.enumerateDevices()` on Web/Electron.
 */
export function useHasCamera(enabled: boolean = true): boolean {
  const [hasCamera, setHasCamera] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const checkCameras = async () => {
      try {
        if (isTauri()) {
          const devices = await rustMediaAdapter.listDevices();
          if (!cancelled) {
            setHasCamera(devices.some((d) => d.kind === 'videoinput'));
          }
          return;
        }
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) {
            setHasCamera(devices.some((d) => d.kind === 'videoinput'));
          }
        }
      } catch {
        if (!cancelled) {
          setHasCamera(false);
        }
      }
    };

    void checkCameras();

    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    mediaDevices?.addEventListener?.('devicechange', checkCameras);
    window.addEventListener('focus', checkCameras);

    return () => {
      cancelled = true;
      mediaDevices?.removeEventListener?.('devicechange', checkCameras);
      window.removeEventListener('focus', checkCameras);
    };
  }, [enabled]);

  return hasCamera;
}
