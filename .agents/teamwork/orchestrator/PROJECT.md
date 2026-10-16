# Project: ZeroVC Opt-in End-to-End Encryption (E2EE)

## Architecture
- **Cryptographic Engine**: Pure primitives via `vodozemac` (`@kinsh/vodozemac-wasm`) (Ed25519 identities, Curve25519 Olm 1:1 to-device channels, Megolm group ratchets, AES-256-GCM attachments).
- **Media Encryption**: LiveKit SFrame WebRTC insertable streams via native `ExternalE2EEKeyProvider` and Web Worker (`livekit-client/e2ee-worker`).
- **Backend Architecture**: Go 1.23.0 HTTP API + WebSocket gateway.
  - State mutations strictly via POST with CSRF HMAC validation.
  - Zero plaintext storage: `content = ''` for E2EE messages, Megolm payload stored in `e2ee_ciphertext` and `e2ee_meta` (protects `search_vector` and preview lateral joins).
  - Version gating: `X-Client-E2EE-Version` header returning 426 Upgrade Required for legacy clients.
  - Deterministic audience computation (`recomputeAudience`) with canonical user/device sorting and SHA-256 hash comparison.
- **Frontend Architecture**: React 18 + Zustand + Vite 5 (Web, Electron 30, Android Capacitor 8.5.2).
  - Pure `messageCodec` decoupled from UI store and unread counters.
  - Private keys and pickles encrypted in IndexedDB via non-extractable WebCrypto `CryptoKey`.
  - Zero secrets or plaintext exposed in DOM or console logs.

## Code Layout
- Backend:
  - Database schema & migrations: `backend/internal/database/schema.sql`, `backend/internal/database/db.go`
  - E2EE Models: `backend/internal/models/e2ee.go`
  - E2EE Handlers & Services: `backend/internal/handlers/e2ee_handlers.go`, `backend/internal/services/e2ee_service.go`
  - Version Middleware: `backend/internal/middleware/e2ee_version.go`
  - WebSocket gateway to-device delivery: `backend/internal/gateway/hub.go`, `backend/internal/gateway/client.go`
  - Message handling idempotency & storage: `backend/internal/handlers/message_handlers.go`, `backend/internal/handlers/dm_handlers.go`, `backend/internal/handlers/dm_group_handlers.go`
  - Audience recomputation: `backend/internal/handlers/permission_helpers.go`, `backend/internal/services/e2ee_service.go`
