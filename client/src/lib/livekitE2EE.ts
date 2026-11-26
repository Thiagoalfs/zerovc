import { ExternalE2EEKeyProvider, isE2EESupported } from 'livekit-client';
import E2EEWorker from '../workers/e2ee.worker?worker';
import { safeCryptoLogger } from '../crypto/safeLogger';
import { isTauri } from './platform';
import { rustMediaAdapter } from './rustMediaAdapter';

export interface E2EESupportCheck {
  supported: boolean;
  status: 'ALLOWED' | 'BLOCKED';
  fallbackAllowed: boolean;
  modal?: 'UPGRADE_REQUIRED';
}

/**
 * Evaluates whether the current runtime environment supports Insertable Streams / WebRTC E2EE.
 * Web & Electron 30: Supported.
 * Android WebView (Chrome >= 86): Supported.
 * Android WebView (Chrome < 86): Blocked.
 */
export function isCallE2EESupported(): boolean {
  if (isTauri()) return true;
  return isE2EESupported();
}

/**
 * Strict call gate: verifies if E2EE is supported before any WebRTC peer connection is opened.
 * ZERO PLAINTEXT FALLBACK: If unsupported in an E2EE room, connection is strictly blocked.
 */
export function checkCallEligibility(opts: {
  isE2EERoom: boolean;
  e2eeSupported?: boolean;
}): E2EESupportCheck {
  const supported = opts.e2eeSupported !== undefined ? opts.e2eeSupported : isCallE2EESupported();

  if (opts.isE2EERoom) {
    if (!supported) {
      safeCryptoLogger.warn('CallGate', 'Blocked call attempt on E2EE room: client lacks insertable streams');
      return {
        supported: false,
        status: 'BLOCKED',
        fallbackAllowed: false,
        modal: 'UPGRADE_REQUIRED',
      };
    }
    return {
      supported: true,
      status: 'ALLOWED',
      fallbackAllowed: false,
    };
  }

  return {
    supported: true,
    status: 'ALLOWED',
    fallbackAllowed: true,
  };
}

export function assertE2EESupported(): void {
  const check = checkCallEligibility({ isE2EERoom: true });
  if (check.status === 'BLOCKED') {
    throw new Error('E2EE_UNSUPPORTED: Browser or WebView does not support Insertable Streams (Chrome >= 86 required). Plaintext fallback forbidden.');
  }
}

export interface E2EERoomSetup {
  keyProvider: ExternalE2EEKeyProvider;
  worker: Worker;
}

export function createE2EEOptions(): E2EERoomSetup {
  return livekitE2EEManager.initialize();
}

function encodeKeyToBase64(callKey: string | ArrayBuffer): string {
  const bytes =
    typeof callKey === 'string'
      ? new TextEncoder().encode(callKey)
      : new Uint8Array(callKey);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class LiveKitE2EEManager {
  private keyProvider: ExternalE2EEKeyProvider | null = null;
  private worker: Worker | null = null;
  private currentKeyIndex: number = 0;

  initialize(): E2EERoomSetup {
    assertE2EESupported();
    if (isTauri()) {
      const bridgeProvider = {
        setKey: async (key: string | ArrayBuffer) => {
          await this.setCallKey(key);
        },
        ratchetKey: (participantIdentity?: string, keyIndex?: number) => {
          this.ratchetKey(participantIdentity, keyIndex);
        },
      } as unknown as ExternalE2EEKeyProvider;
      this.keyProvider = bridgeProvider;
      this.worker = null;
      safeCryptoLogger.info('LiveKitE2EE', 'Initialized native Rust E2EE key provider bridge');
      return {
        keyProvider: bridgeProvider,
        worker: undefined as unknown as Worker,
      };
    }
    this.keyProvider = new ExternalE2EEKeyProvider({
      keySize: 256,
      ratchetSalt: 'LK_RATCHET_SALT_V1',
      ratchetWindowSize: 16,
      failureTolerance: -1,
      keyringSize: 16,
    });
    this.worker = new E2EEWorker();
    safeCryptoLogger.info('LiveKitE2EE', 'Initialized LiveKit E2EE 256-bit key provider and worker');
    return {
      keyProvider: this.keyProvider,
      worker: this.worker,
    };
  }

  getKeyProvider(): ExternalE2EEKeyProvider | null {
    return this.keyProvider;
  }

  getWorker(): Worker | null {
    return this.worker;
  }

  async setCallKey(callKey: string | ArrayBuffer): Promise<void> {
    if (isTauri()) {
      const keyBase64 = encodeKeyToBase64(callKey);
      await rustMediaAdapter.setE2eeKey(keyBase64);
      safeCryptoLogger.info('LiveKitE2EE', 'Set call encryption key on Rust media bridge');
      return;
    }
    if (!this.keyProvider) {
      throw new Error('Key provider not initialized');
    }
    await this.keyProvider.setKey(callKey);
    safeCryptoLogger.info('LiveKitE2EE', 'Set call encryption key');
  }

  ratchetKey(participantIdentity?: string, keyIndex?: number): void {
    const resolvedIndex = keyIndex ?? this.currentKeyIndex;
    if (isTauri()) {
      void rustMediaAdapter.ratchetE2eeKey(participantIdentity ?? null, resolvedIndex);
      safeCryptoLogger.info('LiveKitE2EE', 'Triggered Rust media bridge call key ratchet request');
      return;
    }
    if (!this.keyProvider) {
      throw new Error('Key provider not initialized');
    }
    this.keyProvider.ratchetKey(participantIdentity, resolvedIndex);
    safeCryptoLogger.info('LiveKitE2EE', 'Triggered call key ratchet request');
  }

  cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.keyProvider = null;
    safeCryptoLogger.info('LiveKitE2EE', 'Terminated E2EE worker and cleared key provider');
  }
}

export const livekitE2EEManager = new LiveKitE2EEManager();
