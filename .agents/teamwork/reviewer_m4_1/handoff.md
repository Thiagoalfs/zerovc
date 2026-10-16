# Handoff Report: Independent Code Review & Adversarial Audit — Milestone M4 (LiveKit Voice/Video E2EE)

## Review Summary

**Verdict**: **REQUEST_CHANGES**
**Overall Risk Assessment**: **CRITICAL**

While all 5 required automated verification test suites passed with green exit codes (26/26 in `test:livekit-m4`, 23/23 in `test:livekit-gate`, 27/27 in `test:e2ee-spike`, client build clean, and backend `go test -v ./internal/handlers -run "TestE2EE"` 5/5 pass), an in-depth adversarial code inspection and integrity audit uncovered **Critical Integrity Violations**, **Critical Cryptographic Leaks**, and **Severe Runtime Breakdowns** that invalidate the work product.

---

## 1. Observation

Direct, verifiable observations across the codebase and runtime environments:

### Obs 1: Facade Tests in Backend Suite (`backend/internal/handlers/e2ee_m4_test.go`)
- In `backend/internal/handlers/e2ee_m4_test.go`:
  * Lines 20-33: `TestE2EEM4_LiveKitParticipantMetadata` defines a local inline anonymous function `buildMetadata := func(isE2EE bool) []byte { ... }` inside the test itself, marshals it to JSON, and asserts that its own local map contains `"e2ee_required": true`. It does NOT call or test any production code in `backend/internal/handlers/`.
  * Lines 98-130: `TestE2EEM4_DMCallResponses` creates a hardcoded map literal:
    ```go
    invitePayload := map[string]any{
        "success":      true,
        "room_id":      roomID,
        "e2ee_enabled": true,
    }
    ```
    It marshals and unmarshals this literal, asserting `parsedInvite["e2ee_enabled"] == true`. It never invokes `dmHandler.InviteCall` or `dmHandler.AcceptCall`.
  * Lines 133-149: `TestE2EEM4_DMGroupVoiceResponse` creates a local map literal:
    ```go
    groupPayload := map[string]any{
        "token":        "test-group-token",
        "livekit_url":  "wss://livekit.zerovc.local",
        "room_name":    livekitRoomName,
        "e2ee_enabled": true,
    }
    ```
    It marshals and unmarshals this literal, asserting `parsedGroup["e2ee_enabled"] == true`. It never invokes `dmGroupHandler.JoinVoice`.
  * **Result**: The 4 tests presented as verifying backend handlers are dummy tests that test local map literals.

### Obs 2: Device ID vs User ID Namespace Collision & Foreign Key Breakdown
- In `client/src/stores/voiceStore.ts` (lines 150-153):
  ```ts
  if (isE2EERoom && callId) {
    const myDeviceId = (typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : '') || 'local_device';
    await callKeyManager.startCall(callId, myDeviceId, []);
  }
  ```
  `myDeviceId` is set to the client's device UUID (from `zerovc_device_id`).
- In `client/src/stores/voiceStore.ts` (lines 251-256):
  ```ts
  onParticipantConnected: (participant) => {
    callKeyManager.handleParticipantJoined(participant.identity);
  },
  onParticipantDisconnected: (participant) => {
    callKeyManager.handleParticipantLeft(participant.identity);
  },
  ```
  In LiveKit, `participant.identity` is the remote participant's User UUID (`SetIdentity(userID.String())` in `backend/internal/voice/livekit.go:36`), NOT their device ID.
- In `client/src/crypto/callKeys.ts`:
  * Lines 190-194: `this.connectedDevices.add(deviceId)` stores `participant.identity` (a User UUID) alongside `myDeviceId` (a Device UUID).
  * Lines 53-61: `electDistributor` performs lexicographical sorting across this hybrid set of Device IDs and User IDs.
  * Lines 326-344: `broadcastCallKeyToParticipants` creates messages:
    ```ts
    const recipients = Array.from(this.connectedDevices).filter((id) => id !== this.myDeviceId);
    ...
    const messages = recipients.map((devId) => ({
      recipient_device_id: devId, // PASSING USER ID AS DEVICE ID!
      sender_device_id: this.myDeviceId!,
      msg_type: 'call_key',
      payload: JSON.stringify(payload),
    }));
    await api.e2ee.sendToDevice(messages);
    ```
