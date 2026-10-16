# HANDOFF REPORT — Milestone M3 Go Backend Architecture (Fases 2 e 4)

**Agent**: `explorer_m3_backend`  
**Milestone**: M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4)  
**Recipient**: `orchestrator_gen2` / `implementer_m3_backend`  
**Date**: 2026-10-10  
**Handoff Type**: Hard (Investigation complete, actionable blueprint produced)

---

## 1. Observation

1. **Database Schema State**:
   - `backend/internal/database/schema.sql` (lines 476–496):
     ```sql
     ALTER TABLE dm_rooms ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT FALSE;
     ALTER TABLE dm_rooms ADD COLUMN IF NOT EXISTS rotation_epoch INT DEFAULT 1;
     ALTER TABLE dm_groups ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT FALSE;
     ALTER TABLE dm_groups ADD COLUMN IF NOT EXISTS rotation_epoch INT DEFAULT 1;
     ALTER TABLE messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE;
     ALTER TABLE messages ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT;
     ALTER TABLE messages ADD COLUMN IF NOT EXISTS e2ee_meta JSONB;
     ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE;
     ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT;
     ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS e2ee_meta JSONB;
     ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE;
     ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT;
     ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS e2ee_meta JSONB;
     ```
   - `backend/internal/database/schema.sql` (line 498) & `db.go` (line 184):
     ```sql
     ALTER TABLE reactions ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT;
     ```
     Observed fact: Table `reactions` does not exist. Line 198 defines `CREATE TABLE IF NOT EXISTS message_reactions`. In addition, `message_reactions` contains columns for `message_id` and `dm_message_id`, but lacks `dm_group_message_id`.
   - Table `e2ee_attachments` does not exist in `schema.sql` or `db.go`.
2. **Search Vector Trigger Behavior**:
   - `backend/internal/database/schema.sql` (lines 319–329):
     ```sql
     CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
     BEGIN
         NEW.search_vector := to_tsvector('portuguese', COALESCE(NEW.content, ''));
         RETURN NEW;
     END
     $$ LANGUAGE plpgsql;
     ```
     Observed fact: When `content` is set to `""` for an encrypted message, `to_tsvector('portuguese', '')` returns empty `tsvector` without error. Column `e2ee_ciphertext` is completely decoupled and never indexed into `search_vector`.
3. **Message Handlers State**:
   - `backend/internal/handlers/dm_handlers.go`:
     - Line 415: `if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Content == "" && len(req.Attachments) == 0)` rejects empty content, which blocks E2EE messages where `content == ""`.
     - Lines 256–268 (`ListMessages`): Does not select or scan `encrypted`, `e2ee_ciphertext`, or `e2ee_meta`.
     - Lines 461–468 (`SendMessage`): Inserts only `dm_room_id, author_id, content, attachments, reply_to_id, is_tts`. Does not populate `encrypted`, `e2ee_ciphertext`, or `e2ee_meta`.
     - No check on `dm_rooms.e2ee_enabled` exists; does not enforce 409 `e2ee_required` or 409 `e2ee_not_enabled`.
     - No route or handler exists for `POST /api/dms/{id}/e2ee/enable`.
   - `backend/internal/handlers/dm_group_handlers.go`:
     - Line 67: Enforces `len(totalMembers) <= 15` in `CreateGroup`.
     - Line 321: Enforces `currentCount + len(req.MemberIDs) <= 15` in `AddMembers`.
     - Line 679 (`SendMessage`): Rejects `req.Content == ""` without checking `encrypted`.
     - Does not enforce 409 `e2ee_required` or 409 `e2ee_not_enabled`.
     - Does not bump `rotation_epoch` or broadcast `E2EE_ROTATION_REQUIRED` on membership mutation.
     - No route or handler exists for `POST /api/dm/groups/{id}/e2ee/enable`.
   - `backend/internal/handlers/e2ee_handlers.go`:
     - Does not contain `POST /api/e2ee/attachments` or `POST /api/e2ee/key-requests`.
4. **WebSocket Gateway**:
   - `backend/internal/gateway/hub.go` (lines 239–285): Already has `SendToUser(userID, event)` and `SendToDevice(deviceID, event) bool`.
   - `backend/internal/gateway/client.go` (lines 183–225): Already validates `e2ee_version` and validates `device_id` against user ownership during WebSocket upgrade.
5. **Existing Test Suite Baseline**:
   - Executed `go test ./internal/...` in `backend/`: Passed 100% clean across all packages in 13.9s.

---

## 2. Logic Chain

