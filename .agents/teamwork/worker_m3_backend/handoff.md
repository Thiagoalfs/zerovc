# Handoff Report — Milestone M3 Go Backend Implementation

## 1. Observation
- **DB Schema & Migrations**:
  - `backend/internal/database/schema.sql`:
    - Updated `message_reactions` table with `dm_group_message_id UUID REFERENCES dm_group_messages(id) ON DELETE CASCADE`, `e2ee_ciphertext TEXT`, and nullable `emoji VARCHAR(64)`.
    - Added unique constraint `idx_message_reactions_dm_group_user` for `(dm_group_message_id, user_id, emoji)`.
    - Added unique composite indexes for idempotency:
      - `idx_dm_messages_room_id_unique ON dm_messages (dm_room_id, id)`
      - `idx_dm_group_messages_group_id_unique ON dm_group_messages (group_id, id)`
      - `idx_messages_channel_id_unique ON messages (channel_id, id)`
    - Created `e2ee_attachments` table with `id UUID PRIMARY KEY`, `uploader_id UUID REFERENCES users(id) ON DELETE CASCADE`, `file_size BIGINT NOT NULL`, `created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`, and indices on `uploader_id` and `created_at`.
  - `backend/internal/database/db.go`:
    - `AutoMigrate`: Added `ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS dm_group_message_id UUID REFERENCES dm_group_messages(id) ON DELETE CASCADE`, `ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT`, `ALTER TABLE message_reactions ALTER COLUMN emoji DROP NOT NULL`, and created `e2ee_attachments` table along with the composite unique indexes.
- **Data Models**:
  - `backend/internal/models/models.go`:
    - `Channel`, `DMRoom`, `DMGroup`: Added `E2EEEnabled bool` and `RotationEpoch int`.
    - `Message`, `DMMessage`, `DMGroupMessage`: Added `Encrypted bool`, `E2EECiphertext *string`, and `E2EEMeta *string`.
    - `MessageReaction`: Added `E2EECiphertext *string`.
    - Added `MessageReactionRecord` model.
  - `backend/internal/models/e2ee.go`:
    - Added `E2EEAttachmentUploadResponse` and `E2EEKeyRequestPayload`.
- **Plaintext Gating & Zero Plaintext Storage**:
  - `backend/internal/handlers/dm_handlers.go`:
    - `SendMessage`: When `e2ee_enabled == true`, requires `encrypted == true` and non-empty `e2ee_ciphertext`. If missing or plaintext sent, returns HTTP 409 Conflict with `{"error":"e2ee_required"}`.
    - When `e2ee_enabled == false`, requires `encrypted == false` and empty ciphertext. If encrypted payload sent, returns HTTP 409 Conflict with `{"error":"e2ee_not_enabled"}`.
    - Enforced zero plaintext storage: when `isEncrypted`, `contentToStore = ""` is written to the database.
    - Idempotency contract: on existing message ID match, checks author and payload. Returns HTTP 200 on exact match, or HTTP 409 Conflict with `{"error":"idempotency_conflict"}` on conflicting payload or author mismatch.
    - Added `EnableE2EE` handler (`POST /api/dms/{roomID}/e2ee/enable` & `/api/dm/rooms/{roomID}/e2ee/enable`).
    - Added E2EE support to `AddReaction`.
  - `backend/internal/handlers/dm_group_handlers.go`:
    - `CreateGroup`: Enforced 15-member cap (`len(req.MemberIDs) + 1 > 15` returns 400 `max 15 members allowed`).
    - `AddMembers`: Enforced 15-member cap (`currentMemberCount + len(req.MemberIDs) > 15` returns 400 `max 15 members allowed`).
    - `AddMembers` & `RemoveMember`: When `group.E2EEEnabled == true`, increments `rotation_epoch++` in DB and broadcasts `E2EE_ROTATION_REQUIRED` WebSocket event.
    - `SendMessage`: Implemented plaintext gating (409 `e2ee_required` / 409 `e2ee_not_enabled`), zero plaintext storage (`content = ""`), and idempotency comparison.
    - Added `EnableE2EE` handler (`POST /api/dm/groups/{id}/e2ee/enable`).
  - `backend/internal/handlers/message_handlers.go`:
    - `Send`: Plaintext gating (409), zero plaintext storage, and idempotency contract.
    - `Search`: Filtered out encrypted messages with `AND (m.encrypted IS FALSE OR m.encrypted IS NULL)`.
    - `AddReaction`: Added support for encrypted reactions (`e2ee_ciphertext`).
