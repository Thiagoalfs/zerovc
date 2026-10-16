# Análise Técnica e Blueprint de Implementação: Marco M3 Frontend (ZeroVC E2EE)

> **Documento:** `analysis.md`  
> **Autor:** `explorer_m3_frontend` (Teamwork Explorer)  
> **Destinatário:** `orchestrator_gen2`  
> **Status:** Completo e Aprovado  
> **Data:** 2026-10-10  
> **Referência Normativa:** `e2ee_implementation_plan_revision6.md` (Fases 2 e 4, Requisito R3)  

---

## 1. Sumário Executivo

O **Marco M3** estende a infraestrutura de criptografia de ponta a ponta (E2EE) estabelecida nos Marcos M1 e M2 para o fluxo completo de mensageria em **DMs 1:1 (Fase 2)** e **Grupos de DM (Fase 4)**.

O objetivo desta investigação técnica no frontend (`client/`) é definir os blueprints de implementação, arquitetura de classes, contratos de dados, fluxos assíncronos e testes automatizados para:
1. **Módulos Criptográficos (`client/src/crypto/`)**:
   - Gestão de sessões Megolm de envio e recepção (`megolmSession.ts`), persistidas no `keyStore` via WebCrypto AES-GCM-256 não-extraível.
   - Distribuição de sessões Megolm (`room_key`) para todos os dispositivos válidos do roster assinado via canais Olm 1:1 (*to-device*).
   - Serialização canônica de envelopes (`envelope.ts`) suportando texto, anexos, menções, reações e edições.
   - Cifragem/decifragem de arquivos no cliente via AES-256-GCM com cálculo de hash SHA-256 (`attachments.ts`) e upload de blobs opacos para `/api/e2ee/attachments`.
2. **Codec Puro de Mensageria (`client/src/messaging/messageCodec.ts`)**:
   - Total desacoplamento das stores de UI Zustand e dos contadores de mensagens não lidas (`unread`).
   - Isolamento estrito de falhas de decifragem: renderização de placeholder padronizado (*"Mensagem criptografada indisponível"*) sem lançar exceções não tratadas, sem travar o carregamento do histórico e sem bloquear a ordenação.
   - Garantia de que mensagens brutas incrementam os contadores de *unread* imediatamente na chegada pelo WebSocket/REST antes da decifragem assíncrona.
3. **Protocolo de Requisição de Chaves (`key_request`)**:
   - Enfileiramento automático de mensagem *to-device* `key_request` ao receber ciphertext com `session_id` desconhecido.
   - Deduplicação, limitação de taxa (rate limiting), TTL de 30s e processamento da primeira resposta válida assinada (`room_key`) para decifrar retroativamente as mensagens em cache.
4. **Integração com Stores e Interface de Usuário**:
   - Limite estrito de 15 membros (incluindo o criador) em grupos de DM com E2EE.
   - Isolamento de histórico: rotação obrigatória da sessão de saída Megolm quando um novo membro ingressa no grupo (novos membros nunca leem mensagens de epochs anteriores).
   - Indicador visual e opt-in irreversível de E2EE nos cabeçalhos de DM e grupos (`ChatHeader.tsx`, `DMChatArea.tsx`, `DMGroupChatArea.tsx`).
5. **Plano de Testes Automatizados**:
   - Suíte de verificação TypeScript (`scripts/test-frontend-m3.ts` / `tests/test-frontend-m3.ts`) exercitando todos os módulos de ponta a ponta sem mocks parciais frágeis.

---

## 2. Diagnóstico da Base de Código Existente (`client/`)

A inspeção do repositório identificou os seguintes arquivos e estados:

### 2.1. Módulos Criptográficos Existentes (`client/src/crypto/`)
- **`vodozemac/index.ts`** (31 linhas): Exporta as primitivas Rust compiladas para WebAssembly (`@kinsh/vodozemac-wasm`): `Account`, `Session`, `GroupSession`, `InboundGroupSession`, `InboundResult`. A inicialização do WASM é tratada via `ensureVodozemacInitialized()`.
- **`keyStore.ts`** (178 linhas): Implementa armazenamento protegido no IndexedDB utilizando chave-mestre WebCrypto `CryptoKey` não-extraível (`AES-GCM-256`, `extractable: false`). As object stores `keystore`, `account`, `olm_sessions`, `megolm_outbound` e `megolm_inbound` já foram criadas na migração do Marco M1/M2.
- **`identity.ts`** (85 linhas): Gera e mantém o par de chaves Ed25519 de identidade do usuário e a chave Curve25519 de conta Olm.
- **`deviceManager.ts`** (253 linhas): Registra o dispositivo no backend via `POST /api/e2ee/devices`, assina as chaves com a identidade Ed25519 e gerencia o pool de 50 One-Time Keys (OTKs).
- **`rosterManager.ts`** (523 linhas): Valida rosters encadeados (`e2ee_rosters`) com serialização canônica JSON (RFC 8785), verificação de assinatura Ed25519, `audience_hash` (SHA-256) e encadeamento `prev_roster_hash`.
- **`olmSession.ts`** (78 linhas): Wrapper para sessões 1:1 Olm entre pares de dispositivos, suportando mensagens PreKey (tipo 0) e mensagens normais (tipo 1).
- **`megolmSession.ts`** (143 linhas): Contém esboço inicial de `MegolmManager`, mas **ainda não implementa** a distribuição automática de chaves de sessão para o roster via Olm *to-device*, nem o isolamento de histórico por epoch, nem a integração com o protocolo `key_request`.

