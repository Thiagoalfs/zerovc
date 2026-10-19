# 🛡️ Relatório de Auditoria de Segurança — ZeroVC

- **Projeto Auditado:** ZeroVC (`github.com/Thiagoalfs/zerovc`)
- **Data da Auditoria:** 18 de outubro de 2026
- **Escopo Auditado:** Repositório completo (`backend/`, `client/src/`, `client/electron/`, `deploy/`, `docker-compose.dev.yml`, `.github/workflows/`, histórico Git e bundles compilados em `backend/web/assets/`)
- **Classificação:** Auditoria de Segurança de Código-Fonte (White-Box / SAST Manual Linha por Linha)

---

## 1. Detecção da Stack e Nota Metodológica

Antes da varredura de vulnerabilidades, a arquitetura do **ZeroVC** foi mapeada integralmente:

| Camada | Tecnologias Detectadas |
| :--- | :--- |
| **Backend & Roteamento** | Go 1.24, roteador HTTP `github.com/go-chi/chi/v5`, WebSockets em tempo real (`gorilla/websocket` via Hub/Gateway próprio em `backend/internal/gateway/`). |
| **Banco de Dados & Acesso a Dados** | PostgreSQL 16 acessado diretamente via driver de alta performance `github.com/jackc/pgx/v5/pgxpool` com **SQL nativo parametrizado** (sem ORM). Schema gerenciado em `backend/internal/database/schema.sql` e `backend/migrations/000001_init.up.sql`. |
| **Autenticação & Sessão** | JWT (`github.com/golang-jwt/jwt/v5` com `HS256`) enviado via cookie `HttpOnly` (`zerovc_token`) ou header `Authorization: Bearer`, proteção anti-CSRF Double-Submit Cookie com HMAC-SHA256 e separação de domínio (`backend/internal/middleware/csrf.go`), senhas com `bcrypt` e 2FA TOTP (`RFC 6238`) + códigos de backup SHA-256. |
| **Voz, Vídeo & E2EE** | LiveKit SFU (`livekit/protocol`, `livekit-server-sdk-go`), criptografia de ponta a ponta (E2EE) com `@matrix-org/vodozemac` WASM (Olm/Megolm), listas de membros assinadas em cadeia (`e2ee_rosters`), fila `to-device` e backup de chaves cifrado com Argon2id / AES-256-GCM. |
| **Frontend Web & Mobile** | React 18, TypeScript, Vite 5, Zustand (`client/src/stores/`), Tailwind CSS, Capacitor (Android). |
| **Cliente Desktop** | Electron 30 (`client/electron/main.ts`, `preload.ts`) + módulo nativo C++ WASAPI (`zerovc-audio-capture.exe`) para captura de áudio por processo. |
| **Infraestrutura & CI/CD** | Docker multi-stage (`backend/Dockerfile`), `deploy/docker-compose.yml`, `deploy/docker-compose.coolify.yml`, `docker-compose.dev.yml`, `deploy/livekit.yaml` e GitHub Actions (`.github/workflows/ci.yml`, `desktop-release.yml`). |

### Como cada Categoria foi Mapeada para a Stack do ZeroVC

1. **Categoria 1 — BANCO SEM TRANCA (Isolamento de Inquilino/Dono):**
   Como o projeto utiliza PostgreSQL com `pgx/v5` direto (sem RLS do Supabase), o isolamento multi-tenant depende de filtros explícitos em cada query SQL e evento WebSocket:
   - **Servidores (Guilds):** verificação na tabela `guild_members (guild_id, user_id)`.
   - **Canais Privados:** verificação de `channels.is_private` combinada com `channel_role_access`, `channel_permission_overwrites`, `guild_member_roles` e `guilds.owner_id` (função `canUserAccessChannel` em `permission_helpers.go` e filtro `ChannelUsersProvider` no Hub WebSocket).
   - **DMs 1x1 e Grupos de DM:** verificação `(user1_id = $userID OR user2_id = $userID)` em `dm_rooms` e `EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)`.
   - **Dados de Usuário / E2EE:** escopo por `user_id` extraído exclusivamente do contexto autenticado (`auth.GetUserIDFromContext`).

2. **Categoria 2 — PERMISSÃO DEFINIDA NO NAVEGADOR (RBAC Cliente vs Servidor):**
   Cruzamento de todos os gates de permissão da interface React (`useGuildPermissions.ts`, bitmasks `PermAdministrator`, `PermManageGuild`, `PermManageChannels`, `PermManageRoles`, `PermKickMembers`, `PermBanMembers`, `PermMuteMembers`, `PermMoveMembers`, `PermManageMessages`, `PermManageEmojis`, `PermViewAuditLog` e hierarquia numérica de cargos `position`) contra as ações nas stores Zustand (`guildStore.ts`, `dmGroupStore.ts`) e os handlers equivalentes em `backend/internal/handlers/`.

3. **Categoria 3 — IDOR (Insecure Direct Object Reference / BOLA):**
   Inspeção sistemática de **todas** as rotas registradas em `backend/cmd/server/main.go` e eventos WebSocket em `backend/internal/gateway/client.go`, verificando se IDs recebidos via path (`{id}`, `{guildID}`, `{channelID}`, `{roleID}`, `{messageID}`, `{roomID}`, `{device_id}`, `{conversation_id}`), query string ou JSON body validam a pertinência hierárquica (ex.: se o `roleID` ou `categoryID` pertence à mesma `guildID` e se o `userID` autenticado detém acesso ao recurso).

4. **Categoria 4 — CHAVES EXPOSTAS (Hardcode, Defaults & Histórico Git):**
   Auditoria de variáveis de ambiente, funções `getEnv`/`mustGetEnv` em `main.go`, fallbacks em arquivos Docker Compose, chaves do LiveKit/Turnstile/Riot/Klipy/Resend, inspeção dos bundles JS compilados em `backend/web/assets/` e varredura completa do histórico de commits (`git log -p -S/-G`).

5. **Categoria 5 — INPUTS SEM TRATAMENTO (XSS, Injeção HTML, Uploads & Electron):**
   Varredura de `dangerouslySetInnerHTML`/`innerHTML`/`eval` no React, parser customizado de Markdown e links em `FormattedMessage.tsx`, embeds OpenGraph em `LinkEmbed.tsx`/`MessageEmbedCard.tsx`, templates HTML de e-mail em `backend/internal/email/email.go`, sniffing de MIME/extensões em `upload_handlers.go` e configurações de isolamento do Electron (`contextIsolation`, `nodeIntegration`, `will-navigate`, `setWindowOpenHandler`, `shell.openExternal`).

---

## 2. Resumo Executivo

Foram identificados **23 achados verificados** no código-fonte, além de **12 pontos fortes de segurança** confirmados.

### Total de Achados por Severidade

| Severidade | Cor de Referência | Quantidade | Percentual | Representação Visual |
| :--- | :---: | :---: | :---: | :--- |
| 🔴 **Crítica** | `#B91C1C` | **2** | 8,7% | `██░░░░░░░░░░░░░░░░░░` |
| 🟠 **Alta** | `#EA580C` | **8** | 34,8% | `███████░░░░░░░░░░░░░` |
| 🟡 **Média** | `#D97706` | **10** | 43,5% | `█████████░░░░░░░░░░░` |
| 🔵 **Baixa** | `#2563EB` | **3** | 13,0% | `███░░░░░░░░░░░░░░░░░` |
| **TOTAL DE ACHADOS** | — | **23** | **100%** | — |
| 🟢 **Pontos Fortes Verificados** | `#059669` | **12** | — | `████████████████████` |

### Distribuição de Achados por Categoria

| Categoria Auditada | Crítica (`#B91C1C`) | Alta (`#EA580C`) | Média (`#D97706`) | Baixa (`#2563EB`) | Total | Gráfico de Barras |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **1. Banco sem Tranca (Isolamento)** | 2 | 2 | 2 | 1 | **7** | `███████` (30,4%) |
| **2. Permissão no Navegador / RBAC** | 0 | 2 | 4 | 0 | **6** | `██████` (26,1%) |
| **3. IDOR / BOLA** | 0 | 3 | 2 | 1 | **6** | `██████` (26,1%) |
| **4. Chaves Expostas & Configs** | 0 | 1 | 1 | 0 | **2** | `██` (8,7%) |
| **5. Inputs sem Tratamento (XSS/Upload)** | 0 | 0 | 1 | 1 | **2** | `██` (8,7%) |
| **Total Geral** | **2** | **8** | **10** | **3** | **23** | **100%** |

---

## 3. Pontos Fortes (`#059669`) e Pontos Fracos Centrais

### 🟢 Pontos Fortes Verificados (Evidências de Cobertura)

