# DISPATCH — Forensic Auditor M3 (Milestone M3 Forensic Integrity Audit)

## Mission
Perform comprehensive forensic integrity audit on Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4) across both backend Go and frontend TypeScript implementations.

## Integrity Checks to Execute
1. Anti-Cheat & Authenticity Verification:
   - Check if any test suite or production file hardcodes test results, returns dummy/facade data, or fakes encryption/decryption.
   - Verify that `vodozemac` Megolm sessions (`GroupSession`, `InboundGroupSession`) and WebCrypto AES-256-GCM are authentically invoked.
2. Zero Plaintext Storage & Leakage:
   - Verify that `messages`, `dm_messages`, and `dm_group_messages` write `content = ''` for encrypted messages.
   - Verify that PostgreSQL `messages_search_vector_update` does not index ciphertext.
   - Verify that lateral join previews and search queries do not leak cleartext.
   - Verify zero secret keys or plaintext exposed in DOM or console logs.
3. Plaintext Gating Strictness:
   - Verify that 409 `e2ee_required` and 409 `e2ee_not_enabled` are strictly enforced by the Go handlers and cannot be bypassed.
4. Idempotency & Membership Integrity:
   - Verify composite uniqueness on `(conversation_id, message_id)`.
   - Verify 15-member DM group limit cannot be exceeded via API calls.
5. Verification Commands:
   - Verify backend: `go build ./...` and `go test -count=1 ./internal/...`
   - Verify frontend: `npm run build` and `npm run test:frontend-m3`

## Output
Write `handoff.md` with binary verdict: CLEAN or INTEGRITY VIOLATION.
Include complete evidence chains.


## 2026-10-10T12:44:38Z
You are auditor_m3_1 (Role: M3 Forensic Auditor).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\auditor_m3_1\
Your parent is orchestrator_gen2.

MANDATORY FIRST STEP:
Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md and C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\auditor_m3_1\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md.

YOUR MISSION:
Perform comprehensive forensic integrity audit on Milestone M3:
1. Static analysis & anti-cheat: Ensure no hardcoded test outputs, stubs, dummy facades, or skipped cryptographic checks in Go or TypeScript.
2. Verify authentic vodozemac Megolm and WebCrypto AES-GCM usage.
3. Verify zero plaintext stored in messages table (content = '') and zero indexing in PostgreSQL search_vector.
4. Verify strict enforcement of HTTP 409 e2ee_required / e2ee_not_enabled.
5. Verify composite uniqueness on (conversation_id, message_id) and strict 15-member cap.
6. Verify clean builds: go build ./... in backend/ and npm run build in client/.
7. Write your self-contained handoff.md with binary verdict: CLEAN or INTEGRITY VIOLATION.
Send completion message to parent orchestrator_gen2 via send_message.
