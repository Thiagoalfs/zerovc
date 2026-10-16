/**
 * Encrypted Session Key Cloud Backup Manager.
 * Conforms to ZeroVC Milestone M6 cryptographic specifications.
 * Securely exports, encrypts, uploads, fetches, decrypts, and restores inbound Megolm session keys.
 */

import { api } from '../lib/api';
import { keyStore } from './keyStore';
import { megolmManager } from './megolmSession';
import {
  deriveBackupKey,
  encryptBackupPayload,
  decryptBackupPayload,
  bytesToHex,
  hexToBytes,
  importVaultKeyFromBytes,
} from './recovery';
import { GroupSession, ensureVodozemacInitialized } from './vodozemac';

export interface BackupSessionItem {
  conversationId: string;
  sessionId: string;
  sessionKey: string;
  senderDeviceId?: string;
  epoch?: number;
}

export interface BackupStatus {
  exists: boolean;
  version?: number;
  keyCount?: number;
  updatedAt?: string;
}

export interface BackupUploadResult {
  ciphertext: string;
  backup_ciphertext: string;
  iv: string;
  salt: string;
  key_count: number;
  version: number;
}

export class BackupManager {
  private activeVaultKey: CryptoKey | null = null;
  private activeUserId: string | null = null;
  private autoBackupTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Sets the active in-memory Vault Key and associated userId for auto-sync.
   */
  setVaultKey(key: CryptoKey, userId: string): void {
    this.activeVaultKey = key;
    this.activeUserId = userId;
  }

  /**
   * Returns the active in-memory Vault Key, or null if not unlocked/loaded.
   */
  getVaultKey(): CryptoKey | null {
    return this.activeVaultKey;
  }

  /**
   * Clears the active in-memory Vault Key, userId, and cancels any pending auto-backup timers.
   */
  clearVaultKey(): void {
    this.activeVaultKey = null;
    this.activeUserId = null;
    if (this.autoBackupTimer) {
      clearTimeout(this.autoBackupTimer);
      this.autoBackupTimer = null;
    }
  }

  /**
   * Persists raw bytes of the Vault Key securely encrypted into KeyStore ('account', 'vault_key').
   * Allows desktop and browser sessions to retain vault key across page reloads without re-prompting password.
   */
  async saveVaultKeyToStore(rawBytes: Uint8Array): Promise<void> {
    const hex = bytesToHex(rawBytes);
    await keyStore.encryptAndStorePickle('account', 'vault_key', hex, {
      userId: this.activeUserId,
      savedAt: Date.now(),
    });
  }

  /**
   * Retrieves and decrypts the persisted Vault Key from KeyStore ('account', 'vault_key')
   * and sets activeVaultKey in memory.
   */
  async loadVaultKeyFromStore(): Promise<CryptoKey | null> {
    try {
      const hex = await keyStore.retrieveAndDecryptPickle('account', 'vault_key');
      if (!hex) return null;
      const rawBytes = hexToBytes(hex);
      const key = await importVaultKeyFromBytes(rawBytes);
      this.activeVaultKey = key;
      return key;
    } catch (err) {
      console.warn('[BackupManager] Failed to load vault key from store:', err);
      return null;
    }
  }

  /**
   * Triggers an automatic backup debounced by 2 seconds.
   * If activeVaultKey is present, gathers inbound and outbound Megolm sessions
   * and safely uploads the encrypted backup envelope to the server.
   * Completely resilient: never throws or crashes the UI.
   */
  triggerAutoBackup(): void {
    if (!this.activeVaultKey) {
      return;
    }

    if (this.autoBackupTimer) {
      clearTimeout(this.autoBackupTimer);
    }

    this.autoBackupTimer = setTimeout(async () => {
      this.autoBackupTimer = null;
      if (!this.activeVaultKey) return;
      try {
        await this.createBackup(this.activeVaultKey);
      } catch (err) {
        console.warn('[BackupManager] Auto-backup failed silently:', err);
      }
    }, 2000);
  }

