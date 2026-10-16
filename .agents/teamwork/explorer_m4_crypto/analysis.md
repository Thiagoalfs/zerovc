# Technical Analysis & Blueprint: CallKeyManager Cryptographic Hardening & Olm 1:1 Wrapping

**Author**: `explorer_m4_crypto` (Role: M4 Crypto Hardening Explorer)  
**Target Milestone**: Gate 4 (LiveKit Voice/Video E2EE Protocol Hardening)  
**Primary Files Under Investigation**:
- `client/src/crypto/callKeys.ts`
- `client/src/crypto/olmSession.ts`
- `client/src/stores/voiceStore.ts`
- `client/scripts/challenger-m4-adversarial.ts`
- `client/scripts/test-challenger-m4-2-adversarial.ts`

---

## 1. Executive Summary & Threat Model

In ZeroVC's opt-in end-to-end encrypted architecture (Spec §13, §14, Requirement R4), LiveKit WebRTC audio and video frames are encrypted at the media layer using the SFrame standard (`Insertable Streams` via `RTCRtpScriptTransform` / Web Worker). The master symmetric key protecting these frames is a 256-bit (32-byte) cryptographically secure random buffer generated on the client via `globalThis.crypto.getRandomValues(new Uint8Array(32))`.

Because LiveKit rooms are multi-party, participants coordinate the symmetric call key through a deterministic single-distributor protocol:
1. **Deterministic Election**: The active participant device having the lexicographically lowest device ID (`min_lex(device_id)`) assumes the distributor role.
2. **Forward & Backward Secrecy**: The distributor ratchets the key forward (`keyIndex++`, `epoch++`) on participant joins (backward secrecy) and participant leaves (forward secrecy).
3. **Signaling Exchange**: Keys are distributed to peer participant devices via the to-device signaling channel (`POST /api/e2ee/to-device` and WebSocket event `E2EE_TO_DEVICE`).

During Gate 4 audits by Challenger M4-1, Challenger M4-2, and Reviewer M4-1, an audit of `CallKeyManager` (`client/src/crypto/callKeys.ts:361-408`) revealed **four protocol-level vulnerabilities** and **one critical cryptographic leak**:

| Vulnerability ID | Classification | Severity | Impact |
|---|---|---|---|
| `ROGUE_DISTRIBUTOR_INJECTION` | Protocol Integrity | **HIGH** | An elected distributor unconditionally accepts incoming keys from subordinate devices, allowing any participant to overwrite the room key and hijack distributor authority. |
| `UNAUTHORIZED_SENDER` | Authentication / Authority | **HIGH** | Subordinate peers accept call keys from any non-distributor peer, circumventing canonical `min_lex(device_id)` election. |
| `KEY_REPLAY_DOWNGRADE` | Forward Secrecy | **HIGH** | `key_index` is assigned without monotonicity validation (`key_index <= this.keyIndex`), allowing an attacker or stale packet to downgrade active sessions to older keys and compromise forward secrecy. |
| `ECHO_ACCEPTANCE` | Loopback / Invariance | **MEDIUM** | Nodes process their own reflected packets (`sender_device_id === myDeviceId`), risking duplicate state resets or circular ratchet storms. |
| `PLAINTEXT_CALL_KEY_LEAK` | Confidentiality / Anti-Leak | **CRITICAL** | Raw 32-byte call keys are serialized only as plaintext Base64 into to-device payloads and stored in cleartext inside PostgreSQL `e2ee_to_device.payload`, giving server administrators access to decrypt voice/video. |

This document formulates the exact, verified technical blueprint to patch `client/src/crypto/callKeys.ts` with the 4 security guards and designs the Olm 1:1 encryption wrapping layer.

---

## 2. In-Depth Root Cause Analysis: The 4 Security Guards

