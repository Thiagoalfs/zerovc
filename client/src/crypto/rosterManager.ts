/**
 * ZeroVC Opt-in E2EE — Chained Signed Roster Manager
 *
 * Implements Milestone M2 (Requirement R2 §6, §10.1):
 *  - Canonical JSON serialization (RFC 8785 compatible sorting)
 *  - Deterministic SHA-256 audience hash computation
 *  - Cryptographic hash chaining (prev_roster_hash)
 *  - Monotonic versioning validation (new_version === current_version + 1)
 *  - Ed25519 signing and verification across WebCrypto / Electron
 *  - In-memory active roster cache and WebSocket event handling
 */

import { identityManager } from './identity';
import { safeCryptoLogger } from './safeLogger';

export interface RosterDeviceEntry {
  device_id: string;
  user_id: string;
  curve25519_key: string;
  ed25519_key: string;
}

export interface SignedRoster {
  conversation_type: 'dm' | 'dm_group' | 'channel';
  conversation_id: string;
  version: number;
  epoch: number;
  members: string[]; // Lexicographically sorted user_ids
  devices: RosterDeviceEntry[]; // Lexicographically sorted by device_id
  signer_user_id: string;
  signer_device_id: string;
  prev_roster_hash: string; // Hex SHA-256 string, or "" if version === 1
  audience_hash: string; // Hex SHA-256 of canonical { devices, members }
  signature: string; // Base64 Ed25519 signature
  created_at?: string;
}

export interface RosterSigningPayload {
  audience_hash: string;
  conversation_id: string;
  conversation_type: 'dm' | 'dm_group' | 'channel';
  devices: RosterDeviceEntry[];
  epoch: number;
  members: string[];
  prev_roster_hash: string;
  signer_device_id: string;
  signer_user_id: string;
  version: number;
}

export interface CreateRosterParams {
  conversation_type: 'dm' | 'dm_group' | 'channel';
  conversation_id: string;
  version: number;
  epoch: number;
  members: string[];
  devices: RosterDeviceEntry[];
  signer_user_id: string;
  signer_device_id: string;
  prevRoster?: SignedRoster;
}

