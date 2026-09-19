# Plano de Ação — Bugs de Compartilhamento de Áudio (ZeroVC)

Data: 15/09/2026 · Diagnóstico baseado em leitura do código + testes empíricos na máquina (Windows 11 Pro, build 26200 / 25H2).

## Sintomas reportados
1. Ao compartilhar o som de uma **janela**, toca o som do **PC inteiro**.
2. O compartilhamento de som do **PC inteiro** dá **eco nas vozes** da call.

## Causas-raiz encontradas (com evidências)

### CR-1 — O app instalado está desatualizado (não tem as últimas correções)
- Instalado em `%LOCALAPPDATA%/Programs/ZeroVC`: `main.js` do **asar** contém a lógica do commit `5838dba` (11/09 22:30) e o `zerovc-audio-capture.exe` é o antigo (285.696 bytes, 11/09).
- O repo já tem o `d1f0981` (13/09): novo exe (290.816 bytes) com mix-format query + resampler. **Nada disso está rodando na sua máquina.**
- O renderer no app empacotado vem do **servidor remoto** (`index-CyLsdzIz.js`, ainda sem publicar `Bw_ZZ-h3`?), então o comportamento real = mix de versões antigas de main + exe + web.

### CR-2 — Caminho de DM/chamadas publica o PC inteiro, sem exclusão (fonte do eco)
- `callStore.startScreenShare()` chama `livekit.setScreenShareEnabled(true)` **sem `sourceId`** → cai no branch "web" → o Electron responde via `setDisplayMediaRequestHandler` em `main.ts`, que entrega `audio: 'loopback'` (mix do PC inteiro) **sem passar pela captura nativa com exclusão de árvore**.
- É exatamente o sintoma 2: as vozes da call voltam para os outros como eco.
- O botão "compartilhar tela" das chamadas DM (`ActiveCallOverlay.tsx`) usa esse caminho; o do canal de voz usa `ScreenShareModal` (que passa `sourceId` e usa a ponte nativa).

### CR-3 — Fallback silencioso para o mix completo no exe nativo (amplifica os dois sintomas)
- Tanto no exe antigo quanto no atual: se a ativação `PROCESS_LOOPBACK` (include/exclude) falhar **por qualquer motivo**, o binário cai para `StartClassicDefaultEndpointLoopback` = **loopback do dispositivo padrão = som do PC inteiro, com as vozes da call incluídas**.
- Nos logs só aparece em **stderr**, que ninguém nunca olha — do ponto de vista do usuário, parece "bugado" sem explicação.
- Evidência: o exe antigo e o novo têm o mesmo comportamento de fallback; os testes G/G-INST (include do próprio PID com WAV) funcionaram, então o mecanismo base opera nesta build — mas basta uma condição de runtime (app reiniciado, PID trocado, permissão, áudio SES) para cair no fallback completo.

### CR-4 — Roteamento de "vozes para fone" (`applyCallAudioRouting`) nunca é ativado no Electron
- `livekit.ts` só chama `setCallAudioRoutingForCapture(true)` no branch **web/getDisplayMedia** (e agora sabemos que esse branch no Electron = loopback total via handler).
- No branch **Electron com `sourceId`** (o principal!), o roteamento **nunca é ativado**, mesmo publicando a track `screen_share_audio` via ponte nativa. Logo, o app fica sempre dependente 100% da exclusão WASAPI da árvore.

### CR-5 — Apenas 1 dispositivo de saída = impossível separar (limitação física)
- `pickSecondaryOutputDeviceId` avisa: se o usuário tiver só 1 saída (ex.: só alto-falante), não há como mandar as vozes para outro dispositivo. Nesse cenário, qualquer captura de mix total vai carregar as vozes → eco.
- Com 2+ saídas (fone + caixa), o roteamento separa fisicamente as vozes do que é capturado. **Este é o mecanismo que o Discord usa.**

### CR-6 — `include`/`exclude` WASAPI confirmados funcionais nesta build
- Testes executados na sua máquina (com áudio atribuído ao processo, via SoundPlayer):
  - **G**: include do próprio PID → capturou os sons do processo ✓
  - **G-INST** (exe instalado): idem ✓
  - **F2**: exclude do próprio PID → silêncio ✓
  - **H**: exclude do PID do pai com áudio em processo filho → silêncio ✓ (árvore OK)
  - **H-INST** (exe instalado): idem ✓
- O mecanismo WASAPI process loopback **funciona** nesta build 26200. O problema é **qual caminho o app realmente usa** (CR-2) e o **fallback** (CR-3), não a API do Windows.

