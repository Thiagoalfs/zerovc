# ZeroVC Frontend Architecture Survey & Modularization Plan
**Requirement**: R1 — Frontend Component Modularization & TypeScript Cleanup  
**Target Codebase**: `client/` (React 18 + TypeScript + Vite + Zustand + TailwindCSS + LiveKit)  
**Date**: 2026-09-17  
**Status**: Completed Survey (Read-Only)

---

## 1. Executive Summary

A comprehensive architectural audit of the `client/` frontend codebase was performed to address Requirement R1. The frontend exhibits strong feature completeness (voice/video via LiveKit WebRTC, direct messaging, server/guild channels, permissions, rich emojis, file uploads, role hierarchies, and Electron/Capacitor cross-platform support).

However, rapid feature additions have resulted in **extreme component concentration**, with single files exceeding 2,000 to 3,600 lines containing mixed responsibilities (orchestration, business logic, DOM layout algorithms, local state, and modal popups). Furthermore, significant amounts of code are duplicated across text chat variants (`ChatArea`, `DMChatArea`, `DMGroupChatArea`), while unreferenced dead files (such as `SettingsModal.tsx`, 1,051 lines) linger in the tree. Typing exhibits widespread `any` escapes (137+ instances) due to fractured message models and incomplete global environment declarations.

The build process (`npm run build`, running `tsc && vite build`) currently succeeds in ~7.3s with zero compiler errors, providing a solid baseline. This survey provides an exact inventory, structural maps, extraction specifications, and a safe phased roadmap to achieve complete modularity, strict typing, and zero regressions.

---

## 2. Component Complexity Inventory

### Top Monolithic & Complex Components by Line Count