export interface RosterValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Deterministically serializes objects to JSON:
 * - Object keys sorted lexicographically
 * - Standard JSON serialization for primitives and arrays
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`).join(',') + '}';
}

/**
 * Computes lowercase 64-character hex SHA-256 digest of input string.
 */
export async function computeSha256Hex(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes canonical audience hash: SHA-256(canonicalJson({ devices, members }))
 */
export async function computeAudienceHash(
  members: string[],
  devices: RosterDeviceEntry[]
): Promise<string> {
  const sortedMembers = [...members].sort();
  const sortedDevices = [...devices].sort((a, b) => a.device_id.localeCompare(b.device_id));
  const payload = {
    devices: sortedDevices,
    members: sortedMembers,
  };
  return computeSha256Hex(canonicalJsonStringify(payload));
}

/**
 * Extracts payload fields for signing or hash-chain calculation.
 */
export function extractRosterPayload(roster: SignedRoster | RosterSigningPayload): RosterSigningPayload {
  const sortedMembers = [...roster.members].sort();
  const sortedDevices = [...roster.devices].sort((a, b) => a.device_id.localeCompare(b.device_id));

  return {
    audience_hash: roster.audience_hash,
    conversation_id: roster.conversation_id,
    conversation_type: roster.conversation_type,
    devices: sortedDevices,
    epoch: roster.epoch,
    members: sortedMembers,
    prev_roster_hash: roster.prev_roster_hash || '',
    signer_device_id: roster.signer_device_id,
    signer_user_id: roster.signer_user_id,
    version: roster.version,
  };
}

/**
 * Computes canonical payload hash of a signed roster (for chaining prev_roster_hash).
 */
export async function computeRosterPayloadHash(
  roster: SignedRoster | RosterSigningPayload
): Promise<string> {
  const payload = extractRosterPayload(roster);
  return computeSha256Hex(canonicalJsonStringify(payload));
}

/**
 * Verifies standard Ed25519 signature:
 * Primary: WebCrypto SubtleCrypto ({ name: 'Ed25519' })
 * Fallback: Node.js / Electron crypto module
 */
export async function verifyEd25519Signature(
  pubKeyBase64: string,
  message: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    let pubKeyBytes: Uint8Array;
    let sigBytes: Uint8Array;

    if (typeof Buffer !== 'undefined') {
      pubKeyBytes = Buffer.from(pubKeyBase64, 'base64');
      sigBytes = Buffer.from(signatureBase64, 'base64');
    } else {
      const pubBinary = atob(pubKeyBase64);
      pubKeyBytes = new Uint8Array(pubBinary.length);
      for (let i = 0; i < pubBinary.length; i++) pubKeyBytes[i] = pubBinary.charCodeAt(i);

      const sigBinary = atob(signatureBase64);
      sigBytes = new Uint8Array(sigBinary.length);
      for (let i = 0; i < sigBinary.length; i++) sigBytes[i] = sigBinary.charCodeAt(i);
    }

    const msgBytes = new TextEncoder().encode(message);

    // 1. WebCrypto SubtleCrypto Ed25519
    if (globalThis.crypto?.subtle?.importKey) {
      try {
        const cryptoKey = await globalThis.crypto.subtle.importKey(
          'raw',
          pubKeyBytes as unknown as BufferSource,
          { name: 'Ed25519' },
          false,
          ['verify']
        );
        const valid = await globalThis.crypto.subtle.verify(
          { name: 'Ed25519' },
          cryptoKey,
          sigBytes as unknown as BufferSource,
          msgBytes as unknown as BufferSource
        );
        return valid;
      } catch {
        // Fallback to node:crypto if SubtleCrypto does not support Ed25519
      }
    }

    // 2. Node.js / Electron native crypto fallback
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        const nodeCrypto = await import('crypto');
        const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
        const spki = Buffer.concat([spkiPrefix, Buffer.from(pubKeyBytes)]);
        const pubKey = nodeCrypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
        return nodeCrypto.verify(null, Buffer.from(msgBytes), pubKey, Buffer.from(sigBytes));
      } catch {
        return false;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export class RosterManager {
  private activeRosters: Map<string, SignedRoster> = new Map();

  /**
   * Constructs and signs a new roster using the local user/device identity.
   */
  async createAndSignRoster(params: CreateRosterParams): Promise<SignedRoster> {
    const sortedMembers = [...params.members].sort();
    const sortedDevices = [...params.devices].sort((a, b) => a.device_id.localeCompare(b.device_id));

    let prevRosterHash = '';
    if (params.version > 1) {
      if (!params.prevRoster) {
        throw new Error(`Previous roster required for chained versioning > 1 (creating version ${params.version})`);
      }
      if (params.version !== params.prevRoster.version + 1) {
        throw new Error(`Non-monotonic version step: cannot create version ${params.version} from version ${params.prevRoster.version}`);
      }
      prevRosterHash = await computeRosterPayloadHash(params.prevRoster);
    }

    const audienceHash = await computeAudienceHash(sortedMembers, sortedDevices);

    const payload: RosterSigningPayload = {
      audience_hash: audienceHash,
      conversation_id: params.conversation_id,
      conversation_type: params.conversation_type,
      devices: sortedDevices,
      epoch: params.epoch,
      members: sortedMembers,
      prev_roster_hash: prevRosterHash,
      signer_device_id: params.signer_device_id,
      signer_user_id: params.signer_user_id,
      version: params.version,
    };

    const canonicalJson = canonicalJsonStringify(payload);
    const signature = identityManager.sign(canonicalJson);

    const signedRoster: SignedRoster = {
      ...payload,
      signature,
      created_at: new Date().toISOString(),
    };

    return signedRoster;
  }

  /**
   * Verifies all cryptographic invariants of a signed roster:
   * 1. Monotonic versioning & epoch progression
   * 2. Hash chaining (prev_roster_hash === SHA-256(canonicalJson(prevRoster)))
   * 3. Audience hash recomputation match
   * 4. Member-device integrity
   * 5. Signer membership authorization
   * 6. Ed25519 signature validity against signer's identity key
   */
  async verifyRoster(
    roster: SignedRoster,
    prevRoster?: SignedRoster,
    signerIdentityKey?: string
  ): Promise<RosterValidationResult> {
    // 1. Version sanity
    if (!Number.isInteger(roster.version) || roster.version < 1) {
      return { valid: false, reason: `Invalid roster version: ${roster.version}` };
    }

    if (!Number.isInteger(roster.epoch) || roster.epoch < 0) {
      return { valid: false, reason: `Invalid roster epoch: ${roster.epoch}` };
    }

    // 2. Chained Hash & Monotonicity
    if (prevRoster) {
      if (roster.version !== prevRoster.version + 1) {
        return {
          valid: false,
          reason: `Monotonic version violation: expected ${prevRoster.version + 1}, got ${roster.version}`,
        };
      }
      if (roster.epoch < prevRoster.epoch) {
        return {
          valid: false,
          reason: `Epoch rollback violation: roster epoch ${roster.epoch} < prev epoch ${prevRoster.epoch}`,
        };
      }
      const expectedPrevHash = await computeRosterPayloadHash(prevRoster);
      if (roster.prev_roster_hash !== expectedPrevHash) {
        return {
          valid: false,
          reason: `Cryptographic hash chain broken: prev_roster_hash mismatch (expected ${expectedPrevHash}, got ${roster.prev_roster_hash})`,
        };
      }
    } else if (roster.version === 1) {
      if (roster.prev_roster_hash !== '') {
        return {
          valid: false,
          reason: `Genesis roster version 1 must have empty prev_roster_hash, got "${roster.prev_roster_hash}"`,
        };
      }
    } else {
      return {
        valid: false,
        reason: `Roster version ${roster.version} requires previous roster to verify cryptographic chain`,
      };
    }

    // 3. Audience Hash Verification
    const expectedAudienceHash = await computeAudienceHash(roster.members, roster.devices);
    if (roster.audience_hash !== expectedAudienceHash) {
      return {
        valid: false,
        reason: `Audience hash mismatch: computed ${expectedAudienceHash}, got ${roster.audience_hash}`,
      };
    }

    // 4. Member & Device Consistency
    const memberSet = new Set(roster.members);
    for (const dev of roster.devices) {
      if (!memberSet.has(dev.user_id)) {
        return {
          valid: false,
          reason: `Device ${dev.device_id} belongs to user ${dev.user_id} who is not in roster members`,
        };
      }
    }

    // 5. Signer Authorization
    if (prevRoster && !prevRoster.members.includes(roster.signer_user_id)) {
      return {
        valid: false,
        reason: `Signer ${roster.signer_user_id} was not an authorized member in previous roster v${prevRoster.version}`,
      };
    }

    if (!memberSet.has(roster.signer_user_id)) {
      return {
        valid: false,
        reason: `Signer ${roster.signer_user_id} is not an authorized member of this roster`,
      };
    }

    // 6. Ed25519 Signature Verification
    if (!signerIdentityKey) {
      // Find signer device's Ed25519 key if available in roster devices
      const signerDevice = roster.devices.find(
        d => d.device_id === roster.signer_device_id && d.user_id === roster.signer_user_id
      );
      if (signerDevice) {
        signerIdentityKey = signerDevice.ed25519_key;
      } else {
        return {
          valid: false,
          reason: `Signer identity key unavailable for user ${roster.signer_user_id}`,
        };
      }
    }

    const payload = extractRosterPayload(roster);
    const canonicalPayloadString = canonicalJsonStringify(payload);

    const sigValid = await verifyEd25519Signature(
      signerIdentityKey,
      canonicalPayloadString,
      roster.signature
    );

    if (!sigValid) {
      return {
        valid: false,
        reason: `Ed25519 signature verification failed for signer ${roster.signer_user_id}`,
      };
    }

    return { valid: true };
  }

  /**
   * Ingests an incoming roster from WebSocket or REST API, validates it against
   * the active local roster, and updates local state if valid.
   */
  async handleRosterUpdate(
    incomingRoster: SignedRoster,
    signerIdentityKey?: string
  ): Promise<boolean> {
    const convId = incomingRoster.conversation_id;
    const currentRoster = this.activeRosters.get(convId);

    // If we already have this exact or newer version, avoid re-processing
    if (currentRoster && incomingRoster.version <= currentRoster.version) {
      safeCryptoLogger.debug('RosterManager', `Ignoring already applied roster v${incomingRoster.version} (current v${currentRoster.version})`);
      return false;
    }

    const validation = await this.verifyRoster(incomingRoster, currentRoster, signerIdentityKey);
    if (!validation.valid) {
      safeCryptoLogger.warn('RosterManager', `Rejected invalid roster v${incomingRoster.version} for ${convId}: ${validation.reason}`);
      return false;
    }

    const prevEpoch = currentRoster ? currentRoster.epoch : 0;
    this.activeRosters.set(convId, incomingRoster);

    safeCryptoLogger.info('RosterManager', `Applied roster v${incomingRoster.version} (epoch ${incomingRoster.epoch}) for ${convId}`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('zerovc:roster_updated', {
          detail: { roster: incomingRoster },
        })
      );

      if (incomingRoster.epoch > prevEpoch) {
        window.dispatchEvent(
          new CustomEvent('zerovc:rotation_required', {
            detail: { conversationId: convId, epoch: incomingRoster.epoch },
          })
        );
      }
    }

    return true;
  }

  /**
   * Bootstraps or restores active roster state from an authenticated server snapshot
   * when local state is empty (cold start / reconnect).
   * Verifies self-contained cryptographic consistency (audience hash, members, signer signature)
   * without requiring previous chain history.
   */
  async bootstrapRoster(
    roster: SignedRoster,
    signerIdentityKey?: string
  ): Promise<boolean> {
    const convId = roster.conversation_id;
    const currentRoster = this.activeRosters.get(convId);
    if (currentRoster && roster.version <= currentRoster.version) {
      return false;
    }

    // 1. Audience Hash Verification
    const expectedAudienceHash = await computeAudienceHash(roster.members, roster.devices);
    if (roster.audience_hash !== expectedAudienceHash) {
      safeCryptoLogger.warn('RosterManager', `Bootstrap rejected: audience hash mismatch for ${convId}`);
      return false;
    }

    // 2. Member & Device Consistency
    const memberSet = new Set(roster.members);
    for (const dev of roster.devices) {
      if (!memberSet.has(dev.user_id)) {
        safeCryptoLogger.warn('RosterManager', `Bootstrap rejected: device ${dev.device_id} user ${dev.user_id} not in members`);
        return false;
      }
    }

    // 3. Signer Authorization
    if (!memberSet.has(roster.signer_user_id)) {
      safeCryptoLogger.warn('RosterManager', `Bootstrap rejected: signer ${roster.signer_user_id} not in members`);
      return false;
    }

    // 4. Ed25519 Signature Verification
    let key = signerIdentityKey;
    if (!key) {
      const signerDevice = roster.devices.find(
        d => d.device_id === roster.signer_device_id && d.user_id === roster.signer_user_id
      );
      if (signerDevice) {
        key = signerDevice.ed25519_key;
      } else {
        safeCryptoLogger.warn('RosterManager', `Bootstrap rejected: signer key not found`);
        return false;
      }
    }

    const payload = extractRosterPayload(roster);
    const canonicalPayloadString = canonicalJsonStringify(payload);
    const sigValid = await verifyEd25519Signature(key, canonicalPayloadString, roster.signature);
    if (!sigValid) {
      safeCryptoLogger.warn('RosterManager', `Bootstrap rejected: invalid signature for ${convId}`);
      return false;
    }

    this.activeRosters.set(convId, roster);
    safeCryptoLogger.info('RosterManager', `Bootstrapped active roster v${roster.version} (epoch ${roster.epoch}) for ${convId}`);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('zerovc:roster_updated', {
          detail: { roster },
        })
      );
    }

    return true;
  }

  getActiveRoster(conversationId: string): SignedRoster | null {
    return this.activeRosters.get(conversationId) || null;
  }

  setActiveRoster(roster: SignedRoster): void {
    this.activeRosters.set(roster.conversation_id, roster);
  }

  clear(): void {
    this.activeRosters.clear();
  }
}

export const rosterManager = new RosterManager();
