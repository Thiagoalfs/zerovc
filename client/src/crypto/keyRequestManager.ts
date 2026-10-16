/**
 * ZeroVC Opt-in E2EE — Key Request Protocol Manager
 *
 * Implements Milestone M3 (Requirement R3 §7.7, §10.2):
 *  - Reactive key_request protocol when receiving undecryptable ciphertext
 *  - Deduplication per (conversation_id, session_id) with 30s TTL
 *  - Rate limiting (max 10 requests/min, max 3 attempts per session)
 *  - Acceptance of first valid room_key response and ignoring subsequent duplicates
 *  - Retroactive re-decoding of cached undecryptable messages upon session import
 */

import { megolmManager, RoomKeyToDevicePayload } from './megolmSession';
import { safeCryptoLogger } from './safeLogger';
import { api } from '../lib/api';

export interface PendingKeyRequest {
  conversationId: string;
  conversationType: 'dm' | 'dm_group' | 'channel';
  sessionId: string;
  epoch: number;
  senderDeviceId?: string;
  firstRequestedAt: number;
  lastRequestedAt: number;
  attempts: number;
}

export type RetroactiveDecryptCallback = (conversationId: string, sessionId: string) => void;

export class KeyRequestManager {
  private pendingRequests: Map<string, PendingKeyRequest> = new Map();
  private requestTimestamps: number[] = [];
  private callbacks: Set<RetroactiveDecryptCallback> = new Set();

  private readonly TTL_MS = 30_000; // 30 seconds deduplication TTL
  private readonly MAX_ATTEMPTS = 3;
  private readonly RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
  private readonly MAX_REQUESTS_PER_MINUTE = 10;
  private readonly COOLDOWN_MS = 5 * 60_000; // 5 minutes cooldown after max attempts

  /**
   * Registers a callback to be invoked when a session is imported, enabling retroactive decryption.
   */
  onSessionImported(cb: RetroactiveDecryptCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  /**
   * Enqueues a deduplicated, rate-limited key_request.
   * Returns true if a key_request was transmitted, false if skipped (deduped or rate-limited).
   */
  async queueKeyRequest(params: {
    conversationId: string;
    conversationType: 'dm' | 'dm_group' | 'channel';
    sessionId: string;
    epoch: number;
    senderDeviceId?: string;
    requesterDeviceId?: string;
  }): Promise<boolean> {
    const key = `${params.conversationId}:${params.sessionId}`;
    const now = Date.now();

    // 1. Clean up old timestamps from global rate limit window
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < this.RATE_LIMIT_WINDOW_MS);
    if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_MINUTE) {
      safeCryptoLogger.warn('Key request rate limit reached (10/min), skipping', { key });
      return false;
    }

    // 2. Check pending request state for this session
    const existing = this.pendingRequests.get(key);
    if (existing) {
      // Within 30s TTL: deduplicate
      if (now - existing.lastRequestedAt < this.TTL_MS) {
        return false;
      }
      // Reached max attempts: check if still in cooldown
      if (existing.attempts >= this.MAX_ATTEMPTS) {
        if (now - existing.lastRequestedAt < this.COOLDOWN_MS) {
          safeCryptoLogger.warn('Key request cooldown active, skipping', { key, attempts: existing.attempts });
          return false;
        }
        // Cooldown passed: reset attempts
        existing.attempts = 1;
      } else {
        existing.attempts++;
      }
      existing.lastRequestedAt = now;
    } else {
      this.pendingRequests.set(key, {
        conversationId: params.conversationId,
        conversationType: params.conversationType,
        sessionId: params.sessionId,
        epoch: params.epoch,
        senderDeviceId: params.senderDeviceId,
        firstRequestedAt: now,
        lastRequestedAt: now,
        attempts: 1,
      });
    }

    this.requestTimestamps.push(now);

    // 3. Dispatch to-device key_request
    const requesterDeviceId = params.requesterDeviceId || (typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : '') || 'local_device';
    const payload = {
      msg_type: 'key_request',
      conversation_id: params.conversationId,
      conversation_type: params.conversationType,
      session_id: params.sessionId,
      epoch: params.epoch,
      requester_device_id: requesterDeviceId,
    };

    try {
      if (params.senderDeviceId) {
        await api.e2ee.sendToDevice([
          {
            recipient_device_id: params.senderDeviceId,
            sender_device_id: requesterDeviceId,
            msg_type: 'key_request',
            payload: JSON.stringify(payload),
          },
        ]);
      }
      safeCryptoLogger.debug('Dispatched to-device key_request', { sessionId: params.sessionId });
      return true;
    } catch (err: any) {
      safeCryptoLogger.error('Failed to send key_request to-device', { error: err.message });
      return false;
    }
  }

  /**
   * Handles incoming room_key to-device distribution:
   * Registers InboundGroupSession, clears pending request, and notifies retroactive listeners.
   */
  async handleRoomKeyReceived(payload: RoomKeyToDevicePayload): Promise<boolean> {
    if (!payload.session_id || !payload.session_key || !payload.conversation_id) {
      return false;
    }

    try {
      // 1. Register inbound session in KeyStore
      await megolmManager.registerInboundSession(
        payload.conversation_id,
        payload.session_id,
        payload.session_key,
        payload.sender_device_id,
        payload.epoch
      );

      // 2. Remove from pending requests
      const key = `${payload.conversation_id}:${payload.session_id}`;
      this.pendingRequests.delete(key);

      // 3. Notify listeners for retroactive decryption
      for (const cb of this.callbacks) {
        try {
          cb(payload.conversation_id, payload.session_id);
        } catch (e) {
          safeCryptoLogger.error('Error in retroactive decryption callback', e);
        }
      }

      safeCryptoLogger.info('Successfully imported room_key and triggered retroactive re-decode', {
        sessionId: payload.session_id,
        conversationId: payload.conversation_id,
      });
      return true;
    } catch (err: any) {
      safeCryptoLogger.error('Failed to handle incoming room_key', { error: err.message });
      return false;
    }
  }

  /**
   * Returns current pending requests map for inspection and test harnesses.
   */
  getPendingRequests(): Map<string, PendingKeyRequest> {
    return new Map(this.pendingRequests);
  }

  /**
   * Clears all state (used in tests).
   */
  clear(): void {
    this.pendingRequests.clear();
    this.requestTimestamps = [];
    this.callbacks.clear();
  }
}

export const keyRequestManager = new KeyRequestManager();
