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

export function restoreChatScrollPosition(chatKey: string, container: HTMLElement): void {
  const saved = savedChatScroll.get(chatKey);
  const apply = () => {
    if (!saved || saved.wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTop = saved.scrollTop;
    }
  };

  apply();
  requestAnimationFrame(apply);
  if (!saved || saved.wasAtBottom) {
    // Re-clamp to bottom once late images/markdown finish initial layout
    setTimeout(apply, 80);
  }
}