### 2.1 Vulnerability 1: Rogue Distributor Injection (`ROGUE_DISTRIBUTOR_INJECTION`)
- **Observed Behavior**: In `client/scripts/challenger-m4-adversarial.ts` (Test 5.1), `dev-01` is elected distributor. Rogue peer `dev-09` transmits a malicious `call_key` to `dev-01`. `CallKeyManager.handleIncomingCallKey` executes lines 397-402, overwriting `dev-01`'s authoritative key with the rogue key.
- **Root Cause**: `handleIncomingCallKey` lacks a guard condition checking `if (this.isDistributor())`.
- **Cryptographic Principle**: An elected distributor represents the canonical root of trust for room key distribution. Under no circumstance should an elected distributor adopt a symmetric key from any subordinate participant.
- **Remediation Guard**:
  ```typescript
  if (this.isDistributor()) {
    safeCryptoLogger.warn(
      'CallKeyManager',
      `Elected distributor rejected incoming call key from ${payload.sender_device_id}`
    );
    return;
  }
  ```

### 2.2 Vulnerability 2: Unauthorized Sender Usurpation (`UNAUTHORIZED_SENDER`)
- **Observed Behavior**: In `client/scripts/test-challenger-m4-2-adversarial.ts` (Suite 5, Test 4), `dev-02` (Bob) connects to a room with `dev-01` (Alice, distributor) and `dev-03` (Charlie, rogue). Charlie transmits a `call_key` claiming to be the new key. Bob transitions from `REQUESTING` to `ACTIVE` and adopts Charlie's key.
- **Root Cause**: `handleIncomingCallKey` never validates `payload.sender_device_id` against `this.distributorDeviceId`.
- **Cryptographic Principle**: In deterministic leader election, non-distributors must strictly verify that incoming signaling originates from the authoritative distributor (`payload.sender_device_id === this.distributorDeviceId`). Any key originating from an unauthorized peer must be dropped.
- **Remediation Guard**:
  ```typescript
  if (this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId) {
    safeCryptoLogger.warn(
      'CallKeyManager',
      `Rejected call key from non-distributor ${payload.sender_device_id} (expected ${this.distributorDeviceId})`
    );
    return;
  }
  ```

### 2.3 Vulnerability 3: Key Replay Downgrade (`KEY_REPLAY_DOWNGRADE`)
- **Observed Behavior**: In `challenger-m4-adversarial.ts` (Test 5.2) and `test-challenger-m4-2-adversarial.ts` (Suite 5, Test 3), a client at `key_index: 5, epoch: 5` receives a replayed message with `key_index: 1, epoch: 1` (or `key_index: 3, epoch: 3`). The client rolls back its `this.keyIndex` and adopts the old key.
- **Root Cause**: Line 398 unconditionally executes `this.keyIndex = payload.key_index` without monotonicity validation.
- **Cryptographic Principle**: Forward Secrecy requires that when a participant departs, the room ratchets to key $K_{N+1}$. If an adversary can replay $K_N$ or $K_1$ and force participants to accept it, the departed participant can eavesdrop on subsequent communications. Therefore, ratchet progression must be strictly monotonic: $K_{\text{new}} > K_{\text{current}}$.
- **Remediation Guard**:
  ```typescript
  if (
    this.keyIndex > 0 &&
    typeof payload.key_index === 'number' &&
    (payload.key_index < this.keyIndex ||
      (payload.key_index === this.keyIndex && (typeof payload.epoch !== 'number' || payload.epoch <= this.epoch)))
  ) {
    safeCryptoLogger.warn(
      'CallKeyManager',
      `Rejected replayed or outdated call key: index ${payload.key_index} <= ${this.keyIndex}, epoch ${payload.epoch} <= ${this.epoch}`
    );
    return;
  }
  ```

### 2.4 Vulnerability 4: Self-Reflection / Echo Acceptance (`ECHO_ACCEPTANCE`)
- **Observed Behavior**: In `challenger-m4-adversarial.ts` (Test 5.3), a node receives a `call_key` packet where `payload.sender_device_id === this.myDeviceId` (echoed by network loopback or broker reflection). The node processes it as an external incoming key.
- **Root Cause**: `handleIncomingCallKey` does not filter out packets where `payload.sender_device_id === this.myDeviceId`.
- **Remediation Guard**:
  ```typescript
  if (this.myDeviceId && payload.sender_device_id === this.myDeviceId) {
    safeCryptoLogger.debug('CallKeyManager', 'Ignored self-reflected call key payload');
    return;
  }
  ```

