/**
 * ZeroVC Opt-in E2EE — LiveKit Call Key State Machine & Manager
 *
 * Implements Milestone M4 (Requirement R4, Spec §13):
 *  - State machine: NO_KEY -> GENERATING -> DISTRIBUTING -> ACTIVE -> ROTATING / REQUESTING
 *  - Deterministic distributor election: min_lex(device_id) across active call devices
 *  - 256-bit symmetric call key generated via WebCrypto (crypto.getRandomValues)
 *  - Olm to-device key exchange: msg_type: 'call_key'
 *  - Ratchet rotation on participant join (backward secrecy) and leave (forward secrecy)
 *  - 150-250ms debounce on join/leave re-keying to prevent churn storms
 *  - Ephemeral key lifecycle: keys discarded and zeroed upon call disconnect
 */

import { api } from '../lib/api';
import { safeCryptoLogger } from './safeLogger';
import { livekitE2EEManager } from '../lib/livekitE2EE';
import { uint8ArrayToBase64, base64ToUint8Array } from './attachments';

export type CallKeyState =
  | 'NO_KEY'
  | 'GENERATING'
  | 'DISTRIBUTING'
  | 'ACTIVE'
  | 'ROTATING'
  | 'REQUESTING';

export interface CallKeyToDevicePayload {
  msg_type: 'call_key';
  call_id: string;
  key: string; // Base64-encoded 32 bytes (256 bits)
  key_index: number;
  epoch: number;
  sender_device_id: string;
}

export interface CallKeyManagerOptions {
  onStateChange?: (state: CallKeyState) => void;
  onKeyRotated?: (keyIndex: number, epoch: number) => void;
  debounceMs?: number; // 150-250ms range, default 200ms
  sendToDeviceFn?: (messages: Array<{
    recipient_device_id: string;
    sender_device_id: string;
    msg_type: string;
    payload: string;
  }>) => Promise<any>;
  setKeyFn?: (key: ArrayBuffer) => Promise<void>;
}

/**
 * Deterministically elects the call key distributor device.
 * Canonical rule: min(device_id) lexicographically among connected participants.
 */