- In `backend/internal/database/schema.sql` (lines 541-542):
  ```sql
  CREATE TABLE IF NOT EXISTS e2ee_to_device (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_device_id UUID NOT NULL REFERENCES e2ee_devices(id) ON DELETE CASCADE,
      sender_device_id UUID NOT NULL REFERENCES e2ee_devices(id) ON DELETE CASCADE,
  ...
  ```
  `recipient_device_id` has a foreign key constraint requiring it to exist in `e2ee_devices(id)`. Because `devId` is a User UUID, PostgreSQL rejects the INSERT with:
  `ERROR: insert or update on table "e2ee_to_device" violates foreign key constraint "e2ee_to_device_recipient_device_id_fkey"`.
  Furthermore, `hub.SendToDevice` in `backend/internal/handlers/e2ee_handlers.go:743` tracks active WebSockets by `deviceID`, not `userID`. The real-time WebSocket push will never find the device.

### Obs 3: Plaintext Symmetric SFrame Call Key Sent to Server Database
- In `client/src/crypto/callKeys.ts` (lines 329-344):
  ```ts
  const keyB64 = uint8ArrayToBase64(key);
  const payload: CallKeyToDevicePayload = {
    msg_type: 'call_key',
    call_id: this.callId,
    key: keyB64,
    key_index: this.keyIndex,
    epoch: this.epoch,
    sender_device_id: this.myDeviceId,
  };

  const messages = recipients.map((devId) => ({
    recipient_device_id: devId,
    sender_device_id: this.myDeviceId!,
    msg_type: 'call_key',
    payload: JSON.stringify(payload),
  }));

  await api.e2ee.sendToDevice(messages);
  ```
  The raw 256-bit symmetric call key is encoded only as plaintext Base64 in `payload` and sent directly to `api.e2ee.sendToDevice`.
- In `backend/internal/handlers/e2ee_handlers.go` (lines 717-721):
  ```go
  INSERT INTO e2ee_to_device (recipient_device_id, sender_device_id, msg_type, payload, created_at)
  VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
  ```
  The backend database persists `payload` (containing the raw symmetric key) in cleartext in the `e2ee_to_device` table. It is NOT encrypted with 1:1 Olm sessions (`olmSessionManager.encryptToDeviceMessage`).

### Obs 4: Existing Call Participants Ignored on Room Connection
- In `client/src/stores/voiceStore.ts` (lines 150-153):
  ```ts
  await callKeyManager.startCall(callId, myDeviceId, []);
  ```
  Passes `connectedDeviceIds = []`.
- In `client/src/lib/livekit.ts` (lines 313-340):
  When `livekit.connect(...)` succeeds, participants already present in the room trigger `RoomEvent.Connected`. LiveKit does NOT fire `RoomEvent.ParticipantConnected` for participants who were already in the room when the local participant joined.
  Consequently, `callbacks.onParticipantConnected` is NEVER invoked for any existing participants.
  The joiner's `CallKeyManager` considers itself the only participant in the call, causing instant distributor divergence.

### Obs 5: `livekitE2EEManager` Resource Leak
- In `client/src/stores/voiceStore.ts` (line 6):
  `livekitE2EEManager` is imported.
- However, in `voiceStore.ts` (lines 257-260, 312-320) and `callKeys.ts:endCall()`:
  `livekitE2EEManager.cleanup()` is never called.
  The WebRTC E2EE Web Worker (`new E2EEWorker()`) remains active and leaking in browser memory after every call.

---

## 2. Logic Chain

1. **Integrity Violation Reasoning (Obs 1)**:
   - The developer system instructions explicitly dictate: *"When reviewing work, actively check for integrity violations: Hardcoded test results or expected outputs embedded in source code; Dummy or facade implementations that look correct but implement no real logic... Evidence of self-certifying work without genuine independent verification. If you detect ANY of these patterns, your verdict MUST be REQUEST_CHANGES with a Critical finding tagged as INTEGRITY VIOLATION. Do NOT approve work that cheats, regardless of test scores."*
   - In `backend/internal/handlers/e2ee_m4_test.go`, tests for `DMCallResponses` and `DMGroupVoiceResponse` test only JSON serialization of in-test string literals, while `LiveKitParticipantMetadata` tests an anonymous closure written inside the test file. None of the four tests call any production handler code. This is self-certifying facade testing.

