type BackHandler = () => boolean | void;

const handlerStack: { id: string; handler: BackHandler }[] = [];
let isInitialized = false;

export const pushBackHandler = (id: string, handler: BackHandler): (() => void) => {
  // Remove if existing with same id to avoid duplicates
  const existingIdx = handlerStack.findIndex((item) => item.id === id);
  if (existingIdx !== -1) {
    handlerStack.splice(existingIdx, 1);
  }

  handlerStack.push({ id, handler });

  return () => {
    const idx = handlerStack.findIndex((item) => item.id === id);
    if (idx !== -1) {
      handlerStack.splice(idx, 1);
    }
  };
};

export const popBackHandler = (id?: string) => {
  if (id) {
    const idx = handlerStack.findIndex((item) => item.id === id);
    if (idx !== -1) {
      handlerStack.splice(idx, 1);
    }
  } else {
    handlerStack.pop();
  }
};

export const triggerBackNavigation = (): boolean => {
  if (handlerStack.length > 0) {
    const top = handlerStack.pop();
    if (top) {
      const result = top.handler();
      if (result === false) {
        // Continue to next handler if current one didn't handle it
        return triggerBackNavigation();
      }
      return true;
    }
  }
  return false;
};

export const initMobileBackHandler = () => {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // 1. Try to register with Capacitor App plugin dynamically if available
  try {
    const capacitorWindow = window as any;
    if (capacitorWindow.Capacitor?.Plugins?.App?.addListener) {
      capacitorWindow.Capacitor.Plugins.App.addListener('backButton', (data: any) => {
        const handled = triggerBackNavigation();
        if (!handled && data?.canGoBack === false) {
          try {
            capacitorWindow.Capacitor.Plugins.App.exitApp();
          } catch {
            // ignore
          }
        }
      });
    }
  } catch {
    // ignore
  }

  // 2. Fallback to popstate / history navigation
  window.addEventListener('popstate', () => {
    const handled = triggerBackNavigation();
    if (!handled) {
      // Allow standard browser back
    }
  });
};
