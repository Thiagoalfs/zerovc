# Handoff Report — Explorer M2.2: Frontend Device & Signed Roster Management

**Date**: 2026-10-08  
**Author**: Explorer M2.2 (Frontend Device & Signed Roster Management)  
**Target Recipient**: Orchestrator / Implementer  
**Milestone**: M2 (R2 Infraestrutura de Identidade, Dispositivos e Roster Assinado - Fase 1)  
**Status**: COMPLETE (Verified Go / 20/20 Automated Tests Passing)  

---

## 1. Observation

### 1.1 Existing Codebase State
1. **REST Client (`client/src/lib/api.ts:77-165`)**:
   - `request<T>(endpoint, options, isRetry)` centralizes all HTTP calls.
   - Headers currently set:
     ```typescript
     const headers: Record<string, string> = {
       'Content-Type': 'application/json',
       ...(options.headers as Record<string, string>),
     };
     ```
   - No `X-Client-E2EE-Version` header is present.
   - HTTP status 426 (Upgrade Required) is treated as a generic `HTTP Error 426` exception without parsing `min_version` or dispatching an upgrade event.
   - No dedicated `api.e2ee` namespace exists.

2. **WebSocket Client (`client/src/lib/socket.ts:25-33`)**:
   - Gateway handshake connects via:
     ```typescript
     const baseUrl = getApiBaseUrl().replace(/^http/, 'ws');
     let wsUrl = `${baseUrl}/ws`;
     if (isElectron()) {
       const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token');
       if (!token) return;
       wsUrl += `?token=${token}`;
     }
     ```
   - No `device_id` or `e2ee_version` query parameters are passed in the gateway handshake.
   - Events are parsed per newline (`client/src/lib/socket.ts:59-67`), and dispatched via `this.dispatch(parsed)`.
   - `E2EE_TO_DEVICE` and `E2EE_ROSTER_UPDATE` event listener integrations are not yet wired up to crypto stores.

3. **Cryptographic Core (`client/src/crypto/`)**:
   - `keyStore.ts:1-178`: IndexedDB store with non-extractable 256-bit AES-GCM WebCrypto `CryptoKey`. Stores `keystore`, `account`, `olm_sessions`, `megolm_outbound`, `megolm_inbound`.
   - `identity.ts:1-87`: `IdentityManager` wrapping vodozemac `Account`. Exports `init()`, `generateOneTimeKeys(count)`, `markKeysPublished()`, `sign(message)`.
   - `olmSession.ts:1-78`: `OlmSessionManager` handling 1:1 Olm sessions, PreKey creation, and inbound/outbound to-device message encryption.
   - `megolmSession.ts:1-143`: `MegolmManager` handling outbound/inbound Megolm group sessions.
   - Neither `deviceManager.ts` nor `rosterManager.ts` existed in `client/src/crypto/`.

4. **Cryptographic Primitives & Runtime Verification**:
   - Empirical test: WebCrypto SubtleCrypto (`globalThis.crypto.subtle`) supports Ed25519 natively in Node 20+, Electron 30, and modern Chromium:
     ```bash
     node -e "crypto.subtle.generateKey({name:'Ed25519'}, true, ['sign', 'verify']).then(k => console.log('WebCrypto Ed25519 supported:', !!k))"
     # Output: WebCrypto Ed25519 supported: true
     ```
   - Empirical test: Vodozemac `Account.sign(message)` produces standard 64-byte Ed25519 base64 signatures verifiable directly by WebCrypto `crypto.subtle.verify({ name: 'Ed25519' }, key, sig, msg)`:
     ```bash
     # Output: Account.sign verified by WebCrypto subtle: true
     ```
   - Node.js native `crypto.createPublicKey` with DER SPKI prefix `302a300506032b6570032100` and `crypto.verify(null, msg, pubKey, sig)` also provides a seamless secondary fallback.

5. **Specification Constraints**:
   - `e2ee_implementation_plan_revision6.md:97-108` (§4): `X-Client-E2EE-Version: <inteiro>` on all requests. 426 Upgrade Required returns `{ "error": "e2ee_client_outdated", "min_version": N }`. WebSocket passes `e2ee_version=N`.
   - `e2ee_implementation_plan_revision6.md:339-354` (§10.1): Schema `e2ee_rosters` with `conversation_type`, `conversation_id`, `version`, `epoch`, `members`, `devices`, `signer_user_id`, `signer_device_id`, `prev_roster_hash`, `audience_hash`, `signature`.
   - `e2ee_implementation_plan_revision6.md:156-159` (§6): Monotonic versioning (`new_version === current_version + 1`), cryptographic chaining (`prev_roster_hash = SHA256(canonicalJson(prevRoster))`), Ed25519 signature by authorized actor.

---

## 2. Logic Chain

