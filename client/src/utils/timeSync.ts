/**
 * Time synchronization and clock-skew compensation utility.
 *
 * Keeps track of the offset between the local client system clock and the server's UTC clock
 * using the standard HTTP 'Date' response header on every API request.
 *
 * Example:
 * If the user's PC is 16 seconds ahead of real UTC time, serverTimeOffset will be ~ -16000ms.
 * Server timestamps (like voice session `joined_at`) are adjusted to the local client's time
 * frame so that elapsed time calculations start accurately at 00:00.
 */

let serverTimeOffsetMs = 0;
let hasSynced = false;

/**
 * Updates the estimated server time offset from an HTTP 'Date' header or server timestamp.
 */
export function updateServerTime(serverDateHeader?: string | number | Date | null): void {
  if (!serverDateHeader) return;
  try {
    const serverTime =
      typeof serverDateHeader === 'number'
        ? serverDateHeader
        : new Date(serverDateHeader).getTime();

    if (!isNaN(serverTime) && serverTime > 0) {
      const now = Date.now();
      const measuredOffset = serverTime - now;

      if (!hasSynced) {
        serverTimeOffsetMs = measuredOffset;
        hasSynced = true;
      } else {
        // Exponential moving average to smooth network jitter while adapting to drift
        serverTimeOffsetMs = Math.round(serverTimeOffsetMs * 0.8 + measuredOffset * 0.2);
      }
    }
  } catch {}
}

/**
 * Returns the estimated offset in milliseconds between server and client:
 * serverTimeOffset = serverTime - clientTime
 */
export function getServerTimeOffset(): number {
  return serverTimeOffsetMs;
}

/**
 * Indicates whether at least one server timestamp has been synced.
 */
export function isServerTimeSynced(): boolean {
  return hasSynced;
}

/**
 * Converts a server-generated UTC timestamp (ms) to the local client's time frame.
 * (serverTimestamp - serverTimeOffset = clientReferenceTime)
 */
export function serverTimeToClientTime(serverTimestampMs: number): number {
  return serverTimestampMs - serverTimeOffsetMs;
}

/**
 * Converts a local client timestamp (ms) to estimated server UTC time (ms).
 */
export function clientTimeToServerTime(clientTimestampMs: number): number {
  return clientTimestampMs + serverTimeOffsetMs;
}

/**
 * Returns the estimated current server UTC timestamp in milliseconds.
 */
export function getEstimatedServerNow(): number {
  return Date.now() + serverTimeOffsetMs;
}
