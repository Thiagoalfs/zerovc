import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export const NetworkStatusBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [showRestored, setShowRestored] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let restoredTimer: NodeJS.Timeout | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      if (restoredTimer) clearTimeout(restoredTimer);
      restoredTimer = setTimeout(() => {
        setShowRestored(false);
      }, 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
      if (restoredTimer) clearTimeout(restoredTimer);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (restoredTimer) clearTimeout(restoredTimer);
    };
  }, []);

  if (isOnline && !showRestored) {
    return null;
  }

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none flex justify-center px-4 pt-2 transition-all duration-300 animate-in fade-in slide-in-from-top-2"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)' }}
    >
      {!isOnline ? (
        <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full bg-amber-500/90 text-black shadow-lg shadow-black/40 backdrop-blur-md text-xs font-semibold select-none border border-amber-400/40">
          <WifiOff className="w-4 h-4 animate-pulse flex-shrink-0" />
          <span>Sem conexão com a internet. Tentando reconectar...</span>
          <RefreshCw className="w-3.5 h-3.5 animate-spin ml-1 text-black/70 flex-shrink-0" />
        </div>
      ) : showRestored ? (
        <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600/90 text-white shadow-lg shadow-black/40 backdrop-blur-md text-xs font-semibold select-none border border-emerald-500/40">
          <Wifi className="w-4 h-4 text-emerald-200 flex-shrink-0" />
          <span>Conexão com a internet restabelecida!</span>
        </div>
      ) : null}
    </div>
  );
};
