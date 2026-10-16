# Survey Report: LiveKit Voice/Video & Multi-Platform Clients (Explorer Survey 3)

## 1. Observation

### 1.1 Existing LiveKit Client Integration
- **SDK Version & Packages:**
  - `client/package.json:33`: `"livekit-client": "^2.1.2"`
  - `backend/go.mod:12`: `github.com/livekit/protocol v1.14.0`
- **Client Architecture & Connection Management:**
  - `client/src/lib/livekit.ts:130`: Singleton class `LiveKitManager` holds `private room: Room | null = null`.
  - `client/src/lib/livekit.ts:245-264`: `Room` initialization inside `connect()`:
    ```typescript
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000,
        channelCount: 1,
      },
      publishDefaults: {
        audioPreset: AudioPresets.speech,
        dtx: true,
        red: true,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });
    ```
  - `client/src/lib/livekit.ts:286-450`: Event listeners attached to `room`:
    - `RoomEvent.Connected`: Resumes audio context and calls `room.startAudio()`.
    - `RoomEvent.AudioPlaybackStatusChanged`: Calls `room.startAudio()` if playback is blocked.
    - `RoomEvent.ParticipantConnected` & `ParticipantDisconnected`: Emits participant list updates.
    - `RoomEvent.ActiveSpeakersChanged`: Filters speakers with unmuted microphone tracks.
    - `RoomEvent.TrackSubscribed`: Differentiates microphone audio from screen share audio, creates audio DOM elements, attaches audio elements, applies volume from `userVolumes` or `streamVolumes`, and manages audio routing.
    - `RoomEvent.TrackUnsubscribed`, `TrackMuted`, `TrackUnmuted`, `TrackPublished`, `TrackUnpublished`, `LocalTrackPublished`, `LocalTrackUnpublished`.
    - `RoomEvent.Disconnected`: Cleans up audio elements, clears active streams, invokes callback.
  - `client/src/lib/livekit.ts:452-465`: Connection invocation:
    ```typescript
    await room.connect(url, token, {
      autoSubscribe: true,
      maxRetries: 3,
      peerConnectionTimeout: 30000,
      websocketTimeout: 20000,
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 2,
        iceTransportPolicy: 'all',
      },
    });
    ```
- **Track & Media Handling:**
  - `client/src/lib/livekit.ts:478-485`: Auto-enables microphone via `room.localParticipant.setMicrophoneEnabled(...)`.
  - `client/src/lib/livekit.ts:704-794`: In Electron, screenshare captures video via `navigator.mediaDevices.getUserMedia` with `chromeMediaSource: 'desktop'` and native system/process audio via `processAudioBridge.startCapture(resolvedSourceId)`.
  - `client/src/lib/livekit.ts:814-889`: In standard Web browsers, screenshare falls back to W3C `room.localParticipant.setScreenShareEnabled(true, ...)`.
  - `client/src/lib/livekit.ts:913-918`: Camera track management via `room.localParticipant.setCameraEnabled(enabled, ...)`.
- **Store & UI Lifecycle:**
  - `client/src/stores/callStore.ts`: Manages 1:1 DM call signaling state machine (`idle` -> `calling` -> `ringing` -> `connected` -> `ended`), triggering `api.dms.inviteCall(roomId)`, `acceptCall`, `rejectCall`, and `leaveCall`. Calls `useVoiceStore.getState().joinDMCall(...)`.
  - `client/src/stores/voiceStore.ts:49-52`: Supports three voice contexts: `joinVoice(channelId)` (guild voice), `joinDMCall(roomId, recipient, token, livekitUrl)` (DM call), and `joinGroupVoice(groupId)` (DM group call).
  - `client/src/components/DM/ActiveCallOverlay.tsx` & `ParticipantCard.tsx`: Display video tracks via `<video ref={...} />` and bind `track.attach(videoRef.current)` on participant track publications.
- **Backend Token Generation:**
  - `backend/internal/voice/livekit.go:25-47`: Generates join tokens:
    ```go
    at := auth.NewAccessToken(s.apiKey, s.apiSecret)
    grant := &auth.VideoGrant{
        RoomJoin:       true,
        Room:           roomName,
        CanPublish:     &canPublish,
        CanSubscribe:   &canPublish,
        CanPublishData: &canPublish,
    }
    at.AddGrant(grant).
        SetIdentity(userID.String()).
        SetName(username).
        SetMetadata(metadata).
        SetValidFor(24 * time.Hour)
    ```
  - `backend/internal/handlers/dm_handlers.go:756`: Room name convention: `"dm-" + roomID.String()`.
  - `backend/internal/handlers/dm_group_handlers.go:763`: Room name convention: `"dmgroup-" + groupID.String()`.
  - `backend/internal/handlers/channel_handlers.go:589`: Room name convention: `channelID.String()`.