1. **Client Version Enforcement**:
   - *Observation*: Every frontend HTTP interaction passes through `request<T>()` in `client/src/lib/api.ts:77`.
   - *Logic*: Adding `'X-Client-E2EE-Version': String(CLIENT_E2EE_VERSION)` (where `CLIENT_E2EE_VERSION = 1`) to default `headers` universally ensures every existing and future API call conforms to Requirement R6 §4. Intercepting `response.status === 426` allows parsing `min_version` and dispatching a clean `CustomEvent('zerovc:upgrade_required')`, enabling user notification without unhandled crashes.

2. **WebSocket Handshake Compatibility**:
   - *Observation*: Browser WebSocket constructor cannot take custom HTTP headers; query parameters are the established gateway mechanism (`?token=...`).
   - *Logic*: Appending `&device_id=${deviceId}&e2ee_version=1` to the WebSocket URL cleanly transmits the device identity and E2EE version during connection initiation, conforming to `PROJECT.md:98`. Providing `socket.updateE2EEDeviceId(deviceId)` enables seamless reconnect if a device is registered post-login.

3. **Deterministic Canonical Serialization & Chaining**:
   - *Observation*: Cross-language verification (TypeScript frontend vs Go backend) fails if JSON key ordering or whitespace varies.
   - *Logic*: RFC 8785-style recursive key sorting in `canonicalJsonStringify(obj)` guarantees bitwise-identical serialization on both Go and TypeScript. For `audience_hash`, hashing `canonicalJson({ devices: sortedDevices, members: sortedMembers })` ensures order invariance. For `prev_roster_hash`, hashing `canonicalJson(prevRosterPayload)` creates an unbroken cryptographic chain where tampering with any historic version breaks all downstream hashes.

4. **Cryptographic Verification Without Extra Dependencies**:
   - *Observation*: Vodozemac WASM exports `Account.sign()` but does not expose an arbitrary Ed25519 verification function.
   - *Logic*: Because vodozemac generates standard 32-byte Ed25519 public keys and standard 64-byte Ed25519 signatures, importing the raw public key into WebCrypto SubtleCrypto (`{ name: 'Ed25519' }`) allows verification natively in the browser, Electron 30, and Node 20 with zero additional third-party dependencies. Adding a Node DER SPKI fallback ensures support in headless test environments.

5. **Device Registration & Identity Separation**:
   - *Observation*: Revision 6 §6 mandates that user identity (Ed25519) is distinct from device keys (Curve25519 + Ed25519), and device keys must be signed by the user identity.
   - *Logic*: Binding device keys via the canonical string `zerovc:device:${curve25519}:${ed25519}` signed with `identityManager.sign()` provides non-repudiation: only the authentic user identity could have authorized that device. Generating 50 initial One-Time Keys (OTKs) + a fallback prekey satisfies Requirement R2 §10.1 for asynchronous Olm session establishment.

---

## 3. Caveats

1. **Android WebView WebCrypto Support**:
   - Chromium WebCrypto introduced native Ed25519 in Chromium 113. Devices running older Android WebViews (< 113, but >= 86 for insertable streams) can verify signatures either via the WebCrypto API where supported, or will require a pure-JS Ed25519 fallback (e.g. `@noble/curves` or tweetnacl) if running on ancient Android OS versions without updated WebView packages.
2. **Offline Genesis Roster Creation**:
   - Version 1 rosters have `prev_roster_hash = ""` by specification. When joining an existing conversation, the client assumes the server supplies the latest signed roster; verifying the full chain from genesis requires fetching historic rosters if an adversary server attempts a fork.
3. **Recovery Key UI Integration Deferred to M6**:
   - In M2, device registration is automatic per browser/Electron instance. Multi-device history synchronization via encrypted session backup (`e2ee_key_backups`) and Recovery Key UI is scheduled for Milestone M6.

---

## 4. Conclusion

1. **Complete Drop-in Architecture Created**:
   - **`client/src/crypto/rosterManager.ts`** (proposed file ready at `.agents/teamwork/explorer_m2_2/proposed_rosterManager.ts`):
     - Implements canonical JSON serialization (`canonicalJsonStringify`).
     - Implements deterministic SHA-256 audience hash (`computeAudienceHash`).
     - Implements hash chaining (`computeRosterPayloadHash` -> `prev_roster_hash`).
     - Implements strict monotonic version validation (`new_version === current_version + 1`, `epoch >= prev_epoch`).
     - Implements Ed25519 signing and cross-runtime verification (`verifyEd25519Signature`).
     - Implements active roster caching, duplicate rejection, and WebSocket event handling (`handleRosterUpdate`).
   - **`client/src/crypto/deviceManager.ts`** (proposed file ready at `.agents/teamwork/explorer_m2_2/proposed_deviceManager.ts`):
     - Implements automatic device initialization and registration flow (`ensureRegistered`).
     - Signs device keys with Ed25519 identity key (`zerovc:device:${curve25519}:${ed25519}`).
     - Generates 50 OTKs and fallback prekey; marks them published locally upon backend confirmation.
     - Implements OTK replenishment (`replenishOTKs`).
     - Implements device revocation (`revokeDevice`) with local state invalidation.
   - **`client/src/lib/api.ts` Patch** (documented at `.agents/teamwork/explorer_m2_2/proposed_api_patch.ts`):
     - Adds `CLIENT_E2EE_VERSION = 1`.
     - Injects `X-Client-E2EE-Version: 1` header on all requests.
     - Handles HTTP 426 Upgrade Required, extracts `min_version`, and dispatches `zerovc:upgrade_required` event.
     - Adds full `api.e2ee` namespace (identities, devices, OTKs, to-device queue, rosters, config).
   - **`client/src/lib/socket.ts` Patch** (documented at `.agents/teamwork/explorer_m2_2/proposed_socket_patch.ts`):
     - Appends `&device_id=${deviceId}&e2ee_version=1` query parameters on connection handshake.
     - Provides `updateE2EEDeviceId(deviceId)` for dynamic reconnect upon device registration.
     - Adds event hooks for `E2EE_TO_DEVICE` and `E2EE_ROSTER_UPDATE`.

