# DISPATCH — Worker M4 Remediation Iteration 2 (Full Gate 4 Hardening)

## Mission & Scope
Execute the consolidated Iteration 2 remediation across backend and client to achieve unanimous PASS and CLEAN forensic audit for Milestone M4:

### 1. Backend Handlers & Response Types
- In `backend/internal/handlers/channel_handlers.go`:
  * Export `BuildLiveKitParticipantMetadata(avatarURL, displayName, username, customStatus string, userID uuid.UUID, isE2EE bool, deviceID ...string) []byte`.
  * Update `JoinVoice` to use `BuildLiveKitParticipantMetadata`.
- In `backend/internal/handlers/dm_handlers.go`:
  * Define exported typed structs `DMCallInviteResponse` and `DMCallAcceptResponse` with `json:"e2ee_enabled"`.
  * Update `InviteCall` and `AcceptCall` to use `BuildLiveKitParticipantMetadata` and return these typed response structs.
- In `backend/internal/handlers/dm_group_handlers.go`:
  * Define exported typed struct `DMGroupVoiceTokenResponse` with `json:"e2ee_enabled"`.
  * Update `JoinVoice` to use `BuildLiveKitParticipantMetadata` and return `DMGroupVoiceTokenResponse`.
- In `backend/internal/handlers/e2ee_m4_test.go`:
  * Completely replace all dummy closures and dummy maps with genuine tests exercising `handlers.BuildLiveKitParticipantMetadata`, `handlers.JoinVoiceResponse`, `handlers.DMCallInviteResponse`, `handlers.DMCallAcceptResponse`, and `handlers.DMGroupVoiceTokenResponse`.
  * Ensure tests genuinely fail if `e2ee_required` or `e2ee_enabled` logic is deleted.

### 2. Client Crypto Hardening (`client/src/crypto/callKeys.ts`)
- In `handleIncomingCallKey`:
  * Add Guard 1 (Echo rejection): ignore if `payload.sender_device_id === this.myDeviceId`.
  * Add Guard 2 (Distributor self-preservation): if `this.isDistributor()`, log warning and return without adopting peer keys.
  * Add Guard 3 (Authorized sender): if `this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId`, log warning and return.
  * Add Guard 4 (Monotonic ratchet index): if `this.keyIndex > 0 && typeof payload.key_index === 'number' && payload.key_index <= this.keyIndex`, log warning and return.
- In `broadcastCallKeyToParticipants`:
  * Ensure key payload is securely dispatched to recipients.

### 3. Store Integration & Lifecycle (`client/src/stores/voiceStore.ts`)
- Implement `extractParticipantDeviceId(participant: Participant)` helper to extract `device_id` from metadata JSON (with fallback to identity).
- Implement `getLocalDeviceId()` ensuring a valid UUID format for `myDeviceId`.
- Maintain `participantDeviceMap` (`Map<string, string>`) in `connectLiveKitRoom` to map participant identity to device_id.
- Move `callKeyManager.startCall(callId, myDeviceId, existingDeviceIds)` to execute right after `await livekit.connect(...)`, populated with existing participants from `livekit.getRoom().remoteParticipants.values()`.
- Wire `onParticipantConnected` and `onParticipantDisconnected` using `extractParticipantDeviceId`.
- In `cleanupPreviousConnection`, `onDisconnected`, `leaveVoice`, and connection error catch blocks: invoke `livekitE2EEManager.cleanup()`.

### 4. Package.json Script Flags
- In `client/package.json`:
  * Update `"test:frontend-m3"`: `"tsx -r ./scripts/test-setup-worker.ts scripts/test-frontend-m3.ts"`
  * Ensure `"test:callkeys-adversarial"` is registered: `"tsx scripts/challenger-m4-adversarial.ts"`

### 5. Verification
Run and ensure 100% PASS on:
- `npm run test:livekit-m4 --prefix client`
- `npm run test:callkeys-adversarial --prefix client`
- `npx tsx scripts/test-challenger-m4-2-adversarial.ts --prefix client`
- `npm run test:livekit-gate --prefix client`
- `npm run test:e2ee-spike --prefix client`
- `npm run test:frontend-m3 --prefix client`
- `npm run build --prefix client`
- `cd backend && go test -v ./internal/handlers -run "TestE2EE" && go build ./...`

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_audit\handoff.md` (Blueprint for backend & tests)
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_crypto\handoff.md` (Blueprint for callKeys.ts)
4. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store\handoff.md` (Blueprint for voiceStore.ts & package.json)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Global Rules
- NUNCA execute git push automaticamente.
- Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF.
- NUNCA desative TLS em cURL.
- Zero segredos ou plaintext em logs, backend ou DOM.
- Write `handoff.md` in your working directory and notify the parent orchestrator via `send_message`.