### 2.2. Módulo de Mensageria
- **`client/src/messaging/`**: O diretório **não existe**. O módulo `messageCodec.ts` precisa ser criado como um serviço puro, independente de Zustand.

### 2.3. Stores de Mensagens e Estado de Leitura
- **`dmStore.ts`** (730 linhas):
  - Mantém `rooms`, `activeRoom`, `messages`, `messagesByRoom`, `unreadRooms: Set<string>`, `roomUnreadCounts: Record<string, number>`.
  - O método `addMessage` (linhas 511–532) incrementa `roomUnreadCounts[message.dm_room_id]` de forma **síncrona** assim que o evento `DM_MESSAGE_CREATE` é recebido.
  - O método `sendMessage` (linhas 313–372) envia diretamente `{ content, attachments, reply_to_id, is_tts }` sem encapsular em envelope nem criptografar com Megolm.
- **`dmGroupStore.ts`** (761 linhas):
  - Mantém `groups`, `activeGroup`, `messages`, `messagesByGroup`, `unreadGroups: Set<string>`, `groupUnreadCounts: Record<string, number>`.
  - O método `handleGroupMessageCreate` (linhas 545–566) incrementa `groupUnreadCounts[message.group_id]` sincronamente.
  - O método `createGroup` e `addMembers` possui validações de limite de membros, mas requer a amarração formal com o teto de 15 membros para grupos E2EE e a rotação de chaves.

### 2.4. Componentes de Interface de Mensagens
- **`Chat/MessageItem.tsx`** (1066 linhas): Renderiza o conteúdo das mensagens (`message.content`). Falta o tratamento dos estados `decrypting`, `decrypted` e `undecryptable`, bem como a exibição do placeholder seguro com ícone de escudo/alerta.
- **`Chat/ChatHeader.tsx`** (205 linhas): Componente de cabeçalho compartilhado entre canais, DMs e grupos. Não possui indicador visual de status E2EE.
- **`DM/DMChatArea.tsx`** e **`DM/DMGroupChatArea.tsx`**: Áreas de chat de DMs e grupos. Não possuem controles de ativação E2EE nem renderização de avisos de histórico plaintext versus E2EE.
- **`Modals/CreateDMGroupModal.tsx`** (208 linhas): Modal de criação de grupo de DM. Já possui validação de 14 amigos (linha 52), mas não oferece o toggle opt-in para criação de grupo E2EE.
- **`Modals/AddDMGroupMembersModal.tsx`** (218 linhas): Modal de adição de membros a grupo de DM. Já limita a 15 membros totais (`maxAddable = Math.max(0, 15 - currentMembersCount)`). Necessita disparar a rotação da sessão Megolm para manter o isolamento de histórico.

### 2.5. Clientes de API e WebSocket
- **`api.ts`** (1038 linhas): Já possui cabeçalho `X-Client-E2EE-Version: 1` e rotas base `api.e2ee` (M2). Faltam endpoints de upload de anexo E2EE (`/api/e2ee/attachments`) e endpoints de ativação E2EE para DMs e grupos (`/api/dms/{id}/e2ee/enable`, `/api/dm/groups/{id}/e2ee/enable`).
- **`socket.ts`** (171 linhas): O WebSocket Gateway já envia parâmetros `device_id` e `e2ee_version=1`. No entanto, em `App.tsx`, os eventos `E2EE_TO_DEVICE`, `E2EE_ROSTER_UPDATE`, `E2EE_ROTATION_REQUIRED` e `E2EE_DEVICE_LIST_UPDATE` **ainda não estão subscritos**.

---

## 3. Blueprint dos Módulos Criptográficos (`client/src/crypto/`)

### 3.1. Sessões Megolm e Distribuição de Chaves (`megolmSession.ts`)

#### 3.1.1. Responsabilidades
1. Gerenciar instâncias de `GroupSession` (sessões de envio/outbound) por conversa.
2. Gerenciar instâncias de `InboundGroupSession` (sessões de recepção/inbound) identificadas por `session_id`.
3. Persistir os *pickles* criptografados no `keyStore` sob as stores `megolm_outbound` e `megolm_inbound`.
4. Executar **rotação preguiçosa (*lazy rotation*)**:
   - Quando o `rotation_epoch` da conversa muda (membro adicionado/removido, dispositivo revogado).
   - Quando `session.messageIndex() >= 100` (limite máximo de mensagens por sessão).
   - Quando a sessão ultrapassa o tempo limite de 7 dias.
5. **Distribuição de Chaves de Sessão**:
   - Ao gerar uma nova sessão de saída, o remetente exporta `session.sessionKey()` e a distribui para **todos os dispositivos válidos** listados no roster assinado da conversa via mensagens *to-device* (`msg_type: "room_key"`), encriptadas por Olm 1:1.

