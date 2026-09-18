# Database Transactions & API Contracts Design Specification

**Document Version:** 1.0.0  
**Author:** Database Transactions & Contracts Explorer (Teamwork Subagent)  
**Milestone:** Milestone 1 (Backend Architecture, CSRF, Rate Limiting & DB Integrity)  
**Target Codebase:** `backend/internal/handlers/`, `backend/internal/database/`, `backend/cmd/server/`  
**Date:** 2026-09-17  

---

## 1. Executive Summary & Problem Formulation

### 1.1 Context
In ZeroVC, several critical business operations modify multiple database tables simultaneously. Under the current implementation, many of these operations execute consecutive, independent SQL statements against the `pgxpool.Pool` connection pool without an enclosing database transaction (`BEGIN ... COMMIT`).

### 1.2 Core Vulnerabilities & Risks
1. **Partial Execution / State Discrepancy:** If the database connection drops, a query fails a constraint, or the server restarts midway through a multi-statement sequence, the database is left in a corrupted or inconsistent state (e.g., a member is banned in `guild_bans` but remains in `guild_members`, or a category channel is deleted while child channels remain attached to a non-existent parent).
2. **Phantom WebSocket & Real-Time Events:** In the current code, WebSocket events and audit logs are occasionally dispatched before or between SQL queries. If subsequent queries fail, client interfaces (Web, Electron, Mobile) receive state notifications that never actually materialized in PostgreSQL.
3. **Concurrency Races & TOCTOU:** In operations like `JoinByInvite`, concurrent requests can read the same invite `uses` count before either writes back an increment, permitting users to join past `max_uses`.

### 1.3 Objective
1. Design rock-solid, production-grade atomic transaction blocks (`tx, err := pool.Begin(ctx)`) with proper `defer tx.Rollback(ctx)` and `tx.Commit(ctx)` patterns for:
   - `GuildHandler.BanMember`
   - `GuildHandler.KickMember`
   - `InviteHandler.JoinByInvite`
   - `ChannelHandler.Delete` (Category channel deletion & reparenting)
   - Extended multi-statement operations: `ChannelHandler.Update`, `ChannelHandler.Reorder`, `RoleHandler.Reorder`, `DMGroupHandler.CreateGroup`, `DMGroupHandler.RemoveMember`, `AuthHandler.Register`, `AuthHandler.VerifyEmail`, `AuthHandler.ResetPassword`, `AuthHandler.Disable2FA`, and `AuthHandler.ChangeEmail`.
2. Guarantee **100% backward compatibility** for all 117 API endpoint route paths, HTTP methods, JSON request/response schemas, and WebSocket event payloads across Web, Desktop (Electron), and Mobile (Capacitor) clients.

---

## 2. Go & pgx/v5 Transaction Architectural Guidelines

### 2.1 Connection Pool and Transaction Lifecycle in `jackc/pgx/v5`
In `jackc/pgx/v5/pgxpool`, calling `pool.Begin(ctx)` acquires a dedicated database connection from the pool and issues `BEGIN`.
The idiomatic transaction lifecycle is structured as follows:

```go
// 1. Begin transaction from pool
tx, err := h.db.Pool.Begin(r.Context())
if err != nil {
    http.Error(w, `{"error":"failed to start database transaction"}`, http.StatusInternalServerError)
    return
}

// 2. Defer rollback immediately.
// In pgx/v5, if tx.Commit(ctx) was already executed successfully, tx.Rollback(ctx)
// returns pgx.ErrTxClosed and safely performs a no-op.
defer tx.Rollback(r.Context())

// 3. Execute all SQL mutation and read statements using tx
// Any query error must cause an early return, triggering deferred Rollback.
if _, err := tx.Exec(r.Context(), query1, args...); err != nil {
    http.Error(w, `{"error":"database operation failed"}`, http.StatusInternalServerError)
    return
}

// 4. Commit transaction
if err := tx.Commit(r.Context()); err != nil {
    http.Error(w, `{"error":"failed to commit transaction"}`, http.StatusInternalServerError)
    return
}

// 5. Post-Commit Side Effects ONLY:
// In-memory hub state changes, WebSocket broadcast events, and audit logs
// MUST NEVER be executed before tx.Commit() returns nil.
```

### 2.2 Golden Invariants
1. **Never Broadcast Pre-Commit:** If an error occurs during commit, the transaction rolls back. Broadcasts emitted prior to commit would pollute connected clients with phantom state.
2. **Context Passing:** Always pass `r.Context()` to `tx.Exec`, `tx.QueryRow`, `tx.Query`, `tx.Commit`, and `tx.Rollback`. This ensures that if the client aborts or HTTP request times out (configured to 30s in `main.go`), the database transaction is automatically cancelled and rolled back.
3. **Explicit Row Locking for Race Conditions:** In invite redemption (`JoinByInvite`), use `SELECT ... FOR UPDATE` within the transaction to prevent concurrent over-subscription past `max_uses`.
4. **Clean Error Responses:** If any statement in the transaction errors, log the internal error on the server side and return an appropriate HTTP status code (`500 Internal Server Error`, `400 Bad Request`, or `403 Forbidden`) with standard JSON `{"error": "..."}` without leaking SQL syntax or connection strings.

---

## 3. Detailed Specifications for Mandatory Handlers

### 3.1 `GuildHandler.BanMember`
- **Route:** `POST /api/guilds/{id}/bans`
- **File:** `backend/internal/handlers/guild_handlers.go` (lines 629–682)
- **HTTP Method:** `POST`
- **Status Code:** `200 OK`
- **Response Schema:** `{"success": true, "user_id": UUID}`
- **WebSocket Event:** `GUILD_BAN_ADD` -> `{"guild_id": UUID, "user_id": UUID, "reason": string}`