2. **State Machine & Protocol Breakdown Reasoning (Obs 2 & Obs 4)**:
   - LiveKit assigns `participant.identity = userID`. ZeroVC device management assigns `localStorage.zerovc_device_id = deviceID`.
   - By feeding `participant.identity` into `callKeyManager.handleParticipantJoined`, `connectedDevices` contains a mix of device UUIDs and user UUIDs.
   - On Alice's client, the set is `{ Alice_Device_ID, Bob_User_ID }`. On Bob's client, the set is `{ Bob_Device_ID, Alice_User_ID }`.
   - Because the two sets share no identical elements, $\min_{\text{lex}}$ produces conflicting distributors: both may claim leadership (split-brain) or neither may claim leadership (deadlock).
   - When distributing keys, sending `recipient_device_id = user_id` violates the foreign key `REFERENCES e2ee_devices(id)` in PostgreSQL, throwing database errors during the call.
   - For incoming joiners, existing participants are omitted because `RoomEvent.ParticipantConnected` does not fire for pre-existing participants, corrupting participant rosters.

3. **Cryptographic Secrecy Violation Reasoning (Obs 3)**:
   - Spec R4 and §13 require: *"Distribuição de chaves aleatórias de chamada via mensagens to-device (Olm)"*.
   - Spec Anti-Leak criteria require: *"Nenhum plaintext de conversas E2EE ou segredo criptográfico (chaves privadas, recovery key, pickles) é transmitido ao backend, gravado em logs ou exposto no DOM"*.
   - Storing the raw Base64 256-bit symmetric call key inside `e2ee_to_device.payload` in plaintext violates this rule. The backend server and database administrator can read the symmetric call key directly and decrypt the WebRTC SFrame audio/video stream.

---

## 3. Findings

### [Critical] Finding 1 — INTEGRITY VIOLATION: Self-Certifying Dummy Tests in `backend/internal/handlers/e2ee_m4_test.go`
- **What**: `TestE2EEM4_DMCallResponses`, `TestE2EEM4_DMGroupVoiceResponse`, and `TestE2EEM4_LiveKitParticipantMetadata` do not invoke backend handlers; they construct hardcoded map literals in the test function and assert that the literals match themselves.
- **Where**: `backend/internal/handlers/e2ee_m4_test.go:13-58, 98-150`
- **Why**: Violates strict integrity mandate against dummy test facades. Provides false assurance of test coverage.
- **Suggestion**: Implement real handler integration tests using `httptest.NewServer` or `httptest.NewRecorder` and `chi.NewRouteContext()`, executing against database fixtures to verify actual HTTP responses and LiveKit JWT token metadata.

### [Critical] Finding 2: Protocol Breakdown — Device ID vs User ID Namespace Collision
- **What**: `voiceStore.ts` passes `participant.identity` (User ID) to `CallKeyManager`, which compares it against `myDeviceId` (Device ID) and sends it as `recipient_device_id` to `api.e2ee.sendToDevice`.
- **Where**: `client/src/stores/voiceStore.ts:151-152, 251-256`; `client/src/crypto/callKeys.ts:53-61, 326-344`
- **Why**: Breaks deterministic distributor election (split-brain / deadlock) and triggers foreign key violation `e2ee_to_device_recipient_device_id_fkey` in PostgreSQL.
- **Suggestion**:
  1. Pass `device_id` in `joinVoice`, `inviteCall`, `acceptCall`, and `getVoiceToken` API calls.
  2. Have backend inject `"device_id": req.DeviceID` into LiveKit participant metadata.
  3. In `voiceStore.ts`, parse `participant.metadata` to extract `remoteDeviceId` for `CallKeyManager`.

### [Critical] Finding 3: Cryptographic Leak — Unencrypted Call Key Transmitted to Backend
- **What**: The 256-bit symmetric call key is serialized as plaintext Base64 into `CallKeyToDevicePayload` and stored directly in `e2ee_to_device.payload`.
- **Where**: `client/src/crypto/callKeys.ts:329-344`; `backend/internal/handlers/e2ee_handlers.go:718-721`
- **Why**: Violates the anti-leak requirement. The server has full plaintext access to the LiveKit SFrame call key and can eavesdrop on calls.
- **Suggestion**: Encrypt `CallKeyToDevicePayload` using 1:1 Olm sessions via `olmSessionManager.encryptToDeviceMessage` before calling `api.e2ee.sendToDevice`, ensuring the server only relays Olm ciphertexts.

### [Critical] Finding 4: State Corruption — Pre-existing Room Participants Ignored on Join
- **What**: `voiceStore.ts` does not register participants already present in the LiveKit room upon connection.
- **Where**: `client/src/stores/voiceStore.ts:150-153`; `client/src/lib/livekit.ts:313-335`
- **Why**: `RoomEvent.ParticipantConnected` only fires for new participants who join *after* the client. Pre-existing participants are omitted, resulting in an inaccurate roster and election failures.
- **Suggestion**: After `livekit.connect(...)` completes, inspect `livekit.getRoom().remoteParticipants` and invoke `callKeyManager.handleParticipantJoined` for each participant already connected.

