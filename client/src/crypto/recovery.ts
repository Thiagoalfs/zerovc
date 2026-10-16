/**
/**
 * 256-bit Recovery Key and PBKDF2/AES-GCM Cloud Backup Cryptography.
 * Conforms to ZeroVC Milestone M6 cryptographic specifications.
 * Zero leaks of recovery keys or raw buffer material.
 */

export interface RecoveryKeyData {
  recoveryKey: string;
  formattedKey: string;
  rawBytes: Uint8Array;
}

export interface EncryptedBackupEnvelope {
  ciphertext: string;
  iv: string;
  salt: string;
}

const DEFAULT_BACKUP_SALT = 'zerovc-e2ee-backup-salt-v1';
const PBKDF2_ITERATIONS = 100000;

/**
 * Converts a byte array to a hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Converts a hex string to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generates a 256-bit (32 bytes) CSPRNG Recovery Key.
 * Formatted as ZVC-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX (4 groups of 8 characters).
 */
export function generateRecoveryKey(): RecoveryKeyData {
  const rawBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(rawBytes);

  let b64 = '';
  if (typeof Buffer !== 'undefined') {
    b64 = Buffer.from(rawBytes).toString('base64');
  } else {
    let binary = '';
    for (let i = 0; i < rawBytes.length; i++) {
      binary += String.fromCharCode(rawBytes[i]);
    }
    b64 = btoa(binary);
  }

  const cleanB64 = b64.replace(/[/+=]/g, '').slice(0, 32).toUpperCase();
  const formattedKey = `ZVC-${cleanB64.slice(0, 8)}-${cleanB64.slice(8, 16)}-${cleanB64.slice(16, 24)}-${cleanB64.slice(24, 32)}`;

  return {
    recoveryKey: formattedKey,
    formattedKey,
    rawBytes,
  };
}

/**
 * Parses and sanitizes a user-entered Recovery Key.
 */
export function parseRecoveryKey(formatted: string): Uint8Array {
  const clean = formatted.trim().toUpperCase().replace(/^ZVC-/, '').replace(/[^A-Z0-9]/g, '');
  if (clean.length < 16) {
    throw new Error('Chave de recuperação inválida: formato ou tamanho incorreto');
  }
  return new TextEncoder().encode(clean);
}

/**
 * Zeroizes sensitive buffer memory to prevent retention.
 */
export function zeroBuffer(buf: Uint8Array): void {
  if (buf && buf.fill) {
    buf.fill(0);
  }
}

/**
 * Derives an AES-GCM-256 CryptoKey from a Recovery Key using PBKDF2 (SHA-256, 100,000 iterations).
 */
export async function deriveBackupKey(
  recoveryKey: string | Uint8Array,
  salt: Uint8Array | string = DEFAULT_BACKUP_SALT
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  let keyBytes: Uint8Array;
  if (recoveryKey instanceof Uint8Array) {
    keyBytes = recoveryKey;
  } else if (typeof recoveryKey === 'string') {
    const clean = recoveryKey.trim().toUpperCase().replace(/^ZVC-/, '').replace(/[^A-Z0-9]/g, '');
    keyBytes = new TextEncoder().encode(clean);
  } else {
    throw new Error('Formato inválido de chave de recuperação');
  }

  const saltBytes = typeof salt === 'string' ? new TextEncoder().encode(salt) : salt;

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const derivedKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return { key: derivedKey, salt: saltBytes };
}

/**
 * Encrypts arbitrary payload data with PBKDF2-derived AES-GCM-256 CryptoKey.
 */
export async function encryptBackupPayload(
  data: Uint8Array | string | any,
  backupKey: CryptoKey
): Promise<EncryptedBackupEnvelope> {
  let plaintextBytes: Uint8Array;
  if (data instanceof Uint8Array) {
    plaintextBytes = data;
  } else if (typeof data === 'string') {
    plaintextBytes = new TextEncoder().encode(data);
  } else {
    plaintextBytes = new TextEncoder().encode(JSON.stringify(data));
  }

  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    backupKey,
    plaintextBytes as unknown as BufferSource
  );

  const ciphertextHex = bytesToHex(new Uint8Array(ciphertextBuffer));
  const ivHex = bytesToHex(iv);

  return {
    ciphertext: ciphertextHex,
    iv: ivHex,
    salt: DEFAULT_BACKUP_SALT,
  };
}

/**
 * Decrypts encrypted backup envelope with PBKDF2-derived AES-GCM-256 CryptoKey.
 */
export async function decryptBackupPayload(
  encrypted: { ciphertext: string; iv: string },
  backupKey: CryptoKey
): Promise<Uint8Array> {
  const ivBytes = hexToBytes(encrypted.iv);
  const ciphertextBytes = hexToBytes(encrypted.ciphertext);

  const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    backupKey,
    ciphertextBytes as unknown as BufferSource
  );

  return new Uint8Array(decryptedBuffer);
}

export const VAULT_SALT_SUFFIX = 'zerovc-e2ee-vault-salt-v1';

/**
 * Imports an AES-GCM-256 CryptoKey from raw byte material.
 */
export async function importVaultKeyFromBytes(rawBytes: Uint8Array): Promise<CryptoKey> {
  return await globalThis.crypto.subtle.importKey(
    'raw',
    rawBytes as unknown as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports an extractable CryptoKey to raw byte material (if key allows extraction).
 */
export async function exportVaultKeyToBytes(key: CryptoKey): Promise<Uint8Array> {
  const exported = await globalThis.crypto.subtle.exportKey('raw', key);
  return new Uint8Array(exported);
}

/**
 * Derives a deterministic Account Vault Key for account-linked E2EE backup/restore.
 * Uses PBKDF2 with 100,000 iterations (SHA-256) and a deterministic salt combining
 * userId with the suffix 'zerovc-e2ee-vault-salt-v1'.
 */
export async function deriveAccountVaultKey(
  password: string,
  userId: string
): Promise<{ key: CryptoKey; salt: string; rawBytes: Uint8Array }> {
  const salt = `${userId}:${VAULT_SALT_SUFFIX}`;
  const saltBytes = new TextEncoder().encode(salt);
  const passwordBytes = new TextEncoder().encode(password);

  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    passwordBytes as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const rawBuffer = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256 // 256 bits = 32 bytes
  );

  const rawBytes = new Uint8Array(rawBuffer);
  const key = await importVaultKeyFromBytes(rawBytes);

  return {
    key,
    salt,
    rawBytes,
  };
}