## Observações adicionais
- O handler do Electron para "screenshare" responde `audio: 'loopback'` sempre que o renderer pede `getDisplayMedia` — qualquer chamada DM que publique screen share cai aqui.
- O app também usa `restrictOwnAudio: true` + `suppressLocalAudioPlayback: true` só no branch web. No Electron, o loopback do handler ignora isso.
- Exe do repo (d1f0981) tem conversor 48k estéreo + resampler. O exe antigo não tem; se o servidor tocar mix em 44.1kHz ou 6 canais, o exe antigo gravaria lixo — mas os testes mostraram 48k/2ch/float, então isso não é o gatilho hoje.

## Plano de ação (priorizado)

### FASE 0 — Saneamento imediato (pode fazer hoje)
1. **Reinstalar/reempacotar o app** com o código atual (5838dba + d1f0981): `cd client && npm run package`. Isso garante main.ts + exe novos.
2. **Publicar o bundle web novo no backend** (`backend/web`) para o app empacotado carregar a versão certa do renderer. Conferir que `startProcessAudioCapture` está presente no JS servido.
3. Teste rápido pós-instalação: compartilhar tela inteira → **não deve dar eco**; compartilhar janela do Spotify → deve tocar só Spotify.

### FASE 1 — Corrigir o caminho de DM/chamadas (CR-2, resolve o eco)
4. Em `callStore.ts`, `startScreenShare()` deve **sempre usar o mesmo fluxo do ScreenShareModal**: abrir o modal ou, se quiser manter o comportamento atual de "compartilhar sem picker", passar o `sourceId` da tela principal via `electronAPI.getScreenSources()` e usar `includeAudio: true` para cair na ponte nativa com exclusão de árvore.
5. Alternativa mais robusta: no `main.ts`, o `setDisplayMediaRequestHandler` deve **delegar para a mesma lógica da ponte nativa** (spawn do exe com `--mode exclude --zerovc-pid <pid>`) e devolver `{ video, audio: <stream da ponte> }` em vez de `audio: 'loopback'`.
6. Ativar o **roteamento de vozes para dispositivo secundário também no branch Electron** (`setCallAudioRoutingForCapture(true)` após publicar `screen_share_audio` no branch com `sourceId`) — CR-4.

### FASE 2 — Eliminar o fallback silencioso (CR-3)
7. No `.cpp`, quando o loopback por processo falhar, **não iniciar o loopback clássico por padrão**. Em vez disso: sair com código != 0 e sinalizar erro estruturado no stdout (ex.: JSON `{"error":"..."}`) — o renderer pode mostrar toast "não foi possível capturar áudio isolado" e continuar só com vídeo.
8. Se quiser manter fallback opcional, colocá-lo atrás de flag explícita (`--allow-classic-fallback`) que o main.ts passa só quando o usuário marcar "incluir vozes da call" nas configurações.

### FASE 3 — UX e transparência (CR-5)
9. No `ScreenShareModal`, mostrar aviso quando `pickSecondaryOutputDeviceId()` retornar `null`: "Para evitar eco ao compartilhar com áudio do PC, conecte um fone (2º dispositivo) ou selecione 'som da janela' para capturar só o app."
10. Na UI de settings, expor "dispositivo para vozes durante compartilhamento" (`zerovc_call_audio_output_device`) com teste audível e dica de usar o papel "eCommunications" do Windows.

### FASE 4 — Hardening (opcional, forte)
11. Adicionar telemetria de modo de captura (include/exclude/fallback) + versão do exe no handshake da call, para diagnóstico remoto quando usuários reportarem "eco".
12. Testes automatizados com os scripts em `.freebuff/` (play_wav + analyze_pcm + run_capture_test) virarem uma suíte `npm run test:audio` que valida include/exclude/fallback a cada mudança no `.cpp`.

## Como validar depois de aplicar
- **Sintoma 1**: compartilhar uma janela (ex.: Spotify) → som deve sair apenas do app compartilhado, não do PC.
- **Sintoma 2**: compartilhar tela inteira em call de canal e de DM → a outra pessoa NÃO deve ouvir a própria voz voltando (eco) nem o áudio da call.
- Log do exe (`[WASAPI Capture] Mode: ...`) deve mostrar `INCLUDE` para janela e `EXCLUDE <pid>` para tela; nunca `FULL SCREEN DEFAULT ENDPOINT LOOPBACK (Fallback)`.

## Ficheiros-chave (para contexto rápido)
- `client/electron/main.ts` — handler `start-process-audio-capture`, `setDisplayMediaRequestHandler`, spawn do exe.
- `client/src/lib/livekit.ts` — branch Electron vs web, roteamento de call audio, publicação de `screen_share_audio`.
- `client/src/lib/processAudioBridge.ts — AudioWorklet + IPC de chunks PCM.
- `client/src/stores/callStore.ts` — fluxo DM que bypassa a ponte nativa.
- `client/electron/native/process_audio_capture.cpp` — include/exclude/fallback, conversor 48k.
