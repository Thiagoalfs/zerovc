# BRIEFING — 2026-10-10T13:05:00Z

## Mission
Concluir a investigação técnica e desenhar a arquitetura de implementação do Marco M4 (Chamadas de Voz/Vídeo E2EE LiveKit - Fase 3).

## 🔒 My Identity
- Archetype: explorer_m4
- Roles: M4 LiveKit Explorer, Read-only investigation
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\
- Original parent: e52a8903-b2c2-47c9-abdc-a9d7e7091fdf
- Milestone: M4 LiveKit Voice/Video E2EE Calls (Fase 3)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement code in project source directories
- Never execute git push
- Only write within working directory C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\
- Provide complete evidence chain, verification method, and 5-component handoff report

## Current Parent
- Conversation ID: e52a8903-b2c2-47c9-abdc-a9d7e7091fdf
- Updated: 2026-10-10T13:01:19Z

## Investigation State
- **Explored paths**:
  - `e2ee_implementation_plan_revision6.md` (§13, §14 Fase 3)
  - `client/src/lib/livekitE2EE.ts`, `client/src/lib/livekit.ts`, `client/src/workers/e2ee.worker.ts`
  - `client/src/stores/voiceStore.ts`, `client/src/stores/callStore.ts`, `client/src/App.tsx`
  - `backend/internal/handlers/dm_handlers.go`, `dm_group_handlers.go`, `channel_handlers.go`, `e2ee_handlers.go`, `voice/livekit.go`
  - Test suites: `test-livekit-gate-adversarial.ts`, `test-e2ee-spike.ts`, `test-frontend-m3.ts`
- **Key findings**:
  - Spike M1 validou a fundação SFrame (`ExternalE2EEKeyProvider` + worker wrapper).
  - Algoritmo de eleição determinística `min(device_id)` elimina necessidade de consenso de rede.
  - Chave simétrica de 256 bits gerada pelo distribuidor e transportada via Olm to-device (`msg_type: 'call_key'`).
  - Rotação estrita em `participant_joined` (backward secrecy) e `participant_left` (forward secrecy).
  - Gate de anti-fallback bloqueia chamadas em clientes sem insertable streams (ex: WebView < 86) com zero permissão de texto claro.
- **Unexplored areas**: Nenhuma pendência investigativa para o M4.

## Key Decisions Made
- Mapeado módulo `client/src/crypto/callKeys.ts` com a máquina de estados completa (`NO_KEY` -> `GENERATING` -> `DISTRIBUTING` -> `ACTIVE` -> `ROTATING`).
- Estruturado contrato de to-device para `msg_type: 'call_key'`.
- Definido plano de testes automatizados com 6 suítes em `test-livekit-m4.ts`.

## Artifact Index
- `DISPATCH.md` — Histórico de despachos do orquestrador
- `BRIEFING.md` — Memória persistente de trabalho
- `analysis.md` — Relatório técnico aprofundado com especificações completas
- `handoff.md` — Relatório de handoff autocontido (5 componentes)
