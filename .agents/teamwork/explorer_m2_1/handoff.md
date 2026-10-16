# Handoff Report — Explorer M2.1: Backend Identity, Devices & Signed Roster Infrastructure

**Milestone:** M2 (R2 Infraestrutura de Identidade, Dispositivos e Roster Assinado - Fase 1)  
**Author:** Explorer M2.1  
**Target Path:** `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_1\handoff.md`  
**Date:** 2026-10-08T18:15:00Z  

---

## 1. Observation

### 1.1 Existing Backend Baseline & Dependencies
- Command: `go test ./...` run in `backend/` executed with exit code 0:
  - `ok github.com/zerovc/zerovc/backend/internal/middleware (cached)`
  - `ok github.com/zerovc/zerovc/backend/internal/ratelimit (cached)`
  - Total packages clean, Go version in `go.mod`: `go 1.23.0`.
- Dependencies in `backend/go.mod` (lines 5–14):
  - `github.com/go-chi/chi/v5 v5.0.12`
  - `github.com/google/uuid v1.6.0`
  - `github.com/gorilla/websocket v1.5.1`
  - `github.com/jackc/pgx/v5 v5.5.5`
  - Standard Go library `crypto/ed25519` is built-in (available since Go 1.13) and does not require external CGO or third-party wrappers.

### 1.2 Database Migration Architecture
- File: `backend/internal/database/db.go`:
  - Lines 13–15: `//go:embed schema.sql` embeds base schema into `var SchemaSQL string`.
  - Lines 48–53: `AutoMigrate(ctx context.Context)` executes `db.Pool.Exec(ctx, SchemaSQL)`.
  - Lines 54–165: Subsequent idempotent statements (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) apply non-destructive updates.
- File: `backend/internal/database/schema.sql`:
  - Line 413: `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED`.
  - Spec requirement (Revision 6, line 230–232): Leaving `content = ''` when `encrypted = true` keeps `search_vector` empty without table re-writes, and SQL lateral previews (`lm.content`) return empty string without leaking plaintext.

### 1.3 Security, CSRF & Authentication Patterns
- File: `backend/cmd/server/main.go`:
  - Lines 75–76: `authService := auth.NewService(jwtSecret)`, `csrfService := appMiddleware.NewCSRFService(jwtSecret)`.
  - Lines 261–264:
    ```go
    r.Group(func(r chi.Router) {
        r.Use(authService.Middleware)
        r.Use(csrfService.RequireCSRF)
    ```
  - Lines 433–452: WebSocket endpoint mounted at `r.Get("/ws", ...)`. Authenticated via `authService.Middleware` (query param `?token=...` or cookie), safe GET method naturally bypasses CSRF check.
- User Global Security Directive:
  - All state-altering actions (INSERT / UPDATE / DELETE / Toggle) must accept **EXCLUSIVELY** the `POST` method. `GET` or `<a href="...">` must never be used. Constant-time CSRF validation is strictly enforced on all mutating requests.

### 1.4 WebSocket Gateway Topology
- File: `backend/internal/gateway/hub.go`:
  - Lines 14: `clients map[uuid.UUID]map[*Client]bool`. Currently clients are mapped only by `UserID`.
  - Lines 200–238: Helpers `BroadcastToGuild`, `BroadcastToUsers`, `BroadcastGlobal`, `SendToUser`.
- File: `backend/internal/gateway/client.go`:
  - Lines 39–45: `Client` struct contains `Hub`, `Conn`, `UserID`, `send chan []byte`, `lastTyping`. No `DeviceID` is tracked currently.
  - Lines 180–198: `ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request, userID uuid.UUID)` upgrades connection.

### 1.5 Specification Requirements for M2
From `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` and `DISPATCH.md`:
1. 7 E2EE tables: `e2ee_identities`, `e2ee_devices`, `e2ee_one_time_keys`, `e2ee_to_device`, `e2ee_rosters`, `e2ee_key_backups`, `e2ee_backup_sessions`.
2. Conversation columns: `e2ee_enabled BOOLEAN DEFAULT FALSE`, `rotation_epoch INT DEFAULT 1` on `dm_rooms`, `dm_groups`, `channels`.
3. Message columns: `encrypted BOOLEAN DEFAULT FALSE`, `e2ee_ciphertext TEXT`, `e2ee_meta JSONB` on `messages`, `dm_messages`, `dm_group_messages`, `reactions`.
4. Client version gating via `X-Client-E2EE-Version`: HTTP 426 Upgrade Required with `{ "error": "e2ee_client_outdated", "min_version": N }` when `< E2EE_MIN_CLIENT_VERSION`.
5. Cryptographic signature verification using standard library `crypto/ed25519.Verify` on device keys and signed rosters.
6. Signed rosters enforce monotonic `version = prev_version + 1`, SHA-256 chaining `prev_roster_hash`, canonical audience hashing (`user_id ASC, device_id ASC`), and authorized signer check.
7. To-device queue with real-time push over WebSocket (`E2EE_TO_DEVICE`) when recipient device is online.

