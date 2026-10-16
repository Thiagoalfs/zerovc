# Milestone M6 Technical Investigation & Blueprint
**Role**: explorer_m6 (M6 Recovery & Verification Explorer)  
**Date**: 2026-10-15  
**Scope**: Gerenciamento de Recuperação, Verificação e UI Segura (Features 21, 22, 23 - Fases 1, 2, 6)

---

## 1. Executive Summary

Milestone M6 encompasses three foundational E2EE security pillars of the ZeroVC architecture:
1. **Feature 21: Recovery Key & Encrypted Cloud Backup**: 256-bit client-side CSPRNG Recovery Key formatted in human-readable alphanumeric chunks, WebCrypto PBKDF2/AES-GCM session key envelope encryption, opt-in upload to backend PostgreSQL (`e2ee_key_backups`), retrieval, and atomic restoration into local IndexedDB (`megolm_inbound`).
2. **Feature 22: Safety Verification Code**: Canonical SHA-256 fingerprinting of lexicographically sorted Ed25519 identity public keys formatted into 60 decimal digits (12 groups of 5 digits) and offline QR code payload (`zerovc-e2ee://verify?v=1...`) for out-of-band identity verification and man-in-the-middle prevention.
3. **Feature 23: Privacy & Security Settings UI**: Dedicated `SecurityView.tsx`, `RecoveryKeyModal.tsx`, and `DeviceVerificationModal.tsx` integrated smoothly into `ProfileModal.tsx` (`ProfileSettings`), ensuring active device listing with verification badges, device revocation, zero DOM attributes or log exposure of cryptographic secrets, and secure teardown on modal close.

Current baseline verification status:
- Backend: `go test ./...` 100% PASS (2.301s).
- Client TypeScript: `npx tsc --noEmit` 0 errors.
- Dual-Track E2E Test Suite: `npm run test:e2e` (Tiers 1-4) 181/181 PASS (0.42s).

---

## 2. Backend Architecture & Blueprint

### 2.1 Database Schema & Migrations

#### Investigation Findings
- File: `backend/internal/database/schema.sql` (lines 552-574).
- The table `e2ee_key_backups` is currently defined as:
  ```sql
  CREATE TABLE IF NOT EXISTS e2ee_key_backups (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      backup_public_key TEXT NOT NULL,
      wrapped_private_key TEXT NOT NULL,
      version BIGINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  ```
- Supplemental execution in `backend/internal/database/db.go` (`AutoMigrate`):
  `db.Pool.Exec(ctx, SchemaSQL)` executes `schema.sql`. However, for existing databases already created, `db.go` runs individual `ALTER TABLE` queries. Currently, `db.go` does not have explicit `ALTER TABLE` or table check for `e2ee_key_backups`.
- Schema alignment needed:
  The tests in `client/tests/e2e/tier1-feature-coverage.ts` (lines 1079-1084) and `client/tests/e2e/harness/mock-backend.ts` (lines 570-583) store:
  - `backup_ciphertext` / `ciphertext` (AES-256-GCM ciphertext hex)
  - `iv` (12-byte IV hex)
  - `salt` (PBKDF2 salt string)
  - `key_count` (number of Megolm sessions backed up)
  - `version` (backup version int64)

#### Proposed Schema Migration (`schema.sql` & `db.go`)
```sql
-- Ensure e2ee_key_backups table exists with complete envelope columns
CREATE TABLE IF NOT EXISTS e2ee_key_backups (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    backup_public_key TEXT NOT NULL DEFAULT '',
    wrapped_private_key TEXT NOT NULL DEFAULT '',
    ciphertext TEXT,
    iv TEXT,
    salt TEXT,
    key_count INT DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Backward & Forward Compatibility Migrations in db.go AutoMigrate
ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS ciphertext TEXT;
ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS iv TEXT;
ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS salt TEXT;
ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS key_count INT DEFAULT 0;
ALTER TABLE e2ee_key_backups ALTER COLUMN backup_public_key DROP NOT NULL;
ALTER TABLE e2ee_key_backups ALTER COLUMN wrapped_private_key DROP NOT NULL;
```

