/**
 * IndexedDB KeyStore utilizing non-extractable WebCrypto AES-GCM-256 CryptoKey.
 * Guarantees that neither pickles nor raw storage keys can be extracted via userland scripts.
 */

const DB_NAME = 'zerovc_crypto_v1';
const DB_VERSION = 1;
const MASTER_KEY_ID = 'storage_master_key';

export interface EncryptedRecord {
  id?: string;
  sessionId?: string;
  conversationId?: string;
  iv: Uint8Array;
  data: ArrayBuffer;
  updatedAt: number;
  [key: string]: any;
}

export class KeyStore {
  private db: IDBDatabase | null = null;
  private masterKey: CryptoKey | null = null;
  private memoryStore: Map<string, Map<string, any>> = new Map();

  async init(): Promise<void> {
    if (this.masterKey && (this.db || typeof indexedDB === 'undefined')) return;

    if (typeof indexedDB !== 'undefined') {
      this.db = await this.openDatabase();
    }
    this.masterKey = await this.getOrCreateMasterKey();
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('keystore')) {
          db.createObjectStore('keystore', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('account')) {
          db.createObjectStore('account', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('olm_sessions')) {
          const olmStore = db.createObjectStore('olm_sessions', { keyPath: 'sessionId' });
          olmStore.createIndex('by_peer_device', 'peerDeviceId', { unique: false });
        }
        if (!db.objectStoreNames.contains('megolm_outbound')) {
          db.createObjectStore('megolm_outbound', { keyPath: 'conversationId' });
        }
        if (!db.objectStoreNames.contains('megolm_inbound')) {
          const inboundStore = db.createObjectStore('megolm_inbound', { keyPath: 'sessionId' });
          inboundStore.createIndex('by_conversation', 'conversationId', { unique: false });
        }
        if (!db.objectStoreNames.contains('device_verifications')) {
          db.createObjectStore('device_verifications', { keyPath: 'deviceId' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async getOrCreateMasterKey(): Promise<CryptoKey> {
    const existing = await this.getRecord<{ id: string; key: CryptoKey }>('keystore', MASTER_KEY_ID);
    if (existing && existing.key instanceof CryptoKey) {
      return existing.key;
    }

    // Generate non-extractable 256-bit AES-GCM key
    const newKey = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // STRICT: extractable = false
      ['encrypt', 'decrypt']
    );

    await this.putRecord('keystore', { id: MASTER_KEY_ID, key: newKey });
    return newKey;
  }

  async encryptAndStorePickle(
    storeName: string,
    id: string,
    pickle: string,
    extraFields: Record<string, any> = {}
  ): Promise<void> {
    await this.init();
    if (!this.masterKey) throw new Error('KeyStore master key unavailable');

    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(pickle);
    const ciphertext = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.masterKey,
      encoded
    );

    const primaryKeyProp = (storeName === 'olm_sessions' || storeName === 'megolm_inbound')
      ? 'sessionId'
      : (storeName === 'megolm_outbound' ? 'conversationId' : 'id');

    const record: EncryptedRecord = {
      [primaryKeyProp]: id,
      ...extraFields,
      iv,
      data: ciphertext,
      updatedAt: Date.now()
    };

    await this.putRecord(storeName, record);
  }

  async retrieveAndDecryptPickle(storeName: string, id: string): Promise<string | null> {
    await this.init();
    if (!this.masterKey) throw new Error('KeyStore master key unavailable');

    const record = await this.getRecord<EncryptedRecord>(storeName, id);
    if (!record || !record.data || !record.iv) return null;

    try {
      const decrypted = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: record.iv as BufferSource },
        this.masterKey,
        record.data
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      throw new Error(`Failed to decrypt pickle from store ${storeName}: integrity check failed`);
    }
  }

  private getRecord<T = any>(storeName: string, key: IDBValidKey): Promise<T | null> {
    if (!this.db) {
      const storeMap = this.memoryStore.get(storeName);
      if (!storeMap) return Promise.resolve(null);
      return Promise.resolve(storeMap.get(String(key)) || null);
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllRecords<T = any>(storeName: string): Promise<T[]> {
    await this.init();
    if (!this.db) {
      const storeMap = this.memoryStore.get(storeName);
      if (!storeMap) return [];
      return Array.from(storeMap.values());
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  private putRecord(storeName: string, value: any): Promise<void> {
    if (!this.db) {
      if (!this.memoryStore.has(storeName)) {
        this.memoryStore.set(storeName, new Map());
      }
      const primaryKey = (storeName === 'olm_sessions' || storeName === 'megolm_inbound')
        ? value.sessionId
        : (storeName === 'megolm_outbound' ? value.conversationId : (storeName === 'device_verifications' ? value.deviceId : (value.id ?? value.sessionId ?? value.conversationId ?? value.deviceId)));
      this.memoryStore.get(storeName)!.set(String(primaryKey), value);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getRecordMeta(storeName: string, id: string): Promise<EncryptedRecord | null> {
    await this.init();
    return this.getRecord<EncryptedRecord>(storeName, id);
  }

  async deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
    await this.init();
    if (!this.db) {
      const storeMap = this.memoryStore.get(storeName);
      if (storeMap) {
        storeMap.delete(String(key));
      }
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.masterKey = null;
    this.memoryStore.clear();
  }
}

export const keyStore = new KeyStore();
