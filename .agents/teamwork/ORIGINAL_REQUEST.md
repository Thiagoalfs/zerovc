# Original User Request

## Initial Request — 2026-10-08T16:50:46Z

Implementação de criptografia de ponta a ponta (E2EE) opt-in no ZeroVC para DMs 1:1, grupos de DM, chamadas LiveKit e canais de servidor (texto e voz), mantendo estrita compatibilidade com contratos existentes e clientes Web, Electron e Android.

Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Integrity mode: development

Reference: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`

## Requirements

### R1. Spike Criptográfico e LiveKit (Fase 0 - Go/No-Go)
Validar viabilidade em matriz Web, Electron e Android WebView: integração de vodozemac WASM, geração e persistência local de identidade em IndexedDB com CryptoKey não-extraível, sessões Olm e Megolm, e suporte a LiveKit E2EE com insertable streams. Caso a matriz obrigatória (especialmente Android WebView) falhe, as fases subsequentes de chamadas não avançam.

### R2. Infraestrutura de Identidade, Dispositivos e Roster Assinado (Fase 1)
Implementar no backend Go e no cliente TypeScript:
- Registro e gerenciamento de identidades Ed25519 e dispositivos Olm com one-time keys e fallback key.
- Sistema de `e2ee_rosters` versionado e assinado pela identidade do ator autorizado, com encadeamento criptográfico (`prev_roster_hash`).
- Isolamento estrito entre identidade e audiência, revogação de dispositivos e triggers atômicos de incremento de `rotation_epoch`.
- Endpoints de mutação obrigatoriamente via POST com validação CSRF.

### R3. Mensageria E2EE em DMs 1:1 e Grupos (Fases 2 e 4)
- Formato de envelope com coluna dedicada `e2ee_ciphertext` (sem tocar na busca gerada do banco) e metadados opacos `e2ee_meta`.
- Protocolo de `key_request` com rate limiting, TTL, deduplicação e aceitação apenas da primeira resposta válida assinada.
- Suporte a mensagens de texto, anexos cifrados no cliente via AES-256-GCM, reações cifradas e edições com anti-replay.
- Garantia de idempotência de `message_id`, `messageCodec` puro e armazenamento desacoplado no cliente sem travar unread count.
- Limite estrito de 15 membros em grupos de DM e proibição de entrega de histórico prévio para novos membros.

### R4. Chamadas de Voz/Vídeo E2EE (Fase 3)
- Habilitação de E2EE no LiveKit via `ExternalE2EEKeyProvider` e worker dedicado.
- Distribuição de chaves aleatórias de chamada via mensagens to-device (Olm), com rotação automática em entrada/saída de participantes.
- Proibição de fallback silencioso para chamadas em claro em salas E2EE e bloqueio quando `isE2EESupported()` for falso.

### R5. Canais Criptografados de Servidor com Audiência Escalonada (Fase 5)
- Controle de audiência centralizado na função `recomputeAudience(channel)` no backend, monitorando permissões, roles, overwrites, ban/kick e revogações.
- Limites escalonados de audiência: liberação inicial até 15 membros, expansão para 50 somente após validação de métricas de rotação/churn, e teto experimental de 250 sob critério estrito de aborto e fallback para modo somente-leitura.

### R6. Gerenciamento de Recuperação, Verificação e UI Segura (Fases 1, 2 e 6)
- Chave de Recuperação de 256 bits gerada localmente (nunca enviada ao servidor) e backup cifrado de sessões opt-in.
- Código de segurança verificável com representação canônica em QR code e 60 dígitos.
- Interface em `ProfileSettings` (`PrivacyView`/`SecurityView`) sem expor material sensível no DOM ou logs.
- Gate de versão de cliente (`X-Client-E2EE-Version`) com retorno 426 para clientes legados e bloqueio de downgrade.

## Acceptance Criteria

### Baseline Build & Quality
- [ ] Backend Go compila com `go build ./...` e passa em todos os testes unitários com `go test ./...`.
- [ ] Frontend passa em `npm run build` sem erros de TypeScript e sincroniza assets estáticos limpos.
- [ ] Nenhuma rotação desnecessária ocorre quando permissões alteradas não afetam a audiência real.

### Cryptographic Security & Anti-Leak
- [ ] Nenhum plaintext de conversas E2EE ou segredo criptográfico (chaves privadas, recovery key, pickles) é transmitido ao backend, gravado em logs ou exposto no DOM.
- [ ] O backend rejeita com 403/405/409 mensagens em claro em salas E2EE e mensagens cifradas em salas normais.
- [ ] Novos membros não conseguem decifrar histórico anterior ao seu ingresso no grupo ou canal.
- [ ] Dispositivos revogados ou membros expulsos são imediatamente excluídos do roster e impedidos de decifrar novas mensagens.

### Reliability & User Experience
- [ ] Mensagens indecifráveis exibem aviso isolado sem interromper a ordenação ou renderização do restante da conversa.
- [ ] Chamadas em salas E2EE não realizam fallback para áudio desprotegido.
- [ ] Churn intenso de membros em canais de servidor não causa tempestade descontrolada de requisições to-device (debounce e rotação lazy validados).


## Follow-up — 2026-10-09T11:59:28Z

Retomar exatamente de onde o teamwork parou após o reinício do servidor.

Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Integrity mode: development

Contexto atual do projeto:
- Marco M1 (Fase 0 - Spike Go/No-Go): 100% concluído e aprovado com 98/98 testes verdes em todas as suítes (vodozemac WASM, WebCrypto non-extractable KeyStore, LiveKit anti-fallback gate).
- Marco M2 (Fase 1 - Identidade, Dispositivos e Roster Assinado):
  * Backend Go: `e2ee_models.go`, `e2ee_handlers.go`, `e2ee_version.go` criados; schema e rotas Chi configuradas; testes unitários em `e2ee_handlers_test.go` passando 100% com `go test`.
  * Frontend TS: `client/src/crypto/deviceManager.ts` e `client/src/crypto/rosterManager.ts` criados; `api.ts` atualizado com header `X-Client-E2EE-Version` e namespace `api.e2ee`; `socket.ts` atualizado com parâmetros de handshake E2EE.
- Consultar o diretório `.agents/teamwork/` para recuperar o estado completo de `PROJECT.md`, `GATE_STATUS.md` e os relatórios de handoff.
- Continuar a execução dos marcos subsequentes até a conclusão total (M2 -> M3 -> M4 -> M5 -> M6 -> M7), mantendo a integridade dos testes em Go e TypeScript.


## Follow-up — 2026-10-10T11:57:56Z

Retomada de execução da orquestração E2EE (ZeroVC) após reset de cota e reinício do servidor.

Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Integrity mode: development

Status consolidado:
1. Marco M1 (Fase 0 - Spike Go/No-Go): 100% concluído e aprovado (98/98 testes verdes).
2. Marco M2 (Fase 1 - Identidade, Dispositivos e Roster Assinado): 100% implementado, corrigido e APROVADO com todos os 9 apontamentos sanados (Gate 2 com veredito unânime APPROVE/CLEAN).
3. Testes E2E (Tiers 1 a 4): 181/181 testes verdes certificados em `TEST_READY.md`.
4. Marco M3 (Mensageria E2EE em DMs e Grupos):
   - Estava em fase de exploração com `explorer_m3_1` (backend) e `explorer_m3_2` (frontend).
   - O orquestrador `orchestrator_gen2` deve retomar e liderar a implementação do Marco M3 (Fases 2 e 4: DMs 1:1 e grupos, envelopes Megolm, anexos AES-256-GCM, reações/edições cifradas, idempotência de message_id, rejeição de plaintext com 409 em salas E2EE, e limite de 15 membros em grupos), seguido por M4, M5, M6 e M7.
5. Observar estritamente as regras de desenvolvimento:
   - NUNCA executar `git push` automaticamente.
   - Mutações de estado EXCLUSIVAMENTE via POST com CSRF.
   - Validação TLS sempre ativa em cURL.
   - Zero vazamento de segredos/plaintext em logs ou DOM.
   - Manter compilação limpa de Go e TypeScript.

Instrução: Retomar e guiar o projeto através do `orchestrator_gen2` até a conclusão total.

## Follow-up — 2026-10-15T16:49:48Z

Retomada imediata da orquestração E2EE no ZeroVC após resolução de todos os conflitos de git e compilação verde de Go e TypeScript.

Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Integrity mode: development

Status do repositório:
1. Merge conflicts: 100% RESOLVIDOS. Zero unmerged paths remanescentes.
2. Build e testes do Backend Go: `go build ./...` e `go test ./...` executando com sucesso e 100% PASS.
3. Build e testes do Frontend TS: `npx tsc --noEmit` com 0 erros, `npm run build` limpo sincronizado com `backend/web`, e 181/181 testes verdes certificados em `tests/e2e/runner.ts` (Tiers 1-4).
4. Status dos Marcos:
   - M1 (Fase 0 - Spike Go/No-Go): APROVADO.
   - M2 (Fase 1 - Identidade, Dispositivos e Roster): APROVADO.
   - M3 (Mensageria E2EE em DMs e Grupos): Implementação concluída e APROVADA no Gate 3.
   - M4 (Chamadas LiveKit E2EE - Fase 3): Módulo `callKeys.ts`, integrações de áudio/vídeo e travas anti-fallback implementadas. Prosseguir com o Gate 4 (revisão e auditoria) e avançar para M5 (Canais de Servidor com audiência escalonada), M6 (Recuperação e UI) e M7 (Hardening final).
5. Regras rígidas:
   - NUNCA executar `git push` automaticamente.
   - Mutações de estado exclusivamente via POST com CSRF.
   - Sem vazamento de chaves privadas ou plaintext em logs/DOM.

Instrução: Continuar a orquestração a partir do Marco M4 até a conclusão completa do projeto.