---

## 2. Logic Chain

### 2.1 Database Schema & Migration Idempotency
- *Premise*: ZeroVC uses Postgres 15+ and runs `AutoMigrate` on every boot via `db.Pool.Exec(ctx, SchemaSQL)` followed by `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- *Inference*: Adding the 7 E2EE tables and conversation columns with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guarantees seamless deployment without dropping or altering existing non-E2EE tables.
- *Artifacts Produced*:
  - `proposed_schema.sql.patch` (5.5 KB): Extends `backend/internal/database/schema.sql` with Section 31.
  - `proposed_db.go.patch` (2.5 KB): Adds idempotent statements to `backend/internal/database/db.go:AutoMigrate`.

### 2.2 Go Models & Canonical Enums
- *Premise*: Specification §10.1 defines `ConversationType` as a strict canonical enum (`dm`, `dm_group`, `channel`) backed by a Postgres `CHECK` constraint.
- *Inference*: A dedicated models file `backend/internal/models/e2ee.go` isolates cryptographic entities, prevents circular dependencies, and defines all REST DTOs and event payloads.
- *Artifact Produced*:
  - `proposed_e2ee_models.go` (6.9 KB): Comprehensive structs for identities, devices, OTKs, to-device queue, rosters, and backups.

### 2.3 Client Version Gating Middleware
- *Premise*: Specification §4 dictates that all E2EE requests require header `X-Client-E2EE-Version: <int>`, returning 426 Upgrade Required if `< E2EE_MIN_CLIENT_VERSION` (default: 1).
- *Inference*: Implementing `backend/internal/middleware/e2ee_version.go` as a standard Chi middleware intercepts requests before route handlers execute, preventing legacy clients from corrupting E2EE state.
- *Artifact Produced*:
  - `proposed_e2ee_version_middleware.go` (1.5 KB): Pure Chi HTTP middleware with environment variable configuration.

### 2.4 Cryptographic Device & Roster Verification
- *Premise*: In Olm/vodozemac, device keys (Curve25519 + Ed25519) are signed by the account's Ed25519 identity key. In signed rosters, the authorized participant signs the snapshot with their Ed25519 identity key.
- *Inference*: Using standard library `crypto/ed25519.Verify(pubKey, payload, sig)`:
  - Keys and signatures are decoded from standard base64, raw unpadded base64, or hex.
  - Signing payloads use deterministic domain separation:
    - Device: `zerovc-device-v1:<user_id>:<curve25519_key>:<ed25519_key>`
    - Roster: `zerovc-roster-v1:<conv_type>:<conv_id>:<version>:<epoch>:<prev_hash>:<audience_hash>:<signer_user_id>:<signer_device_id>`
  - Chaining is enforced: `new_version == current_version + 1` and `new_prev_hash == SHA256(previous_roster_payload)`.
  - Canonical audience hash sorts members by `user_id ASC` and devices by `user_id ASC, device_id ASC`.
- *Artifact Produced*:
  - `proposed_e2ee_handlers.go` (35.8 KB): Full REST handler suite covering all 16 endpoints.

### 2.5 Real-Time To-Device WebSocket Routing
- *Premise*: Olm session keys (`room_key`, `call_key`, `key_request`) are addressed to specific devices (`recipient_device_id UUID`).
- *Inference*:
  - Modifying `Client` in `client.go` to store `DeviceID *uuid.UUID` (extracted from `/ws?device_id=...`).
  - Extending `Hub` in `hub.go` with `clientsByDevice map[uuid.UUID]*Client`, protected by `sync.RWMutex`.
  - Adding `Hub.SendToDevice(deviceID, event) bool` and `Hub.IsDeviceOnline(deviceID) bool`.
  - When `POST /api/e2ee/to-device` executes, if the target device is online, `E2EE_TO_DEVICE` is delivered immediately via WebSocket. Offline messages remain in `e2ee_to_device` until the device connects and calls `GET /api/e2ee/to-device`.
- *Artifacts Produced*:
  - `proposed_client.go.patch` (0.5 KB)
  - `proposed_hub.go.patch` (1.3 KB)
  - `proposed_main.go.patch` (1.7 KB)

### 2.6 Independent Validation Test Suite
- *Premise*: To guarantee that algorithms and cryptographic primitives function without compiler or runtime failure before builder integration.
- *Inference*: Built test harness exercising key generation, device signing, roster chaining, audience hashing, and version middleware.
- *Result*: Test execution `go test -v ./...` passed with exit code 0 in 1.164s (`TestVerifyEd25519AndRosterLogic: PASS`).
- *Artifact Produced*:
  - `proposed_e2ee_handlers_test.go` (6.1 KB)

---

## 3. Caveats

1. **Signer Authorization for Channels**:
   - In DM and DM Groups, membership and ownership are queried directly from `dm_rooms` and `dm_group_members`.
   - In Server Channels (`ConversationTypeChannel`), the signer must possess channel access permissions. The proposed handler queries `guild_members` and channel existence. In Milestone M5, `recomputeAudience` will connect full role bitmask and permission overwrite evaluation (`PermViewChannel` and `PermManageChannels`).
2. **Key Request Routing**:
   - `POST /api/e2ee/to-device` handles `msg_type = "key_request"`, `"room_key"`, and `"call_key"`. In Milestone M3, rate limiting per `(requester_device_id, session_id)` will be attached via `httprate` to prevent request storms.
3. **Database Execution**:
   - As an explorer running in read-only mode, the proposed changes are prepared as complete replacement files and unified diff patches in `.agents/teamwork/explorer_m2_1/`. The builder agent will apply these files to the repository tree.

---

## 4. Conclusion

1. **Complete Drop-In Architecture Ready**: All 7 database tables, conversation/message columns, models, version middleware, REST handlers (16 endpoints), and WebSocket gateway extensions are fully designed, documented, and provided as drop-in files.
2. **Cryptographic Integrity**: Pure standard library `crypto/ed25519.Verify` verifies device registration and roster signatures without external CGO or binary dependencies.
3. **Strict Security Compliance**: All mutation endpoints strictly accept `POST` requests and require authenticated sessions + HMAC CSRF validation, complying with both project rules and spec Revision 6.
4. **Verified Correctness**: Cryptographic device signing, roster chaining, deterministic audience hashing, and HTTP 426 version gating were tested and verified with `go test` exiting code 0.

---

## 5. Verification Method

### 5.1 Verification Commands
To verify the implementation once applied by the builder agent:

1. **Verify Backend Build**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go build ./...
   ```
   *Expected Result*: Exits with code 0 and zero warnings.