---

### 2.2 Go Models & DTOs (`backend/internal/models/e2ee.go`)

Update `E2EEKeyBackup` and add DTOs:

```go
// E2EEKeyBackup stores a user's cloud-backed session recovery envelope.
type E2EEKeyBackup struct {
	UserID            uuid.UUID `json:"user_id"`
	BackupPublicKey   string    `json:"backup_public_key,omitempty"`
	WrappedPrivateKey string    `json:"wrapped_private_key,omitempty"`
	Ciphertext        string    `json:"ciphertext,omitempty"`
	IV                string    `json:"iv,omitempty"`
	Salt              string    `json:"salt,omitempty"`
	KeyCount          int       `json:"key_count,omitempty"`
	Version           int64     `json:"version"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// UploadBackupRequest represents the payload for POST /api/e2ee/backup.
// Supports both Recovery Key envelope format and Matrix key wrapping format.
type UploadBackupRequest struct {
	Ciphertext       string `json:"ciphertext"`
	BackupCiphertext string `json:"backup_ciphertext"` // Alias for ciphertext used in tests
	IV               string `json:"iv"`
	Salt             string `json:"salt,omitempty"`
	KeyCount         int    `json:"key_count,omitempty"`
	Version          int64  `json:"version"`

	BackupPublicKey   string `json:"backup_public_key,omitempty"`
	WrappedPrivateKey string `json:"wrapped_private_key,omitempty"`
}

