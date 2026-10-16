# HANDOFF — Milestone M3 Frontend Architecture & Blueprints

> **Agente:** `explorer_m3_frontend` (Teamwork Explorer)  
> **Destinatário:** `orchestrator_gen2`  
> **Tipo de Handoff:** Hard (Task complete)  
> **Data:** 2026-10-10  
> **Artefato Principal:** `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\analysis.md`  

---

## 1. Observation

Durante a investigação da base de código do frontend (`client/`), foram realizadas inspeções diretas em arquivos de código-fonte, stores Zustand, componentes React, wrappers criptográficos e suítes de teste:

1. **Estado dos Wrappers Criptográficos (`client/src/crypto/`)**:
   - `client/src/crypto/vodozemac/index.ts` (linhas 1–31): Exporta as primitivas Rust/WASM do pacote `@kinsh/vodozemac-wasm`: `Account`, `Session`, `GroupSession`, `InboundGroupSession`, `InboundResult`. A inicialização de WASM é garantida por `ensureVodozemacInitialized()`.
   - `client/src/crypto/keyStore.ts` (linhas 40–57): Inicializa o banco IndexedDB `zerovc_crypto_v1` (v1) contendo as object stores protegidas `keystore`, `account`, `olm_sessions`, `megolm_outbound` e `megolm_inbound`, criptografadas via WebCrypto `CryptoKey` não-extraível (`AES-GCM-256`, `extractable: false`).
   - `client/src/crypto/rosterManager.ts` (linhas 23–36, 73–82): Implementa validação completa de rosters assinados encadeados (`e2ee_rosters`), com serialização canônica JSON (RFC 8785) e digest SHA-256 (`audience_hash` e `prev_roster_hash`).
   - `client/src/crypto/megolmSession.ts` (linhas 30–83, 107–129): Contém esboço inicial de `MegolmManager`, mas ainda não implementa a distribuição automática de chaves de sessão para o roster via Olm *to-device*, nem o isolamento de histórico por epoch, nem integração com o protocolo `key_request`.

2. **Ausência do Módulo de Mensageria**:
   - O diretório `client/src/messaging/` **não existe** na base de código. O codec puro `messageCodec.ts` precisa ser criado do zero.

3. **Mecanismo de Contagem de Não Lidas (*Unread Counts*)**:
   - `client/src/stores/dmStore.ts` (linhas 511–532): O método `addMessage` incrementa `roomUnreadCounts[message.dm_room_id]` de forma **síncrona** imediatamente ao receber o evento do WebSocket, sem aguardar decifragem assíncrona.
   - `client/src/stores/dmGroupStore.ts` (linhas 545–566): O método `handleGroupMessageCreate` incrementa `groupUnreadCounts[message.group_id]` de forma **síncrona** na chegada da mensagem.

4. **Teto de Membros em Grupos de DM**:
   - `client/src/components/Modals/CreateDMGroupModal.tsx` (linha 52): Já valida a seleção máxima de 14 amigos (`selectedFriendIds.length >= 14`), resultando em 15 participantes com o criador:
     ```typescript
     if (selectedFriendIds.length >= 14) {
       setError('Você pode adicionar no máximo 14 amigos (15 pessoas no total).');
       return;
     }
     ```
   - `client/src/components/Modals/AddDMGroupMembersModal.tsx` (linha 28): Define `maxAddable = Math.max(0, 15 - currentMembersCount)`.
   - Nenhum dos dois modais oferece atualmente o toggle opt-in para criação de grupo E2EE.

5. **Interface de Mensagens e Cabeçalho**:
   - `client/src/components/Chat/MessageItem.tsx` (linhas 46–73, 97–1066): Interface `UniversalMessage` não possui os campos `decryption_status` e `encrypted`. O componente renderiza `message.content` diretamente e não isola mensagens indecifráveis em caso de falha de decifragem.
   - `client/src/components/Chat/ChatHeader.tsx` (linhas 6–41): Não possui props ou renderização de indicador de status E2EE.
   - `client/src/components/DM/DMChatArea.tsx` e `client/src/components/DM/DMGroupChatArea.tsx`: Não implementam o disparo de ativação E2EE na conversa nem o envio criptografado de mensagens.

6. **Eventos WebSocket em `App.tsx`**:
   - `client/src/App.tsx` (linhas 1337–1378): Os eventos `E2EE_TO_DEVICE`, `E2EE_ROSTER_UPDATE`, `E2EE_ROTATION_REQUIRED` e `E2EE_DEVICE_LIST_UPDATE` **não estão subscritos** no cliente.

7. **Infraestrutura de Testes**:
   - `client/package.json` (linhas 14–18): Contém scripts `test:frontend-m2`, `test:e2ee-spike`, `test:e2ee-adversarial`, `test:livekit-gate` executados via `tsx`.

---

## 2. Logic Chain