---

### 1.2 Integration Points for LiveKit E2EE
- **LiveKit Client Native E2EE Assets:**
  - `client/node_modules/livekit-client/dist/livekit-client.e2ee.worker.js`: Self-contained UMD worker script bundled with the SDK containing WebRTC SFrame frame transformers, AES-GCM (128/256-bit), and key ratcheting.
  - `client/node_modules/livekit-client/src/e2ee/KeyProvider.ts:40-52`:
    ```typescript
    export class ExternalE2EEKeyProvider extends BaseKeyProvider {
      ratchetInterval: number | undefined;
      constructor(options?: Partial<Omit<KeyProviderOptions, 'sharedKey'>>);
      setKey(key: string | ArrayBuffer): Promise<void>;
    }
    ```
  - `client/node_modules/livekit-client/src/options.ts:100`:
    ```typescript
    encryption?: E2EEOptions; // or e2ee?: E2EEOptions
    ```
  - `client/node_modules/livekit-client/src/e2ee/types.ts:180-183`:
    ```typescript
    export type E2EEManagerOptions = {
      keyProvider: BaseKeyProvider;
      worker: Worker;
    };
    ```
- **Insertable Streams & Support Detection:**
  - `client/node_modules/livekit-client/src/e2ee/utils.ts:6-22`:
    ```typescript
    export function isE2EESupported() {
      return isInsertableStreamSupported() || isScriptTransformSupported();
    }
    export function isScriptTransformSupported() {
      return typeof window !== 'undefined' && typeof window.RTCRtpScriptTransform !== 'undefined';
    }
    export function isInsertableStreamSupported() {
      return (
        typeof window !== 'undefined' &&
        typeof window.RTCRtpSender !== 'undefined' &&
        typeof window.RTCRtpSender.prototype.createEncodedStreams !== 'undefined'
      );
    }
    ```

---

### 1.3 Electron Packaging & WASAPI Audio Bridge
- **Electron Version & Base:**
  - `client/package.json:31`: `"electron": "^30.0.1"` (Chromium 124, V8 12.4, Node 20.9.0). Full native support for Insertable Streams, TransformStream, and AudioWorklet.
  - `client/package.json:44-110`: `electron-builder` configuration targeting NSIS 64-bit with maximum compression, `asar: true`, unpack of native helper binaries (`asarUnpack: ["**/bin/*"]`).
- **Main / Preload / Renderer Architecture:**
  - `client/electron/preload.ts`: Exposes `electronAPI` via `contextBridge.exposeInMainWorld('electronAPI', ...)`:
    - `startProcessAudioCapture(options)` -> `ipcRenderer.invoke('start-process-audio-capture', options)`
    - `stopProcessAudioCapture()` -> `ipcRenderer.invoke('stop-process-audio-capture')`
    - `onProcessAudioChunk(callback)` -> listens to `'process-audio-chunk'` IPC event.
    - `onProcessAudioFallback(callback)` -> listens to `'process-audio-fallback'` IPC event.
    - `getGpuInfo()` -> hardware acceleration details.
    - `getScreenSources()` -> desktopCapturer thumbnails and IDs.
- **WASAPI Audio Capture Bridge & Resilient Fallback:**
  - `client/electron/main.ts:1105-1219`: Spawns `zerovc-audio-capture.exe` with `--zerovc-pid <pid> --mode include/exclude`.
  - `client/electron/main.ts:1146-1155`: Receives raw Float32 chunks from child stdout and emits them to renderer.
  - `client/electron/main.ts:1187-1194`: Detects stream startup from stderr:
    ```typescript
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('Capture Started') || text.includes('Started capture loop')) {
        started = true;
        finish({ ok: true });
      }
    });
    ```
    Confirms compliance with user rule: Fallback messages like `FULL SCREEN DEFAULT ENDPOINT LOOPBACK` do NOT terminate the child process; initialization requires seeing `Capture Started` or `Started capture loop`.
  - `client/src/lib/processAudioBridge.ts`: Web Audio `AudioWorkletNode` (`PCMPlayerProcessor`) buffers interleaved 48kHz stereo Float32 chunks and connects to `destinationNode = audioContext.createMediaStreamDestination()`.
  - The resulting `destinationNode.stream.getAudioTracks()[0]` is a standard `MediaStreamTrack` published to LiveKit. LiveKit's `E2EEManager` hooks into the underlying `RTCRtpSender` and encrypts this audio track via WebRTC insertable streams without any special bridging conflicts.

