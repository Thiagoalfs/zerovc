# Progress — Worker M4 Remediation

Last visited: 2026-10-15T17:15:00Z
Status: All tasks complete, all verification tests passing 100% green

## Completed Tasks
1. [x] Initialize BRIEFING.md, progress.md, and append DISPATCH.md header.
2. [x] In `client/src/stores/voiceStore.ts`:
   - Wired `onParticipantConnected` to `callKeyManager.handleParticipantJoined(participant.identity)`.
   - Wired `onParticipantDisconnected` to `callKeyManager.handleParticipantLeft(participant.identity)`.
   - Injected `callKeyManager.endCall()` on room disconnect, in `cleanupPreviousConnection`, and in `leaveVoice`.
   - Passed `e2eeSetup` into `livekit.connect(...)`.
   - Passed `isE2EE` and call/channel/group ID to `connectLiveKitRoom` across `joinVoice`, `joinDMCall`, and `joinGroupVoice`.
3. [x] In `client/src/crypto/callKeys.ts`:
   - Made `scheduleRotation` async and properly awaited `rotateKey()` and rotation timers when `immediate` is true.
4. [x] In `client/src/lib/api.ts`:
   - Updated response typings for `channels.joinVoice`, `dms.inviteCall`, `dms.acceptCall`, and `dmGroups.getVoiceToken` to include `e2ee_enabled?: boolean`.
5. [x] In `backend/internal/handlers/channel_handlers.go`:
   - Added `E2EEEnabled: bool` to `JoinVoiceResponse`.
   - Queried `COALESCE(c.e2ee_enabled, false)` in `JoinVoice`.
   - Injected `e2ee_required: true` and `user_id` into LiveKit token participant metadata when `e2ee_enabled == true`.
6. [x] In `backend/internal/handlers/dm_handlers.go`:
   - `InviteCall`: queried `e2ee_enabled` from `dm_rooms` and added to `CALL_INCOMING` WebSocket event and JSON response.
   - `AcceptCall`: queried `e2ee_enabled`, injected `e2ee_required` and `user_id` into both acceptor and caller LiveKit token participant metadata, and added `e2ee_enabled` to `CALL_ACCEPT` WebSocket event and JSON response.
7. [x] In `backend/internal/handlers/dm_group_handlers.go`:
   - `JoinVoice`: queried `e2ee_enabled` from `dm_groups`, injected `e2ee_required` and `user_id` into LiveKit token participant metadata, and returned `e2ee_enabled` in JSON response.
8. [x] In `backend/internal/handlers/e2ee_m4_test.go`:
   - Added 4 unit tests verifying LiveKit participant metadata formatting and voice response schemas for channel, DM, and DM group.
9. [x] In `client/scripts/test-livekit-m4.ts`:
   - Authored comprehensive certification test suite covering all 6 core areas (State machine, distributor election, Olm to-device key exchange, backward & forward secrecy, anti-fallback gate rejection, ephemeral key zeroization).
10. [x] In `client/package.json`:
   - Added `"test:livekit-m4": "tsx scripts/test-livekit-m4.ts"`.
11. [x] Ran all builds and test suites:
   - `npm run test:livekit-m4 --prefix client` -> 26/26 PASS (100% GREEN)
   - `npm run test:livekit-gate --prefix client` -> 23/23 PASS (100% GREEN)
   - `npm run test:e2ee-spike --prefix client` -> 27/27 PASS (100% GREEN)
   - `npm run build --prefix client` -> EXIT 0 (tsc & vite build clean)
   - `go test -v ./internal/handlers -run "TestE2EE"` in `backend/` -> PASS (5/5 tests)
   - `go build ./...` in `backend/` -> EXIT 0
12. [x] Authored handoff.md and notified parent orchestrator.
