/**
 * Encrypted Session Key Cloud Backup Manager.
 * Conforms to ZeroVC Milestone M6 cryptographic specifications.
 * Securely exports, encrypts, uploads, fetches, decrypts, and restores inbound Megolm session keys.
 */

import { api } from '../lib/api';
import { keyStore } from './keyStore';
import { megolmManager } from './megolmSession';
import { deriveBackupKey, encryptBackupPayload, decryptBackupPayload } from './recovery';

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
  /**
   * Gathers local inbound Megolm sessions, encrypts with PBKDF2/AES-GCM key derived
   * from the user's Recovery Key, and uploads the envelope to the server.
   */
  async createBackup(recoveryKey: string | Uint8Array): Promise<BackupUploadResult> {
    const records = await keyStore.getAllRecords<any>('megolm_inbound');
    const sessions: BackupSessionItem[] = [];

    for (const rec of records) {
      if (rec && rec.sessionKey && rec.conversationId && rec.sessionId) {
        sessions.push({
          conversationId: rec.conversationId,
          sessionId: rec.sessionId,
          sessionKey: rec.sessionKey,
          senderDeviceId: rec.senderDeviceId,
          epoch: rec.epoch,
        });
      }
    }

    const { key: derivedKey } = await deriveBackupKey(recoveryKey);
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
   * the provided Recovery Key, and imports all restored inbound sessions into KeyStore.
   */
  async restoreBackup(recoveryKey: string | Uint8Array): Promise<{ restoredSessions: number }> {
    const res = await api.e2ee.getBackup();
    const backup = res.backup;
    const ciphertext = backup?.ciphertext || backup?.backup_ciphertext || res.ciphertext;
    const iv = backup?.iv || res.iv;
    const salt = backup?.salt || 'zerovc-e2ee-backup-salt-v1';

    if (!ciphertext || !iv) {
      throw new Error('Nenhum backup de chaves encontrado no servidor');
    }

    const { key: derivedKey } = await deriveBackupKey(recoveryKey, salt);
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
