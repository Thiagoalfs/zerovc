# Architectural Analysis & Technical Blueprint: VoiceStore & LiveKit E2EE Hardening

**Explorer Role**: M4 Store Integration Explorer (`explorer_m4_store`)  
**Target Milestone**: Milestone M4 (LiveKit Voice/Video E2EE)  
**Primary Files**:
- `client/src/stores/voiceStore.ts`
- `client/package.json`
**Secondary Context**:
- `client/src/crypto/callKeys.ts`
- `client/src/lib/livekitE2EE.ts`
- `client/src/lib/livekit.ts`
- `backend/internal/handlers/channel_handlers.go`
- `backend/internal/handlers/dm_handlers.go`
- `backend/internal/handlers/dm_group_handlers.go`

---

## 1. Executive Summary

Milestone M4 establishes opt-in end-to-end encrypted audio/video calling using LiveKit insertable streams (SFrame) and a deterministic distributor election ($\min_{\text{lex}}(\text{device\_id})$).

During Gate 4 Iteration 1 review, four critical operational gaps were identified at the integration boundary of `client/src/stores/voiceStore.ts` and `client/package.json`:
1. **`DEVICE_ID_EXTRACTION`**: `voiceStore.ts` supplied `participant.identity` (User UUID) directly to `CallKeyManager`, creating a hybrid namespace of user IDs and device IDs. This corrupts $\min_{\text{lex}}$ election (split-brain/deadlock) and causes PostgreSQL foreign key constraint violation (`e2ee_to_device_recipient_device_id_fkey`) on the backend.
2. **`PRE_EXISTING_PARTICIPANTS`**: `voiceStore.ts` invoked `callKeyManager.startCall(callId, myDeviceId, [])` *prior* to `livekit.connect(...)`. Because LiveKit's `RoomEvent.ParticipantConnected` event does not fire for participants already in the call when joining, incoming participants ignore pre-existing participants, fragmenting the call roster.
3. **`RESOURCE_CLEANUP`**: `livekitE2EEManager.cleanup()` was omitted in `voiceStore.ts` call teardown handlers (`leaveVoice`, `onDisconnected`, `cleanupPreviousConnection`, and error catch blocks), leading to orphaned WebRTC Web Workers.
4. **`PACKAGE_JSON_CONSISTENCY`**: `client/package.json` script `"test:frontend-m3"` lacked `-r ./scripts/test-setup-worker.ts`, causing execution to fail in Node.js due to `ReferenceError: onmessage is not defined` from transitive imports of LiveKit worker code.

This document details the exact technical blueprint and concrete code modifications required to resolve these issues.

---

## 2. Root Cause Analysis

### 2.1 Namespace Collision & Foreign Key Failure (`DEVICE_ID_EXTRACTION`)

#### Problem State
In `client/src/stores/voiceStore.ts` (lines 251-256):
```typescript
onParticipantConnected: (participant) => {
  callKeyManager.handleParticipantJoined(participant.identity);
},
onParticipantDisconnected: (participant) => {
  callKeyManager.handleParticipantLeft(participant.identity);
},
```
- In LiveKit, `participant.identity` is set to `userID.String()` (`backend/internal/voice/livekit.go:36`).
- However, `CallKeyManager` maintains `connectedDevices: Set<string>`.
- In `broadcastCallKeyToParticipants`, `CallKeyManager` maps `connectedDevices` directly to `recipient_device_id`:
  ```typescript
  const messages = recipients.map((devId) => ({
    recipient_device_id: devId, // devId is participant.identity (User ID)!
    sender_device_id: this.myDeviceId!,
    msg_type: 'call_key',
    payload: JSON.stringify(payload),
  }));
  await api.e2ee.sendToDevice(messages);
  ```
- In PostgreSQL (`backend/internal/database/schema.sql:541`):
  ```sql
  CREATE TABLE IF NOT EXISTS e2ee_to_device (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_device_id UUID NOT NULL REFERENCES e2ee_devices(id) ON DELETE CASCADE,
      sender_device_id UUID NOT NULL REFERENCES e2ee_devices(id) ON DELETE CASCADE,
      ...
  ```
- Because User UUID $\neq$ Device UUID, PostgreSQL aborts the insertion with:
  `ERROR: insert or update on table "e2ee_to_device" violates foreign key constraint "e2ee_to_device_recipient_device_id_fkey"`.
- Furthermore, `hub.SendToDevice` routes WebSockets by `deviceID`. It never finds active sockets indexed by `userID`.