export function electDistributor(deviceIds: string[]): string | null {
  if (!deviceIds || deviceIds.length === 0) return null;
  const filtered = Array.from(
    new Set(deviceIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
  );
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return filtered[0];
}

/**
 * Generates a 256-bit (32-byte) cryptographically secure random symmetric key.
 */
export function generateCallKey(): Uint8Array {
  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  return key;
}

/**
 * Ephemeral memory sanitization: overwrites key buffer with zeros.
 */
export function zeroKey(key: Uint8Array): void {
  key.fill(0);
}

export class CallKeyManager {
  private state: CallKeyState = 'NO_KEY';
  private callId: string | null = null;
  private myDeviceId: string | null = null;
  private distributorDeviceId: string | null = null;
  private connectedDevices: Set<string> = new Set();
  private currentKey: Uint8Array | null = null;
  private keyIndex: number = 0;
  private epoch: number = 0;

  private rotationTimer: any = null;
  private debounceMs: number = 200; // Between 150ms and 250ms

  private onStateChange?: (state: CallKeyState) => void;
  private onKeyRotated?: (keyIndex: number, epoch: number) => void;
  private customSendToDevice?: (messages: any[]) => Promise<any>;
  private customSetKey?: (key: ArrayBuffer) => Promise<void>;

  constructor(options?: CallKeyManagerOptions) {
    if (options) {
      this.configure(options);
    }
  }

  configure(options: CallKeyManagerOptions): void {
    if (options.onStateChange) this.onStateChange = options.onStateChange;
    if (options.onKeyRotated) this.onKeyRotated = options.onKeyRotated;
    if (options.debounceMs !== undefined) {
      this.debounceMs = Math.max(10, options.debounceMs);
    }
    if (options.sendToDeviceFn) this.customSendToDevice = options.sendToDeviceFn;
    if (options.setKeyFn) this.customSetKey = options.setKeyFn;
  }

  getState(): CallKeyState {
    return this.state;
  }

  getCallId(): string | null {
    return this.callId;
  }

  getMyDeviceId(): string | null {
    return this.myDeviceId;
  }

  getDistributorDeviceId(): string | null {
    return this.distributorDeviceId;
  }

  isDistributor(): boolean {
    return !!this.myDeviceId && this.distributorDeviceId === this.myDeviceId;
  }

  getKeyIndex(): number {
    return this.keyIndex;
  }

  getEpoch(): number {
    return this.epoch;
  }

  getConnectedDevices(): string[] {
    return Array.from(this.connectedDevices);
  }

  getCurrentKey(): Uint8Array | null {
    if (!this.currentKey) return null;
    return new Uint8Array(this.currentKey);
  }

  private setState(newState: CallKeyState): void {
    if (this.state === newState) return;
    this.state = newState;
    safeCryptoLogger.info('CallKeyManager', `Transitioned to state: ${newState}`);
    this.onStateChange?.(newState);
  }

  /**
   * Initializes call key management when connecting to a voice/video call.
   */
  async startCall(
    callId: string,
    myDeviceId: string,
    connectedDeviceIds: string[] = []
  ): Promise<void> {
    this.endCall(); // Clean previous state if any

    this.callId = callId;
    this.myDeviceId = myDeviceId;
    this.connectedDevices = new Set(
      [myDeviceId, ...connectedDeviceIds].filter((id) => Boolean(id && id.trim()))
    );

    this.distributorDeviceId = electDistributor(Array.from(this.connectedDevices));

    safeCryptoLogger.info('CallKeyManager', `Started call ${callId}. Elected distributor: ${this.distributorDeviceId}`);

    if (this.isDistributor()) {
      await this.generateAndDistributeKey();
    } else {
      this.setState('REQUESTING');
    }
  }

  /**
   * Handles a participant joining the call.
   * Backward Secrecy: triggers ratchet rotation so new participant cannot decrypt past media.
   */
  async handleParticipantJoined(deviceId: string, immediate = false): Promise<void> {
    if (!this.callId || !deviceId) return;
    if (this.connectedDevices.has(deviceId)) return;

    this.connectedDevices.add(deviceId);
    const previousDistributor = this.distributorDeviceId;
    this.distributorDeviceId = electDistributor(Array.from(this.connectedDevices));

    safeCryptoLogger.info(
      'CallKeyManager',
      `Participant joined: ${deviceId}. Connected count: ${this.connectedDevices.size}. Distributor: ${this.distributorDeviceId}`
    );

    if (this.isDistributor()) {
      if (previousDistributor !== this.myDeviceId) {
        // Became distributor upon participant addition
        await this.generateAndDistributeKey();
      } else {
        // Already distributor: schedule rotation with debounce (backward secrecy)
        await this.scheduleRotation(immediate);
      }
    } else if (this.state === 'NO_KEY') {
      this.setState('REQUESTING');
    }
  }

  /**
   * Handles a participant leaving the call.
   * Forward Secrecy: triggers ratchet rotation so departed participant cannot decrypt future media.
   */
  async handleParticipantLeft(deviceId: string, immediate = false): Promise<void> {
    if (!this.callId || !deviceId) return;
    if (!this.connectedDevices.has(deviceId)) return;

    this.connectedDevices.delete(deviceId);
    const previousDistributor = this.distributorDeviceId;
    this.distributorDeviceId = electDistributor(Array.from(this.connectedDevices));

    safeCryptoLogger.info(
      'CallKeyManager',
      `Participant left: ${deviceId}. Remaining count: ${this.connectedDevices.size}. Distributor: ${this.distributorDeviceId}`
    );

    if (this.connectedDevices.size === 0) {
      this.endCall();
      return;
    }

    if (this.isDistributor()) {
      if (previousDistributor !== this.myDeviceId) {
        // Elected as new distributor because previous distributor left
        safeCryptoLogger.info('CallKeyManager', 'Previous distributor left. Assuming leadership and re-keying');
        await this.generateAndDistributeKey();
      } else {
        // Still distributor: schedule rotation with debounce (forward secrecy)
        await this.scheduleRotation(immediate);
      }
    }
  }

  /**
   * Schedules debounced rotation to aggregate rapid join/leave bursts (150-250ms).
   */
  private async scheduleRotation(immediate = false): Promise<void> {
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }

    if (immediate) {
      await this.rotateKey();
      return;
    }

    this.rotationTimer = setTimeout(() => {
      this.rotationTimer = null;
      void this.rotateKey();
    }, this.debounceMs);
  }

  /**
   * Generates a new key and distributes it (used for initial creation or election failover).
   */
  private async generateAndDistributeKey(): Promise<void> {
    this.setState('GENERATING');

    if (this.currentKey) {
      zeroKey(this.currentKey);
      this.currentKey = null;
    }

    this.currentKey = generateCallKey();
    this.keyIndex++;
    this.epoch++;

    await this.applyKeyToProvider(this.currentKey);

    this.setState('DISTRIBUTING');
    await this.broadcastCallKeyToParticipants(this.currentKey);

    this.setState('ACTIVE');
    this.onKeyRotated?.(this.keyIndex, this.epoch);
  }

  /**
   * Rotates key: NO_KEY/ACTIVE -> ROTATING -> GENERATING -> DISTRIBUTING -> ACTIVE
   */
  async rotateKey(): Promise<void> {
    if (!this.callId || !this.isDistributor()) return;

    this.setState('ROTATING');
    this.setState('GENERATING');

    if (this.currentKey) {
      zeroKey(this.currentKey);
      this.currentKey = null;
    }

    this.currentKey = generateCallKey();
    this.keyIndex++;
    this.epoch++;

    await this.applyKeyToProvider(this.currentKey);

    this.setState('DISTRIBUTING');
    await this.broadcastCallKeyToParticipants(this.currentKey);

    this.setState('ACTIVE');
    safeCryptoLogger.info('CallKeyManager', `Rotated call key to index ${this.keyIndex}, epoch ${this.epoch}`);
    this.onKeyRotated?.(this.keyIndex, this.epoch);
  }

  /**
   * Broadcasts the symmetric call key to all other connected participant devices via Olm to-device.
   */
  private async broadcastCallKeyToParticipants(key: Uint8Array): Promise<void> {
    if (!this.callId || !this.myDeviceId) return;

    const recipients = Array.from(this.connectedDevices).filter((id) => id !== this.myDeviceId);
    if (recipients.length === 0) return;

    const keyB64 = uint8ArrayToBase64(key);
    const payload: CallKeyToDevicePayload = {
      msg_type: 'call_key',
      call_id: this.callId,
      key: keyB64,
      key_index: this.keyIndex,
      epoch: this.epoch,
      sender_device_id: this.myDeviceId,
    };

    const messages = recipients.map((devId) => ({
      recipient_device_id: devId,
      sender_device_id: this.myDeviceId!,
      msg_type: 'call_key',
      payload: JSON.stringify(payload),
    }));

    try {
      if (this.customSendToDevice) {
        await this.customSendToDevice(messages);
      } else {
        await api.e2ee.sendToDevice(messages);
      }
      safeCryptoLogger.info('CallKeyManager', `Dispatched call_key to ${recipients.length} device(s)`);
    } catch (err) {
      safeCryptoLogger.warn('CallKeyManager', 'Failed to dispatch call key via to-device:', err);
    }
  }

  /**
   * Handles incoming Olm to-device message with msg_type: 'call_key'.
   * Enforces 4 security guards:
   *  1. Echo rejection: ignore self-reflected packets.
   *  2. Distributor self-preservation: elected distributor rejects keys from subordinate peers.
   *  3. Authorized sender verification: non-distributor rejects keys from non-distributors.
   *  4. Monotonic key index ratchet: strictly reject replayed or outdated key_index/epoch.
   */
  async handleIncomingCallKey(payload: CallKeyToDevicePayload): Promise<void> {
    if (!payload || payload.msg_type !== 'call_key') {
      safeCryptoLogger.warn('CallKeyManager', 'Ignored invalid payload msg_type');
      return;
    }

    // 1. Guard Echo / Reflection: Ignore self-reflected packets
    if (this.myDeviceId && payload.sender_device_id === this.myDeviceId) {
      safeCryptoLogger.debug('CallKeyManager', 'Ignored self-reflected call key payload');
      return;
    }

    // 2. Guard Rogue Distributor: Elected distributor must NEVER accept incoming keys from subordinate devices
    if (this.isDistributor()) {
      safeCryptoLogger.warn(
        'CallKeyManager',
        `Elected distributor rejected incoming call key from ${payload.sender_device_id}`
      );
      return;
    }

    // 3. Guard Authorized Sender: Non-distributor must only accept keys from elected distributor (or valid failover successor)
    const isCurrentDistributor = !this.distributorDeviceId || payload.sender_device_id === this.distributorDeviceId;
    let isFailoverDistributor = false;
    if (!isCurrentDistributor && this.distributorDeviceId && typeof payload.key_index === 'number' && payload.key_index > this.keyIndex) {
      const remainingWithoutCurrent = Array.from(this.connectedDevices).filter((id) => id !== this.distributorDeviceId);
      if (remainingWithoutCurrent.length > 0) {
        const nextInLine = electDistributor(remainingWithoutCurrent);
        if (nextInLine === payload.sender_device_id) {
          isFailoverDistributor = true;
          safeCryptoLogger.info(
            'CallKeyManager',
            `Accepted key from failover successor distributor ${payload.sender_device_id} (previous ${this.distributorDeviceId})`
          );
          const prevDistributor = this.distributorDeviceId;
          this.connectedDevices.delete(prevDistributor);
          this.distributorDeviceId = payload.sender_device_id;
        }
      }
    }

    if (!isCurrentDistributor && !isFailoverDistributor) {
      safeCryptoLogger.warn(
        'CallKeyManager',
        `Rejected call key from non-distributor ${payload.sender_device_id} (expected ${this.distributorDeviceId})`
      );
      return;
    }

    if (this.callId && payload.call_id !== this.callId) {
      safeCryptoLogger.warn('CallKeyManager', `Ignored call key for mismatching call: ${payload.call_id} vs ${this.callId}`);
      return;
    }

    // 4. Guard Monotonic Key Index: Anti-replay & forward secrecy ratchet enforcement
    if (
      this.keyIndex > 0 &&
      typeof payload.key_index === 'number' &&
      (payload.key_index < this.keyIndex ||
        (payload.key_index === this.keyIndex && (typeof payload.epoch !== 'number' || payload.epoch <= this.epoch)))
    ) {
      safeCryptoLogger.warn(
        'CallKeyManager',
        `Rejected replayed or outdated call key: index ${payload.key_index} <= ${this.keyIndex}, epoch ${payload.epoch} <= ${this.epoch}`
      );
      return;
    }

    if (!payload.key) {
      safeCryptoLogger.warn('CallKeyManager', 'Ignored call key payload with missing key');
      return;
    }

    let keyBytes: Uint8Array;
    try {
      keyBytes = base64ToUint8Array(payload.key);
    } catch (e) {
      safeCryptoLogger.error('CallKeyManager', 'Failed to decode base64 call key:', e);
      return;
    }

    if (keyBytes.length !== 32) {
      safeCryptoLogger.error('CallKeyManager', `Rejected call key with invalid length: ${keyBytes.length} (must be 32 bytes)`);
      zeroKey(keyBytes);
      return;
    }

    // Zero out old key before storing new one
    if (this.currentKey) {
      zeroKey(this.currentKey);
      this.currentKey = null;
    }

    this.currentKey = keyBytes;
    this.keyIndex = payload.key_index;
    this.epoch = payload.epoch;

    await this.applyKeyToProvider(this.currentKey);
    this.setState('ACTIVE');

    safeCryptoLogger.info(
      'CallKeyManager',
      `Applied incoming call key from ${payload.sender_device_id} (keyIndex: ${this.keyIndex}, epoch: ${this.epoch})`
    );
  }

  /**
   * Synchronizes the raw key buffer with LiveKit's ExternalE2EEKeyProvider.
   */
  private async applyKeyToProvider(key: Uint8Array): Promise<void> {
    try {
      const rawBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
      if (this.customSetKey) {
        await this.customSetKey(rawBuffer);
        return;
      }

      const provider = livekitE2EEManager.getKeyProvider();
      if (provider) {
        await provider.setKey(rawBuffer);
        safeCryptoLogger.info('CallKeyManager', 'Synchronized key with ExternalE2EEKeyProvider');
      }
    } catch (err) {
      safeCryptoLogger.warn('CallKeyManager', 'Failed to set key on LiveKit key provider:', err);
    }
  }

  /**
   * Discards and zeroes all ephemeral call keys upon call disconnect.
   */
  endCall(): void {
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }

    if (this.currentKey) {
      zeroKey(this.currentKey);
      this.currentKey = null;
    }

    this.callId = null;
    this.myDeviceId = null;
    this.distributorDeviceId = null;
    this.connectedDevices.clear();
    this.keyIndex = 0;
    this.epoch = 0;

    this.setState('NO_KEY');
    safeCryptoLogger.info('CallKeyManager', 'Call ended. Ephemeral keys zeroed and discarded.');
  }
}

export const callKeyManager = new CallKeyManager();