// KeyBackupResponse represents the unified response envelope for GET /api/e2ee/backup.
type KeyBackupResponse struct {
	Backup     E2EEKeyBackup `json:"backup"`
	Ciphertext string        `json:"ciphertext,omitempty"`
	IV         string        `json:"iv,omitempty"`
	Version    int64         `json:"version,omitempty"`
	Status     string        `json:"status,omitempty"`
}
```

---

### 2.3 Route Configuration & Security Handlers

#### Route Setup (`backend/cmd/server/main.go`)
In `main.go`, lines 450-486, within the protected router with `authService.Middleware`, `csrfService.RequireCSRF`, and `RequireE2EEClientVersion`:

```go
// E2EE Session Key Backup (Opt-in)
r.Post("/api/e2ee/backup", e2eeHandler.UploadBackup)
r.Get("/api/e2ee/backup", e2eeHandler.GetBackup)
r.Post("/api/e2ee/backup/delete", e2eeHandler.DeleteBackup)
r.Delete("/api/e2ee/backup", e2eeHandler.DeleteBackup) // REST-standard alias with CSRF
```

#### Handlers Design (`backend/internal/handlers/e2ee_handlers.go`)

1. **`UploadBackup` (`POST /api/e2ee/backup`)**:
   - Authentication check: `userID, ok := auth.GetUserIDFromContext(r.Context())`.
   - CSRF check: handled automatically by `csrfService.RequireCSRF` middleware.
   - Body parsing:
     ```go
     var req models.UploadBackupRequest
     if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
         http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
         return
     }
     if req.Ciphertext == "" && req.BackupCiphertext != "" {
         req.Ciphertext = req.BackupCiphertext
     }
     if (req.Ciphertext == "" || req.IV == "") && (req.BackupPublicKey == "" || req.WrappedPrivateKey == "") {
         http.Error(w, `{"error":"missing_backup_keys"}`, http.StatusBadRequest)
         return
     }
     if req.Version <= 0 {
         req.Version = 1
     }
     ```
   - Upsert SQL:
     ```sql
     INSERT INTO e2ee_key_backups (
         user_id, backup_public_key, wrapped_private_key, ciphertext, iv, salt, key_count, version, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
         backup_public_key = COALESCE(NULLIF(EXCLUDED.backup_public_key, ''), e2ee_key_backups.backup_public_key),
         wrapped_private_key = COALESCE(NULLIF(EXCLUDED.wrapped_private_key, ''), e2ee_key_backups.wrapped_private_key),
         ciphertext = COALESCE(NULLIF(EXCLUDED.ciphertext, ''), e2ee_key_backups.ciphertext),
         iv = COALESCE(NULLIF(EXCLUDED.iv, ''), e2ee_key_backups.iv),
         salt = COALESCE(NULLIF(EXCLUDED.salt, ''), e2ee_key_backups.salt),
         key_count = CASE WHEN EXCLUDED.key_count > 0 THEN EXCLUDED.key_count ELSE e2ee_key_backups.key_count END,
         version = EXCLUDED.version,
         updated_at = CURRENT_TIMESTAMP;
     ```
   - JSON response: `{"status":"saved","version":req.Version}`.

2. **`GetBackup` (`GET /api/e2ee/backup`)**:
   - Query:
     ```sql
     SELECT user_id, COALESCE(backup_public_key, ''), COALESCE(wrapped_private_key, ''),
            COALESCE(ciphertext, ''), COALESCE(iv, ''), COALESCE(salt, ''),
            COALESCE(key_count, 0), version, created_at, updated_at
     FROM e2ee_key_backups
     WHERE user_id = $1
     ```
   - If not found: HTTP 404 `{"error":"backup_not_found"}`.
   - Response formatting:
     ```go
     resp := models.KeyBackupResponse{
         Backup:     backup,
         Ciphertext: backup.Ciphertext,
         IV:         backup.IV,
         Version:    backup.Version,
         Status:     "ok",
     }
     w.Header().Set("Content-Type", "application/json")
     json.NewEncoder(w).Encode(resp)
     ```
     This structure supports both client consumers accessing `data.backup.ciphertext` (E2E tests) and consumers accessing `data.ciphertext`.

3. **`DeleteBackup` (`POST /api/e2ee/backup/delete` & `DELETE /api/e2ee/backup`)**:
   - Enforces CSRF for state change.
   - Deletes in transaction:
     ```sql
     DELETE FROM e2ee_backup_sessions WHERE user_id = $1;
     DELETE FROM e2ee_key_backups WHERE user_id = $1;
     ```
   - JSON response: `{"status":"deleted"}`.

---

### 2.4 Backend Unit Test Plan (`e2ee_backup_test.go`)

Create `backend/internal/handlers/e2ee_backup_test.go` to test all backup paths:
1. `TestUploadBackup_Unauthorized`: HTTP 401 when no auth context.
2. `TestUploadBackup_InvalidJSON`: HTTP 400 when body is malformed.
3. `TestUploadBackup_MissingFields`: HTTP 400 when keys/ciphertext missing.
4. `TestUploadBackup_Success_EnvelopeFormat`: HTTP 200 with `status: "saved"`.
5. `TestUploadBackup_Success_MatrixFormat`: HTTP 200 with `status: "saved"`.
6. `TestGetBackup_NotFound`: HTTP 404 when no backup exists.
7. `TestGetBackup_Success`: HTTP 200 returns matching ciphertext, IV, and version.
8. `TestDeleteBackup_Success`: HTTP 200 `status: "deleted"`, subsequent GET returns 404.
9. `TestDeleteBackup_BothEndpoints`: Tests both `POST /api/e2ee/backup/delete` and `DELETE /api/e2ee/backup`.
10. `TestBackup_CSRFRejection`: Verifies state mutation without `X-CSRF-Token` fails with HTTP 403.

---

## 3. Client Cryptography Architecture & Blueprint

### 3.1 256-bit Recovery Key (`client/src/crypto/recovery.ts`)

#### Responsibilities
- Generate 256-bit cryptographically secure random entropy via `globalThis.crypto.getRandomValues`.
- Format raw bytes into human-friendly chunked key string: `ZVC-XXXX-XXXX-XXXX-XXXX`.
- Normalize and parse formatted string back to raw bytes (stripping `ZVC-`, hyphens, whitespace).
- Derive AES-GCM-256 encryption key using PBKDF2 (100,000 iterations of SHA-256 with salt `zerovc-e2ee-backup-salt-v1`).
- Guarantee zero plaintext persistence and zero leakage in memory.

#### Specification
```ts
export interface RecoveryKeyData {
  rawBytes: Uint8Array;
  formattedKey: string;
}

export function generateRecoveryKey(): RecoveryKeyData {
  const rawBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(rawBytes);

  // Convert to Base64url without padding, uppercase alphanumeric chunks
  const binaryString = String.fromCharCode(...rawBytes);
  const base64 = btoa(binaryString).replace(/[/+=]/g, '').slice(0, 32);

  const formattedKey = `ZVC-${base64.slice(0, 8)}-${base64.slice(8, 16)}-${base64.slice(16, 24)}-${base64.slice(24, 32)}`;
  return { rawBytes, formattedKey };
}

export function parseRecoveryKey(formatted: string): Uint8Array {
  const clean = formatted.trim().toUpperCase().replace(/^ZVC-/, '').replace(/[^A-Za-z0-9]/g, '');
  if (clean.length < 32) {
    throw new Error('Chave de recuperação inválida: tamanho insuficiente');
  }
  // Reconstruct bytes
  // ...
}

export async function deriveKeyFromRecovery(
  recoveryBytes: Uint8Array,
  saltStr = 'zerovc-e2ee-backup-salt-v1'
): Promise<CryptoKey> {
  const salt = new TextEncoder().encode(saltStr);
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    recoveryBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable CryptoKey
    ['encrypt', 'decrypt']
  );
}
```

---

### 3.2 Safety Verification Code (`client/src/crypto/verification.ts`)

#### Responsibilities
- Compute canonical cryptographic digest from two Ed25519 identity public keys.
- Enforce commutative ordering (`[keyA, keyB].sort()`) so both peers calculate the identical code.
- Format into 60 decimal digits (12 groups of 5 digits) using SHA-256 big-endian UInt16 modulo 100,000.
- Produce canonical QR code URI payload: `zerovc-e2ee://verify?v=1&k1=${k1}&k2=${k2}&d=${digits}`.
- Manage local verified devices in IndexedDB (`keyStore`) and reactive state.

