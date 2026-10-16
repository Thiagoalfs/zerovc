# Gate Status — Milestone M4 (Chamadas de Voz/Vídeo E2EE LiveKit)

## Gate — Iteration 1
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_m4_remediation | teamwork_preview_worker | DONE | handoff.md |
| auditor_m4_1 | teamwork_preview_auditor | INTEGRITY VIOLATION | handoff.md |
| reviewer_m4_1 | teamwork_preview_reviewer | REQUEST_CHANGES | handoff.md |
| reviewer_m4_2 | teamwork_preview_reviewer | REQUEST_CHANGES | handoff.md |
| challenger_m4_1 | teamwork_preview_challenger | REQUEST_CHANGES | handoff.md |
| challenger_m4_2 | teamwork_preview_challenger | REQUEST_CHANGES | handoff.md |

Gate Result: **FAIL** (auditor_m4_1 INTEGRITY VIOLATION & unanimous REQUEST_CHANGES)

---

## Gate — Iteration 2
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_m4_remediation_iter2 | teamwork_preview_worker | DONE (All 4 areas hardened, 8/8 suites green) | handoff.md |
| reviewer_m4_1_iter2 | teamwork_preview_reviewer | APPROVE | handoff.md |
| reviewer_m4_2_iter2 | teamwork_preview_reviewer | APPROVE | handoff.md |
| challenger_m4_1_iter2 | teamwork_preview_challenger | APPROVE (21/21 stress tests PASS) | handoff.md |
| challenger_m4_2_iter2 | teamwork_preview_challenger | APPROVE (17/17 client, 3/3 backend PASS) | handoff.md |
| auditor_m4_1_iter2 | teamwork_preview_auditor | CLEAN (All 5 Checks Certified PASS) | handoff.md |

Gate Result: **PASS**

### Summary of Verified Capabilities in M4:
1. **LiveKit Voice/Video SFrame & E2EE Key Provider**: ExternalE2EEKeyProvider with WebRTC SFrame worker integrated into `livekit.ts` via `new Room({ e2ee })` and enabled via `room.setE2EEEnabled(true)`.
2. **Deterministic Distributor Election**: Canonical $\min_{\text{lex}}(\text{device\_id})$ elected across participants with zero split-brain or network negotiation overhead.
3. **Ratchet Rotations & Secrecy**: Backward secrecy upon participant join (new key generated and distributed) and Forward secrecy upon participant leave (re-keying excluding departed participant), debounced between 150-250ms.
4. **Adversarial Cryptographic Guards in `callKeys.ts`**:
   - `ROGUE_DISTRIBUTOR_INJECTION`: Distributor strictly ignores peer keys.
   - `UNAUTHORIZED_SENDER`: Non-distributor clients only accept keys from elected distributor.
   - `KEY_REPLAY_DOWNGRADE`: Monotonic ratchet index enforced (`payload.key_index <= this.keyIndex` rejected).
   - `ECHO_ACCEPTANCE`: Self-reflected messages dropped.
5. **Strict Anti-Fallback Call Gate**: `checkCallEligibility({ isE2EERoom: true })` blocks unencrypted WebRTC connection and emits `zerovc:upgrade_required` modal if environment lacks insertable streams.
6. **Store Integration & Pre-Existing Roster**: `voiceStore.ts` safely parses metadata for `device_id`, uses valid RFC4122 UUIDs, registers existing participants from `remoteParticipants` on room connect, and cleans up WebRTC workers on disconnect via `livekitE2EEManager.cleanup()`.
7. **Backend Production Handlers & Metadata**: `BuildLiveKitParticipantMetadata` exported and used by Guild Voice, DM Call, and DM Group Voice, injecting `e2ee_required: true` and `user_id`. Typed response structs `DMCallInviteResponse`, `DMCallAcceptResponse`, and `DMGroupVoiceTokenResponse` returned.
8. **Forensic Integrity Certification**: `backend/internal/handlers/e2ee_m4_test.go` and `e2ee_m4_challenger_test.go` genuinely exercise production code with zero dummy closures or inline maps.

---

# Gate Status — Milestone M5 (Canais Criptografados de Servidor e Audiência Escalonada)

## Gate — Iteration 1
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_m5 | teamwork_preview_worker | DONE (22/22 tests pass, build 0 errors) | handoff.md |
| auditor_m5_1 | teamwork_preview_auditor | CLEAN (All 5 Checks Certified PASS) | handoff.md |
| reviewer_m5_1 | teamwork_preview_reviewer | APPROVE (All suites 100% green, static analysis clean) | handoff.md |
| reviewer_m5_2 | teamwork_preview_reviewer | APPROVE (181/181 e2e, non-E2EE isolation, unread counter decoupling) | handoff.md |
| challenger_m5_1 | teamwork_preview_challenger | APPROVE (Go -race debouncer storm, 10/10 TS stress, stepped limits) | handoff.md |
| challenger_m5_2 | teamwork_preview_challenger | APPROVE (24/24 TS adversarial, 19 Go challenger subtests, HTTP 409 gating) | handoff.md |

Gate Result: **PASS** (Unanimous Approval across Reviewers, Challengers, and Forensic Auditor)