1. **From Observation 1**: Because `dm_rooms`, `dm_groups`, `messages`, `dm_messages`, and `dm_group_messages` already have the necessary columns added in M2, the baseline schema already supports storage of E2EE state. However, because `reactions` was written instead of `message_reactions`, `message_reactions` lacks `e2ee_ciphertext` and `dm_group_message_id`. Fixing this in `schema.sql` and `db.go` is required before group reactions can function.
2. **From Observation 2**: Because `to_tsvector('portuguese', COALESCE(NEW.content, ''))` handles empty strings cleanly, storing `content = ""` for encrypted messages satisfies the requirement of zero plaintext storage while keeping search indexes empty and avoiding PostgreSQL trigger errors.
3. **From Observation 3**: Because `SendMessage` in `dm_handlers.go` and `dm_group_handlers.go` currently requires `req.Content != ""`, encrypted messages are rejected. Furthermore, because neither handler checks the conversation's `e2ee_enabled` flag, plaintext gating is entirely absent. Modifying both handlers to:
   - Check `e2ee_enabled`.
   - Return 409 `e2ee_required` if room is E2EE and message is plaintext.
   - Return 409 `e2ee_not_enabled` if room is plaintext and message is encrypted.
   - Allow `content = ""` when `encrypted == true` and `e2ee_ciphertext != ""`.
   directly solves the gating requirement.
4. **From Observation 3 & Idempotency Specification**: Because clients must generate stable `message_id`s, updating `SendDMMessageRequest` to accept `ID *uuid.UUID` and checking existing messages on `(room_id, ID)` allows distinguishing identical retries (returning 200/201 idempotent success) from conflicting mutations (returning 409 `idempotency_conflict`).
5. **From Observation 3 & Group Lifecycle Specification**: Because `dm_group_handlers.go` already enforces the 15-member cap, augmenting `AddMembers`, `RemoveMember`, and ownership transfer to increment `rotation_epoch = rotation_epoch + 1` when `e2ee_enabled == true` and broadcast `E2EE_ROTATION_REQUIRED` ensures that key ratchets rotate on membership churn.
6. **From Observation 3 & 4**: Because `POST /api/e2ee/attachments` and `POST /api/e2ee/key-requests` are not yet implemented, implementing these endpoints in `e2ee_handlers.go` and wiring them to `main.go` under the `RequireE2EEClientVersion` middleware completes the M3 contract.

---

## 3. Caveats

1. **Channel E2EE (Milestone M5)**: While the message model and storage patterns designed here are fully compatible with channels (`messages` table), channel audience computation (`recomputeAudience`) and role-based ACLs are deferred to Milestone M5 as specified in `PROJECT.md`.
2. **Key Request Forwarding Strategy**: Key requests are dispatched to-device via Olm payloads. When target devices are offline, the requests are queued in `e2ee_to_device` for retrieval upon connection. We assume devices will process queued requests within a 7-day TTL.
3. **No other caveats.**

---

## 4. Conclusion

The Go backend codebase is well-structured and ready for Milestone M3 implementation.
The implementation requires:
1. Schema fixes in `schema.sql` and `db.go` (`message_reactions`, `e2ee_attachments`, idempotency unique indexes).
2. Model updates in `models.go` and `e2ee.go` (`Encrypted`, `E2EECiphertext`, `E2EEMeta`, `E2EEEnabled`, `RotationEpoch`).
3. Plaintext gating & idempotency contract in `dm_handlers.go` and `dm_group_handlers.go`.
4. Group member cap and epoch rotation in `dm_group_handlers.go`.
5. Opt-in E2EE enable endpoints `POST /api/dms/{id}/e2ee/enable` and `POST /api/dm/groups/{id}/e2ee/enable`.
6. Encrypted attachments endpoints `POST /api/e2ee/attachments` and `GET /api/e2ee/attachments/{id}`.
7. Key requests endpoint `POST /api/e2ee/key-requests`.
8. Comprehensive Go unit test suites in `backend/internal/handlers/`.

Full implementation specifications, schema definitions, and code structures are detailed in:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_backend\analysis.md`.

---

## 5. Verification Method

1. **Inspect Analysis Report**:
   - View `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_backend\analysis.md`.
2. **Execute Current Backend Test Suite**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/...
   ```
   *Expected*: All tests pass (0 failures).
3. **Verify Implementation Targets**:
   - Check that `dm_handlers.go` and `dm_group_handlers.go` implement the 409 gating codes (`e2ee_required`, `e2ee_not_enabled`).
   - Check that `main.go` registers `/api/dms/{id}/e2ee/enable`, `/api/dm/groups/{id}/e2ee/enable`, `/api/e2ee/attachments`, and `/api/e2ee/key-requests`.
   - Check that the new unit test suites run and achieve 100% pass rate.
4. **Invalidation Conditions**:
   - If `to_tsvector` trigger fails on empty string: Invalidation occurred (already verified working).
   - If any endpoint mutates state via GET: Invalidation of security constraint (all mutations strictly POST + CSRF).
