# Relatório de Mineração de Especificação: Marco M3
## Mensageria E2EE em DMs e Grupos (Fases 2 e 4)

**Data de Emissão:** 2026-10-10  
**Autor:** `spec_miner_m3_1` (M3 Specification Miner)  
**Parent:** `orchestrator_gen2`  
**Fontes Autoritativas:**
- `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` (§4, §5, §6, §7.6-§7.8, §7.10, §8, §10.1-§10.4, §11, §12, §14 Fase 2 e Fase 4, §16, Anexo A, Anexo B)
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (R3 §24-§30)
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md` (§Code Layout, §Feature Inventory, §Interface Contracts)
- Código fonte existente: `backend/internal/database/schema.sql`, `backend/internal/database/db.go`, `backend/internal/models/models.go`, `backend/internal/models/e2ee.go`, `backend/internal/handlers/e2ee_handlers.go`, `backend/internal/handlers/dm_handlers.go`, `backend/internal/handlers/dm_group_handlers.go`, `backend/internal/handlers/message_handlers.go`, `client/src/crypto/megolmSession.ts`, `client/src/lib/api.ts`.

---

## 1. Visão Geral e Escopo do Marco M3

O Marco M3 consolida a mensageria de ponta a ponta (E2EE) no ZeroVC para:
1. **DMs 1:1** (Fase 2 do plano)
2. **Grupos de DM** (Fase 4 do plano, limitado estritamente a 15 membros)

A segurança criptográfica é construída sobre a infraestrutura validada nos marcos M1 (vodozemac WASM, KeyStore IndexedDB WebCrypto) e M2 (Identidade Ed25519, Dispositivos Olm, To-Device Queue, Chained Signed Rosters com `X-Client-E2EE-Version`).

### Princípios Invariantes de M3
1. **Zero Plaintext no Servidor:** Mensagens E2EE armazenam `content = ''` nas tabelas `messages`, `dm_messages` e `dm_group_messages`. O payload cifrado reside exclusivamente em `e2ee_ciphertext` e metadados estruturados em `e2ee_meta`.
2. **Proteção de Busca e Previews:** A coluna gerada `search_vector` avalia para vazio (`to_tsvector('portuguese', '')`), buscas `ILIKE` não casam e lateral joins de preview (`rm.content`, `lm.content`) não vazam texto puro.
3. **Gating Rígido de Plaintext:** O backend bloqueia com `409 Conflict (e2ee_required)` mensagens em texto puro em conversas E2EE, e com `409 Conflict (e2ee_not_enabled)` mensagens criptografadas em conversas regulares.
4. **Idempotência Estrita por `(conversation_id, message_id)`:** Retries com payload idêntico retornam sucesso idempotente (200/201). Retries com payload conflitante retornam `409 Conflict`.
5. **Teto de 15 Membros em Grupos DM:** Imutável na criação e na adição de membros.
6. **Isolamento de Histórico para Novos Membros:** Novos membros nunca recebem chaves Megolm de sessões anteriores ao seu epoch de ingresso.
7. **Codec Puro e Desacoplado no Cliente:** `messageCodec` transforma transporte em modelo renderizável sem alterar estado de leitura nem travar unread badges com mensagens indecifráveis.

---

## 2. Especificação Detalhada por Dimensão

### 2.1 Estado E2EE da Conversa & Gating de Plaintext

#### 2.1.1 Ativação de E2EE
- **Endpoints de Ativação:**
  * `POST /api/dms/{id}/e2ee/enable` (DMs 1:1)
  * `POST /api/dm/groups/{id}/e2ee/enable` (Grupos de DM)
- **Método HTTP & CSRF:** Exclusivamente `POST`, exigindo cabeçalho `X-CSRF-Token` validado contra a sessão via `hash_equals`.
- **Gating de Versão:** Exige cabeçalho `X-Client-E2EE-Version >= 1` (rejeita clientes legados com `426 Upgrade Required`).
- **Autorização:**
  * Em DM 1:1: O solicitante deve ser `user1_id` ou `user2_id`. Ambos os participantes devem ter identidade Ed25519 e dispositivos ativos registrados.
  * Em Grupo DM: O solicitante deve ser o `owner_id` (ou membro autorizado).
- **Semântica de Transição:**
  * **Opt-in Irreversível:** Uma vez ativado (`e2ee_enabled = true`), a conversa nunca retorna para plaintext. Tentativa de reativação retorna sucesso idempotente (200) ou `400 already_enabled`.
  * **Histórico Pregresso:** Mensagens anteriores continuam com `encrypted = false` e são renderizadas com divisor visual explícito na UI ("Histórico não-E2EE").
  * **Inicialização Criptográfica:** Define `rotation_epoch = 1` e exige a submissão do roster inicial assinado (`version = 1, epoch = 1`).

#### 2.1.2 Gating em Envio de Mensagens (`SendMessage`)
- **Regra 1: Mensagem Plaintext em Conversa E2EE:**
  * Condição: Conversa com `e2ee_enabled = true` recebe requisição com `encrypted = false` (ou ausente), ou `e2ee_ciphertext` vazio, ou `content != ''` sem cifragem válida.
  * Resposta HTTP: **`409 Conflict`**
  * Corpo JSON: `{"error": "e2ee_required"}`
  * UI Cliente: Exibe banner/aviso: "Atualize o app para enviar nesta conversa."
- **Regra 2: Mensagem E2EE em Conversa Regular:**
  * Condição: Conversa com `e2ee_enabled = false` recebe requisição com `encrypted = true` ou `e2ee_ciphertext` preenchido.
  * Resposta HTTP: **`409 Conflict`**
  * Corpo JSON: `{"error": "e2ee_not_enabled"}`
  * Justificativa: Evita estados híbridos inconsistentes e corrupção de mensagens para recipientes sem E2EE configurado.
- **Regra 3: Validação de Consistência Criptográfica:**
  * `encrypted = true` exige obrigatoriamente `e2ee_ciphertext` não-vazio e `e2ee_meta` válido. Caso contrário, retorna **`400 Bad Request`** (`{"error": "ciphertext and metadata required for encrypted message"}`).
  * `encrypted = false` com `e2ee_ciphertext` preenchido retorna **`400 Bad Request`**.

---

### 2.2 Limite de Membros em Grupos & Isolamento de Histórico

#### 2.2.1 Teto Estrito de 15 Membros
- **Na Criação do Grupo (`POST /api/dm/groups`):**
  * Validação: O array total de participantes únicos incluindo o criador (`owner_id`) não pode ultrapassar 15.
  * Código existente verificado em `dm_group_handlers.go`:
    ```go
    if len(totalMembers) > 15 {
        http.Error(w, `{"error":"grupos de DM podem ter no máximo 15 membros"}`, http.StatusBadRequest)
        return
    }
    ```
- **Na Adição de Membros (`POST /api/dm/groups/{id}/members`):**
  * Validação: `currentCount + len(req.MemberIDs) > 15`
  * Código existente verificado em `dm_group_handlers.go`:
    ```go
    if currentCount+len(req.MemberIDs) > 15 {
        http.Error(w, `{"error":"o grupo não pode ultrapassar 15 membros"}`, http.StatusBadRequest)
        return
    }
    ```

#### 2.2.2 Isolamento de Histórico para Novos Membros
- **Princípio Invariante:** Um novo membro adicionado ao grupo no epoch $E$ nunca deve ter acesso às chaves ou mensagens de epochs $< E$.
- **Mecanismo de Rotação Lazy:**
  1. Ao adicionar ou remover um membro de grupo E2EE, o backend incrementa atomicamente o `rotation_epoch` na tabela `dm_groups`:
     $$\text{new\_epoch} = \text{current\_epoch} + 1$$
  2. Um novo roster assinado é gerado com a nova lista canônica de membros e dispositivos (`version = prev_version + 1`, `epoch = new_epoch`, `prev_roster_hash`).
  3. O backend emite os eventos WebSocket `E2EE_ROSTER_UPDATE` e `E2EE_ROTATION_REQUIRED`.
  4. O próximo remetente no grupo detecta que o epoch local é inferior ao epoch do grupo. O remetente descarta/encerra a sessão Megolm de saída antiga e cria uma nova sessão Megolm com `epoch = new_epoch`.
  5. A nova chave de sessão é distribuída via to-device Olm **exclusivamente para os dispositivos do roster atual**.
  6. Dispositivos recém-ingressados só recebem a nova sessão. Sessões anteriores não são distribuídas nem armazenadas pelo novo dispositivo.
  7. Se o novo membro emitir um `key_request` para uma sessão com `epoch < entry_epoch`, o backend e os demais clientes rejeitam ou descartam o pedido.

---

### 2.3 Esquema de Banco de Dados e Idempotência de Mensagens

#### 2.3.1 Colunas de Mensagens
As tabelas `messages`, `dm_messages` e `dm_group_messages` possuem as seguintes colunas para E2EE:

| Coluna | Tipo | Restrição | Semântica E2EE |
|---|---|---|---|
| `content` | `TEXT` | `NOT NULL DEFAULT ''` | Para mensagens E2EE, armazena **obrigatoriamente string vazia `''`**. Garante conformidade com `NOT NULL` sem vazar texto. |
| `encrypted` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Flag indicativa de payload criptografado Megolm. |
| `e2ee_ciphertext` | `TEXT` | `NULL` | Blob em Base64 do ciphertext Megolm gerado pelo vodozemac. |
| `e2ee_meta` | `JSONB` | `NULL` | Metadados públicos da sessão Megolm (ver estrutura abaixo). |

#### 2.3.2 Estrutura do `e2ee_meta` (JSONB)
```json
{
  "v": 1,
  "alg": "m.megolm.v1.aes-sha2",
  "session_id": "AbCdEf... (Megolm Session ID)",
  "sender_device_id": "3b7543fa-09df-41c3-8a07-846174a74287",
  "msg_index": 0,
  "epoch": 1,
  "ciphertext_hash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e"
}
```

#### 2.3.3 Proteção do `search_vector` e Previews
- **Trigger `search_vector`:**
  ```sql
  CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
  BEGIN
      NEW.search_vector := to_tsvector('portuguese', COALESCE(NEW.content, ''));
      RETURN NEW;
  END
  $$ LANGUAGE plpgsql;
  ```
  Como `content = ''`, `to_tsvector('portuguese', '')` gera um vetor léxico vazio. Zero tokens de mensagens E2EE são indexados no GIN index.
- **Lateral Joins de Previews (`ListRooms`, `ListGroups`):**
  As queries de pré-visualização selecionam `lm.content`. Para mensagens E2EE, `lm.content` é `''`. O frontend lê `encrypted: true` e renderiza o placeholder local: *"Mensagem criptografada"*.

#### 2.3.4 Contrato de Idempotência `(conversation_id, message_id)`
- O cliente gera o `message_id` (UUID v4 estável) **antes** da cifragem.
- O mesmo `message_id` é reenviado em retries de rede.
- **Comportamento do Backend:**
  1. **Primeiro Envio:** Insere a mensagem, retorna `201 Created` (ou `200 OK`) e faz broadcast WebSocket (`DM_MESSAGE_CREATE` / `GROUP_MESSAGE_CREATE`).
  2. **Reenvio Idêntico (Retry):**
     * Verifica se existe registro com `(conversation_id, message_id)`.
     * Se os campos `e2ee_ciphertext` e `e2ee_meta` forem idênticos ao registro existente: retorna sucesso idempotente (`200 OK` ou `201 Created`) com o objeto já persistido, **sem** duplicar linhas no banco e **sem** reemitir evento WebSocket duplicado.
  3. **Reenvio com Conflito (Payload Alterado):**
     * Se o mesmo `message_id` for enviado com `e2ee_ciphertext`, `content` ou metadados conflitantes: retorna **`409 Conflict`** (`{"error": "message_conflict"}`).

---

### 2.4 Envelopes Megolm, Reações Cifradas & Edições

#### 2.4.1 Formato do Envelope Megolm (V1)
O texto puro decifrado pelo vodozemac no cliente segue a estrutura:
```json
{
  "v": 1,
  "body": "Olá! Esta mensagem está criptografada de ponta a ponta.",
  "reply_to": "d4e5f6a7-0000-1111-2222-333344445555",
  "attachments": [
    {
      "url": "/api/e2ee/attachments/b2c3d4e5-1111-2222-3333-444455556666",
      "name": "foto_privada.png",
      "mime": "image/png",
      "size": 245120,
      "key": "base64_256bit_aes_key...",
      "iv": "base64_96bit_iv...",
      "sha256": "base64_sha256_digest...",
      "w": 1920,
      "h": 1080
    }
  ],
  "mentions": ["a1b2c3d4-0000-0000-0000-000000000001"],
  "link_previews": []
}
```
- **Versão do Envelope (`v`):** Inteiro monotonicamente versionado. Se o cliente encontrar uma versão desconhecida (ex: `v = 2`), a mensagem é marcada como `undecryptable` ("versão de envelope não suportada") de forma isolada, sem travar o fluxo.

#### 2.4.2 Reações Cifradas
- **Estrutura de Banco:** Tabela `message_reactions` com coluna `e2ee_ciphertext TEXT`.
- **Comportamento:** O emoji escolhido pelo usuário é cifrado com a sessão Megolm da conversa antes do envio.
- **No Servidor:** O servidor armazena apenas `dm_message_id` (ou `message_id`), `user_id`, `created_at` e o blob `e2ee_ciphertext`. A coluna `emoji` é gravada como valor vazio ou marcador opaco (`""` ou `"e2ee"`).
- **Tratamento de Mensagem Indecifrável:** Se o cliente ainda não decifrou a mensagem ou a reação, a UI exibe "Reação (indecifrável)" acompanhada do contador numérico, omitindo o emoji. Quando a sessão Megolm for obtida, a reação é decifrada retroativamente.

#### 2.4.3 Edição Cifrada & Regra Anti-Replay
- **Preservação de Identificador:** O `message_id` permanece inalterado.
- **Novo Índice de Ratchet:** A nova versão da mensagem é cifrada com a sessão Megolm do remetente, avançando o ratchet unidirecional e produzindo um novo `msg_index` estritamente maior.
- **Validação Anti-Replay no Backend (`UpdateMessage`):**
  * O backend compara o novo `msg_index` com o `msg_index` registrado em `e2ee_meta`.
  * Se $\text{new\_index} \le \text{current\_index}$: rejeição com **`400 Bad Request`** ou **`409 Conflict`** (`{"error": "replay_detected"}`).
  * Atualiza `e2ee_ciphertext`, `e2ee_meta`, marca `is_edited = true` e `edited_at = CURRENT_TIMESTAMP`.
  * O histórico de versões anteriores de mensagens E2EE **nunca** é arquivado em texto puro.

---

### 2.5 Anexos Cifrados

#### 2.5.1 Endpoint Dedicado de Upload
- **Rota:** `POST /api/e2ee/attachments`
- **Cabeçalhos da Requisição:**
  * `Content-Type: application/octet-stream`
  * `X-CSRF-Token: <token>`
  * `X-Client-E2EE-Version: 1`
- **Processamento no Servidor:** O servidor trata o arquivo como binário opaco (`application/octet-stream`), atribui um UUID aleatório opaco, **sem** gerar thumbnails, OCR, metadados EXIF ou qualquer inspeção de conteúdo.
- **Resposta do Upload:**
  ```json
  {
    "id": "b2c3d4e5-1111-2222-3333-444455556666",
    "url": "/api/e2ee/attachments/b2c3d4e5-1111-2222-3333-444455556666",
    "size": 245120
  }
  ```

#### 2.5.2 Endpoint de Download de Anexos
- **Rota:** `GET /api/e2ee/attachments/{id}`
- **Cabeçalhos de Segurança:**
  * `Content-Type: application/octet-stream`
  * `Content-Disposition: attachment; filename="encrypted.bin"` (força download, impedindo execução inline de scripts ou XSS no navegador)
  * `X-Content-Type-Options: nosniff`

#### 2.5.3 Protocolo Criptográfico no Cliente
- **Algoritmo:** `AES-256-GCM`.
- **Geração de Chaves:**
  * Chave simétrica de 256 bits gerada via `crypto.getRandomValues(new Uint8Array(32))`.
  * IV/Nonce de 96 bits (12 bytes) gerado via `crypto.getRandomValues(new Uint8Array(12))`.
  * Cálculo de digest SHA-256 do arquivo original para validação de integridade pós-download.
- **Localização dos Segredos:** Chave, IV e SHA-256 trafegam exclusivamente **dentro do envelope Megolm** cifrado. O backend nunca recebe esses valores.
- **Limpeza de Arquivos Órfãos:** Blobs E2EE sem `message_id` vinculado após 24 horas são purgados pelo serviço `temp_cleaner.go`.

---

### 2.6 Protocolo de Distribuição de Chaves e `key_request`

#### 2.6.1 Distribuição Ativa (`room_key`)
- Ao iniciar uma nova sessão Megolm de saída, o remetente exporta a chave de sessão (`session.sessionKey()`).
- Para cada dispositivo constante no roster assinado da conversa:
  * O remetente cifra o payload com a sessão Olm 1:1 daquele dispositivo.
  * Envia via `POST /api/e2ee/to-device` com `msg_type = "room_key"`.
  * O servidor enfileira em `e2ee_to_device` e despacha em tempo real se o dispositivo estiver conectado ao gateway WebSocket (`E2EE_TO_DEVICE`).

#### 2.6.2 Solicitação Reativa (`key_request`)
Quando um cliente recebe uma mensagem cifrada com um `session_id` que não existe em seu KeyStore local:
1. A mensagem transita para o estado `undecryptable`.
2. O cliente emite um `key_request` para os demais dispositivos elegíveis:
   * **Endpoint:** `POST /api/e2ee/key-requests` ou via to-device queue com `msg_type = "key_request"`.
   * **Payload:**
     ```json
     {
       "conversation_type": "dm",
       "conversation_id": "11112222-3333-4444-5555-666677778888",
       "session_id": "MegolmSessionId...",
       "epoch": 1,
       "requester_device_id": "3b7543fa-09df-41c3-8a07-846174a74287"
     }
     ```
3. **Controles Rígidos no Servidor:**
   * **Verificação de Audiência:** O dispositivo solicitante deve pertencer à audiência/roster atual da conversa. Dispositivos não autorizados são rejeitados imediatamente.
   * **Rate Limit:** Máximo de 10 solicitações por minuto por dispositivo via `httprate`.
   * **Deduplicação:** Chaveada por `(requester_device_id, conversation_id, session_id)`. Pedidos idênticos repetidos dentro do cooldown (30 segundos) são descartados silenciosamente.
   * **TTL:** Expira em 60 segundos.
   * **Limite de Encaminhamento:** O servidor limita a quantidade de dispositivos notificados para evitar tempestades de resposta (*thundering herd*).

#### 2.6.3 Resposta Validada e Critério da Primeira Válida
- O dispositivo que responde empacota a chave de sessão com:
  $$\text{payload} = \text{session\_id} + \text{epoch} + \text{session\_key} + \text{assinatura Ed25519 do dispositivo respondente}$$
- **Validação pelo Solicitante:**
  1. O respondente pertence ao roster vigente? Se não, **descarta**.
  2. O `session_id` e o `epoch` correspondem ao esperado? Se não, **descarta**.
  3. A assinatura Ed25519 é válida? Se não, **descarta**.
  4. O solicitante aceita a **primeira resposta criptograficamente válida**. Respostas duplicadas subsequentes para o mesmo par `(requester_device_id, session_id)` são ignoradas.

#### 2.6.4 Mensagens Indecifráveis & Desacoplamento de Leitura (Unread Badges)
- **UI Isolada:** A mensagem exibe aviso isolado ("Mensagem indecifrável — aguardando chave") sem quebrar a timeline ou interromper o carregamento de mensagens anteriores/posteriores.
- **Desacoplamento do Contador de Não Lidas:**
  * O `messageCodec` é **puro**: decifrar não altera stores nem unread count.
  * O store recebe o evento `MESSAGE_CREATE` com o `message_id`, incrementa o contador de não lidas e registra o read state normalmente.
  * A falha temporária de decifragem **nunca** congela o badge de unread nem impede o avanço do cursor de leitura.
  * Quando a sessão Megolm chega via `room_key`, a mensagem transita de `undecryptable` para `decrypted` de forma reativa e transparente.

---

## 3. Matriz de Descoberta de Funcionalidades

## Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Room E2EE State | Plaintext Gating em Salas E2EE | Rejeição estrita de mensagens em claro em salas onde `e2ee_enabled = true`. | `POST /api/dms/{id}/messages` ou `/dm/groups/{id}/messages` com `encrypted = false` ou payload plaintext | HTTP 409 Conflict | `409` com `{ "error": "e2ee_required" }` | §4 l.104, §10.3 l.423 |
| 2 | Room E2EE State | Cifragem Gating em Salas Plaintext | Rejeição estrita de mensagens com `encrypted = true` em salas não-E2EE. | `POST` mensagem com `encrypted = true` em sala com `e2ee_enabled = false` | HTTP 409 Conflict | `409` com `{ "error": "e2ee_not_enabled" }` | §4 l.105, §10.3 l.424 |
| 3 | Room E2EE State | Ativação E2EE em DMs 1:1 | Promoção irreversível de DM 1:1 para canal criptografado E2EE. | `POST /api/dms/{id}/e2ee/enable`, `X-CSRF-Token`, `X-Client-E2EE-Version: 1` | HTTP 200/201 `{ "e2ee_enabled": true, "rotation_epoch": 1 }` | 401 (auth), 403 (não participante/CSRF), 409 (já ativo), 426 (cliente desatualizado) | §10.2 l.402, PROJECT.md |
| 4 | Room E2EE State | Ativação E2EE em Grupos de DM | Promoção irreversível de Grupo de DM para canal criptografado E2EE. | `POST /api/dm/groups/{id}/e2ee/enable`, `X-CSRF-Token`, `X-Client-E2EE-Version: 1` | HTTP 200/201 `{ "e2ee_enabled": true, "rotation_epoch": 1 }` | 401 (auth), 403 (não owner/CSRF), 409 (já ativo), 426 (cliente desatualizado) | §10.2 l.402, PROJECT.md |
| 5 | Group Size | Teto de 15 Membros na Criação | Bloqueio de criação de grupo de DM com mais de 15 membros (incluindo dono). | `POST /api/dm/groups` com `member_ids` excedendo 15 total | HTTP 200 com grupo criado | `400 Bad Request` com `{ "error": "grupos de DM podem ter no máximo 15 membros" }` | §5 l.114, §14 l.1036, `dm_group_handlers.go` l.66 |
| 6 | Group Size | Teto de 15 Membros na Adição | Bloqueio de inserção de membros que eleve a contagem acima de 15. | `POST /api/dm/groups/{id}/members` com contagem final > 15 | HTTP 200 com lista de membros atualizada | `400 Bad Request` com `{ "error": "o grupo não pode ultrapassar 15 membros" }` | §5 l.114, `dm_group_handlers.go` l.321 |
| 7 | Membership | Isolamento de Histórico para Novos Membros | Novos membros não recebem chaves Megolm de sessões anteriores ao seu ingresso. | Membro adicionado no `epoch = E`; solicita chaves anteriores | Apenas sessões `epoch >= E` entregues | Tentativas de `key_request` para `epoch < E` são descartadas/rejeitadas | §5 l.115, §12.6 l.858-874 |
| 8 | Database Schema | Armazenamento de Texto Vazio para E2EE | Garantia de que mensagens E2EE gravam `content = ''`, protegendo colunas e triggers. | `INSERT INTO dm_messages / dm_group_messages` com `encrypted = true` | Linha gravada com `content = ''` | `400 Bad Request` se `encrypted = true` e `e2ee_ciphertext` ausente | §8 l.228-232, §10.1 l.485 |
| 9 | Database Schema | Proteção do `search_vector` e Previews | `search_vector` avalia para vazio e lateral joins devolvem string vazia sem vazar plaintext. | Query `SELECT search_vector`, `SELECT content FROM dm_messages` | Vetor de busca vazio, preview vazio no banco | Nenhum vazamento de texto em full-text search ou `ILIKE` | §8 l.230, `schema.sql` l.413 |
| 10 | Database Schema | Idempotência por `(conversation_id, message_id)` | Reenvios idênticos retornam o registro existente; reenvios conflitantes retornam 409. | `POST message` com mesmo `message_id` | HTTP 200/201 idempotente (mesmo payload) | `409 Conflict` se payload ou ciphertext forem conflitantes | §7.6 l.174, §8 l.233-239, §10.3 l.427 |
| 11 | Envelopes | Envelope Megolm V1 Canonical | Estrutura JSON unificada serializada antes da cifragem vodozemac. | `body`, `reply_to`, `attachments`, `mentions`, `link_previews` | Base64 Megolm Ciphertext + `e2ee_meta` | Envelope com versão desconhecida tratado como `undecryptable` | §8 l.214-224, `megolmSession.ts` |
| 12 | Envelopes | Reações Cifradas em Mensagens | Emoji é cifrado no cliente; servidor grava blob opaco em `message_reactions.e2ee_ciphertext`. | `POST /api/dms/{id}/messages/{msgId}/reactions` com `e2ee_ciphertext` | Reação salva sem expor emoji em texto | Reação indecifrável renderiza "Reação (indecifrável)" na UI | §5 l.113, §7.11 l.181, §10.1 l.498 |
| 13 | Envelopes | Edição Cifrada com Anti-Replay | Edição reutiliza `message_id`, avança ratchet e exige `new_index > old_index`. | `PATCH/PUT /api/dms/{id}/messages/{msgId}` com novo `e2ee_ciphertext` e `msg_index` | Registro atualizado com `is_edited = true` | `400/409` se `msg_index <= current_msg_index` (anti-replay) | §7.10 l.180, §8 l.239 |
| 14 | Attachments | Endpoint Dedicado de Upload E2EE | Upload de arquivo pré-cifrado via binário opaco sem inspeção no servidor. | `POST /api/e2ee/attachments` com `application/octet-stream` | HTTP 201 `{ "id": UUID, "url": "...", "size": N }` | 400 (arquivo vazio/incompatível), 413 (tamanho excedido) | §10.4 l.434-441, PROJECT.md |
| 15 | Attachments | Cifragem AES-256-GCM no Cliente | Chave 256b, IV 96b e hash SHA-256 gerados no cliente e incluídos no envelope Megolm. | Arquivo binário original | Ciphertext binário enviado no POST; chaves no envelope | Hash mismatch pós-download marca anexo como corrompido | §8 l.219, §8 l.242, §10.4 l.437 |
| 16 | Attachments | Download Seguro com Content-Disposition | Servir blob E2EE com cabeçalhos forçando download para evitar execução de script. | `GET /api/e2ee/attachments/{id}` | Binário cifrado com `Content-Disposition: attachment` | 404 (anexo não encontrado), 403 (não autorizado) | §10.4, PROJECT.md |
| 17 | Attachments | Limpeza de Anexos Órfãos | Descarte automatizado de uploads E2EE não vinculados a mensagens após 24h. | Agendador `temp_cleaner.go` varrendo blobs órfãos | Arquivos órfãos excluídos do disco/banco | Não afeta arquivos associados a mensagens confirmadas | §10.4 l.440 |
| 18 | Key Distribution | Distribuição To-Device `room_key` | Chave de sessão Megolm entregue a cada dispositivo do roster via Olm 1:1 to-device. | `POST /api/e2ee/to-device` com `msg_type = "room_key"` | Mensagem enfileirada e despachada via WS `E2EE_TO_DEVICE` | 400 (remetente sem dispositivo), 404 (destinatário inválido) | §8 l.194-195, §10.1 l.319 |
| 19 | Key Request | Protocolo Reativo de `key_request` | Solicitação controlada de chave de sessão Megolm ausente com rate limit e TTL. | `POST /api/e2ee/key-requests` ou to-device `msg_type = "key_request"` | Pedido encaminhado aos membros elegíveis da conversa | Rejeitado se solicitante estiver fora do roster atual; deduplicação em 30s | §7.7 l.175, §10.2 l.404, §10.2 l.411 |
| 20 | Key Request | Validação da Resposta de Chave | Solicitante valida identidade, epoch e aceita apenas a 1ª resposta válida do roster. | To-device com chave exportada + assinatura do respondente | Chave importada no KeyStore IndexedDB | Respostas com epoch errado, fora do roster ou duplicadas são descartadas | §7.7 l.175 |
| 21 | UI Isolation | Desacoplamento de Leitura e Placeholder | Mensagens indecifráveis exibem aviso isolado sem travar unread badges ou renderização. | Mensagem recebida sem sessão Megolm disponível | UI renderiza placeholder; unread badge atualizado normalmente | Nenhuma quebra de timeline ou bloqueio de mensagens seguintes | §7.6 l.174, §11.4 l.537-554, §16.3 l.1208-1232 |

---

## 4. Matriz de Casos de Borda e Comportamentos Observados

## Edge Cases
| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Plaintext Gating | Cliente envia mensagem plaintext em sala com `e2ee_enabled = true` | Backend recusa com `HTTP 409 Conflict`, corpo `{"error": "e2ee_required"}`. A mensagem não é salva nem transmitida. |
| 2 | Plaintext Gating | Cliente envia `encrypted = true` em sala com `e2ee_enabled = false` | Backend recusa com `HTTP 409 Conflict`, corpo `{"error": "e2ee_not_enabled"}`. Impede downgrade ou cifragem sem destinatários aptos. |
| 3 | Consistency Gate | Requisição envia `encrypted = true` sem `e2ee_ciphertext` ou sem `e2ee_meta` | Backend retorna `HTTP 400 Bad Request` com `{"error": "ciphertext and metadata required for encrypted message"}`. |
| 4 | Consistency Gate | Requisição envia `encrypted = false` com `e2ee_ciphertext` preenchido | Backend retorna `HTTP 400 Bad Request` com `{"error": "ciphertext not allowed when encrypted is false"}`. |
| 5 | Idempotência | Retry com `message_id` e payload idênticos | Backend retorna `HTTP 200 OK` (ou `201 Created`) com a mensagem existente sem duplicar linha e sem disparar novo evento WS. |
| 6 | Idempotência | Reenvio com mesmo `message_id`, mas ciphertext alterado | Backend detecta colisão de chave primária e inconsistência de payload, retornando `HTTP 409 Conflict` com `{"error": "message_conflict"}`. |
| 7 | Teto de Grupos | Tentativa de criar grupo com 16 membros no array | Backend valida `len(totalMembers) > 15` e aborta com `HTTP 400 Bad Request` (`{"error": "grupos de DM podem ter no máximo 15 membros"}`). |
| 8 | Teto de Grupos | Adição de 2 membros a grupo que já possui 14 | Backend calcula `14 + 2 = 16 > 15` e rejeita com `HTTP 400 Bad Request` (`{"error": "o grupo não pode ultrapassar 15 membros"}`). |
| 9 | Isolamento de Histórico | Novo membro adicionado no epoch 4 emite `key_request` para sessão do epoch 2 | Servidor e clientes descartam a solicitação. A chave da sessão do epoch 2 nunca é entregue ao novo participante. |
| 10 | Anti-Replay Edição | Cliente envia edição com `msg_index <= current_msg_index` | Backend recusa a atualização com `HTTP 400/409` (`{"error": "replay_detected"}`). Protege contra replay de versões anteriores. |
| 11 | Versão de Envelope | Mensagem decifrada apresenta `v: 2` em cliente que suporta apenas `v: 1` | `messageCodec` marca a mensagem como `undecryptable` ("versão de envelope não suportada") de forma isolada, permitindo a leitura das demais mensagens. |
| 12 | Tempestade de Chaves | Múltiplos dispositivos enviam 50 `key_requests` por segundo | Servidor aplica `httprate` (máx. 10/min) e deduplica por `(requester_device_id, conversation_id, session_id)`, descartando rajadas redundantes. |
| 13 | Concorrência de Resposta | Solicitante de chave recebe 3 respostas válidas de dispositivos distintos | Solicitante processa a primeira resposta válida e ignora silenciosamente as 2 respostas duplicadas subsequentes. |
| 14 | Integridade de Anexo | Anexo baixado com hash SHA-256 divergente do digest gravado no envelope | Cliente aborta a exibição e exibe erro de integridade ("Arquivo corrompido ou adulterado"), sem tentar executar ou renderizar o arquivo. |
| 15 | Regressão de Unread | Mensagem com sessão indisponível chega na conversa | Unread badge incrementa normalmente. A conversa abre, exibe placeholder isolado e as mensagens circundantes carregam sem bloqueio. |
| 16 | Cliente Legado | Cliente sem suporte E2EE recebe evento WS `MESSAGE_CREATE` com `encrypted = true` | Cliente renderiza placeholder amigável "Atualize o app para visualizar esta mensagem", sem emitir exceção não tratada no React. |
| 17 | Tabela Divergente | Banco possui `message_reactions` enquanto queries legadas tentam `reactions` | A tabela real é `message_reactions`. Ela precisa conter a coluna `e2ee_ciphertext TEXT` e suporte para `dm_group_message_id`. |
| 18 | Ativação em DM Vazia | Usuário tenta ativar E2EE em DM com usuário que não possui identidade Ed25519 registrada | Backend retorna `HTTP 422 Unprocessable Entity` (`{"error": "recipient_e2ee_identity_missing"}`). |

---

## 5. Lacunas Identificadas no Código Existente & Recomendações para Implementadores

Durante a inspeção exaustiva do código-fonte, foram identificadas as seguintes lacunas que deverão ser implementadas pelas duplas de desenvolvimento do Marco M3:

### 5.1 Backend (`backend/`)
1. **Modelos (`backend/internal/models/models.go`):**
   - Atualizar structs `Message`, `DMMessage` e `DMGroupMessage` com os campos:
     * `Encrypted bool` (`json:"encrypted"`)
     * `E2EECiphertext *string` (`json:"e2ee_ciphertext,omitempty"`)
     * `E2EEMeta json.RawMessage` (`json:"e2ee_meta,omitempty"`)
   - Atualizar `DMRoom` e `DMGroup` com:
     * `E2EEEnabled bool` (`json:"e2ee_enabled"`)
     * `RotationEpoch int` (`json:"rotation_epoch"`)
2. **Handlers de Envio de Mensagem (`dm_handlers.go`, `dm_group_handlers.go`, `message_handlers.go`):**
   - Adicionar verificação de `e2ee_enabled`:
     * Se `e2ee_enabled == true` e requisição não for encrypted $\to$ retornar `409 e2ee_required`.
     * Se `e2ee_enabled == false` e requisição for encrypted $\to$ retornar `409 e2ee_not_enabled`.
   - Adicionar suporte a `message_id` gerado pelo cliente na requisição de envio.
   - Adicionar lógica de idempotência em transação: checar se `(conversation_id, message_id)` já existe. Se idêntico $\to$ retornar `200/201`. Se conflito $\to$ retornar `409`.
   - Garantir que `content` seja persistido como `''` quando `encrypted == true`.
3. **Endpoints de Ativação E2EE (`POST /api/dms/{id}/e2ee/enable` e `POST /api/dm/groups/{id}/e2ee/enable`):**
   - Implementar handlers com validação estrita de CSRF, autorização de participantes e version gate.
   - Atualizar `e2ee_enabled = true` e registrar em log auditável sem plaintext.
4. **Endpoint de Anexos E2EE (`POST /api/e2ee/attachments` e `GET /api/e2ee/attachments/{id}`):**
   - Implementar recebimento de `application/octet-stream`, armazenamento com UUID opaco e servir com `Content-Disposition: attachment`.
5. **Reações E2EE e Correção de Schema:**
   - Adicionar coluna `e2ee_ciphertext TEXT` em `message_reactions` (e adicionar `dm_group_message_id UUID REFERENCES dm_group_messages(id)` se ainda ausente).
   - Permitir `emoji = ''` ou valor padrão quando `e2ee_ciphertext` estiver preenchido.
6. **Edições com Anti-Replay:**
   - Em `UpdateMessage` (DM, DMGroup e Channel), verificar `new_msg_index > current_msg_index`. Rejeitar replays com `400/409`.

### 5.2 Frontend (`client/`)
1. **Módulo `client/src/messaging/messageCodec.ts`:**
   - Criar implementação pura e determinística que valida, decifra e normaliza envelopes Megolm sem mutar diretamente o Zustand store nem o estado de unread.
2. **Módulo `client/src/crypto/attachments.ts`:**
   - Implementar cifragem e decifragem de arquivos via WebCrypto `AES-256-GCM` com geração de chave de 256 bits, IV de 96 bits e verificação de digest SHA-256.
3. **Extensão de `client/src/lib/api.ts`:**
   - Adicionar endpoints `api.e2ee.enableDME2EE`, `api.e2ee.enableDMGroupE2EE`, `api.e2ee.uploadAttachment`, `api.e2ee.requestKey`.
   - Atualizar `api.dms.sendMessage` e `api.dmGroups.sendMessage` para aceitar `message_id`, `encrypted`, `e2ee_ciphertext` e `e2ee_meta`.
4. **Resiliência de UI:**
   - `MessageItem`: Renderizar estados `decrypting`, `decrypted` e `undecryptable` de forma isolada, garantindo que o unread badge e as mensagens vizinhas funcionem perfeitamente.

---
*Relatório finalizado em total conformidade com a especificação técnica de implementação E2EE do ZeroVC.*
