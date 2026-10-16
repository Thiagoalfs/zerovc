# Gate Status — Milestone M2 (Identidade, Dispositivos e Roster Assinado)

## Gate — Iteration 1
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_m2_gen2 | teamwork_preview_worker | DONE | handoff.md |
| reviewer_m2_1 | teamwork_preview_reviewer | REQUEST_CHANGES | handoff.md |
| reviewer_m2_2 | teamwork_preview_reviewer | REQUEST_CHANGES | handoff.md |
| challenger_m2_1 | teamwork_preview_challenger | APPROVE | handoff.md |
| challenger_m2_2 | teamwork_preview_challenger | REQUEST_CHANGES | handoff.md |
| auditor_m2_1 | teamwork_preview_auditor | CLEAN | handoff.md |

Gate Result: **FAIL** (Remediation required on 9 concrete items)

---

## Gate — Iteration 2
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_m2_remediation | teamwork_preview_worker | DONE (All 9 fixes applied, 100% tests green) | handoff.md |
| reviewer_m2_1_iter2 | teamwork_preview_reviewer | APPROVE | handoff.md |
| reviewer_m2_2_iter2 | teamwork_preview_reviewer | APPROVE | handoff.md |
| challenger_m2_1_iter2 | teamwork_preview_challenger | APPROVE | handoff.md |
| challenger_m2_2_iter2 | teamwork_preview_challenger | APPROVE | handoff.md |
| auditor_m2_1_iter2 | teamwork_preview_auditor | CLEAN | handoff.md |

Gate Result: **PASS**

### Summary of Verified Remediations in M2:
1. **Audience Key Sensitivity**: `ComputeAudienceHash` binds `UserID:DeviceID:CurveKey:EdKey`. Key tampering or substitution strictly alters audience hash.
2. **WebSocket Gateway Protection**: Device ownership verified against `e2ee_devices` (revoked/unowned devices rejected). Unregister guard prevents duplicate socket disconnect races. Outdated clients rejected with HTTP 426 on handshake.
3. **OTK Filtering**: `ClaimKeys` filters out revoked devices via `d.revoked_at IS NULL`.
4. **Roster Protection**: Epoch rollbacks rejected with HTTP 409 `e2ee_roster_epoch_rollback`. Signer authorization enforced against `prevRoster.members`. Roster collisions return HTTP 409 `e2ee_roster_conflict`.
5. **Frontend Runtime Compatibility**: `api.ts` guards `localStorage` across all call sites, eliminating Node.js/SSR crashes.
6. **Roster Bootstrapping**: `bootstrapRoster(roster)` handles cold-start and reconnection snapshots for rooms with `version > 1`.
7. **Gateway Push Mapping**: `socket.updateE2EEDeviceId(registered.id)` synchronizes active device ID on registration.
8. **Test Integrity**: `test-frontend-m2.ts` directly imports production modules (`rosterManager`, `deviceManager`, `api`, `socket`, `identityManager`). Zero facade stubs or duplicate mock code.


---

# Gate Status — Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4)

## Gate — Iteration 1
| Agent | Role | Verdict | Source |
|-------|------|---------|--------|
| worker_m3_backend | teamwork_preview_worker | DONE (`go build` code 0, `go test` 100% PASS) | handoff.md |
| worker_m3_frontend | teamwork_preview_worker | DONE (`npm run build` code 0, 29/29 tests PASS) | handoff.md |
| reviewer_m3_1 | teamwork_preview_reviewer | APPROVE | handoff.md |
| reviewer_m3_2 | teamwork_preview_reviewer | APPROVE | handoff.md |
| challenger_m3_1 | teamwork_preview_challenger | APPROVE (33/33 adversarial subtests PASS) | handoff.md |
| challenger_m3_2 | teamwork_preview_challenger | APPROVE (14/14 stress scenarios PASS, 181/181 E2E PASS) | handoff.md |
| auditor_m3_1 | teamwork_preview_auditor | CLEAN | handoff.md |

Gate Result: **PASS**

### Summary of Verified Capabilities in M3:
1. **Plaintext Gating Matrix**: Unconditional rejection of cleartext in E2EE rooms with HTTP 409 `e2ee_required`, and rejection of encrypted payloads in non-E2EE rooms with HTTP 409 `e2ee_not_enabled`.
2. **Zero Plaintext Storage**: `content = ''` strictly enforced in database on encrypted message insertion. PostgreSQL `messages_search_vector_update` evaluates to empty vector; lateral join previews and full-text searches return zero cleartext.
3. **Idempotency Contract**: Concurrency protected by composite unique indexes `(dm_room_id, id)`, `(group_id, id)`, and `(channel_id, id)`. Retries with identical payload return 200 OK without duplicating records or WebSocket events; conflicting payloads return 409 Conflict.
4. **DM Group 15-Member Cap & History Isolation**: Enforced strictly at backend (HTTP 400) and frontend modals/stores. Member addition/removal increments `rotation_epoch++`, broadcasts `E2EE_ROTATION_REQUIRED`, and invalidates local Megolm outbound sessions so new members cannot decrypt past messages.
5. **Canonical Envelopes (RFC 8785)**: Deterministic JSON serialization of text, mentions, attachments, reactions, and edits with `v: 1` version gating.
6. **Encrypted Attachments (AES-256-GCM)**: Ephemeral 256-bit symmetric keys, 96-bit random IVs, and SHA-256 digest validation client-side before decryption. Server stores opaque blobs with `Content-Disposition: attachment; filename="encrypted.bin"` and `X-Content-Type-Options: nosniff`.
7. **Pure Decoupled MessageCodec & Unread Counters**: Pure functional codec returning isolated placeholder `"Mensagem criptografada indisponível"` with `decryptionStatus: 'undecryptable'` without crashing the chat feed. Unread badges increment synchronously upon raw socket event arrival prior to async decryption.
8. **Key Request Protocol**: 30s TTL deduplication, 10 requests/min rate limiting, 5m cooldown, and retroactive re-decoding of cached messages upon `room_key` receipt.
9. **Forensic Integrity Certification**: Zero hardcoded test outputs, authentic Vodozemac WASM and WebCrypto APIs, zero secrets or plaintext leaked in DOM or logs.
