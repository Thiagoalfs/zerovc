# Milestone M3 Backend Analysis: Mensageria E2EE em DMs e Grupos (Fases 2 e 4)

**Role**: M3 Backend Explorer (`explorer_m3_backend`)  
**Date**: 2026-10-10  
**Context**: ZeroVC Opt-in End-to-End Encryption (E2EE) — Go Backend Architecture & Storage Contracts

---

## 1. Executive Summary

Milestone M3 implements opt-in End-to-End Encryption (E2EE) for 1:1 Direct Messages (`dm_rooms`) and Multi-User DM Groups (`dm_groups`), fulfilling Requirements R3 (§5, §7, §8, §10, §14) of `e2ee_implementation_plan_revision6.md`.

This technical design provides:
1. **Zero Plaintext Storage**: Storage and transport schema separating Megolm ciphertext (`e2ee_ciphertext`, `e2ee_meta`) from plaintext (`content = ''`). Complete protection of Postgres `search_vector` and lateral preview joins without table rewrites.
2. **Strict Plaintext Gating**: Handlers enforce HTTP 409 Conflict with error code `e2ee_required` when plaintext is posted to an E2EE room, and HTTP 409 Conflict with error code `e2ee_not_enabled` when encrypted payloads are posted to a plaintext room.
3. **Idempotency & Deduplication Contract**: Client-supplied `message_id` with strict uniqueness per `(conversation_id, message_id)`. Retries with identical cryptographic payloads return idempotent HTTP 200/201 success; conflicting payloads return HTTP 409 Conflict.
4. **Group Member Cap & Lifecycle**: Strict maximum limit of 15 members in DM groups. Membership mutations (add, remove, leave) on E2EE groups bump `rotation_epoch`, broadcast `E2EE_ROTATION_REQUIRED`, and enforce history isolation for newly joined members.
5. **Secure State Mutations**: Opt-in E2EE activation via `POST /api/dms/{id}/e2ee/enable` and `POST /api/dm/groups/{id}/e2ee/enable`, strictly requiring POST method and HMAC CSRF token validation.
6. **Encrypted Attachments**: Raw binary upload endpoint `POST /api/e2ee/attachments` accepting `application/octet-stream`, assigning an opaque UUID, without server-side transcoding or inspection, served with `Content-Disposition: attachment`.
7. **Key Request Protocol**: Rate-limited and deduplicated dispatch via `POST /api/e2ee/key-requests` routing through Olm to-device channels strictly within the authorized conversation audience.
8. **Real-Time WebSocket Gateway**: Event broadcasting (`DM_MESSAGE_CREATE`, `GROUP_MESSAGE_CREATE`, `E2EE_TO_DEVICE`, `E2EE_ROSTER_UPDATE`, `E2EE_ROTATION_REQUIRED`) without leaking plaintext or session keys.

---

## 2. Database Schema & Storage Architecture

### 2.1 Current Schema State (`backend/internal/database/schema.sql` & `db.go`)
- `dm_rooms`: Already contains `e2ee_enabled BOOLEAN DEFAULT FALSE` and `rotation_epoch INT DEFAULT 1` (added in Milestone M2).
- `dm_groups`: Already contains `e2ee_enabled BOOLEAN DEFAULT FALSE` and `rotation_epoch INT DEFAULT 1`.
- `channels`: Already contains `e2ee_enabled BOOLEAN DEFAULT FALSE` and `rotation_epoch INT DEFAULT 1`.
- `messages`: Already contains `encrypted BOOLEAN DEFAULT FALSE`, `e2ee_ciphertext TEXT`, `e2ee_meta JSONB`.
- `dm_messages`: Already contains `encrypted BOOLEAN DEFAULT FALSE`, `e2ee_ciphertext TEXT`, `e2ee_meta JSONB`.
- `dm_group_messages`: Already contains `encrypted BOOLEAN DEFAULT FALSE`, `e2ee_ciphertext TEXT`, `e2ee_meta JSONB`.

### 2.2 Schema Bugs & Missing Columns Identified
1. **Reactions Table Typo**:
   - In `schema.sql` (line 498) and `db.go` (line 184), the migration attempted:
     ```sql
     ALTER TABLE reactions ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT;
     ```
   - **Bug**: The table is actually defined at line 198 as `message_reactions`, not `reactions`!
   - Furthermore, `message_reactions` contains `message_id` and `dm_message_id`, but lacks `dm_group_message_id`.
   - **Required Fix**:
     ```sql
     ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS dm_group_message_id UUID REFERENCES dm_group_messages(id) ON DELETE CASCADE;
     ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT;
     ALTER TABLE message_reactions ALTER COLUMN emoji DROP NOT NULL;
     CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_dm_group_reaction ON message_reactions (dm_group_message_id, user_id, emoji) WHERE dm_group_message_id IS NOT NULL;
     ```
