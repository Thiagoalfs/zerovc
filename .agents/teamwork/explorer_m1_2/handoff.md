# Handoff Report — Explorer M1.2: LiveKit SFrame & Worker Spike

## Summary
Investigation completed on LiveKit SFrame End-to-End Encryption (E2EE), Web Worker bundling in Vite 5, cross-platform resolution (Web, Electron 30, Android Capacitor 8.5.2), key lifecycle / seamless ratcheting, and strict pre-call gates with `isE2EESupported()`.

---

## 1. Observation

### 1.1 Dependency & File Structure
- `client/package.json` specifies `"livekit-client": "^2.1.2"`, but `client/node_modules/livekit-client/package.json` installs version `2.22.1`.
- `client/node_modules/livekit-client/package.json` lines 14–18 declares the subpath export:
  ```json
  "./e2ee-worker": {
    "types": "./dist/src/e2ee/worker/e2ee.worker.d.ts",
    "import": "./dist/livekit-client.e2ee.worker.mjs",
    "require": "./dist/livekit-client.e2ee.worker.js"
  }
  ```
- The directory `client/node_modules/livekit-client/dist/` contains pre-bundled worker artifacts:
  - `livekit-client.e2ee.worker.js` (97,699 bytes, CommonJS/UMD format)
  - `livekit-client.e2ee.worker.mjs` (285,701 bytes, ESM format)
- The directory `client/node_modules/livekit-client/src/e2ee/` contains the complete source files:
  - `E2eeManager.ts`: Manages communication between `Room` and the Web Worker (`postKey`, `postEnable`, `setup`).
  - `KeyProvider.ts`: Declares `BaseKeyProvider` and `ExternalE2EEKeyProvider`.
  - `worker/e2ee.worker.ts`: Worker entry point processing `setKey`, `encode`, `decode`, `ratchetKey`.
  - `worker/ParticipantKeyHandler.ts`: Maintains the `cryptoKeyRing` array (size 16), executes HKDF key derivation, and performs SFrame ratcheting.
  - `worker/FrameCryptor.ts`: Performs AES-GCM frame encryption/decryption on insertable streams and appends/reads the 2-byte trailer `[IV_LENGTH, keyIndex]`.
  - `utils.ts`: Implements `isE2EESupported()`, `isInsertableStreamSupported()`, and `isScriptTransformSupported()`.

### 1.2 Vite Bundling Behavior & Web Worker Resolution Test
- In testing direct usage of bare package specifier `new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), { type: 'module' })`:
  - Vite's internal plugin `vite:worker-import-meta-url` parses the string literal as a file-relative path relative to `import.meta.url`, rather than resolving it through Node module resolution.
  - Verbatim Rollup build error:
    ```text
    [vite:worker-import-meta-url] Could not resolve entry module ".../livekit-client/e2ee-worker".
    ```
- In testing a local worker wrapper file `client/src/workers/e2ee.worker.ts`:
  ```typescript
  import 'livekit-client/e2ee-worker';
  ```
  - Using `import E2EEWorker from '../workers/e2ee.worker?worker';` with `const worker = new E2EEWorker();`:
    - In Vite dev server (`vite dev`): Vite serves `/src/workers/e2ee.worker.ts?worker_file&type=module` over HTTP with status 200.
    - In Vite production build (`vite build`): Vite bundles the worker into a self-contained IIFE chunk (`dist/assets/worker-[hash].js`, ~98 KB) and generates a factory `function() { return new Worker("/assets/worker-[hash].js"); }`.
  - Using `new Worker(new URL('../workers/e2ee.worker.ts', import.meta.url), { type: 'module' })`:
    - In Vite dev server: Vite compiles `new Worker(new URL("/src/workers/e2ee.worker.ts?worker_file&type=module", import.meta.url), { type: 'module' })`.
    - In Vite production build: Vite bundles `dist/assets/worker-[hash].js` and references `new Worker(new URL("/assets/worker-[hash].js", import.meta.url), { type: 'module' })`.

### 1.3 Target Runtime Environments
- **Web App**: Served via Go backend (`backend/cmd/server/main.go`, lines 117–130) from `./web` with `base: '/'`. Static assets are served from `/assets/*`.
- **Electron (v30.0.1)** (`client/electron/main.ts`):
  - In development: loads `http://localhost:5173`.
  - In production: loads `REMOTE_SERVER_URL = 'https://zerovc.safiroko.xyz'`. Worker asset `/assets/worker-[hash].js` is fetched over HTTPS.
  - Offline fallback: loads `dist/index.html`. WebRTC calls require internet connectivity to connect to LiveKit SFU; offline calls do not occur.
