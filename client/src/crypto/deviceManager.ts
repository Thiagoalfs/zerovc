/**
 * ZeroVC Opt-in E2EE — Device Registration & Lifecycle Manager
 *
 * Implements Milestone M2 (Requirement R2 §10.1, §10.2):
 *  - Automatic Olm account & device registration on login
 *  - Ed25519 identity signature verification of device keys
 *  - One-Time Key (OTK) pool generation and replenishment
 *  - Device revocation with cryptographic state invalidation
 *  - Integration with REST API and WebSocket gateway
 */

import { identityManager, DeviceIdentityKeys } from './identity';
import { keyStore } from './keyStore';
import { safeCryptoLogger } from './safeLogger';
import { socket } from '../lib/socket';

export interface RegisteredDevice {
  id: string;
  user_id: string;
  session_id?: string;
  curve25519_key: string;
  ed25519_key: string;
  identity_signature: string;
  fallback_key?: string;
  revoked_at?: string | null;
  created_at: string;
}

export interface RegisterDevicePayload {
  curve25519_key: string;
  ed25519_key: string;
  identity_signature: string;
  fallback_key?: string;
  one_time_keys: Record<string, string>;
}

export interface ClaimedOTKResult {
  [deviceId: string]: {
    key_id: string;
    public_key: string;
  };
}

export class DeviceManager {
  private deviceId: string | null = null;
  private currentUserId: string | null = null;
  private isInitializing = false;

  /**
   * Initializes local identity, checks stored device ID, and returns device keys.
   */
  async init(userId: string): Promise<{ deviceId: string | null; keys: DeviceIdentityKeys }> {
    this.currentUserId = userId;
    const { keys } = await identityManager.init();

    // Check localStorage or keyStore for cached device ID
    if (typeof localStorage !== 'undefined') {
      const storedId = localStorage.getItem('zerovc_device_id');
      if (storedId) {
        this.deviceId = storedId;
      }
    }

    if (!this.deviceId) {
      const record = await keyStore.retrieveAndDecryptPickle('account', 'device_metadata');
      if (record) {
        try {
          const parsed = JSON.parse(record);
          if (parsed.deviceId && parsed.userId === userId) {
            this.deviceId = parsed.deviceId;
          }
        } catch {}
      }
    }

    return { deviceId: this.deviceId, keys };
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  getDeviceKeys(): DeviceIdentityKeys {
    return identityManager.getIdentityKeys();
  }

  /**
   * Constructs the deterministic canonical message string that binds
   * the Olm Curve25519 key and Ed25519 device key to the user's identity signature.
   */
  getCanonicalDeviceMessage(curve25519Key: string, ed25519Key: string): string {
    return `zerovc:device:${curve25519Key}:${ed25519Key}`;
  }

  /**
   * Ensures the current device is registered on the backend.
   * If not registered, performs full registration with identity signature and 50 OTKs.
   */
  async ensureRegistered(
    userId: string,
    apiClient: {
      getIdentity: (userId: string) => Promise<{ identity_public_key: string } | null>;
      registerIdentity: (pubKey: string) => Promise<any>;
      getUserDevices: (userId: string) => Promise<RegisteredDevice[]>;
      registerDevice: (payload: RegisterDevicePayload) => Promise<RegisteredDevice>;
    }
  ): Promise<string> {
    if (this.isInitializing) {
      // Avoid duplicate concurrent registrations
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (this.deviceId) return this.deviceId;
    }

    this.isInitializing = true;
    try {
      const { keys } = await this.init(userId);

      // 1. Ensure User Identity exists on backend
      try {
        const identity = await apiClient.getIdentity(userId);
        if (!identity || !identity.identity_public_key) {
          await apiClient.registerIdentity(keys.ed25519);
        }
      } catch (err: any) {
        if (err?.status === 404 || err?.message?.includes('not found')) {
          await apiClient.registerIdentity(keys.ed25519);
        }
      }

      // 2. Check if current device is already known and active on backend
      if (this.deviceId) {
        try {
          const activeDevices = await apiClient.getUserDevices(userId);
          const found = activeDevices.find(
            d => d.id === this.deviceId && !d.revoked_at && d.curve25519_key === keys.curve25519
          );
          if (found) {
            safeCryptoLogger.info('DeviceManager', `Device ${this.deviceId} already active on server`);
            socket.updateE2EEDeviceId(this.deviceId);
            return this.deviceId;
          }
        } catch (err) {
          safeCryptoLogger.warn('DeviceManager', 'Failed to fetch user devices, proceeding with registration check', err);
        }
      }

      // 3. Register fresh device
      safeCryptoLogger.info('DeviceManager', 'Registering new Olm device on backend');

      // Canonical device signature with Ed25519 identity key
      const canonicalMsg = this.getCanonicalDeviceMessage(keys.curve25519, keys.ed25519);
      const identitySignature = identityManager.sign(canonicalMsg);

      // Generate 50 One-Time Keys (OTKs) + fallback prekey
      const unpublished = await identityManager.generateOneTimeKeys(50);
      const fallbackKey = unpublished.fallbackKey
        ? Object.values(unpublished.fallbackKey)[0]
        : undefined;

      const payload: RegisterDevicePayload = {
        curve25519_key: keys.curve25519,
        ed25519_key: keys.ed25519,
        identity_signature: identitySignature,
        fallback_key: fallbackKey,
        one_time_keys: unpublished.oneTimeKeys,
      };

      const registered = await apiClient.registerDevice(payload);
      this.deviceId = registered.id;

      // Mark OTKs as published locally
      await identityManager.markKeysPublished();

      // Persist device ID
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('zerovc_device_id', registered.id);
      }
      await keyStore.encryptAndStorePickle(
        'account',
        'device_metadata',
        JSON.stringify({ deviceId: registered.id, userId }),
        { id: 'device_metadata' }
      );

      // Synchronize device ID with WebSocket Gateway
      socket.updateE2EEDeviceId(registered.id);

      safeCryptoLogger.info('DeviceManager', `Device registered successfully: ${registered.id}`);
      return registered.id;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Replenishes One-Time Keys (OTKs) on the backend when remaining pool is low.
   */
  async replenishOTKs(
    apiClient: {
      replenishOTKs: (deviceId: string, keys: Record<string, string>) => Promise<any>;
    },
    count: number = 50
  ): Promise<number> {
    if (!this.deviceId) {
      throw new Error('Cannot replenish OTKs: device not registered');
    }

    safeCryptoLogger.info('DeviceManager', `Generating and publishing ${count} new OTKs`);
    const unpublished = await identityManager.generateOneTimeKeys(count);

    await apiClient.replenishOTKs(this.deviceId, unpublished.oneTimeKeys);
    await identityManager.markKeysPublished();

    return Object.keys(unpublished.oneTimeKeys).length;
  }

  /**
   * Revokes a registered device. If the revoked device is the current device,
   * local device state is cleared.
   */
  async revokeDevice(
    deviceId: string,
    apiClient: {
      revokeDevice: (deviceId: string) => Promise<any>;
    }
  ): Promise<void> {
    safeCryptoLogger.warn('DeviceManager', `Revoking device ${deviceId}`);
    await apiClient.revokeDevice(deviceId);

    if (this.deviceId === deviceId) {
      this.deviceId = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('zerovc_device_id');
      }
    }
  }

  /**
   * Clears in-memory device state (e.g. upon user logout).
   */
  clear(): void {
    this.deviceId = null;
    this.currentUserId = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('zerovc_device_id');
    }
  }
}

export const deviceManager = new DeviceManager();
