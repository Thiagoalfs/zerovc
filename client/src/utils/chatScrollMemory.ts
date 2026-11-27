interface SavedScrollState {
  scrollTop: number;
  wasAtBottom: boolean;
}

const savedChatScroll = new Map<string, SavedScrollState>();

export function saveChatScrollPosition(chatKey: string, container: HTMLElement): void {
  const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 35;
  savedChatScroll.set(chatKey, {
    scrollTop: container.scrollTop,
    wasAtBottom,
  });
}

export function shouldAutoScrollToBottom(chatKey: string): boolean {
  const saved = savedChatScroll.get(chatKey);
  return !saved || saved.wasAtBottom;
}

export function restoreChatScrollPosition(chatKey: string, container: HTMLElement): () => void {
  const saved = savedChatScroll.get(chatKey);
  let cancelled = false;
  let rafId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const apply = () => {
    if (cancelled) return;
    if (!saved || saved.wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTop = saved.scrollTop;
    }
  };

  apply();
  rafId = requestAnimationFrame(apply);
  if (!saved || saved.wasAtBottom) {
    // Re-clamp to bottom once late images/markdown finish initial layout
    timeoutId = setTimeout(apply, 80);
  }

  return () => {
    cancelled = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (timeoutId !== null) clearTimeout(timeoutId);
  };
}