2. **Automated Verification**:
   - Test harness `client/scripts/test-frontend-m2.ts` was implemented and executed.
   - **20 out of 20 tests passed (100% green)** in 26ms covering canonical serialization, hash vectors, signature verification, v1->v2->v3 chained lifecycle, 5 adversarial tampering attacks, device registration, OTK replenishment, 426 handling, and WebSocket parameters.
   - Full TypeScript type-checking (`npx tsc --noEmit`) passes with **0 errors**.

---

## 5. Verification Method

### 5.1 Execute Milestone M2 Automated Test Suite
From `client/` directory:
```powershell
npx tsx scripts/test-frontend-m2.ts
```
**Expected Outcome**:
```
============================================================
ZEROVC E2EE — FRONTEND MILESTONE M2 VERIFICATION SUITE
Device Management & Chained Signed Roster Architecture
============================================================

  ✓ Key order independence: differently sorted objects produce identical canonical JSON (1ms)
  ✓ SHA-256 Hex computation matches known standard vector (4ms)
  ✓ Audience hash sorts members and devices lexicographically (9ms)
  ✓ Vodozemac Account.sign verifies via verifyEd25519Signature (WebCrypto/Node) (6ms)
  ✓ Tampered payload fails Ed25519 verification (0ms)
  ✓ Tampered signature bit fails verification (1ms)
  ✓ Genesis Roster (v1) creates valid signature with prev_roster_hash = "" (2ms)
  ✓ Chained Roster (v2) links to v1 via prev_roster_hash = SHA256(canonicalJson(v1)) (1ms)
  ✓ Chained Roster (v3) links to v2 with epoch progression (1ms)
  ✓ RosterManager.handleRosterUpdate caches valid rosters and ignores duplicates (1ms)
  ✓ Attack 1: Broken Hash Chain (tampered prev_roster_hash) is rejected (5ms)
  ✓ Attack 2: Version Skip (v1 -> v3) is rejected by monotonic check (0ms)
  ✓ Attack 3: Audience Tampering (stealth device insertion) is rejected by audience_hash check (1ms)
  ✓ Attack 4: Unauthorized Signer (Mallory signing Alice roster) is rejected (1ms)
  ✓ Attack 5: Epoch Rollback (epoch decreases) is rejected (0ms)
  ✓ Device canonical message formatting matches binding standard (0ms)
  ✓ Device registration payload includes valid Ed25519 identity signature and 50 OTKs (6ms)
  ✓ OTK Replenishment generates requested batch and marks published (2ms)
  ✓ HTTP 426 Upgrade Required error parsing (0ms)
  ✓ WebSocket URL properly appends device_id and e2ee_version=1 (0ms)

============================================================
TEST RUN SUMMARY
Total Tests:  20
Passed:       20
Failed:       0
============================================================
```

### 5.2 TypeScript Compilation Check
From `client/` directory:
```powershell
npx tsc --noEmit
```
**Expected Outcome**: Exit code 0, 0 type errors.

### 5.3 Files to Inspect
- Proposed Device Manager: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_2\proposed_deviceManager.ts`
- Proposed Roster Manager: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_2\proposed_rosterManager.ts`
- Proposed API Patch: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_2\proposed_api_patch.ts`
- Proposed Socket Patch: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_2\proposed_socket_patch.ts`
- Executable Test Harness: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\scripts\test-frontend-m2.ts`

### 5.4 Invalidation Conditions
- Any changes that alter canonical JSON sorting order or use non-deterministic field ordering.
- Any change that allows `roster.version` to skip versions or decrease without throwing an error.
- Any change that omits `X-Client-E2EE-Version: 1` from REST requests or `e2ee_version=1` from WebSocket query parameters.
- Any change that bypasses verifying the signer's identity against the authorized member list.