2. **Encrypted Attachments Table**:
   - Dedicated table `e2ee_attachments` required for tracking opaque encrypted files:
     ```sql
     CREATE TABLE IF NOT EXISTS e2ee_attachments (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         size_bytes BIGINT NOT NULL,
         message_id UUID,
         conversation_type VARCHAR(16) CHECK (conversation_type IN ('dm', 'dm_group', 'channel')),
         conversation_id UUID,
         created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
     );
     CREATE INDEX IF NOT EXISTS idx_e2ee_attachments_uploader ON e2ee_attachments (uploader_id);
     CREATE INDEX IF NOT EXISTS idx_e2ee_attachments_created ON e2ee_attachments (created_at);
     ```
3. **Idempotency & Uniqueness Indexes**:
   - To guarantee composite room/group + message idempotency:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_dm_msg_room_id ON dm_messages (dm_room_id, id);
     CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_dm_group_msg_group_id ON dm_group_messages (group_id, id);
     CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_channel_msg_channel_id ON messages (channel_id, id);
     ```

### 2.3 `search_vector` TSVector Trigger Verification
- In `backend/internal/database/schema.sql` (lines 316-330):
  ```sql
  CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
  BEGIN
      NEW.search_vector := to_tsvector('portuguese', COALESCE(NEW.content, ''));
      RETURN NEW;
  END
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_messages_search_vector ON messages;
  CREATE TRIGGER trg_messages_search_vector
  BEFORE INSERT OR UPDATE OF content ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();
  ```
- **Verification Result**:
  - When a message is E2EE (`encrypted = true`), `content` is set to `""`.
  - `COALESCE('', '')` evaluates to `""`.
  - `to_tsvector('portuguese', '')` evaluates safely to `''::tsvector` without throwing an error.
  - `e2ee_ciphertext` is stored in a separate column and is **never** passed to `to_tsvector`. This guarantees zero index pollution and zero plaintext leaks.
  - In `backend/internal/handlers/message_handlers.go` (line 1042):
    ```sql
    AND (m.encrypted IS FALSE OR m.encrypted IS NULL)
    ```
    This clause must be added to search endpoints to ensure encrypted messages are never returned in search queries.

---

## 3. Go Models (`backend/internal/models/`)

### 3.1 Updates to `backend/internal/models/models.go`

```go
// DMRoom represents a direct 1:1 conversation room
type DMRoom struct {
	ID            uuid.UUID    `json:"id"`
	User1ID       uuid.UUID    `json:"user1_id"`
	User2ID       uuid.UUID    `json:"user2_id"`
	Recipient     UserPublic   `json:"recipient"`
	LastMessage   *DMMessage   `json:"last_message,omitempty"`
	E2EEEnabled   bool         `json:"e2ee_enabled"`
	RotationEpoch int          `json:"rotation_epoch"`
	CreatedAt     time.Time    `json:"created_at"`
}

// DMMessage represents a direct 1:1 message
type DMMessage struct {
	ID             uuid.UUID         `json:"id"`
	DMRoomID       uuid.UUID         `json:"dm_room_id"`
	AuthorID       uuid.UUID         `json:"author_id"`
	Author         UserPublic        `json:"author"`
	InvokerID      *uuid.UUID        `json:"invoker_id,omitempty"`
	Invoker        *UserPublic       `json:"invoker,omitempty"`
	Content        string            `json:"content"`
	Attachments    []Attachment      `json:"attachments"`
	Embeds         []MessageEmbed    `json:"embeds,omitempty"`
	ReplyToID      *uuid.UUID        `json:"reply_to_id,omitempty"`
	ReplyTo        *MessageReplyInfo `json:"reply_to,omitempty"`
	IsPinned       bool              `json:"is_pinned"`
	IsEdited       bool              `json:"is_edited"`
	IsTTS          bool              `json:"is_tts"`
	EditedAt       *time.Time        `json:"edited_at,omitempty"`
	Reactions      []MessageReaction `json:"reactions,omitempty"`
	Encrypted      bool              `json:"encrypted"`
	E2EECiphertext *string           `json:"e2ee_ciphertext,omitempty"`
	E2EEMeta       json.RawMessage   `json:"e2ee_meta,omitempty"`
	CreatedAt      time.Time         `json:"created_at"`
}

