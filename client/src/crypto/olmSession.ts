import { ensureVodozemacInitialized, Session, InboundResult } from './vodozemac';
import { identityManager } from './identity';
import { keyStore } from './keyStore';

export interface ToDevicePayload {
  msg_type: string;
  sender_device_id: string;
  recipient_device_id: string;
  type: 0 | 1; // 0 = PreKey, 1 = Normal
  body: string; // Base64 ciphertext
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
    await keyStore.encryptAndStorePickle('olm_sessions', sessionId, pickle, {
      sessionId,
      ...(peerDeviceId ? { peerDeviceId } : {}),
      ...(peerIdentityKey ? { peerIdentityKey } : {})
    });
  }
}

export const olmSessionManager = new OlmSessionManager();