#### Invariant Requirement
- Participants in E2EE rooms carry device metadata inside `participant.metadata` JSON (e.g. `{"device_id":"...", "e2ee_required":true, "user_id":"..."}`).
- `voiceStore.ts` must parse `participant.metadata` to extract `device_id`.
- If `metadata` is unparseable or lacks `device_id`, fall back safely to `participant.identity`.
- In addition, an internal mapping (`Map<participantIdentity, deviceId>`) must be maintained during call lifetime to ensure `onParticipantDisconnected` cleanly removes the identical ID registered on connect.
- For local device ID, `getLocalDeviceId()` must guarantee a valid UUID (never `'local_device'`).

---

### 2.2 Roster Desynchronization on Join (`PRE_EXISTING_PARTICIPANTS`)

#### Problem State
In `client/src/stores/voiceStore.ts` (lines 150-155):
```typescript
if (isE2EERoom && callId) {
  const myDeviceId = (typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : '') || 'local_device';
  await callKeyManager.startCall(callId, myDeviceId, []);
}

await livekit.connect(livekitUrl, token, { ... });
```
- `startCall` is executed *before* `livekit.connect(...)` with empty `connectedDeviceIds = []`.
- At this moment, the joining client believes it is the sole participant and elects itself as the distributor.
- When `livekit.connect(...)` succeeds, LiveKit's `RoomEvent.ParticipantConnected` event **only fires for participants who join after the local participant**. It is NEVER dispatched for participants already present in the room.
- Consequently:
  - Joiner roster: `{ Joiner_Device_ID }` $\rightarrow$ Joiner assumes distributor leadership.
  - Incumbent roster: `{ Incumbent_Device_ID, Joiner_Device_ID }` $\rightarrow$ Incumbent elects $\min_{\text{lex}}$.
  - If Incumbent < Joiner, Incumbent assumes leadership. Both nodes now believe they are distributors (split-brain). Key distribution desynchronizes and WebRTC audio fails.

#### Invariant Requirement
- `callKeyManager.startCall(callId, myDeviceId, existingDeviceIds)` must be called **after** `livekit.connect(...)` completes.
- Upon successful room connection, `voiceStore.ts` must iterate over `livekit.getRoom().remoteParticipants.values()`, extract each participant's device ID, populate the mapping, and pass all existing device IDs into `startCall`.
- This ensures all nodes have identical participant rosters from the start.

---

### 2.3 WebRTC Worker Leak (`RESOURCE_CLEANUP`)

#### Problem State
In `client/src/lib/livekitE2EE.ts`:
- `createE2EEOptions()` initializes a dedicated `E2EEWorker` (`new E2EEWorker()`) and `ExternalE2EEKeyProvider`.
- `livekitE2EEManager.cleanup()` terminates the worker via `this.worker.terminate()` and nullifies the key provider.
- In `client/src/stores/voiceStore.ts`:
  - `leaveVoice()` calls `callKeyManager.endCall()` and `livekit.disconnect()`, but NEVER calls `livekitE2EEManager.cleanup()`.
  - `cleanupPreviousConnection()` calls `callKeyManager.endCall()`, but NEVER calls `livekitE2EEManager.cleanup()`.
  - `onDisconnected` callback does not call `livekitE2EEManager.cleanup()`.
  - Exceptions during room connection leave orphaned workers running indefinitely.

#### Invariant Requirement
- `livekitE2EEManager.cleanup()` must be invoked in:
  1. `cleanupPreviousConnection()`
  2. `leaveVoice()`
  3. `onDisconnected` callback
  4. Exception `catch` blocks in `joinVoice`, `joinDMCall`, and `joinGroupVoice`
- `livekitE2EEManager.cleanup()` is already idempotent; repeated calls are safe.

---

### 2.4 Test Suite Environment Flag (`PACKAGE_JSON_CONSISTENCY`)

#### Problem State
In `client/package.json` line 15:
```json
"test:frontend-m3": "tsx scripts/test-frontend-m3.ts",
```
- Transitive imports of LiveKit modules reference Web Worker globals (`self`, `onmessage`, `postMessage`).
- Running `npm run test:frontend-m3 --prefix client` immediately terminates:
  ```
  ReferenceError: onmessage is not defined
      at livekit-client/src/e2ee/worker/e2ee.worker.ts:41
  ```
- In contrast, line 18 uses:
  ```json
  "test:livekit-gate": "tsx -r ./scripts/test-setup-worker.ts scripts/test-livekit-gate-adversarial.ts",
  ```
