/**
 * ZeroVC Opt-in E2EE — Simulated In-Memory Backend Harness
 *
 * Implements the exact HTTP contracts, CSRF validation, version gating,
 * monotonic signed roster verification, and audience recomputation logic
 * from backend/internal/handlers/e2ee_handlers.go and models/e2ee.go.
 */

import {
  canonicalJson,
  computeAudienceHash,
  sha256Hex,
  SignedRosterData,
  verifyEd25519,
} from './crypto-harness';

export interface HttpResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

export interface StoredIdentity {
  userId: string;
  identityPublicKey: string;
  createdAt: number;
}

export interface StoredDevice {
  id: string;
  userId: string;
  curve25519Key: string;
  ed25519Key: string;
  identitySignature: string;
  fallbackKey?: string;
  revokedAt?: number;
  createdAt: number;
  otks: Map<string, string>; // key_id -> public_key
}

export interface StoredToDevice {
  id: string;
  recipientDeviceId: string;
  senderDeviceId: string;
  msgType: string;
  payload: string;
  createdAt: number;
}

export interface StoredChannel {
  id: string;
  name: string;
  isE2EE: boolean;
  audienceLimit: number; // 15, 50, 250
  rotationEpoch: number;
  members: Set<string>; // userIds
  bannedUsers: Set<string>;
  roles: Map<string, string[]>; // userId -> roles
}

export class MockBackend {
  private identities: Map<string, StoredIdentity> = new Map();
  private devices: Map<string, StoredDevice> = new Map();
  private toDeviceQueue: StoredToDevice[] = [];
  private rosters: Map<string, SignedRosterData> = new Map(); // convId -> latest roster
  private rosterHistory: Map<string, SignedRosterData[]> = new Map();
  private attachments: Map<string, { data: Buffer; mime: string; uploadedBy: string }> = new Map();
  private keyBackups: Map<string, { ciphertext: string; iv: string; version: number }> = new Map();
  private messages: Map<string, any> = new Map(); // message_id -> message record
  private channels: Map<string, StoredChannel> = new Map();

  private minClientVersion = 1;
  private validCsrfToken = 'valid-test-csrf-token-hmac-12345';

  constructor() {
    this.reset();
  }

  reset() {
    this.identities.clear();
    this.devices.clear();
    this.toDeviceQueue = [];
    this.rosters.clear();
    this.rosterHistory.clear();
    this.attachments.clear();
    this.keyBackups.clear();
    this.messages.clear();
    this.channels.clear();
  }

  getValidCsrfToken(): string {
    return this.validCsrfToken;
  }

  private checkVersionAndCsrf(
    method: string,
    headers: Record<string, string>,
    isMutation = false
  ): { error?: HttpResponse } {
    // 1. Version gate check
    const clientVersionStr = headers['x-client-e2ee-version'] || headers['X-Client-E2EE-Version'];
    if (!clientVersionStr) {
      return {
        error: {
          status: 426,
          body: { error: 'e2ee_client_outdated', min_version: this.minClientVersion },
          headers: {},
        },
      };
    }
    const version = parseInt(clientVersionStr, 10);
    if (isNaN(version) || version < this.minClientVersion) {
      return {
        error: {
          status: 426,
          body: { error: 'e2ee_client_outdated', min_version: this.minClientVersion },
          headers: {},
        },
      };
    }

    // 2. State Mutation Security: strictly POST and valid CSRF
    if (isMutation) {
      if (method !== 'POST') {
        return {
          error: {
            status: 405,
            body: { error: 'Method Not Allowed — mutations must be POST' },
            headers: {},
          },
        };
      }

      const csrf = headers['x-csrf-token'] || headers['X-CSRF-Token'];
      if (!csrf || csrf !== this.validCsrfToken) {
        return {
          error: {
            status: 403,
            body: { error: 'Forbidden — invalid CSRF token' },
            headers: {},
          },
        };
      }
    }

    return {};
  }

