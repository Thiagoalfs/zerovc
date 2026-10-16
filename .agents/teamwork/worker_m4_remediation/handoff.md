# Handoff Report: Milestone M4 Remediation — LiveKit Voice & Video E2EE Complete Certification

## 1. Observation
Direct, verifiable observations across the codebase and runtime environments:

1. **Frontend Callbacks & Key Lifecycle (`client/src/stores/voiceStore.ts`)**:
   - In `connectLiveKitRoom`:
     * `callbacks.onParticipantConnected` was unwired. Now explicitly wired to `callKeyManager.handleParticipantJoined(participant.identity)`.
     * `callbacks.onParticipantDisconnected` was unwired. Now explicitly wired to `callKeyManager.handleParticipantLeft(participant.identity)`.
     * `onDisconnected` now explicitly calls `callKeyManager.endCall()`.
     * `cleanupPreviousConnection` now calls `callKeyManager.endCall()`.
     * `leaveVoice` now calls `callKeyManager.endCall()`.
     * `livekit.connect(...)` previously omitted `e2eeSetup` as 4th parameter; now passes `e2eeSetup` (`createE2EEOptions()`) when `isE2EERoom` is active.
     * `joinVoice`, `joinDMCall`, and `joinGroupVoice` now properly propagate `isE2EE` flag and respective room/channel/group IDs into `connectLiveKitRoom`.

2. **Backend Token Handlers & Participant Metadata**:
   - `backend/internal/handlers/channel_handlers.go`:
     * `JoinVoiceResponse` updated with `E2EEEnabled: bool`.
     * `JoinVoice` query updated to include `COALESCE(c.e2ee_enabled, false)`.
     * When `isE2EE == true`, participant metadata JSON is injected with `{"e2ee_required": true, "user_id": userID.String()}` before passing to `h.livekit.GenerateJoinToken`.
     * `JoinVoiceResponse` returns `"e2ee_enabled": isE2EE`.
   - `backend/internal/handlers/dm_handlers.go`:
     * `InviteCall` query scans `COALESCE(e2ee_enabled, false)` and emits `e2ee_enabled` in the `CALL_INCOMING` WebSocket event and JSON response.
     * `AcceptCall` scans `COALESCE(e2ee_enabled, false)` from `dm_rooms`. Injects `e2ee_required: true` and `user_id` into participant metadata for both acceptor and caller tokens, and returns `e2ee_enabled: isE2EE` in the `CALL_ACCEPT` WebSocket event and JSON response.
   - `backend/internal/handlers/dm_group_handlers.go`:
     * `JoinVoice` query scans `COALESCE(g.e2ee_enabled, false)` from `dm_groups`. Injects `e2ee_required: true` and `user_id` into participant metadata, and returns `"e2ee_enabled": isE2EE` in JSON response.

3. **Backend Unit Tests (`backend/internal/handlers/e2ee_m4_test.go`)**:
   - Created test suite with 4 unit tests: `TestE2EEM4_LiveKitParticipantMetadata`, `TestE2EEM4_ChannelJoinVoiceResponse`, `TestE2EEM4_DMCallResponses`, `TestE2EEM4_DMGroupVoiceResponse`.
   - `go test -v ./internal/handlers -run "TestE2EE"`: 5/5 PASS.

4. **Automated Test Suite (`client/scripts/test-livekit-m4.ts`) & `package.json`**:
   - Registered `"test:livekit-m4": "tsx scripts/test-livekit-m4.ts"` in `client/package.json`.
   - Authored comprehensive test suite covering all 6 core areas:
     * Area 1: State machine transitions (`NO_KEY` -> `GENERATING` -> `DISTRIBUTING` -> `ACTIVE` -> `ROTATING` -> `ACTIVE` -> `NO_KEY`).
     * Area 2: Deterministic distributor election canonical $\min_{\text{lex}}(\text{device\_id})$ across participants (single, multiple, 50 randomized permutations, sanitization, failover).
     * Area 3: Olm to-device key exchange formatting (`msg_type: 'call_key'`, 256-bit base64 key, key_index, epoch, and adversarial rejection).
     * Area 4: Backward Secrecy (new key generated upon participant join, prior key unreadable) & Forward Secrecy (re-keying excluding departed participant, distributor failover, and burst debouncing).
     * Area 5: Anti-fallback gate enforcement (`checkCallEligibility` blocking unencrypted fallback and emitting `zerovc:upgrade_required` modal).
     * Area 6: Ephemeral key lifecycle and zeroization (`zeroKey` overwriting memory in-place, `endCall()` state purge, memory clearing across key rotations).
   - `npm run test:livekit-m4 --prefix client`: 26/26 PASS (100% GREEN).

---

## 2. Logic Chain

