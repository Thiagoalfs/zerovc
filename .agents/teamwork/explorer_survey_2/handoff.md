# Handoff Report — Explorer Survey 2: Frontend Architecture & Messaging/UI

**Date**: 2026-10-08  
**Author**: Explorer Survey 2 (Frontend Architecture & Messaging/UI)  
**Target Recipient**: Orchestrator / Implementer  
**Scope**: Frontend architecture, state stores, API/WebSocket pipelines, messaging flows, Settings UI, build toolchain, and WASM/E2EE feasibility in `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client`.

---

## 1. Observation

### 1.1 Stack & Project Layout
- **Framework & Libraries**:
  - React `18.2.0`, ReactDOM `18.2.0` (`client/package.json:36-37`).
  - Zustand `4.5.2` for state management (`client/package.json:42`).
  - Vite `5.2.10` / `5.4.21` bundler with `@vitejs/plugin-react` `4.2.1` (`client/package.json:25, 41`).
  - TypeScript `5.4.5` (`client/package.json:40`) targeting `ES2020` with `moduleResolution: "bundler"`, strict mode enabled (`client/tsconfig.json:3-14`).
  - Tailwind CSS `3.4.3` (`client/package.json:39`).
  - LiveKit Client SDK: `livekit-client` `^2.1.2` in `package.json:33`, resolved to `2.22.1` in `client/node_modules/livekit-client/package.json:3`.
  - Electron `30.0.1` (`client/package.json:31`) and Capacitor `8.5.2` (`client/package.json:16-17`).
- **Build Pipeline**:
  - `npm run build` runs `tsc && vite build && node -e "..."` which copies `dist` to `../backend/web` (`client/package.json:8`).
  - Direct execution of `npx tsc --noEmit` completed with **exit code 0** (0 type errors).
  - Direct execution of `npx vite build` completed with **exit code 0** in **23.77s**, generating manual chunks (`vendor-react`, `vendor-livekit`, `vendor-icons`, `vendor-utils`, `ProfileModal`, `ServerSettingsModal`, `index.js`).

### 1.2 API Client & WebSocket Gateway
- **API Client (`client/src/lib/api.ts`)**:
  - Base URL resolved dynamically via `getApiBaseUrl()` (`client/src/lib/api.ts:7-24`), checking `zerovc_api_url` in localStorage, `window.location.origin`, or fallback `https://zerovc.safiroko.xyz`.
  - All REST calls route through a single internal `request<T>(endpoint, options, isRetry)` function (`client/src/lib/api.ts:77-165`).
  - Auto-attaches `X-CSRF-Token` on `POST`, `PUT`, `PATCH`, `DELETE` (`client/src/lib/api.ts:94-105`), auto-retrying once via `/auth/me` on 403 CSRF mismatch.
  - Electron uses `Authorization: Bearer <token>`, while Web uses `credentials: 'include'` with HTTP-only cookies (`client/src/lib/api.ts:107-119`).
  - Currently, no `X-Client-E2EE-Version` header is attached in `request()`.
- **WebSocket Gateway (`client/src/lib/socket.ts` & `client/src/App.tsx`)**:
  - `SocketClient` class singleton (`client/src/lib/socket.ts:11-145`), reconnects with exponential backoff + jitter (`client/src/lib/socket.ts:88-98`).
  - Parses newline-separated JSON frames (`client/src/lib/socket.ts:59-67`).
  - Event listeners are registered centrally in `client/src/App.tsx:1337-1378` (`MESSAGE_CREATE`, `DM_MESSAGE_CREATE`, `GROUP_MESSAGE_CREATE`, etc.).
  - Browser WebSocket constructor does not accept custom HTTP request headers; custom versions must pass via query params (e.g. `?e2ee_version=N`), subprotocol, or immediate handshake message.

### 1.3 State Stores & Messaging Pipeline
- **Store Architecture**:
  - `dmStore.ts`: Manages 1:1 DMs (`rooms`, `activeRoom`, `messages`, `messagesByRoom`, `roomUnreadCounts`, `unreadRooms`, `firstUnreadMessageIdByRoom`).
  - `dmGroupStore.ts`: Manages DM Groups up to 15 members (`groups`, `activeGroup`, `messages`, `messagesByGroup`, `groupUnreadCounts`, `unreadGroups`).
  - `guildStore.ts`: Manages server text/voice channels (`guilds`, `activeGuild`, `activeChannel`, `messages`, `messagesByChannel`, `unreadChannels`, `channelMentions`, `guildMentions`).
- **Optimistic Sending Flow**:
  - `sendMessage` in `dmStore` (lines 241-400), `dmGroupStore` (lines 350-450), and `guildStore` (lines 661-815) creates a temporary message with `tempId: temp-${Date.now()}-${random}`, `status: 'sending'`, appends it immediately to the local state, uploads attachments if any, calls REST API (`api.dms.sendMessage`, `api.dmGroups.sendMessage`, or `api.channels.sendMessage`), and replaces the optimistic entry with the server's confirmed message.
