# DISPATCH — worker_m6 (M6 Recovery, Verification & Security UI Worker)

## Mission
Implement Milestone M6 (Gerenciamento de Recuperação, Verificação e UI Segura - Features 21, 22, 23):
Follow the blueprint in `.agents/teamwork/explorer_m6/analysis.md` and `handoff.md`.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## User Global Rules
- NUNCA execute git push automaticamente.
- Ações de alteração de estado (INSERT / UPDATE / DELETE / Toggle) EXCLUSIVAMENTE via POST com validação CSRF (hash_equals / subtle.ConstantTimeCompare).
- Validação TLS sempre ativa em cURL.
- Zero vazamento de segredos/plaintext em logs, backend ou DOM.

## Tasks Breakdown
1. **Backend Database & Models**:
   - In `backend/internal/database/db.go`:
     Ensure `e2ee_key_backups` table supports columns:
     * `ciphertext TEXT`
     * `iv TEXT`
     * `salt TEXT`
     * `key_count INT`
     via `ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS ...`.
   - In `backend/internal/models/e2ee.go`:
     Update/add `E2EEKeyBackup` and request/response DTOs:
     * `UploadBackupRequest` (supporting `ciphertext`, `iv`, `salt`, `key_count`, `version`, as well as `backup_public_key`, `wrapped_private_key`)
     * `BackupResponse`
   - In `backend/internal/handlers/e2ee_handlers.go`:
     Enhance `UploadBackup`, `GetBackup`, `DeleteBackup` to persist and return the envelope fields (`ciphertext`, `iv`, `salt`, `key_count`, `version`).
     Ensure `DeleteBackup` handles both POST (`/api/e2ee/backup/delete`) and DELETE (`/api/e2ee/backup`).
     Ensure all mutations require POST (or DELETE) with valid CSRF token.
   - In `backend/internal/handlers/e2ee_backup_test.go`:
     Author comprehensive genuine unit tests for backup endpoints (Upload, Get, Delete, CSRF rejection, Unauthorized rejection, Invalid body rejection). Zero dummy closures or inline self-asserting maps!

2. **Client Crypto Core**:
   - In `client/src/crypto/keyStore.ts`:
     Add `getAllRecords(storeName: string): Promise<any[]>` to retrieve all stored records from IndexedDB.
   - In `client/src/crypto/recovery.ts`:
     Implement:
     * `generateRecoveryKey(): { recoveryKey: string; rawBytes: Uint8Array }`
       - Generates 32 bytes (256 bits) with `crypto.getRandomValues`.
       - Formats into `ZVC-` prefixed chunks (e.g., `ZVC-XXXX-XXXX-XXXX-XXXX`).
     * `deriveBackupKey(recoveryKey: string, salt?: Uint8Array): Promise<{ key: CryptoKey; salt: Uint8Array }>`
       - Uses WebCrypto PBKDF2 (100,000 iterations, SHA-256) deriving AES-GCM 256-bit key.
     * `encryptBackupPayload(data: Uint8Array | string, backupKey: CryptoKey): Promise<{ ciphertext: string; iv: string; salt: string }>`
     * `decryptBackupPayload(encrypted: { ciphertext: string; iv: string }, backupKey: CryptoKey): Promise<Uint8Array>`
     * `zeroBuffer(buf: Uint8Array): void`
   - In `client/src/crypto/verification.ts`:
     Implement:
     * `computeSafetyNumber(keyA: string, keyB: string): Promise<{ digits: string; qrPayload: string }>`
       - Sorts keyA and keyB lexicographically.
       - Computes SHA-256 hash of `zerovc:verify:${key1}:${key2}`.
       - Formats into 60 decimal digits (12 groups of 5 digits).
       - Generates canonical QR payload `zerovc-e2ee://verify?v=1&k1=${key1}&k2=${key2}&d=${digits}`.
     * `generateOfflineSVGQR(payload: string): string` (or pure SVG matrix generator for offline QR display without external HTTP calls).
     * Device verification store helpers (marking device as verified in IndexedDB / local storage).
   - In `client/src/crypto/backupManager.ts`:
     Implement `BackupManager`:
     * `createBackup(recoveryKey: string): Promise<UploadBackupRequest>`: exports Megolm inbound sessions from KeyStore, encrypts payload with PBKDF2-derived AES key, uploads to `/api/e2ee/backup`.
     * `restoreBackup(recoveryKey: string): Promise<{ restoredSessions: number }>`: fetches backup from `/api/e2ee/backup`, decrypts with recoveryKey, imports sessions into MegolmManager / KeyStore.
     * `deleteBackup(): Promise<void>`: calls `/api/e2ee/backup/delete`.
     * `getBackupStatus(): Promise<{ exists: boolean; version?: number; keyCount?: number; updatedAt?: string }>`
   - In `client/src/lib/api.ts`:
     Add methods to `api.e2ee`:
     * `uploadBackup(data: ...)`
     * `getBackup()`
     * `deleteBackup()`

3. **Client UI Components**:
   - `client/src/components/Modals/SecurityView.tsx`:
     Renders E2EE security overview: active device, known devices list with "Verified" / "Unverified" badges, "Verify Device" button, "Recovery Key" card with generate/view options, "Cloud Backup" card with enable/backup-now/restore/delete buttons.
   - `client/src/components/Modals/RecoveryKeyModal.tsx`:
     Displays generated 256-bit recovery key with copy-to-clipboard, download text file, warning about safety, and confirmation step. Zeroes key in memory upon modal close.
   - `client/src/components/Modals/DeviceVerificationModal.tsx`:
     Displays 60 decimal digits in 12 groups of 5 and offline SVG QR code. Provides "Mark as Verified" button.
   - `client/src/components/Modals/ProfileModal.tsx`:
     Add Security tab to navigation tabs list (`{ id: 'security', label: 'Security & E2EE', icon: Shield }`) and render `SecurityView` when active.

4. **Automated Testing Suite**:
   - In `client/scripts/test-recovery-m6.ts`:
     Author comprehensive automated test suite covering:
     * Suite 1: 256-bit Recovery Key generation, format validation, and CSPRNG entropy check.
     * Suite 2: PBKDF2 AES-GCM Key derivation, encryption, decryption, and buffer zeroization.
     * Suite 3: Safety Number computation: 60-digit representation (12x5), order-invariance (keyA/keyB == keyB/keyA), and QR code payload.
     * Suite 4: Backup Manager export, serialization, encryption, simulated upload/download, and restore into InboundGroupSessions.
     * Suite 5: Anti-leak audit: Verify zero recovery key or private key in logs or DOM.
     * Suite 6: Backend Go unit tests pass and HTTP 403 CSRF gating.
   - In `client/package.json`:
     Register script `"test:recovery-m6": "tsx scripts/test-recovery-m6.ts"`.

5. **Full Verification**:
   Execute and ensure 100% PASS on:
   - `npm run test:recovery-m6 --prefix client`
   - `npm run test:channels-m5 --prefix client`
   - `npm run test:livekit-m4 --prefix client`
   - `npm run test:callkeys-adversarial --prefix client`
   - `npm run test:frontend-m3 --prefix client`
   - `npm run test:e2e --prefix client`
   - `npm run build --prefix client`
   - `cd backend && go test -count=1 -v ./internal/handlers -run "Test.*Backup|TestE2EE" && go build ./...`

Write `handoff.md` with complete command outputs and report back via `send_message`.