---

## 3. Blueprint for `client/src/crypto/callKeys.ts` Hardening

Below is the exact code patch to be applied to `handleIncomingCallKey` in `client/src/crypto/callKeys.ts`.

### Proposed Replacement for `handleIncomingCallKey`:
```typescript
  /**
   * Handles incoming Olm to-device message with msg_type: 'call_key'.
   * Enforces 4 security guards:
   *  1. Echo rejection: ignore self-reflected packets.
   *  2. Distributor self-preservation: elected distributor rejects keys from subordinate peers.
   *  3. Authorized sender verification: non-distributor rejects keys from non-distributors.
   *  4. Monotonic key index ratchet: strictly reject replayed or outdated key_index/epoch.
   */
  async handleIncomingCallKey(payload: CallKeyToDevicePayload): Promise<void> {
    if (!payload || payload.msg_type !== 'call_key') {
      safeCryptoLogger.warn('CallKeyManager', 'Ignored invalid payload msg_type');
      return;
    }

    // 1. Guard Echo / Reflection: Ignore self-reflected packets
    if (this.myDeviceId && payload.sender_device_id === this.myDeviceId) {
      safeCryptoLogger.debug('CallKeyManager', 'Ignored self-reflected call key payload');
      return;
    }

    // 2. Guard Rogue Distributor: Elected distributor must NEVER accept incoming keys from subordinate devices
    if (this.isDistributor()) {
      safeCryptoLogger.warn(
        'CallKeyManager',
        `Elected distributor rejected incoming call key from ${payload.sender_device_id}`
      );
      return;
    }

    // 3. Guard Authorized Sender: Non-distributor must only accept keys from elected distributor
    if (this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId) {
      safeCryptoLogger.warn(
        'CallKeyManager',
        `Rejected call key from non-distributor ${payload.sender_device_id} (expected ${this.distributorDeviceId})`
      );
      return;
    }

    // Call ID matching
    if (this.callId && payload.call_id !== this.callId) {
      safeCryptoLogger.warn(
        'CallKeyManager',
        `Ignored call key for mismatching call: ${payload.call_id} vs ${this.callId}`
      );
      return;
    }

    // 4. Guard Monotonic Key Index: Anti-replay & forward secrecy ratchet enforcement
    if (
      this.keyIndex > 0 &&
      typeof payload.key_index === 'number' &&
      (payload.key_index < this.keyIndex ||
        (payload.key_index === this.keyIndex && (typeof payload.epoch !== 'number' || payload.epoch <= this.epoch)))
    ) {
      safeCryptoLogger.warn(
        'CallKeyManager',
        `Rejected replayed or outdated call key: index ${payload.key_index} <= ${this.keyIndex}, epoch ${payload.epoch} <= ${this.epoch}`
      );
      return;
    }

    if (!payload.key) {
      safeCryptoLogger.warn('CallKeyManager', 'Ignored call key payload with missing key');
      return;
    }

    let keyBytes: Uint8Array;
    try {
      keyBytes = base64ToUint8Array(payload.key);
    } catch (e) {
      safeCryptoLogger.error('CallKeyManager', 'Failed to decode base64 call key:', e);
      return;
    }

    if (keyBytes.length !== 32) {
      safeCryptoLogger.error('CallKeyManager', `Rejected call key with invalid length: ${keyBytes.length} (must be 32 bytes)`);
      zeroKey(keyBytes);
      return;
    }

    // Zero out old key before storing new one
    if (this.currentKey) {
      zeroKey(this.currentKey);
      this.currentKey = null;
    }

    this.currentKey = keyBytes;
    this.keyIndex = payload.key_index;
    this.epoch = payload.epoch;

    await this.applyKeyToProvider(this.currentKey);
    this.setState('ACTIVE');

    safeCryptoLogger.info(
      'CallKeyManager',
      `Applied incoming call key from ${payload.sender_device_id} (keyIndex: ${this.keyIndex}, epoch: ${this.epoch})`
    );
  }
```

---