1. **[🟢 `#059669`] Proteção Anti-CSRF Criptográfica com Separação de Domínio e Tempo Constante**
   - **Evidência:** [`backend/internal/middleware/csrf.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/middleware/csrf.go#L36-L189)
   - **Detalhes:** Deriva uma chave exclusiva via SHA-256 (`"zerovc-csrf-key-derivation-v1:" + jwtSecret`), vincula o token HMAC ao `userID` com nonce aleatório de 16 bytes e expiração, compara header `X-CSRF-Token` e cookie `zerovc_csrf` via `subtle.ConstantTimeCompare` e rejeita mutações sem tocar no banco de dados.

2. **[🟢 `#059669`] Isolamento Rigoroso de Canais Privados na Busca e Envio de Mensagens**
   - **Evidência:** [`backend/internal/handlers/message_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/message_handlers.go#L33-L74), linhas `163-214` e `1209-1252`
   - **Detalhes:** `MessageHandler.Send`, `List`, `ListPinned` e `Search` validam `canUserAccessChannel` e restringem resultados SQL e broadcasts WebSocket (`broadcastChannelEvent`) exclusivamente ao dono, administradores e membros com cargos em `channel_role_access`, respeitando overwrites de negação.

3. **[🟢 `#059669`] Prevenção de Escalação de Privilégios na Criação, Edição e Reordenação de Cargos**
   - **Evidência:** [`backend/internal/handlers/role_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/role_handlers.go#L116-L139), linhas `201-227` e `301-311`
   - **Detalhes:** Membros com `PermManageRoles` (mas sem `PermAdministrator`) são impedidos pelo servidor de conceder `PermAdministrator`, de conceder permissões que eles próprios não possuem (`req.Permissions & ^actorCtx.Perms != 0`) e de criar/mover cargos para posição numérica menor ou igual à sua (`<= actorCtx.MaxPos`).

4. **[🟢 `#059669`] Defesa Completa contra SSRF e DNS Rebinding no Link Preview**
   - **Evidência:** [`backend/internal/handlers/link_preview_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/link_preview_handlers.go#L48-L107) e linhas `343-396`
   - **Detalhes:** Implementa `DialContext` customizado que resolve DNS previamente, bloqueia IPs de loopback, RFC 1918, CGNAT, link-local (`169.254.169.254`), ULA IPv6 e multicast, conecta diretamente ao IP validado (eliminando janela de DNS Rebinding) e revalida redirecionamentos HTTP.

5. **[🟢 `#059669`] Isolamento Completo em Salas de DM 1x1 e Verificação Bidirecional de Bloqueio**
   - **Evidência:** [`backend/internal/handlers/dm_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/dm_handlers.go#L69-L74), linhas `145-149`, `239-244`, `436-440`, `505-510`, `791-796`, `1300-1306`, `1461-1465`
   - **Detalhes:** Todos os handlers de DM validam `(user1_id = $userID OR user2_id = $userID)`, checam bloqueios mútuos em `user_blocks` antes de enviar mensagens ou iniciar chamadas, e restringem edição/exclusão estritamente a `author_id == userID`.

6. **[🟢 `#059669`] Máquina de Estados E2EE Anti-Downgrade (Plaintext Gating)**
   - **Evidência:** [`backend/internal/handlers/dm_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/dm_handlers.go#L444-L459) e [`backend/internal/handlers/dm_group_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/dm_group_handlers.go#L728-L744)
   - **Detalhes:** Quando `e2ee_enabled = true` em uma conversa, o servidor rejeita qualquer tentativa de envio ou edição em texto puro (`e2ee_required`) e valida a época (`rotation_epoch`).

7. **[🟢 `#059669`] Operações Críticas de Servidor Protegidas por 2FA e Transações Atômicas**
   - **Evidência:** [`backend/internal/handlers/guild_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/guild_handlers.go#L968-L1024) (`Delete`) e linhas `1358-1441` (`TransferOwnership`)
   - **Detalhes:** Exclusão de servidor e transferência de propriedade exigem `userID == ownerID` e validação de código TOTP ou código de recuperação de uso único quando o 2FA está habilitado.

8. **[🟢 `#059669`] Transação Atômica com `FOR UPDATE` no Uso de Convites e Checagem de Banimento**
   - **Evidência:** [`backend/internal/handlers/invite_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/invite_handlers.go#L386-L465)
   - **Detalhes:** `JoinByInvite` utiliza lock pessimista `FOR UPDATE` na linha do convite para evitar condições de corrida em `max_uses`, verifica `guild_bans` antes da inserção e atribui o cargo `@everyone` dentro da mesma transação.

9. **[🟢 `#059669`] Isolamento Estrito na Exportação de Dados (LGPD/GDPR)**
   - **Evidência:** [`backend/internal/handlers/auth_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/auth_handlers.go#L1420-L1713)
   - **Detalhes:** `ExportData` filtra todas as tabelas exclusivamente pelo `userID` autenticado e mascara payloads cifrados com `[Mensagem Criptografada de Ponta a Ponta]`.

10. **[🟢 `#059669`] Hardening do Processo Electron e Isolamento de IPC**
    - **Evidência:** [`client/electron/main.ts`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/client/electron/main.ts#L318-L361), linhas `866-870`, `1568-1571` e [`client/electron/preload.ts`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/client/electron/preload.ts#L155)
    - **Detalhes:** `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, `ipcRenderer` encapsulado via `contextBridge`, bloqueio de navegação externa em `will-navigate` e `setWindowOpenHandler`, validação estrita de esquemas `http:`/`https:` antes de `shell.openExternal` e execução de binário nativo via `spawn` sem shell (`shell: false`).

11. **[🟢 `#059669`] Ausência de `eval` e Geração Segura de SVG Offline para QR Code**
    - **Evidência:** [`client/src/components/Modals/DeviceVerificationModal.tsx`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/client/src/components/Modals/DeviceVerificationModal.tsx#L230-L233) e [`client/src/crypto/verification.ts`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/client/src/crypto/verification.ts#L150-L311)
    - **Detalhes:** Nenhuma ocorrência de `eval` ou `new Function` em todo o frontend; o único `dangerouslySetInnerHTML` renderiza exclusivamente coordenadas inteiras de matriz QR geradas localmente.

12. **[🟢 `#059669`] Bundle Frontend e Workflows CI/CD Livres de Chaves Privadas**
    - **Evidência:** `backend/web/assets/*.js`, `.gitignore:20-25` e `.github/workflows/*.yml`
    - **Detalhes:** Nenhum segredo de backend (`JWT_SECRET`, `LIVEKIT_API_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `DATABASE_URL`) está presente no bundle compilado do cliente ou nos workflows do GitHub Actions.

---

### 🔴 Pontos Fracos Centrais (Resumo dos Riscos)

1. **Vazamento e Acesso Indevido a Canais Privados em Fluxos Secundários:** Embora `MessageHandler` proteja canais privados (`is_private = true`), handlers adjacentes (`CommandHandler.ExecuteGuildCommand`, `GuildHandler.List`, `GuildHandler.GetGuildVoiceStates` e `E2EEHandler.GetMyRoomKeys`/`GetConversationRoomKeys`) verificam apenas se o usuário está em `guild_members`, ignorando `is_private` e `channel_role_access`.
2. **Falta de Autorização em Endpoints de Metadados e Filas E2EE:** `GetLatestRoster` e `DownloadAttachment` não validam se o usuário autenticado faz parte da conversa, e `SendToDevice` aceita `SenderDeviceID` arbitrário no payload sem validar posse.
3. **Revogação de Sessões Sem Efeito no Middleware JWT:** A revogação apaga registros em `user_sessions`, mas `auth.Middleware` valida apenas a assinatura criptográfica do JWT stateless (válido por 30 dias).
4. **Bypasses Pontuais de RBAC e CAPTCHA:** `AdminUpdateVoiceState` pula a checagem de permissões quando `adminID == targetUserID`; `UpdatePermissionOverwrite` não limpa o bit `PermAdministrator` nem valida `roleID` contra a guilda; e o login permite pular a verificação do Cloudflare Turnstile enviando `code` preenchido com `turnstile_token` vazio.

---

## 4. Tabela Consolidada de Achados por Categoria

| ID | Categoria | Severidade | Arquivo:Linha | Descrição Resumida |
| :--- | :--- | :---: | :--- | :--- |
| **ACHADO-01** | 1. Banco sem Tranca | 🔴 **Crítica** (`#B91C1C`) | `backend/internal/handlers/command_handlers.go:1058-1085` | `ExecuteGuildCommand` não chama `canUserAccessChannel`, permitindo executar comandos e gravar mensagens em canais privados restritos. |
| **ACHADO-02** | 1. Banco sem Tranca | 🔴 **Crítica** (`#B91C1C`) | `backend/internal/handlers/command_handlers.go:1126-1135` | `if !isPrivate` e `else` ambos chamam `BroadcastToGuild`, transmitindo respostas de comandos de canais privados para todos os membros do servidor. |
| **ACHADO-03** | 1. Banco sem Tranca | 🟠 **Alta** (`#EA580C`) | `backend/internal/handlers/guild_handlers.go:191-210` | `GuildHandler.List` retorna todos os canais (`WHERE guild_id = ANY($1)`) sem filtrar canais privados (`is_private`), expondo nomes e tópicos secretos. |
| **ACHADO-04** | 1. Banco sem Tranca | 🟠 **Alta** (`#EA580C`) | `backend/internal/handlers/e2ee_handlers.go:1800-1805, 1878-1884` | `GetMyRoomKeys` e `GetConversationRoomKeys` verificam apenas `guild_members` para canais, expondo chaves E2EE de canais privados a membros sem acesso. |
| **ACHADO-11** | 1. Banco sem Tranca | 🟡 **Média** (`#D97706`) | `backend/internal/handlers/guild_handlers.go:1813-1824` | `GetGuildVoiceStates` lista participantes em chamadas de voz de todos os canais da guilda sem filtrar canais de voz privados. |
| **ACHADO-12** | 1. Banco sem Tranca | 🟡 **Média** (`#D97706`) | `backend/internal/handlers/e2ee_handlers.go:1131-1146` | `SubmitRoster` faz `BroadcastGlobal` do evento `E2EE_ROSTER_UPDATE`, expondo `conversation_id` e época de DMs/grupos privados a todos os usuários online. |
| **ACHADO-21** | 1. Banco sem Tranca | 🔵 **Baixa** (`#2563EB`) | `backend/internal/handlers/guild_handlers.go:600, 685` e `user_handlers.go:471-483` | `KickMember`/`BanMember` deletam `voice_sessions` globalmente (derrubando call em outra guilda) e `GetUserProfile` revela `joined_at` de qualquer `guild_id`. |
| **ACHADO-05** | 2. Permissão / RBAC | 🟠 **Alta** (`#EA580C`) | `backend/internal/handlers/channel_handlers.go:843-882` | `AdminUpdateVoiceState` ignora checagem de permissões quando `adminID == targetUserID`, permitindo remover server-mute próprio ou mover-se entre canais. |
| **ACHADO-07** | 2. Permissão / RBAC | 🟠 **Alta** (`#EA580C`) | `backend/internal/auth/auth.go:79-118` e `auth_handlers.go:1158-1191` | Tokens JWT de sessões revogadas em `user_sessions` ou pós-logout continuam aceitos por até 30 dias no `auth.Middleware` stateless. |
| **ACHADO-13** | 2. Permissão / RBAC | 🟡 **Média** (`#D97706`) | `backend/internal/handlers/message_handlers.go:412-430` | `MessageHandler.Update` verifica apenas `author_id`, permitindo que usuários expulsos/banidos ou removidos de canal privado editem mensagens antigas. |
| **ACHADO-14** | 2. Permissão / RBAC | 🟡 **Média** (`#D97706`) | `backend/internal/handlers/dm_group_handlers.go:952-966` e `e2ee_handlers.go:1513-1526` | `DMGroupHandler.EnableE2EE` lê `owner_id` mas não valida se o chamador é dono; `SubmitKeyRequest` lê `is_private` mas não valida `canUserAccessChannel`. |
| **ACHADO-15** | 2. Permissão / RBAC | 🟡 **Média** (`#D97706`) | `backend/internal/handlers/role_handlers.go:228-244` | `RoleHandler.Update` permite renomear o cargo `@everyone`, corrompendo as queries de hierarquia e permissão baseadas em `name != '@everyone'`. |
| **ACHADO-16** | 2. Permissão / RBAC | 🟡 **Média** (`#D97706`) | `client/src/components/Modals/ChannelSettingsModal.tsx:288-342` e `MessageItem.tsx:220-223, 331-334` | `ChannelSettingsModal` não valida `canManageChannels` internamente; `MessageItem` exibe "Fixar" para todos e oculta "Excluir" de moderadores com `MANAGE_MESSAGES`. |
| **ACHADO-06** | 3. IDOR / BOLA | 🟠 **Alta** (`#EA580C`) | `backend/internal/handlers/channel_handlers.go:1027-1076` | `UpdatePermissionOverwrite` não valida se `roleID` pertence à guilda do canal, não filtra `PermAdministrator` em `Allow` e não valida hierarquia. |
| **ACHADO-08** | 3. IDOR / BOLA | 🟠 **Alta** (`#EA580C`) | `backend/internal/handlers/e2ee_handlers.go:1160-1180` | `GetLatestRoster` retorna o roster E2EE completo (membros, dispositivos e chaves públicas) de qualquer `conversation_id` sem verificar participação. |
| **ACHADO-09** | 3. IDOR / BOLA | 🟠 **Alta** (`#EA580C`) | `backend/internal/handlers/e2ee_handlers.go:717-728` | `SendToDevice` aceita `m.SenderDeviceID` arbitrário sem validar se o dispositivo pertence ao `userID` autenticado (device spoofing). |
| **ACHADO-17** | 3. IDOR / BOLA | 🟡 **Média** (`#D97706`) | `backend/internal/handlers/e2ee_handlers.go:1439-1467` | `DownloadAttachment` serve qualquer arquivo `uploads/e2ee_attachments/{id}.bin` sem verificar vínculo do usuário com o anexo/conversa. |
| **ACHADO-18** | 3. IDOR / BOLA | 🟡 **Média** (`#D97706`) | `guild_handlers.go:910-923`, `channel_handlers.go:195-200, 483-487`, `role_handlers.go:470-498` | Ausência de validação de pertinência à guilda em `SystemChannelID` (`UpdateGuild`), `CategoryID` (`Reorder`), `RoleIDs` (`CreateChannel`) e `targetUserID` (`AssignRole`). |
| **ACHADO-22** | 3. IDOR / BOLA | 🔵 **Baixa** (`#2563EB`) | `backend/internal/handlers/message_handlers.go:1345-1364` e `gateway/client.go:127-143` | `AckChannel` não valida se `MessageID` pertence ao `channelID`; evento WS `TYPING_START` aceita `RecipientID`/`UserIDs` arbitrários sem checar DM/bloqueio. |
| **ACHADO-10** | 4. Chaves & Configs | 🟠 **Alta** (`#EA580C`) | `auth_handlers.go:128-143, 705-711`, `main.go:43-58`, `docker-compose.dev.yml:7-12` | Bypass de Turnstile no login enviando `code` não-vazio; `mustGetEnv` não rejeita placeholders/segredos curtos; senha hardcoded e porta `5432` aberta no `docker-compose.dev.yml`. |
| **ACHADO-19** | 4. Chaves & Configs | 🟡 **Média** (`#D97706`) | `deploy/livekit.yaml` (commits `8839eea`, `3e7adbe`) e `deploy/docker-compose.coolify.yml:4-10` | IP real da VPS (`192.0.2.1`) e segredos default antigos registrados no histórico Git; `docker-compose.coolify.yml` omite injeção de `LIVEKIT_KEYS`. |
| **ACHADO-20** | 5. XSS & Uploads | 🟡 **Média** (`#D97706`) | `email.go:241-270`, `upload_handlers.go:181-192`, `FormattedMessage.tsx:762-774` | `SendEmailChangedNotice` interpola `newEmail` sem `html.EscapeString`; condição `!imageOnly` invertida no sniff de HTML/SVG; links Markdown aceitam `data:`/`blob:` com `download`. |
| **ACHADO-23** | 5. XSS & Uploads | 🔵 **Baixa** (`#2563EB`) | `backend/internal/handlers/upload_handlers.go:227-244` | `getPublicBaseURL` confia diretamente em `r.Host` e `X-Forwarded-Proto` quando `CDN_BASE_URL` não está definido (Host Header Injection na URL do asset). |

---

## 5. Detalhamento Técnico dos Achados (Arquivo por Arquivo, Linha por Linha)

---

### Categoria 1: BANCO SEM TRANCA (Isolamento de Inquilino, Canal e Usuário)

#### [ACHADO-01] 🔴 Crítica (`#B91C1C`) — Execução de Comandos de Bot em Canais Privados sem Verificação de Acesso
- **Arquivo:** [`backend/internal/handlers/command_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/command_handlers.go#L1058-L1085)
- **Linhas Exatas:** `1058–1085`
- **Trecho de Código:**
```go
1058: 	// Verify channel and get guild
1059: 	var guildID uuid.UUID
1060: 	var isPrivate bool
1061: 	err = h.db.Pool.QueryRow(ctx, "SELECT guild_id, is_private FROM channels WHERE id = $1", channelID).Scan(&guildID, &isPrivate)
1062: 	if err != nil {
1063: 		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
1064: 		return
1065: 	}
1066: 
1067: 	// Verify user is member of guild
1068: 	var isMember bool
1069: 	err = h.db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)", guildID, userID).Scan(&isMember)
1070: 	if err != nil || !isMember {
1071: 		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
1072: 		return
1073: 	}
1074: 
1075: 	// Verify command permissions in this channel
1076: 	canUse, err := canUserUseCommands(ctx, h.db, guildID, channelID, userID)
```
- **Por que é explorável:** O handler `ExecuteGuildCommand` (`POST /api/channels/{id}/bot/command`) lê `isPrivate` na linha 1061, mas **nunca invoca `canUserAccessChannel(ctx, h.db, guildID, channelID, userID)`** nem verifica `canUserSendMessages`. Como `canUserUseCommands` retorna `true` por padrão quando não há overwrite explícito negando `PermUseCommands`, qualquer membro comum do servidor pode disparar comandos de bot (`/tts`, `/server`, `/user`, `/league`) para dentro de canais privados de administração/staff aos quais não possui acesso, injetando mensagens na tabela `messages` daquele canal e recebendo o objeto da mensagem criada na resposta HTTP.

---

#### [ACHADO-02] 🔴 Crítica (`#B91C1C`) — Vazamento Global de Mensagens de Comandos em Canais Privados via WebSocket
- **Arquivo:** [`backend/internal/handlers/command_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/command_handlers.go#L1126-L1135)
- **Linhas Exatas:** `1126–1135`
- **Trecho de Código:**
```go
1126: 	// Broadcast WS event
1127: 	wsEvent := models.WSEvent{
1128: 		Type: models.EventMessageCreate,
1129: 		Data: msg,
1130: 	}
1131: 	if !isPrivate {
1132: 		h.hub.BroadcastToGuild(guildID, wsEvent)
1133: 	} else {
1134: 		h.hub.BroadcastToGuild(guildID, wsEvent)
1135: 	}
```
- **Por que é explorável:** Tanto o ramo `if !isPrivate` quanto o ramo `else` executam `h.hub.BroadcastToGuild(guildID, wsEvent)`. Sempre que um administrador ou membro autorizado executa um comando em um canal privado (`is_private = true`), o evento `MESSAGE_CREATE` contendo a resposta completa, embeds e metadados do canal privado é transmitido via WebSocket para **todos os membros do servidor**, quebrando o isolamento do canal privado em tempo real.

---

#### [ACHADO-03] 🟠 Alta (`#EA580C`) — Vazamento de Metadados de Canais Privados na Listagem de Servidores (`GuildHandler.List`)
- **Arquivo:** [`backend/internal/handlers/guild_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/guild_handlers.go#L191-L210)
- **Linhas Exatas:** `191–210`
- **Trecho de Código:**
```go
191: 		chanQuery := `
192: 			SELECT id, guild_id, name, type, position, is_private, category_id, topic, created_at
193: 			FROM channels
194: 			WHERE guild_id = ANY($1)
195: 			ORDER BY position ASC, created_at ASC
196: 		`
197: 		chanRows, err := h.db.Pool.Query(r.Context(), chanQuery, guildIDs)
198: 		if err == nil {
199: 			defer chanRows.Close()
200: 			for chanRows.Next() {
201: 				var ch models.Channel
202: 				if err := chanRows.Scan(
203: 					&ch.ID, &ch.GuildID, &ch.Name, &ch.Type, &ch.Position, &ch.IsPrivate, &ch.CategoryID, &ch.Topic, &ch.CreatedAt,
204: 				); err == nil {
205: 					if idx, ok := guildIndexMap[ch.GuildID]; ok {
206: 						guilds[idx].Channels = append(guilds[idx].Channels, ch)
207: 					}
208: 				}
209: 			}
210: 		}
```
- **Por que é explorável:** Enquanto `GuildHandler.GetDetails` (`GET /api/guilds/{id}`) filtra canais privados verificando os cargos do usuário e `channel_role_access`, o endpoint `GuildHandler.List` (`GET /api/guilds`) retorna todos os canais de todas as guildas do usuário sem qualquer filtro de acesso. Qualquer membro sem privilégios pode inspecionar o JSON retornado por `GET /api/guilds` para descobrir os IDs, nomes, tópicos (`topic`) e categorias de todos os canais privados do servidor.

---

#### [ACHADO-04] 🟠 Alta (`#EA580C`) — Quebra de Isolamento de Canais Privados em Chaves de Sala E2EE (`GetMyRoomKeys` e `GetConversationRoomKeys`)
- **Arquivo:** [`backend/internal/handlers/e2ee_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/e2ee_handlers.go#L1800-L1805) e linhas `1878–1884`
- **Linhas Exatas:** `1800–1805` e `1878–1884`
- **Trecho de Código:**
```go
1800: 		) OR (
1801: 			rk.conversation_type = 'channel' AND rk.conversation_id IN (
1802: 				SELECT c.id FROM channels c
1803: 				INNER JOIN guild_members gm ON gm.guild_id = c.guild_id
1804: 				WHERE gm.user_id = $1
1805: 			)
1806: 		)
```
```go
1878: 			UNION ALL
1879: 			SELECT 1 FROM channels c INNER JOIN guild_members gm ON gm.guild_id = c.guild_id WHERE c.id = $1 AND gm.user_id = $2
```
- **Por que é explorável:** Nas rotas `GET /api/e2ee/my-room-keys` e `GET /api/e2ee/conversations/{conversation_id}/keys`, a verificação de acesso para conversas do tipo `'channel'` checa apenas se o usuário pertence à tabela `guild_members` daquele servidor, sem verificar se o canal é privado (`c.is_private`) ou se o usuário possui acesso via `canUserAccessChannel`.

---

#### [ACHADO-11] 🟡 Média (`#D97706`) — Exposição de Sessões de Voz em Canais Privados (`GetGuildVoiceStates`)
- **Arquivo:** [`backend/internal/handlers/guild_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/guild_handlers.go#L1813-L1824)
- **Linhas Exatas:** `1813–1824`
- **Trecho de Código:**
```go
1815: 	vQuery := `
1816: 		SELECT vs.id, vs.channel_id, vs.user_id, vs.is_muted, vs.is_deafened, vs.is_screensharing, vs.joined_at,
1817: 		       u.username, COALESCE(u.display_name, ''), COALESCE(u.avatar_url, ''), COALESCE(u.banner_url, ''), COALESCE(u.bio, ''), COALESCE(u.status, 'offline'), COALESCE(u.custom_status, '')
1818: 		FROM voice_sessions vs
1819: 		INNER JOIN channels c ON c.id = vs.channel_id
1820: 		INNER JOIN users u ON u.id = vs.user_id
1821: 		WHERE c.guild_id = $1
1822: 		ORDER BY vs.joined_at ASC
1823: 	`
```
- **Por que é explorável:** O endpoint `GET /api/guilds/{id}/voice-states` retorna todos os participantes ativos em canais de voz da guilda sem filtrar canais privados aos quais o chamador não tem acesso, revelando quem está reunido em salas de voz restritas e se está compartilhando tela.

---

#### [ACHADO-12] 🟡 Média (`#D97706`) — Broadcast Global de Atualizações de Roster E2EE (`SubmitRoster`)
- **Arquivo:** [`backend/internal/handlers/e2ee_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/e2ee_handlers.go#L1131-L1146)
- **Linhas Exatas:** `1131–1146`
- **Trecho de Código:**
```go
1131: 	// 6. Broadcast E2EE_ROSTER_UPDATE event
1132: 	rosterEvent := models.WSEvent{
1133: 		Type: models.EventE2EERosterUpdate,
1134: 		Data: map[string]any{
1135: 			"conversation_type": req.ConversationType,
1136: 			"conversation_id":   req.ConversationID,
1137: 			"version":           req.Version,
1138: 			"epoch":             req.Epoch,
1139: 			"audience_hash":     req.AudienceHash,
1140: 			"created_at":        createdAt,
1141: 		},
1142: 	}
1143: 	if h.hub != nil {
1144: 		h.hub.BroadcastGlobal(rosterEvent)
1145: 	}
```
- **Por que é explorável:** Em vez de enviar o evento `E2EE_ROSTER_UPDATE` apenas para os membros da conversa (`BroadcastToUsers`), o código utiliza `BroadcastGlobal`, enviando metadados de mudanças de chaves/épocas de DMs 1x1 e grupos privados para todos os usuários conectados ao WebSocket no servidor.

---

#### [ACHADO-21] 🔵 Baixa (`#2563EB`) — Remoção Global de Sessão de Voz Cross-Guild em Kick/Ban e Exposição de `joined_at` em `GetUserProfile`
- **Arquivos:** [`backend/internal/handlers/guild_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/guild_handlers.go#L600) (linhas `600` e `685`) e [`backend/internal/handlers/user_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/user_handlers.go#L471-L483) (linhas `471–483`)
- **Trecho de Código (`guild_handlers.go`):**
```go
600: 	if _, err := tx.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", targetUserID); err != nil {
...
685: 	if _, err := tx.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", req.UserID); err != nil {
```
- **Trecho de Código (`user_handlers.go`):**
```go
471: 	guildIDStr := r.URL.Query().Get("guild_id")
472: 	if guildIDStr != "" {
473: 		if gID, err := uuid.Parse(guildIDStr); err == nil {
474: 			var ja time.Time
475: 			errJoin := h.db.Pool.QueryRow(r.Context(), `
476: 				SELECT joined_at FROM guild_members WHERE guild_id = $1 AND user_id = $2
477: 			`, gID, targetID).Scan(&ja)
```
- **Por que é explorável:** Em `KickMember` e `BanMember`, o `DELETE FROM voice_sessions` não filtra pelos canais da guilda (`AND channel_id IN (SELECT id FROM channels WHERE guild_id = $2)`), derrubando a sessão de voz do usuário caso ele esteja conectado em outro servidor. Em `GetUserProfile`, qualquer usuário autenticado pode informar `?guild_id=<UUID>` de um servidor do qual não faz parte para descobrir se `targetID` é membro daquele servidor e sua data de entrada (`joined_at`).

---

### Categoria 2: PERMISSÃO DEFINIDA NO NAVEGADOR (RBAC Cliente vs Servidor)

#### [ACHADO-05] 🟠 Alta (`#EA580C`) — Bypass de RBAC em `AdminUpdateVoiceState` via Auto-Alvo (`adminID == targetUserID`)
- **Arquivo:** [`backend/internal/handlers/channel_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/channel_handlers.go#L843-L882)
- **Linhas Exatas:** `843–882`
- **Trecho de Código:**
```go
843: 	isOwner := adminID == ownerID
844: 	if !isOwner && adminID != targetUserID {
845: 		if targetUserID == ownerID {
846: 			http.Error(w, `{"error":"forbidden: não é possível moderar o dono do servidor"}`, http.StatusForbidden)
847: 			return
848: 		}
849: 
850: 		actorCtx, err := loadActorGuildContext(r.Context(), h.db, guildID, adminID)
...
856: 		if req.TargetChannelID != nil {
857: 			hasMovePerm := actorCtx.HasAdmin || (actorCtx.Perms&models.PermMoveMembers) != 0
858: 			if !hasMovePerm {
859: 				http.Error(w, `{"error":"forbidden: você não tem permissão para mover membros"}`, http.StatusForbidden)
860: 				return
861: 			}
862: 		} else {
863: 			hasVoicePerm := actorCtx.HasAdmin || (actorCtx.Perms&models.PermMuteVoice) != 0 || (actorCtx.Perms&models.PermMuteMembers) != 0 || (actorCtx.Perms&models.PermDeafenVoice) != 0
...
882: 	}
```
- **Por que é explorável:** A rota administrativa `POST /api/channels/{channelID}/members/{userID}/voice-state` (`AdminUpdateVoiceState`) só executa o bloco de verificação de permissões (`PermMoveMembers`, `PermMuteVoice`, `PermDeafenVoice`) se `adminID != targetUserID`. Enquanto o menu de contexto do frontend (`useUserContextMenu.tsx`) esconde as ações de moderação de voz para usuários sem permissão, qualquer membro comum pode chamar diretamente a rota passando seu próprio `userID` para:
  1. Remover um silenciamento/ensurdecimento forçado aplicado por um moderador (`is_muted: false, is_deafened: false`, que emite evento com `"forced": true`).
  2. Mover sua própria sessão para qualquer outro canal de voz do servidor (`target_channel_id`), inclusive canais privados onde não possui `PermConnectVoice`.

---

#### [ACHADO-07] 🟠 Alta (`#EA580C`) — Revogação de Sessões sem Efeito nas Rotas Protegidas (JWT Stateless sem Checagem de Sessão Ativa)
- **Arquivos:** [`backend/internal/auth/auth.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/auth/auth.go#L79-L118) e [`backend/internal/handlers/auth_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/auth_handlers.go#L1158-L1191)
- **Linhas Exatas:** `auth.go:79–118` e `auth_handlers.go:1158–1191`
- **Trecho de Código (`auth.go`):**
```go
79: func (s *Service) Middleware(next http.Handler) http.Handler {
80: 	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
...
109: 		claims, err := s.ValidateToken(tokenString)
110: 		if err != nil {
111: 			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
112: 			return
113: 		}
114: 
115: 		ctx := context.WithValue(r.Context(), UserContextKey, claims.UserID)
116: 		next.ServeHTTP(w, r.WithContext(ctx))
117: 	})
118: }
```
- **Por que é explorável:** Na UI (`SessionsSettingsView.tsx`), o usuário visualiza e revoga sessões ativas (`POST /api/auth/sessions/{id}/revoke`, `revoke-others`, `logout`, `change-password`), o que deleta os registros correspondentes da tabela `user_sessions`. Contudo, o `auth.Middleware` verifica apenas a assinatura e data de expiração do JWT (que dura **30 dias**, linha 44 de `auth.go`), nunca consultando `user_sessions` (via hash SHA-256 do token). Assim, um token roubado continua válido por até 30 dias mesmo após ser revogado pelo usuário.

---

#### [ACHADO-13] 🟡 Média (`#D97706`) — Edição de Mensagens (`MessageHandler.Update`) Não Valida Permanência no Servidor ou Acesso ao Canal
- **Arquivo:** [`backend/internal/handlers/message_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/message_handlers.go#L412-L430)
- **Linhas Exatas:** `412–430`
- **Trecho de Código:**
```go
416: 	checkQuery := `
417: 		SELECT m.channel_id, c.guild_id, c.is_private, COALESCE(m.encrypted, false), COALESCE(c.e2ee_enabled, false)
418: 		FROM messages m
419: 		JOIN channels c ON c.id = m.channel_id
420: 		WHERE m.id = $1 AND (m.author_id = $2 OR m.invoker_id = $2)
421: 	`
422: 	err = h.db.Pool.QueryRow(r.Context(), checkQuery, messageID, userID).Scan(&channelID, &guildID, &isPrivate, &isEncrypted, &e2eeEnabled)
```
- **Por que é explorável:** Diferente de `MessageHandler.Delete` (linhas 505–510) e `MessageHandler.Send` (linhas 163–179), `MessageHandler.Update` não verifica se `userID` ainda está em `guild_members` nem se ainda possui acesso ao canal (`canUserAccessChannel`). Um usuário que foi banido/expulso de um servidor ou perdeu o cargo de acesso a um canal privado pode continuar editando suas mensagens antigas naquele servidor via API.

---

#### [ACHADO-14] 🟡 Média (`#D97706`) — Falta de Checagem de `owner_id` em `DMGroupHandler.EnableE2EE` e de `canUserAccessChannel` em `SubmitKeyRequest`
- **Arquivos:** [`backend/internal/handlers/dm_group_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/dm_group_handlers.go#L952-L966) e [`backend/internal/handlers/e2ee_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/e2ee_handlers.go#L1513-L1526)
- **Linhas Exatas:** `dm_group_handlers.go:952–966` e `e2ee_handlers.go:1513–1526`
- **Trecho de Código (`dm_group_handlers.go`):**
```go
952: 	var ownerID uuid.UUID
953: 	var currentE2EE bool
954: 	var currentEpoch int
955: 	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id, COALESCE(e2ee_enabled, false), COALESCE(rotation_epoch, 1) FROM dm_groups WHERE id = $1", groupID).Scan(&ownerID, &currentE2EE, &currentEpoch)
...
961: 	var isMember bool
962: 	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
```
- **Trecho de Código (`e2ee_handlers.go`):**
```go
1513: 	case models.ConversationTypeChannel:
1514: 		var guildID uuid.UUID
1515: 		var isPrivate bool
1516: 		err := h.db.Pool.QueryRow(r.Context(), "SELECT guild_id, is_private FROM channels WHERE id = $1", req.ConversationID).Scan(&guildID, &isPrivate)
```
- **Por que é explorável:** Em `DMGroupHandler.EnableE2EE`, `ownerID` é carregado do banco mas nunca comparado com `userID`, permitindo que qualquer membro ative irreversivelmente o E2EE no grupo. Em `SubmitKeyRequest`, `isPrivate` é lido na linha 1516 mas nunca verificado com `canUserAccessChannel`, permitindo que membros sem acesso ao canal privado disparem pacotes `key_request` para os dispositivos dos membros do servidor.

---

#### [ACHADO-15] 🟡 Média (`#D97706`) — `RoleHandler.Update` Permite Renomear o Cargo Base `@everyone`
- **Arquivo:** [`backend/internal/handlers/role_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/role_handlers.go#L228-L244)
- **Linhas Exatas:** `228–244`
- **Trecho de Código:**
```go
230: 	query := `
231: 		UPDATE guild_roles
232: 		SET name = COALESCE($1, name),
233: 		    color = COALESCE($2, color),
234: 		    position = COALESCE($3, position),
235: 		    permissions = COALESCE($4, permissions),
236: 		    hoist = COALESCE($5, hoist),
237: 		    mentionable = COALESCE($6, mentionable)
238: 		WHERE id = $7
```
- **Por que é explorável:** Na UI (`RolesTab.tsx`), o nome do cargo `@everyone` não é editável, e no backend `Delete` (linha 382) e `RemoveRole` (linha 574) protegem `@everyone` pelo nome. Porém, `RoleHandler.Update` não impede que `req.Name` altere o nome de `@everyone` nem bloqueia a mudança de sua `position`. Como `permission_helpers.go` (linhas 47 e 103) e `invite_handlers.go` (linha 440) identificam o cargo base via `name = '@everyone'` / `name != '@everyone'`, renomeá-lo via API corrompe o cálculo de hierarquia de todo o servidor.

---

#### [ACHADO-16] 🟡 Média (`#D97706`) — Divergências de Gating de Permissão na Interface (`ChannelSettingsModal.tsx` e `MessageItem.tsx`)
- **Arquivos:** [`client/src/components/Modals/ChannelSettingsModal.tsx`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/client/src/components/Modals/ChannelSettingsModal.tsx#L288-L342) e [`client/src/components/Chat/MessageItem.tsx`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/client/src/components/Chat/MessageItem.tsx#L220-L223) (linhas `220–223` e `331–334`)
- **Trecho de Código (`MessageItem.tsx`):**
```tsx
220:   const isAuthor = user?.id === message.author_id;
221:   const isOwner = contextType === 'channel' && activeGuild ? activeGuild.owner_id === user?.id : false;
222:   const canDelete = isAuthor || isOwner;
...
330:       {
331:         label: message.is_pinned ? 'Desafixar Mensagem' : 'Fixar Mensagem',
332:         icon: <Pin className="w-4 h-4" />,
333:         onClick: () => handleActionTogglePin(message.id),
334:       },
```
- **Por que é explorável / problemático:**
  1. Em `MessageItem.tsx:222`, `canDelete` verifica apenas `isAuthor || isOwner`, ignorando moderadores com `PermAdministrator` ou `PermManageMessages` (embora o backend `MessageHandler.Delete` suporte `canUserManageMessages` na linha 499).
  2. Em `MessageItem.tsx:331-334`, a opção "Fixar/Desafixar Mensagem" aparece para qualquer usuário sem checar `canManageMessages` em canais de servidor, e a rota `POST /api/channels/{channelID}/messages/{messageID}/pin` sequer está registrada em `main.go` (apenas para DMs e Grupos de DM).
  3. Em `ChannelSettingsModal.tsx`, o componente não valida `useGuildPermissions` internamente como defesa em profundidade.

---

### Categoria 3: IDOR (Insecure Direct Object Reference / BOLA)

#### [ACHADO-06] 🟠 Alta (`#EA580C`) — IDOR de Cargo e Concessão de `PermAdministrator` em `UpdatePermissionOverwrite`
- **Arquivo:** [`backend/internal/handlers/channel_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/channel_handlers.go#L1027-L1076)
- **Linhas Exatas:** `1027–1076`
- **Trecho de Código:**
```go
1027: 	roleIDStr := chi.URLParam(r, "roleID")
1028: 	roleID, err := uuid.Parse(roleIDStr)
...
1067: 		query := `
1068: 			INSERT INTO channel_permission_overwrites (channel_id, role_id, allow, deny)
1069: 			VALUES ($1, $2, $3, $4)
1070: 			ON CONFLICT (channel_id, role_id)
1071: 			DO UPDATE SET allow = EXCLUDED.allow, deny = EXCLUDED.deny
1072: 		`
1073: 		_, err = h.db.Pool.Exec(r.Context(), query, channelID, roleID, req.Allow, req.Deny)
```
- **Por que é explorável:** Na rota `PUT /api/channels/{id}/permissions/{roleID}`:
  1. Ao contrário de `ChannelHandler.Update` (linhas 313 e 330), `UpdatePermissionOverwrite` **não verifica** se `roleID` pertence à mesma `guildID` do canal (`SELECT EXISTS(SELECT 1 FROM guild_roles WHERE id = $1 AND guild_id = $2)`).
  2. **Não remove** o bit `PermAdministrator` de `req.Allow` (`req.Allow & ^models.PermAdministrator`) nem impede que um usuário com `PermManageChannels` conceda permissões que ele próprio não possui.

---

#### [ACHADO-08] 🟠 Alta (`#EA580C`) — IDOR / BOLA na Leitura de Rosters Assinados E2EE (`GetLatestRoster`)
- **Arquivo:** [`backend/internal/handlers/e2ee_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/e2ee_handlers.go#L1160-L1180)
- **Linhas Exatas:** `1160–1180`
- **Trecho de Código:**
```go
1160: func (h *E2EEHandler) GetLatestRoster(w http.ResponseWriter, r *http.Request) {
1161: 	convIDStr := chi.URLParam(r, "conversation_id")
1162: 	convID, err := uuid.Parse(convIDStr)
1163: 	if err != nil {
1164: 		http.Error(w, `{"error":"invalid_conversation_id"}`, http.StatusBadRequest)
1165: 		return
1166: 	}
1167: 
1168: 	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
1169: 	defer cancel()
1170: 
1171: 	var roster models.E2EERoster
1172: 	err = h.db.Pool.QueryRow(ctx, `
1173: 		SELECT conversation_type, conversation_id, version, epoch,
1174: 		       members, devices, signer_user_id, signer_device_id,
1175: 		       prev_roster_hash, audience_hash, signature, created_at
1176: 		FROM e2ee_rosters
1177: 		WHERE conversation_id = $1
1178: 		ORDER BY version DESC
1179: 		LIMIT 1
1180: 	`, convID).Scan(
```
- **Por que é explorável:** O endpoint `GET /api/e2ee/rosters/{conversation_id}` sequer lê o `userID` do contexto (`auth.GetUserIDFromContext`) e não verifica se o requisitante faz parte da DM, grupo de DM ou canal representado por `conversation_id`. Qualquer usuário autenticado (especialmente combinado com o `BroadcastGlobal` do ACHADO-12 que divulga `conversation_id`) pode consultar `GetLatestRoster` e obter a lista completa de participantes (`members`), todos os seus dispositivos (`devices`) e chaves públicas criptográficas de qualquer conversa privada da plataforma.

---

#### [ACHADO-09] 🟠 Alta (`#EA580C`) — Falsificação de Dispositivo Remetente (`SenderDeviceID` Spoofing) em `SendToDevice`
- **Arquivo:** [`backend/internal/handlers/e2ee_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/e2ee_handlers.go#L717-L728)
- **Linhas Exatas:** `717–728`
- **Trecho de Código:**
```go
717: 		senderID := defaultSenderDeviceID
718: 		if m.SenderDeviceID != nil && *m.SenderDeviceID != uuid.Nil {
719: 			senderID = *m.SenderDeviceID
720: 		}
721: 
722: 		var msgID uuid.UUID
723: 		var createdAt time.Time
724: 		err = h.db.Pool.QueryRow(ctx, `
725: 			INSERT INTO e2ee_to_device (recipient_device_id, sender_device_id, msg_type, payload, created_at)
726: 			VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
727: 			RETURNING id, created_at
728: 		`, m.RecipientDeviceID, senderID, m.MsgType, m.Payload).Scan(&msgID, &createdAt)
```
- **Por que é explorável:** Na rota `POST /api/e2ee/to-device`, quando o item da lista `messages` inclui `sender_device_id`, o servidor sobrescreve `senderID = *m.SenderDeviceID` sem verificar no banco (`SELECT EXISTS(SELECT 1 FROM e2ee_devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL)`) se aquele `sender_device_id` pertence ao `userID` autenticado. Isso permite a um atacante enfileirar mensagens `to-device` falsificando o `sender_device_id` de outro usuário ou dispositivo legítimo.

---

#### [ACHADO-17] 🟡 Média (`#D97706`) — Download de Anexos Criptografados sem Verificação de Vínculo (`DownloadAttachment`)
- **Arquivo:** [`backend/internal/handlers/e2ee_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/e2ee_handlers.go#L1439-L1467)
- **Linhas Exatas:** `1439–1467`
- **Trecho de Código:**
```go
1439: func (h *E2EEHandler) DownloadAttachment(w http.ResponseWriter, r *http.Request) {
1440: 	_, ok := auth.GetUserIDFromContext(r.Context())
1441: 	if !ok {
1442: 		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
1443: 		return
1444: 	}
...
1453: 	uploadDir := filepath.Join("uploads", "e2ee_attachments")
1454: 	filePath := filepath.Join(uploadDir, attachmentID.String()+".bin")
...
1466: 	http.ServeFile(w, r, filePath)
1467: }
```
- **Por que é explorável:** Embora o conteúdo esteja cifrado (`.bin`), a rota `GET /api/e2ee/attachments/{id}` descarta o `userID` (`_, ok := ...`) e serve o arquivo diretamente do disco sem verificar na tabela `e2ee_attachments` ou nas mensagens associadas se o usuário pertence à conversa de destino.

---

#### [ACHADO-18] 🟡 Média (`#D97706`) — IDOR Cross-Guild em Chaves Estrangeiras (`SystemChannelID`, `CategoryID`, `RoleIDs`, `AssignRole`)
- **Arquivos e Linhas Exatas:**
  1. [`backend/internal/handlers/guild_handlers.go:910-923`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/guild_handlers.go#L910-L923) (`GuildHandler.Update`)
  2. [`backend/internal/handlers/channel_handlers.go:483-487`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/channel_handlers.go#L483-L487) (`ChannelHandler.Reorder`)
  3. [`backend/internal/handlers/channel_handlers.go:195-200`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/channel_handlers.go#L195-L200) (`ChannelHandler.Create`)
  4. [`backend/internal/handlers/role_handlers.go:470-498`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/role_handlers.go#L470-L498) (`RoleHandler.AssignRole`)
- **Trechos de Código:**
```go
// guild_handlers.go:910-919
910: 	} else if req.SystemChannelID != nil {
911: 		updateQuery = `
912: 			UPDATE guilds
...
916: 			    system_channel_id = $4,
```
```go
// channel_handlers.go:483-484
483: 			} else if item.CategoryID != nil {
484: 				if _, err := tx.Exec(r.Context(), "UPDATE channels SET position = $1, category_id = $2 WHERE id = $3 AND guild_id = $4", item.Position, item.CategoryID, item.ID, guildID); err != nil {
```
```go
// channel_handlers.go:195-198
195: 	if req.IsPrivate && len(req.RoleIDs) > 0 {
196: 		for _, roleID := range req.RoleIDs {
197: 			h.db.Pool.Exec(r.Context(), "INSERT INTO channel_role_access (channel_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", channel.ID, roleID)
198: 		}
```
```go
// role_handlers.go:493
493: 	_, err = h.db.Pool.Exec(r.Context(), "INSERT INTO guild_member_roles (guild_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", guildID, targetUserID, roleID)
```
- **Por que é explorável:**
  - `GuildHandler.Update` não valida se `req.SystemChannelID` pertence à `guildID`.
  - `ChannelHandler.Reorder` não valida se `item.CategoryID` pertence à `guildID` e é do tipo `'category'` (diferente de `Create` e `Update` que validam).
  - `ChannelHandler.Create` não valida se cada `roleID` em `req.RoleIDs` pertence à `guildID`.
  - `RoleHandler.AssignRole` não valida se `targetUserID` é membro atual em `guild_members`, permitindo pré-atribuir cargos a usuários que não estão no servidor.

---

#### [ACHADO-22] 🔵 Baixa (`#2563EB`) — `AckChannel` sem Validação de `MessageID` e `TYPING_START` sem Validação de Relacionamento/Bloqueio
- **Arquivos:** [`backend/internal/handlers/message_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/message_handlers.go#L1345-L1364) e [`backend/internal/gateway/client.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/gateway/client.go#L127-L143)
- **Linhas Exatas:** `message_handlers.go:1345–1364` e `gateway/client.go:127–143`
- **Trecho de Código (`gateway/client.go`):**
```go
127: 				} else if len(typingData.UserIDs) > 0 {
...
137: 					if len(validTargets) > 0 {
138: 						c.Hub.BroadcastToUsers(validTargets, event)
139: 					}
140: 				} else if typingData.RecipientID != nil && *typingData.RecipientID != uuid.Nil && *typingData.RecipientID != c.UserID {
141: 					c.Hub.BroadcastToUsers([]uuid.UUID{*typingData.RecipientID}, event)
142: 				}
```
- **Por que é explorável:** Em `AckChannel`, `req.MessageID` é gravado em `channel_read_states` sem verificar se pertence ao `channelID`. No WebSocket `TYPING_START`, quando `GuildID` é omitido e `RecipientID` ou `UserIDs` é enviado, o Hub encaminha o evento de digitação diretamente para qualquer usuário sem verificar se compartilham DM/grupo ou se há bloqueio em `user_blocks`.

---

### Categoria 4: CHAVES EXPOSTAS (Hardcode, Credenciais Padrão, Configs e Histórico Git)

#### [ACHADO-10] 🟠 Alta (`#EA580C`) — Bypass Lógico do Turnstile no Login, Ausência de Validação de Força de Segredos no Startup e Credenciais Hardcoded em Dev
- **Arquivos e Linhas Exatas:**
  1. [`backend/internal/handlers/auth_handlers.go:128-143, 705-711`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/auth_handlers.go#L705-L711)
  2. [`backend/cmd/server/main.go:43-58`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/cmd/server/main.go#L43-L58)
  3. [`docker-compose.dev.yml:7-12`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/docker-compose.dev.yml#L7-L12)
- **Trecho de Código (`auth_handlers.go:705-711`):**
```go
705: 	if req.Code == "" || req.TurnstileToken != "" {
706: 		clientIP := getClientIP(r)
707: 		if !verifyTurnstileToken(req.TurnstileToken, clientIP) {
708: 			http.Error(w, `{"error":"Falha na verificação de segurança (Turnstile). Por favor, tente novamente."}`, http.StatusBadRequest)
709: 			return
710: 		}
711: 	}
```
- **Trecho de Código (`main.go:43-49`):**
```go
43: func mustGetEnv(key string) string {
44: 	val := os.Getenv(key)
45: 	if val == "" {
46: 		log.Fatalf("%s não definido - defina uma variável de ambiente forte antes de iniciar o servidor", key)
47: 	}
48: 	return val
49: }
```
- **Trecho de Código (`docker-compose.dev.yml:7-12`):**
```yaml
7:     environment:
8:       POSTGRES_USER: zerovc
9:       POSTGRES_PASSWORD: zerovc_dev_password
10:       POSTGRES_DB: zerovc
11:     ports:
12:       - "5432:5432"
```
- **Por que é explorável:**
  1. **Bypass de CAPTCHA no Login (`auth_handlers.go:705`):** Se uma requisição a `POST /api/auth/login` enviar `"code": "000000"` (qualquer valor não-vazio) e omitir `turnstile_token` (`""`), a condição `req.Code == "" || req.TurnstileToken != ""` resulta em `false` e a validação do Cloudflare Turnstile é totalmente pulada! Caso a conta alvo não tenha 2FA habilitado (`user.TwoFactorSecret == ""`, linha 741), o campo `req.Code` é ignorado e o login é concluído sem CAPTCHA. Além disso, `verifyTurnstileToken` (linhas 128–143) opera em modo *fail-open* se `TURNSTILE_SECRET_KEY` estiver vazio ou com prefixo `sua_`/`your_`.
  2. **Ausência de Rejeição de Placeholders no Startup (`main.go:43-58`):** `mustGetEnv` verifica apenas `val == ""`, não rejeitando segredos curtos (`< 32` bytes) nem os placeholders documentados em `.env.example` (`"gere_um_jwt_secret_longo_e_aleatorio_minimo_32_caracteres"`).
  3. **Credenciais Hardcoded e Porta Exposta (`docker-compose.dev.yml:7-12`):** Define `POSTGRES_PASSWORD: zerovc_dev_password` e faz bind da porta `5432` em todas as interfaces (`0.0.0.0:5432`) em vez de `127.0.0.1:5432`.

---

#### [ACHADO-19] 🟡 Média (`#D97706`) — Exposição de IP de Produção e Segredos Antigos no Histórico Git + Omissão de `LIVEKIT_KEYS` no Coolify Compose
- **Arquivos e Linhas Exatas:**
  1. `deploy/livekit.yaml` no histórico Git (commits `8839eea87f62e5330dab272265d9f559907ad64d` e `3e7adbe6fad6a0e7e87c7ad18a9cbc6bc7191d39`)
  2. [`deploy/docker-compose.coolify.yml:4-10`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/deploy/docker-compose.coolify.yml#L4-L10)
- **Trecho de Código (`deploy/docker-compose.coolify.yml:4-10`):**
```yaml
4:   livekit:
5:     image: livekit/livekit-server:latest
6:     container_name: zerovc-livekit
7:     restart: unless-stopped
8:     command: --config /etc/livekit.yaml
9:     volumes:
10:       - ./livekit.yaml:/etc/livekit.yaml
```
- **Por que é explorável / problemático:**
  1. O commit `8839eea` gravou `node_ip: "192.0.2.1"` em `deploy/livekit.yaml`, expondo no histórico do repositório o IP real da VPS de produção (permitindo contornar proxies/WAF como Cloudflare). O commit inicial `3e7adbe` também registrou chaves default antigas (`zerovc_super_secret_jwt_key_32bytes_long`, `devkey: secret_livekit_key_change_in_production`).
  2. Enquanto `deploy/docker-compose.yml` injeta `LIVEKIT_KEYS: "${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"`, o arquivo `deploy/docker-compose.coolify.yml` omite a variável `LIVEKIT_KEYS` no serviço `livekit`, quebrando a autenticação de salas de voz caso seja utilizado sem chaves estáticas no `livekit.yaml`.

---

### Categoria 5: INPUTS SEM TRATAMENTO (XSS, Injeção HTML e Uploads)

#### [ACHADO-20] 🟡 Média (`#D97706`) — Injeção HTML em E-mail (`SendEmailChangedNotice`), Condição `!imageOnly` Invertida no Sniff de Uploads e Esquemas `data:`/`blob:` em Links Markdown
- **Arquivos e Linhas Exatas:**
  1. [`backend/internal/email/email.go:241-270`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/email/email.go#L241-L270) e [`backend/internal/handlers/auth_handlers.go:1865-1869`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/auth_handlers.go#L1865-L1869)
  2. [`backend/internal/handlers/upload_handlers.go:181-192`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/upload_handlers.go#L181-L192)
  3. [`client/src/components/Chat/FormattedMessage.tsx:762-774`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/client/src/components/Chat/FormattedMessage.tsx#L762-L774) e [`client/src/lib/api.ts:48-57`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/client/src/lib/api.ts#L48-L57)
- **Trecho de Código (`email.go:254-258`):**
```go
254:               <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #ffffff; font-weight: 700;">Olá, @%s!</h2>
255:               <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #a4a7b5;">
256:                 Informamos que o endereço de e-mail associado à sua conta no ZeroVC foi alterado para <strong>%s</strong>.
257:               </p>
258: `, username, newEmail)
```
- **Trecho de Código (`upload_handlers.go:181-192`):**
```go
181: 	// Sniff first 512 bytes for HTML/SVG disguises
182: 	sniffBuf := make([]byte, 512)
183: 	n, _ := file.Read(sniffBuf)
184: 	if n > 0 {
185: 		detectedType := http.DetectContentType(sniffBuf[:n])
186: 		if strings.Contains(detectedType, "text/html") || strings.Contains(detectedType, "image/svg+xml") {
187: 			if !imageOnly {
188: 				http.Error(w, `{"error":"Tipo de conteúdo de arquivo não permitido."}`, http.StatusBadRequest)
189: 				return
190: 			}
191: 		}
192: 	}
```
- **Trecho de Código (`FormattedMessage.tsx:762-774`):**
```tsx
762:       const matchLink = token.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s<)]+|\/assets\/[^\s<)]+|[^\s<)]+)\)$/);
763:       if (matchLink) {
764:         const linkText = matchLink[1];
765:         const linkUrl = matchLink[2];
766:         const formattedUrl = formatAssetUrl(linkUrl);
767:         elements.push(
768:           <a
769:             key={k}
770:             href={formattedUrl}
771:             target="_blank"
772:             rel="noopener noreferrer"
773:             download
```
- **Por que é explorável:**
  1. **Injeção de HTML no E-mail (`email.go:254-258`):** `ChangeEmail` (`auth_handlers.go:1866`) valida apenas `strings.Contains(newEmail, "@")`. Tanto `username` quanto `newEmail` são interpolados em `SendEmailChangedNotice` (e `username` em `SendVerificationCode` e `SendPasswordResetCode`) via `fmt.Sprintf` sem `html.EscapeString`, permitindo injetar tags HTML/links de phishing no e-mail enviado para o endereço antigo da vítima.
  2. **Condição `!imageOnly` Invertida (`upload_handlers.go:187`):** Quando `imageOnly == true` (rotas `/api/upload/avatar`, `/api/upload/banner`, `/api/upload/guild-icon`, `/api/upload/guild-banner`), a verificação `if !imageOnly` faz com que payloads detectados como `text/html` ou `image/svg+xml` **não** sejam bloqueados caso tenham extensão `.jpg`/`.png`, além de não exigir `strings.HasPrefix(detectedType, "image/")`.
  3. **Links Markdown com `data:`/`blob:` e `download` (`FormattedMessage.tsx:762-774`):** A terceira alternativa da regex (`|[^\s<)]+`) combinada com `formatAssetUrl` (que preserva `data:` e `blob:`) e o atributo `download` permite criar links Markdown `[ Atualização Crítica ](data:text/html;base64,...)` que disparam download automático de arquivos arbitrários ao clique.

---

#### [ACHADO-23] 🔵 Baixa (`#2563EB`) — Confiança nos Cabeçalhos `Host` e `X-Forwarded-Proto` em `getPublicBaseURL`
- **Arquivo:** [`backend/internal/handlers/upload_handlers.go`](file:///C:/Users/thiag/OneDrive/Documentos/GitHub/zerovc/backend/internal/handlers/upload_handlers.go#L227-L244)
- **Linhas Exatas:** `227–244`
- **Trecho de Código:**
```go
232: 	scheme := "https"
233: 	if r.TLS == nil && r.Header.Get("X-Forwarded-Proto") != "https" {
234: 		if r.Header.Get("X-Forwarded-Proto") != "" {
235: 			scheme = r.Header.Get("X-Forwarded-Proto")
236: 		} else if strings.HasPrefix(r.Host, "localhost") {
237: 			scheme = "http"
238: 		}
239: 	}
240: 	if r.Host != "" && !strings.HasPrefix(r.Host, "127.0.0.1") && !strings.HasPrefix(r.Host, "localhost") {
241: 		return fmt.Sprintf("%s://%s", scheme, r.Host)
242: 	}
```
- **Por que é explorável:** Caso a variável de ambiente `CDN_BASE_URL` não esteja definida, `getPublicBaseURL` constrói a URL pública do arquivo recém-enviado usando diretamente `r.Host` e `r.Header.Get("X-Forwarded-Proto")` fornecidos pelo cliente, permitindo que um atacante gere URLs de upload apontando para domínios externos arbitrários.

---

## 6. Recomendações Priorizadas (Plano de Ação)

### 🚨 Prioridade P1 — Imediata (Falhas Críticas e Altas de Isolamento, RBAC e Auth)
1. **Isolar Canais Privados no `CommandHandler` (ACHADO-01, ACHADO-02):**
   - Em `command_handlers.go:1074`, adicionar chamada obrigatória a `canUserAccessChannel(ctx, h.db, guildID, channelID, userID)` e `canUserSendMessages`.
   - Em `command_handlers.go:1131-1135`, substituir o `if !isPrivate ... else ...` pelo método seguro de broadcast filtrado por audiência do canal privado (ou `h.hub.BroadcastToChannel(guildID, channelID, wsEvent)`).
2. **Proteger Endpoints E2EE contra BOLA e Spoofing (ACHADO-04, ACHADO-08, ACHADO-09):**
   - Em `GetLatestRoster` (`e2ee_handlers.go:1160`), extrair `userID` do contexto e verificar se o usuário pertence à DM, grupo de DM ou canal (incluindo `canUserAccessChannel` para canais privados) antes de retornar o roster.
   - Em `SendToDevice` (`e2ee_handlers.go:718`), validar que `m.SenderDeviceID` pertence ao `userID` autenticado e não está revogado.
   - Em `GetMyRoomKeys` e `GetConversationRoomKeys` (`e2ee_handlers.go:1800, 1878`), filtrar canais privados exigindo permissão de acesso ao canal.
3. **Filtrar Canais Privados em `GuildHandler.List` (ACHADO-03):**
   - Aplicar em `GuildHandler.List` (`guild_handlers.go:191-210`) a mesma filtragem de `is_private` + `channel_role_access` / `PermAdministrator` utilizada em `GuildHandler.GetDetails`.
4. **Corrigir RBAC em `AdminUpdateVoiceState` e `UpdatePermissionOverwrite` (ACHADO-05, ACHADO-06):**
   - Em `channel_handlers.go:844`, remover `&& adminID != targetUserID` da condição de checagem de permissões de moderação/movimentação de voz.
   - Em `channel_handlers.go:1027`, validar se `roleID` pertence à `guildID` do canal, limpar `PermAdministrator` de `req.Allow` (`req.Allow & ^models.PermAdministrator`) e exigir que o ator possua as permissões que está concedendo.
5. **Validar Sessão Ativa no `auth.Middleware` e Corrigir Bypass do Turnstile no Login (ACHADO-07, ACHADO-10):**
   - Em `auth.Middleware`, verificar se o hash SHA-256 do token consta em `user_sessions` (com cache curto em memória se desejado para performance).
   - Em `auth_handlers.go:705`, exigir `verifyTurnstileToken` sempre que `req.Code == ""`, e caso `req.Code != ""` mas o usuário não tenha 2FA ativo (ou ainda não tenha validado credenciais na primeira etapa), não permitir pular o Turnstile. Validar entropia mínima (`>= 32` caracteres) e rejeitar placeholders em `mustGetEnv` (`main.go:43`).

### ⚠️ Prioridade P2 — Curto Prazo (Falhas Médias de RBAC, IDOR e Sanitização)
6. **Filtrar `GetGuildVoiceStates` e `SubmitRoster` Broadcast (ACHADO-11, ACHADO-12):**
   - Ocultar sessões de voz de canais privados aos quais o usuário não tem acesso em `GetGuildVoiceStates`.
   - Trocar `BroadcastGlobal` por `BroadcastToUsers` (apenas membros da conversa) em `SubmitRoster`.
7. **Reforçar Validações de Pertinência e Estado (ACHADO-13, ACHADO-14, ACHADO-15, ACHADO-17, ACHADO-18):**
   - Validar `guild_members` e `canUserAccessChannel` em `MessageHandler.Update`.
   - Exigir `userID == ownerID` em `DMGroupHandler.EnableE2EE` e `canUserAccessChannel` em `SubmitKeyRequest`.
   - Bloquear renomeação do cargo `@everyone` em `RoleHandler.Update`.
   - Validar pertinência à guilda para `SystemChannelID`, `CategoryID`, `RoleIDs` e `targetUserID` em `AssignRole`, e validar acesso ao anexo em `DownloadAttachment`.
8. **Sanitizar HTML de E-mails, MIME Sniffing de Imagens e Links Markdown (ACHADO-16, ACHADO-20):**
   - Aplicar `html.EscapeString` em `username` e `newEmail` em `backend/internal/email/email.go`.
   - Em `upload_handlers.go:185`, bloquear `text/html` e `image/svg+xml` independentemente de `imageOnly`, e quando `imageOnly == true`, exigir `strings.HasPrefix(detectedType, "image/")`.
   - Em `FormattedMessage.tsx:762`, permitir apenas URLs `http://`, `https://` ou `/assets/` e remover o atributo `download` incondicional.
   - Alinhar as permissões de `MessageItem.tsx` (`canManageMessages` para excluir e fixar) e `ChannelSettingsModal.tsx`.

### ℹ️ Prioridade P3 — Médio Prazo (Defesa em Profundidade e Infraestrutura)
9. **Infraestrutura e Hardening de Baixa Severidade (ACHADO-19, ACHADO-21, ACHADO-22, ACHADO-23):**
   - Adicionar `LIVEKIT_KEYS` em `deploy/docker-compose.coolify.yml`, restringir a porta do PostgreSQL em `docker-compose.dev.yml` para `127.0.0.1:5432`, escopar `DELETE FROM voice_sessions` por guilda em `KickMember`/`BanMember`, validar `MessageID` em `AckChannel`, validar amizade/DM e bloqueio em `TYPING_START`, e usar `APP_URL`/`CDN_BASE_URL` fixo em `getPublicBaseURL`.

---

## 7. ISSUES PARA O GITHUB

Abaixo estão os textos completos das **12 Issues acionáveis** em Markdown (com achados correlatos agrupados por módulo para evitar spam), prontos para copiar e colar diretamente no GitHub:

--- ISSUE 1 ---
### Título
`[Segurança] Quebra de isolamento de canais privados na execução e broadcast de comandos de bot`

### Labels Sugeridas
`security`, `critical`, `backend`, `isolation`

### Descrição do Problema
No handler `ExecuteGuildCommand` (`POST /api/channels/{id}/bot/command`), existem duas falhas críticas de isolamento de canais privados (`is_private = true`):
1. O endpoint verifica apenas se o usuário autenticado é membro do servidor (`guild_members`) e se pode usar comandos (`canUserUseCommands`), mas **não chama `canUserAccessChannel`**. Qualquer membro do servidor pode executar comandos de bot em canais privados restritos à administração informando o UUID do canal na URL.
2. Ao fazer o broadcast WebSocket da resposta do comando (`EventMessageCreate`), tanto o bloco `if !isPrivate` quanto o bloco `else` chamam `h.hub.BroadcastToGuild(guildID, wsEvent)`, transmitindo o conteúdo gerado em canais privados para **todos os membros conectados do servidor**.

### Evidência
- **Arquivo:** `backend/internal/handlers/command_handlers.go` (linhas `1058–1085` e `1126–1135`)
```go
// Linhas 1058-1076
	var guildID uuid.UUID
	var isPrivate bool
	err = h.db.Pool.QueryRow(ctx, "SELECT guild_id, is_private FROM channels WHERE id = $1", channelID).Scan(&guildID, &isPrivate)
...
	var isMember bool
	err = h.db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)", guildID, userID).Scan(&isMember)
	if err != nil || !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	canUse, err := canUserUseCommands(ctx, h.db, guildID, channelID, userID)

// Linhas 1131-1135
	if !isPrivate {
		h.hub.BroadcastToGuild(guildID, wsEvent)
	} else {
		h.hub.BroadcastToGuild(guildID, wsEvent)
	}
```

### Impacto
Membros sem permissão podem injetar mensagens de bot em canais privados e todos os membros conectados ao servidor recebem em tempo real as mensagens de comandos executados em canais privados.

### Sugestão de Correção
1. Chamar `canUserAccessChannel(ctx, h.db, guildID, channelID, userID)` e `canUserSendMessages(ctx, h.db, guildID, channelID, userID)` logo após verificar `isMember`.
2. Quando `isPrivate == true`, transmitir o evento `EventMessageCreate` apenas para os usuários autorizados no canal privado (utilizando `h.hub.BroadcastToChannel(guildID, channelID, wsEvent)` ou a mesma lógica de `broadcastChannelEvent` de `MessageHandler`).

### Critérios de Aceite
- [ ] `ExecuteGuildCommand` retorna `403 Forbidden` se `canUserAccessChannel` retornar `false`.
- [ ] `ExecuteGuildCommand` retorna `403 Forbidden` se `canUserSendMessages` retornar `false`.
- [ ] Respostas de comandos em canais com `is_private = true` são entregues via WebSocket exclusivamente aos membros com acesso ao canal privado.
--- FIM ISSUE 1 ---

--- ISSUE 2 ---
### Título
`[Segurança] Vazamento de metadados e estados de voz de canais privados em rotas de servidor`

### Labels Sugeridas
`security`, `high`, `backend`, `isolation`

### Descrição do Problema
Três endpoints de consulta expõem informações de canais privados ou de associação a servidores sem verificar as permissões do usuário requisitante:
1. `GuildHandler.List` (`GET /api/guilds`) carrega todos os canais de todas as guildas do usuário (`WHERE guild_id = ANY($1)`) sem filtrar canais privados (`is_private = true`) aos quais o usuário não tem acesso.
2. `GuildHandler.GetGuildVoiceStates` (`GET /api/guilds/{id}/voice-states`) retorna todas as sessões de voz ativas na guilda sem filtrar canais de voz privados.
3. `UserHandler.GetUserProfile` (`GET /api/users/{id}/profile?guild_id={guildID}`) retorna a data de entrada (`joined_at`) do usuário alvo em qualquer `guild_id` sem verificar se o requisitante também pertence àquela guilda.

### Evidência
- **Arquivo:** `backend/internal/handlers/guild_handlers.go` (linhas `191–210` e `1813–1824`)
- **Arquivo:** `backend/internal/handlers/user_handlers.go` (linhas `471–483`)
```go
// guild_handlers.go:191-196
		chanQuery := `
			SELECT id, guild_id, name, type, position, is_private, category_id, topic, created_at
			FROM channels
			WHERE guild_id = ANY($1)
			ORDER BY position ASC, created_at ASC
		`
```

### Impacto
Membros comuns conseguem visualizar nomes, tópicos, IDs e participantes em chamadas de voz de canais privados/restritos do servidor, além de enumerar participação de terceiros em outros servidores.

### Sugestão de Correção
1. Em `GuildHandler.List` e `GuildHandler.GetGuildVoiceStates`, aplicar filtro de acesso a canais privados verificando se o usuário é dono, possui `PermAdministrator`, ou possui cargo listado em `channel_role_access` (e sem overwrite negando `PermViewChannels`).
2. Em `UserHandler.GetUserProfile`, só consultar e retornar `joined_at` para `guild_id` se o `callerID` também for membro de `guild_id`.

### Critérios de Aceite
- [ ] `GET /api/guilds` omite canais com `is_private = true` aos quais o usuário não possui acesso.
- [ ] `GET /api/guilds/{id}/voice-states` omite sessões de voz em canais privados inacessíveis ao usuário.
- [ ] `GET /api/users/{id}/profile?guild_id=X` não retorna `joined_at` caso o usuário autenticado não seja membro da guilda `X`.
--- FIM ISSUE 2 ---

--- ISSUE 3 ---
### Título
`[Segurança] Falhas de autorização (BOLA/IDOR), spoofing de dispositivo e vazamento de metadados nos endpoints E2EE`

### Labels Sugeridas
`security`, `high`, `backend`, `e2ee`, `idor`

### Descrição do Problema
Foram identificadas seis falhas de autorização e isolamento nos handlers de criptografia de ponta a ponta (`backend/internal/handlers/e2ee_handlers.go`):
1. **`GetLatestRoster` (`GET /api/e2ee/rosters/{conversation_id}`):** Não verifica se o usuário autenticado participa da conversa, retornando membros, dispositivos e chaves públicas de qualquer DM, grupo ou canal.
2. **`SendToDevice` (`POST /api/e2ee/to-device`):** Permite que o cliente envie `m.SenderDeviceID` arbitrário no JSON sem validar se o dispositivo pertence ao `userID` autenticado (device spoofing).
3. **`GetMyRoomKeys` e `GetConversationRoomKeys`:** Para `conversation_type = 'channel'`, verificam apenas `guild_members`, ignorando se o canal é privado (`is_private = true`).
4. **`SubmitRoster` (`POST /api/e2ee/rosters`):** Transmite `EventE2EERosterUpdate` via `BroadcastGlobal` em vez de restringir aos participantes da conversa.
5. **`DownloadAttachment` (`GET /api/e2ee/attachments/{id}`):** Serve qualquer arquivo `.bin` do diretório `uploads/e2ee_attachments/` para qualquer usuário autenticado sem validar vínculo.
6. **`SubmitKeyRequest` (`POST /api/e2ee/key-requests`):** Lê `is_private` do canal, mas não valida `canUserAccessChannel`.

### Evidência
- **Arquivo:** `backend/internal/handlers/e2ee_handlers.go` (linhas `717–728`, `1131–1146`, `1160–1180`, `1439–1467`, `1513–1526`, `1800–1805`, `1878–1884`)
```go
// Linhas 717-720 (SendToDevice)
		senderID := defaultSenderDeviceID
		if m.SenderDeviceID != nil && *m.SenderDeviceID != uuid.Nil {
			senderID = *m.SenderDeviceID
		}

// Linhas 1160-1180 (GetLatestRoster)
func (h *E2EEHandler) GetLatestRoster(w http.ResponseWriter, r *http.Request) {
	convIDStr := chi.URLParam(r, "conversation_id")
...
	err = h.db.Pool.QueryRow(ctx, `SELECT ... FROM e2ee_rosters WHERE conversation_id = $1 ...`, convID)
```

### Impacto
Exposição de grafos sociais e chaves públicas de conversas privadas (`e2ee_rosters`), falsificação de identidade de dispositivo remetente na fila `to-device`, acesso indevido a `room_keys` de canais privados e vazamento global de metadados de atividade E2EE via WebSocket.

### Sugestão de Correção
1. Em `GetLatestRoster`, validar que `userID` pertence à DM, grupo de DM ou canal (usando `canUserAccessChannel` para canais).
2. Em `SendToDevice`, validar no banco que `senderID` pertence a `userID` e `revoked_at IS NULL`.
3. Em `GetMyRoomKeys`, `GetConversationRoomKeys` e `SubmitKeyRequest`, validar acesso a canais privados via `canUserAccessChannel`.
4. Em `SubmitRoster`, substituir `BroadcastGlobal` por `BroadcastToUsers` restrito aos membros da conversa.
5. Em `DownloadAttachment`, verificar permissão/vínculo do usuário antes de servir o arquivo.

### Critérios de Aceite
- [ ] `GetLatestRoster` retorna `403 Forbidden` para usuários que não participam da conversa.
- [ ] `SendToDevice` retorna `403 Forbidden` se `sender_device_id` não pertencer ao `userID` autenticado.
- [ ] `GetMyRoomKeys`, `GetConversationRoomKeys` e `SubmitKeyRequest` bloqueiam acesso a canais privados não autorizados.
- [ ] `EventE2EERosterUpdate` é enviado apenas aos membros da respectiva conversa.
--- FIM ISSUE 3 ---

--- ISSUE 4 ---
### Título
`[Segurança] Bypass de RBAC em AdminUpdateVoiceState ao passar o próprio userID`

### Labels Sugeridas
`security`, `high`, `backend`, `permissions`

### Descrição do Problema
No endpoint `AdminUpdateVoiceState` (`POST /api/channels/{channelID}/members/{userID}/voice-state`), toda a verificação de permissões (`PermMoveMembers`, `PermMuteVoice`, `PermMuteMembers`, `PermDeafenVoice`) e de hierarquia de cargos está dentro de `if !isOwner && adminID != targetUserID`. Se um membro comum chamar a rota passando seu próprio `userID` (`adminID == targetUserID`), todas as validações de permissão são ignoradas.

### Evidência
- **Arquivo:** `backend/internal/handlers/channel_handlers.go` (linhas `843–882`)
```go
	isOwner := adminID == ownerID
	if !isOwner && adminID != targetUserID {
		if targetUserID == ownerID {
			http.Error(w, `{"error":"forbidden: não é possível moderar o dono do servidor"}`, http.StatusForbidden)
			return
		}
		actorCtx, err := loadActorGuildContext(r.Context(), h.db, guildID, adminID)
        // ... checagens de PermMoveMembers / PermMuteVoice ...
	}
```

### Impacto
Um usuário silenciado/ensurdecido por um moderador pode remover sua própria punição de voz enviando `is_muted: false` para a rota administrativa, ou pode mover-se para qualquer canal de voz do servidor (inclusive canais privados) sem possuir `PermMoveMembers` nem `PermConnectVoice`.

### Sugestão de Correção
Remover `&& adminID != targetUserID` da linha 844 para exigir que qualquer chamada a `AdminUpdateVoiceState` (por quem não é dono) valide as permissões administrativas, além de verificar `canUserAccessChannel` e `PermConnectVoice` no canal de destino (`req.TargetChannelID`).

### Critérios de Aceite
- [ ] Chamadas a `POST /api/channels/{channelID}/members/{userID}/voice-state` com `adminID == targetUserID` por usuários sem permissão administrativa retornam `403 Forbidden`.
- [ ] O auto-mute próprio do usuário continua ocorrendo exclusivamente pela rota `POST /api/channels/{id}/voice-state` (`UpdateVoiceState`), que não permite mover de canal nem sobrescrever punição de moderador.
--- FIM ISSUE 4 ---

--- ISSUE 5 ---
### Título
`[Segurança] Escalação de privilégio e IDOR de cargo em UpdatePermissionOverwrite`

### Labels Sugeridas
`security`, `high`, `backend`, `permissions`, `idor`

### Descrição do Problema
No endpoint `UpdatePermissionOverwrite` (`PUT /api/channels/{id}/permissions/{roleID}`), há três falhas de segurança em comparação com `ChannelHandler.Update`:
1. Não verifica se `roleID` pertence à mesma `guildID` do canal (`guild_roles`).
2. Não remove o bit `PermAdministrator` da máscara `req.Allow` (diferente da linha 330 de `Update`, que aplica `allowClean := ow.Allow & ^models.PermAdministrator`).
3. Não verifica se o usuário executor possui as permissões que está concedendo no overwrite nem a hierarquia do cargo alvo.

### Evidência
- **Arquivo:** `backend/internal/handlers/channel_handlers.go` (linhas `1027–1076`)
```go
		query := `
			INSERT INTO channel_permission_overwrites (channel_id, role_id, allow, deny)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (channel_id, role_id)
			DO UPDATE SET allow = EXCLUDED.allow, deny = EXCLUDED.deny
		`
		_, err = h.db.Pool.Exec(r.Context(), query, channelID, roleID, req.Allow, req.Deny)
```

### Impacto
Um membro com `PermManageChannels` (mas sem `PermAdministrator`) pode injetar o bit `PermAdministrator` ou outras permissões que não detém em um overwrite de canal, ou referenciar UUIDs de cargos de outras guildas.

### Sugestão de Correção
1. Validar `SELECT EXISTS(SELECT 1 FROM guild_roles WHERE id = $1 AND guild_id = $2)` para `roleID` e `guildID` (tanto em `UpdatePermissionOverwrite` quanto em `DeletePermissionOverwrite`).
2. Aplicar `allowClean := req.Allow & ^models.PermAdministrator` e bloquear concessão de bits que o ator não possui (`if !actorCtx.IsOwner && !actorCtx.HasAdmin && (allowClean & ^actorCtx.Perms) != 0`).

### Critérios de Aceite
- [ ] `UpdatePermissionOverwrite` retorna `400/404` se `roleID` não pertencer à guilda do canal.
- [ ] O bit `PermAdministrator` é sempre removido de `Allow` em `UpdatePermissionOverwrite`.
- [ ] Usuários sem `PermAdministrator` não conseguem conceder em `Allow` permissões que eles próprios não possuem.
--- FIM ISSUE 5 ---

--- ISSUE 6 ---
### Título
`[Segurança] Sessões revogadas continuam válidas por até 30 dias no middleware JWT`

### Labels Sugeridas
`security`, `high`, `backend`, `authentication`

### Descrição do Problema
Os handlers `RevokeSession`, `RevokeOtherSessions`, `Logout`, `ChangePassword` e `ResetPassword` removem registros da tabela `user_sessions`. Entretanto, o middleware de autenticação (`auth.Service.Middleware` em `backend/internal/auth/auth.go`) realiza apenas a verificação estática da assinatura HMAC do JWT (`ValidateToken`), sem verificar se o hash do token continua ativo em `user_sessions`.

### Evidência
- **Arquivo:** `backend/internal/auth/auth.go` (linhas `79–118`)
```go
		claims, err := s.ValidateToken(tokenString)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
```

### Impacto
Um token JWT comprometido permanece válido para autenticar requisições na API e no WebSocket por até 30 dias, mesmo depois de o usuário revogar a sessão em "Configurações > Sessões", fazer logout ou alterar a senha.

### Sugestão de Correção
Adicionar ao `auth.Service` uma verificação de sessão ativa (consultando `SELECT EXISTS(SELECT 1 FROM user_sessions WHERE token_hash = $1 AND user_id = $2 AND expires_at > CURRENT_TIMESTAMP)` com cache em memória de curta duração ou invalidação direta em memória ao revogar).

### Critérios de Aceite
- [ ] Um token cuja sessão foi revogada via `POST /api/auth/sessions/{id}/revoke`, `revoke-others`, `logout` ou `change-password` recebe imediatamente `401 Unauthorized` em rotas protegidas.
--- FIM ISSUE 6 ---

--- ISSUE 7 ---
### Título
`[Segurança] Bypass lógico do Cloudflare Turnstile no login e validação de segredos no startup`

### Labels Sugeridas
`security`, `high`, `backend`, `authentication`, `configuration`

### Descrição do Problema
1. **Bypass do Turnstile no Login:** Em `AuthHandler.Login` (`backend/internal/handlers/auth_handlers.go:705`), a validação `verifyTurnstileToken` só é executada quando `req.Code == "" || req.TurnstileToken != ""`. Se um atacante enviar qualquer string não-vazia em `code` (ex.: `"code": "000000"`) e deixar `turnstile_token` vazio, a verificação do CAPTCHA é ignorada. Se o usuário alvo não tiver 2FA ativo (`user.TwoFactorSecret == ""`), o campo `code` nunca é checado e o login é aprovado.
2. **Validação de Segredos no Startup:** `mustGetEnv` em `backend/cmd/server/main.go:43-49` verifica apenas `val == ""`, aceitando chaves curtas ou valores de exemplo de `.env.example`.
3. **Configuração de Dev/Coolify:** `docker-compose.dev.yml` expõe `5432:5432` em `0.0.0.0` com senha padrão, e `deploy/docker-compose.coolify.yml` omite a variável `LIVEKIT_KEYS` no container `livekit`.

### Evidência
- **Arquivo:** `backend/internal/handlers/auth_handlers.go` (linhas `705–711` e `741`)
```go
705: 	if req.Code == "" || req.TurnstileToken != "" {
706: 		clientIP := getClientIP(r)
707: 		if !verifyTurnstileToken(req.TurnstileToken, clientIP) {
708: 			http.Error(w, `{"error":"Falha na verificação de segurança (Turnstile). Por favor, tente novamente."}`, http.StatusBadRequest)
709: 			return
710: 		}
711: 	}
```

### Impacto
Ataques automatizados de força bruta e credential stuffing podem contornar 100% do CAPTCHA Turnstile em contas sem 2FA. Ambientes configurados com placeholders do `.env.example` iniciam sem alerta.

### Sugestão de Correção
1. Em `AuthHandler.Login`, se `req.Code != ""` mas a conta não possui 2FA habilitado (`user.TwoFactorSecret == ""`), exigir ou validar o `TurnstileToken` (ou rejeitar a requisição).
2. Em `main.go`, validar que `JWT_SECRET` e `LIVEKIT_API_SECRET` tenham pelo menos 32 bytes e não correspondam aos placeholders conhecidos.
3. Em `docker-compose.dev.yml`, alterar `ports` do PostgreSQL para `"127.0.0.1:5432:5432"` e adicionar `LIVEKIT_KEYS` em `deploy/docker-compose.coolify.yml`.

### Critérios de Aceite
- [ ] Enviar `code` preenchido e `turnstile_token` vazio para uma conta sem 2FA não permite pular a verificação do Turnstile.
- [ ] `main.go` recusa iniciar se `JWT_SECRET` ou `LIVEKIT_API_SECRET` tiverem menos de 32 caracteres ou usarem valores de exemplo.
- [ ] `docker-compose.dev.yml` faz bind do Postgres apenas em `127.0.0.1:5432` e `docker-compose.coolify.yml` injeta `LIVEKIT_KEYS`.
--- FIM ISSUE 7 ---

--- ISSUE 8 ---
### Título
`[Segurança] Controles de acesso ausentes na edição de mensagens, renomeação do @everyone e ativação de E2EE em grupos`

### Labels Sugeridas
`security`, `medium`, `backend`, `permissions`

### Descrição do Problema
Três rotas de mutação no backend apresentam validações incompletas de permissão ou estado de membro:
1. **`MessageHandler.Update` (`PATCH /api/channels/{channelID}/messages/{messageID}`):** Verifica apenas se `m.author_id = $2`, sem checar se o autor ainda pertence ao servidor (`guild_members`), se não está silenciado (`muted_until`) e se ainda possui acesso ao canal (`canUserAccessChannel`).
2. **`RoleHandler.Update` (`PATCH /api/guilds/{guildID}/roles/{roleID}`):** Não impede renomear o cargo `@everyone`, o que quebra todas as queries SQL que identificam o cargo padrão por `name = '@everyone'` / `name != '@everyone'`.
3. **`DMGroupHandler.EnableE2EE` (`POST /api/dm/groups/{id}/e2ee/enable`):** Carrega `ownerID` do banco na linha 955, mas verifica apenas `isMember`, permitindo que qualquer membro ative o E2EE no grupo.

### Evidência
- **Arquivos:**
  - `backend/internal/handlers/message_handlers.go` (linhas `416–426`)
  - `backend/internal/handlers/role_handlers.go` (linhas `228–244`)
  - `backend/internal/handlers/dm_group_handlers.go` (linhas `952–966`)
```go
// dm_group_handlers.go:952-966
	var ownerID uuid.UUID
	var currentE2EE bool
	var currentEpoch int
	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id, COALESCE(e2ee_enabled, false), COALESCE(rotation_epoch, 1) FROM dm_groups WHERE id = $1", groupID).Scan(&ownerID, &currentE2EE, &currentEpoch)
...
	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
```

### Impacto
Ex-membros ou usuários banidos podem editar mensagens antigas em servidores dos quais foram expulsos; administradores podem corromper acidentalmente ou maliciosamente o cargo `@everyone`; membros comuns podem forçar ativação de E2EE em grupos de DM.

### Sugestão de Correção
1. Em `MessageHandler.Update`, validar `guild_members`, `canUserAccessChannel` e `m.channel_id = channelID`.
2. Em `RoleHandler.Update`, se `targetRoleName == "@everyone"`, bloquear alteração de `name` e `position`.
3. Em `DMGroupHandler.EnableE2EE`, validar `if ownerID != userID { http.Error(..., http.StatusForbidden); return }`.

### Critérios de Aceite
- [ ] Usuários que não são mais membros do servidor ou perderam acesso ao canal recebem `403 Forbidden` ao tentar editar mensagens.
- [ ] Tentativas de renomear o cargo `@everyone` via `PATCH /api/guilds/{guildID}/roles/{roleID}` são rejeitadas com `400 Bad Request`.
- [ ] Apenas o dono do grupo (`owner_id`) ou fluxo autorizado pode ativar o E2EE em grupos de DM.
--- FIM ISSUE 8 ---

--- ISSUE 9 ---
### Título
`[Segurança] Validação de pertinência cross-guild ausente em SystemChannelID, CategoryID, RoleIDs e AssignRole`

### Labels Sugeridas
`security`, `medium`, `backend`, `idor`

### Descrição do Problema
Quatro endpoints administrativos aceitam UUIDs de entidades relacionadas sem validar se pertencem ao mesmo servidor (`guildID`):
1. `GuildHandler.Update` (`guild_handlers.go:910-923`): `req.SystemChannelID` não é validado contra `channels WHERE id = $1 AND guild_id = $2`.
2. `ChannelHandler.Reorder` (`channel_handlers.go:483-487`): `item.CategoryID` não é validado para garantir que pertence à `guildID` e tem `type = 'category'`.
3. `ChannelHandler.Create` (`channel_handlers.go:195-200`): `req.RoleIDs` são inseridos em `channel_role_access` sem validar se pertencem à `guildID`.
4. `RoleHandler.AssignRole` (`role_handlers.go:470-498`): `targetUserID` recebe cargo em `guild_member_roles` sem validar se é membro atual em `guild_members`.

### Evidência
- **Arquivos:** `backend/internal/handlers/guild_handlers.go:910-923`, `backend/internal/handlers/channel_handlers.go:195-200, 483-487`, `backend/internal/handlers/role_handlers.go:470-498`
```go
// channel_handlers.go:483-485
			} else if item.CategoryID != nil {
				if _, err := tx.Exec(r.Context(), "UPDATE channels SET position = $1, category_id = $2 WHERE id = $3 AND guild_id = $4", item.Position, item.CategoryID, item.ID, guildID); err != nil {
```

### Impacto
Poluição de integridade referencial entre servidores distintos e pré-atribuição de cargos a usuários que não fazem parte do servidor.

### Sugestão de Correção
Adicionar verificações `SELECT EXISTS(...)` garantindo que `SystemChannelID`, `CategoryID` e `RoleIDs` pertençam à mesma `guildID` e que `targetUserID` exista em `guild_members` antes de `AssignRole`.

### Critérios de Aceite
- [ ] `GuildHandler.Update` rejeita `system_channel_id` de outra guilda ou que não seja canal de texto.
- [ ] `ChannelHandler.Reorder` rejeita `category_id` de outra guilda ou que não seja do tipo `'category'`.
- [ ] `ChannelHandler.Create` filtra `role_ids` mantendo apenas cargos da própria guilda.
- [ ] `RoleHandler.AssignRole` retorna `404/400` se `targetUserID` não for membro da guilda.
--- FIM ISSUE 9 ---

--- ISSUE 10 ---
### Título
`[Segurança] Escape de HTML em e-mails de notificação, validação de MIME em uploads de imagem e sanitização de links Markdown`

### Labels Sugeridas
`security`, `medium`, `backend`, `frontend`, `xss`

### Descrição do Problema
1. **Injeção de HTML em E-mail (`backend/internal/email/email.go:241-270`):** `SendEmailChangedNotice` (assim como `SendVerificationCode` e `SendPasswordResetCode`) interpola `username` e `newEmail` diretamente no template HTML via `fmt.Sprintf` sem `html.EscapeString`. Como `ChangeEmail` valida apenas `strings.Contains(newEmail, "@")`, caracteres como `<`, `>` e `"` permitem injetar HTML no e-mail enviado ao endereço antigo.
2. **Condição `!imageOnly` Invertida em `upload_handlers.go:181-192`:** Ao inspecionar os primeiros 512 bytes com `http.DetectContentType`, o bloqueio de `text/html` e `image/svg+xml` só executa `if !imageOnly`. Assim, uploads de avatar/banner/ícone (`imageOnly == true`) não rejeitam conteúdos HTML/SVG disfarçados com extensão `.png`/`.jpg`, nem validam `strings.HasPrefix(detectedType, "image/")`. Além disso, `getPublicBaseURL` (linhas `227-244`) confia em `r.Host` e `X-Forwarded-Proto` quando `CDN_BASE_URL` está vazio.
3. **Esquemas `data:`/`blob:` com `download` em Links Markdown (`client/src/components/Chat/FormattedMessage.tsx:762-774`):** A regex de links Markdown aceita qualquer esquema na 3ª alternativa (`|[^\s<)]+`), `formatAssetUrl` preserva `data:` e `blob:`, e a tag `<a>` inclui `download` incondicionalmente.

### Evidência
- **Arquivos:** `backend/internal/email/email.go:241-270`, `backend/internal/handlers/upload_handlers.go:181-192, 227-244`, `client/src/components/Chat/FormattedMessage.tsx:762-774`
```go
// upload_handlers.go:185-191
		detectedType := http.DetectContentType(sniffBuf[:n])
		if strings.Contains(detectedType, "text/html") || strings.Contains(detectedType, "image/svg+xml") {
			if !imageOnly {
				http.Error(w, `{"error":"Tipo de conteúdo de arquivo não permitido."}`, http.StatusBadRequest)
				return
			}
		}
```

### Impacto
Possibilidade de envio de e-mails de alerta contendo HTML arbitrário para phishing, upload de arquivos não-imagem nas rotas de avatar/banner e criação de links `data:` que disparam downloads automáticos no navegador.

### Sugestão de Correção
1. Aplicar `html.EscapeString(username)` e `html.EscapeString(newEmail)` em todos os métodos de `email.go` e validar o formato de e-mail com `net/mail.ParseAddress` em `ChangeEmail`.
2. Em `upload_handlers.go`, rejeitar `text/html` e `image/svg+xml` para **todos** os uploads; quando `imageOnly == true`, exigir `strings.HasPrefix(detectedType, "image/")`. Em `getPublicBaseURL`, utilizar `APP_URL`/`CDN_BASE_URL` configurado no servidor.
3. Em `FormattedMessage.tsx`, restringir links Markdown a `https?://` e `/assets/` e remover o atributo `download` genérico.

### Critérios de Aceite
- [ ] Todos os parâmetros dinâmicos em `email.go` passam por `html.EscapeString`.
- [ ] Uploads com `imageOnly == true` rejeitam qualquer arquivo cujo MIME detectado não seja `image/jpeg`, `image/png`, `image/webp` ou `image/gif`.
- [ ] Links Markdown com `data:`, `blob:` ou `javascript:` não são renderizados como tags `<a>` clicáveis em `FormattedMessage.tsx`.
--- FIM ISSUE 10 ---

--- ISSUE 11 ---
### Título
`[Segurança] Alinhamento de permissões de moderação e canais no Frontend (MessageItem e ChannelSettingsModal)`

### Labels Sugeridas
`security`, `medium`, `frontend`, `permissions`

### Descrição do Problema
1. Em `client/src/components/Chat/MessageItem.tsx:220-223`, `canDelete` considera apenas `isAuthor || isOwner`, impedindo que moderadores com `PermAdministrator` ou `PermManageMessages` vejam a opção de excluir mensagens na interface (apesar de o backend permitir).
2. Em `client/src/components/Chat/MessageItem.tsx:331-334`, a opção "Fixar/Desafixar Mensagem" é exibida para todos os membros sem checar `canManageMessages` em canais de servidor, e a rota `POST /api/channels/{channelID}/messages/{messageID}/pin` (`messageHandler.TogglePin`) não foi registrada em `backend/cmd/server/main.go`.
3. Em `client/src/components/Modals/ChannelSettingsModal.tsx:288-342`, o modal não valida `useGuildPermissions(activeGuild).canManageChannels` internamente antes de exibir ou submeter ações de edição/exclusão.

### Evidência
- **Arquivo:** `client/src/components/Chat/MessageItem.tsx` (linhas `220–223` e `331–334`)
```tsx
  const isAuthor = user?.id === message.author_id;
  const isOwner = contextType === 'channel' && activeGuild ? activeGuild.owner_id === user?.id : false;
  const canDelete = isAuthor || isOwner;
```

### Impacto
Moderadores com `MANAGE_MESSAGES` ficam impedidos pela UI de moderar mensagens, membros comuns veem o botão de fixar mensagens sem possuir permissão e o endpoint de pin de canais de servidor retorna 404/405 por não estar registrado no roteador.

### Sugestão de Correção
1. Usar `useGuildPermissions` em `MessageItem.tsx` para definir `canDelete = isAuthor || isOwner || perms.hasAdmin || perms.canManageMessages` e condicionar o botão de fixar em canais de servidor a `isOwner || perms.hasAdmin || perms.canManageMessages`.
2. Registrar `r.With(pinLimiter.Middleware).Post("/api/channels/{channelID}/messages/{messageID}/pin", messageHandler.TogglePin)` em `backend/cmd/server/main.go`.
3. Validar `canManageChannels` dentro de `ChannelSettingsModal.tsx`.

### Critérios de Aceite
- [ ] Moderadores com `MANAGE_MESSAGES` visualizam e executam a exclusão e fixação de mensagens em canais de servidor.
- [ ] Membros sem `MANAGE_MESSAGES` não visualizam a opção de fixar/desafixar mensagens em canais de servidor.
- [ ] `ChannelSettingsModal` bloqueia renderização e submissão caso `!perms.canManageChannels`.
--- FIM ISSUE 11 ---

--- ISSUE 12 ---
### Título
`[Segurança] Escopo de guilda na remoção de voice_sessions, validação de AckChannel e filtro de TYPING_START no WebSocket`

### Labels Sugeridas
`security`, `low`, `backend`, `isolation`

### Descrição do Problema
1. Em `KickMember` e `BanMember` (`backend/internal/handlers/guild_handlers.go:600, 685`), a query `DELETE FROM voice_sessions WHERE user_id = $1` remove o usuário de qualquer sessão de voz globalmente, mesmo que ele esteja conectado em uma chamada de outro servidor.
2. Em `AckChannel` (`backend/internal/handlers/message_handlers.go:1345-1364`), `req.MessageID` não é validado para confirmar que pertence ao `channelID`.
3. No WebSocket `TYPING_START` (`backend/internal/gateway/client.go:127-143`), o envio de eventos para `RecipientID` ou `UserIDs` não verifica se há bloqueio mútuo ou conversa em comum.

### Evidência
- **Arquivos:** `backend/internal/handlers/guild_handlers.go:600, 685`, `backend/internal/handlers/message_handlers.go:1345-1364`, `backend/internal/gateway/client.go:127-143`
```go
// guild_handlers.go:600
	if _, err := tx.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", targetUserID); err != nil {
```

### Impacto
Expulsar um usuário de um servidor derruba sua chamada ativa em outro servidor; IDs de mensagens arbitrários podem ser gravados em `channel_read_states`; e usuários podem enviar eventos `TYPING_START` para destinatários arbitrários via WebSocket.

### Sugestão de Correção
1. Em `KickMember` e `BanMember`, restringir para `DELETE FROM voice_sessions WHERE user_id = $1 AND channel_id IN (SELECT id FROM channels WHERE guild_id = $2)`.
2. Em `AckChannel`, verificar `WHERE id = $1 AND channel_id = $2` para `req.MessageID`.
3. Em `gateway/client.go`, validar ausência de bloqueio/existência de sala antes de retransmitir `TYPING_START` direto.

### Critérios de Aceite
- [ ] Expulsar ou banir um membro na Guilda A não desconecta sua sessão de voz ativa na Guilda B.
- [ ] `AckChannel` ignora ou rejeita `message_id` que não pertença ao `channelID` informado.
- [ ] Eventos `TYPING_START` diretos não são entregues a usuários que bloquearam o remetente.
--- FIM ISSUE 12 ---