- **Unread Count & Memory Limits**:
  - Memory is bounded to **200 messages** per room/channel (`client/src/stores/dmStore.ts:489-491`, `client/src/stores/guildStore.ts:892-894`).
  - Unread counts increment on incoming WS event **solely** based on `message.author_id !== currentUser?.id` (`client/src/stores/dmStore.ts:515-517`), completely independent of message body plaintext.
- **Reactions & Edits**:
  - Plaintext reactions are tracked in `reactions: MessageReaction[]` (`{ emoji, count, user_ids }`) and toggled via `api.*.addReaction` / `removeReaction`.
  - Edits send plaintext updates via `api.*.updateMessage`.
- **File Uploads & Image Processing**:
  - File uploads currently invoke `convertToWebP(file)` in `client/src/lib/api.ts:823` and `optimizeImageForUpload()` in `client/src/stores/dmStore.ts:317`.
  - Non-image files or pre-encrypted `application/octet-stream` blobs would either be bypassed or corrupted if passed through canvas-based WebP conversion.

### 1.4 Settings UI Architecture
- **User Settings (`client/src/components/Modals/ProfileModal.tsx`)**:
  - Large modal (3,991 lines, 189 KB) with 12 tabs: `'account'`, `'profile'`, `'privacy'`, `'sessions'`, `'registered_games'`, `'activity_privacy'`, `'appearance'`, `'accessibility'`, `'audio'`, `'notifications'`, `'preferences'`, `'keybinds'`.
  - The `privacy` tab (lines 1888-2046) contains credentials, 2FA toggle, DM privacy radio options, and data export.
  - The `sessions` tab renders `SessionsSettingsView.tsx` (`client/src/components/Modals/SessionsSettingsView.tsx`), displaying connected web/mobile/desktop sessions with IP location and revocation buttons.
  - Currently, there is no E2EE device management, safety code verification, or recovery key UI.
- **Channel / Group Creation Modals**:
  - `CreateDMGroupModal.tsx` (`client/src/components/Modals/CreateDMGroupModal.tsx:52`): Already strictly limits friends to 14 (15 members total): `if (selectedFriendIds.length >= 14) setError(...)`.
  - `CreateChannelModal.tsx` (`client/src/components/Modals/CreateChannelModal.tsx:18-20`): Supports `text` and `voice` types and `isPrivate`.

### 1.5 LiveKit Client & WebRTC E2EE
- `client/node_modules/livekit-client`:
  - Contains full native E2EE support:
    - `ExternalE2EEKeyProvider` (`livekit-client/dist/src/e2ee/KeyProvider.d.ts:40`).
    - `isE2EESupported()` (`livekit-client/dist/src/e2ee/utils.d.ts:4`).
    - Bundled worker at export `livekit-client/e2ee-worker` (`livekit-client/package.json:14-18`).
  - `client/src/lib/livekit.ts` initializes `new Room({ ... })` (line 245), currently without `e2ee` configuration.

---

## 2. Logic Chain

1. **Gate of Client Version**:
   - *Observation*: Every API call routes through `request()` in `client/src/lib/api.ts:77-165`.
   - *Logic*: Adding `headers['X-Client-E2EE-Version'] = '1'` inside `request()` universally satisfies Requirement R6/§4 across all existing and future REST requests. For WebSocket in `client/src/lib/socket.ts:27`, appending `?e2ee_version=1` to `wsUrl` satisfies the gateway handshake requirement without requiring custom browser WebSocket headers.
2. **Decoupled Decryption & Pure `messageCodec`**:
   - *Observation*: `dmStore`, `dmGroupStore`, and `guildStore` track unread counts (`roomUnreadCounts`, `groupUnreadCounts`, `unreadChannels`) using only message IDs and `author_id !== currentUser?.id`.
   - *Logic*: Introducing `messageCodec.ts` as a pure function (`payload → validate → decrypt → normalize → result`) preserves this decoupling. If a message cannot be decrypted immediately due to a missing session, storing it with status `undecryptable` allows subsequent messages to continue loading, ensures unread counts increment correctly, and prevents the unread badge bug.
3. **Encrypted Attachments Pipeline**:
   - *Observation*: `api.upload.attachment` currently passes all files through `convertToWebP()`.
   - *Logic*: Encrypted attachments are random AES-256-GCM ciphertext blobs (`application/octet-stream`). Attempting to convert them to WebP will corrupt the payload or throw an error. Therefore, a dedicated method `api.e2ee.uploadAttachment(ciphertextBlob)` or an explicit `skipWebP: true` option must be used.