### Summary of Verified Capabilities in M5:
1. **Discord-Style Hierarchical Permissions**:
   - `RecomputeAudience` in `backend/internal/handlers/e2ee_audience.go` accurately resolves guild owner bypass, administrator bypass (`PermAdministrator` 1 << 3), `@everyone` overwrites for `PermViewChannel` (1 << 14), member role overwrites, and guild bans.
2. **Stepped Audience Limits & Safeguards**:
   - Explicit stepped limit tiers (15 -> 50 -> 250) enforced on channel creation and membership/role modifications. Rejects overflow with HTTP 403 / 400 `audience_limit_exceeded` without exposing plaintext.
3. **Deterministic Order-Invariant Hashing**:
   - `ComputeAudienceHash` sorts member UUIDs and device tuples lexicographically, computing standard SHA-256 hex string. Permuted member/device lists produce identical hashes with zero unwanted epoch bumps.
4. **Member Churn Debouncer**:
   - `ChannelAudienceDebouncer` uses mutex-protected 500ms sliding coalescing window. Validated under 60-event churn storms with Go `-race` detector, firing exactly 1 database recomputation per quiet period.
5. **Anti-Leak Plaintext Gating**:
   - Backend enforces strict HTTP 409 `e2ee_required` if plaintext is sent to an E2EE channel, and HTTP 409 `e2ee_not_enabled` if encrypted payload is sent to standard channel. For E2EE messages, backend overwrites `content = ""` before database INSERT.
6. **Outbound Session Invalidation & Forward Secrecy**:
   - Client listens for `E2EE_ROTATION_REQUIRED` WebSocket events and purges outbound Megolm session. Expelled members or new joiners cannot decrypt past or future unauthorized messages.
7. **Unread Counters Decoupling & Non-E2EE Non-Regression**:
   - Unread counts and chat badges increment synchronously in UI store before asynchronous Megolm decryption queues, ensuring no chat feed freezes. Standard channels operate with zero encryption overhead.
8. **User Global Rules Adherence**:
   - Zero `git push` executed. State modification endpoints use HTTP `POST` exclusively with constant-time CSRF verification (`subtle.ConstantTimeCompare`). No TLS bypass in cURL.

---

# Gate Status — Milestone M6 (Gerenciamento de Recuperação, Verificação e UI Segura)

## Gate — Iteration 1
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_m6 | teamwork_preview_worker | DONE (23/23 tests pass, clean build) | handoff.md |
| auditor_m6_1 | teamwork_preview_auditor | CLEAN (Zero leak, authenticated WebCrypto, zero secrets in DOM) | handoff.md |
| reviewer_m6_1 | teamwork_preview_reviewer | APPROVE (PBKDF2/AES-GCM derivation, clean UI separation) | handoff.md |
| reviewer_m6_2 | teamwork_preview_reviewer | APPROVE (181/181 e2e regression PASS, no DOM exposure) | handoff.md |
| challenger_m6_1 | teamwork_preview_challenger | APPROVE (Tampered salt/tag rejections, invalid key parsing) | handoff.md |
| challenger_m6_2 | teamwork_preview_challenger | APPROVE (Commutative safety numbers, offline SVG QR) | handoff.md |

Gate Result: **PASS** (Unanimous Approval across Reviewers, Challengers, and Forensic Auditor)

### Summary of Verified Capabilities in M6:
1. **256-bit Recovery Key Generation & Zero-Knowledge**:
   - `generateRecoveryKey` in `recovery.ts` generates 32 bytes of CSPRNG raw entropy, formatted into canonical `ZVC-` chunks. Zero plaintext recovery key transmitted over network or persisted in unencrypted storage.
2. **PBKDF2 & AES-GCM Key Derivation**:
   - WebCrypto PBKDF2 (100,000 iterations, SHA-256) deriving non-extractable 256-bit AES-GCM CryptoKey. Authenticated encryption/decryption rejects tampered tags, mismatched salts, and corrupt payloads.
3. **In-Place Memory Zeroization**:
   - Sensitive byte buffers cleared via `zeroBuffer()` immediately after derivation and key import, preventing memory scraping.
4. **Commutative Safety Number (60 Decimal Digits)**:
   - Order-independent SHA-256 fingerprinting of sorted Ed25519 identity keys formatted into 12 blocks of 5 digits, matching across both communication peers.
5. **100% Offline Native SVG QR Code**:
   - QR code matrix rendered purely in SVG client-side without any third-party HTTP/CDN requests, eliminating exposure of identity keys or fingerprints.
6. **Encrypted Cloud Backup with 90-Day TTL**:
   - `e2ee_key_backups` table in PostgreSQL stores encrypted Megolm inbound session bundles with 90-day expiration. Endpoints (`POST`, `GET`, `DELETE` at `/api/e2ee/backup`) protected by session authentication and constant-time CSRF verification.
7. **Secure UI in Settings**:
   - `SecurityView.tsx`, `RecoveryKeyModal.tsx`, and `DeviceVerificationModal.tsx` in `ProfileModal` providing device list, verification badges, and immediate device revocation without DOM leaks.
8. **User Global Rules Adherence**:
   - Zero `git push` executed. All mutation endpoints use HTTP `POST` with CSRF HMAC. Zero secrets leaked in DOM or logs.


