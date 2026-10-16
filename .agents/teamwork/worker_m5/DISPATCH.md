# DISPATCH — Worker M5 (Milestone M5: Encrypted Server Channels & Scaled Audience Implementation)

## Mission & Scope
Implement complete End-to-End Encryption for server channels with dynamic audience recomputation and stepped audience scaling (Milestone M5 - Fase 5):

### 1. Database & Models
- In `backend/internal/database/schema.sql` and `backend/internal/database/db.go`:
  * Ensure columns `audience_limit INT DEFAULT 15` and `audience_hash TEXT` exist on `channels` table.
- In `backend/internal/models/models.go`:
  * Update `Channel` struct to include `AudienceLimit int `json:"audience_limit"`` and `AudienceHash *string `json:"audience_hash,omitempty"``.
- In `backend/internal/models/e2ee.go`:
  * Define `ChannelAudienceResponse` struct containing `ChannelID`, `AudienceHash`, `RotationEpoch`, `AudienceLimit`, `MemberCount`, `Members`, and `Devices`.

### 2. Backend Handlers & Audience Logic
- Create `backend/internal/handlers/e2ee_audience.go`:
  * `RecomputeAudience(ctx context.Context, channelID uuid.UUID) (*models.ChannelAudienceResponse, error)`:
    - Resolves authorized members taking into account guild owner, admin role bypass, `@everyone` allow/deny, role allow/deny, member overwrite allow/deny targeting `PermViewChannel` (1 << 14).
    - Checks stepped audience limit: if `count > channel.AudienceLimit`, enforce limit error / HTTP 400.
    - Queries active devices for authorized users (`d.revoked_at IS NULL`).
    - Produces canonical SHA-256 hash via `ComputeAudienceHash`.
    - If `audience_hash` changed: increment `channel.rotation_epoch++`, save `audience_hash`, broadcast WebSocket event `E2EE_ROTATION_REQUIRED`.
  * `ChannelAudienceDebouncer`: thread-safe debouncer (500ms window) for channel recomputations.
  * Route `GET /api/channels/{id}/e2ee/audience`: returns `ChannelAudienceResponse`. Requires `PermViewChannel`.
  * Route `POST /api/channels/{id}/e2ee/enable`: enables E2EE on channel if audience <= limit. Requires `PermManageChannels` and CSRF validation.
- Register routes in `backend/internal/router/router.go`.
- Hook `ChannelAudienceDebouncer` into member kick/ban/leave, role update, overwrite update, and device revocation.

### 3. Backend Unit Tests (`backend/internal/handlers/e2ee_m5_test.go`)
- Authored with 100% genuine execution of production code:
  * Audience recomputation with role and channel overwrites.
  * Stepped limit enforcement (15, 50, 250).
  * Hash change epoch rotation & debounce.
  * Response payload serialization.
  * ZERO dummy closures or local map literals!

### 4. Client API & Store Integration
- In `client/src/lib/api.ts`:
  * Update `api.channels.sendMessage` to accept `{ message_id?: string; encrypted?: boolean; e2ee_ciphertext?: string; e2ee_meta?: any }`.
  * Add `api.e2ee.getChannelAudience(channelId: string)`.
  * Add `api.e2ee.enableChannelE2EE(channelId: string)`.
- In `client/src/stores/guildStore.ts`:
  * In `sendMessage`: if current channel `e2ee_enabled === true`, encode message with `messageCodec.encodeMessage({ conversationType: 'channel', ... })`.
  * In `selectChannel` / `loadMoreMessages` / socket message receive: decode with `messageCodec.decodeMessage`.
- In `client/src/App.tsx`:
  * In `handleE2EERotationRequired`: handle `conversation_type === 'channel'`, calling `megolmSessionManager.invalidateOutboundSession(channelId)`.

### 5. Automated Test Suite (`client/scripts/test-channels-m5.ts`) & Package.json
- Author comprehensive automated tests covering:
  * Channel audience recomputation & permission matrix evaluation.
  * Stepped audience limits (15, 50, 250).
  * Lazy epoch rotation on member change.
  * Channel message encryption / decryption via messageCodec.
  * Outbound Megolm session invalidation on `E2EE_ROTATION_REQUIRED`.
- Register in `client/package.json`: `"test:channels-m5": "tsx scripts/test-channels-m5.ts"`.

### 6. Verification
Run and verify 100% PASS on:
- `npm run test:channels-m5 --prefix client`
- `npm run test:livekit-m4 --prefix client`
- `npm run test:callkeys-adversarial --prefix client`
- `npm run test:livekit-gate --prefix client`
- `npm run test:frontend-m3 --prefix client`
- `npm run build --prefix client`
- `cd backend && go test -v ./internal/handlers -run "TestE2EE" && go build ./...`

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\analysis.md`
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\handoff.md`
4. `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` (§12, §14 Fase 5)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Global Rules
- NUNCA execute git push automaticamente.
- Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF (tempo constante `hash_equals`).
- NUNCA desative TLS em cURL.
- Zero segredos ou plaintext em logs, backend ou DOM.
- Write `handoff.md` in your working directory and notify the parent orchestrator via `send_message`.


## 2026-10-15T18:31:55Z
[Message] sender=c7bad961-fa24-42cb-b324-2269f48b6b9e
You are worker_m5 (Role: M5 Channels Worker).
Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m5\
Project root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Parent Orchestrator Conversation ID: c7bad961-fa24-42cb-b324-2269f48b6b9e
Tasks:
1. Initialize BRIEFING.md and progress.md in your working directory.
2. In backend:
   - Ensure channels.audience_limit and channels.audience_hash exist in schema/models.
   - Implement RecomputeAudience, ChannelAudienceDebouncer, GetChannelAudience (GET /api/channels/{id}/e2ee/audience), and EnableChannelE2EE (POST /api/channels/{id}/e2ee/enable) in backend/internal/handlers/e2ee_audience.go.
   - Wire router and member/role/channel lifecycle triggers.
   - Author genuine unit tests in backend/internal/handlers/e2ee_m5_test.go.
3. In client:
   - Update api.channels.sendMessage with E2EE parameters. Add api.e2ee.getChannelAudience and api.e2ee.enableChannelE2EE.
   - Update guildStore.ts to encrypt on send and decode on load/receive.
   - Update App.tsx to handle E2EE_ROTATION_REQUIRED for channel.
   - Author comprehensive automated tests in client/scripts/test-channels-m5.ts and register script in client/package.json.
4. Run all verification commands.
5. Produce handoff.md with complete test logs and report back via send_message.
