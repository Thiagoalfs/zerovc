# Handoff Report: Phase 0 Backend Architecture, Security & Contracts Survey

- **Author Agent**: `teamwork_preview_explorer_backend` (Specification Miner)
- **Recipient Agent**: Parent (`37ac41a1-52f9-4aad-bfb7-9203f8e60e3b`)
- **Date**: 2026-09-17
- **Handoff Type**: Hard (Task Complete)
- **Deliverables**:
  - Full Survey Report: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_backend\survey_backend_contracts.md`
  - Handoff Report: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_backend\handoff.md`

---

## 1. Observation

Direct observations from source inspection of `backend/` and `client/`:

1. **Backend Directory Structure**:
   - The Go backend is located in `backend/` (not `server/`), containing `backend/cmd/server/main.go`, `backend/internal/` (`audit`, `auth`, `database`, `email`, `gateway`, `handlers`, `models`, `ratelimit`, `voice`), and `backend/migrations/`.
   - Uses `go-chi/chi/v5` for routing, `jackc/pgx/v5` for PostgreSQL pooling, `golang-jwt/jwt/v5` for stateless tokens, and `gorilla/websocket` for real-time gateway at `/ws`.

2. **CSRF Protection Deficiencies**:
   - In `backend/cmd/server/main.go` lines 182-192:
     ```go
     r.Use(cors.Handler(cors.Options{
         AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:4173"},
         AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
         AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
         AllowCredentials: true,
         MaxAge:           300,
     }))
     ```
   - Search across `backend/` for CSRF validation or token generation returned zero matches. No middleware checks `X-CSRF-Token`.
   - Web clients authenticate via HttpOnly cookie `token` with `SameSite: Lax` (`backend/internal/handlers/auth_handlers.go` line 349).
   - In `client/src/lib/api.ts` lines 23-45, `apiClient` attaches `credentials: 'include'` and reads token from `localStorage` for Electron, but sets no `X-CSRF-Token` header.

3. **HTTP Method Conventions**:
   - Evaluated all 117 routes in `backend/cmd/server/main.go`.
   - **Zero state mutations occur via `GET`.** All state-changing routes use `POST`, `PATCH`, `PUT`, or `DELETE`.
   - Web, Electron, and Mobile clients rely on `PATCH` (e.g., `/api/users/@me`, `/api/guilds/{id}`, `/api/channels/{id}`, `/api/channels/{channelID}/messages/{messageID}`), `PUT` (e.g., `/api/channels/{id}/permissions/{roleID}`, `/api/guilds/{guildID}/channels/positions`, `/api/guilds/{guildID}/roles/positions`), and `DELETE` (e.g., `/api/guilds/{id}/bans/{userID}`, `/api/channels/{id}`, `/api/guilds/{guildID}/roles/{roleID}`, `/api/friends/{id}/reject`).

4. **Rate Limiting Implementation & Holes**:
   - IP rate limiting is configured in `backend/cmd/server/main.go` lines 205-236:
     - `/api/auth`: `httprate.LimitByIP(10, 1*time.Minute)`
     - `/api/invites/{code}`: `httprate.LimitByIP(30, 1*time.Minute)`
     - `/api/link-preview`: `httprate.LimitByIP(20, 1*time.Minute)`
   - Token bucket limiter is implemented in `backend/internal/ratelimit/limiter.go` lines 1-137 (`UserRateLimiter`) protecting:
     - Messages: 10 burst, 5/s
     - Guild creation: 5 / hour
     - Uploads: 15 / min
     - Sensitive auth: 5 / 5 min
     - Join server: 10 / min
     - Voice connect: 15 / min
     - Reactions & pins: 30 / min & 10 / min
   - **Gaps Observed**:
     - Moderation endpoints (`kick`, `ban`, `unban`, `mute`) have no rate limiter.
     - Structure mutations (`POST /api/guilds/{guildID}/channels`, `POST /api/guilds/{guildID}/roles`, role assignment/reorder) have no rate limiter.
     - Message `PATCH` and `DELETE` have no rate limiter.
     - Channel ack `POST /api/channels/{channelID}/ack` has no rate limiter.
     - `/api/auth/login` lacks per-username/per-account rate limiting (only IP rate limit of 10/min across all logins).

