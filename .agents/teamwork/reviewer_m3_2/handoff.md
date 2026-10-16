# Milestone M3 Frontend Review & Adversarial Challenge Report

## Review Summary

**Verdict**: APPROVE

**Role**: Reviewer M3.2 (Frontend Code Reviewer & Adversarial Critic)  
**Parent**: orchestrator_gen2 (`e52a8903-b2c2-47c9-abdc-a9d7e7091fdf`)  
**Target Scope**: Milestone M3 TypeScript/React frontend implementation (`client/`)  
**Integrity Audit**: Clean. No hardcoded test shortcuts, no dummy facades, no fabricated outputs, no self-certifying shortcuts detected.

---

## 1. Observation

### 1.1 Direct Code Observations
- **`client/src/crypto/envelope.ts`**:
  - Lines 59–70: Implemented `canonicalJsonStringify(obj)` conforming to RFC 8785 (lexicographically sorted UTF-16 keys, omitted undefined fields, compact token serialization).
  - Lines 75–133: `serializeEnvelope(env)` validates `v: 1` and `typeof env.body === 'string'`. Enforces normalized lowercase SHA-256 digests and sorted mentions.
  - Lines 138–207: `parseEnvelope(serialized)` safely validates JSON object structure and rejects versions other than 1 with `UNSUPPORTED_ENVELOPE_VERSION`.
- **`client/src/crypto/attachments.ts`**:
  - Lines 69–107: `encryptAttachmentData` creates single-use 256-bit WebCrypto AES-GCM key (`length: 256`), 96-bit (12-byte) random IV (`crypto.getRandomValues(new Uint8Array(12))`), and computes lowercase 64-character hex SHA-256 digest over ciphertext.
  - Lines 112–145: `decryptAttachmentData` strictly compares computed SHA-256 against `expectedSha256Hex` before importing key or decrypting (`if (computedHash.toLowerCase() !== expectedSha256Hex.toLowerCase()) throw new Error('Falha de integridade do anexo: hash SHA-256 divergente')`).
  - Lines 150–174: `decryptEnvelopeAttachment` handles both preloaded ciphertext and remote blob retrieval.
- **`client/src/crypto/megolmSession.ts`**:
  - Lines 62–92: `getOrCreateOutboundSession` reuses active outbound session only if `storedEpoch === currentEpoch`, session age `< 7 days`, and `messageIndex < 100`. Otherwise creates fresh `GroupSession` and exports `sessionKey()`.
  - Lines 97–104: `invalidateOutboundSession` explicitly purges outbound record from KeyStore to guarantee ratchet rotation and history isolation.
  - Lines 109–147: `distributeRoomKey` sends to-device `room_key` payloads via `api.e2ee.sendToDevice`, automatically filtering out the sender's own `device_id`.
  - Lines 152–183: `encryptMessage` advances Megolm ratchet, computes SHA-256 hash of ciphertext, and packages `E2EEMeta` with `alg: 'm.megolm.v1.aes-sha2'`.
  - Lines 226–248: `decryptMessage` retrieves pickle from KeyStore (or throws `KEY_MISSING`), enforces anti-replay / ratchet monotonic check (`if (parsed.messageIndex !== expectedIndex) throw new Error('REPLAY_OR_INDEX_MISMATCH...')`), persists advanced ratchet state, and returns parsed envelope.
  - Lines 253–283: `handleIncomingKeyRequest` checks ownership of requested session and responds with `room_key` to-device message.
- **`client/src/crypto/keyRequestManager.ts`**:
  - Lines 52–132: `queueKeyRequest` enforces 30s TTL deduplication per `(conversationId, sessionId)`, global rate limiting of max 10 requests/min, max 3 attempts per session, and 5-minute cooldown.
  - Lines 138–175: `handleRoomKeyReceived` registers imported InboundGroupSession in KeyStore, clears pending request queue, and notifies registered retroactive decryption listeners.