- **Encrypted Attachments & Key Requests**:
  - `backend/internal/handlers/e2ee_handlers.go`:
    - `UploadAttachment` (`POST /api/e2ee/attachments`): 50MB limit, writes binary file to `uploads/e2ee_attachments/<id>.bin`, inserts metadata in `e2ee_attachments`, returns 201 Created with JSON `{id, url, filename: "encrypted.bin", size}`.
    - `DownloadAttachment` (`GET /api/e2ee/attachments/{id}`): Sets `Content-Type: application/octet-stream`, `Content-Disposition: attachment; filename="encrypted.bin"`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=86400`, and serves binary file.
    - `SubmitKeyRequest` (`POST /api/e2ee/key-requests`): Validates session_id, conversation_id, requester_device_id, verifies conversation membership, queues to `e2ee_to_device` table for each recipient device, and dispatches real-time WebSocket `E2EE_TO_DEVICE` event.
- **Routing**:
  - `backend/cmd/server/main.go`:
    - Wired `POST /api/dms/{roomID}/e2ee/enable`, `POST /api/dm/rooms/{roomID}/e2ee/enable`, `POST /api/dms/{id}/e2ee/enable`, `POST /api/dm/rooms/{id}/e2ee/enable`.
    - Wired `POST /api/dm/groups/{id}/e2ee/enable`.
    - Wired `POST /api/e2ee/attachments` (with upload rate limiting), `GET /api/e2ee/attachments/{id}`, and `POST /api/e2ee/key-requests` inside E2EE-version-gated group.
- **Verification Commands & Results**:
  - `go build ./...` in `backend/`: Exited with code 0.
  - `go test -v ./internal/handlers -run "TestM3_"`: All 8 test functions and 16 subtests passed (PASS 0.00s - 0.02s).
  - `go test -count=1 ./internal/...`: All internal packages passed (`gateway`, `handlers`, `middleware`, `ratelimit` OK, exit code 0).

## 2. Logic Chain
1. Database Schema & Idempotency Uniqueness:
   - Client-generated `message_id` requires composite uniqueness per room/channel to enforce that two concurrent requests for the same message ID cannot insert conflicting rows or double messages.
   - The unique indexes `(dm_room_id, id)`, `(group_id, id)`, and `(channel_id, id)` provide database-level concurrency protection.
   - Catching Postgres unique error `23505` allows handlers to safely re-query the existing record when two concurrent requests arrive simultaneously, evaluating the idempotency contract without returning a 500 server error.
2. Plaintext Gating & Zero Plaintext Storage:
   - When a conversation has `e2ee_enabled = true`, cleartext messages must never enter the system to prevent plaintext leaks. Responding with HTTP 409 `{"error":"e2ee_required"}` signals the client that encryption is mandatory.
   - Conversely, when `e2ee_enabled = false`, attempting to send ciphertext is rejected with HTTP 409 `{"error":"e2ee_not_enabled"}` so that non-E2EE clients do not receive un-decryptable garbage.
   - Setting `contentToStore = ""` whenever `isEncrypted == true` ensures Postgres full-text search triggers evaluate `to_tsvector('portuguese', '')` and no encrypted payload or plaintext artifact is stored in the database text column.
3. DM Group 15-Member Cap & Lazy Epoch Rotation:
   - In small-group E2EE using Megolm / sender keys, limiting participants to 15 prevents fan-out performance degradation.
   - Adding or removing members changes the cryptographic roster. Incrementing `rotation_epoch++` and broadcasting `E2EE_ROTATION_REQUIRED` forces active sender devices to discard existing session keys and establish fresh ratchet chains for subsequent messages.
4. Encrypted Attachments:
   - E2EE attachments must be uploaded as raw encrypted octet-streams to avoid server inspection of media types or filenames.
   - Serving downloads with `Content-Disposition: attachment; filename="encrypted.bin"` and `X-Content-Type-Options: nosniff` prevents browser-based MIME-sniffing and cross-origin script execution.
5. Key Gossip & To-Device Routing:
   - When a new or un-keyed device requests past keys for a session, `POST /api/e2ee/key-requests` verifies the requester's membership in the target conversation, queues the request in `e2ee_to_device`, and dispatches it in real time via WebSocket to all other devices in the conversation.

## 3. Caveats
- No caveats. All requirements for Milestone M3 backend are fully implemented and verified against the comprehensive test matrix. No client code was modified. No `git push` was executed.

## 4. Conclusion
Milestone M3 Go backend implementation is complete. All database migrations, models, handlers, plaintext gating rules, idempotency contracts, group caps, epoch rotations, E2EE endpoints, and unit tests are in place, compiling cleanly and passing 100%.

## 5. Verification Method
1. Compile the entire backend:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go build ./...
   ```
   *Expected outcome*: Exits with code 0 and no compile errors.
2. Run M3 unit tests:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/handlers -run "TestM3_"
   ```
   *Expected outcome*: All tests pass (`PASS`).
3. Run the complete backend test suite:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -count=1 ./internal/...
   ```
   *Expected outcome*: All packages pass with 100% success rate.