#### Current Flaw
Executes 4 disconnected operations on the pool:
1. `h.db.Pool.Exec` on `guild_bans` (INSERT / UPDATE)
2. `h.db.Pool.Exec` on `guild_member_roles` (DELETE)
3. `h.db.Pool.Exec` on `voice_sessions` (DELETE)
4. `h.db.Pool.Exec` on `guild_members` (DELETE)
If step 4 fails, the banned user remains recorded in `guild_members`, leading to contradictory permission evaluations.

#### Proposed Atomic Implementation

```go
func (h *GuildHandler) BanMember(w http.ResponseWriter, r *http.Request) {
	actorID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "id")
	guildID, err := uuid.Parse(guildIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
		return
	}

	var req BanMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == uuid.Nil {
		http.Error(w, `{"error":"user_id required"}`, http.StatusBadRequest)
		return
	}

	allowed, msg := h.checkModerationHierarchy(r.Context(), guildID, actorID, req.UserID, models.PermBanMembers)
	if !allowed {
		http.Error(w, `{"error":"`+msg+`"}`, http.StatusForbidden)
		return
	}

	// Begin Atomic Transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Insert or update guild_bans
	banQuery := `
		INSERT INTO guild_bans (guild_id, user_id, reason, banned_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
	`
	if _, err := tx.Exec(r.Context(), banQuery, guildID, req.UserID, req.Reason, actorID); err != nil {
		http.Error(w, `{"error":"failed to ban user"}`, http.StatusInternalServerError)
		return
	}

	// 2. Remove member roles for this guild
	if _, err := tx.Exec(r.Context(), "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2", guildID, req.UserID); err != nil {
		http.Error(w, `{"error":"failed to clean member roles"}`, http.StatusInternalServerError)
		return
	}

	// 3. Terminate voice session if user is connected to a channel in this guild
	if _, err := tx.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", req.UserID); err != nil {
		http.Error(w, `{"error":"failed to terminate voice session"}`, http.StatusInternalServerError)
		return
	}

	// 4. Remove member record from guild
	if _, err := tx.Exec(r.Context(), "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", guildID, req.UserID); err != nil {
		http.Error(w, `{"error":"failed to remove guild member"}`, http.StatusInternalServerError)
		return
	}

	// Commit Transaction
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit ban transaction"}`, http.StatusInternalServerError)
		return
	}

	// Post-Commit Side Effects
	h.hub.RemoveGuildMember(guildID, req.UserID)
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_BAN_ADD",
		Data: map[string]any{
			"guild_id": guildID,
			"user_id":  req.UserID,
			"reason":   req.Reason,
		},
	})

	h.LogAudit(r.Context(), guildID, actorID, "MEMBER_BAN", &req.UserID, map[string]any{"reason": req.Reason})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "user_id": req.UserID})
}
```

---

### 3.2 `GuildHandler.KickMember`
- **Route:** `POST /api/guilds/{id}/members/{userID}/kick`
- **File:** `backend/internal/handlers/guild_handlers.go` (lines 591–627)
- **HTTP Method:** `POST`
- **Status Code:** `200 OK`
- **Response Schema:** `{"success": true, "user_id": UUID}`
- **WebSocket Event:** `GUILD_MEMBER_REMOVE` -> `{"guild_id": UUID, "user_id": UUID}`

#### Current Flaw
Executes 3 independent `h.db.Pool.Exec` calls (`guild_member_roles`, `voice_sessions`, `guild_members`). If `guild_members` deletion fails, the user loses their roles but remains in the server as an unranked member.

#### Proposed Atomic Implementation

```go
func (h *GuildHandler) KickMember(w http.ResponseWriter, r *http.Request) {
	actorID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "id")
	targetUserIDStr := chi.URLParam(r, "userID")
	guildID, err1 := uuid.Parse(guildIDStr)
	targetUserID, err2 := uuid.Parse(targetUserIDStr)
	if err1 != nil || err2 != nil {
		http.Error(w, `{"error":"invalid guild or user id"}`, http.StatusBadRequest)
		return
	}

	allowed, msg := h.checkModerationHierarchy(r.Context(), guildID, actorID, targetUserID, models.PermKickMembers)
	if !allowed {
		http.Error(w, `{"error":"`+msg+`"}`, http.StatusForbidden)
		return
	}

	// Begin Atomic Transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Remove from guild_member_roles
	if _, err := tx.Exec(r.Context(), "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2", guildID, targetUserID); err != nil {
		http.Error(w, `{"error":"failed to remove member roles"}`, http.StatusInternalServerError)
		return
	}

	// 2. Remove from voice_sessions
	if _, err := tx.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", targetUserID); err != nil {
		http.Error(w, `{"error":"failed to remove voice session"}`, http.StatusInternalServerError)
		return
	}

	// 3. Remove from guild_members
	if _, err := tx.Exec(r.Context(), "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", guildID, targetUserID); err != nil {
		http.Error(w, `{"error":"failed to remove member"}`, http.StatusInternalServerError)
		return
	}

	// Commit Transaction
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit kick transaction"}`, http.StatusInternalServerError)
		return
	}

	// Post-Commit Side Effects
	h.hub.RemoveGuildMember(guildID, targetUserID)
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_MEMBER_REMOVE",
		Data: map[string]any{
			"guild_id": guildID,
			"user_id":  targetUserID,
		},
	})

	h.LogAudit(r.Context(), guildID, actorID, "MEMBER_KICK", &targetUserID, map[string]any{"reason": "Expulso por moderador"})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "user_id": targetUserID})
}
```

---

### 3.3 `InviteHandler.JoinByInvite`
- **Route:** `POST /api/invites/{code}/join`
- **File:** `backend/internal/handlers/invite_handlers.go` (lines 374–457)
- **HTTP Method:** `POST`
- **Status Code:** `200 OK`
- **Response Schema:** `{"success": true, "guild_id": UUID}`
- **WebSocket Event:** `GUILD_MEMBER_ADD` -> `{"guild_id": UUID, "member": UserPublic}`

#### Current Flaw
1. **Concurrency TOCTOU:** Two users attempting to join via a 1-use invite (`max_uses = 1`) simultaneously can both read `uses = 0`, pass the limit check, insert membership, and increment `uses` to 2.
2. **Multi-Statement Inconsistency:** Inserts into `guild_members`, assigns `@everyone` in `guild_member_roles`, and updates `guild_invites.uses` across three uncoordinated pool queries.

#### Proposed Atomic Implementation (with `FOR UPDATE` Row Lock)

```go
func (h *InviteHandler) JoinByInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	code := chi.URLParam(r, "code")
	if len(code) != 10 {
		http.Error(w, `{"error":"código de convite inválido"}`, http.StatusBadRequest)
		return
	}

	// Begin Atomic Transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Lock the invite row FOR UPDATE to prevent race conditions on max_uses
	var guildID uuid.UUID
	var uses, maxUses int
	var expiresAt *time.Time
	inviteQuery := `
		SELECT guild_id, uses, max_uses, expires_at
		FROM guild_invites
		WHERE code = $1
		FOR UPDATE
	`
	err = tx.QueryRow(r.Context(), inviteQuery, code).Scan(&guildID, &uses, &maxUses, &expiresAt)
	if err != nil {
		http.Error(w, `{"error":"invalid or expired invite code"}`, http.StatusNotFound)
		return
	}

	// Expiration check
	if expiresAt != nil && expiresAt.Before(time.Now()) {
		http.Error(w, `{"error":"Este convite expirou"}`, http.StatusForbidden)
		return
	}

	// Max uses check
	if maxUses > 0 && uses >= maxUses {
		http.Error(w, `{"error":"Este convite atingiu o limite máximo de utilizações"}`, http.StatusForbidden)
		return
	}

	// 2. Check if user is banned
	var isBanned bool
	banCheckQuery := `SELECT EXISTS(SELECT 1 FROM guild_bans WHERE guild_id = $1 AND user_id = $2)`
	if err := tx.QueryRow(r.Context(), banCheckQuery, guildID, userID).Scan(&isBanned); err == nil && isBanned {
		http.Error(w, `{"error":"Você está banido deste servidor"}`, http.StatusForbidden)
		return
	}

	// 3. Add user to guild_members
	joinQuery := `
		INSERT INTO guild_members (guild_id, user_id, role)
		VALUES ($1, $2, 'member')
		ON CONFLICT (guild_id, user_id) DO NOTHING
	`
	if _, err := tx.Exec(r.Context(), joinQuery, guildID, userID); err != nil {
		http.Error(w, `{"error":"failed to join server"}`, http.StatusInternalServerError)
		return
	}

	// 4. Assign @everyone base role
	assignEveryoneQuery := `
		INSERT INTO guild_member_roles (guild_id, user_id, role_id)
		SELECT $1, $2, id
		FROM guild_roles
		WHERE guild_id = $1 AND name = '@everyone'
		ON CONFLICT DO NOTHING
	`
	if _, err := tx.Exec(r.Context(), assignEveryoneQuery, guildID, userID); err != nil {
		http.Error(w, `{"error":"failed to assign default role"}`, http.StatusInternalServerError)
		return
	}

	// 5. Increment invite uses count
	if _, err := tx.Exec(r.Context(), "UPDATE guild_invites SET uses = uses + 1 WHERE code = $1", code); err != nil {
		http.Error(w, `{"error":"failed to update invite uses"}`, http.StatusInternalServerError)
		return
	}

	// Commit Transaction
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit join transaction"}`, http.StatusInternalServerError)
		return
	}

	// Post-Commit: Register user in hub and broadcast
	h.hub.AddGuildMember(guildID, userID)

	var newMem models.UserPublic
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status
		FROM users
		WHERE id = $1
	`, userID).Scan(
		&newMem.ID, &newMem.Username, &newMem.DisplayName, &newMem.AvatarURL, &newMem.BannerURL, &newMem.Bio, &newMem.Status, &newMem.CustomStatus,
	)
	if h.hub.IsUserOnline(newMem.ID) {
		newMem.Status = "online"
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_MEMBER_ADD",
		Data: map[string]any{
			"guild_id": guildID,
			"member":   newMem,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"guild_id": guildID,
	})
}
```

