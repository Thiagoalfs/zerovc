# DISPATCH — Forensic Auditor M5-1 (Milestone M5 Integrity Forensics)

## Mission & Scope
Conduct an exhaustive forensic integrity audit of Milestone M5 (Encrypted Server Channels & Scaled Audience):
1. Mandatory Integrity Forensics Checks:
   - Check 1: Static code analysis for hardcoded test results, facade stubs, dummy pass flags.
   - Check 2: Cryptographic authenticity (real SHA-256 order-invariant hashing, real Megolm ratchet, real AES-GCM envelopes).
   - Check 3: Check for zero secrets/plaintext leakage in logs, DOM, or localStorage (`safeCryptoLogger`, content = '' on encrypted messages).
   - Check 4: Check adherence to User Global Rules (zero git push, POST with CSRF for mutations, constant-time `hash_equals`, TLS enabled in cURL).
   - Check 5: Verify tests in `backend/internal/handlers/e2ee_m5_test.go` and `client/scripts/test-channels-m5.ts` genuinely exercise production code without local self-certifying dummy closures/maps.
2. Deliverable:
   - Write `handoff.md` with explicit Verdict (`CLEAN` or `INTEGRITY VIOLATION`).
   - Binary Veto: If ANY violation or cheating is detected, declare INTEGRITY VIOLATION.
   - Report back to parent orchestrator via `send_message`.

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m5\handoff.md`
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend\internal\handlers\e2ee_audience.go`
4. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend\internal\handlers\e2ee_m5_test.go`
5. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\scripts\test-channels-m5.ts`