| Component / Module | File Path | Line Count | Size (KB) | Status & Responsibilities |
|---|---|:---:|:---:|---|
| `ProfileModal.tsx` | `src/components/Modals/ProfileModal.tsx` | **3,668** | 179.3 | **Extreme Monolith**: 8 tabs, live mic volume analyzer, 2FA, password, avatar crop, keybinds |
| `ServerSettingsModal.tsx` | `src/components/Modals/ServerSettingsModal.tsx` | **2,872** | 141.6 | **Extreme Monolith**: 6 tabs, role permissions, emoji manager, member moderation, 4 embedded modals |
| `App.tsx` | `src/App.tsx` | **1,709** | 66.5 | **Shell Monolith**: Router, 35+ socket event handlers, 12 modal imports, touch gestures, back handlers |
| `guildStore.ts` | `src/stores/guildStore.ts` | **1,289** | 50.1 | **Store Monolith**: Guilds, channels, messages, roles, moderation, typing, unreads |
| `SettingsModal.tsx` | `src/components/Modals/SettingsModal.tsx` | **1,051** | 48.0 | **DEAD CODE**: 100% unreferenced legacy modal. Never imported. |
| `ChannelList.tsx` | `src/components/Sidebar/ChannelList.tsx` | **1,026** | 40.2 | **Complex Sidebar**: Guild menu, channel categories, live voice participant list, drag-and-drop |
| `MessageItem.tsx` | `src/components/Chat/MessageItem.tsx` | **1,011** | 37.9 | **Chat Item Monolith**: Formatted message, reactions bar, inline editor, action bar, delete modal |
| `MessageInput.tsx` | `src/components/Chat/MessageInput.tsx` | **885** | 34.4 | **Input Monolith**: 3 distinct autocomplete engines (#, @, :), image compression, voice recorder |
| `VoiceFloatingPiP.tsx` | `src/components/Voice/VoiceFloatingPiP.tsx` | **833** | 33.7 | **Voice Overlay**: PiP window, video tracks, audio sliders, drag snap logic |
| `AuthScreen.tsx` | `src/components/Auth/AuthScreen.tsx` | **790** | 35.7 | **Auth Monolith**: Login, register, 2FA, email verification, forgot password, reset password |
| `ChannelSettingsModal.tsx` | `src/components/Modals/ChannelSettingsModal.tsx` | **648** | 28.4 | **Complex Modal**: Overview, role permission overwrites (tristate allow/deny/inherit), deletion |
| `ParticipantCard.tsx` | `src/components/Voice/ParticipantCard.tsx` | **646** | 27.0 | **Voice Card**: Video rendering, screen share presentation, audio level bars, volume controls |
| `ServerList.tsx` | `src/components/Sidebar/ServerList.tsx` | **569** | 22.4 | **Complex Sidebar**: Server folders, drag & drop guild reordering, unread badges, context menu |
| `DMChatArea.tsx` | `src/components/DM/DMChatArea.tsx` | **544** | 20.9 | **Duplicated Chat**: 80% duplicate of `ChatArea.tsx` |
| `ChatArea.tsx` | `src/components/Chat/ChatArea.tsx` | **520** | 20.8 | **Chat Monolith**: Scroll management, infinite pagination, search/pins filter, drag-drop file overlay |
| `FriendsView.tsx` | `src/components/Friends/FriendsView.tsx` | **514** | 24.2 | **View Monolith**: Online, all, pending, add friend tabs, context menu |
| `DMGroupChatArea.tsx` | `src/components/DM/DMGroupChatArea.tsx` | **471** | 18.5 | **Duplicated Chat**: 80% duplicate of `ChatArea.tsx` |
| `voiceStore.ts` | `src/stores/voiceStore.ts` | **405** | 12.8 | **Voice Store**: LiveKit room state, volumes, speaking IDs |
| `VoiceRoom.tsx` | `src/components/Voice/VoiceRoom.tsx` | **372** | 13.3 | **Voice Stage**: 80 lines inline layout algorithm, stage render, floating controls |
| `MemberList.tsx` | `src/components/Sidebar/MemberList.tsx` | **357** | 14.3 | **Sidebar**: Hoisted roles sorting, member item rendering, mobile drawer |

---

## 3. Detailed Component Analysis & Decomposition Plans

### 3.1 ServerSettingsModal (`2,872 lines`)

#### Current Responsibilities & Internal State
- Manages full server administration across 6 tabs (`overview`, `roles`, `emojis`, `invites`, `members`, `audit_log`).
- Holds **35+ useState/useRef hooks** in one single component scope.
- Renders 4 separate full-screen modals inline inside itself (`MuteMemberModal`, `BanMemberModal`, `DeleteServerModal`, `TransferOwnershipModal`).
- Contains all network API mutation handlers, role permission bitwise calculations, file input handling, and image crop coordination.

#### Proposed Decomposition Architecture
Path: `client/src/components/Modals/ServerSettings/`

```
ServerSettings/
├── ServerSettingsModal.tsx              # Shell dialog, tab navigation, mobile drilldown (~180 lines)
├── hooks/
│   ├── useServerSettingsNavigation.ts   # Tab state, mobile back button stack
│   ├── useGuildRolesManager.ts          # Role CRUD, reordering, permission flag masks
│   ├── useGuildEmojisManager.ts         # Emoji upload, name editing, shortcode copying
│   ├── useGuildInvitesManager.ts        # Invite generation, usage tracking, revocation
│   └── useGuildMembersManager.ts        # Member search, role filters, kick/ban/mute dispatch
├── tabs/
│   ├── OverviewTab.tsx                  # Server name, icon/banner upload, system channel (~180 lines)
│   ├── RolesTab/
│   │   ├── RolesTab.tsx                 # Split view container (~90 lines)
│   │   ├── RoleList.tsx                 # Reorderable roles list & create button (~120 lines)
│   │   ├── RoleEditor.tsx               # Role name, color presets, hoist toggles (~140 lines)
│   │   └── RolePermissionsEditor.tsx    # Permission category accordions & master admin (~160 lines)
│   ├── EmojisTab.tsx                    # Emoji grid, upload dropzone, rename/delete (~160 lines)
│   ├── InvitesTab.tsx                   # Invites table, creation modal, copy link (~130 lines)
│   ├── MembersTab/
│   │   ├── MembersTab.tsx               # Search, role filter, member list (~130 lines)
│   │   ├── MemberRow.tsx                # Avatar, role badges, action buttons (~90 lines)
│   │   └── MemberRolePopover.tsx        # Role assign/remove dropdown (~80 lines)
│   └── AuditLogTab.tsx                  # Thin wrapper for ServerAuditLogView (~40 lines)
└── modals/
    ├── MuteMemberModal.tsx              # Duration picker (15m, 1h, 24h, 7d, perm) (~80 lines)
    ├── BanMemberModal.tsx               # Ban reason prompt & confirmation (~75 lines)
    ├── DeleteServerModal.tsx            # Name confirmation & 2FA prompt (~110 lines)
    └── TransferOwnershipModal.tsx       # Member search & transfer acknowledgment (~110 lines)
```

---

### 3.2 VoiceRoom (`372 lines`) & ParticipantCard (`646 lines`)

#### Current Responsibilities & Internal State
- `VoiceRoom.tsx` handles:
  1. Room header with participant count and mobile drawer trigger.
  2. Mathematical 16:9 adaptive grid calculation (lines 107–186, 80 lines of nested loop geometry logic inside `useMemo`).
  3. Dynamic stage container observing container dimensions via `ResizeObserver`.
  4. Floating bottom voice control bar (mute, deafen, camera, screen share menu, disconnect, connect).
  5. Mobile screen keep-awake (`useKeepAwake`).
- `ParticipantCard.tsx` (646 lines) handles video rendering, screen share display, speaking indicator pulse, audio level bars, individual volume sliders, and moderation context menu.

#### Proposed Decomposition Architecture
Path: `client/src/components/Voice/`

```
Voice/
├── VoiceRoom.tsx                        # Cohesive orchestrator (~90 lines)
├── VoiceRoomHeader.tsx                  # Title, participant count badge, mobile menu toggle (~40 lines)
├── VoiceStage.tsx                       # Participant grid container, empty/connecting states (~80 lines)
├── VoiceControlsBar.tsx                 # Bottom floating pill with audio/video/screen buttons (~110 lines)
├── ParticipantCard/
│   ├── ParticipantCard.tsx              # Participant card shell (~120 lines)
│   ├── ParticipantVideoTrack.tsx        # Screen share / camera video element attach & resize (~100 lines)
│   ├── ParticipantAudioIndicator.tsx    # Speaking pulse ring & volume levels (~60 lines)
│   └── ParticipantControlsMenu.tsx      # User moderation & volume slider popover (~90 lines)
└── hooks/
    ├── useAdaptiveGrid.ts               # Extracted 16:9 packing algorithm (~80 lines)
    ├── useElementDimensions.ts          # ResizeObserver dimension hook (~45 lines)
    └── useParticipantTracks.ts          # LiveKit track subscribe/unsubscribe event hook (~75 lines)
```

---

### 3.3 ChatArea (`520 lines`) & Chat Ecosystem (`DMChatArea`, `DMGroupChatArea`, `MessageItem`, `MessageInput`)

#### The Triplication Problem
Investigation revealed an identical copy of approximately **380 lines of code** duplicated across:
1. `src/components/Chat/ChatArea.tsx` (520 lines)
2. `src/components/DM/DMChatArea.tsx` (544 lines)
3. `src/components/DM/DMGroupChatArea.tsx` (471 lines)

All three duplicate:
- Drag-and-drop file upload overlay (`isDraggingFile`, `handleDragEnter`, `handleDragOver`, `handleDragLeave`, `handleDrop`).
- Message scroll engine: `scrollContainerRef`, instant scroll on initial load, scroll preservation when loading older messages from top, auto-scroll when near bottom (`< 350px`), media load scroll compensation.
- Pagination detection (`container.scrollTop < 60 && loadMoreMessages(...)`).
- Search query and pinned message filtering (`displayedMessages.filter(...)`).
- Compact message grouping algorithm (within 5 minutes and same author).

#### `MessageInput.tsx` (885 lines)
Contains 3 full autocomplete popups embedded inline with keyboard cursor navigation:
1. Channel mentions (`#`)
2. User/Role mentions (`@`)
3. Custom & standard emojis (`:`)
Plus image optimization/compression, voice note recording, and message draft management.

#### `MessageItem.tsx` (1,011 lines)
Contains inline message editing, quick emoji reaction bar, hover action bar, context menu integration, attachment rendering, and embedded `DeleteMessageModal`.

#### Proposed Decomposition Architecture
Path: `client/src/components/Chat/`

```
Chat/
├── ChatArea.tsx                         # Channel Chat container (~110 lines)
├── common/
│   ├── MessageList.tsx                  # Unified scrollable viewport for channel/DM/group (~140 lines)
│   ├── ChatHeader.tsx                   # Unified header with title, search, pins, member toggle (~90 lines)
│   ├── FileDropOverlay.tsx              # Drag-over file dropzone (~40 lines)
│   └── TypingIndicator.tsx              # Typing animated dots (~35 lines)
├── hooks/
│   ├── useChatScroll.ts                 # Scroll position, pagination, auto-scroll, media compensation (~110 lines)
│   ├── useFileDrop.ts                   # Drag enter/leave counter, drop file capture (~60 lines)
│   ├── useMessageFiltering.ts           # Search & pinned message filter (~50 lines)
│   ├── useMessageGrouping.ts            # Compact message 5-minute grouping logic (~40 lines)
│   └── useInputAutocomplete.ts          # Generic #, @, : autocomplete state & key navigation (~120 lines)
├── MessageInput/
│   ├── MessageInput.tsx                 # Input shell & textarea auto-grow (~130 lines)
│   ├── InputAutocompletePopover.tsx     # Extracted autocomplete dropdown (~90 lines)
│   ├── FileAttachmentPreview.tsx        # Upload preview banner with remove button (~50 lines)
│   └── VoiceRecorderPopover.tsx         # Voice note audio capture (~80 lines)
└── MessageItem/
    ├── MessageItem.tsx                  # Message item container (~140 lines)
    ├── MessageActionBar.tsx             # Floating hover buttons (react, reply, edit, pin, delete) (~80 lines)
    ├── MessageReactionsBar.tsx          # Reaction badges with user tooltip (~90 lines)
    ├── MessageInlineEditor.tsx          # Edit textarea with Save/Cancel (~70 lines)
    └── MessageReplyPreview.tsx          # Quoted reply reference header (~50 lines)
```

---

### 3.4 MemberList (`357 lines`)

#### Current Responsibilities & Internal State
- Sorts and groups guild members into hoisted roles by priority hierarchy, online members without hoisted roles ("DISPONÍVEL"), and offline members ("INDISPONÍVEL").
- Handles mobile sliding drawer with swipe-to-close gestures, back button integration, and backdrop.
- Handles desktop resizable sidebar with `SidebarResizer`.
- Renders individual member rows with presence indicators, role-colored usernames, crown/mute badges, and custom activities.

#### Proposed Decomposition Architecture
Path: `client/src/components/Sidebar/MemberList/`

```
MemberList/
├── MemberList.tsx                       # Drawer shell, width sizing, mobile gesture binding (~80 lines)
├── MemberListHeader.tsx                 # Mobile channel name, search & pins quick actions (~45 lines)
├── MemberRoleGroup.tsx                  # Role section header + count + member list (~50 lines)
├── MemberItem.tsx                       # Avatar, colored username, crown, mute badge, activity (~85 lines)
└── hooks/
    ├── useMemberGrouping.ts             # Hoisted role sorting, color resolution, online/offline split (~70 lines)
    └── useMemberActivity.ts             # Formats custom activity icon & text (playing, listening, etc.) (~40 lines)
```

---

### 3.5 App.tsx (`1,709 lines`)

#### Current Responsibilities & Monolithic Scope
- Root application shell that acts as a router, socket event hub, notification manager, modal registry, mobile touch gesture coordinator, and global keybind dispatcher.
- Registers 35+ socket event callbacks (`handleMessageCreate`, `handleVoiceStateUpdate`, `handleGuildUpdate`, etc.) directly inside a massive `useEffect` block.
- Duplicates 11 separate `useEffect` blocks to register individual modals into the mobile back handler stack.

#### Proposed Decomposition Architecture
Path: `client/src/` & `client/src/hooks/`

```
src/
├── App.tsx                              # Clean root shell layout (~180 lines)
├── components/Modals/ModalRegistry.tsx  # Lazy-loaded modal container, centralized back-handling (~110 lines)
└── hooks/
    ├── useAppWebSocket.ts               # Subscribes all 35+ socket events with type-safe handlers (~220 lines)
    ├── useAppRouter.ts                  # URL pathname and hash router (/@me, /guilds, /invite) (~120 lines)
    ├── useMobileDrawerGestures.ts       # Touch start/move/end gesture tracking for drawers (~140 lines)
    ├── useGlobalKeybinds.ts             # Push-To-Talk and Electron global shortcuts (~90 lines)
    └── useModalBackHandler.ts           # Generic hook: registers modal to mobile back stack (~30 lines)
```

---

## 4. Dead, Redundant & Legacy Code Audit

### 4.1 Dead Code Elimination: `SettingsModal.tsx`
- **Path**: `client/src/components/Modals/SettingsModal.tsx`
- **Lines**: **1,051 lines** (48 KB)
- **Investigation Finding**: Grep search confirmed this file is **never imported or referenced anywhere** in the application (`App.tsx` imports `ProfileModal.tsx` instead). It is an unmaintained relic of an earlier prototype.
- **Action**: Safely remove `SettingsModal.tsx` during implementation, eliminating 1,051 lines of dead code with zero runtime risk.

### 4.2 Legacy Duplicate Interface Declarations
- **Issue**: `client/src/types/index.ts` (lines 294–329) contains a `declare global { interface Window { electronAPI?: ... } }` block that duplicates and partially conflicts with `client/src/types/electron.d.ts`.
- **Action**: Consolidate all Electron definitions into `types/electron.d.ts` and remove the duplicate block from `types/index.ts`.

### 4.3 Redundant Chat Implementations
- As detailed in Section 3.3, `DMChatArea.tsx` and `DMGroupChatArea.tsx` duplicate ~80% of `ChatArea.tsx`. Reusing the extracted `MessageList`, `useChatScroll`, and `useFileDrop` will eliminate over **600 lines** of duplicate boilerplate.

---

## 5. TypeScript Typing Audit

### 5.1 Analysis of `any` Usage (137+ occurrences)

The audit identified five major categories of `any` usage:

1. **ChatMessage Fracturing (`UniversalMessage | any`)**:
   - `MessageItem.tsx` declares `message: UniversalMessage | any`, `reply_to?: UniversalMessage | any`, `member?: any`, `onReply?: (message: any) => void`.
   - Cause: `Message`, `DMMessage`, and `DMGroupMessage` in `types/index.ts` were written as separate interfaces without a shared parent type.
   - **Solution**: Establish a base message interface hierarchy:
     ```ts
     export interface BaseMessage {
       id: string;
       author_id: string;
       author: User;
       content: string;
       attachments?: Attachment[];
       reply_to_id?: string;
       reply_to?: MessageReplyInfo;
       reactions?: MessageReaction[];
       is_pinned?: boolean;
       is_edited?: boolean;
       edited_at?: string;
       created_at: string;
       updated_at?: string;
       status?: 'sending' | 'sent' | 'failed';
       tempId?: string;
       error?: string;
     }

     export interface ChannelMessage extends BaseMessage {
       channel_id: string;
       guild_id?: string;
     }

     export interface DirectMessage extends BaseMessage {
       dm_room_id: string;
     }

     export interface GroupMessage extends BaseMessage {
       group_id: string;
     }

     export type AnyChatMessage = ChannelMessage | DirectMessage | GroupMessage;
     ```

2. **WebSocket Event Handlers (`(event: any) => void`)**:
   - In `App.tsx` and `socket.ts`, `WSEvent` has `data: any`.
   - **Solution**: Strongly type `WSEvent<T>` and create a mapped event payload dictionary (`WSEventMap`).

3. **Message Attachments (`attachments?: any[]`)**:
   - In `api.ts`, `guildStore.ts`, `dmStore.ts`, attachments are typed as `any[]`.
   - **Solution**: Use the existing `Attachment[]` interface defined in `types/index.ts`.

4. **Missing Environment & Global Typings (`as any`)**:
   - `(import.meta as any).env` -> Missing `vite-env.d.ts` with `/// <reference types="vite/client" />`.
   - `(window as any).Capacitor` -> Missing global Capacitor type declaration.
   - `(window as any).AndroidAudioBridge` -> Missing Android bridge type declaration.
   - `(el as any).setSinkId` -> Missing `HTMLMediaElement.setSinkId` type augmentation.
   - `(navigator as any).wakeLock` -> Missing Screen Wake Lock API typings.

5. **LiveKit Casts (`getTrackPublication('screen_share' as any)`)**:
   - LiveKit uses `Track.Source.ScreenShare` and `Track.Source.Camera`. Casting to `'screen_share' as any` bypasses the enum safety.
   - **Solution**: Import and use `Track.Source.ScreenShare` and `Track.Source.Camera`.

---

## 6. State Management & Re-render Hotspot Analysis

### 6.1 Unselected Store Consumption
Multiple large components consume Zustand stores without selectors:
- `App.tsx` calls `const { isConnected, speakingUserIds, ... } = useVoiceStore();` without selectors. Whenever any participant speaks, `speakingUserIds` triggers a full re-render of `App.tsx` (the root component of the entire application).
- `ChatArea.tsx` calls `const { typingUsers, ... } = useGuildStore();` without selectors. Every typing keystroke from any user across any channel re-renders the entire chat area.
- `MemberList.tsx` subscribes to `useGuildStore()` without selectors. Any message received in the active channel causes `MemberList` to re-evaluate its member groups.

### 6.2 Recommended Solution
- Introduce granular Zustand selectors or `useShallow` across all components consuming `guildStore`, `voiceStore`, `dmStore`, and `callStore`.
- Split high-frequency state (e.g. `speakingUserIds`, `typingUsers`) into specialized sub-stores or isolate them with scoped selector hooks (`useIsUserSpeaking(userId)`, `useIsChannelTyping(channelId)`).

---

## 7. Build Setup & Verification

- **Command**: `npm run build` (executes `tsc && vite build`)
- **Status**: PASSED (0 errors, 7.31s duration)
- **Current Bundle Outputs**:
  - `dist/index.html`: 2.83 kB
  - `dist/assets/index-pS3fxb9T.css`: 83.34 kB
  - `dist/assets/vendor-livekit-Btmbw5bR.js`: 557.98 kB (Warning: > 500 kB)
  - `dist/assets/index-2KmsMRwl.js`: 483.82 kB
  - `dist/assets/vendor-react-Br8S0dkx.js`: 133.93 kB
  - `dist/assets/ProfileModal-BLcFwdMt.js`: 112.35 kB
  - `dist/assets/ServerSettingsModal-DUfKMPZG.js`: 82.52 kB
- **Vite Code Splitting**: All major modals (`ServerSettingsModal`, `ProfileModal`, `CreateServerModal`, etc.) are already lazy-loaded with `React.lazy()`. Modularizing their internals into cohesive subcomponents will preserve this code-splitting behavior while drastically improving individual bundle chunks and maintainability.

---

## 8. Proposed Phased Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Typings & Dead Code Cleanup                                        │
│ • Delete unused SettingsModal.tsx (1,051 lines)                             │
│ • Create vite-env.d.ts & global.d.ts (Capacitor, AndroidAudioBridge, SinkId)│
│ • Create BaseMessage & polymorphic AnyChatMessage type hierarchy             │
│ • Consolidate Window.electronAPI declarations                               │
│ • Strongly type WSEventMap & API attachment payloads                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ PHASE 2: Core Hooks Extraction                                              │
│ • Extract useChatScroll (scroll preservation, pagination, auto-scroll)      │
│ • Extract useFileDrop (drag & drop file upload handling)                    │
│ • Extract useAdaptiveGrid & useElementDimensions for VoiceRoom              │
│ • Extract useMemberGrouping for MemberList                                  │
│ • Extract useSocketEvents & useAppRouting for App.tsx                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ PHASE 3: High-Complexity Component Decomposition                            │
│ • Decompose ServerSettingsModal into tabs/, modals/, and custom hooks       │
│ • Decompose VoiceRoom into VoiceStage, VoiceControlsBar, and VoiceRoomHeader │
│ • Decompose ChatArea, DMChatArea, DMGroupChatArea using shared MessageList  │
│ • Decompose MemberList into MemberRoleGroup, MemberItem, and Header         │
│ • Extract MessageInput autocompletes & MessageItem action bars              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ PHASE 4: Store Selector Optimization & Final Verification                   │
│ • Audit and apply useShallow / granular selectors in all components         │
│ • Isolate speakingUserIds and typingUsers re-render triggers                │
│ • Full regression verification: npm run build with 0 warnings/errors        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Risk Analysis & Mitigation Matrix

| Risk | Impact | Likelihood | Mitigation Strategy |
|---|:---:|:---:|---|
| **WebRTC Audio/Video Interruption** | High | Low | Never alter LiveKit room lifecycle in `voiceStore`/`livekit.ts` during UI modularization. Ensure track attach/detach listeners are strictly preserved in `useParticipantTracks`. |
| **Mobile Back Button Stack Desync** | High | Low | Keep exact registration IDs for `pushBackHandler` when extracting modals (`server_settings_modal`, `mobile_member_list`, etc.). |
| **Drag-and-Drop & Context Menu Breaks** | Medium | Low | Ensure decomposed child components properly accept and forward `onContextMenu`, `onDragEnter`, and mouse events. |
| **Breaking Message Streaming/Pagination** | High | Low | The `useChatScroll` hook must rigorously test prepending messages vs appending messages and preserve `prevScrollHeightRef`. |
| **TypeScript Build Regressions** | Medium | Very Low | Run `npm run build` after each individual subcomponent extraction. Do not batch unverified edits. |