---

### 1.4 Android Capacitor Setup & WebView Compatibility
- **Capacitor Configuration & Versions:**
  - `client/package.json:16-17`: `"@capacitor/android": "^8.5.2"`, `"@capacitor/core": "^8.5.2"`, `"@capacitor/cli": "^8.5.2"`.
  - `client/capacitor.config.ts`:
    ```typescript
    const config: CapacitorConfig = {
      appId: 'xyz.safiroko.zerovc',
      appName: 'ZeroVC',
      webDir: 'dist',
      server: {
        url: 'https://zerovc.safiroko.xyz',
        cleartext: true,
        androidScheme: 'https',
      },
      android: {
        allowMixedContent: true,
      },
    };
    ```
  - `client/android/variables.gradle`:
    - `minSdkVersion = 24` (Android 7.0 Nougat)
    - `compileSdkVersion = 36`
    - `targetSdkVersion = 36`
    - `androidxWebkitVersion = '1.14.0'`
  - `client/android/app/build.gradle:19-26`:
    ```groovy
    buildTypes {
        release {
            signingConfig signingConfigs.debug
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    ```
- **Android WebView Support Matrix & `isE2EESupported()`:**
  - WebRTC Insertable Streams (`createEncodedStreams`) was added in Chrome / Chromium 86.
  - `RTCRtpScriptTransform` was added in Chrome / Chromium 105.
  - Android System WebView is updated independently via Google Play on modern Android devices. However, on older or un-updated devices (Chrome < 86), `isE2EESupported()` returns `false`.
  - Current codebase does not currently perform an `isE2EESupported()` check before connecting to LiveKit.

---

### 1.5 Call Key Distribution State Machine (Specification Section 13)
- **Specification Requirements:**
  - `e2ee_implementation_plan_revision6.md:878-952` (Section 13) & `ORIGINAL_REQUEST.md:31-35` (R4):
  - State lifecycle: `NO_KEY` -> `GENERATING` -> `DISTRIBUTING` -> `ACTIVE` -> `ROTATING`.
  - Recovery from missing key: `key_missing` -> `REQUESTING` -> `DISTRIBUTING` -> `ACTIVE`.
  - Triggers for `ROTATING`: `participant_joined`, `participant_left`, `epoch_changed`.
  - Key distributor rule: Deterministic selection from active participants' eligible devices using `min(canonical_device_id)`. If distributor leaves, remaining active device with lowest ID takes over and generates a new key.
  - Distribution mechanism: Delivered via Olm 1:1 `e2ee_to_device` messages (`msg_type: 'call_key'`).
  - Strict prohibition: No fallback to plaintext under any circumstances for E2EE conversations.

---

## 2. Logic Chain

```
[Observation 1.1: LiveKitManager uses livekit-client 2.1.2 with standard Room({ ... })]
                                     │
                                     ▼
[Step 1: livekit-client 2.1.2 includes native E2EE worker & ExternalE2EEKeyProvider]
 (Observation 1.2: dist/livekit-client.e2ee.worker.js and ExternalE2EEKeyProvider exist in package)
                                     │
                                     ▼
[Step 2: Room creation can accept conditional E2EE options when room is marked E2EE]
 (e2ee: { keyProvider, worker: new Worker(...) } passes into RoomOptions)
                                     │
                                     ▼
[Step 3: Platform Compatibility Validation]
 ├── Web: Modern browsers (Chrome >= 86, Safari >= 15.4, Firefox >= 117) pass isE2EESupported()
 ├── Electron 30.0.1: Chromium 124 natively supports insertable streams & AudioWorklet.
 │   WASAPI audio bridge track is a MediaStreamTrack; LiveKit encrypts it normally via RTCRtpSender.
 └── Android WebView:
     - On updated WebView (Chrome >= 86), isE2EESupported() is true.
     - On outdated WebView (Chrome < 86), isE2EESupported() is false.
                                     │
                                     ▼
[Step 4: Blocking & Anti-Fallback Gate]
 Per spec Section 10.5 & 13.4, when room requires E2EE:
 - IF isE2EESupported() === false -> BLOCK CALL IMMEDIATELY. Show explicit upgrade modal.
 - NEVER allow room.connect() without E2EE options on an E2EE conversation.
                                     │
                                     ▼
[Step 5: Call Key State Machine Implementation]
 Distributor (min(device_id)) generates random key -> sets ExternalE2EEKeyProvider.setKey() ->
 distributes to peer devices via Olm to-device (msg_type: 'call_key') ->
 transitions to ACTIVE -> on join/leave/epoch_change transitions to ROTATING.
```