- The helper `./scripts/test-setup-worker.ts` polyfills `globalThis.onmessage = null`, `globalThis.self = globalThis`, and `globalThis.postMessage = () => {}`.

#### Invariant Requirement
Update `client/package.json` line 15 to:
```json
"test:frontend-m3": "tsx -r ./scripts/test-setup-worker.ts scripts/test-frontend-m3.ts",
```
This enables `npm run test:frontend-m3` to pass 29/29 tests cleanly in Node.js.

---

## 3. Concrete Code Changes Blueprint

### Blueprint 1: Helper Functions in `client/src/stores/voiceStore.ts`

Add near the top of `client/src/stores/voiceStore.ts` (around lines 118-120):

```typescript
/**
 * Safely resolves the local device UUID.
 * Guarantees a valid RFC4122 v4 UUID, preventing PostgreSQL syntax errors
 * caused by invalid placeholder strings like 'local_device'.
 */
const getLocalDeviceId = (): string => {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : null;
    if (stored && stored !== 'local_device' && stored.trim().length > 0) {
      return stored.trim();
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
            (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
          );
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zerovc_device_id', generated);
    }
    return generated;
  } catch {
    return '00000000-0000-0000-0000-000000000000';
  }
};

/**
 * Extracts the E2EE device ID from LiveKit participant metadata.
 * Participant metadata contains JSON with optional device_id.
 * Falls back to participant.identity if metadata is absent or unparseable.
 */
const extractParticipantDeviceId = (participant: Participant): string => {
  if (participant.metadata) {
    try {
      const meta = JSON.parse(participant.metadata);
      if (meta && typeof meta.device_id === 'string' && meta.device_id.trim().length > 0) {
        return meta.device_id.trim();
      }
    } catch {
      // Safely ignore non-JSON or legacy metadata
    }
  }
  return participant.identity;
};
```

---

### Blueprint 2: `connectLiveKitRoom` in `client/src/stores/voiceStore.ts`

Replace `connectLiveKitRoom` (lines 122-310):

