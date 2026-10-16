# DISPATCH — Explorer M4 Crypto (CallKeyManager Security & Protocol Hardening)

## Mission
Analyze and formulate the exact code design to resolve the cryptographic signaling vulnerabilities and Olm encryption in `client/src/crypto/callKeys.ts`.

## Feedback & Findings from Gate 4 Iteration 1:
1. `ROGUE_DISTRIBUTOR_INJECTION`:
   In `callKeys.ts:handleIncomingCallKey`, if `this.isDistributor()`, the client must reject incoming `call_key` messages from any peer device.
2. `UNAUTHORIZED_SENDER`:
   Non-distributor clients must verify `payload.sender_device_id === this.distributorDeviceId`. Reject keys sent by non-distributors.
3. `KEY_REPLAY_DOWNGRADE`:
   Enforce monotonic key index: reject `payload.key_index <= this.keyIndex`.
4. `ECHO_ACCEPTANCE`:
   Ignore self-reflected packets (`payload.sender_device_id === this.myDeviceId`).
5. `OLM_ENCRYPTION`:
   In `broadcastCallKeyToParticipants`, investigate how `olmSessionManager` in `client/src/crypto/olmSession.ts` can wrap the to-device payload in 1:1 encrypted Olm messages so the server/database never sees the raw 256-bit symmetric call key in plaintext.

## References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m4_1\handoff.md`
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m4_2\handoff.md`
4. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m4_1\handoff.md`
5. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\src\crypto\callKeys.ts`
6. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\src\crypto\olmSession.ts`

## Your Task
- Inspect `callKeys.ts` and `olmSession.ts`.
- Formulate the exact code modifications for `CallKeyManager` that will pass `npm run test:callkeys-adversarial` and satisfy Reviewers and Challengers.
- Write `analysis.md` and `handoff.md`.
- Report back via `send_message`.


## 2026-10-15T17:29:29Z
You are explorer_m4_crypto (Role: M4 Crypto Hardening Explorer).
Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_crypto\
Project root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Parent Orchestrator Conversation ID: c7bad961-fa24-42cb-b324-2269f48b6b9e

Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_crypto\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m4_1\handoff.md.

Formulate the exact technical blueprint to patch `client/src/crypto/callKeys.ts` with the 4 security guards (rogue distributor rejection, monotonic key_index, echo rejection, authorized sender verification) and explore Olm 1:1 encryption wrapping.
Write analysis.md and handoff.md in your working directory.
Report back via send_message.