---

## 3. Caveats
1. **LiveKit Single Identity Limitation:**
   - In ZeroVC, LiveKit participant identity is currently `userID.String()`.
   - `voiceStore.ts:229-234` explicitly handles `DisconnectReason.DUPLICATE_IDENTITY` by disconnecting duplicate sessions.
   - For call key distribution, because each participant on the call is currently on one device, the distributor can look up that participant's active device from the current roster snapshot. However, if a user switches devices, Olm to-device key delivery must target `recipient_device_id`.
2. **Web Worker Asset Resolution in Vite & Electron & Capacitor:**
   - When importing the LiveKit worker, Vite requires proper asset handling. `new Worker(new URL('livekit-client/dist/livekit-client.e2ee.worker.js', import.meta.url), { type: 'classic' })` or copying `livekit-client.e2ee.worker.js` to `public/` is necessary to ensure consistent loading in both Electron (`file://` or custom protocol) and Android WebView (`https://zerovc.safiroko.xyz` or local scheme).
3. **Screen Share Audio Exclusivity:**
   - System audio capture on Windows via WASAPI loopback is only supported on Windows. On Linux/macOS/mobile, screen share is video-only or uses browser surface audio.

---

## 4. Conclusion

1. **Current State:** ZeroVC has a robust LiveKit WebRTC implementation (`livekit-client` v2.1.2) handling guild voice, 1:1 DM calls, and DM group voice, complete with Web Audio preprocessing, volume controls, and a custom Electron WASAPI process loopback bridge.
2. **E2EE Readiness:** The existing `livekit-client` v2.1.2 already contains the necessary SFrame WebRTC insertable streams engine (`ExternalE2EEKeyProvider` and `livekit-client.e2ee.worker.js`). No external crypto library is needed for the WebRTC media layer; only key provisioning is required.
3. **Platform Viability:**
   - **Electron (Win/Linux/Mac):** 100% viable. Chromium 124 supports all WebRTC transform APIs. The native WASAPI loopback bridge is completely compatible with LiveKit E2EE.
   - **Web:** 100% viable on all evergreen browsers.
   - **Android (Capacitor):** Viable on all devices with Android System WebView >= 86.
4. **Required Implementation Points for Phase 0 Spike & Phase 3 Calls:**
   - **Room E2EE Injection:** Extend `LiveKitManager.connect()` to accept `e2eeOptions: { enabled: boolean; keyProvider?: ExternalE2EEKeyProvider }`.
   - **Pre-Call Gate:** Check `isE2EESupported()` before connecting. If false and the call is E2EE, abort immediately with an error message.
   - **Token Contract:** Backend tokens for E2EE rooms must carry `e2ee_required: true`.
   - **Call Key Coordinator:** Implement `callKeyManager` implementing the Section 13 state machine: deterministic distributor selection (`min(device_id)`), random key generation, Olm to-device transmission (`msg_type: 'call_key'`), and rotation upon `participant_joined`, `participant_left`, or `epoch_changed`.

---

## 5. Verification Method

To independently verify these findings:

1. **Inspect LiveKit Client & Worker:**
   ```powershell
   # Check livekit-client package version
   Get-Content "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\package.json" | Select-String "livekit-client"

   # Confirm existence of E2EE worker and KeyProvider
   Test-Path "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\node_modules\livekit-client\dist\livekit-client.e2ee.worker.js"
   Test-Path "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\node_modules\livekit-client\dist\src\e2ee\KeyProvider.d.ts"
   ```

2. **Verify Electron Version & WASAPI Audio Bridge:**
   ```powershell
   # Check Electron version (30.0.1 -> Chromium 124)
   Get-Content "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\package.json" | Select-String "electron"

   # Verify WASAPI start marker logic in Electron main
   Select-String -Path "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\electron\main.ts" -Pattern "Capture Started"
   ```

3. **Verify Android Capacitor Gradle Configuration:**
   ```powershell
   # Check minSdkVersion and targetSdkVersion
   Get-Content "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\android\variables.gradle"

   # Check release build type (minifyEnabled, shrinkResources)
   Get-Content "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\android\app\build.gradle" | Select-String -Pattern "minifyEnabled|shrinkResources|signingConfig"
   ```

4. **Verify TypeScript Compilation:**
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client"
   npx tsc --noEmit
   ```
