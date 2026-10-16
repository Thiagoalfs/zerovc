# HANDOFF REPORT — Milestone M5 (Encrypted Server Channels & Scaled Audience)
**Agent**: explorer_m5 (Role: M5 Channels Explorer)
**Working Directory**: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\`
**Date**: 2026-10-15T18:28:00Z
**Type**: Hard Handoff

---

## 1. Observation

### 1.1 Backend State
- **Database Schema (`backend/internal/database/schema.sql`)**:
  - Line 482: `ALTER TABLE channels ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT FALSE;`
  - Line 483: `ALTER TABLE channels ADD COLUMN IF NOT EXISTS rotation_epoch INT DEFAULT 1;`
  - Lines 486-488: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE; ALTER TABLE messages ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT; ALTER TABLE messages ADD COLUMN IF NOT EXISTS e2ee_meta JSONB;`
  - Line 609: `CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_channel_msg_channel_id ON messages (channel_id, id);`
  - Table `e2ee_rosters` (lines 574-588) defines `conversation_type VARCHAR(16) NOT NULL CHECK (conversation_type IN ('dm', 'dm_group', 'channel'))`.
  - Missing: `channels.audience_limit` (INT DEFAULT 15) and `channels.audience_hash` (TEXT).
- **Backend Models (`backend/internal/models/`)**:
  - `models.ConversationTypeChannel` defined in `internal/models/e2ee.go:17`.
  - `models.PermViewChannel` (1 << 14) defined in `internal/models/models.go:153`.
  - `Channel` struct in `internal/models/models.go:187-188` already contains `E2EEEnabled bool` and `RotationEpoch int`.
- **E2EE Handlers (`backend/internal/handlers/e2ee_handlers.go`)**:
  - Lines 193-214: `ComputeAudienceHash(members []uuid.UUID, devices []models.E2EERosterDeviceSnapshot) string` exists and produces canonical SHA-256 hash.
  - Lines 922-938 & 1115-1117: `SubmitRoster` already supports `ConversationTypeChannel` (verifying guild membership and updating `channels.rotation_epoch = req.Epoch, e2ee_enabled = TRUE`).
  - Missing: `recomputeAudience(channelID)` core function in Go.
  - Missing: Route & handler for `GET /api/channels/{id}/e2ee/audience`.
  - Missing: Route & handler for `POST /api/channels/{id}/e2ee/enable`.
  - Missing: Member churn debounce mechanism.
- **Message Handlers (`backend/internal/handlers/message_handlers.go`)**:
  - Lines 125-139: Plaintext gating is already implemented for channels:
    ```go
    if e2eeEnabled {
        if !isEncrypted || req.E2EECiphertext == nil || *req.E2EECiphertext == "" {
            w.Header().Set("Content-Type", "application/json")
            w.WriteHeader(http.StatusConflict)
            w.Write([]byte(`{"error":"e2ee_required"}`))
            return
        }
    } else {
        if isEncrypted || (req.E2EECiphertext != nil && *req.E2EECiphertext != "") {
            w.Header().Set("Content-Type", "application/json")
            w.WriteHeader(http.StatusConflict)
            w.Write([]byte(`{"error":"e2ee_not_enabled"}`))
            return
        }
    }
    ```
  - Lines 255-258: Zero plaintext storage: `if isEncrypted { contentToStore = "" }`.
  - Lines 204-253: Idempotent message retry verification is already implemented.

### 1.2 Frontend State
- **Crypto & Codec (`client/src/messaging/messageCodec.ts`, `client/src/crypto/megolmSession.ts`)**:
  - `messageCodec.ts:96-101`: `decodeMessage` already maps `rawMessage.channel_id` to `conversationType = 'channel'` and invokes `keyRequestManager`.
  - `messageCodec.ts:135-188`: `encodeMessage` already accepts `conversationType: 'channel'`, retrieves/creates outbound session, distributes room key if new, and encrypts envelope.
  - `megolmSession.ts:62-92`: Outbound session caching is indexed by `conversationId` and validates `currentEpoch == storedEpoch`.
  - `megolmSession.ts:97-104`: `invalidateOutboundSession(conversationId)` deletes cached outbound pickle.
- **API Client (`client/src/lib/api.ts`)**:
  - Line 466: `api.channels.sendMessage` lacks `{ message_id?: string; encrypted?: boolean; e2ee_ciphertext?: string; e2ee_meta?: any }`.
  - Missing: `api.e2ee.getChannelAudience` and `api.e2ee.enableChannelE2EE`.
- **Store & Routing (`client/src/stores/guildStore.ts`, `client/src/App.tsx`)**:
  - `guildStore.ts:750`: `sendMessage` currently only sends plaintext without calling `messageCodec.encodeMessage`.
  - `guildStore.ts:256`: `selectChannel` and `loadMoreMessages` do not call `messageCodec.decodeMessage`.
  - `App.tsx:1488-1505`: `handleE2EERotationRequired` handles `dm` and `dm_group`, but lacks `else if (conversation_type === 'channel')`.