  /**
   * Automatically restores the cloud backup using either the provided vaultKey or activeVaultKey.
   * Silently ignores if no backup exists on the server (404) and returns count of restored sessions.
   * Completely resilient: never throws or crashes the UI.
   */
  async autoRestore(vaultKey?: CryptoKey): Promise<{ restoredSessions: number }> {
    const keyToUse = vaultKey || this.activeVaultKey;
    if (!keyToUse) {
      return { restoredSessions: 0 };
    }

    try {
      const res = await this.restoreBackup(keyToUse);
      if (res && res.restoredSessions > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('zerovc:keys-restored', {
            detail: { restoredSessions: res.restoredSessions },
          })
        );
      }
      return res;
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isNotFound =
        err?.status === 404 ||
        msg.includes('404') ||
        msg.includes('Nenhum backup') ||
        msg.includes('not found') ||
        msg.includes('backup_not_found');

      if (!isNotFound) {
        console.warn('[BackupManager] autoRestore non-fatal error:', err);
      }
      return { restoredSessions: 0 };
    }
  }

  /**
   * Gathers local inbound and outbound Megolm sessions, encrypts with PBKDF2/AES-GCM key derived
   * from the user's Recovery Key or directly with an active Vault CryptoKey, and uploads the envelope to the server.
   */
  async createBackup(keyMaterial: string | Uint8Array | CryptoKey): Promise<BackupUploadResult> {
    const records = await keyStore.getAllRecords<any>('megolm_inbound');
    const sessions: BackupSessionItem[] = [];
    const seenSessionIds = new Set<string>();

    for (const rec of records) {
      if (rec && rec.sessionKey && rec.conversationId && rec.sessionId) {
        sessions.push({
          conversationId: rec.conversationId,
          sessionId: rec.sessionId,
          sessionKey: rec.sessionKey,
          senderDeviceId: rec.senderDeviceId,
          epoch: rec.epoch,
        });
        seenSessionIds.add(rec.sessionId);
      }
    }

    // Inspect megolm_outbound in case any session is not yet in megolm_inbound
    try {
      const outboundRecords = await keyStore.getAllRecords<any>('megolm_outbound');
      if (outboundRecords && outboundRecords.length > 0) {
        await ensureVodozemacInitialized();
        for (const rec of outboundRecords) {
          if (rec && rec.conversationId && rec.sessionId && !seenSessionIds.has(rec.sessionId)) {
            if (rec.sessionKey) {
              sessions.push({
                conversationId: rec.conversationId,
                sessionId: rec.sessionId,
                sessionKey: rec.sessionKey,
                senderDeviceId: 'self',
                epoch: rec.epoch,
              });
              seenSessionIds.add(rec.sessionId);
            } else {
              try {
                const pickle = await keyStore.retrieveAndDecryptPickle('megolm_outbound', rec.conversationId);
                if (pickle) {
                  const session = GroupSession.fromPickle(pickle);
                  sessions.push({
                    conversationId: rec.conversationId,
                    sessionId: rec.sessionId,
                    sessionKey: session.sessionKey(),
                    senderDeviceId: 'self',
                    epoch: rec.epoch,
                  });
                  seenSessionIds.add(rec.sessionId);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.warn('[BackupManager] Error inspecting outbound sessions for backup:', err);
    }

    const derivedKey =
      keyMaterial instanceof CryptoKey
        ? keyMaterial
        : (await deriveBackupKey(keyMaterial)).key;

    const encrypted = await encryptBackupPayload(JSON.stringify(sessions), derivedKey);

    await api.e2ee.uploadBackup({
      ciphertext: encrypted.ciphertext,
      backup_ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: encrypted.salt,
      key_count: sessions.length,
      version: 1,
    });

    return {
      ciphertext: encrypted.ciphertext,
      backup_ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: encrypted.salt,
      key_count: sessions.length,
      version: 1,
    };
  }

  /**
   * Fetches the encrypted backup envelope from the server, decrypts it using
   * the provided Recovery Key or Vault CryptoKey, and imports all restored inbound sessions into KeyStore.
   */
  async restoreBackup(keyMaterial: string | Uint8Array | CryptoKey): Promise<{ restoredSessions: number }> {
    const res = await api.e2ee.getBackup();
    const backup = res.backup;
    const ciphertext = backup?.ciphertext || backup?.backup_ciphertext || res.ciphertext;
    const iv = backup?.iv || res.iv;
    const salt = backup?.salt || 'zerovc-e2ee-backup-salt-v1';

    if (!ciphertext || !iv) {
      throw new Error('Nenhum backup de chaves encontrado no servidor');
    }

    const derivedKey =
      keyMaterial instanceof CryptoKey
        ? keyMaterial
        : (await deriveBackupKey(keyMaterial, salt)).key;

    const decryptedBytes = await decryptBackupPayload({ ciphertext, iv }, derivedKey);
    const sessions: BackupSessionItem[] = JSON.parse(new TextDecoder().decode(decryptedBytes));

    let restoredCount = 0;
    if (Array.isArray(sessions)) {
      for (const s of sessions) {
        if (s.conversationId && s.sessionId && s.sessionKey) {
          await megolmManager.registerInboundSession(
            s.conversationId,
            s.sessionId,
            s.sessionKey,
            s.senderDeviceId || '',
            s.epoch || 1
          );
          restoredCount++;
        }
      }
    }

    return { restoredSessions: restoredCount };
  }

  /**
   * Deletes the user's cloud key backup via POST /api/e2ee/backup/delete.
   */
  async deleteBackup(): Promise<void> {
    await api.e2ee.deleteBackup();
  }

  /**
   * Checks whether the user has a cloud backup on the server.
   */
  async getBackupStatus(): Promise<BackupStatus> {
    try {
      const res = await api.e2ee.getBackup();
      if (res && (res.backup || res.ciphertext)) {
        const b = res.backup;
        return {
          exists: true,
          version: b?.version ?? res.version ?? 1,
          keyCount: b?.key_count ?? 0,
          updatedAt: b?.updated_at ?? b?.created_at,
        };
      }
      return { exists: false };
    } catch {
      return { exists: false };
    }
  }
}

export const backupManager = new BackupManager();

