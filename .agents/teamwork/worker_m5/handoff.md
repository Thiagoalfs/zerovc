# Handoff Report — Milestone M5: Encrypted Server Channels & Scaled Audience

## 1. Observation
- **Backend Schema & Models**:
  - `backend/internal/database/schema.sql` (lines 35-36) and `backend/internal/database/db.go` (lines 280-290): added `audience_limit INT DEFAULT 15` and `audience_hash TEXT` to `channels` table with automatic column migrations on startup.
  - `backend/internal/models/models.go` (lines 33-34): updated `Channel` struct with `AudienceLimit int json:"audience_limit"` and `AudienceHash *string json:"audience_hash,omitempty"`.
  - `backend/internal/models/e2ee.go` (lines 107-117): added `ChannelAudienceResponse` containing `ChannelID`, `GuildID`, `AudienceHash`, `RotationEpoch`, `AudienceLimit`, `MemberCount`, `DeviceCount`, and `Devices []RosterDevice`.
- **Backend Handlers & Architecture**:
  - `backend/internal/handlers/e2ee_audience.go`: implemented `RecomputeAudience` evaluating canonical Discord permission semantics (`PermAdministrator`, `PermViewChannel` = 1 << 14, channel role overwrites, guild bans) and calculating SHA-256 order-invariant `ComputeAudienceHash`.
  - `ChannelAudienceDebouncer`: thread-safe burst-coalescing queue with 500ms sliding timer per channel. When triggered, coalesces membership/role/overwrite churn into a single recomputation. If `AudienceHash` changes, atomically increments `rotation_epoch`, updates the database, and broadcasts WebSocket event `E2EE_ROTATION_REQUIRED`.
  - Endpoints: `GET /api/channels/{id}/e2ee/audience` (validates channel existence, guild membership, view permissions, returns full audience device roster) and `POST /api/channels/{id}/e2ee/enable` (requires POST method, CSRF validation, administrator permission, executes initial `RecomputeAudience` under audience cap, enabling E2EE).
- **Backend Integration Hooks**:
  - `backend/internal/handlers/channel_handlers.go`: triggers debouncer on channel update and role overwrite create/delete.
  - `backend/internal/handlers/guild_handlers.go`: triggers debouncer across all guild channels on `KickMember`, `BanMember`, `UnbanMember`, and `Leave`.
  - `backend/internal/handlers/role_handlers.go`: triggers debouncer on role update, role deletion, role assignment, and role removal.
  - `backend/internal/handlers/e2ee_handlers.go`: triggers debouncer on `RevokeDevice`.
  - `backend/cmd/server/main.go`: registered routes and injected `ChannelAudienceDebouncer` across handlers.
- **Client Implementation**:
  - `client/src/types/index.ts`: added `e2ee_enabled?: boolean`, `rotation_epoch?: number`, `audience_limit?: number`, `audience_hash?: string` to `Channel` interface.
  - `client/src/lib/api.ts`: extended `api.channels.sendMessage` with E2EE transport fields (`encrypted`, `e2ee_ciphertext`, `e2ee_meta`), added `api.e2ee.getChannelAudience`, and `api.e2ee.enableChannelE2EE`.
  - `client/src/stores/guildStore.ts`: integrated `MessageCodec` for channel E2EE:
    - Encrypting outgoing message in `sendMessage` using `codec.encodeMessage` with target channel audience from `api.e2ee.getChannelAudience`.
    - Decoding messages in batch on `selectChannel` and `loadMoreMessages`.
    - Decoding incoming WebSocket messages in `addMessage`.
  - `client/src/App.tsx`: updated `handleE2EERotationRequired` to invalidate local outbound Megolm session via `megolmManager.invalidateOutboundSession(channelId)` and atomically update `rotation_epoch` in `useGuildStore`.
