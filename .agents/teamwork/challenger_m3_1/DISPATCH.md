# DISPATCH — Challenger M3.1 (Backend Adversarial Challenger)

## Mission
Perform adversarial stress testing on the Go backend implementation of Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4).

## Attack Scenarios to Verify
1. Plaintext Injection into E2EE room:
   - Send cleartext message without encryption flag or ciphertext to E2EE room. Must return HTTP 409 `{"error": "e2ee_required"}`.
2. Encrypted Payload into Non-E2EE room:
   - Send encrypted=true payload to non-E2EE room. Must return HTTP 409 `{"error": "e2ee_not_enabled"}`.
3. Idempotency Boundary & Conflict:
   - Submit duplicate message with identical `(room_id, message_id)`. Must return 200/201 idempotent success without creating extra database records or emitting duplicate WebSocket messages.
   - Submit duplicate `message_id` with conflicting content/ciphertext. Must return HTTP 409 Conflict.
4. DM Group 15-Member Cap:
   - Attempt creating DM group with 15+ friends (total > 15). Must be rejected.
   - Attempt adding members to DM group exceeding 15 members total. Must be rejected.
5. Search Vector Protection:
   - Verify that `messages` table with `content = ''` evaluates `to_tsvector('portuguese', '')` to empty tsvector, and `ILIKE` or full-text queries match zero rows for encrypted messages.
6. Run `go test -count=1 ./internal/...` in `backend/`.

## Output
Write `handoff.md` with empirical test results and verdict: APPROVE or REQUEST_CHANGES.


## 2026-10-10T12:44:38Z
You are challenger_m3_1 (Role: M3 Backend Challenger).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m3_1\
Your parent is orchestrator_gen2.

MANDATORY FIRST STEP:
Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md and C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m3_1\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m3_backend\handoff.md.

YOUR MISSION:
Empirically verify and stress-test Go backend M3 features:
1. Verify 409 e2ee_required when sending plaintext to E2EE rooms.
2. Verify 409 e2ee_not_enabled when sending encrypted payload to non-E2EE rooms.
3. Verify idempotency: duplicate (room_id, message_id) returns idempotent 200/201 on identical payload, and 409 on conflicting payload.
4. Verify DM group 15-member cap rejection.
5. Verify zero search_vector indexing on encrypted messages (content = '').
6. Run go test -count=1 ./internal/... in backend/.
Write your self-contained handoff.md with empirical results and verdict: APPROVE or REQUEST_CHANGES.
Send completion message to parent orchestrator_gen2 via send_message.
