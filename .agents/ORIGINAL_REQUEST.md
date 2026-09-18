# Original User Request

## Initial Request — 2026-09-17T17:05:29Z

Refatoração arquitetural, modularização de componentes do frontend, otimização do gerenciamento de estado e WebRTC/LiveKit, padronização do backend em Go com segurança reforçada, autenticação robusta e rate limiting em APIs sensíveis, preservando total compatibilidade com clientes existentes.

Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Integrity mode: development

## Requirements

### R1. Frontend Component Modularization & TypeScript Cleanup
Modularizar e desacoplar componentes monolíticos de alta complexidade (como `ServerSettingsModal`, `VoiceRoom`, `ChatArea`, `MemberList`), extraindo subcomponentes coesos, hooks customizados e eliminando código legado redundante. Garantir tipagem TypeScript estrita em todas as propriedades e stores sem uso indevido de `any`.

### R2. State Management & WebRTC/LiveKit Optimization
Otimizar os stores Zustand (`voiceStore`, `guildStore`, `dmStore`, `authStore`, `callStore`) para prevenir re-renders desnecessários, vazamentos de memória em listeners de eventos e gerenciar subscrições de áudio/vídeo/telas no LiveKit de forma limpa e resiliente.

### R3. Backend Architecture, Security & Rate Limiting (Go)
Padronizar a estrutura de rotas e handlers no backend Go, garantindo validações de entrada rigorosas, middlewares de autenticação consistentes, proteção contra CSRF em ações de mutação de estado e aplicação de rate limiting inteligente (via `httprate` ou similar) em endpoints de autenticação, upload e ações críticas de servidor/mensagens. Otimizar queries SQL e acessos ao banco PostgreSQL.

### R4. Contract & Backward Compatibility Preservation
Preservar estritamente todos os contratos de API REST existentes, formatos de payload JSON e eventos WebSocket (`WS_EVENT`), assegurando que a experiência dos clientes Web, Desktop (Electron) e Mobile (Capacitor/Android) permaneça 100% estável e funcional.

## Acceptance Criteria

### Build & Type Verification
- [ ] O build do cliente (`npm run build` na pasta `client`) executa com sucesso com 0 erros de compilação TypeScript e Vite.
- [ ] O backend Go compila perfeitamente sem erros de importação, sintaxe ou tipagem.

### Security & Rate Limiting
- [ ] Endpoints críticos (autenticação, registro, 2FA, envio de mensagens e mutações de guilda) contam com rate limiting ativo e verificação de autorização.
- [ ] Métodos de alteração de estado exigem POST/DELETE com validação de sessão e token CSRF.

### Functional Integrity
- [ ] Conexão e troca de canais de voz WebRTC (LiveKit), controle de microfone, áudio e transmissão de tela continuam 100% operacionais.
- [ ] Envio e recepção de mensagens de chat, upload de anexos e reações funcionam sem regressões.
- [ ] Modais de configurações de servidor, cargos, canais e membros operam de forma rápida e desacoplada.