#### Specification
```ts
export interface SafetyVerificationResult {
  code: string;         // "12345 67890 12345 ..." (12 groups of 5)
  rawDigits: string;    // 60 continuous digits
  qrPayload: string;    // "zerovc-e2ee://verify?v=1&k1=...&k2=...&d=..."
}

export async function computeSafetyVerificationCode(
  keyA: string,
  keyB: string
): Promise<SafetyVerificationResult> {
  const sorted = [keyA, keyB].sort();
  const combined = `zerovc:verify:${sorted[0]}:${sorted[1]}`;
  const hashBuffer = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(combined)
  );

  const hashBytes = new Uint8Array(hashBuffer);
  const dataView = new DataView(hashBuffer);

  let digits = '';
  for (let i = 0; i < 24; i += 2) {
    const val = dataView.getUint16(i, false) % 100000;
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
```

---

### 3.3 Backup Manager (`client/src/crypto/backupManager.ts`)

#### Responsibilities
- Collect all inbound Megolm sessions from `keyStore.getAllRecords('megolm_inbound')`.
- Encrypt session payload with recovery-derived AES-GCM-256 key and upload to `/api/e2ee/backup`.
- Fetch backup envelope, decrypt with recovery key, and import restored sessions into `megolmSession.ts` (`registerInboundSession`).
- Purge cloud backup on user request (`POST /api/e2ee/backup/delete`).