## 4. Architecture & Blueprint: Olm 1:1 Encryption Wrapping

### 4.1 The Cryptographic Leak Problem
In `broadcastCallKeyToParticipants` (`client/src/crypto/callKeys.ts:323-356`):
```typescript
const payload: CallKeyToDevicePayload = {
  msg_type: 'call_key',
  call_id: this.callId,
  key: keyB64, // <-- Raw 256-bit symmetric key in plaintext Base64!
  key_index: this.keyIndex,
  epoch: this.epoch,
  sender_device_id: this.myDeviceId,
};
```
When this message is sent via `api.e2ee.sendToDevice`, the backend handler (`backend/internal/handlers/e2ee_handlers.go:718`) executes:
```sql
INSERT INTO e2ee_to_device (recipient_device_id, sender_device_id, msg_type, payload, created_at)
VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
```
This stores the raw 256-bit symmetric call key directly in the PostgreSQL database table in cleartext. Any party with database read access (DBA, compromised SQL connection, server log dump) can read the symmetric key and decrypt WebRTC voice and video streams.

### 4.2 Olm 1:1 Double-Ratchet Solution
The Matrix / Megolm specification dictates that symmetric conference/room keys are distributed across 1:1 Olm channels established between each pair of participant devices.
ZeroVC already contains the required cryptographic primitive in `client/src/crypto/olmSession.ts` (`OlmSessionManager`) backed by `@kinsh/vodozemac-wasm`:
- `createOutboundSession(peerDeviceId, peerCurve25519Identity, peerOtkCurve25519)`
- `encryptToDeviceMessage(session, payload)` -> `{ type: 0 | 1, body: string }`
- `handleInboundPreKeyMessage(peerDeviceId, prekeyBody)` -> `{ session, plaintext, senderIdentityKey }`
- `decryptNormalMessage(session, body)` -> `plaintext`

### 4.3 Dual-Layer Message Envelope Format

To preserve complete backward compatibility with existing tests (`test:livekit-m4` lines 320-335 assert on `msg_type: 'call_key'`), the wire format should be defined as:

```typescript
export interface CallKeyToDevicePayload {
  msg_type: 'call_key';
  call_id: string;
  sender_device_id: string;
  // Inner key payload fields (present in plaintext or inside decrypted Olm envelope):
  key?: string;
  key_index?: number;
  epoch?: number;
  // Outer Olm wrapper fields (present when encrypted over the wire):
  olm_type?: 0 | 1; // 0 = PreKey, 1 = Normal
  ciphertext?: string; // Base64 ciphertext produced by vodozemac Session.encrypt()
}
```

#### Wire Flow:
1. **Inner Payload Construction**:
   ```typescript
   const innerPayload = {
     msg_type: 'call_key',
     call_id: this.callId,
     key: uint8ArrayToBase64(key),
     key_index: this.keyIndex,
     epoch: this.epoch,
     sender_device_id: this.myDeviceId,
   };
   ```
2. **Olm 1:1 Encryption**:
   For each `recipientDeviceId`:
   ```typescript
   const session = await olmSessionManager.getOrCreateSession(recipientDeviceId);
   const encrypted = await olmSessionManager.encryptToDeviceMessage(session, innerPayload);
   
   const outerWireMessage = {
     recipient_device_id: recipientDeviceId,
     sender_device_id: this.myDeviceId!,
     msg_type: 'call_key',
     payload: JSON.stringify({
       msg_type: 'call_key',
       call_id: this.callId,
       sender_device_id: this.myDeviceId!,
       olm_type: encrypted.type,
       ciphertext: encrypted.body,
     }),
   };
   ```
3. **Database View**:
   PostgreSQL stores:
   `{"msg_type":"call_key","call_id":"...","sender_device_id":"...","olm_type":0,"ciphertext":"<opaque base64>"}`
   The master key `key` is **never** sent to or seen by the server.
4. **Recipient Decryption & Guard Enforcement**:
   In `CallKeyManager.handleIncomingCallKey`:
   - If `payload.ciphertext` is present, decrypt using `olmSessionManager` (via `handleInboundPreKeyMessage` for type 0 or `decryptNormalMessage` for type 1).
   - If `payload.key` is present (plaintext mode for unit tests and local fixtures), process directly.
   - Run the 4 security guards on the resolved payload.

