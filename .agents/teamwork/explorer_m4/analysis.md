# Analysis: Milestone M4 — Chamadas de Voz/Vídeo E2EE LiveKit (Fase 3)

## 1. Executive Summary & Objective

O Milestone M4 implementa a criptografia de ponta a ponta (E2EE) para chamadas de áudio e vídeo no ZeroVC utilizando WebRTC Insertable Streams via SFrame com o SDK `livekit-client`, complementado pela infraestrutura de identidade e to-device estabelecida nos Marcos M1, M2 e M3.

Em conformidade com a especificação técnica (`e2ee_implementation_plan_revision6.md`, §13 e §14 Fase 3) e os requisitos do projeto (`ORIGINAL_REQUEST.md` R4 e `PROJECT.md`), este relatório detalha a arquitetura, modelo criptográfico, máquina de estados, algoritmo distribuidor determinístico, garantia estrita de anti-fallback e plano de testes automatizados para o Marco M4.

---

## 2. Current Codebase Inventory & Gap Analysis

### 2.1 Componentes Existentes (Fundação M1 / M2 / M3)
| Arquivo | Estado Atual | Papel no Marco M4 |
|---|---|---|
| `client/src/lib/livekitE2EE.ts` | Criado no spike M1. Contém `checkCallEligibility`, `assertE2EESupported`, `createE2EEOptions` e `LiveKitE2EEManager`. | Precisa ser expandido para suportar `keyIndex` explícito, chave simétrica de 256 bits via HKDF e sincronização com `callKeys.ts`. |
| `client/src/workers/e2ee.worker.ts` | Wrapper com `import 'livekit-client/e2ee-worker';`. | Worker WebRTC SFrame operacional e compatível com Vite via `?worker`. |
| `client/src/lib/livekit.ts` | `LiveKitManager` gerencia conexão WebRTC, áudio, vídeo, PTT e WebAudio. | Atualmente **não passa** `e2ee` no construtor `new Room(options)`. Precisa aceitar `e2ee` condicionalmente. |
| `client/src/stores/voiceStore.ts` | Gerencia estado de voz para canais de servidor, chamadas de DM e DM Grupos. | Conecta diretamente via `livekit.connect(...)` sem validação de gate E2EE ou inicialização de chaves de chamada. |
| `client/src/stores/callStore.ts` | Orquestra chamadas 1:1 (`startCall`, `acceptCall`, `rejectCall`, `endCall`). | Não propaga flag `isE2EE` nem inicializa `callKeyManager`. |
| `client/src/App.tsx` | Manipulador `handleE2EEToDevice` processa `room_key` e `key_request`. | **Não processa** mensagens to-device do tipo `call_key`. |
| `backend/internal/handlers/e2ee_handlers.go` | Endpoint `POST /api/e2ee/to-device` aceita qualquer `msg_type` (inclusive `'call_key'`). | 100% pronto para enfileirar e despachar mensagens to-device via WebSocket. |
| `backend/internal/handlers/dm_handlers.go` | `InviteCall` e `AcceptCall` geram JWT do LiveKit. | Não retornam se a sala é E2EE nem incluem `e2ee_required` no metadata do token. |
| `backend/internal/voice/livekit.go` | `GenerateJoinToken` emite JWT com VideoGrants. | Funcional; metadata aceita strings JSON arbitrárias. |

### 2.2 Componentes Faltantes (A Serem Implementados no M4)
1. **`client/src/crypto/callKeys.ts`**: Módulo gerenciador do ciclo de vida das chaves LiveKit (`CallKeyManager`), máquina de estados e algoritmo de eleição do distribuidor determinístico `min(device_id)`.
2. **Integração no `livekit.ts` e `livekitE2EE.ts`**: Injeção de `E2EEOptions` no `new Room({ e2ee })` e invocação de `room.setE2EEEnabled(true)`.
3. **Despacho to-device em `App.tsx`**: Roteamento de `msg.msg_type === 'call_key'` para `callKeyManager.handleIncomingCallKey()`.
4. **Gate de Anti-Fallback nas Stores**: Bloqueio pré-conexão em `voiceStore.ts` e `callStore.ts` com exibição de modal de atualização caso `checkCallEligibility` retorne `BLOCKED`.
5. **Suíte de Testes Automatizados `client/scripts/test-livekit-m4.ts`**: Teste de ponta a ponta dos estados, distribuidor determinístico, forward/backward secrecy e rejeição de fallback.

