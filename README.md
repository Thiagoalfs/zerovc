# ⚡ ZeroVC

> Plataforma de chat de texto, canais de voz WebRTC e transmissão de tela de ultra performance, projetada especificamente para rodar com alta estabilidade em servidores modestos (1 vCore e 2GB de RAM), acompanhada de um cliente desktop moderno em **Electron**.

---

## 🎯 Arquitetura & Otimizações

ZeroVC foi concebido para eliminar o overhead de memória e CPU tradicional de plataformas de comunicação:

```
[ Usuários (Desktop Electron) ]
       │
       ├─── (WebSocket + REST) ───────────► [ ZeroVC Gateway / API (Go) ] ~30 MB RAM
       │                                            │
       │                                            ├──► [ PostgreSQL 16 ] ~150 MB RAM
       │                                            │
       └─── (WebRTC UDP Opus/Video) ──────► [ LiveKit SFU Server ] ~120 MB RAM
                                                    │
                                            Total no Servidor: ~300 - 450 MB RAM
                                            (Sobrando ~1.5 GB livres na VPS de 2GB)
```

* **Backend em Go:** Consome apenas `~30MB` de RAM, com conexões WebSocket de baixa latência e broadcast de mensagens por servidor.
* **LiveKit SFU (WebRTC):** Roteamento puro de pacotes UDP (Opus para voz e VP9/H.264 para compartilhamento de tela) sem transcodificação pesada no servidor.
* **PostgreSQL 16 Tunado:** Configuração personalizada de buffers e conexões limitada a ~150-200MB de RAM.
* **Electron Desktop Client:** Interface idêntica ao Discord com captura de janelas nativa (`desktopCapturer`), detecção de fala em tempo real e cancelamento de eco/ruído.

---

## 🚀 Como Rodar o Servidor (Deploy em 1 Comando)

### Pré-requisitos
* Docker e Docker Compose instalados na VPS ou máquina local.

### 1. Iniciar os Serviços
Dentro do repositório, execute:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

Isso inicializará:
1. **PostgreSQL 16** (com schema e tabelas criadas automaticamente na porta `5432`).
2. **LiveKit SFU Server** (portas `7880`, `7881` e UDP `7882`, `50000-50050`).
3. **ZeroVC Go Backend** (porta `8080`).

Para checar a integridade do servidor:
```bash
curl http://localhost:8080/health
```

---

## 💻 Como Rodar o Cliente Desktop (Electron)

### Pré-requisitos
* Node.js 18+

### 1. Instalar Dependências
```bash
cd client
npm install
```

### 2. Rodar em Modo Desenvolvimento
```bash
npm run electron
```

### 3. Gerar o Instalador Desktop (Build de Produção)
```bash
# Gera o executável para seu sistema operacional (macOS DMG/App, Windows EXE ou Linux AppImage/deb)
npm run package
```

---

## 🔒 Portas e Firewall na VPS

Ao hospedar na sua VPS (1 vCore / 2GB RAM), libere as seguintes portas no firewall (`ufw`):

| Porta | Protocolo | Função |
| :--- | :--- | :--- |
| `8080` | TCP | API REST e Gateway WebSocket |
| `7880` | TCP | LiveKit HTTP/WebSocket Signal |
| `7881` | TCP | LiveKit Fallback |
| `7882` | UDP | WebRTC Media Primary |
| `50000-50050` | UDP | WebRTC ICE UDP Port Range |

---

## 🗄️ Estrutura do Banco de Dados (PostgreSQL)

O schema do banco está localizado em `backend/internal/database/schema.sql` e inclui:
* `users`: Usuários, hashes de senha (bcrypt), status (`online`, `idle`, `dnd`, `offline`).
* `guilds`: Servidores criados pelos usuários.
* `guild_members`: Associação de usuários a servidores com roles (`owner`, `admin`, `moderator`, `member`).
* `channels`: Canais de texto e canais de voz com posições ordenadas.
* `messages`: Mensagens de texto com anexos JSONB e suporte a respostas.
* `voice_sessions`: Registro em tempo real de quem está conectado, mutado, ensurdecido ou compartilhando tela.
* `dm_rooms` & `dm_messages`: Conversas privadas entre usuários.