5. **Database Transaction Safeguards**:
   - `pgxpool.Pool` configured with `MaxConns = 25`, `MinConns = 5`, `MaxConnLifetime = 1h`, `MaxConnIdleTime = 15m` (`backend/internal/database/db.go` lines 27-30).
   - In `backend/internal/handlers/guild_handlers.go`:
     - `BanMember` (lines 1024-1065) executes 4 queries sequentially on `h.db` without `Begin(ctx)`: `INSERT INTO guild_bans`, `DELETE FROM guild_member_roles`, `DELETE FROM voice_sessions`, `DELETE FROM guild_members`.
     - `KickMember` (lines 980-1015) executes 3 discrete `DELETE` statements on `h.db` without `Begin(ctx)`.
   - In `backend/internal/handlers/invite_handlers.go`:
     - `JoinByInvite` (lines 142-185) executes 3 discrete queries on `h.db` (`INSERT guild_members`, `INSERT guild_member_roles`, `UPDATE guild_invites`) without `Begin(ctx)`.
   - Missing foreign key indexes:
     - `dm_messages(reply_to_id)`
     - `dm_group_messages(reply_to_id)`
     - `channel_read_states(channel_id)`

6. **Contracts & Real-Time Gateway**:
   - 46 distinct `WS_EVENT` types mapped between `backend/internal/gateway/` and `client/src/lib/socket.ts`.
   - Envelope format: `{"type": "<EVENT_NAME>", "data": { ... }}`.
   - Dual routes exist for 1x1 call control: `/api/dms/{roomID}/call/*` and `/api/dm/rooms/{roomID}/call/*` in `backend/cmd/server/main.go` lines 360-377. Both resolve to `DMHandler` call methods.
   - Client platforms authenticate:
     - Web: Cookie `token` sent via browser credentials.
     - Desktop (Electron): Bearer header `Authorization: Bearer <token>` + WebSocket query `?token=<token>`.
     - Mobile (Capacitor): Bearer header or Cookie depending on Android WebView origin.

---

## 2. Logic Chain

1. **From Observation 2 (Missing CSRF & Cookie auth)**:
   - Because Web clients store auth in an HttpOnly cookie sent automatically by the browser, and no CSRF validation exists on the backend, state-mutating requests are exposed to cross-site request forgery if an attacker tricks the user into triggering requests.
   - The user-defined project rule requires that all state-changing endpoints (INSERT, UPDATE, DELETE, Toggle) validate CSRF tokens using constant-time comparison (`subtle.ConstantTimeCompare`).
   - Therefore, a CSRF mitigation mechanism (token issuance + Go middleware with `subtle.ConstantTimeCompare`) is an urgent requirement.

2. **From Observation 3 (HTTP Methods: PATCH, PUT, DELETE in use by clients)**:
   - Zero state mutations use `GET`, satisfying the rule that `GET` must never alter state.
   - However, existing clients use `PATCH`, `PUT`, and `DELETE`. Replacing or disabling these methods would break the Electron desktop app, Android app, and current web builds.
   - Therefore, to preserve 100% backward compatibility (Requirement R4), the backend must support existing `PATCH`, `PUT`, and `DELETE` routes while enforcing CSRF tokens on all mutation methods (`POST`, `PATCH`, `PUT`, `DELETE`).

3. **From Observation 4 (Rate Limiting Coverage & Gaps)**:
   - IP-level rate limiting alone on `/api/auth` is vulnerable to distributed credential stuffing / brute force targeting specific usernames.
   - The absence of limits on moderation actions (`kick`, `ban`) and channel/role creation allows bad actors with permissions to spam requests, bloating the PostgreSQL database or degrading server performance.
   - Therefore, the token bucket limiter (`ratelimit.UserRateLimiter`) must be extended to moderation, channel/role creation, channel ack, and message edits/deletes, along with per-account login throttling.