- Frontend:
  - Crypto Core: `client/src/crypto/` (`keyStore.ts`, `identity.ts`, `deviceManager.ts`, `olmSession.ts`, `megolmSession.ts`, `envelope.ts`, `attachments.ts`, `backup.ts`, `verification.ts`, `callKeys.ts`, `e2eeStore.ts`)
  - Messaging Codec: `client/src/messaging/messageCodec.ts`
  - LiveKit E2EE Hook & Manager: `client/src/lib/livekit.ts`, `client/src/lib/livekitE2EE.ts`
  - API Client Extension: `client/src/lib/api.ts`, `client/src/lib/socket.ts`
  - UI Modals & Views: `client/src/components/Modals/SecurityView.tsx`, `client/src/components/Modals/RecoveryKeyModal.tsx`, `client/src/components/Modals/DeviceVerificationModal.tsx`, `client/src/components/Modals/ProfileModal.tsx`

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Cryptographic Spike | vodozemac WASM bundle, Olm/Megolm sessions, IndexedDB key storage, LiveKit SFrame worker validation | M1 | R1 §14 (Fase 0) [VERIFIED GO] |
| 2 | Multi-Platform Matrix Check | Validate Web, Electron 30, and Android WebView (Chrome >= 86) for insertable streams | M1 | R1 §13.4 [VERIFIED GO] |
| 3 | Identity & Device Keys DB | Schema for `e2ee_identities`, `e2ee_devices`, `e2ee_one_time_keys` | M2 | R2 §10.1 |
| 4 | Signed Roster Infrastructure | `e2ee_rosters` with monotonic `version`, `epoch`, `prev_roster_hash`, and Ed25519 signature verification | M2 | R2 §6, §10.1 |
| 5 | To-Device Message Queue | Schema `e2ee_to_device` and endpoints for Olm encrypted key exchange | M2 | R2 §10.2 |
| 6 | Client Version Contract | `X-Client-E2EE-Version` middleware returning 426 Upgrade Required for legacy clients | M2 | R6 §4 |
| 7 | Secure POST Mutations | All E2EE state changes require POST + CSRF validation (HMAC constant-time) | M2 | R2 §10 |
| 8 | 1:1 DM Encrypted Messaging | Megolm encryption, pure `messageCodec`, `e2ee_ciphertext`, `e2ee_meta`, unread decoupling | M3 | R3 §8, §10.3 |
| 9 | DM Groups Encrypted Messaging | Megolm encryption, strict 15-member cap, history isolation for new members | M3 | R3 §5, §14 (Fase 4) |
| 10 | Message Idempotency & Ordering | Stable `message_id`, retry returns idempotent 200/201, conflict returns 409 | M3 | R3 §7.6 |
| 11 | Encrypted Attachments | Client-side AES-256-GCM file encryption, dedicated upload endpoint, keys inside envelope | M3 | R3 §8 |
| 12 | Encrypted Reactions & Edits | Reactions encrypted in envelope; edits encrypted with new `msg_index` and anti-replay | M3 | R3 §5, §7.10 |
| 13 | Key Request Protocol | `key_request` with rate-limiting, TTL, deduplication, first-valid signed response | M3 | R3 §7.7 |
| 14 | Undecryptable Message Isolation | Display isolated placeholder without breaking unread badge or chat rendering | M3 | R3 §11.4 |
| 15 | LiveKit Voice/Video E2EE | `ExternalE2EEKeyProvider` and worker injection into `LiveKitManager` | M4 | R4 §13 |
| 16 | Call Key State Machine | State machine (`NO_KEY` -> `GENERATING` -> `DISTRIBUTING` -> `ACTIVE` -> `ROTATING`), distributor `min(device_id)` | M4 | R4 §13 |
| 17 | Anti-Fallback & Android Gate | Block call and show upgrade modal when `isE2EESupported()` is false; forbid plaintext fallback | M4 | R4 §13.4 |
| 18 | `recomputeAudience(channel)` | Backend audience recalculation checking roles, overwrites, kicks, bans, and device revocations | M5 | R5 §12 |
| 19 | Stepped Audience Limits | Limit enforcement: initial <= 15 members, step to 50, experimental 250 with abort criteria | M5 | R5 §5, §14 (Fase 5) |
| 20 | Lazy Epoch Rotation | Increment `rotation_epoch` on audience change; next sender creates fresh Megolm session | M5 | R5 §8 |
| 21 | Recovery Key & Encrypted Backup | 256-bit client-side Recovery Key, opt-in encrypted session backup in `e2ee_key_backups` | M6 | R6 §9, §11.5 |
| 22 | Safety Verification Code | Canonical SHA-256 hash formatted as 60 decimal digits and QR code payload | M6 | R6 §7.5 |
| 23 | Privacy & Security Settings UI | `ProfileSettings` views for device management, verification, and recovery without DOM leaks | M6 | R6 §11.5 |
| 24 | E2E Dual-Track Test Suite | Requirement-driven opaque-box test suite (Tiers 1-4) covering all features | M7 | Final Milestone |
| 25 | Adversarial Coverage Hardening | Tier 5 white-box challenger testing, coverage gap audit, regression prevention | M7 | Final Milestone Phase 2 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | R1 Spike Criptográfico e LiveKit | vodozemac WASM, IndexedDB CryptoKey, Olm/Megolm sessions, LiveKit E2EE worker check, Web/Electron/Android matrix check | none | DONE |
| M2 | R2 Infraestrutura de Identidade, Dispositivos e Roster Assinado | Backend E2EE DB tables, models, handlers (POST+CSRF), signed roster verification, `X-Client-E2EE-Version`, frontend crypto store & device registration | M1 | DONE |
| M3 | R3 Mensageria E2EE em DMs e Grupos | 1:1 DMs and 15-member groups, pure `messageCodec`, idempotency, encrypted attachments/reactions/edits, `key_request` | M2 | DONE |
| M4 | R4 Chamadas de Voz/Vídeo E2EE LiveKit | Call key state machine, deterministic distributor, Olm to-device key exchange, rotation on join/leave, strict blocking on unsupported devices | M1, M2 | DONE |
| M5 | R5 Canais Criptografados de Servidor e Audiência Escalonada | `recomputeAudience(channel)`, lazy rotation, stepped limits (15 -> 50 -> 250), debounce of member churn | M2, M3 | DONE |
| M6 | R6 Gerenciamento de Recuperação, Verificação e UI Segura | 256-bit Recovery Key, opt-in encrypted backup, 60-digit/QR safety code, `ProfileSettings` `PrivacyView` & `SecurityView` | M2, M3 | PLANNED |
| M7 | Final E2E Dual-Track Test Suite & Hardening | Opaque-box E2E test suite (Tiers 1-4), adversarial test hardening (Tier 5), victory verification | M1, M2, M3, M4, M5, M6 | PLANNED |

---

## Interface Contracts

### Backend ↔ Frontend REST Contracts
- `POST /api/e2ee/identities`: Register Ed25519 identity key. Header `X-CSRF-Token` required.
- `GET /api/e2ee/identities/{user_id}`: Fetch user identity key.
- `POST /api/e2ee/devices`: Register Olm device with Ed25519 identity signature.
- `GET /api/e2ee/users/{user_id}/devices`: List non-revoked devices of a user.
- `POST /api/e2ee/devices/{device_id}/revoke`: Revoke device (triggers `recomputeAudience` and `rotation_epoch++`).
- `POST /api/e2ee/devices/keys/claim`: Claim one-time keys for session initiation.
- `POST /api/e2ee/to-device`: Queue encrypted Olm to-device message.
- `GET /api/e2ee/to-device`: Poll unread to-device messages (also pushed via WebSocket `E2EE_TO_DEVICE`).
- `POST /api/e2ee/rosters`: Submit new signed roster (`version = prev_version + 1`, valid `prev_roster_hash`, authorized signer).
- `GET /api/e2ee/rosters/{conversation_id}`: Fetch latest signed roster.
- `GET /api/channels/{id}/e2ee/audience`: Fetch valid users/devices for channel (requires `PermViewChannel`).
- `POST /api/e2ee/attachments`: Upload pre-encrypted attachment blob (returns opaque UUID, sets `Content-Disposition: attachment`).
- `POST /api/e2ee/backup`: Upload encrypted session backup.
- `GET /api/e2ee/backup`: Download encrypted session backup.
- `DELETE /api/e2ee/backup`: Delete server backup version.

### WebSocket Contracts
- Handshake: `/ws?token=...&device_id=...&e2ee_version=1`
- Server-to-Client Events:
  - `E2EE_TO_DEVICE`: Real-time delivery of Olm to-device payload.
  - `E2EE_ROSTER_UPDATE`: Broadcast of newly accepted signed roster.
  - `E2EE_ROTATION_REQUIRED`: Broadcast informing that `rotation_epoch` was bumped.
  - `E2EE_DEVICE_LIST_UPDATE`: Broadcast of added/revoked devices.