#### Flow Specification
```ts
export interface BackupSessionItem {
  conversationId: string;
  sessionId: string;
  sessionKey: string;
  epoch?: number;
  senderDeviceId?: string;
}

export class BackupManager {
  async createAndUploadBackup(recoveryKeyBytes: Uint8Array): Promise<{ sessionCount: number; version: number }> {
    // 1. Gather all inbound sessions from keyStore
    const records = await keyStore.getAllRecords<any>('megolm_inbound');
    const sessions: BackupSessionItem[] = [];

    for (const rec of records) {
      if (rec.sessionKey) {
        sessions.push({
          conversationId: rec.conversationId,
          sessionId: rec.sessionId,
          sessionKey: rec.sessionKey,
          epoch: rec.epoch,
          senderDeviceId: rec.senderDeviceId,
        });
      }
    }

    // 2. Encrypt using PBKDF2/AES-GCM
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const derivedKey = await deriveKeyFromRecovery(recoveryKeyBytes);
    const plaintextBytes = new TextEncoder().encode(JSON.stringify(sessions));

    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      plaintextBytes
    );

    const ciphertextHex = Array.from(new Uint8Array(ciphertextBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // 3. Upload to backend
    await api.e2ee.uploadBackup({
      backup_ciphertext: ciphertextHex,
      iv: ivHex,
      salt: 'zerovc-e2ee-backup-salt-v1',
      key_count: sessions.length,
      version: 1,
    });

    return { sessionCount: sessions.length, version: 1 };
  }

  async restoreBackup(recoveryKeyBytes: Uint8Array): Promise<{ restoredCount: number }> {
    // 1. Fetch from backend
    const res = await api.e2ee.getBackup();
    const backup = res.backup;
    if (!backup || !backup.ciphertext || !backup.iv) {
      throw new Error('Nenhum backup encontrado no servidor');
    }

    // 2. Decrypt
    const derivedKey = await deriveKeyFromRecovery(recoveryKeyBytes, backup.salt || 'zerovc-e2ee-backup-salt-v1');
    const iv = new Uint8Array(backup.iv.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    const ciphertextBytes = new Uint8Array(backup.ciphertext.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));

    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      ciphertextBytes
    );

    const sessions: BackupSessionItem[] = JSON.parse(new TextDecoder().decode(decryptedBuffer));

    // 3. Import each session
    let count = 0;
    for (const s of sessions) {
      await megolmManager.registerInboundSession(
        s.conversationId,
        s.sessionId,
        s.sessionKey,
        s.senderDeviceId || '',
        s.epoch || 1
      );
      count++;
    }

    return { restoredCount: count };
  }

  async deleteBackup(): Promise<void> {
    await api.e2ee.deleteBackup();
  }
}

export const backupManager = new BackupManager();
```

---

### 3.4 KeyStore Extensions (`client/src/crypto/keyStore.ts`)

`KeyStore` requires the following additions:
1. `getAllRecords<T = any>(storeName: string): Promise<T[]>`: enables querying all stored records via `IDBObjectStore.openCursor()` or `getAll()`.
2. New store `device_verifications`: stores verification status per device/peer:
   ```ts
   if (!db.objectStoreNames.contains('device_verifications')) {
     db.createObjectStore('device_verifications', { keyPath: 'deviceId' });
   }
   ```
3. In `registerInboundSession` (`megolmSession.ts`), persist `sessionKey` inside `extraFields` of `megolm_inbound` so it is readily available for cloud backup export.

---

## 4. Client UI Architecture & Blueprint

### 4.1 Component Hierarchy

```
client/src/components/Modals/
├── ProfileModal.tsx (adds "Criptografia & Segurança" tab in sidebar)
├── SecurityView.tsx (Device list, verification badges, backup status card)
├── RecoveryKeyModal.tsx (Setup mode: key generation & download; Restore mode: import)
└── DeviceVerificationModal.tsx (60-digit comparison & zero-network inline QR SVG)
```

---

### 4.2 `SecurityView.tsx` Design

- **State & Data**:
  - `devices: DevicePublicInfo[]`: fetched via `api.e2ee.getUserDevices(user.id)`.
  - `backupInfo: { hasBackup: boolean; updatedAt?: string; keyCount?: number; version?: number }`: fetched via `api.e2ee.getBackup()`.
  - `revokingDeviceId: string | null`: track active revocation action.