- **`client/src/messaging/messageCodec.ts`**:
  - Lines 36–130: `decodeMessage` is a pure, functional transformer completely decoupled from Zustand. Never throws: missing keys or cryptographic errors return `{ content: 'Mensagem criptografada indisponível', encrypted: true, decryptionStatus: 'undecryptable', isUndecryptablePlaceholder: true, rawMeta: meta }`. Triggers background `keyRequestManager.queueKeyRequest` when `KEY_MISSING` occurs.
  - Lines 135–187: `encodeMessage` obtains or rotates outbound session, distributes room keys when new, encrypts envelope, and returns `{ encrypted: true, e2ee_ciphertext, e2ee_meta, content: '' }` ensuring transport content is empty string.
- **`client/src/stores/dmStore.ts` & `client/src/stores/dmGroupStore.ts`**:
  - `dmStore.ts` lines 601–622: Unread badges and counts increment synchronously upon raw socket event before asynchronous `messageCodec.decodeMessage` resolves.
  - `dmStore.ts` lines 843–873 & `dmGroupStore.ts` lines 889–919: `keyRequestManager.onSessionImported` retroactively re-decodes cached undecryptable messages upon session key receipt.
  - `dmGroupStore.ts` lines 240–243: `createGroup` rejects creation when `memberIds.length > 14` (total > 15).
  - `dmGroupStore.ts` lines 275–288: `addMembers` rejects additions when `currentCount + memberIds.length > 15`, and invalidates outbound session (`await megolmManager.invalidateOutboundSession(groupId)`) when `e2ee_enabled` is true for forward secrecy / history isolation.
- **UI Components**:
  - `client/src/components/Chat/MessageItem.tsx` lines 779–786 & lines 997–1008: Renders clean isolated placeholder `"Mensagem criptografada indisponível"` with `"Solicitar chave"` action without breaking message feed.
  - `client/src/components/Chat/ChatHeader.tsx` lines 100–108 & lines 125–135: Renders E2EE status badge and opt-in toggle button.
  - `client/src/components/Modals/CreateDMGroupModal.tsx` line 54 & `AddDMGroupMembersModal.tsx` line 62: Enforces 15-member total cap and displays history isolation disclosure.
  - `client/src/App.tsx` lines 1341–1395 & lines 1439–1441: Registers and cleans up WebSocket handlers for `E2EE_TO_DEVICE`, `E2EE_ROSTER_UPDATE`, and `E2EE_ROTATION_REQUIRED`.

### 1.2 Verbatim Tool Outputs

#### Test 1: Milestone M3 Frontend Test Suite (`npm run test:frontend-m3`)
```
> zerovc-client@1.0.2 test:frontend-m3
> tsx scripts/test-frontend-m3.ts

============================================================
ZEROVC E2EE — MILESTONE M3 FRONTEND VERIFICATION HARNESS
Production Suite: Megolm, Envelopes, Attachments, Codec, UI Guards
============================================================

  ✓ Outbound session creation: initial messageIndex is 0 and valid sessionId (20.7ms)
  ✓ Reusing active session without rotation when epoch has not changed (1.5ms)
  ✓ Ratchet progression: Encrypting messages advances messageIndex monotonically (3.5ms)
  ✓ Inbound session import and message decryption (4.9ms)
  ✓ Anti-replay & monotonic index verification: Out-of-order or duplicate index rejected (1.2ms)
  ✓ Ratchet rotation on epoch change (membership/roster updated) (0.5ms)
  ✓ Manual session invalidation: invalidateOutboundSession forces fresh session (0.6ms)
  ✓ To-device room_key distribution format verification (0.2ms)
  ✓ Deterministic lexicographical key ordering (0.1ms)
  ✓ Standard text envelope: serializeEnvelope -> parseEnvelope roundtrip (0.0ms)
  ✓ Envelope with attachments: fields preserved and SHA-256 lowercased (0.2ms)
  ✓ Envelope with reaction and edit (0.1ms)
  ✓ Strict version gating: rejects version != 1 (0.1ms)
  ✓ Strict validation: rejects invalid non-string body or malformed JSON (0.0ms)
  ✓ Attachment encryption: produces 256-bit key, 96-bit IV, and 64-char hex SHA-256 (1.1ms)
  ✓ Attachment decryption: exact plaintext recovery (0.6ms)
  ✓ Tamper resistance: Bit flip in ciphertext triggers SHA-256 integrity rejection (0.2ms)
  ✓ Tamper resistance: Incorrect key or IV fails decryption (0.9ms)
  ✓ Decoding plaintext message produces plaintext status without errors (0.1ms)
  ✓ Decoding encrypted message with missing key returns isolated placeholder without throwing (0.3ms)
  ✓ Encoding message with outbound Megolm session succeeds and produces valid payload (1.3ms)
  ✓ Unread count decoupling: Store increments unread count synchronously before async decode (0.7ms)
  ✓ First key_request is transmitted to-device (0.3ms)
  ✓ Deduplication: Duplicate request for same session within 30s TTL is skipped (0.3ms)
  ✓ Global rate limiting: Enforcing max 10 requests per minute (0.8ms)
  ✓ Receiving room_key resolves pending request and triggers retroactive decrypt callback (1.3ms)
  ✓ Create group with > 14 friends throws 15-member cap error (0.2ms)
  ✓ Add members exceeding total 15 members throws cap error (0.3ms)
  ✓ History isolation: Adding member to E2EE group invalidates outbound session (1.5ms)

Total: 29 | Passed: 29 | Failed: 0
ALL TESTS PASSED (100% SUCCESS RATE)
The command exited with code 0.
```