---

## 3. LiveKit SFrame & Key Provider Architecture

### 3.1 Mecanismo SFrame
O LiveKit E2EE baseia-se no padrão **SFrame (Secure Frame)** utilizando Insertable Streams do WebRTC:
- O áudio (Opus) e vídeo (H.264/VP8) são interceptados antes da transmissão via `RTCRtpScriptTransform` (Safari/WebKit) ou `RTCRtpSender.createEncodedStreams()` (Chromium).
- A encriptação ocorre dentro de um Web Worker isolado (`client/src/workers/e2ee.worker.ts`), impedindo que operações criptográficas bloqueiem a thread principal da UI.
- O SFU (servidor LiveKit) recebe pacotes com cabeçalhos RTP legíveis para roteamento, mas o payload de mídia permanece 100% cifrado com AES-GCM (256 bits). **O servidor nunca possui as chaves de descriptografia.**

### 3.2 Provedor de Chaves: `ExternalE2EEKeyProvider`
Configuração recomendada:
```ts
const keyProvider = new ExternalE2EEKeyProvider({
  keySize: 256,
  ratchetSalt: 'LK_RATCHET_SALT_V1',
  ratchetWindowSize: 16,
  failureTolerance: -1,
  keyringSize: 16,
});
```

- **Alimentação de Chave**:
  Quando uma chave de chamada de 256 bits (32 bytes `ArrayBuffer`) é gerada ou recebida, ela é injetada via `keyProvider.setKey(keyBuffer)`. O SDK deriva internamente a chave de cifra AES-GCM usando HKDF-SHA256.
- **Indexação de Chaves (`keyIndex`)**:
  Cada rotação de chave incrementa monotonicamente o `keyIndex`. O SFrame inclui o `keyIndex` no cabeçalho do frame criptografado, permitindo que os participantes alternem para a chave correta sem interrupção perceptível de áudio/vídeo.
- **Ciclo de Vida do Worker**:
  Ao término da chamada, `worker.terminate()` deve ser invocado e a referência ao provider limpa, garantindo descarte imediato do material sensível da memória.

---

## 4. Call Key State Machine & Deterministic Distributor

### 4.1 Máquina de Estados Criptográfica (Spec §13.1)

```
        ┌─────────────┐
        │   NO_KEY    │ ◄─── (Call Ends / Leave / Disconnect)
        └──────┬──────┘
               │  [Call Starts / Re-keying needed]
               ▼
   [isDistributor == true] ───► ┌──────────────┐
                                │  GENERATING  │ (Generate 256-bit symmetric key)
                                └──────┬───────┘
                                       ▼
                                ┌──────────────┐
                                │ DISTRIBUTING │ (Dispatch to-device msg_type: 'call_key')
                                └──────┬───────┘
                                       ▼
        ┌─────────────┐  ◄─────────────┘
        │   ACTIVE    │
        └──────┬──────┘
               │
               ├── participant_joined  ──► ROTATING ──► GENERATING ──► DISTRIBUTING ──► ACTIVE
               ├── participant_left    ──► ROTATING ──► GENERATING ──► DISTRIBUTING ──► ACTIVE
               ├── epoch_changed       ──► ROTATING ──► GENERATING ──► DISTRIBUTING ──► ACTIVE
               └── key_missing         ──► REQUESTING ──► DISTRIBUTING ──► ACTIVE
```

#### Definição dos Estados:
1. **`NO_KEY`**: Estado de repouso ou inicial. Nenhuma chave de chamada ativa.
2. **`GENERATING`**: O distribuidor eleito gera 32 bytes criptograficamente aleatórios via `crypto.getRandomValues(new Uint8Array(32))` e configura o provider local.
3. **`DISTRIBUTING`**: O distribuidor encapsula a chave em mensagens to-device individuais (`msg_type: 'call_key'`) para todos os outros dispositivos de participantes conectados e envia via `POST /api/e2ee/to-device`.
4. **`ACTIVE`**: Chave ativa e sincronizada no `ExternalE2EEKeyProvider`. Criptografia SFrame em execução bidirecional.
5. **`ROTATING`**: Evento de re-keying disparado (entrada/saída de participante ou avanço de época). Prepara transição para nova chave.
6. **`REQUESTING`**: Receptor na chamada que ainda não obteve a chave emite requisição to-device ou aguarda timeout antes de alertar a UI.