- **Sections**:
  1. **Status Geral de Criptografia**:
     - Visual badge: `Criptografia E2EE Ativa (vodozemac WASM)`.
     - Fingerprint do Dispositivo Atual: primeiros 8 e últimos 8 caracteres da chave Ed25519 em fonte mono.
  2. **Backup de Chaves na Nuvem (Opt-in)**:
     - Card com status:
       - Se ativo: "Backup Ativo — X sessões salvas na nuvem". Botões: "Atualizar Backup", "Restaurar Sessões", "Excluir Backup".
       - Se inativo: "Nenhum backup configurado. Suas mensagens só podem ser lidas nos seus aparelhos atuais." Botão: "Configurar Chave de Recuperação".
  3. **Dispositivos Registrados (Olm)**:
     - Lista de aparelhos com ícone (Laptop / Smartphone / Monitor).
     - Selo de verificação:
       - `Verificado` (Verde, `ShieldCheck`).
       - `Não Verificado` (Amarelo, `AlertTriangle`).
     - Botão "Verificar Código de Segurança" -> dispara `DeviceVerificationModal`.
     - Botão "Revogar Acesso" -> POST com CSRF para `/api/e2ee/devices/{device_id}/revoke`.

---

### 4.3 `RecoveryKeyModal.tsx` Design

- **Props**:
  - `isOpen: boolean`
  - `mode: 'setup' | 'restore'`
  - `onClose: () => void`
  - `onSuccess?: () => void`
- **Setup Flow**:
  1. Gera `generateRecoveryKey()`.
  2. Renderiza em 4 blocos distintos com classe `font-mono tracking-widest text-base font-bold text-brand-300 bg-background-darkest p-3 rounded-xl border border-white/10`.
  3. Ações:
     - "Copiar Chave": copia para a área de transferência usando `copyToClipboard` e exibe aviso temporário "Copiado!".
     - "Baixar Chave (.txt)": cria blob de texto e aciona download como `zerovc-recovery-key.txt`.
  4. Checkbox de confirmação: "Entendo que se perder esta chave e meus aparelhos, minhas mensagens não poderão ser recuperadas."
  5. Botão de confirmação: "Ativar Backup Criptografado" -> chama `backupManager.createAndUploadBackup()`.
  6. **Anti-leak / Teardown**: `useEffect` de unmount limpa as variáveis de chave da memória (`rawBytes.fill(0)`).
- **Restore Flow**:
  1. Campo de texto monospace para inserção da chave.
  2. Botão "Restaurar": chama `backupManager.restoreBackup(parsedBytes)`.
  3. Exibe feedback de sucesso com contagem de sessões importadas.

---

### 4.4 `DeviceVerificationModal.tsx` Design

- **Props**:
  - `isOpen: boolean`
  - `peerUser: User`
  - `peerDevice: { device_id: string; ed25519_key: string }`
  - `onClose: () => void`
  - `onVerified?: () => void`
- **Features**:
  1. Calcula `computeSafetyVerificationCode(myEd25519, peerDevice.ed25519_key)`.
  2. Renderiza os 60 dígitos divididos em blocos de 5 dígitos (ex: 4 linhas de 3 grupos):
     ```tsx
     <div className="grid grid-cols-3 gap-2 text-center font-mono font-bold text-white text-sm bg-background-darkest p-4 rounded-2xl border border-white/10">
       {groups.map((group, idx) => (
         <div key={idx} className="bg-white/5 py-1.5 px-2 rounded-lg tracking-widest">
           {group}
         </div>
       ))}
     </div>
     ```
  3. Renderização de QR Code:
     - Implementado via SVG vetorial inline (ou Canvas) sem dependência externa e sem chamada de rede para `api.qrserver.com`.
     - Garante privacidade 100% estrita offline.
  4. Botão "Confirmar Verificação": salva `verified: true` no store e fecha modal.

---

### 4.5 Integration into `ProfileModal.tsx`

