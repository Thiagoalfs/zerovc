/**
 * ZeroVC Opt-in E2EE — Megolm Group Session Management
 *
 * Implements Milestone M3 (Requirement R3 §8, §10.1, §10.2):
 *  - Outbound GroupSession and InboundGroupSession via @kinsh/vodozemac-wasm
 *  - Ratchet lazy rotation: epoch change, 100 messages, or 7 days
 *  - Outbound key distribution to roster devices via to-device room_key
 *  - Monotonic message index tracking and anti-replay verification
 *  - Protected pickle storage in KeyStore IndexedDB
 */

import { ensureVodozemacInitialized, GroupSession, InboundGroupSession } from './vodozemac';
import { keyStore } from './keyStore';
import { EnvelopeV1, serializeEnvelope, parseEnvelope } from './envelope';
import { safeCryptoLogger } from './safeLogger';
import { api } from '../lib/api';
import { backupManager } from './backupManager';

export type { EnvelopeV1 };

export interface E2EEMeta {
  v: 1;
  alg: 'm.megolm.v1.aes-sha2';
  session_id: string;
  sender_device_id: string;
  msg_index: number;
  epoch: number;
  ciphertext_hash: string;
}

export interface RoomKeyToDevicePayload {
  msg_type: 'room_key';
  conversation_type: 'dm' | 'dm_group' | 'channel';
  conversation_id: string;
  session_id: string;
  session_key: string;
  epoch: number;
  sender_device_id: string;
}

export interface KeyRequestToDevicePayload {
  msg_type: 'key_request';
  conversation_type: 'dm' | 'dm_group' | 'channel';
  conversation_id: string;
  session_id: string;
  epoch: number;
  requester_device_id: string;
}

export class MegolmManager {
  private readonly MAX_SESSION_MESSAGES = 100;
  private readonly MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  // --- OUTBOUND SESSION MANAGEMENT ---

  /**
   * Retrieves an existing valid outbound GroupSession or creates a new one.
   * Performs ratchet rotation when:
   *  1. Current epoch > stored session epoch (membership/roster changed)
   *  2. messageIndex >= 100
   *  3. Session is older than 7 days
   */
  async getOrCreateOutboundSession(
    conversationId: string,
    currentEpoch: number,
    senderDeviceId?: string
  ): Promise<{ session: GroupSession; isNew: boolean; sessionKey?: string }> {
    await ensureVodozemacInitialized();

    const storedPickle = await keyStore.retrieveAndDecryptPickle('megolm_outbound', conversationId);
    const meta = await keyStore.getRecordMeta('megolm_outbound', conversationId);

    if (storedPickle && meta) {
      const storedEpoch = typeof meta.epoch === 'number' ? meta.epoch : 0;
      const createdAt = typeof meta.createdAt === 'number' ? meta.createdAt : meta.updatedAt || 0;
      const now = Date.now();
      const isExpired = now - createdAt >= this.MAX_SESSION_AGE_MS;

      // Only reuse if epoch matches, not expired, and under max message limit
      if (storedEpoch === currentEpoch && !isExpired) {
        const session = GroupSession.fromPickle(storedPickle);
        if (session.messageIndex() < this.MAX_SESSION_MESSAGES) {
          return { session, isNew: false };
        }
      }
    }

    // Create fresh outbound session
    const session = new GroupSession();
    const sessionKey = session.sessionKey();

    await this.persistOutbound(conversationId, session, currentEpoch, Date.now());

    // Auto-register inbound session for self so the sender can always decrypt their own messages across reloads/restarts
    try {
      await this.registerInboundSession(
        conversationId,
        session.sessionId(),
        sessionKey,
        senderDeviceId || 'self',
        currentEpoch
      );
    } catch (err) {
      safeCryptoLogger.warn('Failed to auto-register self inbound session', err);
    }

    try {
      backupManager.triggerAutoBackup();
    } catch (err) {
      safeCryptoLogger.warn('Failed to trigger auto-backup for new outbound session', err);
    }

    return { session, isNew: true, sessionKey };
  }