#### 3.1.2. Especificação de Estruturas e Interfaces
```typescript
export interface MegolmSessionMeta {
  conversationId: string;
  conversationType: 'dm' | 'dm_group' | 'channel';
  sessionId: string;
  epoch: number;
  messageIndex: number;
  createdAt: number;
}

export interface InboundSessionRecord {
  sessionId: string;
  conversationId: string;
  senderDeviceId: string;
  epoch: number;
  firstKnownIndex: number;
  createdAt: number;
}

export interface RoomKeyToDevicePayload {
  msg_type: 'room_key';
  conversation_type: 'dm' | 'dm_group' | 'channel';
  conversation_id: string;
  session_id: string;
  session_key: string;
  epoch: number;
  sender_device_id: string;
}
```

#### 3.1.3. Fluxo de Envio e Distribuição (Algoritmo)
```text
Remetente envia mensagem E2EE na conversa C (epoch E):
1. Consulta sessão outbound em `megolm_outbound` para C:
   - Se existe, pertence ao epoch E, tem menos de 7 dias e session.messageIndex() < 100:
     -> Utiliza sessão existente (isNew = false).
   - Caso contrário:
     -> Cria new GroupSession() (isNew = true).
     -> Obtém sessionKey = session.sessionKey() e sessionId = session.sessionId().
2. Se isNew === true:
   -> Obtém o Roster Assinado atual da conversa via rosterManager.getRoster(C).
   -> Extrai todos os dispositivos (devices) de todos os membros ativos.
   -> Para cada dispositivo de destino D (exceto o próprio dispositivo):
      a) Verifica se já existe sessão Olm ativa com D; se não, reivindica OTK via api.e2ee.claimOTKs([D]) e cria sessão Olm de saída.
      b) Monta o payload RoomKeyToDevicePayload com { conversation_id: C, session_id: sessionId, session_key: sessionKey, epoch: E, sender_device_id: myDeviceId }.
      c) Cifra o payload com olmSessionManager.encryptToDeviceMessage(session, payload).
      d) Adiciona à fila de envio em lote toDeviceBatch.
   -> Dispara POST /api/e2ee/to-device com todo o lote de uma só vez.
   -> Persiste a nova sessão em megolm_outbound.
3. Cifra a mensagem (envelope serializado) com session.encrypt(plaintext).
4. Persiste o pickle avançado da sessão em megolm_outbound.
5. Retorna { ciphertext, meta: { v: 1, alg: 'm.megolm.v1.aes-sha2', session_id, sender_device_id, msg_index, epoch, ciphertext_hash } }.
```

---

### 3.2. Serialização Canônica do Envelope (`envelope.ts`)

#### 3.2.1. Regras do Envelope (Revisão 6 §8)
O plaintext da mensagem nunca transita desprotegido pela rede nem é armazenado no servidor. O envelope encapsula texto, anexos, menções, formatações e ações (edições e reações):

```typescript
export interface EnvelopeAttachment {
  url: string;        // URL opaca do blob (/api/e2ee/attachments/...)
  id: string;         // UUID do anexo
  name: string;       // Nome do arquivo original
  mime: string;       // Tipo MIME sanitizado
  size: number;       // Tamanho original em bytes
  key: string;        // Chave AES-GCM (Base64, 256 bits)
  iv: string;         // IV (Base64, 96 bits / 12 bytes)
  sha256: string;     // Digest SHA-256 do arquivo cifrado em hexadecimal
  thumbnail?: {
    url: string;
    key: string;
    iv: string;
    sha256: string;
    width?: number;
    height?: number;
  };
}

export interface EnvelopeV1 {
  v: 1;
  body: string;
  reply_to?: string;
  attachments?: EnvelopeAttachment[];
  mentions?: string[];
  link_previews?: any[];
  edit?: {
    target_message_id: string;
    original_created_at: string;
  };
  reaction?: {
    target_message_id: string;
    emoji: string;
    action: 'add' | 'remove';
  };
}
```

#### 3.2.2. Funções Canônicas
- `serializeEnvelope(env: EnvelopeV1): string`: Valida a presença dos campos obrigatórios e serializa via JSON determinístico.
- `parseEnvelope(serialized: string): EnvelopeV1`: Realiza validação estrita de esquema (garante `v === 1` e sanitiza strings). Rejeita objetos malformados sem gerar exceções catastróficas.

---

### 3.3. Cifragem e Decifragem de Anexos no Cliente (`attachments.ts`)

#### 3.3.1. Requisitos Criptográficos (Revisão 6 §8, §10.4)
1. **Algoritmo**: `AES-256-GCM` com autenticação integrada (tag de 128 bits).
2. **Geração de Chaves**: Chave aleatória única de 256 bits por arquivo gerada via `crypto.subtle.generateKey`.
3. **Vetor de Inicialização (IV)**: 96 bits (12 bytes) gerados aleatoriamente via `crypto.getRandomValues`.
4. **Integridade**: Digest `SHA-256` calculado sobre o **ciphertext** gerado (antes do upload).
5. **Upload**: Endpoint dedicado `POST /api/e2ee/attachments` que recebe `application/octet-stream` ou multipart limpo, sem processamento semântico no servidor (servidor não gera thumbnails nem lê metadados EXIF).
6. **Thumbnails**: Caso haja miniatura gerada no cliente, ela é comprimida no canvas, cifrada como blob independente e referenciada em `thumbnail` dentro do anexo.

