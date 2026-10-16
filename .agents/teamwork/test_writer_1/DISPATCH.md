# DISPATCH — E2E Test Writer 1

## Identity
- Archetype: teamwork_preview_test_writer
- Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\test_writer_1\
- Parent: orchestrator_gen2 (Conv: 4defee18-ea09-4ed5-bf7a-16f28824f45a)

## Mission & Scope
Design, implement, and verify the E2E Dual-Track Test Suite (Tiers 1 to 4) per the Project Pattern guidelines and publish `TEST_INFRA.md` and `TEST_READY.md` at project root.

## Inputs
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Principles & Requirements
1. Opaque-box, requirement-driven: Derive test cases from specifications, not internal implementation details.
2. 4-Tier Methodology:
   - Tier 1: Feature Coverage (>=5 test cases per feature across all core E2EE features: Olm identity/devices, Megolm 1:1, Megolm groups, LiveKit call keys, server channels audience, recovery/safety codes, attachments).
   - Tier 2: Boundary & Corner Cases (>=5 per feature: max limits, 15-member cap, empty messages, corrupt pickles, invalid signatures, replay attacks, concurrent devices, network disconnections).
   - Tier 3: Cross-Feature Combinations (pairwise interactions: group messaging + member revoke + call, attachment upload + recovery, etc.).
   - Tier 4: Real-World Application Scenarios (realistic end-to-end multi-user scenarios).
3. Self-contained executable runner: create test runner script (e.g. in `client/tests/e2e/` or `tests/e2e/` using tsx or node) that can be run with exit code 0 when all tests pass.
4. Publish `TEST_INFRA.md` and `TEST_READY.md` at project root once the infrastructure and test suite cases are written and executable.
5. Zero leakage of secrets or plaintext in test logs.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All test implementations and runners must be genuine test fixtures. DO NOT create dummy assertions (e.g. `expect(true).toBe(true)`). A teamwork_preview_auditor will independently verify your work.

## Deliverables
- `TEST_INFRA.md` at project root
- `TEST_READY.md` at project root
- Test suite code in project directory
- `handoff.md` in your working directory summarizing total tests created per tier and execution instructions.


## 2026-10-09T12:04:53Z
You are test_writer_1 (archetype: teamwork_preview_test_writer).
Your Working Directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\test_writer_1\
Your Parent Orchestrator conversation ID is: 4defee18-ea09-4ed5-bf7a-16f28824f45a

Read your instructions in C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\test_writer_1\DISPATCH.md
Read the authoritative requirements:
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md

Your mission is to design, implement, and verify the E2E Dual-Track Test Suite (Tiers 1 to 4) per Project Pattern guidelines.
Publish:
1. C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\TEST_INFRA.md
2. C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\TEST_READY.md
3. Executable test runner and test cases covering all 25 features across Tiers 1-4.
MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All test implementations and runners must be genuine test fixtures. DO NOT create dummy assertions. A teamwork_preview_auditor will independently verify your work.

Write your complete handoff report to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\test_writer_1\handoff.md and notify your parent via send_message.
