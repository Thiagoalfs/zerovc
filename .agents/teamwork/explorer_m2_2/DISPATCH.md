# DISPATCH — Explorer M2.2 (Frontend Device & Signed Roster Management)

## Milestone: M2 (R2 Infraestrutura de Identidade, Dispositivos e Roster Assinado - Fase 1)
Working Directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_2\`
Project Root: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc`
Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
Specification: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`
Project Master Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`
Survey Frontend Report: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_survey_2\handoff.md`

## Mission
Investigate and design the frontend integration for Milestone M2:
1. Version header injection in `client/src/lib/api.ts`:
   - Inject `X-Client-E2EE-Version: 1` on all requests in `request()`.
   - Handle 426 Upgrade Required error response gracefully.
2. Device registration manager in `client/src/crypto/deviceManager.ts`:
   - Automatic registration flow on login: ensure Olm identity account exists in `KeyStore`, sign Olm device keys (Curve25519 + Ed25519) with Ed25519 identity key, publish device to `POST /api/e2ee/devices`.
   - Replenish and publish One-Time Keys (OTKs) to backend.
   - Device revocation API integration.
3. Chained Signed Roster manager in `client/src/crypto/rosterManager.ts`:
   - Compute canonical SHA-256 hash of previous roster (`prev_roster_hash`).
   - Monotonic version check (`new_version === current_version + 1`).
   - Sign roster with authorized actor's Ed25519 identity key.
   - Verify signatures of incoming rosters from WebSocket `E2EE_ROSTER_UPDATE`.
4. WebSocket handling in `client/src/lib/socket.ts`:
   - Add `device_id` and `e2ee_version=1` query parameters on connection.
   - Handle incoming `E2EE_TO_DEVICE` and `E2EE_ROSTER_UPDATE` events.
5. Automated test script or unit tests verifying the frontend device and roster flows.
6. Write full report to `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_2\handoff.md`.