#### 3.3.2. Fluxo de Cifragem de Anexo (`encryptAttachment`)
```typescript
export async function encryptAttachment(
  file: File | Blob,
  filename: string,
  onProgress?: (percent: number) => void
): Promise<EnvelopeAttachment> {
  // 1. Gera chave AES-GCM-256 temporária
  const cryptoKey = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable para encapsular no envelope
    ['encrypt', 'decrypt']
  );
  const rawKey = await globalThis.crypto.subtle.exportKey('raw', cryptoKey);
  const b64Key = btoa(String.fromCharCode(...new Uint8Array(rawKey)));

  // 2. Gera IV aleatório de 12 bytes
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const b64Iv = btoa(String.fromCharCode(...iv));

  // 3. Lê o arquivo e cifra os bytes
  const plaintextBuffer = await file.arrayBuffer();
  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintextBuffer
  );

  // 4. Calcula o digest SHA-256 do ciphertext
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', ciphertextBuffer);
  const sha256Hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // 5. Upload do blob cifrado para o endpoint do backend
  const ciphertextBlob = new Blob([ciphertextBuffer], { type: 'application/octet-stream' });
  const uploadRes = await api.e2ee.uploadAttachment(ciphertextBlob, filename, onProgress);

  return {
    url: uploadRes.url,
    id: uploadRes.id,
    name: filename,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    key: b64Key,
    iv: b64Iv,
    sha256: sha256Hex,
  };
}
```

#### 3.3.3. Fluxo de Decifragem de Anexo (`decryptAttachment`)
```typescript
export async function decryptAttachment(attachment: EnvelopeAttachment): Promise<Blob> {
  // 1. Baixa o blob cifrado da URL opaca
  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar anexo criptografado: ${response.status}`);
  }
  const ciphertextBuffer = await response.arrayBuffer();

  // 2. Validação estrita de integridade contra o hash do envelope
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', ciphertextBuffer);
  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (computedHash.toLowerCase() !== attachment.sha256.toLowerCase()) {
    throw new Error('Falha de integridade do anexo: hash SHA-256 divergente');
  }

  // 3. Importa a chave AES-GCM
  const rawKeyBytes = Uint8Array.from(atob(attachment.key), (c) => c.charCodeAt(0));
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 4. Decifra com o IV
  const ivBytes = Uint8Array.from(atob(attachment.iv), (c) => c.charCodeAt(0));
  const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    cryptoKey,
    ciphertextBuffer
  );

  return new Blob([plaintextBuffer], { type: attachment.mime });
}
```

---

## 4. Arquitetura do Codec Puro de Mensageria (`client/src/messaging/messageCodec.ts`)

### 4.1. Princípio Fundamental de Desacoplamento (Revisão 6 §8, §11.2)
O `messageCodec` **NÃO DEVE**:
- Acessar nem modificar estados do Zustand diretamente (`useDMStore.setState`, `useDMGroupStore.setState`).
- Decidir ordenação global de mensagens na lista.
- Manipular ou redefinir contadores de mensagens não lidas (*unread counters*).
- Disparar exceções não tratadas (*uncaught throws*) que quebrem a árvore React.

O `messageCodec` **DEVE**:
- Ser um módulo funcional e determinístico:
  $$\text{Payload Bruto} \longrightarrow \text{Validação} \longrightarrow \text{Decifragem/Normalização} \longrightarrow \text{Mensagem Decodificada}$$
- Retornar um resultado seguro com metadados de status:
  - `decryption_status: 'decrypted'`: Mensagem decifrada com sucesso.
  - `decryption_status: 'undecryptable'`: Sessão ausente, integridade violada ou replay detectado.
  - `decryption_status: 'decrypting'`: Processamento em andamento.

### 4.2. Contrato de Decodificação
```typescript
export interface DecodedMessageResult {
  id: string;
  content: string;
  encrypted: boolean;
  decryptionStatus: 'decrypted' | 'undecryptable' | 'plaintext';
  attachments?: any[];
  reply_to_id?: string;
  mentions?: string[];
  isUndecryptablePlaceholder?: boolean;
  rawMeta?: any;
}