1. **A partir da Observação 1 e 2**:
   - Como `vodozemac`, `keyStore`, `deviceManager` e `rosterManager` já estão operacionais e validados no Marco M2, o Marco M3 pode construir diretamente sobre eles:
     * `envelope.ts` fornecerá a serialização canônica das mensagens, anexos e reações.
     * `attachments.ts` utilizará a WebCrypto API nativa (`AES-256-GCM`) para cifrar arquivos antes do upload e decifrá-los no download após verificação de hash SHA-256.
     * `megolmSession.ts` gerenciará sessões de saída e de entrada, vinculando-as a `rotation_epoch`, limitando a 100 mensagens / 7 dias e distribuindo a `room_key` para todos os dispositivos do roster ativo via `olmSessionManager` e `POST /api/e2ee/to-device`.

2. **A partir da Observação 3**:
   - As stores `dmStore` e `dmGroupStore` já atualizam o badge de não lidas sincronamente ao receber o evento bruto.
   - Para manter essa propriedade sem regressões, o `messageCodec.ts` deve ser implementado como um serviço puro assíncrono:
     * O evento bruto incrementa o contador e insere a mensagem como `decryption_status: 'decrypting'`.
     * A resolução assíncrona do `messageCodec.decodeMessage` atualiza o nó específico da mensagem para `decryption_status: 'decrypted'` ou `decryption_status: 'undecryptable'`.
     * Se a decifragem falhar, o contador de não lidas não é corrompido e a lista de mensagens continua operando normalmente.

3. **A partir da Observação 1 e 5**:
   - Erros de decifragem (chave ausente, corrupção, índice inconsistente) nunca devem lançar exceções não tratadas nem quebrar a árvore React.
   - O `messageCodec` captura qualquer falha e retorna o placeholder seguro: *"Mensagem criptografada indisponível"*.
   - Em caso de `KEY_MISSING`, o `messageCodec` aciona o `keyRequestManager` em segundo plano para enfileirar uma mensagem *to-device* `key_request`.

4. **A partir da Observação 4**:
   - O limite de 15 membros já está parcialmente presente nos modais, mas necessita ser amarrado de forma estrita na criação e adição de membros quando o grupo for E2EE.
   - Para satisfazer o requisito de **Isolamento de Histórico**, ao adicionar um novo membro ao grupo E2EE (`addMembers`), a sessão Megolm de saída deve ser obrigatoriamente rotacionada para o novo epoch. O novo membro só receberá chaves a partir deste novo epoch, garantindo que o histórico prévio seja ilegível para ele.

5. **A partir da Observação 6**:
   - O registro dos ouvintes `E2EE_TO_DEVICE`, `E2EE_ROSTER_UPDATE` e `E2EE_ROTATION_REQUIRED` em `App.tsx` completa a integração em tempo real, permitindo o recebimento de `room_key`, o atendimento a `key_request` e a invalidação de sessões de saída sob demanda do backend.

---

## 3. Caveats

- **Ambiente de Testes Node.js vs Navegador**: Nos testes executados via `tsx` no Node.js, `globalThis.crypto` e `globalThis.crypto.subtle` estão disponíveis nativamente no Node 20+, mas `indexedDB` requer fallback em memória ou polyfill (o `keyStore.ts` já possui `memoryStore` como fallback embutido).
- **Sem Modificação de Código em Produção**: Esta fase de exploração é estritamente **read-only** para os arquivos de produção do projeto. Nenhuma alteração foi gravada em `client/src/` neste turno; todos os códigos e blueprints foram detalhados em `analysis.md`.
- **Backend M3 Dependências**: A integração plena dos uploads de anexo dependerá do endpoint `POST /api/e2ee/attachments` que está sendo mapeado em paralelo pelo `explorer_m3_backend`.

---

## 4. Conclusion

O diagnóstico da arquitetura frontend do ZeroVC confirmou total viabilidade para a implementação do Marco M3. Todos os contratos, especificações de envelope, criptografia de anexos com WebCrypto AES-256-GCM, desacoplamento do codec puro, protocolo `key_request`, teto de 15 membros em grupos de DM e isolamento de histórico foram formalmente desenhados e validados em `analysis.md`.

O projeto está pronto para a emissão de tarefas de implementação para o implementador (`worker_m3_frontend`).

---

## 5. Verification Method

Para verificar independentemente a análise e preparar a suíte de testes:
1. **Inspeção dos Arquivos Mencionados**:
   - Conferir `client/src/crypto/vodozemac/index.ts`, `keyStore.ts`, `deviceManager.ts`, `rosterManager.ts`.
   - Conferir `client/src/stores/dmStore.ts` e `dmGroupStore.ts`.
   - Conferir `client/src/components/Modals/CreateDMGroupModal.tsx` e `AddDMGroupMembersModal.tsx`.
2. **Leitura do Blueprint Detalhado**:
   - `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\analysis.md`.
3. **Comando de Teste Planejado para o Implementador**:
   - `npx tsx scripts/test-frontend-m3.ts` (executará as 6 suítes cobrindo Megolm, envelopes, anexos, codec puro, key_request e limite de 15 membros).
   - `npm run build` no diretório `client/` para validar a ausência de regressões e tipos limpos no TypeScript.