### 4.4 Resolving `getSessionForDevice` in `olmSession.ts`
Currently, `OlmSessionManager` in `client/src/crypto/olmSession.ts` only has `getSession(sessionId: string)`.
To support device-based lookups, `OlmSessionManager` should be enhanced with:
```typescript
// Map from peerDeviceId to active sessionId
private deviceSessions: Map<string, string> = new Map();

async getSessionForDevice(peerDeviceId: string): Promise<Session | null> {
  const sessionId = this.deviceSessions.get(peerDeviceId);
  if (sessionId) {
    return this.getSession(sessionId);
  }
  return null;
}
```
When `createOutboundSession` or `handleInboundPreKeyMessage` succeeds, record:
`this.deviceSessions.set(peerDeviceId, session.sessionId());`

---

## 5. Critical Co-requisites from Reviewer M4-1 Audit

Reviewer M4-1 identified two additional systemic issues in `client/src/stores/voiceStore.ts` that the remediation implementer must coordinate with:

1. **User ID vs Device ID Collision (Finding 2)**:
   - In `voiceStore.ts:251-256`, `onParticipantConnected: (p) => callKeyManager.handleParticipantJoined(p.identity)`.
   - `participant.identity` is the LiveKit user UUID (`backend/internal/voice/livekit.go:36`), not their device UUID.
   - When `broadcastCallKeyToParticipants` sends to `p.identity`, PostgreSQL rejects it with foreign key violation `e2ee_to_device_recipient_device_id_fkey REFERENCES e2ee_devices(id)`.
   - **Resolution**: Ensure the LiveKit token/metadata contains `"device_id": deviceId`, and `voiceStore.ts` extracts `participant.metadata?.device_id` before passing to `callKeyManager`.
2. **Pre-existing Room Participants on Join (Finding 4)**:
   - LiveKit's `onParticipantConnected` does not fire for participants already in the room when joining.
   - In `voiceStore.ts:connectLiveKitRoom`, iterate `livekit.getRoom().remoteParticipants` immediately after connection and call `handleParticipantJoined` for each remote device.
3. **Resource Leak Cleanup (Finding 5)**:
   - In `callKeyManager.endCall()`, invoke `livekitE2EEManager.cleanup()` to terminate the background WebRTC insertable stream Web Worker.

---

## 6. Implementation Checklist for Worker Agent

The remediation implementer agent (`worker_m4_remediation`) should apply changes in the following sequence:

1. [ ] **Update `client/src/crypto/callKeys.ts`**:
   - Update `handleIncomingCallKey` with the 4 security guards (Lines 361-408).
   - Ensure `isDistributor()`, `distributorDeviceId`, `myDeviceId`, and `keyIndex` guards are evaluated before key allocation.
   - Add support for unpacking `payload.ciphertext` via `olmSessionManager` if ciphertext is detected.
2. [ ] **Update `client/src/crypto/olmSession.ts`**:
   - Add `getSessionForDevice(peerDeviceId: string): Promise<Session | null>` and cache map.
3. [ ] **Update `client/src/stores/voiceStore.ts`**:
   - Extract device IDs from participant metadata for `callKeyManager.handleParticipantJoined`.
   - Sync pre-existing room participants upon `livekit.connect` completion.
   - Call `livekitE2EEManager.cleanup()` in `endCall()`.
4. [ ] **Verify Test Suites**:
   - `npm run test:callkeys-adversarial --prefix client` (Expect 21/21 PASS, 100% GREEN).
   - `npx tsx scripts/test-challenger-m4-2-adversarial.ts` (Expect 17/17 PASS, 100% GREEN).
   - `npm run test:livekit-m4 --prefix client` (Expect 26/26 PASS, 100% GREEN).
   - `npm run test:livekit-gate --prefix client` (Expect 23/23 PASS, 100% GREEN).
   - `npm run build --prefix client` (TypeScript 0 errors).
