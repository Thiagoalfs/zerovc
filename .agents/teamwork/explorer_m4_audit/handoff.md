# Handoff Report: Technical Blueprint for M4 Forensic Integrity Audit Remediation

## 1. Observation

### 1.1 Forensic Audit Finding on Check 5
In `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\auditor_m4_1\handoff.md`:
> Verdict: INTEGRITY VIOLATION (Binary Veto Triggered on Check 5)  
> Check 5 (Test Authenticity & Assertion Rigor): FAIL  
> `client/scripts/test-livekit-m4.ts` is genuine (26/26 PASS), BUT `backend/internal/handlers/e2ee_m4_test.go` contains 3 tests that do not exercise production code and assert on locally created dummy maps.

### 1.2 Direct Inspection of `backend/internal/handlers/e2ee_m4_test.go`
- Lines 20–58: `TestE2EEM4_LiveKitParticipantMetadata` creates a local closure `buildMetadata := func(isE2EE bool) []byte` inside the test function and executes assertions against the output of this local closure. It invokes zero functions or types from `backend/internal/handlers`.
- Lines 99–130: `TestE2EEM4_DMCallResponses` creates inline maps `invitePayload := map[string]any{ ... "e2ee_enabled": true }` and `acceptPayload := map[string]any{ ... "e2ee_enabled": true }`, marshals them to JSON, unmarshals them back, and asserts that `"e2ee_enabled"` is true. It invokes zero production functions or structs.
- Lines 133–149: `TestE2EEM4_DMGroupVoiceResponse` creates an inline map `groupPayload := map[string]any{ ... "e2ee_enabled": true }`, marshals and unmarshals it, and asserts on its contents without exercising any production code.
- Only lines 60–96 (`TestE2EEM4_ChannelJoinVoiceResponse`) exercise a production struct (`handlers.JoinVoiceResponse`).

### 1.3 Inspection of Backend Production Code
- In `backend/internal/handlers/channel_handlers.go` lines 592–603: LiveKit participant metadata is built as an inline `metaMap := map[string]any{ ... }` before calling `h.livekit.GenerateJoinToken`.
- In `backend/internal/handlers/dm_handlers.go`:
  - Line 934: `InviteCall` encodes an anonymous map `map[string]any{"success": true, "room_id": roomID, "e2ee_enabled": isE2EE}`.
  - Lines 973–993: `AcceptCall` builds `currentMetaMap` and `otherMetaMap` via inline map literals.
  - Lines 1032–1040: `AcceptCall` encodes an anonymous map with `"success": true`, `"room_id"`, `"room_name"`, `"token"`, `"livekit_url"`, `"e2ee_enabled"`.
- In `backend/internal/handlers/dm_group_handlers.go`:
  - Lines 1030–1040: `GetVoiceToken` builds `metaMap` via inline map literals.
  - Line 1055: `GetVoiceToken` encodes an anonymous map `map[string]any{"token": ..., "livekit_url": ..., "room_name": ..., "e2ee_enabled": isE2EE}`.

---

## 2. Logic Chain

1. **Premise 1 (Integrity Forensics Requirement)**: Integrity Forensics Prohibited Pattern 4 classifies tests checking against values or closures constructed within the test body itself as "Self-certifying / Facade Tests". Check 5 mandates that tests actually exercise production code and make real assertions so any regression in production breaks the test.
2. **Premise 2 (Root Cause)**: Test authors in `e2ee_m4_test.go` relied on dummy local closures and maps because `channel_handlers.go`, `dm_handlers.go`, and `dm_group_handlers.go` duplicated metadata construction as inline maps and encoded anonymous `map[string]any` dictionaries instead of exported helper functions and typed structs.
3. **Premise 3 (Extraction Architecture)**:
   - Extracting `BuildLiveKitParticipantMetadata(avatarURL, displayName, username, customStatus string, userID uuid.UUID, isE2EE bool) []byte` into `handlers` standardizes participant metadata across Guild voice channels, DM 1:1 calls, and DM Group calls.
   - Defining typed response structs (`DMCallInviteResponse`, `DMCallAcceptResponse`, `DMGroupVoiceTokenResponse`) with explicit `json:"e2ee_enabled"` tags provides canonical contracts for HTTP endpoints.
   - Refactoring `e2ee_m4_test.go` to import and call `handlers.BuildLiveKitParticipantMetadata`, `handlers.JoinVoiceResponse`, `handlers.DMCallInviteResponse`, `handlers.DMCallAcceptResponse`, and `handlers.DMGroupVoiceTokenResponse` directly ties the tests to production implementations.
4. **Premise 4 (Failure Coupling)**:
   - If an engineer alters or removes `e2ee_required` from `BuildLiveKitParticipantMetadata`, `TestE2EEM4_LiveKitParticipantMetadata` will fail.
   - If an engineer omits or renames `e2ee_enabled` in the response structs, `TestE2EEM4_DMCallResponses` and `TestE2EEM4_DMGroupVoiceResponse` will fail at compile time or during unmarshaling assertions.
   - Self-certification is completely eliminated.
