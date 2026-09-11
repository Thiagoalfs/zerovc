import { useSettingsStore } from '../stores/settingsStore';

export type HapticType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 22,
  heavy: 45,
  selection: 8,
  success: [12, 40, 18],
  warning: [20, 50, 20],
  error: [30, 40, 30, 40, 35],
};

export const isHapticsSupported = (): boolean => {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator;
};

export const triggerHaptic = (type: HapticType = 'light') => {
  try {
    const enabled = useSettingsStore.getState().hapticFeedback;
    if (!enabled) return;

    if (isHapticsSupported()) {
      const pattern = PATTERNS[type] || 15;
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore if not supported or blocked by user activation policy
  }
};

export const hapticLight = () => triggerHaptic('light');
export const hapticMedium = () => triggerHaptic('medium');
export const hapticHeavy = () => triggerHaptic('heavy');
export const hapticSelection = () => triggerHaptic('selection');
export const hapticSuccess = () => triggerHaptic('success');
export const hapticWarning = () => triggerHaptic('warning');
export const hapticError = () => triggerHaptic('error');
