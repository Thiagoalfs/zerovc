# DISPATCH — Challenger M3.2 (Frontend Adversarial Challenger)

## Mission
Perform adversarial stress testing on the TypeScript/React frontend implementation of Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4).

## Attack Scenarios to Verify
1. Undecryptable Payload & Corrupted Ciphertext:
   - Feed corrupted base64 or garbage ciphertext into `messageCodec.decodeMessage`.
   - Verify it returns `{ decryptionStatus: 'undecryptable', displayContent: 'Mensagem criptografada indisponível' }` without throwing an exception or crashing the UI.
2. Unread Count Decoupling:
   - Verify unread counter updates synchronously on raw packet arrival, regardless of whether decryption succeeds, fails, or is pending.
3. Attachment Tampering:
   - Modify 1 byte of encrypted attachment blob. Verify AES-GCM tag verification or SHA-256 digest mismatch rejects decryption safely.
4. Key Request Flooding:
   - Trigger multiple requests for the same missing session ID within 30 seconds. Verify deduplication and rate-limiting prevents spamming to-device messages.
5. Dual-Track E2E Test Suite:
   - Run `npx tsx tests/e2e/runner.ts` (181 tests across Tiers 1-4) to verify zero regressions.
6. Run `npm run test:frontend-m3` and `npm run test:e2ee-adversarial`.

## Output
Write `handoff.md` with empirical test results and verdict: APPROVE or REQUEST_CHANGES.


## 2026-10-10T12:44:38Z
You are challenger_m3_2 (Role: M3 Frontend Challenger).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m3_2\
Your parent is orchestrator_gen2.

MANDATORY FIRST STEP:
Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md and C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m3_2\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m3_frontend\handoff.md.

YOUR MISSION:
Empirically verify and stress-test TypeScript/React frontend M3 features:
1. Test corrupted ciphertext / missing keys with messageCodec.decodeMessage. Verify isolated placeholder returned without throwing.
2. Verify unread count increments synchronously on raw packet arrival regardless of decryption status.
3. Test attachment decryption tampering (modified bytes reject decryption).
4. Test key request deduplication and rate limiting under rapid requests.
5. Run the Dual-Track E2E test suite: npx tsx tests/e2e/runner.ts (181 tests across Tiers 1-4).
6. Run npm run test:frontend-m3 and npm run test:e2ee-adversarial in client/.
Write your self-contained handoff.md with empirical results and verdict: APPROVE or REQUEST_CHANGES.
Send completion message to parent orchestrator_gen2 via send_message.
