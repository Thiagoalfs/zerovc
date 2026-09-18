# Handoff Report: Database Transactions & API Contracts Design (Milestone 1)

**Date:** 2026-09-17  
**Author:** Database Transactions & Contracts Explorer  
**Working Directory:** `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_dbtx`  
**Deliverable Document:** `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_dbtx\dbtx_design.md`  

---

## 1. Observation

Direct code inspections of `backend/` revealed the following exact lines and behaviors:

1. **`GuildHandler.BanMember`** (`backend/internal/handlers/guild_handlers.go:651-667`):
   ```go
   // Insert into guild_bans
   banQuery := `
       INSERT INTO guild_bans (guild_id, user_id, reason, banned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
   `
   _, err := h.db.Pool.Exec(r.Context(), banQuery, guildID, req.UserID, req.Reason, actorID)
   if err != nil {
       http.Error(w, `{"error":"failed to ban user"}`, http.StatusInternalServerError)
       return
   }

   // Remove member
   h.db.Pool.Exec(r.Context(), "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2", guildID, req.UserID)
   h.db.Pool.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", req.UserID)
   h.db.Pool.Exec(r.Context(), "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", guildID, req.UserID)
   ```
   *Observation:* Executes four separate statements against `h.db.Pool` without transaction wrapping. If the last deletion fails, the user remains in `guild_members`.

2. **`GuildHandler.KickMember`** (`backend/internal/handlers/guild_handlers.go:610-612`):
   ```go
   // Remove from guild_members, member_roles, voice_sessions
   h.db.Pool.Exec(r.Context(), "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2", guildID, targetUserID)
   h.db.Pool.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", targetUserID)
   h.db.Pool.Exec(r.Context(), "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", guildID, targetUserID)
   ```
   *Observation:* Executes three separate statements on the pool without transaction wrapping.

3. **`InviteHandler.JoinByInvite`** (`backend/internal/handlers/invite_handlers.go:381-426`):
   ```go
   err := h.db.Pool.QueryRow(r.Context(), "SELECT guild_id, uses, max_uses, expires_at FROM guild_invites WHERE code = $1", code).Scan(&guildID, &uses, &maxUses, &expiresAt)
   ...
   if maxUses > 0 && uses >= maxUses { ... }
   ...
   joinQuery := `INSERT INTO guild_members (guild_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (guild_id, user_id) DO NOTHING`
   h.db.Pool.Exec(r.Context(), joinQuery, guildID, userID)
   ...
   h.db.Pool.Exec(r.Context(), assignEveryoneQuery, guildID, userID)
   ...
   h.db.Pool.Exec(r.Context(), "UPDATE guild_invites SET uses = uses + 1 WHERE code = $1", code)
   ```
   *Observation:* Unlocked read on `guild_invites` permits concurrent join requests to race past `max_uses`. The membership insertion, role assignment, and uses increment execute across distinct pool connections without transaction encapsulation.

4. **`ChannelHandler.Delete`** (`backend/internal/handlers/channel_handlers.go:368-377`):
   ```go
   // If category is being deleted, move child channels to root (category_id = NULL)
   if channelType == models.ChannelTypeCategory {
       h.db.Pool.Exec(r.Context(), "UPDATE channels SET category_id = NULL WHERE category_id = $1", channelID)
   }

   _, err = h.db.Pool.Exec(r.Context(), "DELETE FROM channels WHERE id = $1", channelID)
   if err != nil {
       http.Error(w, `{"error":"failed to delete channel"}`, http.StatusInternalServerError)
       return
   }
   ```
   *Observation:* Reparenting child channels and deleting the category channel occur across two separate pool statements. If `DELETE FROM channels` fails, the child channels have already lost their category associations.

5. **Existing Correct Transaction Usages** in Codebase:
   - `UserHandler.BlockUser` (`user_handlers.go:310-337`)
   - `GuildHandler.Create` (`guild_handlers.go:48-115`)
   - `GuildHandler.TransferOwnership` (`guild_handlers.go:1331-1352`)
   - `AuthHandler.Enable2FA` (`auth_handlers.go:832-858`)
   *Observation:* These four handlers use `tx, err := h.db.Pool.Begin(r.Context())`, `defer tx.Rollback(r.Context())`, and `tx.Commit(r.Context())`.

6. **Router Inventory** (`backend/cmd/server/main.go:191-412`):
   - 16 public routes
   - 16 user profile & auth routes
   - 23 guild management & moderation routes
   - 8 channel routes
   - 7 role routes
   - 18 friends & 1x1 DM routes
   - 11 DM group routes
   - 12 message & voice routes
   - 5 media upload routes
   - 1 WebSocket gateway route
   Total: exactly 117 HTTP and WS routes.

---

## 2. Logic Chain

1. **Premise:** In relational databases with concurrent requests, multiple mutations intended to represent a single business transaction must satisfy the ACID Atomicity and Isolation properties.
2. **From Observation 1 & 2:** `BanMember` and `KickMember` modify 3–4 tables consecutively (`guild_bans`, `guild_member_roles`, `voice_sessions`, `guild_members`). Because these queries run directly on `h.db.Pool`, a failure on any step after the first leaves orphaned or inconsistent records.
3. **From Observation 3:** In `JoinByInvite`, multiple clients joining concurrently can query the invite row before either updates `uses`. Without a row lock (`FOR UPDATE`) and transaction boundary, `uses` can exceed `max_uses`, violating business constraints.
4. **From Observation 4:** In `ChannelHandler.Delete`, reparenting child channels before deleting the category leaves children detached if the category deletion fails.
5. **From Observation 5:** The idiomatic Go / `pgx/v5` pattern is already established in `BlockUser`, `GuildHandler.Create`, `TransferOwnership`, and `Enable2FA`:
   - `tx, err := pool.Begin(ctx)`
   - `defer tx.Rollback(ctx)` (safe no-op in `pgx/v5` if `Commit(ctx)` succeeds)
   - Mutating statements execute on `tx`
   - `if err := tx.Commit(ctx); err != nil { return }`
   - Hub state changes, WebSocket event broadcasting, and audit logging execute strictly post-commit.
6. **From Observation 6:** Introducing atomic transactions inside handler logic alters ONLY internal execution sequencing against PostgreSQL. Route paths, HTTP methods (POST, DELETE, PATCH, PUT), JSON request bodies, and JSON response models (`{"success": true, ...}`) remain 100% unaltered.
7. **Deduction:** Implementing the designed transaction blocks in `BanMember`, `KickMember`, `JoinByInvite`, and category channel deletion eliminates race conditions and partial execution while preserving 100% backward compatibility across all 117 endpoints.

---

## 3. Caveats

- **Audit Log Independence:** In the proposed designs, audit logging (`audit.Log` / `h.LogAudit`) executes post-commit against the pool (`h.db.Pool`). If an audit log insert fails, the primary business mutation remains committed. This is standard practice in web application architectures to avoid rolling back valid user actions due to non-critical telemetry failures.
- **Deadlock Potential on High-Volume Concurrent Invites:** Using `SELECT ... FOR UPDATE` in `JoinByInvite` serializes requests using the exact same invite code. For high-volume servers, this serial row lock ensures data correctness at the expense of queuing concurrent join requests for that specific code.
- **No Source Code Modified:** In accordance with the Explorer scope boundary, no source code was directly modified in `backend/` or `client/`.

---

## 4. Conclusion

1. The architectural gap in multi-statement database operations has been diagnosed with exact file and line references.
2. Complete, drop-in Go code specifications using `pool.Begin(ctx)`, `defer tx.Rollback(ctx)`, and `tx.Commit(ctx)` have been authored in `dbtx_design.md` for:
   - `GuildHandler.BanMember`
   - `GuildHandler.KickMember`
   - `InviteHandler.JoinByInvite` (including `FOR UPDATE` lock)
   - `ChannelHandler.Delete` (including category reparenting)
   - 6 extended multi-statement handlers (`ChannelHandler.Update`, `ChannelHandler.Reorder`, `RoleHandler.Reorder`, `DMGroupHandler.CreateGroup`, `DMGroupHandler.RemoveMember`, and authentication flows).
3. All 117 API endpoint route paths, HTTP methods, and JSON response models have been verified and cataloged, confirming 100% backward compatibility.
4. The specifications in `dbtx_design.md` are ready for execution by Milestone 1 implementers.

---

## 5. Verification Method

To independently verify this design:

1. **Inspect Deliverables:**
   - Read `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_dbtx\dbtx_design.md`.
   - Verify code snippets against `backend/internal/handlers/guild_handlers.go`, `invite_handlers.go`, and `channel_handlers.go`.
2. **Backend Compilation & Type Checking:**
   - Run `go build ./...` from `backend/` to verify Go syntax and package compatibility.
3. **Route Inventory Verification:**
   - Cross-check `backend/cmd/server/main.go` route registrations against the 117-row inventory in `dbtx_design.md § 5.1`.
4. **Invalidation Conditions:**
   - If any API response JSON key changes (e.g. `user_id` -> `userId`), backward compatibility is invalidated.
   - If `tx.Rollback(ctx)` is omitted or called without defer, transaction safety is invalidated.
   - If WebSocket broadcasts occur before `tx.Commit(ctx)`, event consistency is invalidated.