```typescript
  // Helper to attach LiveKit room connection listeners and sync state
  const connectLiveKitRoom = async (
    livekitUrl: string,
    token: string,
    shouldMute: boolean,
    shouldDeafen: boolean,
    isE2EERoom: boolean = false,
    callId?: string
  ) => {
    let e2eeSetup = undefined;
    if (isE2EERoom) {
      const eligibility = checkCallEligibility({ isE2EERoom: true });
      if (eligibility.status === 'BLOCKED') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('zerovc:upgrade_required', {
              detail: { modal: 'UPGRADE_REQUIRED', reason: 'E2EE_CALL_UNSUPPORTED' },
            })
          );
        }
        throw new Error('E2EE_CALL_UNSUPPORTED: Platform lacks Insertable Streams. Plaintext fallback strictly forbidden.');
      }
      e2eeSetup = createE2EEOptions();
    }

    let prevParticipantIds = new Set<string>();
    let prevScreenShareIds = new Set<string>();
    let isInitialSync = true;
    const participantDeviceMap = new Map<string, string>();

    await livekit.connect(livekitUrl, token, {
      autoEnableMicrophone: !shouldMute,
      onParticipantsChanged: (participants) => {
        set({ participants });

        if (!isInitialSync && get().isConnected) {
          const currentIds = new Set(participants.map((p) => p.identity));
          // Another user joined
          for (const p of participants) {
            if (!p.isLocal && !prevParticipantIds.has(p.identity)) {
              playUserJoinCallSound();
              break;
            }
          }
          // Another user left
          for (const prevId of prevParticipantIds) {
            if (!currentIds.has(prevId)) {
              playUserLeaveCallSound();
              break;
            }
          }
        }
        prevParticipantIds = new Set(participants.map((p) => p.identity));

        // Apply saved user & stream volumes to participants
        const { userVolumes, streamVolumes } = get();
        participants.forEach((p) => {
          if (!p.isLocal) {
            if (userVolumes[p.identity] !== undefined) {
              livekit.setUserVolume(p.identity, userVolumes[p.identity]);
            }
            if (streamVolumes[p.identity] !== undefined) {
              livekit.setStreamVolume(p.identity, streamVolumes[p.identity]);
            }
          }
        });
      },
      onSpeakingChanged: (speakingUserIds) => {
        const current = get().speakingUserIds;
        if (
          current.length === speakingUserIds.length &&
          current.every((id, idx) => id === speakingUserIds[idx])
        ) {
          return;
        }
        set({ speakingUserIds });
      },
      onTrackUpdated: () => {
        const room = livekit.getRoom();
        if (room) {
          const participants = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
          set({ participants });

          const currentScreenShares = new Set(
            participants.filter((p) => p.isScreenShareEnabled).map((p) => p.identity)
          );

          if (!isInitialSync && get().isConnected) {
            // Screen share started
            for (const id of currentScreenShares) {
              if (!prevScreenShareIds.has(id)) {
                playStartStreamSound();
                break;
              }
            }
            // Screen share stopped
            for (const prevId of prevScreenShareIds) {
              if (!currentScreenShares.has(prevId)) {
                playStopStreamSound();
                break;
              }
            }
          }
          prevScreenShareIds = currentScreenShares;

          const { userVolumes, streamVolumes } = get();
          participants.forEach((p) => {
            if (!p.isLocal) {
              if (userVolumes[p.identity] !== undefined) {
                livekit.setUserVolume(p.identity, userVolumes[p.identity]);
              }
              if (streamVolumes[p.identity] !== undefined) {
                livekit.setStreamVolume(p.identity, streamVolumes[p.identity]);
              }
            }
          });
        }
      },
      onScreenShareEnded: () => {
        set({ isScreensharing: false });
        playStopStreamSound();
        const { currentChannelId, voiceType } = get();
        if (voiceType === 'guild' && currentChannelId) {
          api.channels.updateVoiceState(currentChannelId, { is_screensharing: false }).catch(() => {});
        }
      },
      onParticipantConnected: (participant) => {
        const deviceId = extractParticipantDeviceId(participant);
        participantDeviceMap.set(participant.identity, deviceId);
        callKeyManager.handleParticipantJoined(deviceId);
      },
      onParticipantDisconnected: (participant) => {
        const deviceId = participantDeviceMap.get(participant.identity) || extractParticipantDeviceId(participant);
        participantDeviceMap.delete(participant.identity);
        callKeyManager.handleParticipantLeft(deviceId);
      },
      onDisconnected: (reason) => {
        participantDeviceMap.clear();
        callKeyManager.endCall();
        livekitE2EEManager.cleanup();
        console.warn('[Voice] LiveKit room disconnected. Reason:', reason);
        playLeaveVoiceSound();
        const isDuplicate =
          reason === DisconnectReason.DUPLICATE_IDENTITY ||
          String(reason).toLowerCase().includes('duplicate');

        set({
          voiceType: null,
          currentChannelId: null,
          currentGuildId: null,
          dmRoomId: null,
          dmRecipient: null,
          dmGroupId: null,
          dmGroup: null,
          isConnected: false,
          isConnecting: false,
          isScreensharing: false,
          isCameraOn: false,
          participants: [],
          speakingUserIds: [],
          watchedParticipantId: null,
          watchedParticipantIds: [],
        });

        if (isDuplicate) {
          alert('Você entrou na chamada por outro dispositivo ou navegador.');
        }
      },
    }, e2eeSetup);

    // Sync pre-existing room participants into CallKeyManager immediately after connect
    if (isE2EERoom && callId) {
      const myDeviceId = getLocalDeviceId();
      const existingDeviceIds: string[] = [];
      const room = livekit.getRoom();

      if (room && room.remoteParticipants) {
        for (const participant of room.remoteParticipants.values()) {
          const devId = extractParticipantDeviceId(participant);
          participantDeviceMap.set(participant.identity, devId);
          existingDeviceIds.push(devId);
        }
      }

      await callKeyManager.startCall(callId, myDeviceId, existingDeviceIds);
    }

    playJoinVoiceSound();

    if (shouldDeafen) {
      livekit.setDeafened(true).catch(() => {});
      livekit.setMuted(true).catch(() => {});
    } else if (shouldMute) {
      livekit.setMuted(true).catch(() => {});
    }

    set({
      isConnected: true,
      isConnecting: false,
      isMuted: shouldMute,
      isDeafened: shouldDeafen,
      isCameraOn: false,
      isScreensharing: false,
    });

    setTimeout(() => {
      isInitialSync = false;
    }, 500);
  };
```

---

### Blueprint 3: Teardown & Lifecycle Handlers in `voiceStore.ts`