4. **From Observation 5 (Non-Transactional Multi-Statement Operations)**:
   - `BanMember`, `KickMember`, and `JoinByInvite` execute multi-table operations without a transaction. If query 2 or 3 fails (e.g. database timeout or disconnect), the database enters an inconsistent state (e.g., user is added to `guild_members` but not given `@everyone` role, or user is banned but retained in voice sessions).
   - Therefore, these operations must be wrapped in `tx, err := h.db.Begin(ctx)` with deferred `tx.Rollback(ctx)` and explicit `tx.Commit(ctx)`.

5. **From Observation 6 (WebSocket & REST Compatibility)**:
   - 46 WS events and strict JSON schemas are actively consumed by client stores in `client/src/lib/socket.ts` and `client/src/types/index.ts`.
   - Dual call routes `/api/dms/...` and `/api/dm/rooms/...` must both be preserved.
   - Any backend change must guarantee zero schema mutations (keys, types, nullability) to maintain seamless operation across Web, Electron, and Mobile.

---

## 3. Caveats

1. **LiveKit Server Instance**:
   - The LiveKit server configuration is managed externally (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`). The Go backend generates join tokens using the official `livekit/protocol` SDK. LiveKit cluster scaling and WebRTC TURN/STUN configurations were not modified or probed on live network infrastructure.
2. **Read-Only Scope**:
   - As per Specification Miner constraints, no application code was modified in `backend/` or `client/`. All recommendations are architectural and specification findings for subsequent phases.
3. **Database Migrations on Live Host**:
   - Adding indexes (`idx_dm_messages_reply_to_id`, `idx_dm_group_messages_reply_to_id`) can be executed via `CREATE INDEX CONCURRENTLY` in production PostgreSQL to avoid locking tables.

---

## 4. Conclusion

1. **Requirement R3 (Backend Architecture & Security)**:
   - The Go backend architecture is clean, performant, and well-structured with Chi router and `pgxpool`.
   - Critical vulnerabilities identified: absence of CSRF protection across all state mutations, lack of per-account brute force protection on `/login`, unthrottled moderation/channel/role endpoints, and non-transactional ban/kick/join routines.
   - Concrete fixes designed: constant-time CSRF middleware, expanded token-bucket rate limiting, and transaction wrapping.
2. **Requirement R4 (Contract & Backward Compatibility)**:
   - All 117 HTTP endpoints and 46 WebSocket events are fully mapped and documented in `survey_backend_contracts.md`.
   - Existing HTTP method signatures (`POST`, `PATCH`, `PUT`, `DELETE`), URL paths (including dual DM call routes), and JSON schemas are preserved verbatim.

---

## 5. Verification Method

To independently verify the observations and specifications documented in this report:

1. **Verify Go Backend Build and Tests**:
   ```bash
   cd backend
   go vet ./...
   go test -v ./...
   ```
2. **Verify Route Inventory & Handlers**:
   Inspect `backend/cmd/server/main.go` lines 180-385:
   - Confirm all 117 route definitions and their corresponding handler attachments.
   - Confirm dual DM call route bindings (lines 360-377).
3. **Verify CSRF Absence**:
   Run grep for CSRF validation:
   ```bash
   rg -i "constanttimecompare" backend/
   rg -i "csrf" backend/
   ```
   Confirm only `cors.AllowedHeaders` mentions `X-CSRF-Token` in `backend/cmd/server/main.go:184`.
4. **Verify Database Transactions in Handlers**:
   Inspect:
   - `backend/internal/handlers/guild_handlers.go`: lines 980-1065 (`KickMember` and `BanMember` lack `db.Begin`).
   - `backend/internal/handlers/invite_handlers.go`: lines 142-185 (`JoinByInvite` lacks `db.Begin`).
5. **Verify WebSocket Event Matrix**:
   Compare `backend/internal/gateway/hub.go` and `backend/internal/handlers/message_handlers.go` against `client/src/lib/socket.ts` (lines 80-250) to verify all 46 event type strings.
