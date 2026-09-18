# Project: ZeroVC Refactor & Hardening

## Architecture
ZeroVC is an open-source real-time communication platform built with:
- **Backend (Go 1.23 + Chi + PostgreSQL + WebSockets + LiveKit protocol)**:
  - `backend/cmd/server`: Entrypoint, router setup, middleware chaining, server lifecycle.
  - `backend/internal/handlers`: HTTP API handlers (Auth, Guild, Channel, Message, DM, Upload, etc.).
  - `backend/internal/middleware`: Auth, CORS, Logging, and new CSRF validation and Rate Limiting.
  - `backend/internal/database`: PostgreSQL connection pool (`pgxpool`) and SQL queries/transactions.
  - `backend/internal/gateway`: Bidirectional WebSocket hub managing 46 event types (`WS_EVENT`).
  - `backend/internal/ratelimit`: Token bucket in-memory rate limiting and `httprate` IP limiting.
- **Frontend (React 18 + TypeScript + Vite + Zustand + TailwindCSS + LiveKit Client)**:
  - `client/src/components`: UI components (Modals, Chat, Voice, Sidebar, Auth, Settings).
  - `client/src/stores`: Zustand stores (`authStore`, `guildStore`, `dmStore`, `voiceStore`, `callStore`, etc.).
  - `client/src/lib`: LiveKit manager, WebSocket client, API client, native process audio bridge.
  - `client/src/types`: TypeScript models, event maps, API response shapes.
- **Cross-Platform**:
  - Web browser: Cookie auth (`SameSite: Lax`), standard MediaDevices WebRTC.
  - Electron Desktop: Bearer auth header, native WASAPI audio capture (`zerovc-audio-capture.exe`).
  - Mobile (Capacitor/Android): Hybrid auth, WebRTC mobile bridge.

---

## Feature Inventory
Every feature identified during Phase 0 Survey is mapped to an implementation milestone below:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | CSRF Protection Engine | Constant-time CSRF validation on all state-altering endpoints (POST, PATCH, PUT, DELETE) returning 403 on invalid/missing tokens | M1 | survey_backend_contracts |
| 2 | CSRF Token Generation & Delivery | Cryptographic session CSRF token delivery via cookie and `/api/auth/me` & `/api/auth/login` | M1 | survey_backend_contracts |
| 3 | Extended Rate Limiting | Rate limiting on moderation (kick/ban/mute), channel/role creation, message edits/deletions, ack, and login brute-force | M1 | survey_backend_contracts |
| 4 | Database Transaction Integrity | Wrap multi-query mutations (`BanMember`, `KickMember`, `JoinByInvite`, category deletion) in `tx.Begin(ctx)` transactions | M1 | survey_backend_contracts |
| 5 | REST API Contract Preservation | Guarantee 100% backward compatibility for all 117 HTTP routes and schemas | M1, M5 | survey_backend_contracts |
| 6 | Dead Code Elimination | Remove unreferenced `client/src/components/Modals/SettingsModal.tsx` (1,051 lines) | M2 | survey_frontend |
| 7 | Global Environment Typings | Add `vite-env.d.ts` and `global.d.ts` for Capacitor, AndroidAudioBridge, SinkId, consolidate electron definitions | M2 | survey_frontend |
| 8 | Strict Message Typing Hierarchy | Establish `BaseMessage`, `ChannelMessage`, `DirectMessage`, `GroupMessage` eliminating `UniversalMessage \| any` | M2 | survey_frontend |
| 9 | WebSocket Event Typing | Strongly type `WSEvent<T>` and `WSEventMap` across client socket listeners | M2 | survey_frontend, survey_backend_contracts |
| 10 | Client CSRF Header Integration | Update `client/src/lib/api.ts` to automatically attach `X-CSRF-Token` header on state mutations | M2 | survey_frontend, survey_backend_contracts |
| 11 | LiveKit Channel Switch Race Fix | Prevent race condition in `voiceStore.joinVoice` from aborting connection when switching voice channels | M3 | survey_state_webrtc |
| 12 | LiveKit Audio Element Leak Fix | Clean up remote participant `<audio>` elements on `ParticipantDisconnected` in `LiveKitManager` | M3 | survey_state_webrtc |
| 13 | Process Audio Bridge Cleanup Chaining | Preserve and chain `onended` callbacks in `livekit.ts` to cleanly stop WASAPI audio capture in Electron | M3 | survey_state_webrtc |
| 14 | VoiceStore & CallStore Synchronization | Prevent singleton LiveKit room collisions between DM calls and server voice channels; add missing callbacks in callStore | M3 | survey_state_webrtc |
| 15 | Store High-Frequency Event Debounce | Add shallow equality guards on `speakingUserIds` and `typingUsers` to avoid 5Hz re-render cascades | M3 | survey_state_webrtc |
| 16 | LiveKit Reconnection Lifecycle | Handle `RoomEvent.Reconnecting` and `RoomEvent.Reconnected`, expose `isReconnecting` in `voiceStore` | M3 | survey_state_webrtc |
| 17 | ServerSettingsModal Modularization | Decompose 2,872-line monolith into `tabs/`, `modals/`, and domain manager hooks | M4 | survey_frontend |
| 18 | VoiceRoom & ParticipantCard Modularization | Decompose into `VoiceStage`, `VoiceControlsBar`, `VoiceRoomHeader`, extracting `useAdaptiveGrid` | M4 | survey_frontend |
| 19 | ChatArea Triplication Elimination | Extract unified `MessageList`, `useChatScroll`, `useFileDrop`, and subcomponents across ChatArea, DMChatArea, DMGroupChatArea | M4 | survey_frontend |
| 20 | MemberList Modularization | Decompose into `MemberRoleGroup`, `MemberItem`, and `useMemberGrouping` | M4 | survey_frontend |
| 21 | MessageInput & MessageItem Decomposition | Extract autocomplete popovers, reaction bars, inline editors, and action menus | M4 | survey_frontend |
| 22 | Zustand Selector Optimization | Audit and apply granular selectors and `useShallow` across components to prevent re-render cascades | M3, M4 | survey_state_webrtc, survey_frontend |
| 23 | E2E Testing Suite (Tiers 1-4) | Requirement-driven opaque-box test suite validating auth, chat, voice tokens, moderation, CSRF, rate limits | E2E Track | ORIGINAL_REQUEST |
| 24 | E2E Verification & Adversarial Hardening | Pass 100% of E2E tests, followed by Tier 5 white-box adversarial stress testing | M5 | ORIGINAL_REQUEST |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Architecture, CSRF, Rate Limiting & DB Integrity | Go backend: CSRF middleware, rate limiting, DB transactions, 100% API contract preservation | none | IN_PROGRESS |
| M2 | Frontend Client Typings, CSRF Client Integration & Dead Code Cleanup | Remove dead SettingsModal, add global typings, message hierarchy, API client CSRF headers | M1 (contracts) | PLANNED |
| M3 | State Management & WebRTC/LiveKit Optimization | Fix channel switch race, DOM audio leaks, process audio cleanup, store selectors & debounce | M2 | PLANNED |
| M4 | Frontend Component Modularization & Hook Extraction | Modularize ServerSettingsModal, VoiceRoom, ChatArea ecosystem, MemberList, MessageItem | M2, M3 | PLANNED |
| M5 | Final Milestone: 100% E2E Test Suite & Adversarial Hardening | Phase 1: Pass 100% of E2E test suite (Tiers 1-4). Phase 2: Tier 5 adversarial testing | M1, M2, M3, M4, TEST_READY | PLANNED |
| E2E | E2E Testing Track (Parallel) | Test runner, Tiers 1-4 test cases, publish TEST_READY.md | none | IN_PROGRESS |