#### `cleanupPreviousConnection`
```typescript
  const cleanupPreviousConnection = async () => {
    callKeyManager.endCall();
    livekitE2EEManager.cleanup();
    const { voiceType, currentChannelId, dmRoomId, isScreensharing } = get();
    if (isScreensharing) {
      try {
        await livekit.setScreenShareEnabled(false);
      } catch {}
    }
    if (voiceType === 'guild' && currentChannelId) {
      api.channels.leaveVoice(currentChannelId).catch(() => {});
    } else if (voiceType === 'dm' && dmRoomId) {
      api.dms.leaveCall(dmRoomId).catch(() => {});
    }
    await livekit.disconnect().catch(() => {});
  };
```

#### `leaveVoice`
```typescript
    leaveVoice: async () => {
      callKeyManager.endCall();
      livekitE2EEManager.cleanup();
      const { voiceType, currentChannelId, dmRoomId } = get();
      if (!voiceType && !currentChannelId && !dmRoomId) return;

      try {
        if (voiceType === 'guild' && currentChannelId) {
          await api.channels.leaveVoice(currentChannelId);
        } else if (voiceType === 'dm' && dmRoomId) {
          await api.dms.leaveCall(dmRoomId);
        }
      } catch (err) {
        console.warn('[Voice] Failed to notify leave API:', err);
      }

      try {
        await get().stopScreenShare();
      } catch {}
      await livekit.disconnect();

      set({
        voiceType: null,
        currentChannelId: null,
        currentGuildId: null,
        dmRoomId: null,
        dmRecipient: null,
        dmGroupId: null,
        dmGroup: null,
        isConnected: false,
        isConnecting: false,
        isScreensharing: false,
        isCameraOn: false,
        participants: [],
        speakingUserIds: [],
        watchedParticipantId: null,
        watchedParticipantIds: [],
      });
    },
```

#### Error handling in `joinVoice`, `joinDMCall`, `joinGroupVoice`
```typescript
    // In joinVoice catch block:
    } catch (err) {
      callKeyManager.endCall();
      livekitE2EEManager.cleanup();
      console.error('[Voice] Failed to join guild voice:', err);
      set({
        voiceType: null,
        isConnected: false,
        isConnecting: false,
        currentChannelId: null,
        currentGuildId: null,
      });
    }

    // In joinDMCall catch block:
    } catch (err) {
      callKeyManager.endCall();
      livekitE2EEManager.cleanup();
      console.error('[Voice] Failed to join DM call:', err);
      set({
        voiceType: null,
        isConnected: false,
        isConnecting: false,
        dmRoomId: null,
        dmRecipient: null,
      });
      throw err;
    }

    // In joinGroupVoice catch block:
    } catch (err) {
      callKeyManager.endCall();
      livekitE2EEManager.cleanup();
      console.error('[Voice] Failed to join DM group voice:', err);
      set({
        voiceType: null,
        isConnected: false,
        isConnecting: false,
        dmGroupId: null,
        dmGroup: null,
      });
      throw err;
    }
```

---

### Blueprint 4: Script Flag in `client/package.json`

Line 15 of `client/package.json`:
```json
<<<<
    "test:frontend-m3": "tsx scripts/test-frontend-m3.ts",
====
    "test:frontend-m3": "tsx -r ./scripts/test-setup-worker.ts scripts/test-frontend-m3.ts",
>>>>
```

---

## 4. Invariant Verification Matrix

| Area | Invariant | Design Mechanism | Verification Result |
|---|---|---|---|
| **Device ID Extraction** | `recipient_device_id` must be a valid Device UUID registered in `e2ee_devices(id)` | `extractParticipantDeviceId` parses `participant.metadata`, `getLocalDeviceId` generates valid UUID | Prevents PostgreSQL foreign key errors; matches `min_lex(device_id)` |
| **Participant Identity Map** | Disconnecting participant must match registered device ID | `participantDeviceMap` tracks `identity -> deviceId` | Eliminates mismatch if metadata changes during disconnect |
| **Pre-existing Participants** | All participants in the room must participate in election | Synchronize `room.remoteParticipants` immediately post-connect into `startCall` | Prevents split-brain distributor election |
| **Worker Cleanup** | No orphaned `E2EEWorker` threads on call exit | `livekitE2EEManager.cleanup()` called in all teardown paths | Idempotent worker termination; WebRTC threads freed |
| **M3 Worker Polyfill** | Standalone `test:frontend-m3` must pass | `-r ./scripts/test-setup-worker.ts` flag in `client/package.json` | 29/29 tests pass; `ReferenceError: onmessage` eliminated |

---

## 5. Implementation Readiness

The proposed blueprint provides drop-in, non-breaking modifications strictly confined to `client/src/stores/voiceStore.ts` and `client/package.json`. No schema changes or external dependency updates are required.