5. **Conclusion**: Implementing the blueprint in `analysis.md` will fully satisfy Check 5 and clear the Binary Veto.

---

## 3. Caveats

- **No Caveats**: The entire call chain was mapped from router handlers down to token generation in `voice.LiveKitService`. Client-side stores (`client/src/stores/callStore.ts`) were also checked to confirm exact property key compatibility (`room_id`, `room_name`, `token`, `livekit_url`, `e2ee_enabled`, `success`).

---

## 4. Conclusion & Actionable Blueprint

The remediation builder agent must apply the following edits:

### Step 1: Add `BuildLiveKitParticipantMetadata` in `backend/internal/handlers/channel_handlers.go`
Place before `JoinVoiceResponse` (around line 482):
```go
// BuildLiveKitParticipantMetadata creates the standard JSON metadata payload for LiveKit voice/video participants.
// If isE2EE is true, e2ee_required: true and user_id are strictly injected.
func BuildLiveKitParticipantMetadata(avatarURL, displayName, username, customStatus string, userID uuid.UUID, isE2EE bool) []byte {
	metaMap := map[string]any{
		"avatar_url":    avatarURL,
		"display_name":  displayName,
		"username":      username,
		"custom_status": customStatus,
	}
	if isE2EE {
		metaMap["e2ee_required"] = true
		metaMap["user_id"] = userID.String()
	}
	b, _ := json.Marshal(metaMap)
	return b
}
```
And update lines 592–603 in `JoinVoice` to call `BuildLiveKitParticipantMetadata`.

### Step 2: Define and Use `DMCallInviteResponse` and `DMCallAcceptResponse` in `backend/internal/handlers/dm_handlers.go`
Define structs:
```go
type DMCallInviteResponse struct {
	Success     bool      `json:"success"`
	RoomID      uuid.UUID `json:"room_id"`
	E2EEEnabled bool      `json:"e2ee_enabled"`
}

type DMCallAcceptResponse struct {
	Success     bool      `json:"success"`
	RoomID      uuid.UUID `json:"room_id"`
	RoomName    string    `json:"room_name"`
	Token       string    `json:"token"`
	LiveKitURL  string    `json:"livekit_url"`
	E2EEEnabled bool      `json:"e2ee_enabled"`
}
```
- In `InviteCall` (line 934): encode `DMCallInviteResponse`.
- In `AcceptCall` (lines 973–993): call `BuildLiveKitParticipantMetadata` for current and other user.
- In `AcceptCall` (lines 1032–1040): encode `DMCallAcceptResponse`.

### Step 3: Define and Use `DMGroupVoiceTokenResponse` in `backend/internal/handlers/dm_group_handlers.go`
Define struct:
```go
type DMGroupVoiceTokenResponse struct {
	Token       string `json:"token"`
	LiveKitURL  string `json:"livekit_url"`
	RoomName    string `json:"room_name"`
	E2EEEnabled bool   `json:"e2ee_enabled"`
}
```
- In `GetVoiceToken` (lines 1030–1040): call `BuildLiveKitParticipantMetadata`.
- In `GetVoiceToken` (lines 1055–1061): encode `DMGroupVoiceTokenResponse`.

### Step 4: Overhaul `backend/internal/handlers/e2ee_m4_test.go`
Replace with genuine production tests exercising `BuildLiveKitParticipantMetadata`, `JoinVoiceResponse`, `DMCallInviteResponse`, `DMCallAcceptResponse`, and `DMGroupVoiceTokenResponse` for both E2EE (true) and Plain (false) configurations (full code specified in Section 2.4 of `analysis.md`).

### Step 5: Align `backend/internal/handlers/e2ee_m4_challenger_test.go`
Replace lines 67–82 and lines 290–316 with direct invocations of the production helpers and response types.

---

## 5. Verification Method

Once the builder implements these changes, verify using the following commands:

1. **Verify Backend Compilation and Unit Tests**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/handlers -run "TestE2EEM4"
   go test -v ./internal/handlers -run "TestChallengerM4"
   ```
   Both must output `PASS` with 0 failures.

2. **Verify Invalidation on Production Code Tampering (Anti-Self-Certification Proof)**:
   - Temporarily change `metaMap["e2ee_required"] = true` to `metaMap["e2ee_required"] = false` in `channel_handlers.go:BuildLiveKitParticipantMetadata`.
   - Run `go test -v ./internal/handlers -run "TestE2EEM4_LiveKitParticipantMetadata"`.
   - Invalidation condition: Test **MUST FAIL** with `Expected e2ee_required to be true, got false`.
   - Revert change and confirm it passes.

3. **Verify Full Backend & Client Suites**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test ./...
   npm run test:livekit-m4 --prefix ..\client
   ```