// DMGroup represents a multi-user direct messaging group (max 15 members)
type DMGroup struct {
	ID            uuid.UUID       `json:"id"`
	Name          *string         `json:"name"`
	IconURL       *string         `json:"icon_url"`
	OwnerID       uuid.UUID       `json:"owner_id"`
	Members       []UserPublic    `json:"members"`
	LastMessage   *DMGroupMessage `json:"last_message,omitempty"`
	E2EEEnabled   bool            `json:"e2ee_enabled"`
	RotationEpoch int             `json:"rotation_epoch"`
	CreatedAt     time.Time       `json:"created_at"`
}

// DMGroupMessage represents a message within a DM group
type DMGroupMessage struct {
	ID             uuid.UUID         `json:"id"`
	GroupID        uuid.UUID         `json:"group_id"`
	AuthorID       uuid.UUID         `json:"author_id"`
	Author         UserPublic        `json:"author"`
	InvokerID      *uuid.UUID        `json:"invoker_id,omitempty"`
	Invoker        *UserPublic       `json:"invoker,omitempty"`
	Content        string            `json:"content"`
	Attachments    []Attachment      `json:"attachments"`
	Embeds         []MessageEmbed    `json:"embeds,omitempty"`
	ReplyToID      *uuid.UUID        `json:"reply_to_id,omitempty"`
	ReplyTo        *MessageReplyInfo `json:"reply_to,omitempty"`
	IsPinned       bool              `json:"is_pinned"`
	IsEdited       bool              `json:"is_edited"`
	IsTTS          bool              `json:"is_tts"`
	EditedAt       *time.Time        `json:"edited_at,omitempty"`
	Reactions      []MessageReaction `json:"reactions,omitempty"`
	Encrypted      bool              `json:"encrypted"`
	E2EECiphertext *string           `json:"e2ee_ciphertext,omitempty"`
	E2EEMeta       json.RawMessage   `json:"e2ee_meta,omitempty"`
	CreatedAt      time.Time         `json:"created_at"`
}
```

### 3.2 Additions to `backend/internal/models/e2ee.go`

```go
// E2EEAttachmentUploadResponse represents the upload metadata returned to the client
type E2EEAttachmentUploadResponse struct {
	ID       uuid.UUID `json:"id"`
	URL      string    `json:"url"`
	Filename string    `json:"filename"`
	Size     int64     `json:"size"`
}

// E2EEKeyRequestPayload represents a request for a missing Megolm session
type E2EEKeyRequestPayload struct {
	ConversationType  ConversationType `json:"conversation_type"`
	ConversationID    uuid.UUID        `json:"conversation_id"`
	SessionID         string           `json:"session_id"`
	RequesterDeviceID uuid.UUID        `json:"requester_device_id"`
}
```

---

## 4. Handlers & Routes Specification

### 4.1 Plaintext Gating & Validation Rules
Implemented in `backend/internal/handlers/dm_handlers.go`, `dm_group_handlers.go`, and `message_handlers.go`.

#### Request Payloads
```go
type SendDMMessageRequest struct {
	ID             *uuid.UUID          `json:"id,omitempty"` // For idempotency contract
	Content        string              `json:"content"`
	Attachments    []models.Attachment `json:"attachments"`
	ReplyToID      *uuid.UUID          `json:"reply_to_id,omitempty"`
	IsTTS          bool                `json:"is_tts,omitempty"`
	Encrypted      *bool               `json:"encrypted,omitempty"`
	E2EECiphertext string              `json:"e2ee_ciphertext,omitempty"`
	E2EEMeta       json.RawMessage     `json:"e2ee_meta,omitempty"`
}
```

#### Plaintext Gating State Machine
| Room E2EE State | Request `encrypted` / `e2ee_ciphertext` | Response Status | Error Code / Result |
| :--- | :--- | :--- | :--- |
| `e2ee_enabled == true` | `encrypted != true` OR `e2ee_ciphertext == ""` | **409 Conflict** | `{"error":"e2ee_required"}` |
| `e2ee_enabled == false`| `encrypted == true` OR `e2ee_ciphertext != ""` | **409 Conflict** | `{"error":"e2ee_not_enabled"}` |
| `e2ee_enabled == true` | `encrypted == true` AND `e2ee_ciphertext != ""` | **201 / 200** | Stored with `content = ""` |
| `e2ee_enabled == false`| `encrypted == false` AND valid `content` | **201 / 200** | Stored with plaintext `content` |

#### Content Validation Rules
- When `e2ee_enabled == true`:
  - `req.Encrypted` must be `true`.
  - `req.E2EECiphertext` must be non-empty.
  - `req.E2EEMeta` must be valid JSON containing `session_id`, `sender_device_id`, `msg_index`, and `epoch`.
  - Server sets DB column `content = ""` regardless of what was sent in `req.Content`.
- When `e2ee_enabled == false`:
  - `req.Content != "" || len(req.Attachments) > 0`.
  - `req.Encrypted` must not be `true`.

### 4.2 Idempotency Contract

Clients generate a UUID `message_id` prior to encrypting and include it as `req.ID`.

```
                    Client POST message with req.ID
                                   │
                                   ▼
             Does message with req.ID exist in room?
                           ├── Yes ──┐
                           │         ▼
                           │    Does author_id == userID?
                           │    ├── No ──> 409 Conflict (idempotency_conflict)
                           │    └── Yes ─> Compare Payload
                           │                 ├── Matches ──> 200 OK (Existing Message)
                           │                 └── Differs ──> 409 Conflict (idempotency_conflict)
                           ▼
             Insert new message with PK = req.ID
                           │
                           ├── Success ──────────────────> 201 Created
                           └── Duplicate PK (Race 23505) ─> Re-query & Compare Payload
