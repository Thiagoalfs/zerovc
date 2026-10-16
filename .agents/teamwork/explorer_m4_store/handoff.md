# Handoff Report: Explorer M4 Store (VoiceStore & LiveKit Integration Hardening)

**Role**: M4 Store Integration Explorer (`explorer_m4_store`)  
**Mission**: Formulate the exact technical blueprint for `client/src/stores/voiceStore.ts` and `client/package.json`.  
**Artifact Path**: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store\handoff.md`  
**Analysis Reference**: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store\analysis.md`  

---

## 1. Observation

Direct, verifiable observations across code files, test runs, and database constraints:

### Obs 1: Device ID vs User ID Collision in `voiceStore.ts`
- **File**: `client/src/stores/voiceStore.ts` (lines 251-256):
  ```typescript
  251:       onParticipantConnected: (participant) => {
  252:         callKeyManager.handleParticipantJoined(participant.identity);
  253:       },
  254:       onParticipantDisconnected: (participant) => {
  255:         callKeyManager.handleParticipantLeft(participant.identity);
  256:       },
  ```
  `participant.identity` is the LiveKit user UUID (`SetIdentity(userID.String())` in `backend/internal/voice/livekit.go:36`), NOT a device ID.
- **File**: `client/src/crypto/callKeys.ts` (lines 326-344):
  ```typescript
  339:     const messages = recipients.map((devId) => ({
  340:       recipient_device_id: devId, // devId is participant.identity (User ID)!
  341:       sender_device_id: this.myDeviceId!,
  342:       msg_type: 'call_key',
  343:       payload: JSON.stringify(payload),
  344:     }));
  345:     await api.e2ee.sendToDevice(messages);
  ```
- **File**: `backend/internal/database/schema.sql` (lines 541-542):
  ```sql
  541:       recipient_device_id UUID NOT NULL REFERENCES e2ee_devices(id) ON DELETE CASCADE,
  542:       sender_device_id UUID NOT NULL REFERENCES e2ee_devices(id) ON DELETE CASCADE,
  ```
  Passing a User UUID in `recipient_device_id` violates the foreign key constraint `e2ee_to_device_recipient_device_id_fkey` in PostgreSQL.

### Obs 2: Pre-existing Room Participants Ignored on Connection
- **File**: `client/src/stores/voiceStore.ts` (lines 150-155):
  ```typescript
  150:     if (isE2EERoom && callId) {
  151:       const myDeviceId = (typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : '') || 'local_device';
  152:       await callKeyManager.startCall(callId, myDeviceId, []);
  153:     }
  154: 
  155:     await livekit.connect(livekitUrl, token, { ...
  ```
  `callKeyManager.startCall` is invoked *before* `livekit.connect(...)` with empty `[]`.
- In LiveKit JS SDK (`RoomEvent.ParticipantConnected`), the event ONLY triggers when *new* participants join the room after the local participant has already connected. It NEVER fires for peers already in the room. Consequently, the joining node considers itself alone, elects itself distributor, and split-brain election occurs.

### Obs 3: WebRTC Worker Leak on Call Disconnect
- **File**: `client/src/stores/voiceStore.ts` (lines 257-260, 312-326, 594-631):
  - `leaveVoice` calls `callKeyManager.endCall()` and `livekit.disconnect()`, but NEVER calls `livekitE2EEManager.cleanup()`.
  - `cleanupPreviousConnection` calls `callKeyManager.endCall()`, but NEVER calls `livekitE2EEManager.cleanup()`.
  - `onDisconnected` callback does not invoke `livekitE2EEManager.cleanup()`.
  - In `client/src/lib/livekitE2EE.ts` (lines 118-125), `livekitE2EEManager.cleanup()` is the explicit method that calls `this.worker.terminate()`. Omitting this leaves orphaned worker threads.

### Obs 4: Missing Polyfill Preload Flag in `client/package.json`
- **File**: `client/package.json` (line 15):
  ```json
  15:     "test:frontend-m3": "tsx scripts/test-frontend-m3.ts",
  ```
- Running `npm run test:frontend-m3 --prefix client` produced:
  ```
  ReferenceError: onmessage is not defined
      at livekit-client/src/e2ee/worker/e2ee.worker.ts:41
  ```
  Exit code: 1.
- Running `npx tsx -r ./scripts/test-setup-worker.ts scripts/test-frontend-m3.ts` inside `client/` produced:
  ```
  Total: 29 | Passed: 29 | Failed: 0
  ALL TESTS PASSED (100% SUCCESS RATE)
  ```
  Exit code: 0.

---

## 2. Logic Chain

