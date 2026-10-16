/**
 * ZeroVC Opt-in E2EE — Cryptographic Test Harness
 *
 * Provides real cryptographic operations utilizing:
 * - @kinsh/vodozemac-wasm for Olm/Megolm and Ed25519/Curve25519
 * - Node.js crypto / WebCrypto Subtle for AES-256-GCM, SHA-256, and HKDF
 */

import { Account, GroupSession, InboundGroupSession, Session } from '@kinsh/vodozemac-wasm';
import * as crypto from 'crypto';

export interface DeviceKeyBundle {
  userId: string;
  deviceId: string;
  account: Account;
  curve25519: string;
  ed25519: string;
  otks: Record<string, string>;
  fallbackKey: string;
}

export interface AttachmentCiphertext {
  data: Buffer;
  keyHex: string;
  ivHex: string;
  sha256Hex: string;
  originalSize: number;
  mimeType: string;
}

export interface SignedRosterData {
  conversation_type: 'dm' | 'dm_group' | 'channel';
  conversation_id: string;
  version: number;
  epoch: number;
  members: string[]; // sorted
  devices: Array<{
    user_id: string;
    device_id: string;
    curve25519_key: string;
    ed25519_key: string;
  }>; // sorted by device_id
  signer_user_id: string;
  signer_device_id: string;
  prev_roster_hash: string;
  audience_hash: string;
  signature: string;
}

/**
 * Creates a fully initialized device with Ed25519/Curve25519 keys,
 * 50 one-time keys, and a fallback key.
 */
export function createTestDevice(userId: string, deviceId: string): DeviceKeyBundle {
  const account = new Account();
  account.generateFallbackKey();
  account.generateOneTimeKeys(50);

  const idKeys = JSON.parse(account.identityKeys());
  const otkObj = JSON.parse(account.oneTimeKeys());
  const fallbackObj = JSON.parse(account.fallbackKey());

  const otks: Record<string, string> = otkObj.curve25519 || {};
  const fallbackKey = Object.values(fallbackObj.curve25519 || {})[0] as string || '';

  account.markKeysAsPublished();

  return {
    userId,
    deviceId,
    account,
    curve25519: idKeys.curve25519,
    ed25519: idKeys.ed25519,
    otks,
    fallbackKey,
  };
}

/**
 * RFC 8785 compatible deterministic JSON serialization.
 */
export function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',') + '}';
}

/**
 * SHA-256 lowercase hex digest.
 */
export function sha256Hex(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Computes canonical audience hash: SHA-256(canonicalJson({ devices, members }))
 */
export function computeAudienceHash(
  members: string[],
  devices: Array<{ user_id: string; device_id: string; curve25519_key: string; ed25519_key: string }>
): string {
  const sortedMembers = [...members].sort();
  const sortedDevices = [...devices].sort((a, b) => a.device_id.localeCompare(b.device_id));
  return sha256Hex(canonicalJson({ devices: sortedDevices, members: sortedMembers }));
}

/**
 * Signs payload using device's master Ed25519 key.
 */
export function signWithDevice(device: DeviceKeyBundle, message: string): string {
  return device.account.sign(message);
}

/**
 * Verifies Ed25519 signature.
 */
export function verifyEd25519(publicKeyB64: string, message: string, signatureB64: string): boolean {
  try {
    const pubKeyBuf = Buffer.from(publicKeyB64, 'base64');
    const sigBuf = Buffer.from(signatureB64, 'base64');
    const msgBuf = Buffer.from(message, 'utf-8');

    // Node.js crypto.verify with ed25519
    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'), // Ed25519 DER prefix
        pubKeyBuf,
      ]),
      format: 'der',
      type: 'spki',
    });

    return crypto.verify(null, msgBuf, keyObject, sigBuf);
  } catch {
    return false;
  }
}

/**
 * Builds and signs a SignedRoster.
 */
export function buildSignedRoster(params: {
  conversationType: 'dm' | 'dm_group' | 'channel';
  conversationId: string;
  version: number;
  epoch: number;
  members: string[];
  devices: Array<{ user_id: string; device_id: string; curve25519_key: string; ed25519_key: string }>;
  signer: DeviceKeyBundle;
  prevRoster?: SignedRosterData;
}): SignedRosterData {
  const sortedMembers = [...params.members].sort();
  const sortedDevices = [...params.devices].sort((a, b) => a.device_id.localeCompare(b.device_id));
  const audHash = computeAudienceHash(sortedMembers, sortedDevices);

  let prevHash = '';
  if (params.version > 1) {
    if (params.prevRoster) {
      prevHash = sha256Hex(canonicalJson(params.prevRoster));
    } else {
      throw new Error('prevRoster required for version > 1');
    }
  }

  const signingPayload = {
    audience_hash: audHash,
    conversation_id: params.conversationId,
    conversation_type: params.conversationType,
    devices: sortedDevices,
    epoch: params.epoch,
    members: sortedMembers,
    prev_roster_hash: prevHash,
    signer_device_id: params.signer.deviceId,
    signer_user_id: params.signer.userId,
    version: params.version,
  };

  const canonicalString = canonicalJson(signingPayload);
  const sig = params.signer.account.sign(canonicalString);

  return {
    conversation_type: params.conversationType,
    conversation_id: params.conversationId,
    version: params.version,
    epoch: params.epoch,
    members: sortedMembers,
    devices: sortedDevices,
    signer_user_id: params.signer.userId,
    signer_device_id: params.signer.deviceId,
    prev_roster_hash: prevHash,
    audience_hash: audHash,
    signature: sig,
  };
}