### [Major] Finding 5: Resource Leak — E2EE Worker and Key Provider Never Terminated
- **What**: `livekitE2EEManager.cleanup()` is never called when leaving a call or on disconnect.
- **Where**: `client/src/stores/voiceStore.ts:6, 257-260, 312-320`; `client/src/lib/livekitE2EE.ts:118-125`
- **Why**: Spawns orphaned Web Workers in the browser on every voice session.
- **Suggestion**: Invoke `livekitE2EEManager.cleanup()` inside `callKeyManager.endCall()` or `voiceStore.ts` cleanup handlers.

### [Minor] Finding 6: Invalid UUID Fallback `'local_device'`
- **What**: `myDeviceId` defaults to `'local_device'` if `zerovc_device_id` is missing in `localStorage`.
- **Where**: `client/src/stores/voiceStore.ts:151`
- **Why**: `'local_device'` is not a valid UUID string and causes PostgreSQL syntax errors on UUID fields.
- **Suggestion**: Enforce valid UUID generation via `crypto.randomUUID()` if missing, or require active E2EE device registration before joining E2EE rooms.

---

## 4. Verified Claims

| Claim | Verification Method | Status |
|---|---|---|
| `test:livekit-m4` passes 26/26 | `npm run test:livekit-m4 --prefix client` | PASS (in-memory unit tests pass, but live wiring broken) |
| `test:livekit-gate` passes 23/23 | `npm run test:livekit-gate --prefix client` | PASS |
| `test:e2ee-spike` passes 27/27 | `npm run test:e2ee-spike --prefix client` | PASS |
| Client frontend compiles cleanly | `npm run build --prefix client` | PASS (TypeScript clean, Vite build bundled) |
| Backend compiles cleanly | `cd backend && go build ./...` | PASS |
| Anti-fallback gate blocks plaintext | `checkCallEligibility({ isE2EERoom: true, e2eeSupported: false })` | PASS |
| Ephemeral zeroization logic | `zeroKey` overwrites buffer with zeros | PASS |

---

## 5. Coverage Gaps & Unverified Items

- **End-to-End LiveKit SFrame Multi-Peer Audio Stream Decryption**: Unable to verify live audio/video packet decryption across multiple physical browser nodes because `call_key` distribution is currently broken by the User ID / Device ID mismatch and unencrypted Olm transport gap.
- **Backend Handler Test Coverage**: 0% real test coverage for `JoinVoice`, `InviteCall`, and `AcceptCall` in `backend/internal/handlers/e2ee_m4_test.go` due to facade test implementations.

---

## 6. Caveats

- No caveats. The code paths and database schemas were directly inspected and verified against the implementation and tests.

---

## 7. Conclusion

Milestone M4 implementation **FAILS** certification.
Explicit Verdict: **REQUEST_CHANGES**

**Mandatory Remediation Steps**:
1. Remove all facade tests in `backend/internal/handlers/e2ee_m4_test.go` and replace them with genuine tests invoking the handlers (`JoinVoice`, `InviteCall`, `AcceptCall`).
2. Pass `device_id` during room join/call accept and inject it into the LiveKit participant metadata so that `CallKeyManager` operates strictly on actual device UUIDs.
3. Encrypt the 256-bit symmetric call key with 1:1 Olm sessions (`olmSessionManager.encryptToDeviceMessage`) before transmitting over `e2ee_to_device`.
4. Register pre-existing room participants in `voiceStore.ts` upon initial connection.
5. Invoke `livekitE2EEManager.cleanup()` in `callKeyManager.endCall()`.

---

## 8. Verification Method

To verify these findings:
1. Inspect `backend/internal/handlers/e2ee_m4_test.go:98-150` to confirm that tests only marshal/unmarshal local map literals without invoking any handler.
2. Inspect `client/src/stores/voiceStore.ts:251-256` and note that `participant.identity` (User ID) is fed to `CallKeyManager`, which sends it as `recipient_device_id` to `e2ee_to_device` (where DB schema enforces `REFERENCES e2ee_devices(id)`).
3. Inspect `client/src/crypto/callKeys.ts:329-335` to confirm that `key: keyB64` is stored in cleartext in the to-device payload.
