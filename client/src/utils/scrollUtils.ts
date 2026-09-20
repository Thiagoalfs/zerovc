import { useSettingsStore } from '../stores/settingsStore';

let activeAnimationId: number | null = null;

/**
 * Smoothly scrolls a container to the bottom with an exponential speed curve
 * based on the distance from the bottom.
 */
export function smoothScrollToBottomExponential(
  container: HTMLElement | null,
  options?: {
    forceInstant?: boolean;
    onComplete?: () => void;
  }
) {
  if (!container) return;

  const reducedMotion = useSettingsStore.getState().reducedMotion;
  if (reducedMotion || options?.forceInstant) {
    container.scrollTop = container.scrollHeight;
    options?.onComplete?.();
    return;
  }

  if (activeAnimationId !== null) {
    cancelAnimationFrame(activeAnimationId);
    activeAnimationId = null;
  }

  const startTop = container.scrollTop;
  const maxScroll = container.scrollHeight - container.clientHeight;
  const distance = Math.max(0, maxScroll - startTop);

  if (distance <= 1) {
    container.scrollTop = container.scrollHeight;
    options?.onComplete?.();
    return;
  }

  // Duration scales with distance exponent:
  // Short distance (~100px): ~150ms
  // Medium distance (~1000px): ~260ms
  // Long distance (>5000px): ~380ms
  const baseDuration = 150;
  const variableDuration = Math.min(260, Math.pow(distance, 0.35) * 16);
  const duration = Math.min(420, Math.max(150, baseDuration + variableDuration));

  const startTime = performance.now();

  // Exponential Ease-Out curve for rapid initial acceleration and buttery landing
  const easeOutExpo = (x: number): number => {
    return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
  };

  const step = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(1, elapsed / duration);
    const easedProgress = easeOutExpo(progress);

    // Dynamically track any changes to scrollHeight during animation
    const currentMax = container.scrollHeight - container.clientHeight;
    container.scrollTop = startTop + (currentMax - startTop) * easedProgress;

    if (progress < 1) {
      activeAnimationId = requestAnimationFrame(step);
    } else {
      container.scrollTop = container.scrollHeight;
      activeAnimationId = null;
      options?.onComplete?.();
    }
  };

  activeAnimationId = requestAnimationFrame(step);
}
