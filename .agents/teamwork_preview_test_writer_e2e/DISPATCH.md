## 2026-09-17T17:14:19Z

You are the E2E Test Writer for ZeroVC.
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_test_writer_e2e
The project root is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
The authoritative request is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md
The test infrastructure plan is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\TEST_INFRA.md
The master architecture is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\PROJECT.md
The backend contract survey is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_backend\survey_backend_contracts.md

MANDATORY: First read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md completely.
Your mission is to construct the comprehensive, opaque-box E2E test suite in tests/e2e/ adhering to the 4-tier methodology:
- Tier 1: Feature Coverage (>=5 test cases per feature across Auth, CSRF, Rate Limiting, Guilds, Channels, Messages, Reactions, DMs, Voice, Moderation).
- Tier 2: Boundary & Corner Cases (>=5 per feature: CSRF token missing, invalid token, method not allowed, rate-limit thresholds, payload length bounds, forbidden IDs).
- Tier 3: Cross-Feature Combinations (pairwise interactions: auth+CSRF+mutation, invite join + role + permissions, voice join + mute + leave).
- Tier 4: Real-World Scenarios (>=5 end-to-end flows: full user onboarding to server setup, collaborative chat, LiveKit voice lifecycle, moderation flow).
Requirements:
1. Build test runner / test files in tests/e2e/ (e.g., using Go's testing package with httptest or real HTTP client).
2. The tests must be opaque-box: derive test expectations strictly from requirements and API contracts, never from internal implementation quirks.
3. Verify the test suite compiles and runs (go test -c ./tests/e2e/... or go test -v ./tests/e2e/...).
4. Publish TEST_READY.md at project root C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\TEST_READY.md summarizing coverage and run instructions.
5. Write your handoff report to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_test_writer_e2e\handoff.md.
6. Send a message to your parent upon completion.
