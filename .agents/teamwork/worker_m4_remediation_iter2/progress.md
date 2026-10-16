# Progress — worker_m4_remediation_iter2

Last visited: 2026-10-15T18:00:00Z

## Status
Completed

## Tasks Checklist
- [x] Initialize BRIEFING.md and progress.md
- [x] Backend Handlers & Response Types:
  - [x] `channel_handlers.go`: export `BuildLiveKitParticipantMetadata` and use in `JoinVoice`
  - [x] `dm_handlers.go`: define exported `DMCallInviteResponse` and `DMCallAcceptResponse`, use `BuildLiveKitParticipantMetadata`, return typed structs
  - [x] `dm_group_handlers.go`: define exported `DMGroupVoiceTokenResponse`, use `BuildLiveKitParticipantMetadata`, return typed struct
  - [x] `e2ee_m4_test.go`: rewrite test file to directly test `BuildLiveKitParticipantMetadata`, `JoinVoiceResponse`, `DMCallInviteResponse`, `DMCallAcceptResponse`, and `DMGroupVoiceTokenResponse` (zero dummy closures/maps)
  - [x] `e2ee_m4_challenger_test.go`: update references to use production functions/structs
- [x] Client Crypto Hardening:
  - [x] `client/src/crypto/callKeys.ts`: add 4 guards in `handleIncomingCallKey` (echo rejection, distributor self-preservation, failover-aware authorized sender verification, monotonic ratchet index)
- [x] Store Integration & Lifecycle:
  - [x] `client/src/stores/voiceStore.ts`: implement `extractParticipantDeviceId` and `getLocalDeviceId`
  - [x] `voiceStore.ts`: maintain `participantDeviceMap`, call `startCall` right after `livekit.connect` with remote participants
  - [x] `voiceStore.ts`: wire `onParticipantConnected` and `onParticipantDisconnected` with `extractParticipantDeviceId`
  - [x] `voiceStore.ts`: call `livekitE2EEManager.cleanup()` on teardown/disconnect/leave/error
- [x] Package.json Scripts:
  - [x] `client/package.json`: update `"test:frontend-m3"` with `-r ./scripts/test-setup-worker.ts`
  - [x] `client/package.json`: verify `"test:callkeys-adversarial"` is registered
- [x] Verification & Tests (100% PASS):
  - [x] `npm run test:livekit-m4 --prefix client` (26/26 PASS)
  - [x] `npm run test:callkeys-adversarial --prefix client` (21/21 PASS)
  - [x] `npx tsx scripts/test-challenger-m4-2-adversarial.ts --prefix client` (17/17 PASS)
  - [x] `npm run test:livekit-gate --prefix client` (23/23 PASS)
  - [x] `npm run test:e2ee-spike --prefix client` (27/27 PASS)
  - [x] `npm run test:frontend-m3 --prefix client` (29/29 PASS)
  - [x] `npm run build --prefix client` (0 errors, Vite production build succeeded)
  - [x] `cd backend && go test -v ./internal/handlers -run "TestE2EE" && go build ./...` (0 failures, compile succeeded)
- [x] Write `handoff.md` and report to orchestrator via `send_message`