  /**
   * Forces invalidation of the outbound session for a conversation (e.g. member added/removed, rotation requested).
   */
  async invalidateOutboundSession(conversationId: string): Promise<void> {
    try {
      await keyStore.deleteRecord('megolm_outbound', conversationId);
      safeCryptoLogger.debug('Invalidated outbound Megolm session', { conversationId });
    } catch (err) {
      safeCryptoLogger.error('Failed to invalidate outbound session', { conversationId, error: err });
    }
  }

  /**
   * Distributes a newly created Megolm session key to all active devices in the conversation roster.
   */
  async distributeRoomKey(params: {
    conversationType: 'dm' | 'dm_group' | 'channel';
    conversationId: string;
    sessionId: string;
    sessionKey: string;
    epoch: number;
    senderDeviceId: string;
    recipientDevices: Array<{ device_id: string; user_id?: string }>;
  }): Promise<{ queued: number }> {
    const recipients = params.recipientDevices.filter((d) => d.device_id && d.device_id !== params.senderDeviceId);
    if (recipients.length === 0) {
      return { queued: 0 };
    }

    const payload: RoomKeyToDevicePayload = {
      msg_type: 'room_key',
      conversation_type: params.conversationType,
      conversation_id: params.conversationId,
      session_id: params.sessionId,
      session_key: params.sessionKey,
      epoch: params.epoch,
      sender_device_id: params.senderDeviceId,
    };

    const messages = recipients.map((r) => ({
      recipient_device_id: r.device_id,
      sender_device_id: params.senderDeviceId,
      msg_type: 'room_key',
      payload: JSON.stringify(payload),
    }));

    try {
      const res = await api.e2ee.sendToDevice(messages);
      return res;
    } catch (err: any) {
      safeCryptoLogger.error('Failed to distribute room key to-device', { error: err.message });
      throw err;
    }
  }

  /**
   * Encrypts a canonical message envelope using the outbound GroupSession and advances the ratchet.
   */
  async encryptMessage(
    conversationId: string,
    session: GroupSession,
    envelope: EnvelopeV1,
    currentEpoch: number,
    senderDeviceId: string
  ): Promise<{ ciphertext: string; meta: E2EEMeta }> {
    const plaintext = serializeEnvelope(envelope);
    const msgIndex = session.messageIndex();
    const ciphertext = session.encrypt(plaintext);

    // Save advanced ratchet state
    await this.persistOutbound(conversationId, session, currentEpoch);

    // Compute ciphertext SHA-256 digest
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(ciphertext));
    const ciphertextHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const meta: E2EEMeta = {
      v: 1,
      alg: 'm.megolm.v1.aes-sha2',
      session_id: session.sessionId(),
      sender_device_id: senderDeviceId,
      msg_index: msgIndex,
      epoch: currentEpoch,
      ciphertext_hash: ciphertextHash,
    };