  // --- Identity Endpoints ---
  registerIdentity(
    userId: string,
    req: { identity_public_key: string },
    headers: Record<string, string>,
    method = 'POST'
  ): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    if (!req.identity_public_key) {
      return { status: 400, body: { error: 'missing identity_public_key' }, headers: {} };
    }

    this.identities.set(userId, {
      userId,
      identityPublicKey: req.identity_public_key,
      createdAt: Date.now(),
    });

    return { status: 201, body: { status: 'created', user_id: userId }, headers: {} };
  }

  getIdentity(userId: string, headers: Record<string, string>): HttpResponse {
    const check = this.checkVersionAndCsrf('GET', headers, false);
    if (check.error) return check.error;

    const identity = this.identities.get(userId);
    if (!identity) {
      return { status: 404, body: { error: 'identity not found' }, headers: {} };
    }
    return {
      status: 200,
      body: { user_id: identity.userId, identity_public_key: identity.identityPublicKey },
      headers: {},
    };
  }

  // --- Device Endpoints ---
  registerDevice(
    userId: string,
    deviceId: string,
    req: {
      curve25519_key: string;
      ed25519_key: string;
      identity_signature: string;
      fallback_key?: string;
      one_time_keys?: Record<string, string>;
    },
    headers: Record<string, string>,
    method = 'POST'
  ): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    const identity = this.identities.get(userId);
    if (!identity) {
      return { status: 404, body: { error: 'user identity must be registered before device' }, headers: {} };
    }

    // Verify identity signature on device keys binding:
    // canonical payload = "zerovc:device:" + curve25519_key + ":" + ed25519_key
    const bindingMsg = `zerovc:device:${req.curve25519_key}:${req.ed25519_key}`;
    const validSig = verifyEd25519(identity.identityPublicKey, bindingMsg, req.identity_signature);
    if (!validSig) {
      return { status: 400, body: { error: 'invalid device identity signature' }, headers: {} };
    }

    const otkMap = new Map<string, string>();
    if (req.one_time_keys) {
      for (const [k, v] of Object.entries(req.one_time_keys)) {
        otkMap.set(k, v);
      }
    }

    this.devices.set(deviceId, {
      id: deviceId,
      userId,
      curve25519Key: req.curve25519_key,
      ed25519Key: req.ed25519_key,
      identitySignature: req.identity_signature,
      fallbackKey: req.fallback_key,
      createdAt: Date.now(),
      otks: otkMap,
    });

    return { status: 201, body: { status: 'created', device_id: deviceId }, headers: {} };
  }

  getUserDevices(userId: string, headers: Record<string, string>): HttpResponse {
    const check = this.checkVersionAndCsrf('GET', headers, false);
    if (check.error) return check.error;

    const activeDevices: any[] = [];
    for (const d of this.devices.values()) {
      if (d.userId === userId && !d.revokedAt) {
        activeDevices.push({
          id: d.id,
          user_id: d.userId,
          curve25519_key: d.curve25519Key,
          ed25519_key: d.ed25519Key,
          fallback_key: d.fallbackKey,
          unclaimed_otk_count: d.otks.size,
        });
      }
    }

    return { status: 200, body: { devices: activeDevices }, headers: {} };
  }

  revokeDevice(deviceId: string, headers: Record<string, string>, method = 'POST'): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    const device = this.devices.get(deviceId);
    if (!device) {
      return { status: 404, body: { error: 'device not found' }, headers: {} };
    }

    device.revokedAt = Date.now();
    return { status: 200, body: { status: 'revoked', device_id: deviceId }, headers: {} };
  }

  replenishOTKs(
    deviceId: string,
    req: { one_time_keys: Record<string, string> },
    headers: Record<string, string>,
    method = 'POST'
  ): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    const device = this.devices.get(deviceId);
    if (!device || device.revokedAt) {
      return { status: 404, body: { error: 'device not found or revoked' }, headers: {} };
    }

    for (const [k, v] of Object.entries(req.one_time_keys)) {
      device.otks.set(k, v);
    }

    return { status: 200, body: { status: 'replenished', total_otks: device.otks.size }, headers: {} };
  }

  claimKeys(req: { device_ids: string[] }, headers: Record<string, string>, method = 'POST'): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    const claimedKeys: Record<string, any> = {};

    for (const did of req.device_ids) {
      const dev = this.devices.get(did);
      if (!dev || dev.revokedAt) continue;

      if (dev.otks.size > 0) {
        // Pop first OTK
        const firstEntry = dev.otks.entries().next().value;
        if (firstEntry) {
          const [keyId, pubKey] = firstEntry;
          dev.otks.delete(keyId);
          claimedKeys[did] = {
            key_id: keyId,
            public_key: pubKey,
            is_fallback: false,
          };
        }
      } else if (dev.fallbackKey) {
        claimedKeys[did] = {
          key_id: 'fallback',
          public_key: dev.fallbackKey,
          is_fallback: true,
        };
      }
    }

    return { status: 200, body: { claimed_keys: claimedKeys }, headers: {} };
  }

  // --- To-Device Message Queue ---
  sendToDevice(
    req: {
      messages: Array<{
        recipient_device_id: string;
        sender_device_id: string;
        msg_type: string;
        payload: string;
      }>;
    },
    headers: Record<string, string>,
    method = 'POST'
  ): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    for (const m of req.messages) {
      this.toDeviceQueue.push({
        id: crypto.randomUUID(),
        recipientDeviceId: m.recipient_device_id,
        senderDeviceId: m.sender_device_id,
        msgType: m.msg_type,
        payload: m.payload,
        createdAt: Date.now(),
      });
    }

    return { status: 200, body: { status: 'queued', count: req.messages.length }, headers: {} };
  }

  getToDevice(deviceId: string, headers: Record<string, string>): HttpResponse {
    const check = this.checkVersionAndCsrf('GET', headers, false);
    if (check.error) return check.error;

    const msgs = this.toDeviceQueue.filter((m) => m.recipientDeviceId === deviceId);
    return {
      status: 200,
      body: {
        messages: msgs.map((m) => ({
          id: m.id,
          sender_device_id: m.senderDeviceId,
          recipient_device_id: m.recipientDeviceId,
          msg_type: m.msgType,
          payload: m.payload,
          created_at: m.createdAt,
        })),
      },
      headers: {},
    };
  }

  ackToDevice(
    deviceId: string,
    req: { message_ids: string[] },
    headers: Record<string, string>,
    method = 'POST'
  ): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    const idSet = new Set(req.message_ids);
    this.toDeviceQueue = this.toDeviceQueue.filter(
      (m) => !(m.recipientDeviceId === deviceId && idSet.has(m.id))
    );

    return { status: 200, body: { status: 'acked' }, headers: {} };
  }

  // --- Signed Rosters ---
  submitRoster(roster: SignedRosterData, headers: Record<string, string>, method = 'POST'): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    const convId = roster.conversation_id;
    const existing = this.rosters.get(convId);

    // 1. Monotonic version validation: version must be exactly previous + 1
    if (existing) {
      if (roster.version !== existing.version + 1) {
        return {
          status: 409,
          body: { error: `invalid version: expected ${existing.version + 1}, got ${roster.version}` },
          headers: {},
        };
      }
      if (roster.epoch < existing.epoch) {
        return {
          status: 409,
          body: { error: `epoch rollback rejected: ${roster.epoch} < ${existing.epoch}` },
          headers: {},
        };
      }
    } else {
      if (roster.version !== 1) {
        return {
          status: 400,
          body: { error: 'initial roster must have version 1' },
          headers: {},
        };
      }
    }

    // 2. Hash chaining validation
    if (roster.version === 1) {
      if (roster.prev_roster_hash !== '') {
        return { status: 400, body: { error: 'v1 roster must have empty prev_roster_hash' }, headers: {} };
      }
    } else if (existing) {
      const expectedPrevHash = sha256Hex(canonicalJson(existing));
      if (roster.prev_roster_hash !== expectedPrevHash) {
        return {
          status: 409,
          body: { error: 'broken hash chain: prev_roster_hash mismatch' },
          headers: {},
        };
      }
    }

    // 3. Audience hash determinism validation
    const expectedAudHash = computeAudienceHash(roster.members, roster.devices);
    if (roster.audience_hash !== expectedAudHash) {
      return { status: 400, body: { error: 'tampered audience_hash' }, headers: {} };
    }

    // 4. Ed25519 signature verification using signer device key
    const signerDevice = this.devices.get(roster.signer_device_id);
    if (!signerDevice || signerDevice.userId !== roster.signer_user_id || signerDevice.revokedAt) {
      return { status: 403, body: { error: 'unauthorized or unknown signer device' }, headers: {} };
    }

    // Reconstruct signing payload
    const signingPayload = {
      audience_hash: roster.audience_hash,
      conversation_id: roster.conversation_id,
      conversation_type: roster.conversation_type,
      devices: roster.devices,
      epoch: roster.epoch,
      members: roster.members,
      prev_roster_hash: roster.prev_roster_hash,
      signer_device_id: roster.signer_device_id,
      signer_user_id: roster.signer_user_id,
      version: roster.version,
    };
    const canonicalString = canonicalJson(signingPayload);
    const validSig = verifyEd25519(signerDevice.ed25519Key, canonicalString, roster.signature);
    if (!validSig) {
      return { status: 400, body: { error: 'invalid Ed25519 roster signature' }, headers: {} };
    }

    // Store roster
    this.rosters.set(convId, roster);
    const history = this.rosterHistory.get(convId) || [];
    history.push(roster);
    this.rosterHistory.set(convId, history);

    return { status: 201, body: { status: 'accepted', version: roster.version }, headers: {} };
  }

  getRoster(convId: string, headers: Record<string, string>): HttpResponse {
    const check = this.checkVersionAndCsrf('GET', headers, false);
    if (check.error) return check.error;

    const roster = this.rosters.get(convId);
    if (!roster) {
      return { status: 404, body: { error: 'roster not found' }, headers: {} };
    }
    return { status: 200, body: { roster }, headers: {} };
  }

  // --- Encrypted Messaging & Idempotency ---
  sendMessage(
    conversationId: string,
    req: {
      message_id: string;
      content?: string;
      e2ee_ciphertext?: string;
      e2ee_meta?: any;
    },
    headers: Record<string, string>,
    method = 'POST'
  ): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    // Check idempotency
    const existing = this.messages.get(req.message_id);
    if (existing) {
      if (existing.e2ee_ciphertext === req.e2ee_ciphertext) {
        return { status: 200, body: { status: 'idempotent_duplicate', message_id: req.message_id }, headers: {} };
      }
      return { status: 409, body: { error: 'message_id conflict with differing payload' }, headers: {} };
    }

    // Anti-leak check: E2EE rooms forbid plaintext content
    if (req.e2ee_ciphertext && req.content && req.content.length > 0) {
      return { status: 400, body: { error: 'E2EE message must not contain plaintext content' }, headers: {} };
    }

    const saved = {
      id: req.message_id,
      conversation_id: conversationId,
      content: req.content || '',
      e2ee_ciphertext: req.e2ee_ciphertext || '',
      e2ee_meta: req.e2ee_meta || null,
      created_at: Date.now(),
    };
    this.messages.set(req.message_id, saved);

    return { status: 201, body: { status: 'sent', message: saved }, headers: {} };
  }

  // --- Attachments ---
  uploadAttachment(data: Buffer, mime: string, headers: Record<string, string>, method = 'POST'): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    const id = crypto.randomUUID();
    this.attachments.set(id, { data, mime, uploadedBy: 'user-1' });

    return { status: 201, body: { id, size: data.length }, headers: {} };
  }

  getAttachment(id: string, headers: Record<string, string>): HttpResponse {
    const check = this.checkVersionAndCsrf('GET', headers, false);
    if (check.error) return check.error;

    const att = this.attachments.get(id);
    if (!att) {
      return { status: 404, body: { error: 'attachment not found' }, headers: {} };
    }

    return {
      status: 200,
      body: att.data,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${id}.enc"`,
      },
    };
  }

  // --- Recovery Key Backups ---
  uploadBackup(
    userId: string,
    req: { backup_ciphertext: string; iv: string; version: number },
    headers: Record<string, string>,
    method = 'POST'
  ): HttpResponse {
    const check = this.checkVersionAndCsrf(method, headers, true);
    if (check.error) return check.error;

    this.keyBackups.set(userId, {
      ciphertext: req.backup_ciphertext,
      iv: req.iv,
      version: req.version,
    });

    return { status: 200, body: { status: 'saved' }, headers: {} };
  }

  getBackup(userId: string, headers: Record<string, string>): HttpResponse {
    const check = this.checkVersionAndCsrf('GET', headers, false);
    if (check.error) return check.error;

    const backup = this.keyBackups.get(userId);
    if (!backup) {
      return { status: 404, body: { error: 'no backup found' }, headers: {} };
    }

    return { status: 200, body: { backup }, headers: {} };
  }

  // --- Server Channel Audience Recomputation ---
  createChannel(channel: StoredChannel): void {
    this.channels.set(channel.id, channel);
  }

  getChannelAudience(channelId: string, headers: Record<string, string>): HttpResponse {
    const check = this.checkVersionAndCsrf('GET', headers, false);
    if (check.error) return check.error;

    const channel = this.channels.get(channelId);
    if (!channel) return { status: 404, body: { error: 'channel not found' }, headers: {} };

    const validMembers: string[] = [];
    const validDevices: any[] = [];

    for (const userId of channel.members) {
      if (channel.bannedUsers.has(userId)) continue;
      validMembers.push(userId);

      for (const dev of this.devices.values()) {
        if (dev.userId === userId && !dev.revokedAt) {
          validDevices.push({
            user_id: dev.userId,
            device_id: dev.id,
            curve25519_key: dev.curve25519Key,
            ed25519_key: dev.ed25519Key,
          });
        }
      }
    }

    validMembers.sort();
    validDevices.sort((a, b) => a.device_id.localeCompare(b.device_id));

    // Audience limit check
    if (validMembers.length > channel.audienceLimit) {
      return {
        status: 403,
        body: {
          error: 'audience_limit_exceeded',
          current_members: validMembers.length,
          limit: channel.audienceLimit,
        },
        headers: {},
      };
    }

    const audHash = computeAudienceHash(validMembers, validDevices);

    return {
      status: 200,
      body: {
        channel_id: channelId,
        epoch: channel.rotationEpoch,
        members: validMembers,
        devices: validDevices,
        audience_hash: audHash,
      },
      headers: {},
    };
  }

  recomputeAudience(channelId: string): { changed: boolean; newEpoch: number; audienceHash: string } {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error('channel not found');

    const validMembers = Array.from(channel.members).filter((u) => !channel.bannedUsers.has(u));
    const validDevices: any[] = [];
    for (const u of validMembers) {
      for (const d of this.devices.values()) {
        if (d.userId === u && !d.revokedAt) {
          validDevices.push({
            user_id: d.userId,
            device_id: d.id,
            curve25519_key: d.curve25519Key,
            ed25519_key: d.ed25519Key,
          });
        }
      }
    }

    const newHash = computeAudienceHash(validMembers, validDevices);
    channel.rotationEpoch++;

    return {
      changed: true,
      newEpoch: channel.rotationEpoch,
      audienceHash: newHash,
    };
  }
}
