# Handoff Report: Milestone M4 — Chamadas de Voz/Vídeo E2EE LiveKit (Fase 3)

## 1. Observation

Durante a investigação técnica do Marco M4 no repositório `zerovc`, foram diretamente observados os seguintes fatos:

1. **Estado da Infraestrutura LiveKit SFrame (M1 Spike)**:
   - Em `client/src/lib/livekitE2EE.ts` (linhas 1-20, 68-89), `ExternalE2EEKeyProvider` e `isE2EESupported` da biblioteca `livekit-client` estão importados e funcionais.
   - O wrapper do worker existe em `client/src/workers/e2ee.worker.ts` contendo:
     ```ts
     import 'livekit-client/e2ee-worker';
     ```
   - O teste de spike `npm run test:livekit-gate --prefix client` e `npm run test:e2ee-spike --prefix client` executam com **100% de aprovação (23/23 e 27/27 testes verdes)**.

2. **Lacunas de Integração em `LiveKitManager` e Stores**:
   - Em `client/src/lib/livekit.ts` (linhas 245-264), `new Room({...})` é instanciado sem passar a propriedade `e2ee: E2EEOptions`.
   - O arquivo `client/src/crypto/callKeys.ts` **não existe** no repositório (`find_by_name` retornou 0 resultados).
   - Em `client/src/stores/voiceStore.ts` (linhas 130, 416, 477), o método `connectLiveKitRoom` é chamado sem verificar `checkCallEligibility` e sem inicializar chave de chamada.
   - Em `client/src/App.tsx` (linhas 1345-1360), o manipulador `handleE2EEToDevice` processa exclusivamente `room_key` e `key_request`, ignorando `msg_type === 'call_key'`.

3. **Backend e Suporte a Mensagens To-Device**:
   - Em `backend/internal/database/schema.sql` (linhas 539-546), a tabela `e2ee_to_device` possui coluna `msg_type VARCHAR(32) NOT NULL`, aceitando `'call_key'`.
   - Em `backend/internal/handlers/e2ee_handlers.go` (linhas 705-748), `SendToDevice` grava `msg_type` e entrega em tempo real via WebSocket `EventE2EEToDevice`.
   - As tabelas `dm_rooms`, `dm_groups` e `channels` já possuem as colunas `e2ee_enabled BOOLEAN DEFAULT FALSE` e `rotation_epoch INT DEFAULT 1` (linhas 476-484).
   - Nos handlers de voz (`dm_handlers.go:995`, `dm_group_handlers.go:1036`, `channel_handlers.go:596`), o backend emite tokens LiveKit via `h.livekit.GenerateJoinToken(...)`, mas ainda não anexa a flag `e2ee_enabled` nas respostas JSON nem o metadado `"e2ee_required": true` no JWT.

4. **Especificação de Referência (`e2ee_implementation_plan_revision6.md`)**:
   - Linhas 880-925 (§13): Define a máquina de estados canônica (`NO_KEY -> GENERATING -> DISTRIBUTING -> ACTIVE -> ROTATING`), a regra do distribuidor determinístico (`min(device_id)` canônico) e os requisitos da chave (256 bits, descartada ao fim da chamada).
   - Linha 943 (§13.4): Determina que em salas E2EE o fallback silencioso para plaintext **deve obrigatoriamente falhar/ser bloqueado**.

---

## 2. Logic Chain

1. **Da Observação 1 (SFrame funcional) e Observação 2 (Room sem e2ee)**:
   - A fundação SFrame está validada e testada no nível de biblioteca (`ExternalE2EEKeyProvider` + worker). Para que as chamadas reais de voz e vídeo usem cifragem SFrame, `livekit.ts` precisa aceitar `e2eeOptions: E2EEOptions` no método `connect` e repassá-lo na criação de `new Room({ e2ee })`, seguido por `room.setE2EEEnabled(true)`.

2. **Da Observação 4 (§13.2) e Observação 2 (callKeys.ts ausente)**:
   - Toda chamada E2EE necessita de uma chave simétrica de 256 bits compartilhada entre os participantes sem que o SFU (servidor LiveKit) a conheça.
   - O algoritmo determinístico $\text{Distributor} = \min_{\text{lex}}(\text{device\_id})$ garante que todos os participantes elejam o mesmo distribuidor sem necessidade de troca de mensagens de consenso ou risco de split-brain.
   - Quando o distribuidor se conecta à sala, ele gera a chave (32 bytes aleatórios via `crypto.getRandomValues`) e transiciona `NO_KEY -> GENERATING -> DISTRIBUTING -> ACTIVE`.

3. **Da Observação 3 (e2ee_to_device pronto) e Observação 2 (App.tsx ignora call_key)**:
   - A infraestrutura backend já aceita mensagens to-device para qualquer `msg_type`.
   - Para que receptores na chamada obtenham a chave de mídia, o distribuidor deve despachar mensagens com `msg_type: 'call_key'` via `api.e2ee.sendToDevice`.
   - O frontend em `App.tsx` precisa interceptar `msg.msg_type === 'call_key'` no evento `E2EE_TO_DEVICE` e encaminhar o payload decodificado para o `callKeyManager.handleIncomingCallKey()`.