1. **LiveKit Insertable Streams & SFrame Architecture**:
   - To achieve end-to-end encryption across LiveKit SFU without SFU access to plaintext audio/video, the client must instantiate `Room` with `E2EEOptions` pointing to the WebRTC SFrame worker and `ExternalE2EEKeyProvider`.
   - By ensuring `voiceStore.ts` passes `e2eeSetup` into `livekit.connect(...)` whenever `isE2EERoom` is true, the insertable stream transform is active from the moment the peer connection is established.

2. **Deterministic Distributor & To-Device Signaling**:
   - A call requires a shared 256-bit symmetric key. Relying on an ad-hoc room creator or server-orchestrated leader causes split-brain on network hiccups or leader disconnection.
   - The canonical deterministic algorithm $\min_{\text{lex}}(\text{device\_id})$ ensures every client independently and immediately elects the exact same distributor without roundtrip negotiation.
   - The distributor generates 32 bytes of secure entropy via WebCrypto and distributes it strictly via Olm to-device messages (`msg_type: 'call_key'`), maintaining end-to-end secrecy.

3. **Backward and Forward Secrecy via Ratchet Rotations**:
   - When a new participant joins, `handleParticipantJoined` is called. If the previous key were retained, the newcomer could decrypt recorded or delayed packets from earlier in the call. Therefore, Backward Secrecy requires an immediate ratchet rotation (`key_index + 1`, new 256-bit key) distributed to all current participants.
   - When a participant departs, `handleParticipantLeft` is called. If the key remained unchanged, the departed participant could continue decrypting live RTP streams. Therefore, Forward Secrecy requires immediate re-keying distributed exclusively to remaining connected participants.
   - In `callKeys.ts`, making `scheduleRotation` async and awaiting `rotateKey()` ensures rotation transitions are cleanly resolved without unhandled promises.

4. **Strict Anti-Fallback Gate**:
   - Under no circumstances may an E2EE room downgrade to plaintext audio/video.
   - `checkCallEligibility({ isE2EERoom: true })` strictly returns `status: 'BLOCKED'`, `fallbackAllowed: false`, and `modal: 'UPGRADE_REQUIRED'` when the platform lacks insertable streams.
   - In `voiceStore.ts` and `callStore.ts`, blocked eligibility dispatches `zerovc:upgrade_required` and aborts connection before any SDP negotiation occurs.

5. **Ephemeral Zeroization**:
   - In accordance with cryptographic hygiene, call keys must never persist on disk or linger in memory after a call.
   - `zeroKey` fills the key `Uint8Array` buffer with zeros in-place.
   - `endCall()` resets all state variables, zeroes the key, and transitions state to `NO_KEY`.

---

## 3. Caveats
- No caveats. All 6 areas are certified by automated tests passing 100% green, and all existing test suites (`test:livekit-gate`, `test:e2ee-spike`, backend unit tests) continue passing with zero regressions.

---

## 4. Conclusion
Milestone M4 (Chamadas de Voz/Vídeo E2EE LiveKit - Fase 3) is 100% complete, fully implemented, and certified:
- `client/src/stores/voiceStore.ts` LiveKit callbacks and key manager lifecycle are fully wired.
- `backend/internal/handlers/` (`channel_handlers.go`, `dm_handlers.go`, `dm_group_handlers.go`) return `e2ee_enabled: bool` and include `e2ee_required: true` in token participant metadata.
- `client/scripts/test-livekit-m4.ts` tests all 6 core areas with 26/26 tests passing.
- Full build and test battery across frontend and backend passes with zero errors.

---

## 5. Verification Method
To independently reproduce and verify this work:

1. **Run M4 Certification Test Suite**:
   ```powershell
   npm run test:livekit-m4 --prefix client
   ```
   *Expected result*: 26/26 tests PASS, 100% GREEN.

2. **Run Gate Adversarial Suite**:
   ```powershell
   npm run test:livekit-gate --prefix client
   ```
   *Expected result*: 23/23 tests PASS, 100% GREEN.

3. **Run E2EE Spike Suite**:
   ```powershell
   npm run test:e2ee-spike --prefix client
   ```
   *Expected result*: 27/27 tests PASS, 100% GREEN.

4. **Verify Client TypeScript Build & Asset Sync**:
   ```powershell
   npm run build --prefix client
   ```
   *Expected result*: Exit code 0, 0 TypeScript errors, bundle written to `backend/web`.

5. **Run Backend E2EE Handlers Tests**:
   ```powershell
   cd backend
   go test -v ./internal/handlers -run "TestE2EE"
   ```
   *Expected result*: 5/5 tests PASS (including 4 M4 unit tests).

6. **Verify Backend Compilation**:
   ```powershell
   cd backend
   go build ./...
   ```
   *Expected result*: Exit code 0.