/**
 * Encrypts a file attachment using AES-256-GCM.
 */
export function encryptAttachment(plaintext: Buffer, mimeType: string): AttachmentCiphertext {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const finalCiphertext = Buffer.concat([encrypted, tag]);

  const digest = sha256Hex(finalCiphertext);

  return {
    data: finalCiphertext,
    keyHex: key.toString('hex'),
    ivHex: iv.toString('hex'),
    sha256Hex: digest,
    originalSize: plaintext.length,
    mimeType,
  };
}

/**
 * Decrypts a file attachment using AES-256-GCM, verifying integrity and auth tag.
 */
export function decryptAttachment(
  ciphertext: Buffer,
  keyHex: string,
  ivHex: string,
  expectedSha256Hex: string
): Buffer {
  const actualDigest = sha256Hex(ciphertext);
  if (actualDigest !== expectedSha256Hex) {
    throw new Error('Attachment SHA-256 digest mismatch (tampered file)');
  }

  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');

  // Last 16 bytes is the GCM auth tag
  const tagLength = 16;
  const encryptedData = ciphertext.subarray(0, ciphertext.length - tagLength);
  const tag = ciphertext.subarray(ciphertext.length - tagLength);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

/**
 * Computes canonical 60-digit safety verification code from two Ed25519 public keys.
 * Format: 12 groups of 5 decimal digits (e.g. "12345 67890 ...").
 */
export function computeSafetyVerificationCode(keyA: string, keyB: string): {
  code: string;
  rawDigits: string;
  qrPayload: string;
} {
  const sorted = [keyA, keyB].sort();
  const combined = `zerovc:verify:${sorted[0]}:${sorted[1]}`;
  const hash = crypto.createHash('sha256').update(combined).digest();

  // Convert first 25 bytes of hash into 60 decimal digits
  let digits = '';
  for (let i = 0; i < 24; i += 2) {
    const val = hash.readUInt16BE(i) % 100000;
    digits += val.toString().padStart(5, '0');
  }

  const groups: string[] = [];
  for (let i = 0; i < 60; i += 5) {
    groups.push(digits.slice(i, i + 5));
  }
  const formatted = groups.join(' ');

  const qrPayload = `zerovc-e2ee://verify?v=1&k1=${encodeURIComponent(sorted[0])}&k2=${encodeURIComponent(sorted[1])}&d=${digits}`;

  return {
    code: formatted,
    rawDigits: digits,
    qrPayload,
  };
}

/**
 * Generates a 256-bit Recovery Key.
 */
export function generateRecoveryKey(): {
  rawBytes: Buffer;
  formattedKey: string;
} {
  const rawBytes = crypto.randomBytes(32);
  // Base58-like representation
  const b58 = rawBytes.toString('base64').replace(/[/+=]/g, '').slice(0, 32);
  const formattedKey = `ZVC-${b58.slice(0, 8)}-${b58.slice(8, 16)}-${b58.slice(16, 24)}-${b58.slice(24, 32)}`;
  return { rawBytes, formattedKey };
}

/**
 * Encrypts Megolm session keys backup with key derived from Recovery Key.
 */
export function encryptBackupWithRecoveryKey(
  sessions: Array<{ conversationId: string; sessionId: string; sessionKey: string }>,
  recoveryKeyBytes: Buffer
): {
  backupCiphertextHex: string;
  ivHex: string;
  version: number;
} {
  const salt = Buffer.from('zerovc-e2ee-backup-salt-v1');
  const derivedKey = crypto.pbkdf2Sync(recoveryKeyBytes, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);

  const payload = Buffer.from(JSON.stringify(sessions), 'utf-8');
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([encrypted, tag]);

  return {
    backupCiphertextHex: combined.toString('hex'),
    ivHex: iv.toString('hex'),
    version: 1,
  };
}

/**
 * Decrypts backup with Recovery Key.
 */
export function decryptBackupWithRecoveryKey(
  backupCiphertextHex: string,
  ivHex: string,
  recoveryKeyBytes: Buffer
): Array<{ conversationId: string; sessionId: string; sessionKey: string }> {
  const salt = Buffer.from('zerovc-e2ee-backup-salt-v1');
  const derivedKey = crypto.pbkdf2Sync(recoveryKeyBytes, salt, 100000, 32, 'sha256');
  const iv = Buffer.from(ivHex, 'hex');
  const combined = Buffer.from(backupCiphertextHex, 'hex');

  const tagLength = 16;
  const encryptedData = combined.subarray(0, combined.length - tagLength);
  const tag = combined.subarray(combined.length - tagLength);

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

  return JSON.parse(decrypted.toString('utf-8'));
}