---

### 4.2 Algoritmo do Distribuidor Determinístico (Spec §13.2)

#### Regra Canônica:
Dada a lista de identificadores únicos de dispositivos (`device_id`) atualmente conectados à chamada:
$$\text{Distributor} = \min_{\text{lex}}(\text{device\_id}_1, \text{device\_id}_2, \dots, \text{device\_id}_n)$$

```ts
export function electDistributor(deviceIds: string[]): string | null {
  if (!deviceIds || deviceIds.length === 0) return null;
  const unique = Array.from(new Set(deviceIds.filter(Boolean)));
  if (unique.length === 0) return null;
  unique.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return unique[0];
}
```

#### Vantagens Criptográficas e Operacionais:
- **100% Determinístico**: Todos os clientes chegam exatamente ao mesmo resultado sem qualquer troca de votos de consenso ou latência de rede.
- **Resiliente a Partições**: Não depende de um "criador" fixo da sala.
- **Failover Imediato**: Se o dispositivo distribuidor cair ou desconectar (`participant_left`), todos os dispositivos restantes reexecutam `electDistributor` localmente. O dispositivo imediatamente seguinte com menor `device_id` assume a função, gera uma nova chave e distribui aos remanescentes.

---

### 4.3 Protocolo de Distribuição To-Device via Olm

#### Payload Canônico (`CallKeyToDevicePayload`):
```json
{
  "msg_type": "call_key",
  "call_id": "dm-550e8400-e29b-41d4-a716-446655440000",
  "key": "4a7b9c... (32 bytes base64)",
  "key_index": 1,
  "epoch": 1,
  "sender_device_id": "8f6b21c4-..."
}
```

#### Envio:
O distribuidor monta requisições individuais para cada dispositivo alvo:
```ts
const messages = recipientDevices.map((devId) => ({
  recipient_device_id: devId,
  sender_device_id: myDeviceId,
  msg_type: 'call_key',
  payload: JSON.stringify(payload),
}));
await api.e2ee.sendToDevice(messages);
```

#### Recepção e Descriptografia:
Em `App.tsx`, ao receber o evento WebSocket `E2EE_TO_DEVICE`:
```ts
if (msg.msg_type === 'call_key') {
  const payload: CallKeyToDevicePayload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
  await callKeyManager.handleIncomingCallKey(payload);
}
```
O `callKeyManager` valida:
1. `call_id` corresponde à chamada atualmente em curso.
2. `sender_device_id` é o distribuidor esperado ou membro válido do roster da conversa.
3. Decodifica os 32 bytes da chave e chama `livekitE2EEManager.setCallKey(decodedKey.buffer)`.
4. Transiciona para `ACTIVE`.

---

## 5. Join / Leave Ratchet & Rotation (Forward & Backward Secrecy)

### 5.1 Backward Secrecy (Entrada de Participante — `participant_joined`)
- **Regra**: Um novo participante que entra na chamada **NÃO PODE** descriptografar áudio ou vídeo transmitido antes do momento de seu ingresso.
- **Mecanismo**:
  1. O LiveKit dispara o evento `RoomEvent.ParticipantConnected`.
  2. O distribuidor detecta o novo participante e seu `device_id`.
  3. O estado passa para `ROTATING` -> `GENERATING`.
  4. O distribuidor gera uma **nova chave simétrica independente de 256 bits** e incrementa `keyIndex`.
  5. A nova chave é configurada no provider e distribuída a todos os participantes atuais (incluindo o novo ingressante).
  6. Como os pacotes prévios foram criptografados com a chave anterior (que o novo participante nunca recebeu), a segurança retroativa é garantida.