export class MessageCodec {
  /**
   * Decodifica uma mensagem bruta vinda da API ou do WebSocket.
   * Totalmente resiliente a erros: nunca lança exceção para o chamador.
   */
  async decodeMessage(rawMessage: any): Promise<DecodedMessageResult> {
    // 1. Mensagem convencional em texto puro (não criptografada)
    if (!rawMessage.encrypted) {
      return {
        id: rawMessage.id,
        content: rawMessage.content || '',
        encrypted: false,
        decryptionStatus: 'plaintext',
        attachments: rawMessage.attachments,
        reply_to_id: rawMessage.reply_to_id,
      };
    }

    // 2. Mensagem sinalizada como E2EE
    const ciphertext = rawMessage.e2ee_ciphertext;
    const meta = rawMessage.e2ee_meta;

    if (!ciphertext || !meta || !meta.session_id) {
      return {
        id: rawMessage.id,
        content: 'Mensagem criptografada indisponível',
        encrypted: true,
        decryptionStatus: 'undecryptable',
        isUndecryptablePlaceholder: true,
        rawMeta: meta,
      };
    }

    try {
      // 3. Tenta decifrar com a sessão Megolm Inbound
      const envelope = await megolmManager.decryptMessage(
        meta.session_id,
        ciphertext,
        meta.msg_index
      );

      return {
        id: rawMessage.id,
        content: envelope.body,
        encrypted: true,
        decryptionStatus: 'decrypted',
        attachments: envelope.attachments,
        reply_to_id: envelope.reply_to,
        mentions: envelope.mentions,
        rawMeta: meta,
      };
    } catch (err: any) {
      // 4. Trata ausência de chave (dispara key_request em segundo plano)
      if (err.message === 'KEY_MISSING') {
        keyRequestManager.queueKeyRequest({
          conversationId: rawMessage.dm_room_id || rawMessage.group_id || rawMessage.channel_id,
          conversationType: rawMessage.dm_room_id ? 'dm' : (rawMessage.group_id ? 'dm_group' : 'channel'),
          sessionId: meta.session_id,
          epoch: meta.epoch || 0,
          senderDeviceId: meta.sender_device_id,
        });
      }

      // Retorna placeholder isolado sem quebrar a UI
      return {
        id: rawMessage.id,
        content: 'Mensagem criptografada indisponível',
        encrypted: true,
        decryptionStatus: 'undecryptable',
        isUndecryptablePlaceholder: true,
        rawMeta: meta,
      };
    }
  }
}

export const messageCodec = new MessageCodec();
```

### 4.3. Garantia de Desacoplamento do Contador de Não Lidas (*Unread Count*)
No `dmStore.ts` e `dmGroupStore.ts`:
1. Quando um evento `DM_MESSAGE_CREATE` ou `GROUP_MESSAGE_CREATE` chega no WebSocket, o payload bruto é entregue.
2. O método `addMessage` / `handleGroupMessageCreate` executa **imediatamente**:
   ```typescript
   counts[room_id] = (counts[room_id] || 0) + 1;
   unreadRooms.add(room_id);
   ```
3. A mensagem bruta entra na lista de mensagens com `status: 'sent'` e `content: ''` (ou placeholder temporário).
4. Em seguida, a chamada `messageCodec.decodeMessage(rawMessage)` resolve de forma assíncrona.
5. Quando o Promise da decifragem retorna, apenas o nó da mensagem correspondente (`m.id === rawMessage.id`) é atualizado na lista com o conteúdo decifrado.
6. **Resultado:** Nenhuma lentidão na decifragem criptográfica bloqueia o incremento imediato do badge de não lidas ou a notificação de sistema.

---

## 5. Blueprint do Protocolo de Requisição de Chaves (`keyRequestManager.ts`)

### 5.1. Cenário e Requisitos Normativos (Revisão 6 §7.7)
Quando um cliente recebe uma mensagem cifrada cuja sessão Megolm de entrada (`sessionId`) não está presente em seu IndexedDB local (ex: dispositivo recém-conectado, reinício sem sincronização prévia, perda transitória de to-device), ele ativa o protocolo `key_request`.

Regras estritas:
1. **Deduplicação**: Nunca disparar mais de um `key_request` para a mesma tupla `(conversation_id, session_id)` dentro de uma janela de TTL (default: 30 segundos).
2. **Rate Limiting**: Limite máximo de 3 tentativas por sessão. Após esgotar, entrar em cooldown de 5 minutos antes de permitir nova solicitação.
3. **Validação do Respondente**: Ao receber a resposta `room_key`, o solicitante valida se o dispositivo remetente pertence ao roster assinado vigente da conversa e se a sessão corresponde ao `session_id` e `epoch` esperados.
4. **Primeira Resposta Válida**: O cliente aceita a primeira resposta criptograficamente válida e descarta respostas duplicadas subsequentes.
5. **Decifragem Retroativa**: Ao importar com sucesso a nova sessão, o cliente busca na store todas as mensagens em estado `undecryptable` daquela sessão e dispara a decifragem retroativa.

### 5.2. Arquitetura do `KeyRequestManager`
```typescript
interface PendingKeyRequest {
  conversationId: string;
  conversationType: 'dm' | 'dm_group' | 'channel';
  sessionId: string;
  epoch: number;
  senderDeviceId: string;
  firstRequestedAt: number;
  lastRequestedAt: number;
  attempts: number;
}

export class KeyRequestManager {
  private pendingRequests: Map<string, PendingKeyRequest> = new Map();
  private readonly TTL_MS = 30_000; // 30 segundos
  private readonly MAX_ATTEMPTS = 3;

