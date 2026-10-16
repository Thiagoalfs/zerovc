# Handoff Report — Explorer Survey 1: Backend Architecture & Database

## 1. Observation

### 1.1 Codebase & Build Verification
- Command: `go build ./...` run in directory `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend`.
  - Output: Exit code 0, no compiler warnings or errors. Go version in `go.mod`: `go 1.23.0`.
- Command: `go test ./...` run in directory `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend`.
  - Result:
    - `ok github.com/zerovc/zerovc/backend/internal/middleware 1.305s` (4 tests in `csrf_test.go` and full suite in `csrf_challenge_test.go`).
    - `ok github.com/zerovc/zerovc/backend/internal/ratelimit 2.542s` (`limiter_test.go` and `challenge_stress_test.go`).
    - Other packages (`handlers`, `models`, `database`, `auth`, `gateway`, `services`, `voice`, `cmd/server`) report `[no test files]`.

### 1.2 Directory Layout & Entrypoints
- Root: `go.work` binds `./backend`.
- Server entrypoint: `backend/cmd/server/main.go` (609 lines).
  - Lines 52–58: Configuration extracted via `mustGetEnv` (`DATABASE_URL`, `JWT_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) and `getEnv` (`PORT`, `LIVEKIT_PUBLIC_URL`, `WEB_DIR`, `UPLOAD_DIR`, etc.).
  - Lines 63–72: Postgres connection via `database.Connect(dbURL)` and automatic schema migration via `db.AutoMigrate(context.Background())`.
  - Lines 75–79: Instantiates `authService = auth.NewService(jwtSecret)`, `csrfService = appMiddleware.NewCSRFService(jwtSecret)`, `livekitService = voice.NewLiveKitService(...)`, `hub = gateway.NewHub()`, runs `go hub.Run()`.
  - Lines 148–171: Handlers initialized: `authHandler`, `userHandler`, `guildHandler`, `channelHandler`, `messageHandler`, `inviteHandler`, `friendHandler`, `roleHandler`, `dmHandler`, `dmGroupHandler`, `linkPreviewHandler`, `uploadHandler`, `commandHandler`, `gameHandler`, `tempCleaner`.
  - Lines 173–201: Chi Router setup with `middleware.RequestID`, `middleware.RealIP`, `middleware.Logger`, `middleware.Recoverer`, `middleware.Compress(5)`, `middleware.Timeout(30s)`, and `cors.Handler`.
  - Lines 209–220: Public auth endpoints at `/api/auth/*` (`register`, `login`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `logout`).
  - Lines 261–453: Protected API routes wrapped with `r.Use(authService.Middleware)` and `r.Use(csrfService.RequireCSRF)`.

### 1.3 Database Architecture & Migrations
- Migration mechanism: `backend/internal/database/db.go`:
  - Line 14: `//go:embed schema.sql` embeds the entire base schema.
  - Lines 48–168: `AutoMigrate(ctx context.Context) error` executes `db.Pool.Exec(ctx, SchemaSQL)` followed by explicit idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` and `CREATE INDEX IF NOT EXISTS ...` statements.
  - No external migration CLI or tool like `golang-migrate` is required at runtime; migrations run automatically during startup.
- Key existing tables and relationships:
  - `users`: `id UUID PRIMARY KEY`, `username`, `email`, `password_hash`, `saved_status`, etc.
  - `user_sessions`: `id UUID PRIMARY KEY`, `user_id UUID REFERENCES users(id)`, `token_hash VARCHAR(64)`, `device_type`, `os`, `browser`, `last_active_at`, `created_at`.
  - `guilds`: `id UUID PRIMARY KEY`, `name`, `owner_id UUID REFERENCES users(id)`.
  - `guild_roles`: `id UUID PRIMARY KEY`, `guild_id UUID REFERENCES guilds(id)`, `position INT`, `permissions BIGINT`.
  - `guild_members`: `(guild_id, user_id) PRIMARY KEY`.
  - `guild_member_roles`: `(guild_id, user_id, role_id) PRIMARY KEY`.
  - `channels`: `id UUID PRIMARY KEY`, `guild_id UUID`, `type VARCHAR(16)` ('text', 'voice', 'category'), `is_private BOOLEAN`, `position INT`.
  - `channel_permission_overwrites`: `(channel_id, role_id) PRIMARY KEY`, `allow BIGINT`, `deny BIGINT`.
  - `messages`: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `channel_id UUID REFERENCES channels(id)`, `author_id UUID REFERENCES users(id)`, `content TEXT`, `attachments JSONB`, `reply_to_id UUID`, `is_pinned`, `is_edited`, `is_tts`, `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED`.
  - `dm_rooms`: `id UUID PRIMARY KEY`, `user1_id UUID`, `user2_id UUID`, `user1_closed_at`, `user2_closed_at`, `CONSTRAINT unique_dm_pair UNIQUE (user1_id, user2_id)`.
  - `dm_messages`: `id UUID PRIMARY KEY`, `dm_room_id UUID`, `author_id UUID`, `content TEXT`, `attachments JSONB`.
  - `dm_groups`: `id UUID PRIMARY KEY`, `owner_id UUID REFERENCES users(id)`, `name`, `icon_url`.
  - `dm_group_members`: `(group_id, user_id) PRIMARY KEY`.
  - `dm_group_messages`: `id UUID PRIMARY KEY`, `group_id UUID`, `author_id UUID`, `content TEXT`, `attachments JSONB`.
  - `message_reactions`: `id UUID PRIMARY KEY`, `message_id UUID`, `dm_message_id UUID`, `user_id UUID`, `emoji VARCHAR(32)`.

### 1.4 Authentication, CSRF & Mutation Patterns
- File: `backend/internal/auth/auth.go`:
  - Lines 48–60: JWT HS256 tokens issued with 30-day validity, containing `UserID` and `Username`.
  - Lines 79–118: `authService.Middleware` extracts token from:
    1. HttpOnly cookie `token`
    2. Header `Authorization: Bearer <token>`
    3. Query param `?token=...` (WebSocket handshake fallback)
    Sets context value with key `auth.UserContextKey` (`uuid.UUID`).
- File: `backend/internal/middleware/csrf.go`:
  - Lines 36–46: Dedicated 256-bit CSRF key derived from `jwtSecret` via domain separation SHA256: `zerovc-csrf-key-derivation-v1:<jwtSecret>`.
  - Lines 50–61: Token format: `<16-byte-salt-hex>.<timestamp-unix>.<hmac-sha256-hex>`. Bound to `userID`.
  - Lines 151–189: `RequireCSRF` middleware:
    - Bypasses safe HTTP methods (`GET`, `HEAD`, `OPTIONS`).
    - Enforces on `POST`, `PUT`, `PATCH`, `DELETE`:
      1. Context `userID` present.
      2. Header `X-CSRF-Token` present.
      3. Double-submit constant-time check if `csrf_token` cookie is present.
      4. Cryptographic HMAC validation for `userID` in constant time (`subtle.ConstantTimeCompare`).
    - Immediate HTTP 403 Forbidden on failure with zero database queries.

### 1.5 WebSocket Hub & Event Distribution
- File: `backend/internal/gateway/hub.go`:
  - Lines 12–29: `Hub` struct stores `clients map[uuid.UUID]map[*Client]bool` and `guildMembers map[uuid.UUID]map[uuid.UUID]bool`.
  - Lines 55–144: Event loop in `Run()` routes messages based on `msg.UserIDs`, `msg.GuildID`, or global.
  - Lines 200–238: Distribution helpers: `BroadcastToGuild(guildID, event)`, `BroadcastToUsers(userIDs, event)`, `BroadcastGlobal(event)`, `SendToUser(userID, event)`.
  - Currently, `clients` is keyed only by `userID uuid.UUID`. Each user can have multiple connected `Client` instances (e.g. multi-tab or multi-device).
- File: `backend/internal/gateway/client.go`:
  - Lines 39–45: `Client` struct stores `Hub`, `Conn *websocket.Conn`, `UserID uuid.UUID`, `send chan []byte`, `lastTyping time.Time`.
  - Lines 180–198: `ServeWs` upgrades HTTP request to WebSocket and registers client on `hub.Register`.

### 1.6 Permissions & Hierarchy
- File: `backend/internal/models/models.go`:
  - Lines 133–158: Bitmask constants: `PermAdministrator (1<<0)`, `PermManageGuild (1<<1)`, `PermManageRoles (1<<2)`, `PermManageChannels (1<<3)`, `PermKickMembers (1<<4)`, `PermBanMembers (1<<5)`, `PermMuteMembers (1<<6)`, `PermSendMessages (1<<7)`, `PermViewChannel (1<<14 = 16384)`.
- File: `backend/internal/handlers/permission_helpers.go`:
  - Lines 21–55: `loadActorGuildContext`: loads `owner_id`, aggregates role bitmask permissions via `BIT_OR`, evaluates `HasAdmin = IsOwner || (Perms & PermAdministrator != 0)`.
  - Lines 112–171: `canUserSendTTS`: illustrates combining base role permissions with `@everyone` channel overwrites (`allow`, `deny`) and specific member role overwrites.

---

## 2. Logic Chain

1. **Database Idempotency Pattern**:
   - *Observation*: `backend/internal/database/db.go:48–168` embeds `schema.sql` and executes `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
   - *Deduction*: New E2EE tables (`e2ee_identities`, `e2ee_devices`, `e2ee_one_time_keys`, `e2ee_to_device`, `e2ee_key_backups`, `e2ee_backup_sessions`, `e2ee_rosters`) and columns (`e2ee_enabled`, `rotation_epoch`, `encrypted`, `e2ee_ciphertext`, `e2ee_meta`) should be added to `backend/internal/database/schema.sql` and `db.AutoMigrate()` following this exact pattern. This guarantees seamless startup migrations with zero breaking schema rewrites.

2. **Search Vector Isolation**:
   - *Observation*: `schema.sql:413` defines `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED`.
   - *Observation*: Specification `e2ee_implementation_plan_revision6.md:228-231` states: "Usar coluna separada (`e2ee_ciphertext`) em vez de reutilizar `content` evita mexer na coluna gerada `search_vector`... com `content=''` ela fica vazia automaticamente".
   - *Deduction*: In `messages`, `dm_messages`, and `dm_group_messages`, leaving `content = ''` when `encrypted = true` ensures Postgres full-text indexing generates an empty vector, `ILIKE` will never match plaintext, and existing lateral join previews (`lm.content`, `rm.content`) naturally return an empty string without leaking ciphertext or plaintext.

3. **Message Idempotency & Ordering**:
   - *Observation*: Currently `SendMessage` handlers (`message_handlers.go:174`, `dm_handlers.go:463`, `dm_group_handlers.go:694`) generate new IDs via Postgres default `gen_random_uuid()`.
   - *Observation*: Specification §7.6 & §10.3 requires: "cada mensagem E2EE possui `message_id` estável gerado pelo cliente. O backend deve garantir idempotência por conversa (`conversation_id + message_id`); reentrega via WebSocket/histórico nunca cria uma segunda mensagem... Retry com payload criptográfico idêntico retorna sucesso idempotente; o mesmo `message_id` com ciphertext/metadados incompatíveis é rejeitado [409 Conflict]".
   - *Deduction*: Handlers must allow the client to specify `req.ID` (`uuid.UUID`). If provided:
     - Check if `id` already exists in the conversation table.
     - If it exists and `(e2ee_ciphertext, e2ee_meta)` match: return HTTP 200/201 with existing record (idempotent success).
     - If it exists and content differs: return HTTP 409 Conflict.
     - If it does not exist: insert with the client-supplied ID.

4. **Audience Recomputation Architecture (`recomputeAudience`)**:
   - *Observation*: `permission_helpers.go` and `guild_handlers.go:334` model permission overwrites on `channel_permission_overwrites` (`channel_id`, `role_id`, `allow`, `deny`).
   - *Observation*: Spec §12 specifies deterministic audience ordering (`user_id ASC`, `device_id ASC`), `audience_hash = SHA256(...)`, and lazy epoch increment (`rotation_epoch++` only if `new_audience_hash != current_audience_hash`).
   - *Deduction*: `recomputeAudience(ctx, channelID uuid.UUID)` in `internal/services/e2ee_service.go` or `internal/handlers/e2ee_handlers.go` should:
     1. Query channel details (`guild_id`, `is_private`, `e2ee_enabled`, `rotation_epoch`).
     2. If `!e2ee_enabled`, abort.
     3. Query all members of the guild, computing their effective `PermViewChannel` permission:
        - Guild owner has `PermViewChannel`.
        - Anyone with `PermAdministrator` on any assigned role has `PermViewChannel`.
        - For others: compute base bitmask from roles -> apply `@everyone` overwrite -> apply specific role overwrites -> verify `(perms & PermViewChannel) != 0`.
     4. Collect eligible `user_id`s (enforce limits: up to 15 in Phase 1-5; warn/reject if exceeded).
     5. Query valid E2EE devices for these users (`revoked_at IS NULL`).
     6. Sort canonically by `user_id ASC`, `device_id ASC`.
     7. Compute SHA-256 `audience_hash`.
     8. Compare against the latest roster's `audience_hash`.
     9. If equal: do nothing (return current roster).
     10. If different: inside an atomic transaction with channel lock (`SELECT ... FOR UPDATE`):
         - Increment `rotation_epoch` on `channels`.
         - Increment `version` for the next roster.
         - Broadcast `E2EE_ROTATION_REQUIRED` and `E2EE_DEVICE_LIST_UPDATE` via WebSocket.
     11. Hook triggers into all points where audience changes:
         - `guild_handlers.go`: `KickMember`, `BanMember`, `UnbanMember`, `Leave`
         - `invite_handlers.go`: `JoinByInvite`
         - `role_handlers.go`: `AssignRole`, `RemoveRole`, `Update` (if permissions change)
         - `channel_handlers.go`: `UpdatePermissionOverwrite`, `DeletePermissionOverwrite`, `Update` (if `is_private` changes)
         - `e2ee_handlers.go`: `RevokeDevice`
         - `auth_handlers.go`: `RevokeSession`, `RevokeOtherSessions`

5. **WebSocket Gateway Extension for To-Device Messaging**:
   - *Observation*: Gateway currently maps `clients map[uuid.UUID]map[*Client]bool` (only `UserID` is stored on `Client`).
   - *Observation*: To-device messages in E2EE (`e2ee_to_device`) are directed to `recipient_device_id UUID`.
   - *Deduction*: `Client` in `backend/internal/gateway/client.go` should track optional `DeviceID *uuid.UUID` (passed as query param `/ws?token=...&device_id=...`). `Hub` can store `clientsByDevice map[uuid.UUID]*Client` and provide `SendToDevice(deviceID uuid.UUID, event models.WSEvent)`. When to-device messages are inserted, if the target device is online, `E2EE_TO_DEVICE` is immediately delivered via WebSocket. Otherwise, messages remain in `e2ee_to_device` until the device connects and calls `GET /api/e2ee/to-device`.

6. **Client Version Enforcement (`X-Client-E2EE-Version`)**:
   - *Observation*: Spec §4 requires: "Todo cliente envia header `X-Client-E2EE-Version: <inteiro>`. Backend mantém `E2EE_MIN_CLIENT_VERSION`. Requisições a endpoints E2EE ou a salas E2EE com versão < mínimo retornam 426 Upgrade Required com corpo `{ "error": "e2ee_client_outdated", "min_version": N }`".
   - *Deduction*: Create `internal/middleware/e2ee_version.go`:
     - Reads `E2EE_MIN_CLIENT_VERSION` from environment (default: `1`).
     - Extracts and parses integer from header `X-Client-E2EE-Version`.
     - If `< minVersion`, returns HTTP 426 Upgrade Required.
     - Applied to `/api/e2ee/*` routes and message posting to E2EE-enabled conversations.

---

## 3. Caveats

- **Web CDN & Anexos E2EE**: While upload endpoints in `upload_handlers.go` handle multi-part forms and check extensions, E2EE attachments must bypass server-side MIME sniffing, thumbnailing, or image re-encoding. A dedicated endpoint `POST /api/e2ee/attachments` or flag in `upload_handlers.go` is required that accepts `application/octet-stream`, returns an opaque UUID path, and sets `Content-Disposition: attachment` and `CSP: sandbox`.
- **Roster Cryptographic Signing**: The spec requires the client (authorized actor) to sign the roster with its Ed25519 identity key (`signature TEXT`). The backend verifies this Ed25519 signature before persisting to `e2ee_rosters`. Standard Go library `crypto/ed25519.Verify` can be used directly without any external CGO or third-party dependency.
- **Concurrent Roster Mutations**: When multiple clients submit rosters simultaneously, the transaction must acquire a row-level lock on the parent conversation (`channels`, `dm_rooms`, or `dm_groups`) with `SELECT rotation_epoch, e2ee_enabled FROM ... FOR UPDATE` to avoid race conditions. If `version != current_version + 1`, the backend must reject with HTTP 409 `e2ee_roster_conflict`.
- **No plaintext logging**: Server loggers (`middleware.Logger` and handler logs) must never output `e2ee_ciphertext`, `payload`, or `session_data`.

---

## 4. Conclusion

1. The Go backend is exceptionally clean, compiles with zero errors under Go 1.23.0, and already has production-grade CSRF protection, session management, and rate limiting in place.
2. The existing migration pattern (`//go:embed schema.sql` + `db.AutoMigrate()`) is directly suited for adding all 7 required E2EE tables (`e2ee_identities`, `e2ee_devices`, `e2ee_one_time_keys`, `e2ee_to_device`, `e2ee_key_backups`, `e2ee_backup_sessions`, `e2ee_rosters`) and conversation flags without disrupting existing non-E2EE conversations.
3. Message search and preview queries naturally protect E2EE messages from leaks by leaving `content = ''` and storing the encrypted Megolm envelope in `e2ee_ciphertext` and `e2ee_meta`.
4. The permission system in ZeroVC already implements owner bypass, administrator bypass, and channel permission overwrites (`channel_permission_overwrites`), enabling `recomputeAudience` to be implemented deterministically with SHA-256 audience hashing.
5. All 18 proposed E2EE REST endpoints fit neatly into a dedicated `backend/internal/handlers/e2ee_handlers.go` and can be mounted inside the authenticated + CSRF protected router group in `main.go`.

---

## 5. Verification Method

To independently verify all findings in this report:

1. **Verify Backend Build**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go build ./...
   ```
   *Expected result*: Command exits with code 0 and no errors.

2. **Verify Backend Unit Tests**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test ./...
   ```
   *Expected result*: Tests in `internal/middleware` and `internal/ratelimit` pass.

3. **Inspect Schema & Migration Files**:
   - View `backend/internal/database/db.go` (lines 48–168) to verify the `AutoMigrate` pattern.
   - View `backend/internal/database/schema.sql` (lines 316–330) to verify `search_vector` trigger on `content`.

4. **Inspect Route & Security Middlewares**:
   - View `backend/cmd/server/main.go` (lines 261–265) to verify `authService.Middleware` and `csrfService.RequireCSRF`.
   - View `backend/internal/middleware/csrf.go` (lines 151–189) to verify CSRF validation semantics.

5. **Invalidation Conditions**:
   - If `go build ./...` fails, dependencies in `go.mod` or syntax errors have been introduced.
   - If non-POST endpoints are added for E2EE state mutations, this violates both the E2EE spec and global project security directives.