### 5.2 Forward Secrecy (Saída de Participante — `participant_left`)
- **Regra**: Um participante que se desconecta da chamada **NÃO PODE** descriptografar áudio ou vídeo subsequente à sua saída.
- **Mecanismo**:
  1. O LiveKit dispara o evento `RoomEvent.ParticipantDisconnected`.
  2. Os clientes removem o dispositivo desconectado da lista ativa.
  3. Reeleição do distribuidor via `electDistributor`.
  4. O distribuidor (atual ou recém-eleito) gera uma nova chave de 256 bits.
  5. A chave é distribuída via to-device **apenas para os dispositivos que continuam conectados**.
  6. O participante desconectado não recebe a nova chave e fica impossibilitado de descriptografar qualquer tráfego subsequente.

### 5.3 Debounce e Estabilidade
Para evitar tempestades de re-keying causadas por flutuações temporárias de rede (ex.: participante reconectando em 100ms), o gerenciador aplica um debounce de rotação de 150ms a 250ms, agregando múltiplos eventos de entrada/saída próximos em uma única rotação atômica.

---

## 6. Anti-Fallback & Compatibility Gate

### 6.1 Critério Estrito de Não-Degradação (Zero Plaintext Fallback)
Em salas marcadas como E2EE (`e2ee_enabled: true` em DMs, grupos ou canais):
- **O tráfego de mídia NUNCA deve ser transmitido em texto claro sob hipótese alguma.**
- Se o ambiente do usuário (navegador legado, Android WebView antigo) não suportar WebRTC Insertable Streams, **a chamada deve ser totalmente bloqueada antes de qualquer negociação SDP / ICE**.

### 6.2 Matriz de Compatibilidade e Verificação
```ts
export function checkCallEligibility(opts: {
  isE2EERoom: boolean;
  e2eeSupported?: boolean;
}): E2EESupportCheck {
  const supported = opts.e2eeSupported !== undefined ? opts.e2eeSupported : isCallE2EESupported();

  if (opts.isE2EERoom) {
    if (!supported) {
      safeCryptoLogger.warn('CallGate', 'Blocked call attempt on E2EE room: client lacks insertable streams');
      return {
        supported: false,
        status: 'BLOCKED',
        fallbackAllowed: false,
        modal: 'UPGRADE_REQUIRED',
      };
    }
    return {
      supported: true,
      status: 'ALLOWED',
      fallbackAllowed: false,
    };
  }

  return {
    supported: true,
    status: 'ALLOWED',
    fallbackAllowed: true,
  };
}
```

### 6.3 Requisitos de Plataforma
| Plataforma | Requisito de Runtime | Resultado do Gate |
|---|---|---|
| **Web (Chrome / Edge / Brave)** | Chromium >= 86 | **ALLOWED** |
| **Electron Desktop** | Electron 30 (Chromium 124) | **ALLOWED** |
| **Android Capacitor** | Android System WebView >= 86 | **ALLOWED** |
| **Android Legado** | Android System WebView < 86 | **BLOCKED** (`UPGRADE_REQUIRED`) |
| **Navegador sem WebRTC** | Sem `RTCPeerConnection` | **BLOCKED** |

Se `status === 'BLOCKED'`, a UI exibe o modal informando que a chamada requer suporte a E2EE e impede o início ou atendimento da chamada.

---

## 7. Implementation Blueprint & Proposed Code Design

### 7.1 Módulo `client/src/crypto/callKeys.ts`
Estrutura proposta:
- **`CallKeyState`**: `'NO_KEY' | 'GENERATING' | 'DISTRIBUTING' | 'ACTIVE' | 'ROTATING' | 'REQUESTING'`
- **`electDistributor(deviceIds: string[]): string | null`**: Função pura determinística baseada em `min(device_id)`.
- **`CallKeyManager`**:
  - `startCall(callId: string, myDeviceId: string, connectedDeviceIds: string[]): Promise<void>`
  - `handleParticipantJoined(deviceId: string): Promise<void>`
  - `handleParticipantLeft(deviceId: string): Promise<void>`
  - `handleIncomingCallKey(payload: CallKeyToDevicePayload): Promise<void>`
  - `endCall(): void`
  - Métodos utilitários de serialização de chave (Base64 <-> Uint8Array) e sanitização segura de memória.