1. **Namespace Collision & Foreign Key Failure**:
   - `voiceStore.ts` wires LiveKit events directly into `CallKeyManager`.
   - By feeding `participant.identity` into `callKeyManager.handleParticipantJoined`, `CallKeyManager` mixes User IDs with `myDeviceId` (Device ID).
   - In PostgreSQL, `e2ee_to_device.recipient_device_id` enforces `FOREIGN KEY REFERENCES e2ee_devices(id)`. Because User IDs do not exist in `e2ee_devices`, PostgreSQL rejects the INSERT.
   - **Remedy**: `voiceStore.ts` must parse `participant.metadata` to extract `device_id`, fall back to `participant.identity`, and track this mapping via `participantDeviceMap`. In addition, `getLocalDeviceId()` must guarantee a valid UUID (never `'local_device'`).

2. **Pre-existing Participants Roster Fragmentation**:
   - Calling `startCall(callId, myDeviceId, [])` before `livekit.connect(...)` means `existingDeviceIds` is always empty.
   - When joining an existing room, `RoomEvent.ParticipantConnected` does not fire for incumbent participants.
   - The joiner never learns of pre-existing participants, while incumbents learn of the joiner.
   - This creates conflicting distributor elections ($\min_{\text{lex}}$ computed on different sets).
   - **Remedy**: Move `callKeyManager.startCall(callId, myDeviceId, existingDeviceIds)` to execute **immediately after** `await livekit.connect(...)`, extracting all participants from `room.remoteParticipants.values()`.

3. **Web Worker Lifecycle & Memory Leak**:
   - `createE2EEOptions()` spawns a dedicated worker (`new E2EEWorker()`).
   - If `livekitE2EEManager.cleanup()` is not called upon disconnect or error, the worker thread continues running in the background.
   - **Remedy**: Call `livekitE2EEManager.cleanup()` in `cleanupPreviousConnection()`, `leaveVoice()`, `onDisconnected`, and the error handlers for room joins.

4. **Script Consistency in `client/package.json`**:
   - Transitive imports of LiveKit modules reference Worker globals in Node.js test runs.
   - Line 18 already uses `-r ./scripts/test-setup-worker.ts`.
   - Adding `-r ./scripts/test-setup-worker.ts` to line 15 resolves the runtime failure and allows 29/29 tests to pass.

---

## 3. Caveats

- **Backend Metadata Injection**: The extraction helper `extractParticipantDeviceId` is backward-compatible. If backend token minting does not include `device_id` in metadata (e.g. in test stubs or older handlers), it safely falls back to `participant.identity`.
- **Worker Polyfill**: Preloading `./scripts/test-setup-worker.ts` is only needed in Node.js/CLI test runs (`tsx`), not in the browser bundle where Web Workers and `window.self` are native.

---

## 4. Conclusion

The store integration blueprint is fully specified and ready for implementation.
The changes require:
1. Adding `getLocalDeviceId()` and `extractParticipantDeviceId(participant: Participant)` helpers to `client/src/stores/voiceStore.ts`.
2. Tracking `participantDeviceMap` inside `connectLiveKitRoom`.
3. Moving `callKeyManager.startCall` to run immediately after `await livekit.connect(...)` using `room.remoteParticipants`.
4. Adding `livekitE2EEManager.cleanup()` across all disconnect and teardown pathways in `voiceStore.ts`.
5. Updating `"test:frontend-m3"` in `client/package.json` with `-r ./scripts/test-setup-worker.ts`.

---

## 5. Verification Method

### 1. Verify `client/package.json` Script Fix
```powershell
npm run test:frontend-m3 --prefix client
```
**Expected Result**: Exit code 0, 29/29 tests PASS (100% SUCCESS RATE).

### 2. Verify M4 Certification Suite
```powershell
npm run test:livekit-m4 --prefix client
```
**Expected Result**: Exit code 0, 26/26 tests PASS.

### 3. Verify LiveKit Gate Suite
```powershell
npm run test:livekit-gate --prefix client
```
**Expected Result**: Exit code 0, 23/23 tests PASS.

### 4. Verify Frontend Compilation & Build
```powershell
npm run build --prefix client
```
**Expected Result**: Exit code 0, 0 TypeScript errors, bundle completed.

### 5. Inspect Modified Code
- Verify that `extractParticipantDeviceId` handles missing, empty, or valid JSON `metadata`.
- Verify that `callKeyManager.startCall` receives `existingDeviceIds` extracted from `room.remoteParticipants`.
- Verify that `livekitE2EEManager.cleanup()` is present in `leaveVoice`, `cleanupPreviousConnection`, and `onDisconnected`.