---

## Interface Contracts

### Frontend ↔ Backend CSRF Protocol
- **Delivery**:
  - Backend sets a readable cookie `csrf_token` on `/api/auth/me` and `/api/auth/login` (or returns `csrf_token` in response JSON).
- **Enforcement**:
  - Every state-altering HTTP request (`POST`, `PATCH`, `PUT`, `DELETE`) from the client MUST send header: `X-CSRF-Token: <token>`.
  - Backend `RequireCSRF` middleware extracts `X-CSRF-Token` and compares against the session CSRF token using `subtle.ConstantTimeCompare`.
  - On failure, returns `HTTP 403 Forbidden` with body `{"error": "CSRF token missing or invalid"}` without executing handler.
  - Safe methods (`GET`, `HEAD`, `OPTIONS`) bypass CSRF checks.

### Store ↔ Component Contract
- Stores must expose atomic selector friendly slices and action references.
- Components consuming high-frequency state (`speakingUserIds`, `typingUsers`) MUST use dedicated selector hooks (`useIsUserSpeaking(id)`, `useIsChannelTyping(channelId)`).

### WebSocket Event Contract
- All 46 event names (`MESSAGE_CREATE`, `VOICE_STATE_UPDATE`, `CALL_INCOMING`, etc.) and JSON payloads retain exact key names and data types as specified in `survey_backend_contracts.md § 4`.

---

## Code Layout

### Backend (`backend/`)
- `backend/cmd/server/main.go`: Router, middleware chain, server startup.
- `backend/internal/middleware/csrf.go`: CSRF token generation, extraction, constant-time validation middleware.
- `backend/internal/middleware/ratelimit.go`: Rate limiting middleware configuration.
- `backend/internal/handlers/`: Handler implementations for auth, guild, channel, message, upload, etc.
- `backend/internal/database/`: Database pool and query helpers.

### Frontend (`client/src/`)
- `client/src/lib/api.ts`: Centralized HTTP fetch client with CSRF and auth headers.
- `client/src/types/`: TypeScript definitions (`index.ts`, `messages.ts`, `events.ts`, `vite-env.d.ts`, `global.d.ts`).
- `client/src/stores/`: Zustand stores (`authStore.ts`, `guildStore.ts`, `voiceStore.ts`, `callStore.ts`, `dmStore.ts`).
- `client/src/components/Modals/ServerSettings/`: Modularized Server Settings tabs and modals.
- `client/src/components/Voice/`: VoiceRoom, VoiceStage, VoiceControlsBar, ParticipantCard subcomponents.
- `client/src/components/Chat/`: MessageList, MessageItem, MessageInput subcomponents and hooks.
- `client/src/components/Sidebar/MemberList/`: MemberList subcomponents and hooks.

### E2E Testing (`tests/e2e/`)
- `tests/e2e/runner.go` (or runner script): Opaque-box test suite executing Tiers 1-4.
- `tests/e2e/tier1_feature_test.go`
- `tests/e2e/tier2_boundary_test.go`
- `tests/e2e/tier3_combination_test.go`
- `tests/e2e/tier4_realworld_test.go`