#### Test 2: Milestone M2 Frontend Test Suite (`npm run test:frontend-m2`)
```
> zerovc-client@1.0.2 test:frontend-m2
> tsx scripts/test-frontend-m2.ts

Total Tests:  24
Passed:       24
Failed:       0
The command exited with code 0.
```

#### Test 3: Adversarial Cryptographic Suite (`npm run test:e2ee-adversarial`)
```
> zerovc-client@1.0.2 test:e2ee-adversarial
> tsx scripts/test-adversarial-crypto.ts

============================================================
ADVERSARIAL STRESS TEST SUMMARY
============================================================
✓ Suite 1: Adversarial Ciphertext & MAC Tampering: 9/9 passed
✓ Suite 2: Corrupted & Malformed Pickle Deserialization: 8/8 passed
✓ Suite 3: Replay Attacks & Ratchet Monotonicity: 5/5 passed
✓ Suite 4: Dave Late-Joiner Forward-Secrecy Boundary: 7/7 passed
✓ Suite 5: KeyStore AES-GCM-256 Tamper Resistance & Non-Extractability: 5/5 passed
✓ Suite 6: Ed25519 Signatures & Identity Tamper Resistance: 4/4 passed
✓ Suite 7: Zero-Leakage Safe Logger Audit: 3/3 passed
✓ Suite 8: Boundary, Extreme Load & DoS Resilience: 3/3 passed

Total Suites:     8
Total Tests:      44
Passed:           44
Failed:           0
Verdict:          APPROVED (ALL ADVERSARIAL ATTACKS REJECTED SAFELY)
The command exited with code 0.
```

#### Test 4: Production Build (`npm run build`)
```
> zerovc-client@1.0.2 build
> tsc && vite build && node -e "..."

✓ 2460 modules transformed.
✓ built in 5.95s
The command exited with code 0.
```

---

## 2. Logic Chain

1. **RFC 8785 Serialization Invariance**: Deterministic JSON serialization guarantees that equivalent message structures produce bit-for-bit identical strings across different JavaScript runtime engines, ensuring signature and hash validity.
2. **Client-Side AES-256-GCM Attachments & Hash Verification**: By generating 256-bit symmetric keys and 96-bit IVs client-side, computing SHA-256 digests over ciphertext, and embedding keys only within Megolm envelopes, the server receives exclusively opaque ciphertext blobs without possessing means of decryption. Validating SHA-256 digests prior to decryption prevents Chosen-Ciphertext attacks and malformed input crashes.
3. **Ratchet Progression & History Isolation**:
   - Outbound Megolm ratchets advance monotonically with each message sent.
   - When new members join a DM group, `dmGroupStore.addMembers` invokes `megolmManager.invalidateOutboundSession(groupId)`, forcing the next message to generate a new Megolm session. Because past session keys are never delivered to new members, new participants cannot decrypt historical messages.