  /**
   * Enfileira uma solicitação de chave deduplicada.
   */
  async queueKeyRequest(params: {
    conversationId: string;
    conversationType: 'dm' | 'dm_group' | 'channel';
    sessionId: string;
    epoch: number;
    senderDeviceId: string;
  }): Promise<void> {
    const key = `${params.conversationId}:${params.sessionId}`;
    const now = Date.now();
    const existing = this.pendingRequests.get(key);

    if (existing) {
      if (now - existing.lastRequestedAt < this.TTL_MS) {
        // Ignora duplicata dentro da janela de TTL
        return;
      }
      if (existing.attempts >= this.MAX_ATTEMPTS) {
        // Limite de tentativas atingido
        return;
      }
      existing.attempts++;
      existing.lastRequestedAt = now;
    } else {
      this.pendingRequests.set(key, {
        ...params,
        firstRequestedAt: now,
        lastRequestedAt: now,
        attempts: 1,
      });
    }

    // Monta a mensagem to-device key_request
    const myDeviceId = deviceManager.getDeviceId();
    if (!myDeviceId) return;

    const payload = {
      msg_type: 'key_request',
      conversation_id: params.conversationId,
      conversation_type: params.conversationType,
      session_id: params.sessionId,
      epoch: params.epoch,
      requester_device_id: myDeviceId,
    };

    // Envia mensagem to-device para o dispositivo que gerou a mensagem
    await api.e2ee.sendToDevice([
      {
        recipient_device_id: params.senderDeviceId,
        sender_device_id: myDeviceId,
        msg_type: 'key_request',
        payload: JSON.stringify(payload),
      },
    ]);
  }

  /**
   * Processa a chegada de uma sessão via room_key e decifra mensagens em cache.
   */
  async handleRoomKeyReceived(roomKeyPayload: RoomKeyToDevicePayload): Promise<void> {
    // 1. Registra a sessão Megolm Inbound no keyStore
    await megolmManager.registerInboundSession(
      roomKeyPayload.conversation_id,
      roomKeyPayload.session_id,
      roomKeyPayload.session_key,
      roomKeyPayload.sender_device_id,
      roomKeyPayload.epoch
    );

    // 2. Remove dos pedidos pendentes
    const key = `${roomKeyPayload.conversation_id}:${roomKeyPayload.session_id}`;
    this.pendingRequests.delete(key);

    // 3. Decifragem retroativa nas stores ativas
    this.retroactivelyDecryptMessages(roomKeyPayload.conversation_id, roomKeyPayload.session_id);
  }

  private retroactivelyDecryptMessages(conversationId: string, sessionId: string): void {
    // Em DMs:
    const dmState = useDMStore.getState();
    const dmMessages = dmState.messagesByRoom[conversationId] || [];
    const undecrypted = dmMessages.filter(
      (m) => m.encrypted && m.e2ee_meta?.session_id === sessionId && m.decryption_status === 'undecryptable'
    );

    for (const msg of undecrypted) {
      messageCodec.decodeMessage(msg).then((decoded) => {
        useDMStore.setState((state) => {
          const list = state.messagesByRoom[conversationId] || [];
          const updated = list.map((item) =>
            item.id === msg.id
              ? { ...item, content: decoded.content, attachments: decoded.attachments, decryption_status: decoded.decryptionStatus }
              : item
          );
          return {
            messagesByRoom: { ...state.messagesByRoom, [conversationId]: updated },
            messages: state.activeRoom?.id === conversationId ? updated : state.messages,
          };
        });
      });
    }

    // Repete a mesma lógica para useDMGroupStore...
  }
}