4. **Da Observação 4 (§13.1 e §13.3 — Backward e Forward Secrecy)**:
   - Ao ingressar um novo participante (`participant_joined` / `RoomEvent.ParticipantConnected`), o distribuidor deve gerar uma nova chave (incrementando `keyIndex`) e enviá-la a todos, impedindo que o novo participante descriptografe o histórico prévio da chamada (Backward Secrecy).
   - Ao sair um participante (`participant_left` / `RoomEvent.ParticipantDisconnected`), o distribuidor remanescente gera uma nova chave e a distribui apenas aos que continuam conectados, impedindo que o participante desconectado continue ouvindo a chamada (Forward Secrecy).

5. **Da Observação 1 (`checkCallEligibility`), Observação 2 (`voiceStore` sem gate) e Observação 4 (§13.4)**:
   - Chamadas em salas onde `e2ee_enabled === true` nunca devem abrir conexões WebRTC se `isCallE2EESupported()` retornar falso (ex.: Android WebView < 86 ou browser legado sem insertable streams).
   - O gate `checkCallEligibility({ isE2EERoom: true })` deve ser invocado em `voiceStore.ts` e `callStore.ts` antes de qualquer requisição de token ou inicialização de WebRTC, bloqueando categoricamente o fluxo e exibindo o modal `UPGRADE_REQUIRED`.

---

## 3. Caveats

1. **Identificadores de Dispositivo no LiveKit**:
   - Os participantes do LiveKit possuem `identity` formatado como `userID.String()`. Para que o algoritmo `min(device_id)` identifique os dispositivos conectados na chamada, os metadados do participante no LiveKit (`participant.metadata`) devem carregar o objeto `{ "device_id": "...", "user_id": "..." }`, injetado no token JWT pelo backend.
2. **Debounce em Flutuações de Conexão**:
   - Desconexões e reconexões rápidas de rede podem emitir eventos de join/leave em rajada. O gerenciador deve aplicar um debounce de 150-250ms para evitar tempestade de rotação de chave na mesma chamada.
3. **Escopo do Marco M4**:
   - Este relatório delimita o escopo de chamadas de voz e vídeo E2EE (DM 1:1, DM Grupos e Canais de Voz com opt-in). Canais de texto com audiência escalonada pertencem ao Marco M5.

---

## 4. Conclusion

O Marco M4 possui arquitetura totalmente mapeada e compatível com a fundação existente:
1. **`client/src/crypto/callKeys.ts`** deve ser criado contendo o `CallKeyManager`, a máquina de estados (`NO_KEY`, `GENERATING`, `DISTRIBUTING`, `ACTIVE`, `ROTATING`, `REQUESTING`), o algoritmo determinístico `electDistributor` ($\min_{\text{lex}}(\text{device\_id})$), e os manipuladores de eventos de join/leave para rotação automática (backward e forward secrecy).
2. **`client/src/lib/livekit.ts` e `livekitE2EE.ts`** devem ser atualizados para injetar o `ExternalE2EEKeyProvider` e o worker em `new Room({ e2ee })` e invocar `setE2EEEnabled(true)`.
3. **`client/src/App.tsx`** deve encaminhar `msg_type === 'call_key'` para o `callKeyManager`.
4. **`client/src/stores/voiceStore.ts` e `callStore.ts`** devem acionar o gate estrito `checkCallEligibility`, bloqueando chamadas em ambientes não compatíveis e impedindo qualquer fallback em texto claro.
5. **`backend`** deve expor `e2ee_enabled` nas respostas de chamada e incluir `e2ee_required` nos metadados JWT do LiveKit.
6. A suíte de testes automatizados **`client/scripts/test-livekit-m4.ts`** cobrirá as 6 áreas de validação exigidas.

---

## 5. Verification Method

Para verificar independentemente todas as conclusões e testes deste relatório:

1. **Verificação dos Testes Criptográficos e do Gate Existente**:
   ```powershell
   npm run test:livekit-gate --prefix client
   npm run test:e2ee-spike --prefix client
   ```
   *Critério de aprovação*: 100% dos testes passam verde sem falhas.

2. **Verificação da Compilação e Testes do Backend Go**:
   ```powershell
   cd backend
   go test -v ./internal/handlers -run "TestE2EE"
   ```
   *Critério de aprovação*: Passar sem erros.

3. **Verificação da Futura Suíte Automatizada do M4**:
   Após a implementação do M4 pelos agentes executores, executar:
   ```powershell
   npm run test:livekit-m4 --prefix client
   ```
   *Condições de invalidação*:
   - Qualquer falha na eleição de `min(device_id)`.
   - Falha na rotação de chave na entrada ou saída de participantes.
   - Qualquer cenário onde `fallbackAllowed` seja `true` em uma sala E2EE.