---

### 3.4 `ChannelHandler.Delete` (Category & Channel Deletion)
- **Route:** `DELETE /api/channels/{id}`
- **File:** `backend/internal/handlers/channel_handlers.go` (lines 339–390)
- **HTTP Method:** `DELETE`
- **Status Code:** `200 OK`
- **Response Schema:** `{"success": true, "id": UUID}`
- **WebSocket Event:** `CHANNEL_DELETE` -> `{"id": UUID, "guild_id": UUID}`

#### Current Flaw
When deleting a category, the handler unparents child channels via `UPDATE channels SET category_id = NULL WHERE category_id = $1` on the pool, and then calls `DELETE FROM channels WHERE id = $1`. If the category deletion fails (e.g., deadlock, foreign key delay), child channels are left disconnected in the server root without undoing the change.

#### Proposed Atomic Implementation

```go
func (h *ChannelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	var guildID uuid.UUID
	var channelType models.ChannelType
	var isPrivate bool
	err = h.db.Pool.QueryRow(r.Context(), "SELECT guild_id, type, is_private FROM channels WHERE id = $1", channelID).Scan(&guildID, &channelType, &isPrivate)
	if err != nil {
		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
		return
	}

	allowed, msg := h.checkChannelPermissions(r.Context(), guildID, userID)
	if !allowed {
		http.Error(w, `{"error":"forbidden: `+msg+`"}`, http.StatusForbidden)
		return
	}

	// Begin Atomic Transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// 1. If category is being deleted, move child channels to root (category_id = NULL)
	if channelType == models.ChannelTypeCategory {
		if _, err := tx.Exec(r.Context(), "UPDATE channels SET category_id = NULL WHERE category_id = $1", channelID); err != nil {
			http.Error(w, `{"error":"failed to reparent category child channels"}`, http.StatusInternalServerError)
			return
		}
	}

	// 2. Delete channel (Postgres cascades delete to messages, voice_sessions, overwrites, etc.)
	if _, err := tx.Exec(r.Context(), "DELETE FROM channels WHERE id = $1", channelID); err != nil {
		http.Error(w, `{"error":"failed to delete channel"}`, http.StatusInternalServerError)
		return
	}

	// Commit Transaction
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit channel deletion"}`, http.StatusInternalServerError)
		return
	}

	// Post-Commit Side Effects
	h.broadcastChannelEvent(r.Context(), guildID, channelID, isPrivate, models.WSEvent{
		Type: models.EventChannelDelete,
		Data: map[string]any{"id": channelID, "guild_id": guildID},
	})

	audit.Log(r.Context(), h.db, h.hub, guildID, userID, "CHANNEL_DELETE", &channelID, map[string]any{
		"type": channelType,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "id": channelID})
}
```

---

## 4. Extended Multi-Statement Operations Design Specifications

Beyond the 4 mandatory handlers, our codebase survey identified 6 additional operations with multi-statement integrity vulnerabilities that should be wrapped in `pool.Begin(ctx)`:

### 4.1 `ChannelHandler.Update`
- **File:** `backend/internal/handlers/channel_handlers.go:205-337`
- **Current Behavior:** Executes `UPDATE channels`, followed by deleting/inserting `channel_role_access`, and deleting/inserting `channel_permission_overwrites` across up to 10+ separate statements without a transaction.
- **Specification:** Wrap lines 242–323 in `tx, err := h.db.Pool.Begin(r.Context())`. Execute channel update, role access deletes/inserts, and permission overwrite upserts through `tx`. Fetch updated overwrites within `tx`, commit, then broadcast `models.EventChannelUpdate`.

### 4.2 `ChannelHandler.Reorder` & `RoleHandler.Reorder`
- **Files:** `channel_handlers.go:392-438` and `role_handlers.go:251-322`
- **Current Behavior:** Loops over incoming lists of channel/role positions, executing individual `UPDATE` statements for each element. If iteration 5 of 10 fails, the server is left with duplicated or scrambled positions.
- **Specification:** Wrap loop updates in `tx.Begin(r.Context())`. Either all positions update cleanly, or the transaction rolls back cleanly. In `RoleHandler.Reorder`, fetch updated roles within `tx` or right after commit, then broadcast `GUILD_ROLES_REORDER`.

### 4.3 `DMGroupHandler.CreateGroup` & `RemoveMember`
- **File:** `backend/internal/handlers/dm_group_handlers.go`
- **`CreateGroup` (lines 40–117):** Inserts into `dm_groups`, then runs a loop over member IDs inserting into `dm_group_members`.
  - **Specification:** Wrap the `INSERT INTO dm_groups` and loop of `INSERT INTO dm_group_members` in a single transaction.
- **`RemoveMember` (lines 313–359):** Deletes from `dm_group_members`, counts remaining members, and either deletes `dm_groups` (if 0 members) or updates `owner_id` (if owner left).
  - **Specification:** Wrap member deletion, count check, and group deletion / owner reassignment in a single transaction to prevent race conditions during concurrent departures.

### 4.4 Authentication Mutations (`Register`, `VerifyEmail`, `ResetPassword`, `Disable2FA`, `ChangeEmail`)
- **File:** `backend/internal/handlers/auth_handlers.go`
- **`Register`:** `INSERT INTO users` + `DELETE FROM email_verifications` + `INSERT INTO email_verifications`. Wrap in `tx` so that a user cannot be created without a valid verification record.
- **`VerifyEmail`:** `UPDATE users SET email_verified = TRUE` + `DELETE FROM email_verifications`. Wrap in `tx`.
- **`ResetPassword`:** If backup code used: `UPDATE user_2fa_backup_codes` + `UPDATE users` password + `UPDATE password_resets`. Wrap in `tx`.
- **`Disable2FA`:** `UPDATE users SET two_factor_secret = ''` + `DELETE FROM user_2fa_backup_codes`. Wrap in `tx`.
- **`ChangeEmail`:** `UPDATE users SET email = $1, email_verified = FALSE` + `DELETE FROM email_verifications` + `INSERT INTO email_verifications`. Wrap in `tx`.

---

## 5. Complete 117 API Endpoint Backward Compatibility Audit

To satisfy Requirement R4 ("Preserve strictly all existing REST API contracts, JSON payload formats, and WebSocket events, ensuring 100% stability across Web, Desktop, and Mobile clients"), we have audited all 117 endpoints in the ZeroVC router.

### 5.1 Route Inventory & Contract Preservation Matrix

| # | Route Path | HTTP Method | Handler Function | Mutation Type | Transaction Required? | Backward Compatibility Preserved |
|---|------------|-------------|------------------|---------------|-----------------------|----------------------------------|
| 1 | `/health` | `GET` | Inline | Read | No | Yes (200/503 JSON) |
| 2 | `/api/version` | `GET` | Inline | Read | No | Yes (Version & server_time) |
| 3 | `/api/auth/register` | `POST` | `AuthHandler.Register` | INSERT users, verifications | Recommended | Yes (`AuthResponse`) |
| 4 | `/api/auth/verify-email` | `POST` | `AuthHandler.VerifyEmail` | UPDATE users, DELETE verif | Recommended | Yes (`AuthResponse`) |
| 5 | `/api/auth/resend-verification` | `POST` | `AuthHandler.ResendVerification` | INSERT verifications | No (Single statement) | Yes (`{"message": ...}`) |
| 6 | `/api/auth/forgot-password` | `POST` | `AuthHandler.ForgotPassword` | INSERT password_resets | No (Single statement) | Yes (`{"message": ...}`) |
| 7 | `/api/auth/verify-reset-token` | `POST` | `AuthHandler.VerifyResetToken` | Read | No | Yes (`{"valid": bool}`) |
| 8 | `/api/auth/reset-password` | `POST` | `AuthHandler.ResetPassword` | UPDATE users, resets | Recommended | Yes (`{"message": ...}`) |
| 9 | `/api/auth/login` | `POST` | `AuthHandler.Login` | Read / Cookie / 2FA check | No | Yes (`AuthResponse` / 2FA temp token) |
| 10 | `/api/auth/logout` | `POST` | `AuthHandler.Logout` | Cookie clear | No | Yes (`{"success": true}`) |
| 11 | `/api/invites/{code}` | `GET` | `InviteHandler.GetInvite` | Read | No | Yes (`GuildInvite` preview) |
| 12 | `/api/link-preview` | `GET` | `LinkPreviewHandler.GetMetadata`| Read | No | Yes (`LinkMetadata`) |
| 13 | `/assets/user/*` | `GET` | FileServer | Read | No | Yes (File Stream) |
| 14 | `/assets/guild/*` | `GET` | FileServer | Read | No | Yes (File Stream) |
| 15 | `/downloads/*` | `GET` | FileServer | Read | No | Yes (Binary Stream) |
| 16 | `/*` | `GET` | FileServer / SPA | Read | No | Yes (HTML / SPA) |
| 17 | `/api/auth/me` | `GET` | `AuthHandler.Me` | Read | No | Yes (`UserPublic`) |
| 18 | `/api/auth/export-data` | `GET` | `AuthHandler.ExportData` | Read | No | Yes (GDPR Export Payload) |
| 19 | `/api/auth/delete-account` | `POST` | `AuthHandler.DeleteAccount` | DELETE users (Cascade) | No (Cascade handles) | Yes (`{"success": true}`) |
| 20 | `/api/auth/2fa/generate` | `POST` | `AuthHandler.Generate2FA` | Read / Generate TOTP | No | Yes (`{"secret": ..., "otpauth_url": ...}`) |
| 21 | `/api/auth/2fa/enable` | `POST` | `AuthHandler.Enable2FA` | UPDATE users, backup codes | Existing Tx | Yes (`{"success": true, "backup_codes": [...]}`) |
| 22 | `/api/auth/2fa/disable` | `POST` | `AuthHandler.Disable2FA` | UPDATE users, backup codes | Recommended | Yes (`{"success": true}`) |
| 23 | `/api/auth/change-password` | `POST` | `AuthHandler.ChangePassword` | UPDATE users | No (Single statement) | Yes (`{"success": true}`) |
| 24 | `/api/auth/change-email` | `POST` | `AuthHandler.ChangeEmail` | UPDATE users, verifications | Recommended | Yes (`{"message": ...}`) |
| 25 | `/api/auth/change-phone` | `POST` | `AuthHandler.ChangePhone` | UPDATE users | No (Single statement) | Yes (`{"success": true}`) |
| 26 | `/api/users/@me` | `PATCH` | `UserHandler.UpdateProfile` | UPDATE users | No (Single statement) | Yes (`UserPublic`) |
| 27 | `/api/users/me/blocks` | `GET` | `UserHandler.ListBlockedUsers` | Read | No | Yes (`[]UserPublic`) |
| 28 | `/api/users/{id}/block` | `POST` | `UserHandler.BlockUser` | INSERT blocks, DELETE friend | Existing Tx | Yes (`{"success": true, "blocked_user_id": UUID}`) |
| 29 | `/api/users/{id}/block` | `DELETE` | `UserHandler.UnblockUser` | DELETE user_blocks | No (Single statement) | Yes (`{"success": true, "unblocked_user_id": UUID}`) |
| 30 | `/api/users/me/favorite-gifs` | `GET` | `UserHandler.GetFavoriteGIFs` | Read | No | Yes (`[]FavoriteGIF`) |
| 31 | `/api/users/me/favorite-gifs` | `POST` | `UserHandler.AddFavoriteGIF` | INSERT user_favorite_gifs | No (Single statement) | Yes (`FavoriteGIF`) |
| 32 | `/api/users/me/favorite-gifs` | `DELETE` | `UserHandler.RemoveFavoriteGIF` | DELETE user_favorite_gifs | No (Single statement) | Yes (`{"success": true}`) |
| 33 | `/api/guilds` | `GET` | `GuildHandler.List` | Read | No | Yes (`[]Guild`) |
| 34 | `/api/guilds` | `POST` | `GuildHandler.Create` | INSERT guilds, roles, chs | Existing Tx | Yes (`Guild`) |
| 35 | `/api/guilds/{id}` | `GET` | `GuildHandler.GetDetails` | Read | No | Yes (`GuildWithDetails`) |
| 36 | `/api/guilds/{id}` | `PATCH` | `GuildHandler.Update` | UPDATE guilds | No (Single statement) | Yes (`Guild`) |
| 37 | `/api/guilds/{id}` | `DELETE` | `GuildHandler.Delete` | DELETE guilds (Cascade) | No (Cascade handles) | Yes (`{"success": true, "guild_id": UUID}`) |
| 38 | `/api/guilds/{id}/leave` | `POST` | `GuildHandler.Leave` | DELETE guild_members | No (Single statement) | Yes (`{"success": true}`) |
| 39 | `/api/guilds/{id}/mute` | `POST` | `GuildHandler.ToggleMute` | UPDATE guild_members | No (Single statement) | Yes (`{"is_muted": bool}`) |
| 40 | `/api/guilds/{id}/invites` | `GET` | `InviteHandler.ListGuildInvites`| Read | No | Yes (`[]GuildInvite`) |
| 41 | `/api/guilds/{id}/invites` | `POST` | `InviteHandler.CreateInvite` | INSERT guild_invites | No (Single statement) | Yes (`GuildInvite`) |
| 42 | `/api/guilds/{id}/invites/{code}` | `DELETE` | `InviteHandler.DeleteInvite` | DELETE guild_invites | No (Single statement) | Yes (`{"success": true}`) |
| 43 | `/api/guilds/{id}/transfer-ownership` | `POST` | `GuildHandler.TransferOwnership` | UPDATE guilds, members | Existing Tx | Yes (`{"success": true, "owner_id": UUID}`) |
| 44 | `/api/guilds/{id}/emojis` | `GET` | `GuildHandler.ListEmojis` | Read | No | Yes (`[]GuildEmoji`) |
| 45 | `/api/guilds/{id}/emojis` | `POST` | `GuildHandler.CreateEmoji` | INSERT guild_emojis | No (Single statement) | Yes (`GuildEmoji`) |
| 46 | `/api/guilds/{id}/emojis/{emojiID}` | `PATCH` | `GuildHandler.UpdateEmoji` | UPDATE guild_emojis | No (Single statement) | Yes (`GuildEmoji`) |
| 47 | `/api/guilds/{id}/emojis/{emojiID}` | `DELETE` | `GuildHandler.DeleteEmoji` | DELETE guild_emojis | No (Single statement) | Yes (`{"success": true}`) |
| 48 | `/api/guilds/{id}/audit-logs` | `GET` | `GuildHandler.ListAuditLogs` | Read | No | Yes (`[]AuditLog`) |
| 49 | `/api/guilds/{guildID}/read-states` | `GET` | `MessageHandler.GetGuildReadStates` | Read | No | Yes (`[]ChannelReadState`) |
| 50 | `/api/guilds/{guildID}/messages/search` | `GET` | `MessageHandler.Search` | Read | No | Yes (`[]Message`) |
| 51 | `/api/guilds/{id}/members/{userID}/kick` | `POST` | `GuildHandler.KickMember` | DELETE roles, voice, member | **YES (Mandatory)** | Yes (`{"success": true, "user_id": UUID}`) |
| 52 | `/api/guilds/{id}/bans` | `POST` | `GuildHandler.BanMember` | INSERT bans, DELETE roles, member | **YES (Mandatory)** | Yes (`{"success": true, "user_id": UUID}`) |
| 53 | `/api/guilds/{id}/bans/{userID}` | `DELETE` | `GuildHandler.UnbanMember` | DELETE guild_bans | No (Single statement) | Yes (`{"success": true, "user_id": UUID}`) |
| 54 | `/api/guilds/{id}/members/{userID}/mute` | `POST` | `GuildHandler.MuteMember` | UPDATE guild_members | No (Single statement) | Yes (`{"success": true, "muted_until": ...}`) |
| 55 | `/api/invites/{code}/join` | `POST` | `InviteHandler.JoinByInvite` | INSERT member, roles, UPDATE uses | **YES (Mandatory)** | Yes (`{"success": true, "guild_id": UUID}`) |
| 56 | `/api/guilds/{guildID}/channels` | `POST` | `ChannelHandler.Create` | INSERT channels, role access | Recommended | Yes (`Channel`) |
| 57 | `/api/channels/{id}` | `PATCH` | `ChannelHandler.Update` | UPDATE chs, overwrites | Recommended | Yes (`Channel`) |
| 58 | `/api/channels/{id}` | `DELETE` | `ChannelHandler.Delete` | UPDATE children, DELETE ch | **YES (Mandatory)** | Yes (`{"success": true, "id": UUID}`) |
| 59 | `/api/channels/{id}/permissions/{roleID}` | `PUT` | `ChannelHandler.UpdatePermissionOverwrite` | UPSERT overwrites | No (Single statement) | Yes (`{"success": true}`) |
| 60 | `/api/channels/{id}/permissions/{roleID}` | `DELETE` | `ChannelHandler.DeletePermissionOverwrite` | DELETE overwrites | No (Single statement) | Yes (`{"success": true}`) |
| 61 | `/api/guilds/{guildID}/channels/positions` | `PUT` | `ChannelHandler.Reorder` | Batch UPDATE channels | Recommended | Yes (`{"success": true}`) |
| 62 | `/api/channels/{channelID}/messages/search` | `GET` | `MessageHandler.Search` | Read | No | Yes (`[]Message`) |
| 63 | `/api/channels/{channelID}/ack` | `POST` | `MessageHandler.AckChannel` | UPSERT read_states | No (Single statement) | Yes (`{"success": true, "channel_id": UUID, "last_read_message_id": UUID}`) |
| 64 | `/api/guilds/{guildID}/roles` | `GET` | `RoleHandler.List` | Read | No | Yes (`[]Role`) |
| 65 | `/api/guilds/{guildID}/roles` | `POST` | `RoleHandler.Create` | INSERT guild_roles | No (Single statement) | Yes (`Role`) |
| 66 | `/api/guilds/{guildID}/roles/{roleID}` | `PATCH` | `RoleHandler.Update` | UPDATE guild_roles | No (Single statement) | Yes (`Role`) |
| 67 | `/api/guilds/{guildID}/roles/positions` | `PUT` | `RoleHandler.Reorder` | Batch UPDATE guild_roles | Recommended | Yes (`[]Role`) |
| 68 | `/api/guilds/{guildID}/roles/{roleID}` | `DELETE` | `RoleHandler.Delete` | DELETE guild_roles | No (Single statement) | Yes (`{"success": true}`) |
| 69 | `/api/guilds/{guildID}/members/{userID}/roles/{roleID}` | `POST` | `RoleHandler.AssignRole` | INSERT guild_member_roles | No (Single statement) | Yes (`{"success": true, "roles": []Role}`) |
| 70 | `/api/guilds/{guildID}/members/{userID}/roles/{roleID}` | `DELETE` | `RoleHandler.RemoveRole` | DELETE guild_member_roles | No (Single statement) | Yes (`{"success": true, "roles": []Role}`) |
| 71 | `/api/friends` | `GET` | `FriendHandler.ListFriends` | Read | No | Yes (`FriendsListResponse`) |
| 72 | `/api/friends/request` | `POST` | `FriendHandler.SendRequest` | INSERT/UPDATE friendships | No (Upsert / Read) | Yes (`Friendship` / `{"success":true,"status":"accepted"}`) |
| 73 | `/api/friends/{id}/accept` | `POST` | `FriendHandler.AcceptRequest` | UPDATE friendships | No (Single statement) | Yes (`{"success": true}`) |
| 74 | `/api/friends/{id}/reject` | `POST` | `FriendHandler.RemoveFriend` | DELETE friendships | No (Single statement) | Yes (`{"success": true}`) |
| 75 | `/api/dms` | `GET` | `DMHandler.ListRooms` | Read | No | Yes (`[]DMRoom`) |
| 76 | `/api/dms` | `POST` | `DMHandler.CreateOrGetRoom` | INSERT dm_rooms ON CONFLICT | No (Single statement) | Yes (`DMRoom`) |
| 77 | `/api/dms/{roomID}/messages` | `GET` | `DMHandler.ListMessages` | Read | No | Yes (`[]DMMessage`) |
| 78 | `/api/dms/{roomID}/pins` | `GET` | `DMHandler.ListPinned` | Read | No | Yes (`[]DMMessage`) |
| 79 | `/api/dms/{roomID}/messages` | `POST` | `DMHandler.SendMessage` | INSERT dm_messages | No (Single statement) | Yes (`DMMessage`) |
| 80 | `/api/dms/{roomID}/messages/{messageID}` | `PATCH` | `DMHandler.UpdateMessage` | UPDATE dm_messages | No (Single statement) | Yes (`DMMessage`) |
| 81 | `/api/dms/{roomID}/messages/{messageID}` | `DELETE` | `DMHandler.DeleteMessage` | DELETE dm_messages | No (Cascade handles) | Yes (`{"success": true}`) |
| 82 | `/api/dms/{roomID}/messages/{messageID}/reactions` | `POST` | `DMHandler.AddReaction` | INSERT message_reactions | No (Single statement) | Yes (`MessageReaction`) |
| 83 | `/api/dms/{roomID}/messages/{messageID}/reactions/{emoji}` | `DELETE` | `DMHandler.RemoveReaction` | DELETE message_reactions | No (Single statement) | Yes (`{"success": true}`) |
| 84 | `/api/dms/{roomID}/messages/{messageID}/pin` | `POST` | `DMHandler.TogglePin` | UPDATE dm_messages | No (Single statement) | Yes (`{"is_pinned": bool}`) |
| 85 | `/api/dms/{roomID}/call/invite` | `POST` | `DMHandler.InviteCall` | WS Notification | No | Yes (`{"success": true}`) |
| 86 | `/api/dms/{roomID}/call/accept` | `POST` | `DMHandler.AcceptCall` | Token generation & WS | No | Yes (`LiveKitJoinResponse`) |
| 87 | `/api/dms/{roomID}/call/reject` | `POST` | `DMHandler.RejectCall` | WS Notification | No | Yes (`{"success": true}`) |
| 88 | `/api/dms/{roomID}/call/leave` | `POST` | `DMHandler.LeaveCall` | WS Notification | No | Yes (`{"success": true}`) |
| 89 | `/api/dm/groups` | `GET` | `DMGroupHandler.ListGroups` | Read | No | Yes (`[]DMGroup`) |
| 90 | `/api/dm/groups` | `POST` | `DMGroupHandler.CreateGroup` | INSERT groups, members | Recommended | Yes (`DMGroup`) |
| 91 | `/api/dm/groups/{id}` | `GET` | `DMGroupHandler.GetGroup` | Read | No | Yes (`DMGroup`) |
| 92 | `/api/dm/groups/{id}` | `PATCH` | `DMGroupHandler.UpdateGroup` | UPDATE dm_groups | No (Single statement) | Yes (`DMGroup`) |
| 93 | `/api/dm/groups/{id}/members` | `POST` | `DMGroupHandler.AddMembers` | Batch INSERT group_members | Recommended | Yes (`[]UserPublic`) |
| 94 | `/api/dm/groups/{id}/members/{userID}` | `DELETE` | `DMGroupHandler.RemoveMember` | DELETE member, UPDATE owner | Recommended | Yes (`{"success": true}`) |
| 95 | `/api/dm/groups/{id}/messages` | `GET` | `DMGroupHandler.ListMessages` | Read | No | Yes (`[]DMGroupMessage`) |
| 96 | `/api/dm/groups/{id}/messages` | `POST` | `DMGroupHandler.SendMessage` | INSERT dm_group_messages | No (Single statement) | Yes (`DMGroupMessage`) |
| 97 | `/api/dm/groups/{id}/messages/{messageID}` | `PATCH` | `DMGroupHandler.UpdateMessage` | UPDATE dm_group_messages | No (Single statement) | Yes (`DMGroupMessage`) |
| 98 | `/api/dm/groups/{id}/messages/{messageID}` | `DELETE` | `DMGroupHandler.DeleteMessage` | DELETE dm_group_messages | No (Cascade handles) | Yes (`{"success": true}`) |
| 99 | `/api/dm/groups/{id}/voice-token` | `POST` | `DMGroupHandler.JoinVoice` | LiveKit token generation | No | Yes (`LiveKitVoiceToken`) |
| 100| `/api/channels/{channelID}/messages` | `GET` | `MessageHandler.List` | Read | No | Yes (`[]Message`) |
| 101| `/api/channels/{channelID}/pins` | `GET` | `MessageHandler.ListPinned` | Read | No | Yes (`[]Message`) |
| 102| `/api/channels/{channelID}/messages` | `POST` | `MessageHandler.Send` | INSERT messages | No (Single statement) | Yes (`Message`) |
| 103| `/api/channels/{channelID}/messages/{messageID}` | `PATCH` | `MessageHandler.Update` | UPDATE messages | No (Single statement) | Yes (`Message`) |
| 104| `/api/channels/{channelID}/messages/{messageID}` | `DELETE` | `MessageHandler.Delete` | DELETE messages | No (Cascade handles) | Yes (`{"success": true}`) |
| 105| `/api/channels/{channelID}/messages/{messageID}/reactions` | `POST` | `MessageHandler.AddReaction` | INSERT message_reactions | No (Single statement) | Yes (`MessageReaction`) |
| 106| `/api/channels/{channelID}/messages/{messageID}/reactions/{emoji}` | `DELETE` | `MessageHandler.RemoveReaction` | DELETE message_reactions | No (Single statement) | Yes (`{"success": true}`) |
| 107| `/api/channels/{channelID}/messages/{messageID}/pin` | `POST` | `MessageHandler.TogglePin` | UPDATE messages | No (Single statement) | Yes (`{"is_pinned": bool}`) |
| 108| `/api/channels/{id}/join-voice` | `POST` | `ChannelHandler.JoinVoice` | UPSERT voice_sessions | No (Single statement) | Yes (`JoinVoiceResponse`) |
| 109| `/api/channels/{id}/leave-voice` | `POST` | `ChannelHandler.LeaveVoice` | DELETE voice_sessions | No (Single statement) | Yes (`{"success": true}`) |
| 110| `/api/channels/{id}/voice-state` | `POST` | `ChannelHandler.UpdateVoiceState` | UPDATE voice_sessions | No (Single statement) | Yes (`VoiceSession`) |
| 111| `/api/channels/{channelID}/members/{userID}/voice-state` | `POST` | `ChannelHandler.AdminUpdateVoiceState` | UPDATE/DELETE voice_sessions | No (Single statement) | Yes (`{"success": true}`) |
| 112| `/api/upload/avatar` | `POST` | `UploadHandler.UploadAvatar` | File system write | No | Yes (`{"url": ...}`) |
| 113| `/api/upload/guild-icon` | `POST` | `UploadHandler.UploadGuildIcon` | File system write | No | Yes (`{"url": ...}`) |
| 114| `/api/upload/guild-banner` | `POST` | `UploadHandler.UploadGuildBanner` | File system write | No | Yes (`{"url": ...}`) |
| 115| `/api/upload/banner` | `POST` | `UploadHandler.UploadBanner` | File system write | No | Yes (`{"url": ...}`) |
| 116| `/api/upload/attachment` | `POST` | `UploadHandler.UploadAttachment` | File system write | No | Yes (`{"url": ..., "filename": ...}`) |
| 117| `/ws` | `GET` | `gateway.ServeWs` | WebSocket upgrade | No | Yes (`WS_EVENT` protocol) |

---

## 6. Implementation Verification Checklist for Milestone 1

Implementers should use this step-by-step checklist during implementation:

- [ ] **Transaction Helper Pattern:** Verify that every `tx, err := h.db.Pool.Begin(r.Context())` call is immediately followed by `defer tx.Rollback(r.Context())`.
- [ ] **Atomic Scope Isolation:** Ensure that `tx.Exec` or `tx.QueryRow` are used exclusively within the transaction block; no calls to `h.db.Pool` inside the active transaction body.
- [ ] **Post-Commit Side Effects:** Verify that all calls to `h.hub.BroadcastToGuild`, `h.hub.SendToUser`, and `audit.Log` (or `h.LogAudit`) are placed strictly AFTER `tx.Commit(r.Context()) == nil`.
- [ ] **Locking & Deadlock Prevention:** Verify that `JoinByInvite` utilizes `FOR UPDATE` on `guild_invites` to prevent concurrent over-join races.
- [ ] **Compilation Check:** Run `go build ./...` inside `backend/` to confirm zero compilation errors, type mismatches, or syntax regressions.
- [ ] **Backward Compatibility:** Verify that curl/E2E test payloads against `/api/guilds/{id}/bans`, `/api/guilds/{id}/members/{userID}/kick`, `/api/invites/{code}/join`, and `/api/channels/{id}` return exact identical JSON keys and HTTP status codes.
