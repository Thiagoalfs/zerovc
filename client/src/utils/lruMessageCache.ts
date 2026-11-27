const MAX_CACHED_CONVERSATIONS = 8;

/**
 * Updates a conversation message cache map and evicts the least-recently-used
 * entries beyond maxEntries (default 8), never evicting the updated or active key,
 * and pruning matching fetched-flags so evicted conversations refetch cleanly.
 */
export function setCachedMessagesLRU<T>(
  cache: Record<string, T[]>,
  lruOrder: string[],
  key: string,
  messages: T[],
  fetchedMap?: Record<string, boolean>,
  activeKey?: string | null,
  maxEntries: number = MAX_CACHED_CONVERSATIONS
): { cache: Record<string, T[]>; fetched?: Record<string, boolean> } {
  touchLruKey(lruOrder, key);

  const nextCache: Record<string, T[]> = { ...cache, [key]: messages };
  let nextFetched = fetchedMap;
  const isProtected = (k: string) => k === key || (Boolean(activeKey) && k === activeKey);

  while (Object.keys(nextCache).length > maxEntries) {
    const evictIdx = lruOrder.findIndex((k) => !isProtected(k) && k in nextCache);
    if (evictIdx === -1) break;
    const [oldest] = lruOrder.splice(evictIdx, 1);
    delete nextCache[oldest];
    if (nextFetched && oldest in nextFetched) {
      if (nextFetched === fetchedMap) nextFetched = { ...fetchedMap };
      delete nextFetched[oldest];
    }
  }

  for (const k of Object.keys(nextCache)) {
    if (Object.keys(nextCache).length <= maxEntries) break;
    if (!isProtected(k)) {
      delete nextCache[k];
      if (nextFetched && k in nextFetched) {
        if (nextFetched === fetchedMap) nextFetched = { ...fetchedMap };
        delete nextFetched[k];
      }
    }
  }

  return { cache: nextCache, fetched: nextFetched };
}

export function touchLruKey(lruOrder: string[], key: string): void {
  const idx = lruOrder.indexOf(key);
  if (idx !== -1) lruOrder.splice(idx, 1);
  lruOrder.push(key);
}
