const MAX_CACHED_CONVERSATIONS = 25;

/**
 * Updates a conversation message cache map and evicts the least-recently-used
 * entries beyond maxEntries (default 25), optionally pruning fetched-flags.
 */
export function setCachedMessagesLRU<T>(
  cache: Record<string, T[]>,
  lruOrder: string[],
  key: string,
  messages: T[],
  fetchedMap?: Record<string, boolean>,
  maxEntries: number = MAX_CACHED_CONVERSATIONS
): { cache: Record<string, T[]>; fetched?: Record<string, boolean> } {
  touchLruKey(lruOrder, key);

  const nextCache: Record<string, T[]> = { ...cache, [key]: messages };
  let nextFetched = fetchedMap;

  while (Object.keys(nextCache).length > maxEntries && lruOrder.length > 0) {
    const oldest = lruOrder.shift()!;
    if (oldest === key) {
      lruOrder.push(oldest);
      break;
    }
    if (oldest in nextCache) {
      delete nextCache[oldest];
      if (nextFetched && oldest in nextFetched) {
        if (nextFetched === fetchedMap) nextFetched = { ...fetchedMap };
        delete nextFetched[oldest];
      }
    }
  }

  for (const k of Object.keys(nextCache)) {
    if (Object.keys(nextCache).length <= maxEntries) break;
    if (k !== key) {
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