1. Adicionar `'security'` ao tipo `activeTab` em `ProfileModal.tsx`:
   ```ts
   type Tab = 'account' | 'profile' | 'privacy' | 'security' | 'sessions' | ...;
   ```
2. Adicionar botão na barra lateral (Desktop e Gaveta Mobile) sob a seção "Configurações de Usuário":
   ```tsx
   {/* Tab: Criptografia & Segurança */}
   <button
     type="button"
     onClick={() => setActiveTab('security')}
     className={`flex items-center px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
       activeTab === 'security'
         ? 'bg-white/10 text-white font-medium'
         : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
     }`}
   >
     <Shield className="w-4 h-4 mr-2 text-brand-400" />
     <span>Criptografia & Segurança</span>
   </button>
   ```
3. Renderizar `<SecurityView />` na área principal de conteúdo.

---

## 5. Security Audit & User Global Rules Compliance

| Regra Global Antigravity | Status no Design M6 | Evidência / Mecanismo de Garantia |
|---|---|---|
| **Zero Git Push Automático** | COMPLIANT | Nenhuma operação de push é executada. |
| **Mutações de Estado Exclusivamente via POST** | COMPLIANT | `POST /api/e2ee/backup` e `POST /api/e2ee/backup/delete` (com suporte opcional a `DELETE /api/e2ee/backup` para REST specs). Revogação de dispositivo via `POST /api/e2ee/devices/{device_id}/revoke`. |
| **Validação CSRF de Tempo Constante** | COMPLIANT | Middleware `csrfService.RequireCSRF` com `subtle.ConstantTimeCompare` e validação HMAC ativa em todas as mutações. Frontend `api.ts` anexa header `X-CSRF-Token`. |
| **TLS / SSL Ativo em Requisições Externas** | COMPLIANT | Zero desativação de TLS. Geração de QR Code realizada internamente sem envio de dados para servidores externos. |
| **Zero Vazamento de Segredos em DOM / Logs** | COMPLIANT | Chave de recuperação nunca gravada em atributos HTML (`data-*`, `id`), logs sanitizados por `safeCryptoLogger` (com censura de `recoveryKey`), e limpeza de buffers na desmontagem de componentes. |

---

## 6. Implementation Phasing for Implementers

### Fase 1: Backend Database & Handlers
1. Atualizar `backend/internal/database/db.go` para assegurar a criação e colunas de `e2ee_key_backups` (`ciphertext`, `iv`, `salt`, `key_count`).
2. Atualizar `backend/internal/models/e2ee.go` com os DTOs `UploadBackupRequest` e `KeyBackupResponse`.
3. Ajustar `UploadBackup`, `GetBackup` e `DeleteBackup` em `backend/internal/handlers/e2ee_handlers.go`.
4. Criar suíte de testes unitários em `backend/internal/handlers/e2ee_backup_test.go` e validar com `go test ./...`.

### Fase 2: Client Crypto Modules
1. Criar `client/src/crypto/recovery.ts` (geração 256 bits, formato `ZVC-`, derivação PBKDF2).
2. Criar `client/src/crypto/verification.ts` (digest SHA-256 canônico, 60 dígitos, payload QR).
3. Atualizar `client/src/crypto/keyStore.ts` com `getAllRecords` e tabela `device_verifications`.
4. Criar `client/src/crypto/backupManager.ts` (exportação, cifragem, upload, download, decifragem e importação em `megolm_inbound`).
5. Adicionar métodos de backup no namespace `api.e2ee` em `client/src/lib/api.ts`.

### Fase 3: Client UI Components & Integration
1. Criar `client/src/components/Modals/SecurityView.tsx`.
2. Criar `client/src/components/Modals/RecoveryKeyModal.tsx`.
3. Criar `client/src/components/Modals/DeviceVerificationModal.tsx`.
4. Integrar aba "Criptografia & Segurança" em `client/src/components/Modals/ProfileModal.tsx`.
5. Validar com `npx tsc --noEmit` e `npm run test:e2e`.