### 7.2 Atualização em `client/src/lib/livekit.ts`
- Método `connect(url, token, callbacks, e2eeOptions?: E2EEOptions)`:
  - Quando `e2eeOptions` for informado:
    ```ts
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true,
      e2ee: e2eeOptions,
      ...
    });
    ```
  - Após conectar, assegurar `await room.setE2EEEnabled(true)`.
  - Propagar eventos `ParticipantConnected` e `ParticipantDisconnected` com metadados de dispositivo para o `callKeyManager`.

### 7.3 Atualização em `client/src/stores/voiceStore.ts` e `callStore.ts`
- Antes de invocar `connectLiveKitRoom`:
  ```ts
  if (isE2EERoom) {
    const gate = checkCallEligibility({ isE2EERoom: true });
    if (gate.status === 'BLOCKED') {
      // Exibe modal UPGRADE_REQUIRED e interrompe execução
      throw new Error('E2EE_CALL_UNSUPPORTED');
    }
  }
  ```
- Inicializar `livekitE2EEManager` e associar `callKeyManager`.

### 7.4 Atualização no Backend (Sinalização E2EE de Chamada)
- Em `dm_handlers.go`, `dm_group_handlers.go` e `channel_handlers.go`:
  - Consultar `e2ee_enabled` da respectiva entidade (`dm_rooms`, `dm_groups`, `channels`).
  - Retornar `"e2ee_enabled": isE2EE` nos endpoints `InviteCall`, `AcceptCall`, `GetVoiceToken` e `JoinVoice`.
  - No payload JWT de metadados do LiveKit, injetar `"e2ee_required": isE2EE`.

---

## 8. Automated Testing Plan (`test-livekit-m4.ts`)

A suíte de testes automatizados do Marco M4 deve ser criada em `client/scripts/test-livekit-m4.ts` e registrada em `client/package.json` (`npm run test:livekit-m4`).

### Suítes de Teste Planejadas:
1. **Suite 1: Deterministic Distributor Election Algorithm**
   - Eleição com 1 dispositivo (`['dev-a']` -> `'dev-a'`).
   - Eleição com múltiplos dispositivos em ordem arbitrária (`['dev-c', 'dev-a', 'dev-b']` -> `'dev-a'`).
   - Invariância em permutações: 20 permutações aleatórias retornam sempre o mesmo vencedor.
   - Resiliência a entradas vazias, nulas e IDs duplicados.
2. **Suite 2: Call Key State Machine & Lifecycle Transitions**
   - Transições de estado válidas: `NO_KEY -> GENERATING -> DISTRIBUTING -> ACTIVE -> ROTATING -> DISTRIBUTING -> ACTIVE -> NO_KEY`.
   - Geração de chave criptográfica: exatamente 32 bytes (256 bits), alta entropia.
   - Zeroização de memória no `endCall()`.
3. **Suite 3: Olm To-Device Key Distribution Pipeline**
   - Serialização e integridade do payload `msg_type: 'call_key'`.
   - Distribuição simulada de Alice para Bob via `sendToDevice`.
   - Bob importa com sucesso a chave e sincroniza seu provider.
   - Rejeição de chave corrompida, truncada ou com `call_id` divergente.
4. **Suite 4: Backward & Forward Secrecy on Join/Leave Events**
   - Simulação de `participant_joined`: rotação de chave disparada, `key_index` avançado, chave nova diferente da inicial.
   - Simulação de `participant_left`: re-keying disparado, chave nova gerada para participantes restantes.
   - Failover de distribuidor: desconexão de `dev-a` faz `dev-b` assumir a liderança e redistribuir chave com sucesso.
5. **Suite 5: Anti-Fallback & Platform Compatibility Gate Matrix**
   - Rejeição estrita em Android WebView com Chrome < 86 (`status: 'BLOCKED'`, `fallbackAllowed: false`).
   - Rejeição em ambiente legado sem WebRTC.
   - Aprovação em Chrome >= 86, Electron 30 e Safari 15.4+.
   - Garantia de que salas E2EE **nunca** permitem `fallbackAllowed: true`.
6. **Suite 6: LiveKit SFrame & ExternalE2EEKeyProvider Integration**
   - Instanciação de `ExternalE2EEKeyProvider` com 256 bits.
   - Injeção de `ArrayBuffer` via `setKey`.
   - Validação da existência física e integridade do worker bundle `client/src/workers/e2ee.worker.ts` e `livekit-client.e2ee.worker.js`.
