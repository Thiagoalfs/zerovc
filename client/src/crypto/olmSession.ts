import { ensureVodozemacInitialized, Session, InboundResult } from './vodozemac';
import { identityManager } from './identity';
import { keyStore } from './keyStore';
import { api } from '../lib/api';

export interface ToDevicePayload {
  msg_type: string;
  sender_device_id: string;
  recipient_device_id: string;
  type: 0 | 1; // 0 = PreKey, 1 = Normal
  body: string; // Base64 ciphertext
}

export interface OlmEncryptedToDevicePayload {
  olm_v: 1;
  type: 0 | 1;
  body: string;
  sender_identity_key?: string;
}

export function isOlmEncryptedPayload(payload: any): payload is OlmEncryptedToDevicePayload {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    (payload.type === 0 || payload.type === 1) &&
    typeof payload.body === 'string' &&
    payload.body.length > 0
  );
}

export class OlmSessionManager {
  async createOutboundSession(
    peerDeviceId: string,
    peerCurve25519Identity: string,
    peerOtkCurve25519: string
  ): Promise<Session> {
    await ensureVodozemacInitialized();
    const account = identityManager.getAccount();

    const session = account.createOutboundSession(peerCurve25519Identity, peerOtkCurve25519);
    await this.persistSession(session, peerDeviceId, peerCurve25519Identity);
    return session;
  }

  async encryptToDeviceMessage(session: Session, payload: object): Promise<{ type: 0 | 1; body: string }> {
    const plaintext = JSON.stringify(payload);
    const rawResult = session.encrypt(plaintext);
    const parsed: { type: 0 | 1; body: string } = JSON.parse(rawResult);

    // Save ratcheted session state
    await this.persistSession(session);
    return parsed;
  }

  async getSessionsForDevice(peerDeviceId: string): Promise<Session[]> {
    await ensureVodozemacInitialized();
    const all = await keyStore.getAllRecords<any>('olm_sessions');
    const matching = all
      .filter((r) => r && r.peerDeviceId === peerDeviceId && r.sessionId)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const sessions: Session[] = [];
    for (const rec of matching) {
      try {
        const pickle = await keyStore.retrieveAndDecryptPickle('olm_sessions', rec.sessionId);
        if (pickle) sessions.push(Session.fromPickle(pickle));
      } catch {}
    }
    return sessions;
  }

  /**
   * Encrypts an arbitrary to-device JSON payload for a peer device using an existing
   * Olm session or by claiming an OTK and creating a new outbound Olm session.
   */
  async encryptPayloadForDevice(
    peerDeviceId: string,
    payload: object,
    peerCurve25519Key?: string,
    peerUserId?: string
  ): Promise<OlmEncryptedToDevicePayload> {
    await ensureVodozemacInitialized();
    try {
      identityManager.getAccount();
    } catch {
      await identityManager.init();
    }

    let sessions = await this.getSessionsForDevice(peerDeviceId);
    let session: Session | null = sessions[0] || null;

    if (!session) {
      let curveKey = peerCurve25519Key;
      if (!curveKey && peerUserId) {
        try {
          const devices = await api.e2ee.getUserDevices(peerUserId);
          const match = Array.isArray(devices)
            ? devices.find((d: any) => d?.id === peerDeviceId && !d.revoked_at)
            : null;
          if (match?.curve25519_key) {
            curveKey = match.curve25519_key;
          }
        } catch {}
      }

      if (!curveKey) {
        throw new Error(`Missing Curve25519 identity key for device ${peerDeviceId}`);
      }

      const claimRes: any = await api.e2ee.claimOTKs([peerDeviceId]);
      const claimed = claimRes?.claimed_keys?.[peerDeviceId] ?? claimRes?.[peerDeviceId];
      if (!claimed?.public_key) {
        throw new Error(`No one-time or fallback key available for device ${peerDeviceId}`);
      }

      session = await this.createOutboundSession(peerDeviceId, curveKey, claimed.public_key);
    }

    const encrypted = await this.encryptToDeviceMessage(session, payload);
    return {
      olm_v: 1,
      type: encrypted.type,
      body: encrypted.body,
      sender_identity_key: identityManager.getIdentityKeys().curve25519,
    };
  }

  /**
   * Decrypts an Olm-encrypted to-device payload (PreKey type 0 or Normal type 1).
   */
  async decryptToDevicePayload<T = any>(peerDeviceId: string, rawPayload: any): Promise<T> {
    const parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    if (!isOlmEncryptedPayload(parsed)) {
      throw new Error('Olm-encrypted payload required');
    }

    await ensureVodozemacInitialized();
    try {
      identityManager.getAccount();
    } catch {
      await identityManager.init();
    }

    if (parsed.type === 0) {
      const { plaintext } = await this.handleInboundPreKeyMessage(peerDeviceId, parsed.body);
      return JSON.parse(plaintext) as T;
    }

    const candidateSessions = await this.getSessionsForDevice(peerDeviceId);
    for (const session of candidateSessions) {
      try {
        const plaintext = await this.decryptNormalMessage(session, parsed.body);
        return JSON.parse(plaintext) as T;
      } catch {}
    }

    throw new Error(`No valid Olm session could decrypt message from ${peerDeviceId}`);
  }

  async handleInboundPreKeyMessage(
    peerDeviceId: string,
    prekeyBody: string
  ): Promise<{ session: Session; plaintext: string; senderIdentityKey: string }> {
    await ensureVodozemacInitialized();
    const account = identityManager.getAccount();

    const inboundResult: InboundResult = account.createInboundSession(prekeyBody);
    const plaintext = inboundResult.plaintext;
    const senderIdentityKey = inboundResult.senderIdentityKey;
    const session = inboundResult.takeSession();

    await this.persistSession(session, peerDeviceId, senderIdentityKey);
    return { session, plaintext, senderIdentityKey };
  }

  async decryptNormalMessage(session: Session, body: string): Promise<string> {
    const plaintext = session.decrypt(1, body);
    await this.persistSession(session);
    return plaintext;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    await ensureVodozemacInitialized();
    const pickle = await keyStore.retrieveAndDecryptPickle('olm_sessions', sessionId);
    if (!pickle) return null;
    return Session.fromPickle(pickle);
  }

  private async persistSession(session: Session, peerDeviceId?: string, peerIdentityKey?: string): Promise<void> {
    const sessionId = session.sessionId();
    const pickle = session.pickle();
    const existing = (!peerDeviceId || !peerIdentityKey)
      ? await keyStore.getRecordMeta('olm_sessions', sessionId)
      : null;
    const resolvedPeerDeviceId = peerDeviceId || existing?.peerDeviceId;
    const resolvedPeerIdentityKey = peerIdentityKey || existing?.peerIdentityKey;
    await keyStore.encryptAndStorePickle('olm_sessions', sessionId, pickle, {
      sessionId,
      ...(resolvedPeerDeviceId ? { peerDeviceId: resolvedPeerDeviceId } : {}),
      ...(resolvedPeerIdentityKey ? { peerIdentityKey: resolvedPeerIdentityKey } : {})
    });
  }
}

export const olmSessionManager = new OlmSessionManager();