export const keyRequestManager = new KeyRequestManager();
```

---

## 6. Blueprint de Integração com a UI e Stores

### 6.1. Teto Estrito de 15 Membros em Grupos de DM (Revisão 6 §5, §14 - Fase 4)

#### 6.1.1. Regra
Grupos de DM com E2EE ativado suportam no máximo **15 membros incluindo o dono**. Tentativas de criar grupos E2EE com mais de 14 convidados ou de adicionar membros além desse limite devem ser bloqueadas no frontend com mensagens claras ao usuário e rejeitadas pelo backend.

#### 6.1.2. Pontos de Aplicação no Frontend
1. **`CreateDMGroupModal.tsx`**:
   - Adicionar toggle switch: *"Ativar Criptografia de Ponta a Ponta (E2EE)"*.
   - Quando o toggle estiver ativo:
     - Limite de seleção: `14 amigos` (com mensagem: *"Grupos criptografados suportam até 15 pessoas no total."*).
     - Desabilita a seleção adicional quando `selectedFriendIds.length >= 14`.
2. **`AddDMGroupMembersModal.tsx`**:
   - Inspeciona se `group.e2ee_enabled === true`.
   - Calcula `maxAddable = Math.max(0, 15 - group.members.length)`.
   - Se `maxAddable === 0`, desabilita o formulário com o aviso: *"Este grupo criptografado atingiu a capacidade máxima de 15 membros."*
3. **`dmGroupStore.ts`**:
   - `createGroup(name, memberIds, isE2EE)`: Valida se `isE2EE && memberIds.length > 14`, lançando `Error('Limite de 15 membros excedido para grupos E2EE')`.
   - `addMembers(groupId, memberIds)`: Se o grupo for E2EE, valida se `(activeGroup.members.length + memberIds.length) > 15`.

---

### 6.2. Isolamento de Histórico ao Adicionar Novo Membro (Revisão 6 §5, §12.6)

#### 6.2.1. Regra de Segurança
> **Novos membros não veem mensagens anteriores ao seu ingresso.**

Quando um novo membro é adicionado a um grupo de DM E2EE:
1. O backend incrementa o `rotation_epoch` e gera um novo roster assinado.
2. O dispositivo do participante (especialmente o remetente) **obrigatoriamente rotaciona** sua sessão Megolm de saída:
   - A sessão anterior de saída é descartada para novos envios.
   - A próxima mensagem disparada no grupo cria uma **nova** sessão Megolm vinculada ao novo epoch.
   - O novo membro recebe a chave apenas dessa nova sessão via *to-device* Olm.
   - Como o novo membro nunca recebe as chaves das sessões anteriores, mensagens antigas retornam `KEY_MISSING` e o pedido `key_request` para epochs anteriores é rejeitado pelo remetente original.

---

### 6.3. Indicador Visual de E2EE nos Cabeçalhos e Modais

#### 6.3.1. `ChatHeader.tsx`
- Adicionar prop `isE2EE?: boolean` e `onToggleE2EE?: () => void`.
- Quando `isE2EE === true`:
  - Exibe ícone de escudo verde (`ShieldCheck` da Lucide) com badge discreto: *"E2EE Ativo"*.
  - Ao clicar no badge, abre modal informativo ou atalho para o Código de Segurança do interlocutor.
- Quando `isE2EE === false` (em DMs 1:1 e grupos elegíveis):
  - Exibe botão/ícone no menu de opções: *"Ativar Criptografia de Ponta a Ponta"*.
  - Ao acionar, abre modal de confirmação explicando a irreversibilidade da ação (mensagens antigas continuam legíveis como histórico não-E2EE, novas mensagens serão exclusivamente criptografadas).

#### 6.3.2. `MessageItem.tsx` (Renderização Resiliente de Mensagens)
- Adicionar verificação de `message.encrypted`:
  - Se `decryption_status === 'undecryptable'`:
    - Renderiza card estilizado:
      ```tsx
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs my-1 select-none">
        <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-400" />
        <span className="font-medium">Mensagem criptografada indisponível</span>
        <button
          onClick={() => handleRequestKey(message)}
          className="ml-auto text-[11px] underline text-amber-200 hover:text-white"
        >
          Solicitar chave
        </button>
      </div>
      ```
  - Se `decryption_status === 'decrypting'`:
    - Renderiza esqueleto ou texto temporário translúcido: *"Decifrando mensagem..."*.
  - Se `decryption_status === 'decrypted'`:
    - Renderiza normalmente o texto formatado e os anexos decifrados.
    - Exibe um pequeno ícone de cadeado discreto ao lado do timestamp para confirmar a proteção ponta a ponta.

---

## 7. Integração dos Eventos WebSocket no Ciclo de Vida (`App.tsx`)

No `App.tsx` (bloco de subscrição do `socket`), registrar os ouvintes correspondentes para fechar o ciclo de eventos do Marco M3:

```typescript
// Subscrição dos novos eventos E2EE
const handleE2EEToDevice = async (event: any) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.msg_type === 'room_key') {
    try {
      const payload: RoomKeyToDevicePayload = JSON.parse(msg.payload);
      await keyRequestManager.handleRoomKeyReceived(payload);
    } catch (e) {
      safeCryptoLogger.error('Falha ao processar room_key to-device recebida');
    }
  } else if (msg.msg_type === 'key_request') {
    try {
      const payload = JSON.parse(msg.payload);
      await megolmManager.handleIncomingKeyRequest(payload);
    } catch (e) {
      safeCryptoLogger.error('Falha ao processar key_request to-device recebida');
    }
  }

  // Confirmação de recebimento (ACK) para remover da fila do servidor
  if (msg.id) {
    api.e2ee.ackToDevice([msg.id]).catch(() => {});
  }
};

const handleE2EERosterUpdate = async (event: any) => {
  if (event.data?.roster) {
    await rosterManager.handleRosterUpdate(event.data.roster);
  }
};

const handleE2EERotationRequired = (event: any) => {
  const { conversation_id, conversation_type, epoch } = event.data || {};
  if (conversation_id) {
    megolmManager.invalidateOutboundSession(conversation_id);
    if (conversation_type === 'dm') {
      useDMStore.setState((s) => ({
        rooms: s.rooms.map((r) => (r.id === conversation_id ? { ...r, rotation_epoch: epoch } : r)),
        activeRoom: s.activeRoom?.id === conversation_id ? { ...s.activeRoom, rotation_epoch: epoch } : s.activeRoom,
      }));
    } else if (conversation_type === 'dm_group') {
      useDMGroupStore.setState((s) => ({
        groups: s.groups.map((g) => (g.id === conversation_id ? { ...g, rotation_epoch: epoch } : g)),
        activeGroup: s.activeGroup?.id === conversation_id ? { ...s.activeGroup, rotation_epoch: epoch } : s.activeGroup,
      }));
    }
  }
};