- **Android Capacitor (v8.5.2)** (`client/capacitor.config.ts`):
  - Line 8 sets `server.url = 'https://zerovc.safiroko.xyz'`.
  - Line 10 sets `androidScheme: 'https'`.
  - In production: WebView connects directly to `https://zerovc.safiroko.xyz` or serves from `https://localhost` (when running local assets). Because the scheme is HTTPS (`https://localhost` or `https://zerovc.safiroko.xyz`), the worker URL `/assets/worker-[hash].js` resolves without origin or protocol mismatch.

### 1.4 LiveKit E2EE Key Derivation & Wire Protocol
- In `client/node_modules/livekit-client/src/e2ee/KeyProvider.ts` (lines 40–52):
  - `ExternalE2EEKeyProvider` extends `BaseKeyProvider`.
  - Constructor sets `sharedKey: true`, `ratchetWindowSize: 0`, and `failureTolerance: -1`.
  - `setKey(key: string | ArrayBuffer)`:
    - String parameter: imports as PBKDF2 (`createKeyMaterialFromString`).
    - `ArrayBuffer` parameter: imports as HKDF (`createKeyMaterialFromBuffer`).
    - Derives `CryptoKey` and triggers `this.onSetEncryptionKey(derivedKey)`.
- In `client/node_modules/livekit-client/src/e2ee/E2eeManager.ts` (lines 410–430):
  - Listens to `KeyProviderEvent.SetKey` and posts `{ kind: 'setKey', data: { participantIdentity, isPublisher, key, keyIndex, updateCurrentKeyIndex } }` to the Web Worker.
- In `client/node_modules/livekit-client/src/e2ee/worker/ParticipantKeyHandler.ts`:
  - `cryptoKeyRing`: Array of length `keyProviderOptions.keyringSize` (default 16).
  - `setKey`: Derives encryption keys using HKDF with `ratchetSalt: 'LKFrameEncryptionKey'` and saves them in `cryptoKeyRing[keyIndex % keyringSize]`.
  - `currentKeyIndex`: Tracks the active sender index.
- In `client/node_modules/livekit-client/src/e2ee/worker/FrameCryptor.ts` (lines 439–451 and 563–577):
  - **Encryption**:
    - Creates IV (12 bytes) using SSRC, timestamp, and frame counter.
    - Encrypts payload with AES-GCM (128-bit or 256-bit).
    - Appends 2-byte trailer to the ciphertext:
      - Byte 0: `IV_LENGTH` (12)
      - Byte 1: `keyIndex` (`KID`)
  - **Decryption**:
    - Extracts `keyIndex = data[data.byteLength - 1]`.
    - Retrieves key from `this.keys.getKeySet(keyIndex)`.
    - Decrypts frame using retrieved key and IV.

### 1.5 Support Verification Function
- In `client/node_modules/livekit-client/src/e2ee/utils.ts` (lines 4–15):
  ```javascript
  export function isE2EESupported(): boolean {
    return isInsertableStreamSupported() || isScriptTransformSupported();
  }
  export function isScriptTransformSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.RTCRtpScriptTransform !== 'undefined';
  }
  export function isInsertableStreamSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.RTCRtpSender !== 'undefined' &&
      typeof window.RTCRtpSender.prototype.createEncodedStreams !== 'undefined'
    );
  }
  ```
- In `client/node_modules/livekit-client/src/e2ee/E2eeManager.ts` (lines 109–113):
  - If `!isE2EESupported()`, `setup(room)` throws `DeviceUnsupportedError('tried to setup end-to-end encryption on an unsupported browser')`.

---

## 2. Logic Chain

1. **Worker Bundling Mechanism**:
   - Observation: Direct `new Worker(new URL('livekit-client/e2ee-worker', import.meta.url))` fails in Rollup because Vite expects a relative filesystem path rather than a package specifier.
   - Observation: Creating a lightweight wrapper `client/src/workers/e2ee.worker.ts` that contains `import 'livekit-client/e2ee-worker';` resolves the module through standard TypeScript/Node resolution.
   - Inference: Vite can now bundle the worker via `import E2EEWorker from '../workers/e2ee.worker?worker'` into a standalone asset in `dist/assets/`, compatible with both `vite dev` and `vite build`.

2. **Cross-Platform Compatibility (Web, Electron, Android)**:
   - Observation: Web and Electron load assets over HTTPS (`https://zerovc.safiroko.xyz/assets/...`).
   - Observation: Android Capacitor uses `androidScheme: 'https'` and connects to `https://zerovc.safiroko.xyz`.
   - Observation: Both `RTCRtpSender.prototype.createEncodedStreams` and Web Worker support have been available in Chromium since version 86 (October 2020).
   - Inference: Web, Electron 30 (Chromium 124), and Android WebView (with Chrome >= 86) share identical WebRTC and Web Worker support.

