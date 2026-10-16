# Handoff Report — Spec Miner M3.1 (Milestone M3: E2EE Messaging in DMs & Groups)

**Agent ID:** `spec_miner_m3_1`  
**Role:** M3 Specification Miner  
**Working Directory:** `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\`  
**Target Recipient:** `orchestrator_gen2`  
**Type:** Hard Handoff  

---

## 1. Observation

Direct observations from authoritative specifications and codebase:

1. **Specification Document (`e2ee_implementation_plan_revision6.md`):**
   - **§4, line 104:** *"Cliente antigo que tenta enviar mensagem em sala E2EE: backend rejeita com 409 `{ "error": "e2ee_required" }`; UI mostra 'Atualize o app para enviar nesta conversa'."*
   - **§4, line 105:** *"Mensagem E2EE em sala não-E2EE é proibida (409 `e2ee_not_enabled`). Evita downgrade confuso e estados inconsistentes."*
   - **§5, lines 113-115:**
     - 1. *"Reações: criptografadas (o emoji vai dentro de um envelope cifrado com a chave da conversa; o servidor guarda só blob + id da mensagem + autor)."*
     - 2. *"Limite: grupos de DM têm máx. 15 membros incluindo o dono."*
     - 3. *"Histórico: novos membros não veem mensagens anteriores."*
   - **§7.6, lines 174-175:**
     - *"cada mensagem E2EE possui `message_id` estável gerado pelo cliente. O backend deve garantir idempotência por conversa (`conversation_id + message_id`); reentrega via WebSocket/histórico nunca cria uma segunda mensagem."*
   - **§7.7, line 175:**
     - *"somente dispositivos pertencentes à audiência atual podem solicitar chaves; pedidos têm rate limit, deduplicação por `(requester_device_id, conversation_id, session_id)`, TTL e cooldown."*
     - *"o solicitante aceita a primeira resposta criptograficamente válida do roster vigente com `session_id` e `epoch` esperados."*
   - **§7.10, line 180:**
     - *"Edição de mensagem E2EE: nova cifragem com novo `msg_index` na mesma sessão; `message_id` preservado; servidor mantém `e2ee_meta` atualizado e rejeita edição que reuse `msg_index` antigo (anti-replay)."*
   - **§8, lines 228-232:**
     - *"No servidor/API: `content = ''`, `encrypted = true`, `e2ee_ciphertext = <base64 megolm>`, `e2ee_meta = {v, alg, session_id, sender_device_id, msg_index, epoch, ciphertext_hash}`."*
     - *"Usar coluna separada (`e2ee_ciphertext`) em vez de reutilizar `content` evita mexer na coluna gerada `search_vector`: com `content=''` ela fica vazia automaticamente, `ILIKE` não casa e os JOINs de preview (`rm.content`, `lm.content`) devolvem vazio sem vazar nada."*
   - **§10.2, table lines 388-406:**
     - Lists `POST /api/dms/{id}/e2ee/enable`, `POST /api/dm/groups/{id}/e2ee/enable`, `POST /api/e2ee/key-requests`.
   - **§10.4, lines 434-441:**
     - *"Upload E2EE usa `application/octet-stream`, nome aleatório e endpoint que não realiza processamento semântico do conteúdo."*
     - *"O cliente cifra cada arquivo com AES-256-GCM usando chave aleatória por arquivo. Chave, IV, hash e metadados necessários ficam dentro do envelope Megolm."*
     - *"Blobs E2EE sem `message_id` associado após uma janela de retenção configurável (default: 24 horas) são removidos por `temp_cleaner.go`."*
   - **§11.2, lines 494-513 & §16.3, lines 1208-1232:**
     - `messageCodec` é puro e desacoplado. Mensagens com falha de decifragem (`undecryptable`) são exibidas com aviso isolado sem quebrar o unread count nem a renderização do restante da conversa.

2. **Existing Codebase State (`zerovc`):**
   - **Database (`backend/internal/database/schema.sql` lines 475-498):**
     * Columns `dm_rooms.e2ee_enabled`, `dm_rooms.rotation_epoch`, `dm_groups.e2ee_enabled`, `dm_groups.rotation_epoch` are defined.
     * Columns `messages.encrypted`, `messages.e2ee_ciphertext`, `messages.e2ee_meta` are defined.
     * Schema has table `message_reactions` (lines 198-208), but line 498 attempts `ALTER TABLE reactions ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT;` — noting that the actual table in production is `message_reactions`.
     * `search_vector` generated column on `messages` is defined with `STORED` evaluating `to_tsvector('portuguese', coalesce(content, ''))` (lines 319-330, 413-414).
   - **Handlers (`backend/internal/handlers/dm_group_handlers.go` lines 66, 321):**
     * 15-member cap is partially enforced for plaintext groups:
       Line 66: `if len(totalMembers) > 15 { http.Error(w, ...); return }`
       Line 321: `if currentCount+len(req.MemberIDs) > 15 { http.Error(w, ...); return }`
   - **Message Handlers (`backend/internal/handlers/dm_handlers.go`, `dm_group_handlers.go`, `message_handlers.go`):**
     * Currently `SendMessage` expects only `content` and `attachments`.
     * `409 e2ee_required` and `409 e2ee_not_enabled` gating checks are NOT yet wired into `SendMessage`.
     * Idempotency `(conversation_id, message_id)` check is NOT yet wired into `SendMessage`.
   - **Routes (`backend/cmd/server/main.go` lines 442-467):**
     * `POST /api/dms/{id}/e2ee/enable` and `POST /api/dm/groups/{id}/e2ee/enable` are NOT yet registered in Chi router.
     * `POST /api/e2ee/attachments` is NOT yet registered in Chi router.
   - **Frontend (`client/src/crypto/megolmSession.ts` lines 4-28, 30-140):**
     * Megolm session management with `GroupSession` and `InboundGroupSession` using vodozemac is functional.
     * `EnvelopeV1` and `E2EEMeta` interfaces are already drafted.
     * `client/src/messaging/messageCodec.ts` is not yet created.

---

## 2. Logic Chain

1. **Gating & Integrity (Observations 1.1, 2.3):**
   - In conversations marked `e2ee_enabled = true`, any message without valid E2EE encryption must be rejected with HTTP 409 (`e2ee_required`) to prevent plaintext leakage into encrypted rooms.
   - Conversely, in conversations where `e2ee_enabled = false`, any encrypted payload must be rejected with HTTP 409 (`e2ee_not_enabled`) to prevent state desynchronization and unreadable messages for users without E2EE keys.
   - Therefore, the message creation handler in `dm_handlers.go`, `dm_group_handlers.go`, and `message_handlers.go` must query the parent conversation's `e2ee_enabled` flag and conditionally enforce this mutually exclusive gate.

2. **Database & Leak Prevention (Observations 1.4, 2.1):**
   - The PostgreSQL database trigger automatically computes `search_vector := to_tsvector('portuguese', COALESCE(NEW.content, ''))`.
   - If E2EE messages set `content = ''`, the search vector evaluates to an empty lexical token set.
   - Concurrently, lateral queries that join messages to display channel or DM previews (`SELECT lm.content`) return empty string `''`. The frontend detects `encrypted = true` and displays a client-side localized string ("Mensagem criptografada").
   - Therefore, the backend must strictly mandate `content = ''` on insertion of encrypted messages, avoiding any database migration or rewrite of the `search_vector` column.

3. **Group Size & History Isolation (Observations 1.2, 2.2):**
   - The user specification mandates a strict 15-member cap for E2EE DM groups (Phase 4). The existing code enforces `len(totalMembers) > 15` on creation and `currentCount + len(req.MemberIDs) > 15` on adding members.
   - History isolation requires that new members must not decrypt past messages. Megolm ratchets forward unidirectionally. To achieve history isolation, adding a new member increments `rotation_epoch`.
   - The next message sent in the group creates a fresh Megolm outbound session tagged with the new epoch and shares its session key via Olm ONLY to the current roster (devices present after the addition).
   - Therefore, new members are cryptographically restricted to sessions where `epoch >= entry_epoch`.

4. **Idempotency & Anti-Replay (Observations 1.3, 1.4, 1.5):**
   - Network retries from web, electron, or mobile clients can send the same message twice.
   - If the client generates `message_id` before encryption and provides it in the payload, the backend can check whether `(conversation_id, message_id)` already exists.
   - If payload matches, returning `200/201` with the existing row ensures idempotency without duplicating records or emitting redundant WebSocket events. If payload conflicts, returning `409 Conflict` rejects tampering.
   - For edits, incrementing `msg_index` and verifying `new_index > old_index` prevents replay of previous message states while preserving `message_id`.

5. **Attachments & Key Request (Observations 1.3, 1.6, 1.7):**
   - Pre-encrypting attachments with AES-256-GCM on the client and storing key/IV/hash inside the Megolm envelope ensures the storage backend only sees opaque binary bytes. Setting `Content-Disposition: attachment` on download prevents browser execution.
   - If an inbound session is missing, emitting a rate-limited, deduplicated `key_request` allows recovering the session from other devices in the active roster. Decoupling this from the store ensures unread counters never lock up.

---

## 3. Caveats

1. **Table Name Consistency:** The migration file `db.go` and `schema.sql` contains `ALTER TABLE reactions ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT;`, whereas the actual operational table is named `message_reactions`. Implementers must ensure `message_reactions` receives `e2ee_ciphertext TEXT` and that DM group reactions (`dm_group_message_id`) are supported.
2. **Channel Scope:** While M3 focuses on DMs 1:1 and DM Groups (Phases 2 and 4), the `SendMessage` validation logic for plaintext gating should be designed generically so that Milestone M5 (Server Channels) can reuse the exact same pattern without regression.
3. **Android WebView Matrix:** The client WebCrypto Keystore and IndexedDB implementation relies on standard Web APIs; on Android WebView, `isE2EESupported()` must be verified to prevent crashes on outdated WebViews.

---

## 4. Conclusion

The specification requirements for Milestone M3 (E2EE Messaging in DMs and Groups) have been thoroughly mined, categorized, and documented in `spec_analysis.md`. All contracts, schemas, error codes, HTTP statuses, and edge cases are completely defined and actionable for backend and frontend implementation agents.

Key Deliverables Established:
- Complete requirements analysis in `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\spec_analysis.md`.
- Exhaustive Features Discovered table (21 distinct features mapped across 6 categories).
- Exhaustive Edge Cases table (18 distinct edge cases and observed error behaviors).
- Explicit identification of code gaps in models, message handlers, routes, attachments, and reactions.

---

## 5. Verification Method

To verify the findings and baseline integrity:

1. **Inspect Specification Report:**
   ```bash
   cat "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\spec_analysis.md"
   ```
2. **Verify Backend Build and Test Baseline:**
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test ./internal/handlers -v -run TestEd25519SignatureVerification
   go test ./internal/handlers -v -run TestRosterChainingAndAudienceHash
   ```
   *Expected result:* All unit tests pass with exit code 0.
3. **Verify Database Trigger and Search Vector Protection:**
   Inspect `backend/internal/database/schema.sql` lines 319-330 and 413-414 to confirm `messages_search_vector_update` computes over `coalesce(content, '')`, confirming that `content = ''` produces empty search vectors.
4. **Invalidation Conditions:**
   - Any requirement allowing plaintext storage of E2EE messages in `content`.
   - Any requirement allowing encrypted messages in non-E2EE rooms or plaintext in E2EE rooms without returning HTTP 409.
   - Any relaxation of the strict 15-member cap on DM groups.