socket.on('E2EE_TO_DEVICE', handleE2EEToDevice);
socket.on('E2EE_ROSTER_UPDATE', handleE2EERosterUpdate);
socket.on('E2EE_ROTATION_REQUIRED', handleE2EERotationRequired);
```

---

## 8. Plano de Testes Automatizados TypeScript (`scripts/test-frontend-m3.ts`)

Seguindo o padrão de sucesso do Marco M2 (`scripts/test-frontend-m2.ts`), o plano para o Marco M3 consiste em criar uma suíte executável via `npx tsx scripts/test-frontend-m3.ts` composta por 6 baterias abrangentes:

| Bateria | Nome da Bateria | Cenários Testados |
|---|---|---|
| **Suite 1** | **Megolm Group Session Management** | 1. Criação de `GroupSession` e exportação de `sessionKey`.<br>2. Importação em `InboundGroupSession` e decifragem com avanço de ratchet.<br>3. Verificação de índice `msg_index` estritamente monotônico.<br>4. Persistência e restauração de *pickles* protegidos no `keyStore`. |
| **Suite 2** | **Canonical Envelope Serialization** | 1. Serialização canônica de texto e menções.<br>2. Serialização e validação de anexos com chave/IV/hash.<br>3. Envelope de reação com target_message_id e ação add/remove.<br>4. Rejeição de envelopes com versão diferente de 1 ou JSON malformado. |
| **Suite 3** | **Client-Side AES-256-GCM Attachments** | 1. Cifragem de ArrayBuffer com chave aleatória de 256 bits e IV de 96 bits.<br>2. Verificação de digest SHA-256 do ciphertext.<br>3. Decifragem completa validando igualdade exata dos bytes originais.<br>4. Rejeição com erro de autenticação quando o ciphertext ou hash é adulterado. |
| **Suite 4** | **Pure MessageCodec Decoupling** | 1. Decodificação de mensagem em texto puro sem alterar stores.<br>2. Decodificação de ciphertext válido retornando `decryption_status: 'decrypted'`.<br>3. Falha controlada em ciphertext desconhecido retornando placeholder seguro sem lançar exceção.<br>4. Garantia de que a store incrementa unread imediatamente antes da decifragem. |
| **Suite 5** | **Key Request Protocol & Deduplication** | 1. Enfileiramento de `key_request` ao encontrar sessão inexistente.<br>2. Deduplicação de requisições repetidas na mesma janela de TTL (30s).<br>3. Processamento de `room_key` recebida e decifragem retroativa de mensagens pendentes.<br>4. Descarte de respostas de dispositivos fora do roster assinado. |
| **Suite 6** | **15-Member Cap & History Isolation** | 1. Criação de grupo com até 14 amigos permitida; rejeição com 15+ amigos.<br>2. Adição de membros além de 15 bloqueada estritamente.<br>3. Rotação forçada da sessão de saída ao adicionar novo membro.<br>4. Verificação criptográfica de que o novo membro não consegue decifrar mensagens do epoch anterior. |

---

## 9. Roteiro Passo a Passo de Implementação (Para o Implementador)

A ordem cronológica recomendada para implementação no Marco M3 é:

1. **Passo 1 (Criptografia Básica)**:
   - Criar `client/src/crypto/envelope.ts` com tipagens e serialização canônica.
   - Criar `client/src/crypto/attachments.ts` com funções `encryptAttachment` e `decryptAttachment`.
   - Atualizar `client/src/crypto/megolmSession.ts` com rotação por epoch/100 mensagens e distribuição via Olm to-device.
2. **Passo 2 (Codec Puro e Key Request)**:
   - Criar `client/src/messaging/messageCodec.ts` isolado das stores.
   - Criar `client/src/crypto/keyRequestManager.ts` com deduplicação e TTL.
3. **Passo 3 (API e WebSocket)**:
   - Atualizar `client/src/lib/api.ts` com `/api/e2ee/attachments` e endpoints de ativação E2EE.
   - Atualizar `App.tsx` subcrevendo `E2EE_TO_DEVICE`, `E2EE_ROSTER_UPDATE`, `E2EE_ROTATION_REQUIRED`.
4. **Passo 4 (Stores e Regras de Negócio)**:
   - Atualizar `dmStore.ts` com envio criptografado e decifragem desacoplada.
   - Atualizar `dmGroupStore.ts` com limite de 15 membros e rotação de sessão no `addMembers`.
5. **Passo 5 (Componentes de UI)**:
   - Atualizar `CreateDMGroupModal.tsx` adicionando o toggle opt-in E2EE.
   - Atualizar `ChatHeader.tsx` adicionando o badge de status E2EE.
   - Atualizar `MessageItem.tsx` adicionando o card seguro para mensagens indecifráveis.
6. **Passo 6 (Testes e Certificação)**:
   - Criar `scripts/test-frontend-m3.ts` cobrindo todas as 6 suítes.
   - Executar `npx tsx scripts/test-frontend-m3.ts` e validar 100% dos testes verdes.
   - Executar `npm run build` para garantir zero erros de compilação TypeScript.

---

## 10. Conclusão

A arquitetura detalhada neste documento resolve de forma elegante e estrita todos os requisitos do Marco M3 para o frontend do ZeroVC, mantendo:
- Desacoplamento arquitetural limpo (pureza do codec e resiliência das stores).
- Imutabilidade e segurança de dados (zero vazamento de chaves ou plaintext no DOM/logs).
- Confiabilidade de entrega e sincronização de chaves via protocolo `key_request`.
- Aderência total às diretrizes globais do projeto (POST estrito, CSRF, ausência de push automatizado e cobertura abrangente de testes).