4. **Settings UI Placement & Security Boundary**:
   - *Observation*: `ProfileModal.tsx` contains existing tabs `'privacy'` and `'sessions'`.
   - *Logic*: Following revision 6 §11.5, `PrivacyView` can be extracted/extended to display general E2EE status and metadata disclosures, while a dedicated `SecurityView.tsx` component should handle E2EE device registration, device revocation, safety numbers (60 digits / QR code on demand), and the one-time Recovery Key modal flow.
5. **LiveKit Voice/Video E2EE Feasibility**:
   - *Observation*: `livekit-client` v2.22.1 already exports `ExternalE2EEKeyProvider`, `isE2EESupported`, and `livekit-client/e2ee-worker`.
   - *Logic*: LiveKit E2EE requires zero new third-party WebRTC dependencies. It can be instantiated directly via `new ExternalE2EEKeyProvider()` and passed to `new Room({ e2ee: { keyProvider, worker } })`. Enforcing `isE2EESupported()` prevents silent unencrypted fallback on legacy Android WebViews.
6. **WASM & IndexedDB Feasibility**:
   - *Observation*: Vite 5 natively supports Web Workers via `new Worker(new URL(..., import.meta.url), { type: 'module' })` and compiles cleanly in 23.77s. WebCrypto is standard in modern browsers, Electron 30, and Android WebView (Chromium 86+).
   - *Logic*: Storing Olm/Megolm pickles encrypted with a non-extractable WebCrypto `CryptoKey` in IndexedDB satisfies local security without leaking raw keys to DOM/UI inspection.

---

## 3. Caveats

1. **Vodozemac WASM Package Selection**: `@matrix-org/vodozemac` is not published under that exact scope on npm; the verified npm packages are `@dtelecom/vodozemac-wasm` (tailored for non-Matrix chats, Olm/Megolm primitives) or a project-vendored wasm build from Matrix's vodozemac Rust repository. Phase 0 must lock this selection.
2. **Android WebView Matrix**: While modern Android devices use Chromium System WebView ≥ 86 supporting insertable streams, older devices with un-updated WebViews (< 86) will fail `isE2EESupported()`. The client must block calls on these devices with an upgrade notice rather than downgrading to cleartext.
3. **CORS on Client-Side Link Previews**: In plaintext, link previews are fetched server-side (`link_preview_handlers.go`). In E2EE, URLs are hidden inside the envelope; any client-side link preview would face browser CORS restrictions unless routed through an opt-in proxy.

---

## 4. Conclusion

- **Feasibility Assessment**: The frontend architecture of ZeroVC is exceptionally well-suited for E2EE integration.
- **Key Architecture Enablers**:
  1. Centralized API client (`api.ts:request`) allows 1-line client version gating (`X-Client-E2EE-Version`).
  2. Unread counters in `dmStore`, `dmGroupStore`, and `guildStore` are already decoupled from message plaintext.
  3. LiveKit SDK v2.22.1 already includes `ExternalE2EEKeyProvider`, `isE2EESupported`, and `e2ee.worker`.
  4. The existing UI structure in `ProfileModal` cleanly accommodates the proposed `PrivacyView` and `SecurityView` separation.
  5. The TypeScript build is completely clean (0 errors) and Vite bundles production chunks in under 24 seconds.
- **Prescribed Client Structure**:
  - `client/src/crypto/`: `keyStore`, `identity`, `deviceManager`, `olmSessions`, `megolmSessions`, `envelope`, `attachments`, `backup`, `verification`, `callKeys`, `e2eeStore`.
  - `client/src/messaging/`: `messageCodec.ts` (pure transform).
  - `client/src/components/Modals/`: `SecurityView.tsx`, `RecoveryKeyModal.tsx`, `DeviceVerificationModal.tsx`.

---

## 5. Verification Method

### 5.1 Type Check & Bundler Build
Execute in `client/`:
```bash
npx tsc --noEmit
npx vite build
```
- **Expected Outcome**: Exit code 0, 0 type errors, clean production bundle in `dist/`.

### 5.2 LiveKit E2EE Capabilities Verification
Verify that `livekit-client` exports the required E2EE symbols:
```bash
node -e "const lk = require('./client/node_modules/livekit-client/dist/src/e2ee/KeyProvider.js'); console.log('KeyProvider:', typeof lk.ExternalE2EEKeyProvider);"
```
- **Expected Outcome**: `KeyProvider: function`.

### 5.3 Invalidation Conditions
- Any changes that allow `messageCodec` to write directly to Zustand stores or mutate read counters.
- Any attempt to run image optimization (`convertToWebP`) on encrypted attachment blobs.
- Any attempt to store plaintext Recovery Keys or private keys in React component state or global UI stores.