4. **Decoupled Architecture & Unread Counters**:
   - `messageCodec` is purely functional and contains no Zustand dependencies.
   - Incrementing unread counters synchronously upon raw WebSocket arrival prevents UI badge lag or counter desynchronization while Vodozemac WASM performs asynchronous decryption.
5. **Resilient Undecryptable Fallback**:
   - `messageCodec.decodeMessage` handles missing session keys or corrupted payloads safely by returning a standardized placeholder string (`"Mensagem criptografada indisponível"`). The UI renders an isolated inline banner with a key request trigger, preserving full chat rendering and message ordering.
6. **Key Request Flood Protection**:
   - A 30s TTL per `(conversationId, sessionId)` paired with a global rate limit of 10 requests per minute and a 3-attempt ceiling prevents denial-of-service storms when clients encounter missing keys.

---

## 3. Adversarial Challenges & Stress-Testing

### Challenge 1: Ciphertext & MAC Bit-Flip Tampering
- **Assumption**: Tampered payloads must not crash the client or leak plaintext fragments.
- **Attack Scenario**: Flipped bits at byte 0, middle, and authentication tags in Megolm ciphertext and attachment blobs.
- **Observed Behavior**: In `test:e2ee-adversarial` Suite 1 and `test:frontend-m3` Suite 3, SHA-256 integrity checks and WebCrypto AES-GCM authentication tags rejected all tampered inputs with deterministic errors (`Falha de integridade do anexo: hash SHA-256 divergente`).
- **Verdict**: PASS.

### Challenge 2: Replay & Monotonic Index Hijacking
- **Assumption**: An attacker replaying old Megolm messages or presenting out-of-order ratchet indices must be rejected.
- **Attack Scenario**: Dispatched identical or out-of-order message indices to an imported `InboundGroupSession`.
- **Observed Behavior**: `decryptMessage` asserted `parsed.messageIndex === expectedIndex` and threw `REPLAY_OR_INDEX_MISMATCH`, preventing ratchet desynchronization or replay attacks.
- **Verdict**: PASS.

### Challenge 3: DM Group 15-Member Cap Bypass
- **Assumption**: Group creation and member additions must strictly enforce the 15-member total ceiling.
- **Attack Scenario**: Attempted group creation with 15 friends (16 total) and member addition to a 10-member group with 6 new friends (16 total).
- **Observed Behavior**: Both store methods immediately threw descriptive validation errors (`"o grupo não pode ultrapassar 15 membros"`), and modal interfaces capped UI selections accordingly.
- **Verdict**: PASS.

### Challenge 4: Secret Leakage & Plaintext Exposure
- **Assumption**: No cryptographic keys, pickles, or conversation plaintext should be exposed in logs, HTTP bodies, or DOM attributes.
- **Attack Scenario**: Audited logger calls, network payloads in `sendMessage`, and rendered React DOM trees.
- **Observed Behavior**: `safeCryptoLogger` automatically scrubs sensitive keywords; `sendMessage` sends `content = ''` over REST for encrypted rooms; private keys remain encapsulated within KeyStore IndexedDB.
- **Verdict**: PASS.

---

## 4. Caveats

No caveats. All requirements specified in `DISPATCH.md` and `PROJECT.md` for Milestone M3 frontend have been implemented, tested, and validated with zero backend modifications and zero regressions.

---

## 5. Conclusion

The Milestone M3 Frontend implementation is complete, cryptographically sound, and production-ready.
- 29/29 tests in `test:frontend-m3` pass.
- 24/24 tests in `test:frontend-m2` pass.
- 44/44 tests in `test:e2ee-adversarial` pass.
- `npm run build` compiles cleanly with exit code 0.
- Strict 15-member cap, history isolation session rotation, pure messageCodec decoupling, and resilient fallback verified.

**Verdict: APPROVE**

---

## 6. Verification Method

To independently verify:
```powershell
cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client"
npm run test:frontend-m3
npm run test:frontend-m2
npm run test:e2ee-adversarial
npm run build
```
