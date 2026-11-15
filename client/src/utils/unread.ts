import { useEffect, type RefObject } from 'react';

/**
 * Resolves the first unread message ID from a chronologically ordered list (oldest -> newest).
 */
export function resolveFirstUnreadMessageId<T extends { id: string }>(
  messages: T[],
  lastReadMessageId?: string | null,
  unreadCount = 0
): string | null {
  if (!messages || messages.length === 0) return null;

  if (lastReadMessageId) {
    const idx = messages.findIndex((m) => m.id === lastReadMessageId);
    if (idx !== -1) {
      return idx + 1 < messages.length ? messages[idx + 1].id : null;
    }
    return unreadCount > 0 ? messages[0].id : null;
  }

  if (unreadCount > 0) {
    return messages[Math.max(0, messages.length - unreadCount)].id;
  }

  return null;
}

/**
 * When all messages fit on screen without a scrollbar, onScroll never fires;
 * clear the unread divider and badge shortly after the user has seen it.
 */
export function useAutoClearVisibleUnread(
  containerRef: RefObject<HTMLDivElement | null>,
  firstUnreadId: string | null | undefined,
  messageCount: number,
  onMarkAsRead: () => void
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !firstUnreadId || messageCount === 0) return;
    if (container.scrollHeight <= container.clientHeight + 35) {
      const timer = setTimeout(onMarkAsRead, 1500);
      return () => clearTimeout(timer);
    }
  }, [firstUnreadId, messageCount]);
}
