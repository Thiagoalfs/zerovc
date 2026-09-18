# E2E Test Infra: ZeroVC

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on internal module implementation.
- Verifies system via public HTTP API and WebSocket gateway interfaces.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Auth & Session (Register, Verify, Login, 2FA, Logout) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 2 | CSRF Protection on Mutations (X-CSRF-Token) | User Rules & ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 3 | Rate Limiting Enforcement (Auth, Messages, Mutations) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 4 | Guilds & Roles Administration | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ |
| 5 | Channels & Category Management | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ |
| 6 | Messages & Chat (Send, Edit, Delete, Reply, Pins) | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ |
| 7 | Reactions & Emojis | ORIGINAL_REQUEST §R1, §R4 | 5 | 5 | ✓ |
| 8 | Direct Messaging & DM Groups | ORIGINAL_REQUEST §R2, §R4 | 5 | 5 | ✓ |
| 9 | Voice Channels & LiveKit Token Generation | ORIGINAL_REQUEST §R2, §R4 | 5 | 5 | ✓ |
| 10 | Moderation (Kick, Ban, Mute) | ORIGINAL_REQUEST §R3, §R4 | 5 | 5 | ✓ |

## Test Architecture
- Test Runner: Go test suite in `tests/e2e/` (or script runner executing against test server).
- Invocations: `go test -v ./tests/e2e/...`
- Directory layout:
  ```
  tests/e2e/
  ├── harness/              # Test HTTP client, CSRF handling, websocket listener
  ├── tier1_features_test.go
  ├── tier2_boundaries_test.go
  ├── tier3_combinations_test.go
  └── tier4_realworld_test.go
  ```

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | New user onboarding & server setup | Auth, Guild Create, Role Create, Channel Setup, Invite | Medium |
| 2 | Full collaborative chat & reactions | Chat, Attachments, Emojis, Replies, Pins, Read States | High |
| 3 | LiveKit Voice join, state toggle, and switch | Voice Token, Mute/Deafen State, Channel Switch | High |
| 4 | Moderation flow with CSRF validation | Role Assignment, Mute, Kick, Ban, Unban, Audit Log | High |
| 5 | Direct Message & DM Group collaboration | DM Room, DM Group (cap 15), DM Call Invite & Accept | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (≥50 tests across 10 core features)
- Tier 2: ≥5 per feature (≥50 boundary/corner tests)
- Tier 3: Pairwise combinations (≥10 tests covering major feature interactions)
- Tier 4: ≥5 realistic end-to-end workflow scenarios
- **Total Minimum Expected**: ≥115 test cases
