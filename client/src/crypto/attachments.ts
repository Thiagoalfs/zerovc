/**
 * ZeroVC Opt-in E2EE - Client-Side Attachments (AES-256-GCM)
 *
 * Implements Milestone M3 (Requirement R3 §8, §10.4):
 *  - Client-side WebCrypto AES-256-GCM encryption with 256-bit ephemeral keys
 *  - Random 96-bit (12-byte) Initialization Vector (IV)
 *  - SHA-256 ciphertext integrity verification before decryption
 *  - Upload of opaque blobs to /api/e2ee/attachments
 *  - Packaging cryptographic secrets strictly inside the Megolm envelope
 */

import { EnvelopeAttachment } from './envelope';

/**
 * Encodes Uint8Array to standard Base64 string across Node.js and Browser environments.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes standard Base64 string to Uint8Array across Node.js and Browser environments.
 */
export function base64ToUint8Array(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Computes lowercase 64-character hex SHA-256 digest of an ArrayBuffer or Uint8Array.
 */
export async function computeSha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer as BufferSource);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface EncryptedAttachmentPayload {
  ciphertext: ArrayBuffer;
  key: string;       // Base64 256-bit key
  iv: string;        // Base64 96-bit IV
  sha256: string;    // Hex SHA-256 of ciphertext
  size: number;      // Original plaintext size
  name: string;
  mime: string;
}

/**
 * Encrypts an arbitrary ArrayBuffer, Uint8Array or File/Blob using WebCrypto AES-256-GCM.
 */
export async function encryptAttachmentData(
  data: ArrayBuffer | Uint8Array,
  filename: string,
  mimeType: string
): Promise<EncryptedAttachmentPayload> {
  // 1. Generate single-use 256-bit AES-GCM key
  const cryptoKey = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawKeyBuffer = await globalThis.crypto.subtle.exportKey('raw', cryptoKey);
  const keyB64 = uint8ArrayToBase64(new Uint8Array(rawKeyBuffer));

  // 2. Generate random 96-bit IV (12 bytes)
  const ivBytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ivB64 = uint8ArrayToBase64(ivBytes);

  // 3. Encrypt data with AES-GCM
  const plaintextBuffer = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    cryptoKey,
    plaintextBuffer as BufferSource
  );

  // 4. Compute SHA-256 digest over ciphertext
  const sha256Hex = await computeSha256Hex(ciphertextBuffer);

  return {
    ciphertext: ciphertextBuffer,
    key: keyB64,
    iv: ivB64,
    sha256: sha256Hex,
    size: plaintextBuffer.byteLength,
    name: filename,
    mime: mimeType || 'application/octet-stream',
  };
}

/**
 * Decrypts AES-256-GCM ciphertext buffer after verifying SHA-256 digest.
 */
export async function decryptAttachmentData(
  ciphertext: ArrayBuffer | Uint8Array,
  keyB64: string,
  ivB64: string,
  expectedSha256Hex: string
): Promise<ArrayBuffer> {
  const ciphertextBuffer = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext);

  // 1. Strict integrity verification before attempting decryption
  const computedHash = await computeSha256Hex(ciphertextBuffer);
  if (computedHash.toLowerCase() !== expectedSha256Hex.toLowerCase()) {
    throw new Error('Falha de integridade do anexo: hash SHA-256 divergente');
  }

  // 2. Import raw key
  const keyBytes = base64ToUint8Array(keyB64);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 3. Decrypt ciphertext using IV
  const ivBytes = base64ToUint8Array(ivB64);
  const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    cryptoKey,
    ciphertextBuffer as BufferSource
  );

  return plaintextBuffer;
}

/**
 * Helper to decrypt an EnvelopeAttachment given either pre-loaded ciphertext or by fetching from attachment.url.
 */
export async function decryptEnvelopeAttachment(
  attachment: EnvelopeAttachment,
  preloadedCiphertext?: ArrayBuffer | Uint8Array
): Promise<Blob> {
  let ciphertextBuffer: ArrayBuffer | Uint8Array;

  if (preloadedCiphertext) {
    ciphertextBuffer = preloadedCiphertext;
  } else {
    const res = await fetch(attachment.url);
    if (!res.ok) {
      throw new Error(`Falha ao baixar anexo criptografado: HTTP ${res.status}`);
    }
    ciphertextBuffer = await res.arrayBuffer();
  }

  const decryptedBuffer = await decryptAttachmentData(
    ciphertextBuffer,
    attachment.key,
    attachment.iv,
    attachment.sha256
  );

  return new Blob([decryptedBuffer], { type: attachment.mime || 'application/octet-stream' });
}

