/**
 * ZeroVC Opt-in E2EE — Pure Messaging Codec
 *
 * Implements Milestone M3 (Requirement R3 §8, §10.1, §11.2):
 *  - Pure, functional transformation between transport payloads and renderable models
 *  - Decoupled from Zustand stores and unread message counters
 *  - Isolated failure handling: returns standardized undecryptable placeholder
 *    without throwing uncaught exceptions or breaking component trees
 *  - Automatic triggering of key_request protocol on missing Megolm sessions
 */

import { megolmManager, E2EEMeta } from '../crypto/megolmSession';
import { EnvelopeV1, EnvelopeAttachment, EnvelopeEdit, EnvelopeReaction } from '../crypto/envelope';
import { keyRequestManager } from '../crypto/keyRequestManager';
import { safeCryptoLogger } from '../crypto/safeLogger';

export interface DecodedMessageResult {
  id: string;
  content: string;
  encrypted: boolean;
  decryptionStatus: 'decrypted' | 'undecryptable' | 'plaintext';
  attachments?: EnvelopeAttachment[] | any[];
  reply_to_id?: string;
  mentions?: string[];
  edit?: EnvelopeEdit;
  reaction?: EnvelopeReaction;
  isUndecryptablePlaceholder?: boolean;
  rawMeta?: E2EEMeta;
}

export class MessageCodec {
  /**
   * Decodes a raw message from the API or WebSocket gateway.
   * Completely resilient: NEVER throws an exception to the caller.
   */
  async decodeMessage(rawMessage: any): Promise<DecodedMessageResult> {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return {
        id: '',
        content: '',
        encrypted: false,
        decryptionStatus: 'plaintext',
      };
    }

    // 1. Plaintext message
    if (!rawMessage.encrypted) {
      return {
        id: rawMessage.id,
        content: rawMessage.content || '',
        encrypted: false,
        decryptionStatus: 'plaintext',
        attachments: rawMessage.attachments,
        reply_to_id: rawMessage.reply_to_id,
      };
    }

    // 2. Encrypted message: validate ciphertext and meta
    const ciphertext = rawMessage.e2ee_ciphertext;
    const meta: E2EEMeta = rawMessage.e2ee_meta;

    if (!ciphertext || !meta || !meta.session_id) {
      return {
        id: rawMessage.id,
        content: 'Mensagem criptografada indisponível',
        encrypted: true,
        decryptionStatus: 'undecryptable',
        isUndecryptablePlaceholder: true,
        rawMeta: meta,
      };
    }

    try {
      // 3. Attempt Megolm Inbound decryption
      const envelope = await megolmManager.decryptMessage(
        meta.session_id,
        ciphertext,
        meta.msg_index
      );

      return {
        id: rawMessage.id,
        content: envelope.body,
        encrypted: true,
        decryptionStatus: 'decrypted',
        attachments: envelope.attachments,
        reply_to_id: envelope.reply_to,
        mentions: envelope.mentions,
        edit: envelope.edit,
        reaction: envelope.reaction,
        rawMeta: meta,
      };
    } catch (err: any) {
      // 4. In case of missing key, trigger key_request in background
      if (err.message === 'KEY_MISSING') {
        const conversationId = rawMessage.dm_room_id || rawMessage.group_id || rawMessage.channel_id;
        const conversationType = rawMessage.dm_room_id
          ? 'dm'
          : rawMessage.group_id
          ? 'dm_group'
          : 'channel';

        if (conversationId) {
          keyRequestManager.queueKeyRequest({
            conversationId,
            conversationType,
            sessionId: meta.session_id,
            epoch: meta.epoch || 0,
            senderDeviceId: meta.sender_device_id,
          }).catch(() => {});
        }
      }

      safeCryptoLogger.debug('Message decryption failed, returning isolated placeholder', {
        messageId: rawMessage.id,
        sessionId: meta?.session_id,
        error: err.message,
      });

      // 5. Return standardized isolated placeholder without throwing
      return {
        id: rawMessage.id,
        content: 'Mensagem criptografada indisponível',
        encrypted: true,
        decryptionStatus: 'undecryptable',
        isUndecryptablePlaceholder: true,
        rawMeta: meta,
      };
    }
  }

  /**
   * Encodes and encrypts an outgoing message into transport representation.
   */
  async encodeMessage(params: {
    conversationId: string;
    conversationType: 'dm' | 'dm_group' | 'channel';
    currentEpoch: number;
    envelope: EnvelopeV1;
    senderDeviceId: string;
    rosterDevices?: Array<{ device_id: string; user_id?: string }>;
  }): Promise<{
    encrypted: true;
    e2ee_ciphertext: string;
    e2ee_meta: E2EEMeta;
    content: string;
  }> {
    // 1. Get or create outbound session with ratchet rotation check
    const { session, isNew, sessionKey } = await megolmManager.getOrCreateOutboundSession(
      params.conversationId,
      params.currentEpoch
    );

    // 2. If new session, distribute key to roster devices via to-device Olm
    if (isNew && sessionKey && params.rosterDevices && params.rosterDevices.length > 0) {
      try {
        await megolmManager.distributeRoomKey({
          conversationType: params.conversationType,
          conversationId: params.conversationId,
          sessionId: session.sessionId(),
          sessionKey,
          epoch: params.currentEpoch,
          senderDeviceId: params.senderDeviceId,
          recipientDevices: params.rosterDevices,
        });
      } catch (err) {
        safeCryptoLogger.error('Failed to distribute room key during message encode', err);
      }
    }

    // 3. Encrypt canonical envelope
    const { ciphertext, meta } = await megolmManager.encryptMessage(
      params.conversationId,
      session,
      params.envelope,
      params.currentEpoch,
      params.senderDeviceId
    );

    // Return transport payload (content MUST be empty string for zero plaintext on server)
    return {
      encrypted: true,
      e2ee_ciphertext: ciphertext,
      e2ee_meta: meta,
      content: '',
    };
  }
}

export const messageCodec = new MessageCodec();