    return { ciphertext, meta };
  }

  // --- INBOUND SESSION MANAGEMENT ---

  /**
   * Registers an imported inbound session from a room_key to-device distribution or key_request response.
   */
  async registerInboundSession(
    conversationId: string,
    sessionId: string,
    sessionKey: string,
    senderDeviceId: string,
    epoch: number
  ): Promise<void> {
    await ensureVodozemacInitialized();

    const inbound = new InboundGroupSession(sessionKey);
    const pickle = inbound.pickle();

    await keyStore.encryptAndStorePickle('megolm_inbound', sessionId, pickle, {
      sessionId,
      conversationId,
      sessionKey,
      senderDeviceId,
      epoch,
      firstKnownIndex: inbound.firstKnownIndex(),
      createdAt: Date.now(),
    });

    safeCryptoLogger.debug('Registered inbound Megolm session', { sessionId, conversationId, epoch });

    try {
      backupManager.triggerAutoBackup();
    } catch (err) {
      safeCryptoLogger.warn('Failed to trigger auto-backup after inbound session registration', err);
    }
  }

  /**
   * Checks whether an inbound session is present in local KeyStore.
   */
  async hasInboundSession(sessionId: string): Promise<boolean> {
    const pickle = await keyStore.retrieveAndDecryptPickle('megolm_inbound', sessionId);
    return Boolean(pickle);
  }

  /**
   * Decrypts a ciphertext message using the corresponding InboundGroupSession.
   * Advances the inbound ratchet and persists state.
   */
  async decryptMessage(
    sessionId: string,
    ciphertext: string,
    expectedIndex: number,
    conversationId?: string
  ): Promise<EnvelopeV1> {
    await ensureVodozemacInitialized();

    let storedPickle = await keyStore.retrieveAndDecryptPickle('megolm_inbound', sessionId);

    // Fallback: If not in inbound, check if we own the outbound session locally in KeyStore
    if (!storedPickle && conversationId) {
      try {
        const storedOutbound = await keyStore.retrieveAndDecryptPickle('megolm_outbound', conversationId);
        const meta = await keyStore.getRecordMeta('megolm_outbound', conversationId);
        if (storedOutbound && meta && meta.sessionId === sessionId) {
          const outboundSession = GroupSession.fromPickle(storedOutbound);
          const sessionKey = outboundSession.sessionKey();
          await this.registerInboundSession(
            conversationId,
            sessionId,
            sessionKey,
            meta.senderDeviceId || 'self',
            meta.epoch || 0
          );
          storedPickle = await keyStore.retrieveAndDecryptPickle('megolm_inbound', sessionId);
        }
      } catch (err) {
        safeCryptoLogger.warn('Failed to derive inbound session from local outbound session', err);
      }
    }

    if (!storedPickle) {
      throw new Error('KEY_MISSING'); // Prompts key_request protocol
    }

    const inbound = InboundGroupSession.fromPickle(storedPickle);
    const decryptedJson = inbound.decrypt(ciphertext);
    const parsed: { plaintext: string; messageIndex: number } = JSON.parse(decryptedJson);

    // Anti-replay and ratchet index verification
    if (parsed.messageIndex !== expectedIndex) {
      throw new Error(`REPLAY_OR_INDEX_MISMATCH: expected ${expectedIndex}, received ${parsed.messageIndex}`);
    }

    // Persist advanced ratchet state
    await keyStore.encryptAndStorePickle('megolm_inbound', sessionId, inbound.pickle());

    // Parse and validate canonical envelope
    return parseEnvelope(parsed.plaintext);
  }

  /**
   * Responds to an incoming key_request if we own the corresponding outbound session.
   */
  async handleIncomingKeyRequest(request: KeyRequestToDevicePayload, myDeviceId: string): Promise<void> {
    if (!request.conversation_id || !request.session_id) return;

    const storedPickle = await keyStore.retrieveAndDecryptPickle('megolm_outbound', request.conversation_id);
    const meta = await keyStore.getRecordMeta('megolm_outbound', request.conversation_id);

    if (storedPickle && meta && meta.sessionId === request.session_id) {
      const session = GroupSession.fromPickle(storedPickle);
      const sessionKey = session.sessionKey();

      const payload: RoomKeyToDevicePayload = {
        msg_type: 'room_key',
        conversation_type: request.conversation_type,
        conversation_id: request.conversation_id,
        session_id: request.session_id,
        session_key: sessionKey,
        epoch: meta.epoch || request.epoch,
        sender_device_id: myDeviceId,
      };

      await api.e2ee.sendToDevice([
        {
          recipient_device_id: request.requester_device_id,
          sender_device_id: myDeviceId,
          msg_type: 'room_key',
          payload: JSON.stringify(payload),
        },
      ]);
      safeCryptoLogger.debug('Responded to key_request', { sessionId: request.session_id, requester: request.requester_device_id });
    }
  }

  private async persistOutbound(
    conversationId: string,
    session: GroupSession,
    epoch: number,
    createdAt?: number
  ): Promise<void> {
    const pickle = session.pickle();
    const existingMeta = await keyStore.getRecordMeta('megolm_outbound', conversationId);

    await keyStore.encryptAndStorePickle('megolm_outbound', conversationId, pickle, {
      conversationId,
      sessionId: session.sessionId(),
      epoch,
      messageIndex: session.messageIndex(),
      createdAt: createdAt || existingMeta?.createdAt || Date.now(),
    });
  }
}

export const megolmManager = new MegolmManager();