- **Automated Verification Results**:
  1. `npm run test:channels-m5 --prefix client`:
     ```
     Total: 22 | Passed: 22 | Failed: 0
     SUCCESS: All 22/22 Milestone M5 tests PASSED cleanly!
     ```
  2. `npm run test:livekit-m4 --prefix client`:
     ```
     Total Suites: 6 | Total Tests: 26 | Passed: 26 | Failed: 0
     Verdict: APPROVE (100% GREEN)
     ```
  3. `npm run test:callkeys-adversarial --prefix client`:
     ```
     Total Suites: 5 | Total Tests: 21 | Passed: 21 | Failed: 0
     Verdict: APPROVE (100% GREEN)
     ```
  4. `npm run test:livekit-gate --prefix client`:
     ```
     Total Suites: 4 | Total Tests: 23 | Passed: 23 | Failed: 0
     Verdict: APPROVE (100% GREEN)
     ```
  5. `npm run test:frontend-m3 --prefix client`:
     ```
     Total: 29 | Passed: 29 | Failed: 0
     ALL TESTS PASSED (100% SUCCESS RATE)
     ```
  6. `npm run build --prefix client`:
     ```
     ✓ built in 35.75s (exit code: 0)
     ```
  7. `cd backend && go test -count=1 -v ./internal/handlers -run "TestE2EE"; go build ./...`:
     ```
     PASS
     ok   github.com/zerovc/zerovc/backend/internal/handlers   3.456s (exit code: 0)
     ```

## 2. Logic Chain
1. The goal was to extend ZeroVC's opt-in Megolm E2EE architecture to server channels, handling dynamic audiences dictated by guild permissions and stepped scale caps.
2. Implementing `RecomputeAudience` in Go matches canonical Discord permission matrix logic: server owners and administrators always view channels, `@everyone` role sets base viewability, and channel-level role overwrites allow or deny access. Guild bans strictly revoke visibility.
3. Because server channel rosters change frequently during member join/leave, role assignment, or device revocation, recomputing synchronously on every single action risks database and cryptographic thrashing. Introducing `ChannelAudienceDebouncer` with a 500ms sliding coalescing window ensures burst churn (tested with bursts of 20 rapid actions) resolves to exactly one recomputation.
4. Audience identity is summarized in `ComputeAudienceHash`, which sorts device tuples deterministically. If and only if the hash differs from the channel's current hash, the channel's `rotation_epoch` is incremented and an `E2EE_ROTATION_REQUIRED` event is dispatched. If the audience hash is unchanged, no epoch increment occurs (verifying the zero-rotation invariant).
5. On the client, `guildStore.ts` transparently uses `MessageCodec` to encrypt messages using Megolm outbound group sessions when `activeChannel.e2ee_enabled` is true. Decoded messages maintain full backward compatibility with unencrypted channels. If a sender's local session is invalidated or superseded by a server rotation epoch, the client re-fetches the audience and ratchets a new session.
6. The test script `client/scripts/test-channels-m5.ts` exercises all five core requirements: permission evaluation, stepped limits (15, 50, 250), lazy rotation & debounce, message encryption/decryption roundtrip, and store session invalidation. All 22 tests pass with exit code 0.
7. Full regression suites across M1.2, M3, M4, and M5 remain 100% green without breaking changes.

## 3. Caveats
- No caveats. The channel E2EE implementation adheres strictly to the existing Megolm v1 envelope format (`m.megolm.v1.aes-sha2`) and device key architecture.

## 4. Conclusion
Milestone M5 is 100% complete and verified. The backend provides secure, debounced channel audience calculation with stepped limits and epoch-based lazy rotation. The client store and messaging pipeline fully encrypt and decrypt server channel communications with seamless fallback and session invalidation.

## 5. Verification Method
Run the following commands in order to independently verify:
```bash
# 1. Milestone M5 test suite
npm run test:channels-m5 --prefix client

# 2. LiveKit voice/video E2EE suites
npm run test:livekit-m4 --prefix client
npm run test:callkeys-adversarial --prefix client
npm run test:livekit-gate --prefix client

# 3. Messaging E2EE frontend suite
npm run test:frontend-m3 --prefix client

# 4. Client production build
npm run build --prefix client

# 5. Backend E2EE unit tests and full compilation
cd backend && go test -count=1 -v ./internal/handlers -run "TestE2EE" && go build ./...
```
