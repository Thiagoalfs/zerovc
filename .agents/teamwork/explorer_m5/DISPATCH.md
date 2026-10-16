# DISPATCH — Explorer M5 (Milestone M5: Encrypted Server Channels & Scaled Audience)

## Mission & Scope
Perform comprehensive technical investigation and blueprint creation for Milestone M5 (R5 Canais Criptografados de Servidor e Audiência Escalonada - Fase 5):

### Requirements to Investigate (§12, §14 Fase 5 in `e2ee_implementation_plan_revision6.md`):
1. **Audience Recomputation (`recomputeAudience(channel)`)**:
   - Backend logic in Go: calculate the exact set of authorized users & devices with `PermViewChannel` permission on the server channel, taking into account guild roles, channel permission overwrites, server bans, kicks, and revoked devices (`d.revoked_at IS NULL`).
   - Canonical user and device ordering and SHA-256 audience hash comparison (`ComputeAudienceHash`).
   - Endpoint: `GET /api/channels/{id}/e2ee/audience` returning authorized devices and current audience hash.
2. **Stepped Audience Limits**:
   - Initial limit <= 15 members.
   - Stepped expansion to 50 members.
   - Experimental cap of 250 members with performance/abort safeguards.
   - Rejection with HTTP 400 when channel audience exceeds active cap in E2EE channel.
3. **Lazy Epoch Rotation & Member Churn Debounce**:
   - When audience changes (member joins, parts, role change, ban, device revocation), increment channel `rotation_epoch++`, update `audience_hash`, and broadcast WebSocket event `E2EE_ROTATION_REQUIRED`.
   - Lazy rotation: existing messages stay as-is; the next sender detects the new epoch and establishes a fresh Megolm outbound session, distributing session keys to the newly computed audience.
   - Debounce mechanism (e.g. 500ms - 2s) to prevent epoch churning on rapid member joins/leaves.
4. **Frontend Channel Integration**:
   - Client channel message sending in `messageCodec.ts` and `channelStore.ts`.
   - Outbound Megolm session caching per `(channel_id, rotation_epoch)`.
   - Handling `E2EE_ROTATION_REQUIRED` by invalidating the local channel outbound session.
5. **Existing Code State**:
   - Inspect existing `backend/internal/handlers/channel_handlers.go`, `permission_helpers.go`, `models/e2ee.go`.
   - Inspect existing `client/src/messaging/messageCodec.ts`, `client/src/crypto/megolmSession.ts`.
   - Identify what is already implemented, what is missing, and what tests need to be written (`client/scripts/test-channels-m5.ts` and backend `e2ee_m5_test.go`).

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` (§12, §14 Fase 5)
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Deliverables
- Detailed `analysis.md` and `handoff.md` in `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\`.
- Report back to parent orchestrator via `send_message`.


## 2026-10-15T18:14:57Z
You are explorer_m5 (Role: M5 Channels Explorer).
Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\
Project root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Parent Orchestrator Conversation ID: c7bad961-fa24-42cb-b324-2269f48b6b9e

Read your instructions in C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md.

Perform comprehensive technical investigation of Milestone M5 (Encrypted Server Channels with Scaled Audience - Fase 5).
Map existing code in backend and frontend, compare against specification, and formulate a clear technical implementation plan.
Write analysis.md and handoff.md in your working directory.
Report back via send_message.