```

#### Conflict Comparison Logic
1. **For E2EE Messages**:
   - Compare `e2ee_ciphertext == existing.e2ee_ciphertext`.
   - Compare `e2ee_meta == existing.e2ee_meta`.
   - If both match: Return existing message with HTTP 200 OK.
   - If either differs: Return HTTP 409 Conflict with `{"error":"idempotency_conflict","message":"conflicting payload for existing message_id"}`.
2. **For Plaintext Messages**:
   - Compare `content == existing.content` and attachments.
   - If matching: Return HTTP 200 OK.
   - If differing: Return HTTP 409 Conflict.

### 4.3 Group Member Cap (Strict 15 Members)
In `backend/internal/handlers/dm_group_handlers.go`:
- **`CreateGroup`**:
  - Enforce: `len(totalMembers) <= 15`. If `> 15`, return HTTP 400 Bad Request:
    `{"error":"grupos de DM podem ter no máximo 15 membros"}`.
- **`AddMembers`**:
  - Check current count + deduplicated new member IDs.
  - If total > 15: Return HTTP 400 Bad Request:
    `{"error":"o grupo não pode ultrapassar 15 membros"}`.
  - If group is E2EE (`e2ee_enabled == true`):
    - Verify requester is group owner or authorized admin.
    - Increment `rotation_epoch = rotation_epoch + 1` atomically in the transaction.
    - Broadcast WebSocket event `E2EE_ROTATION_REQUIRED` to all group members.
- **`RemoveMember` / Leave Group**:
  - If group is E2EE, increment `rotation_epoch = rotation_epoch + 1`.
  - Broadcast `E2EE_ROTATION_REQUIRED` to remaining members.
  - Removed user no longer receives new Megolm session keys (enforcing forward secrecy and history isolation).

### 4.4 Opt-in E2EE Enable Endpoints
1. **`POST /api/dms/{id}/e2ee/enable`**:
   - Gated by `RequireCSRF` middleware.
   - Verify caller is participant in the DM room (`user1_id == userID || user2_id == userID`).
   - If `e2ee_enabled == true`: return HTTP 200 OK (idempotent; activation is irreversible).
   - Set `UPDATE dm_rooms SET e2ee_enabled = TRUE, rotation_epoch = 1 WHERE id = $1`.
   - Broadcast `models.WSEvent` with type `DM_UPDATE` and `E2EE_ROTATION_REQUIRED` to both participants.
   - Returns: `{"id":"...","e2ee_enabled":true,"rotation_epoch":1}`.
2. **`POST /api/dm/groups/{id}/e2ee/enable`**:
   - Gated by `RequireCSRF` middleware.
   - Verify caller is the group owner (`owner_id == userID`).
   - If `e2ee_enabled == true`: return HTTP 200 OK (idempotent).
   - Enforce group member count <= 15.
   - Set `UPDATE dm_groups SET e2ee_enabled = TRUE, rotation_epoch = 1 WHERE id = $1`.
   - Broadcast `GROUP_UPDATE` and `E2EE_ROTATION_REQUIRED` to all group members.
   - Returns: `{"id":"...","e2ee_enabled":true,"rotation_epoch":1}`.

### 4.5 Attachment Upload & Serving
- **`POST /api/e2ee/attachments`**:
  - Requires valid authentication, CSRF validation, and `X-Client-E2EE-Version`.
  - Reads raw binary body (`application/octet-stream`).
  - Maximum file size: 50 MB (`50 << 20`).
  - Generates opaque UUID: `blobID := uuid.New()`.
  - Writes to `uploads/e2ee_attachments/<blobID>.bin`.
  - Zero content sniffing, zero OCR, zero thumbnail generation.
  - Inserts record into `e2ee_attachments`.
  - Returns HTTP 201 Created:
    ```json
    {
      "id": "e44d5c90-95b8-4c19-b570-562725fa5802",
      "url": "/api/e2ee/attachments/e44d5c90-95b8-4c19-b570-562725fa5802",
      "size": 245910
    }
    ```
- **`GET /api/e2ee/attachments/{id}`**:
  - Requires valid user authentication.
  - Checks file existence on disk.
  - Sets security headers:
    - `Content-Type: application/octet-stream`
    - `Content-Disposition: attachment; filename="attachment.enc"`
    - `X-Content-Type-Options: nosniff`
    - `Cache-Control: private, max-age=86400`
  - Streams raw encrypted bytes.

### 4.6 Key Request Protocol (`POST /api/e2ee/key-requests`)
- **Route**: `POST /api/e2ee/key-requests`
- **Request Body**:
  ```json
  {
    "conversation_type": "dm",
    "conversation_id": "90e66042-36fb-40c2-be00-eebc5d6ba2f5",
    "session_id": "megolm_session_base64_id",
    "requester_device_id": "d04a6e87-8ffc-40dc-ba55-4e78df79b183"
  }
  ```
- **Validation**:
  1. Caller must belong to conversation audience (member of DM pair or member of DM group).
  2. `requester_device_id` must belong to caller and not be revoked.
  3. Cooldown & Rate Limiting: Max 3 requests per `(requester_device_id, session_id)` in 60 seconds to prevent key request floods.
- **Delivery**:
  - Dispatches to-device message (`msg_type: "key_request"`) to all other devices in the conversation roster.
  - Delivered via real-time WebSocket `hub.SendToDevice` if online, and queued in `e2ee_to_device` table.
  - Server never sees session keys or decrypts anything.

---

## 5. WebSocket Gateway Integration (`backend/internal/gateway/`)

1. **Client Connection & Handshake (`ServeWs` in `client.go`)**:
   - Validates `e2ee_version >= E2EE_MIN_CLIENT_VERSION`.
   - Validates `device_id` ownership and non-revocation via `hub.DeviceValidator`.
   - Registers client in `hub.clientsByDevice[deviceID]`.
2. **Real-time Event Broadcasting**:
   - `DM_MESSAGE_CREATE`: Dispatched with `models.DMMessage` struct containing `encrypted: true`, `e2ee_ciphertext`, `e2ee_meta` (with `content = ""`).
   - `GROUP_MESSAGE_CREATE`: Dispatched with `models.DMGroupMessage` struct containing `encrypted: true`, `e2ee_ciphertext`, `e2ee_meta`.
   - `E2EE_TO_DEVICE`: Olm-encrypted messages delivered directly to target `device_id`.
   - `E2EE_ROTATION_REQUIRED`: Broadcast to participants when `rotation_epoch` is incremented.
3. **Zero Plaintext Logging**:
   - Gateway loggers only record metadata (`user_id`, `device_id`, event type, socket count). No message payload or ciphertext is logged.

---

## 6. Implementation Blueprint

### File Modification Inventory
1. `backend/internal/database/schema.sql`:
   - Fix `message_reactions` columns (`dm_group_message_id`, `e2ee_ciphertext`, nullable emoji).
   - Add `e2ee_attachments` table.
   - Add unique composite indexes on `(dm_room_id, id)` and `(group_id, id)`.
2. `backend/internal/database/db.go`:
   - Add schema migrations for `message_reactions` and `e2ee_attachments`.
3. `backend/internal/models/models.go`:
   - Add `Encrypted`, `E2EECiphertext`, `E2EEMeta` to `DMMessage`, `DMGroupMessage`, `Message`.
   - Add `E2EEEnabled`, `RotationEpoch` to `DMRoom`, `DMGroup`, `Channel`.
4. `backend/internal/models/e2ee.go`:
   - Add `E2EEAttachmentUploadResponse`, `E2EEKeyRequestPayload`.
5. `backend/internal/handlers/dm_handlers.go`:
   - Implement plaintext gating (409 `e2ee_required` / `e2ee_not_enabled`).
   - Implement idempotency contract on `req.ID`.
   - Update `ListMessages` to select and return `encrypted`, `e2ee_ciphertext`, `e2ee_meta`.
   - Implement `EnableE2EE` handler (`POST /api/dms/{roomID}/e2ee/enable`).
6. `backend/internal/handlers/dm_group_handlers.go`:
   - Implement plaintext gating (409 `e2ee_required` / `e2ee_not_enabled`).
   - Implement idempotency contract on `req.ID`.
   - Enforce 15-member cap on E2EE groups.
   - Increment `rotation_epoch` and broadcast `E2EE_ROTATION_REQUIRED` on member changes.
   - Update `ListMessages` to select and return `encrypted`, `e2ee_ciphertext`, `e2ee_meta`.
   - Implement `EnableE2EE` handler (`POST /api/dm/groups/{id}/e2ee/enable`).
7. `backend/internal/handlers/e2ee_handlers.go`:
   - Implement `UploadE2EEAttachment` (`POST /api/e2ee/attachments`).
   - Implement `DownloadE2EEAttachment` (`GET /api/e2ee/attachments/{id}`).
   - Implement `SubmitKeyRequest` (`POST /api/e2ee/key-requests`).
8. `backend/cmd/server/main.go`:
   - Register routes for DM E2EE enable, DM Group E2EE enable, attachments upload/download, key-requests.

---

## 7. Verification Plan & Test Suite Architecture

### 7.1 New Unit Test Suites
1. **`backend/internal/handlers/dm_e2ee_test.go`**:
   - `TestDM_EnableE2EE_StrictPOSTAndCSRF`: Verify GET is rejected with 405; POST without CSRF is rejected with 403; valid POST enables E2EE and sets epoch to 1.
   - `TestDM_PlaintextGating_E2EERequired`: Post plaintext to E2EE room -> assert 409 Conflict with `{"error":"e2ee_required"}`.
   - `TestDM_PlaintextGating_E2EENotEnabled`: Post encrypted to plaintext room -> assert 409 Conflict with `{"error":"e2ee_not_enabled"}`.
   - `TestDM_Idempotency_IdenticalPayload`: Post identical `req.ID` twice -> assert 200/201 idempotent success with identical body.
   - `TestDM_Idempotency_ConflictingPayload`: Post conflicting payload with same `req.ID` -> assert 409 Conflict.
   - `TestDM_ZeroPlaintextStorage`: Verify `content` column in database is `""` for encrypted message.
2. **`backend/internal/handlers/dm_group_e2ee_test.go`**:
   - `TestDMGroup_EnableE2EE_OwnerOnly`: Caller not owner -> assert 403 Forbidden. Owner -> 200 OK.
   - `TestDMGroup_MemberCap_Enforce15`: Adding members that would exceed 15 -> assert 400 Bad Request.
   - `TestDMGroup_RotationEpochBump`: Adding/removing member on E2EE group -> assert `rotation_epoch` increments.
   - `TestDMGroup_PlaintextGating`: Assert 409 `e2ee_required` and `e2ee_not_enabled`.
   - `TestDMGroup_Idempotency`: Idempotent retry and conflict rejection.
3. **`backend/internal/handlers/e2ee_attachments_test.go`**:
   - `TestE2EE_AttachmentUpload_OctetStream`: Upload raw binary -> assert 201 Created with opaque UUID URL.
   - `TestE2EE_AttachmentDownload_Headers`: GET attachment -> assert `Content-Disposition: attachment; filename="attachment.enc"` and `application/octet-stream`.
4. **`backend/internal/handlers/e2ee_key_requests_test.go`**:
   - `TestE2EE_KeyRequest_AudienceGating`: Non-member request -> assert 403 Forbidden. Member -> 200 OK.
   - `TestE2EE_KeyRequest_RateLimiting`: Flood 5 requests -> assert 429 Too Many Requests after threshold.

### 7.2 Regression Command
```bash
go test -v ./internal/handlers/... ./internal/gateway/... ./internal/middleware/...
```
All existing tests and new M3 test suites must pass 100% clean.