### 1.3 Test Infrastructure
- Existing tests:
  - `go test ./internal/handlers -run "TestM3|TestE2EEM4"`: PASS (3.792s).
  - `npx tsc --noEmit`: 0 errors.
  - `client/tests/e2e/tier1-feature-coverage.ts:906-1049`: Features 18 (recomputeAudience), 19 (Stepped Limits), and 20 (Lazy Rotation) are formally specified in E2E mock suites.
- Missing tests:
  - `backend/internal/handlers/e2ee_m5_test.go`
  - `client/scripts/test-channels-m5.ts`

---

## 2. Logic Chain

1. **Premise**: In Milestone M5, server channels must support opt-in E2EE where audience membership is derived from guild roles, permissions, overwrites, and active devices.
2. **Premise**: From Observation 1.1, the database already has `channels.e2ee_enabled` and `channels.rotation_epoch`, and message handlers already enforce plaintext gating and zero plaintext storage for channels.
3. **Inference**: The backend messaging core is already prepared for E2EE messages; what is missing is the audience calculation, lifecycle rotation triggers, stepped limit gating, and client-side encryption dispatch.
4. **Premise**: From Observation 1.1, `permission_helpers.go:124-173` demonstrates the project's exact logic for evaluating role permissions and channel overwrites (`@everyone` allow/deny, member role allow/deny, owner/admin bypass).
5. **Inference**: `recomputeAudience(channelID)` can reuse this exact permission evaluation logic targeting `PermViewChannel` (1 << 14) to resolve all authorized users, query active devices from `e2ee_devices WHERE revoked_at IS NULL`, sort canonically, and hash with `ComputeAudienceHash`.
6. **Premise**: From Observation 1.2, `messageCodec.ts` and `megolmSession.ts` already support `'channel'` conversation types and outbound session invalidation.
7. **Inference**: Integrating E2EE into `guildStore.ts` requires following the proven pattern from `dmStore.ts`: encoding messages on send, decoding on load/receive, and invalidating the outbound session when `E2EE_ROTATION_REQUIRED` is received.
8. **Premise**: From Observation 1.1 & 1.3, stepped audience limits (15 -> 50 -> 250) and debounce are required to protect against member churn storms.
9. **Inference**: A channel-level debounce mechanism (500ms) prevents duplicate epoch rotations during rapid member joins/role updates.

---

## 3. Caveats

- **No Caveats on Architecture**: The existing architecture from M1–M4 cleanly accommodates M5 without structural changes.
- **Assumptions**:
  - The default audience limit for newly created E2EE channels is 15 members unless explicitly set higher.
  - When `recomputeAudience` detects an unchanged audience hash (`newHash == currentHash`), it must strictly be a no-op (no epoch increment, no WebSocket event).
  - WebRTC LiveKit channel voice calls were already enabled with E2EE metadata in M4 (`BuildLiveKitParticipantMetadata` in `channel_handlers.go:486`); M5 focuses on channel text messaging, dynamic audience calculation, stepped limits, and churn debounce.

---

## 4. Conclusion

Milestone M5 is thoroughly investigated and mapped out. The implementation blueprint is clean, precise, and modular:
1. Add `audience_limit INT DEFAULT 15` and `audience_hash TEXT` to `channels`.
2. Implement `RecomputeAudience` and `ChannelAudienceDebouncer` in Go (`backend/internal/handlers/e2ee_audience.go`).
3. Add `GET /api/channels/{id}/e2ee/audience` and `POST /api/channels/{id}/e2ee/enable`.
4. Trigger debounced recomputations on member join/leave/kick/ban, role changes, overwrite updates, and device revocation.
5. Update `client/src/lib/api.ts`, `guildStore.ts`, and `App.tsx` for channel E2EE messaging and session rotation.
6. Create `backend/internal/handlers/e2ee_m5_test.go` and `client/scripts/test-channels-m5.ts`.

---

## 5. Verification Method

To independently verify the investigation findings and ensure build integrity:

1. **Verify Backend Compilation and Existing Test Suite**:
   ```bash
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/handlers -run "TestM3|TestE2EEM4"
   ```
   *Expected*: All tests pass (HTTP 409 gating, idempotency, LiveKit participant metadata).

2. **Verify Frontend TypeScript Typecheck**:
   ```bash
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client"
   npx tsc --noEmit
   ```
   *Expected*: 0 type errors.

3. **Verify E2E Test Suite**:
   ```bash
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client"
   npx tsx tests/e2e/runner.ts
   ```
   *Expected*: 181/181 tests passing.

4. **Verify Implementation Blueprint Artifact**:
   Inspect `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\analysis.md`.
