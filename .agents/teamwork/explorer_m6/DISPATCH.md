# DISPATCH — explorer_m6 (M6 Recovery, Verification & Security UI Explorer)

## Mission
Investigate and formulate the technical implementation blueprint for Milestone M6:
1. **256-bit Recovery Key**:
   - Client-side CSPRNG generation (`crypto.getRandomValues`) of 256-bit entropy.
   - Format: Base58 or formatted groups (e.g. 8x4 alphanumeric or mnemonic word format).
   - Key derivation (PBKDF2 / HKDF / WebCrypto `deriveKey` with SHA-256 and salt) to generate an AES-GCM-256 key for local session backup encryption.
   - Never expose Recovery Key to server, logs, or persistent unencrypted storage.
2. **Opt-in Encrypted Session Backup**:
   - Backend database schema: check if table `e2ee_key_backups` exists in Postgres migrations or needs creation.
   - Endpoints:
     * `POST /api/e2ee/backup`: Upload encrypted session backup envelope (`ciphertext`, `iv`, `salt`, `key_count`, `version`). Must require `POST` + CSRF (`RequireCSRF`) + constant-time token comparison.
     * `GET /api/e2ee/backup`: Retrieve user's latest encrypted backup envelope.
     * `DELETE /api/e2ee/backup`: Purge backup. Must require `POST` or `DELETE` with CSRF.
   - Client sync: Export Megolm inbound sessions / pickle, encrypt with recovery-derived AES key, upload to backup endpoint; restore flow decrypts and imports into MegolmManager / KeyStore.
3. **Safety Verification Code (SAS / Fingerprint)**:
   - Canonical calculation: sort two users' Ed25519 identity keys lexicographically, concatenate, compute SHA-256 hash.
   - Format: 60 decimal digits (12 groups of 5 digits) and canonical string for QR code generation.
   - Compare two devices / users to establish cross-signing / verified status in local device storage.
4. **Security & Privacy Settings UI**:
   - `ProfileSettings` / `SecurityView` / `PrivacyView`:
     * Device list display with verification badge (Verified vs Unverified) and Revoke button.
     * Modal for Recovery Key generation and download/copy.
     * Modal for Device / Contact Verification (display 60 digits and QR code).
     * Modal for Encrypted Backup enable/restore/delete.
     * Anti-leak: Zero private key, recovery key, or plaintext leaked to DOM attributes, console logs, or analytics.

## Output
Write `analysis.md` and `handoff.md` in `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m6\`.
Report completion back via `send_message`.


## 2026-10-15T19:22:20Z
[Message from parent c7bad961-fa24-42cb-b324-2269f48b6b9e]
Perform comprehensive technical investigation of Milestone M6 (Gerenciamento de Recuperação, Verificação e UI Segura - Fases 1, 2, 6):
1. Investigate backend:
   - Check PostgreSQL migrations/schema in backend/migrations or handlers for `e2ee_key_backups` table.
   - Check `backend/internal/models/` for existing backup models.
   - Check existing routes in `backend/cmd/server/main.go` and `backend/internal/handlers/` for backup endpoints.
   - Design the exact Go structs, SQL queries, endpoints (`POST /api/e2ee/backup`, `GET /api/e2ee/backup`, `DELETE /api/e2ee/backup`), CSRF protection, and unit test plan.
2. Investigate client crypto:
   - Check `client/src/crypto/` for existing recovery/backup/verification files.
   - Design `client/src/crypto/recovery.ts`: 256-bit CSPRNG key generation, Base58/hex-chunk formatting, PBKDF2/HKDF AES-GCM-256 derivation, zero plaintext leaks.
   - Design `client/src/crypto/verification.ts`: canonical SHA-256 fingerprinting of Ed25519 identity keys formatted into 60 digits (12x5) and QR code string payload, device verification store/state.
   - Design `client/src/crypto/backupManager.ts`: export inbound Megolm sessions, encrypt with recovery-derived key, upload to `/api/e2ee/backup`, download, decrypt, and import into `megolmSession.ts` / IndexedDB.
3. Investigate client UI:
   - Check `client/src/components/Modals/` and settings views for `SecurityView.tsx`, `PrivacyView.tsx`, `RecoveryKeyModal.tsx`, `DeviceVerificationModal.tsx`, `ProfileModal.tsx`.
   - Ensure clean integration into settings/profile navigation without leaking sensitive material into DOM attributes, console logs, or analytics.
4. Verify User Global Rules compliance (POST only for mutations, CSRF validation, zero git push, TLS in cURL).