2. **Verify Unit Test Suite**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/handlers
   ```
   *Expected Result*: Runs `TestEd25519SignatureVerification`, `TestDeviceKeyRegistrationSignature`, `TestRosterChainingAndAudienceHash`, and `TestE2EEVersionMiddleware`, reporting `PASS`.

3. **Verify Scratch Test Harness**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\.gemini\antigravity\scratch\e2ee_verify"
   go test -v ./...
   ```
   *Expected Result*: Exits with code 0 (`PASS`).

### 5.2 File Inspection Checklist
Verify the presence and integrity of all drop-in files in `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_1\`:
- [x] `proposed_e2ee_models.go` -> Target: `backend/internal/models/e2ee.go`
- [x] `proposed_e2ee_version_middleware.go` -> Target: `backend/internal/middleware/e2ee_version.go`
- [x] `proposed_e2ee_handlers.go` -> Target: `backend/internal/handlers/e2ee_handlers.go`
- [x] `proposed_e2ee_handlers_test.go` -> Target: `backend/internal/handlers/e2ee_handlers_test.go`
- [x] `proposed_schema.sql.patch` -> Target: `backend/internal/database/schema.sql`
- [x] `proposed_db.go.patch` -> Target: `backend/internal/database/db.go`
- [x] `proposed_client.go.patch` -> Target: `backend/internal/gateway/client.go`
- [x] `proposed_hub.go.patch` -> Target: `backend/internal/gateway/hub.go`
- [x] `proposed_main.go.patch` -> Target: `backend/cmd/server/main.go`

### 5.3 Invalidation Conditions
- If `ed25519.Verify` rejects valid client signatures, verify whether the client is sending standard Base64 vs URL-safe Base64 vs Hex; `decodeKeyOrSig` handles all three.
- If roster version conflict (HTTP 409) occurs unexpectedly, verify that the client fetched `GET /api/e2ee/rosters/{id}` to get the latest `version` and `prev_roster_hash` before submitting.
- If mutating endpoints accept `GET` or `PUT`, this violates project security policy and must be rejected.
