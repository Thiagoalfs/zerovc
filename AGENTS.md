# ZeroVC — Regras de Design, Negócio e Arquitetura para Agentes

Este documento define as regras obrigatórias para qualquer agente que trabalhe neste repositório. Regras complementares de estilo e deploy residem em `.agents/rules/` (`ui-modal-typography.md`, `mobile-first-design.md`, `ui-popovers-and-dropdowns.md`, `deployment-workflow.md`, `docker-coolify-deploy.md`).

---

## 1. Design e Componentes Compartilhados

- **Botões em Modais:** utilizar sempre `ModalButton` (`client/src/components/ui/modal-button.tsx`), evitando `<button>` estilizado manualmente para ações primárias, secundárias ou de erro.
- **Tipografia e Popovers:** seguir rigorosamente as constantes de `client/src/constants/modalTypography.ts` (`.agents/rules/ui-modal-typography.md`) e os padrões de dropdown/popover de `.agents/rules/ui-popovers-and-dropdowns.md`.
- **Overlay de Edição de Imagem:** usar `EditPencilOverlay` (`client/src/components/Common/EditPencilOverlay.tsx`) para hover de edição em avatar/ícone (`variant="center"`) e banner (`variant="top-right"`). O container pai deve ter `overflow-hidden` para recorte exato sem sobra de cantos.
- **Crop de Imagens:** `ImageCropModal` (`client/src/components/Modals/ImageCropModal.tsx`) deve manter arraste via Pointer Events + `requestAnimationFrame` + `translate3d` (sem re-renders durante o drag) e exibir a imagem inteira ao redor do recorte com centro transparente e borda branca (`box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6)`).
- **Identidade Visual:** usar `ZeroVCLogo` (`client/src/components/Common/ZeroVCLogo.tsx`) e manter os ícones derivados de `client/public/app-icon.svg` sincronizados com `public/` e `electron/`.
- **Perfil do Servidor (`ServerProfile`):** em `ServerSettingsModal`, a aba principal chama-se **Perfil do servidor** (`client/src/components/Modals/ServerSettings/ServerProfile.tsx`) em layout de 2 colunas: esquerda (`Nome do servidor`, `Ícone`, `Canal de boas-vindas`) e direita (`Identidade visual` com card estilo Discord contendo banner, ícone, nome, `Online / Membros` e data de criação).

---

## 2. Sistema de Alterações Não Salvas (Modais de Configuração)

- **Escopo obrigatório:** `ServerSettingsModal`, `ChannelSettingsModal` e campos de `ProfileModal` que interagem diretamente com o servidor (foto de perfil, banner, bio, status, recado). Preferências exclusivamente locais (`useSettingsStore`) continuam imediatas.
- **Envio diferido:** alterações em rascunho ficam apenas em estado local (com preview local via `URL.createObjectURL` para imagens). **Requests para o servidor só podem ser disparados ao clicar em "Salvar Alterações".**
- **Footer Flutuante & Bloqueio de Fechamento:** usar `UnsavedChangesBar` e `useUnsavedGuard` (`client/src/components/Modals/UnsavedChangesBar.tsx`).
  - O footer aparece/desaparece na base do app com animação de slide up / slide down.
  - Enquanto houver alterações não salvas, qualquer tentativa de fechar o modal (`ESC`, botão `X`, clique no backdrop ou voltar no mobile) deve ser **bloqueada**, disparando a animação de tremidinha (`animate-unsaved-shake`) com flash de borda vermelha no `UnsavedChangesBar` até o usuário clicar em **Salvar Alterações** ou **Reverter**.

---

## 3. Regras de Negócio e Segurança

- **Permissões (Servidor vs. Canal):**
  - Permissões explícitas de canal/categoria (Permitir/Negar) sempre sobrescrevem a permissão geral do cargo no servidor.
  - Quando em estado neutro (`inherit`), a permissão efetiva herda da categoria (se houver) e, na ausência, do cargo no servidor.
  - A hierarquia de cargos (não editar cargos iguais ou superiores ao maior cargo do usuário) deve ser validada tanto no frontend quanto no backend Go, incluindo filtro de audiência E2EE.
- **Autenticação na Web (Landing & Download):**
  - Ao acessar rotas públicas na web (`/` e `/download`), **não** executar `checkAuth()`, não chamar `/auth/me` e não conectar WebSocket automaticamente.
  - A verificação/login de sessão na web deve ocorrer somente quando o usuário clicar para abrir o chat ou entrar (`/@me`, `/signin`, convites). No Electron e Capacitor nativos, o fluxo de entrada direta no app é mantido.
- **Screen Share & Áudio (Linux, Windows e Web):**
  - Durante o compartilhamento de tela, **NUNCA** permitir o broadcast/captura do áudio do próprio aplicativo ZeroVC ou da própria guia/aba do ZeroVC no navegador.
  - Garantir exclusão da fonte própria em todas as plataformas (ex.: exclusão de processo/janela na captura WASAPI no Windows, exclusão do stream/sink do próprio app no Linux PipeWire/PulseAudio e flags de supressão/exclusão da guia atual na Web Audio/DisplayMedia API) para evitar eco e microfonia em loop.

---

## 4. Controle de Versão & Build

- Nunca executar `git push` automaticamente sem solicitação explícita do usuário.
- Não rodar `npm run build` em `client/` sem necessidade, pois sobrescreve `backend/web/`.