3. **Glitch-Free Key Rotation**:
   - Observation: LiveKit SFrame encodes `keyIndex` directly in the last byte of each frame trailer (`data[data.byteLength - 1]`).
   - Observation: `ParticipantKeyHandler` maintains a ring buffer (`cryptoKeyRing`) holding up to 16 keys simultaneously.
   - Observation: Decryption reads the per-frame `keyIndex` from the packet itself and retrieves the corresponding key from the ring buffer.
   - Inference: When a call key rotates (e.g. participant joins or leaves):
     1. Distributor delivers new key via Olm to all participants.
     2. Each participant registers the key into `cryptoKeyRing[newKeyIndex]` via `setKey(newKey, newKeyIndex)`.
     3. The sender transitions to publishing with `newKeyIndex`.
     4. Receivers decrypt packets with `oldKeyIndex` or `newKeyIndex` without renegotiation, socket reconnection, or audio clipping.

4. **Strict Pre-Call Enforcement**:
   - Observation: Specification `e2ee_implementation_plan_revision6.md` §13.4 and Acceptance Criteria mandate:
     - "Android: exigir WebView com insertable streams (Chrome >= 86) e bloquear chamadas se `isE2EESupported()` falhar."
     - "Fallback silencioso para plaintext: Deve falhar."
   - Inference: In `client/src/stores/voiceStore.ts`, `client/src/stores/callStore.ts`, and `client/src/lib/livekit.ts`:
     - If the destination call is E2EE (`isE2EE: true` or `e2ee_required: true`):
       1. Execute `if (!isE2EESupported())`.
       2. If `false`, abort connection immediately before creating a `Room` or sending WebRTC offers.
       3. Emit an upgrade alert modal to the user.
       4. Never execute a fallback unencrypted connection on an E2EE channel/DM.

---

## 3. Caveats

- **Capacitor Offline Fallback (`file://`)**: In the unlikely event that Capacitor or Electron attempts to run the client offline from `file://`, standard Chromium security restricts Web Workers from accessing `file://` resources. However, this is a non-issue because LiveKit WebRTC media streams strictly require server signaling and SFU connectivity.
- **Key Size Parameter**: `livekit-client` supports `keySize: 128` (default) and `keySize: 256`. The types documentation notes that some non-web SDKs only support 128-bit SFrame keys. For pure Web/Electron/Capacitor (all running the JS SDK), 128-bit or 256-bit works. We recommend matching the project standard (`keySize: 256` or `128`) defined by the cryptographic lead.
- **Safari Specifics**: Safari uses `RTCRtpScriptTransform` rather than `createEncodedStreams`. Both are supported by `isE2EESupported()` and `livekit-client/e2ee-worker`.

---

## 4. Conclusion

The LiveKit SFrame E2EE and worker setup for ZeroVC Spike (Fase 0) is fully viable across Web, Electron, and Android Capacitor. The concrete implementation design is:

1. **Worker Module**:
   Create `client/src/workers/e2ee.worker.ts`:
   ```typescript
   import 'livekit-client/e2ee-worker';
   ```
2. **Worker Import in `client/src/lib/livekit.ts`**:
   ```typescript
   import E2EEWorker from '../workers/e2ee.worker?worker';
   import { Room, ExternalE2EEKeyProvider, isE2EESupported } from 'livekit-client';
   ```
3. **Room Initialization**:
   ```typescript
   const keyProvider = new ExternalE2EEKeyProvider();
   const worker = new E2EEWorker();
   const room = new Room({
     // presets...
     e2ee: {
       keyProvider,
       worker,
     },
   });
   ```
4. **Key Management**:
   Pass 32-byte cryptographic random call keys (generated by distributor) via `keyProvider.setKey(callKeyBuffer)`. Enable encryption with `await room.setE2EEEnabled(true)`. Key updates use the 16-slot ring buffer to avoid audio glitches during participant join/leave churn.
5. **Strict Gate**:
   Prior to `room.connect()`, if call is E2EE, evaluate `if (!isE2EESupported())`. If false, abort immediately, display upgrade modal, and forbid unencrypted fallback.

---

## 5. Verification Method

1. **Vite Build Verification**:
   Run from `client/`:
   ```bash
   npm run build
   ```
   Verify that TypeScript compiles (`tsc`) and Vite successfully generates `dist/assets/worker-[hash].js` without resolution errors.
2. **Pre-call Check Verification**:
   Inspect `isE2EESupported()` behavior in tests:
   ```typescript
   import { isE2EESupported } from 'livekit-client';
   expect(typeof isE2EESupported()).toBe('function');
   ```
   Simulate unsupported environment (`window.RTCRtpSender.prototype.createEncodedStreams = undefined`) and assert that call connection throws and aborts without opening WebRTC connection.
3. **Glitch-free Key Verification**:
   Instantiate `ParticipantKeyHandler`, call `setKey(key1, 0)`, then `setKey(key2, 1)`. Verify `getKeySet(0)` and `getKeySet(1)` are both accessible and decrypt valid frames for their respective key indexes.
