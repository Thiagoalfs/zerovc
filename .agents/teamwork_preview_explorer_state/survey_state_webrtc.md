# Relatório de Levantamento Arquitetural (Phase 0 Survey)
# R2: Gerenciamento de Estado (Zustand) & Otimização WebRTC / LiveKit

**Data de Elaboração:** 2026-09-17  
**Projeto:** ZeroVC (`client/`)  
**Escopo:** Requirement R2 (State Management & WebRTC/LiveKit Optimization)  
**Status do Agente:** Read-Only Investigation  

---

## 1. Resumo Executivo & Principais Descobertas

Este relatório apresenta o diagnóstico aprofundado do gerenciamento de estado Zustand (`client/src/stores/`), da integração WebRTC / LiveKit (`client/src/lib/livekit.ts`, `client/src/lib/processAudioBridge.ts`), e do ciclo de vida de re-renderização e conexões no cliente ZeroVC.

### Principais Diagnósticos:
1. **Ausência Generalizada de Seletores Zustand (Re-render Cascades):** Praticamente 100% dos componentes que utilizam `useGuildStore`, `useVoiceStore`, `useDMStore` e `useAuthStore` invocam o hook sem seletores (ex.: `const { user } = useAuthStore()`, `const { activeChannel, messages } = useGuildStore()`). Isso faz com que alterações de alta frequência — como indicadores de digitação (`typingUsers`), pacotes VAD de fala do LiveKit (`speakingUserIds` disparados 3 a 5 vezes por segundo), e chegada de qualquer mensagem de texto — re-renderizem o componente raiz `App.tsx`, o `ChannelList.tsx`, o `UserBar.tsx`, e até 200 instâncias de `MessageItem.tsx` simultaneamente.
2. **Condição de Corrida Crítica na Troca de Canais de Voz:** Em `voiceStore.ts:134`, ao trocar de canal de voz, `livekit.disconnect().catch(() => {})` é disparado de forma assíncrona desvinculada (sem `await`), enquanto `currentChannelId` é atualizado para o novo canal e `joinVoice` faz a requisição à API. O evento de desconexão da sala anterior emite `RoomEvent.Disconnected`, que aciona o callback `onDisconnected` do store, resetando `currentChannelId: null`. Ao término da requisição à API, a validação `if (get().currentChannelId !== channelId) return;` avalia como verdadeira e **aborta a conexão com o novo canal**, deixando o usuário desconectado e tocando o som de saída.
3. **Vazamento de Elementos DOM `<audio>` de Participantes Remotos:** No arquivo `livekit.ts`, quando participantes remotos desconectam (`RoomEvent.ParticipantDisconnected`), o método apenas chama `updateParticipants()`, mas **nunca remove** os elementos `<audio>` órfãos previamente criados e inseridos no `document.body` via `TrackSubscribed`. Em chamadas longas com entrada/saída de membros, acumulam-se dezenas de elementos de áudio zumbis no DOM.
4. **Sobrescrita de Callback de Limpeza na Captura de Áudio do Sistema:** No Electron, o `processAudioBridge.ts` define `track.onended = () => this.stopCapture()`. Porém, `livekit.ts:658` sobrescreve `processAudioTrack.onended` para despublicar a publicação, suprimindo o callback que chamaria `this.stopCapture()`. Como resultado, a ponte de áudio nativa (WASAPI) e o `AudioContext` associado continuam alocados indefinidamente após a finalização do compartilhamento.
5. **Conflito entre Chamadas DM (`callStore`) e Canais de Voz (`voiceStore`):** Ambos os stores compartilham a mesma instância singleton `export const livekit = new LiveKitManager()`. Ao iniciar ou aceitar uma chamada DM, `callStore` chama `livekit.connect()` que desconecta a sala LiveKit anterior sem notificar o `voiceStore`, deixando o `voiceStore` com estado inconsistente (`isConnected: true`). Além disso, `callStore` omite o callback `onTrackUpdated` e `onScreenShareEnded`, quebrando atualizações de participantes em DMs.
6. **Ausência de Tratamento de Reconexão LiveKit:** O `LiveKitManager` não implementa tratamento para os eventos `RoomEvent.Reconnecting`, `RoomEvent.Reconnected`, `RoomEvent.ConnectionQualityChanged` e `RoomEvent.MediaDevicesError`. Durante oscilações de rede (Wi-Fi/4G), o usuário não recebe feedback e a interface pode congelar no estado conectado.

---

## 2. Inventário dos Stores Zustand (`client/src/stores/`)

| Store | Arquivo | Responsabilidade | Principais Inconsistências & Vulnerabilidades |
|---|---|---|---|
| **`voiceStore`** | `client/src/stores/voiceStore.ts` | Conexão de canal de voz, mute, ensurdecer, câmera, tela, volumes, participantes. | • `speakingUserIds` atualiza por referência de array a cada VAD, causando re-renders constantes.<br>• `participantVolumes` é duplicação inútil de `userVolumes`.<br>• Corrida assíncrona no `disconnect()` ao trocar de canal.<br>• Consumo de `useVoiceStore()` sem seletores em múltiplos componentes. |
| **`guildStore`** | `client/src/stores/guildStore.ts` | Servidores, canais ativos, paginação de mensagens (200 máx), reações, fixadas, cargos, membros, emojis, permissões. | • Monólito com mais de 1200 linhas agregando responsabilidades díspares.<br>• `typingUsers` (Map) dispara re-render geral a cada tecla digitada.<br>• Consumido por 200+ `MessageItem`s sem seletor, gerando re-renders maciços. |
| **`dmStore`** | `client/src/stores/dmStore.ts` | Salas de mensagens diretas 1x1, mensagens, contadores de não lidas, reações, fixadas. | • Utilizado por `App`, `ChannelList`, `ParticipantCard`, `MessageItem` apenas pela ação `openDMWithUser`, mas como não há seletor, todos sofrem re-render a cada nova DM. |
| **`authStore`** | `client/src/stores/authStore.ts` | Sessão de usuário, autenticação 2FA, token, carregamento de perfil. | • Falta de seletores atômicos. Atualizações de status do perfil propagam re-render na árvore inteira do `App`.<br>• O `useEffect` de registro de WebSockets em `App.tsx` depende de `[token, user]`, remontando 38 handlers a cada toque de perfil. |
| **`callStore`** | `client/src/stores/callStore.ts` | Chamadas diretas 1x1 (WebRTC/LiveKit), ringing, aceite, rejeição. | • Compartilha o singleton `livekit` sem sincronização com `voiceStore`.<br>• Omitiu callbacks vitais (`onTrackUpdated`, `onScreenShareEnded`) em `livekit.connect()`. |
| **`dmGroupStore`** | `client/src/stores/dmGroupStore.ts` | Conversas em grupo DM (mensagens, membros, paginação). | • Falta de seletores granulares e otimização por canal/grupo. |
| **`friendStore`** | `client/src/stores/friendStore.ts` | Lista de amigos, solicitações pendentes e recebidas. | • Dispara refetch completo (`fetchFriends`) em qualquer evento de amizade. |
| **`settingsStore`** | `client/src/stores/settingsStore.ts` | Configurações de UI, zoom, áudio DSP (rnnoise, silero, VAD), sons. | • Estrutura bem organizada; consome seletores atômicos em alguns pontos (`s => s.channelListWidth`). |
| **`favoriteGifStore`** | `client/src/stores/favoriteGifStore.ts` | Armazenamento otimista de GIFs favoritos. | • Consumido em `MessageItem` sem seletor, re-renderizando a lista ao favoritar. |

---

## 3. Análise de Reatividade & Padrões de Re-renderização

### 3.1 O Problema da Ausência de Seletores
No Zustand v4, quando um componente invoca `const state = useStore()` ou `const { a, b } = useStore()`, o React registra uma assinatura para **qualquer modificação** de qualquer propriedade do store.

#### Caso 1: O Componente Raiz `App.tsx` (`lines 48-73`)
```tsx
// Localização: client/src/App.tsx:48-73
export const App: React.FC = () => {
  const { user, token, isCheckingAuth, checkAuth, setUser } = useAuthStore();
  const {
    fetchGuilds,
    activeGuild,
    activeChannel,
    addMessage,
    updateMessageInStore,
    removeMessageFromStore,
    updateVoiceState,
    setTyping,
    selectGuild,
    selectChannel,
  } = useGuildStore();
  const { handleFriendEvent } = useFriendStore();
  const {
    isConnected,
    currentChannelId,
    isMuted,
    isScreensharing,
    watchedParticipantId,
    toggleMute,
    leaveVoice,
  } = useVoiceStore();
  const { addMessage: addDMMessage } = useDMStore();
```
**Impacto:**  
- `App` assina simultaneamente `authStore`, `guildStore`, `friendStore`, `voiceStore` e `dmStore` sem seletores.
- Quando alguém fala em qualquer canal de voz (`voiceStore.speakingUserIds`), `App` re-renderiza.
- Quando alguém digita em qualquer canal de texto (`guildStore.typingUsers`), `App` re-renderiza.
- Quando uma mensagem chega em qualquer canal ou DM (`guildStore.messages`, `dmStore.messages`), `App` re-renderiza.
- Por ser o nó raiz da aplicação, sua re-renderização força a reconciliação do React em todo o DOM ativo.

#### Caso 2: `MessageItem.tsx` (`lines 102-118`)
```tsx
// Localização: client/src/components/Chat/MessageItem.tsx:102-118
export const MessageItem: React.FC<MessageItemProps> = ({ ... }) => {
  const { user } = useAuthStore();
  const {
    activeGuild,
    editMessage: guildEditMessage,
    deleteMessage: guildDeleteMessage,
    toggleReaction: guildToggleReaction,
    togglePin: guildTogglePin,
    kickMember,
    banMember,
    muteMember,
    assignRole,
    removeRole,
    sendMessage: guildSendMessage,
    removeMessageFromStore: guildRemoveMessage,
  } = useGuildStore();
  const { openDMWithUser } = useDMStore();
  const { isFavorited, toggleFavorite } = useFavoriteGifStore();
```
**Impacto:**  
- O canal de texto exibe até 200 instâncias de `MessageItem`.
- Nenhuma instância possui `React.memo`.
- Cada uma das 200 mensagens assina `useGuildStore()`, `useDMStore()`, `useFavoriteGifStore()`.
- Um simples caractere digitado aciona o WebSocket `TYPING_START`, modificando `typingUsers` no `guildStore`. Resultado: **todas as 200 mensagens re-renderizam**, consumindo ciclos preciosos de CPU.

#### Caso 3: `ChannelList.tsx` e `UserBar.tsx`
```tsx
// Localização: client/src/components/Sidebar/ChannelList.tsx:74-101
  const { user } = useAuthStore();
  const { activeGuild, activeChannel, ... } = useGuildStore();
  const { openDMWithUser } = useDMStore();
  const {
    currentChannelId,
    joinVoice,
    isConnected,
    isConnecting,
    speakingUserIds,
    userVolumes,
    streamVolumes,
    setUserVolume,
    setStreamVolume,
  } = useVoiceStore();
```
**Impacto:**  
- `ChannelList` e `UserBar` assinam `speakingUserIds`, `userVolumes`, `streamVolumes`.
- A cada fração de segundo em que um participante fala, `speakingUserIds` atualiza no `voiceStore`, acionando re-renders na barra lateral completa.

### 3.2 Estratégia de Refatoração de Seletores Proposta

Utilizar as ferramentas nativas do Zustand (`zustand/shallow` ou seletores atômicos) e segregar ações de estado:

```tsx
// Exemplo de Refatoração Proposta para MessageItem.tsx
// 1. Seletores Atômicos para valores primitivos ou imutáveis:
const currentUserId = useAuthStore((s) => s.user?.id);

// 2. Ações isoladas (não causam re-render porque funções Zustand são referencialmente estáveis):
const editMessage = useGuildStore((s) => s.editMessage);
const deleteMessage = useGuildStore((s) => s.deleteMessage);
const toggleReaction = useGuildStore((s) => s.toggleReaction);
const openDMWithUser = useDMStore((s) => s.openDMWithUser);

// 3. useShallow para múltiplos estados relacionados:
import { shallow } from 'zustand/shallow'; // ou useShallow em zustand/react/shallow
const { isConnected, currentChannelId } = useVoiceStore(
  (s) => ({ isConnected: s.isConnected, currentChannelId: s.currentChannelId }),
  shallow
);
```

---

## 4. Arquitetura WebRTC / LiveKit & Gerenciamento de Ciclo de Vida

### 4.1 Ciclo de Vida da Sala (`Room`) e dos Participantes
A classe `LiveKitManager` em `client/src/lib/livekit.ts` atua como controladora central da biblioteca `livekit-client`.

```
[LiveKitManager] (Singleton)
  │
  ├── Room (Instância livekit-client Room)
  │     ├── LocalParticipant (Audio, Video, ScreenShare)
  │     └── RemoteParticipants (Map<identity, RemoteParticipant>)
  │
  ├── Attached HTMLMediaElements (Map<sid, HTMLMediaElement>)
  │     ├── attachedUserAudioElements (Voz de participantes)
  │     └── attachedStreamAudioElements (Áudio de telas compartilhadas)
  │
  └── ProcessAudioBridge (Captura de áudio nativo WASAPI Loopback via Electron)
```

### 4.2 Falhas Críticas no Ciclo de Vida e Tratamento de Erros

#### Bug 1: Condição de Corrida no `joinVoice` ao trocar de canal
Em `client/src/stores/voiceStore.ts:130-150`:
```ts
    const previousChannelId = get().currentChannelId;
    if (previousChannelId && previousChannelId !== channelId) {
      // Disconnect previous channel in background without blocking current join request
      api.channels.leaveVoice(previousChannelId).catch(() => {});
      livekit.disconnect().catch(() => {}); // <--- CORRIDA ASSÍNCRONA
    }

    set({ isConnecting: true, currentChannelId: channelId, currentGuildId: guildId || null });

    try {
      const res = await api.channels.joinVoice(channelId, { ... });

      // Check if user changed mind or joined another channel while requesting
      if (get().currentChannelId !== channelId) return; // <--- ABORTA INDEVIDAMENTE!
```
**Análise do Fluxo de Falha:**
1. Usuário está no Canal A e clica no Canal B.
2. `joinVoice(Canal B)` dispara `livekit.disconnect()` sem `await`.
3. `currentChannelId` é definido como Canal B.
4. Enquanto a requisição `api.channels.joinVoice(Canal B)` está em trânsito pela rede, `livekit.disconnect()` conclui a desconexão do Canal A.
5. O Room da LiveKit emite `RoomEvent.Disconnected`.
6. O listener de `onDisconnected` em `voiceStore.ts:197` executa:
   ```ts
   set({
     currentChannelId: null,
     isConnected: false,
     isConnecting: false,
     ...
   });
   ```
7. A resposta da API do Canal B chega. A verificação `if (get().currentChannelId !== channelId)` compara `null !== Canal B` (Verdadeiro!) e **aborta a conexão**.
8. O usuário fica sem voz e escuta o som de saída da sala.

**Solução Recomendada:**
A desconexão da sala anterior deve ser aguardada explicitamente (`await livekit.disconnect()`) **antes** de atualizar o estado de transição e antes de solicitar o novo token à API, ou o callback `onDisconnected` deve verificar se uma transição intencional de canal está em andamento através de uma flag/ID de transição.

#### Bug 2: Re-renderização excessiva por `ActiveSpeakersChanged`
Em `livekit.ts:225-234`:
```ts
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const ids = speakers
        .filter((s) => {
          const micPub = s.getTrackPublication(Track.Source.Microphone);
          return micPub && !micPub.isMuted && micPub.isEnabled !== false;
        })
        .map((s) => s.identity);
      this.onSpeakingChanged?.(ids);
    });
```
Em `voiceStore.ts:169-171`:
```ts
    onSpeakingChanged: (speakingUserIds) => {
      set({ speakingUserIds });
    },
```
**Análise:**
Mesmo que a lista de falantes permaneça idêntica (ex.: `['user-1']` para `['user-1']`, ou `[]` para `[]`), uma nova referência de array é passada para o `set()`, acionando atualizações nos observadores a cada 200ms.
**Solução Recomendada:**
Adicionar verificação de igualdade rasa antes do `set`:
```ts
onSpeakingChanged: (speakingUserIds) => {
  const current = get().speakingUserIds;
  if (
    current.length === speakingUserIds.length &&
    current.every((id, idx) => id === speakingUserIds[idx])
  ) {
    return;
  }
  set({ speakingUserIds });
}
```

#### Bug 3: Omissão de Callbacks em `callStore.ts`
Em `callStore.ts:122-132`:
```ts
      await livekit.connect(livekitUrl, token, {
        autoEnableMicrophone: !shouldMute,
        onParticipantsChanged: (participants) => {
          set({ participants });
        },
        onSpeakingChanged: (speakingUserIds) => {
          set({ speakingUserIds });
        },
        onDisconnected: (reason) => { ... }
      });
```
Faltam:
- `onTrackUpdated`: Quando o outro participante liga a câmera ou inicia transmissão de tela na chamada 1x1, o store não é notificado da alteração das tracks publicadas.
- `onScreenShareEnded`: Se o usuário encerra o compartilhamento pela barra do navegador/SO, o store nunca atualiza `isScreensharing: false`.

#### Bug 4: Conflito de Instância Singleton entre `voiceStore` e `callStore`
Ambos usam o mesmo `export const livekit = new LiveKitManager()`.
Se o usuário está em um canal de voz de servidor e recebe/aceita uma chamada DM:
- `callStore` invoca `livekit.connect()`.
- O método desconecta a sala do canal de voz, mas **o `voiceStore` não sabe disso**.
- A interface exibe simultaneamente o canal de voz como "conectado" e a chamada DM como "conectada".
**Solução Recomendada:**
Ao iniciar/aceitar chamada DM, forçar `useVoiceStore.getState().leaveVoice()`, e vice-versa (`joinVoice` deve abortar chamadas ativas em `callStore`).

---

## 5. Vazamento de Listeners & Ciclo de Vida do DOM

### 5.1 Elementos `<audio>` Órfãos no `document.body`
Em `livekit.ts:236-277`, cada track de áudio remota recebida é anexada via `track.attach()` e inserida diretamente em `document.body`.
Ao desconectar a sala inteira (`RoomEvent.Disconnected`), `this.attachedAudioElements.forEach(el => el.remove())` é executado.
**Porém**, quando apenas um participante remoto se desconecta individualmente da sala (`RoomEvent.ParticipantDisconnected`, linhas 221-224):
```ts
    room.on(RoomEvent.ParticipantDisconnected, () => {
      updateParticipants();
    });
```
Nenhum elemento de áudio referente àquele participante é removido do DOM ou das Maps internas (`attachedAudioElements`, `attachedUserAudioElements`, `attachedStreamAudioElements`).
**Solução Recomendada:**
No evento `ParticipantDisconnected(participant)`, iterar pelas publicações de áudio daquele participante, remover os respectivos elementos de áudio do DOM e limpar as chaves correspondentes nas Maps internas.

### 5.2 Sobrescrita do `track.onended` no Áudio de Processo
Em `processAudioBridge.ts:176-180`:
```ts
      const track = this.destinationNode.stream.getAudioTracks()[0] || null;
      if (track) {
        track.onended = () => {
          this.stopCapture();
        };
      }
      return track;
```
Em `livekit.ts:658-664`:
```ts
      const processAudioTrack = await processAudioBridge.startCapture(resolvedSourceId);
      if (processAudioTrack) {
        this.activeMediaStreamTracks.add(processAudioTrack);
        processAudioTrack.onended = () => { // <--- SOBRESCREVE O CALLBACK ANTERIOR!
          const audioPub = this.room?.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
          if (audioPub?.track) {
            this.room?.localParticipant.unpublishTrack(audioPub.track);
          }
        };
```
Ao sobrescrever `processAudioTrack.onended`, `this.stopCapture()` **nunca é chamado**. A thread de captura de áudio WASAPI em background e o `AudioWorkletNode` permanecem ativos, vazando recursos de áudio do sistema operacional.
**Solução Recomendada:**
Encadear os callbacks:
```ts
const prevOnEnded = processAudioTrack.onended;
processAudioTrack.onended = () => {
  prevOnEnded?.call(processAudioTrack);
  // rotina de unpublish...
};
```

### 5.3 Churn de Handlers WebSocket em `App.tsx`
Em `App.tsx:1183`:
```tsx
  useEffect(() => {
    if (token && user) {
      // 38 x socket.on(...)
      return () => {
        // 38 x socket.off(...)
      };
    }
  }, [token, user]); // <--- Dependência do objeto `user` completo!
```
Qualquer alteração superficial no objeto `user` (como atualização de status customizado, avatar, ou presença) recria a função do efeito, desconectando e reconectando todos os 38 listeners do gateway WebSocket.
**Solução Recomendada:**
A dependência do hook deve ser estrita: `[token, user?.id]`. Mudanças nos atributos mutáveis do usuário devem ser gerenciadas internamente via eventos WebSocket, sem recriar os listeners globais.

---

## 6. Lógica de Reconexão & Resiliência de Rede

### 6.1 WebSocket Gateway (`client/src/lib/socket.ts`)
- **Estratégia:** Implementa backoff exponencial com jitter (`min(15000, 1000 * 1.8^attempts) + rand(0, 1000)`).
- **Ressincronização:** Possui mecanismo `onReconnect(callback)` que, em `App.tsx:1100-1139`, recupera com sucesso as últimas 50 mensagens do canal ativo, o estado de leitura do servidor, lista de amigos e salas de DM.
- **Avaliação:** Sólido e adequado para a camada de sinalização.

### 6.2 WebRTC LiveKit (`client/src/lib/livekit.ts`)
- **Gaps Identificados:**
  1. Ausência de tratamento para `RoomEvent.Reconnecting`:
     Durante transições de rede ou instabilidade, a sala entra em estado de reconexão do WebRTC ICE/DTLS. O `voiceStore` não expõe essa informação (`isReconnecting`), impedindo a UI de exibir o banner ou ícone de tentativa de reconexão.
  2. Ausência de tratamento para `RoomEvent.Reconnected`:
     Quando a sala reconecta com sucesso, é mandatório invocar `room.startAudio()` para contornar políticas de autoplay do navegador e reavaliar tracks de participantes.
  3. Falta de medição de qualidade de conexão:
     LiveKit emite `RoomEvent.ConnectionQualityChanged(quality, participant)`. Essa informação não é capturada nem repassada aos stores, impedindo a exibição das barras de sinal de conexão (excelente, bom, ruim).

---

## 7. Matriz de Interações: Stores vs. Componentes

| Componente | Stores Consumidos | Utiliza Seletores? | Principais Riscos de Desempenho / Estabilidade |
|---|---|---|---|
| **`App.tsx`** | `authStore`, `guildStore`, `friendStore`, `voiceStore`, `dmStore`, `settingsStore` | ❌ Não (exceto `channelListWidth`) | Re-renderiza a árvore inteira a qualquer evento de texto, voz ou presença. Churn de 38 listeners WebSocket. |
| **`VoiceRoom.tsx`** | `voiceStore` | ❌ Não | Reavalia o algoritmo de grade de tela 16:9 a cada evento de fala dos participantes. |
| **`ParticipantCard.tsx`** | `authStore`, `guildStore`, `dmStore`, `voiceStore` | ❌ Não | Re-renderiza a cada nova mensagem do servidor ou alteração de volume de qualquer outro participante. |
| **`VoiceFloatingPiP.tsx`** | `authStore`, `guildStore`, `dmStore`, `voiceStore` | ❌ Não | Re-renderiza a cada mensagem de texto da guilda ativa mesmo estando minimizado em PiP. |
| **`ChannelList.tsx`** | `authStore`, `guildStore`, `dmStore`, `voiceStore`, `settingsStore` | ❌ Não (exceto `channelListWidth`) | Re-renderiza a lista inteira de canais e categorias a cada mensagem ou fala. |
| **`UserBar.tsx`** | `authStore`, `voiceStore`, `guildStore` | ❌ Não | Assina a guilda inteira só para abrir o canal de voz ativo. |
| **`ChatArea.tsx`** | `authStore`, `guildStore` | ❌ Não | Re-renderiza a área de chat completa mesmo quando outro canal do servidor recebe mensagens. |
| **`MessageItem.tsx`** | `authStore`, `guildStore`, `dmStore`, `favoriteGifStore` | ❌ Não | Multiplica re-renders por 200 mensagens visíveis a cada tecla digitada (`typingUsers`). |
| **`ActiveCallOverlay.tsx`** | `callStore`, `authStore` | ❌ Não | Re-renderiza a cada evento de fala na chamada DM. |
| **`IncomingCallModal.tsx`** | `callStore` | ❌ Não | Componente leve, mas assina o store inteiro sem necessidade. |
| **`ScreenShareModal.tsx`** | `voiceStore`, `callStore` | ❌ Não | Assina o store inteiro quando só precisa disparar o método de compartilhamento. |

---

## 8. Recomendações Acionáveis para a Fase de Implementação (R2)

### 8.1 Otimização de Stores Zustand
1. **Adotar Seletores Estritos (`useShallow` ou Seletores Atômicos):**
   - Em `MessageItem.tsx`, substituir chamadas monolíticas por seletores de ações puras (`const editMessage = useGuildStore(s => s.editMessage)`) e memoizar o componente com `React.memo`.
   - Em `App.tsx`, `ChannelList.tsx` e `UserBar.tsx`, extrair apenas os IDs ou primitivos estritamente necessários via seletores granulares.
2. **Debounce / Shallow Compare em Estados de Alta Frequência:**
   - No `voiceStore`, verificar igualdade rasa de arrays antes de `set({ speakingUserIds })`.
   - Eliminar `participantVolumes` redundante em favor de `userVolumes`.
3. **Isolamento de Canais no `guildStore`:**
   - Separar o estado de digitação (`typingUsers`) do restante do store ou garantir que apenas o indicador de digitação assine essa propriedade.

### 8.2 Estabilização do WebRTC & LiveKit
1. **Eliminar a Corrida de Desconexão na Troca de Canais:**
   - Em `voiceStore.joinVoice`, tornar a desconexão síncrona/aguardada antes da requisição de entrada, ou introduzir um identificador de transição (`transitioningToChannelId`) para ignorar o evento de desconexão da sala anterior.
2. **Limpeza Adequada de Elementos DOM no `LiveKitManager`:**
   - Implementar limpeza de elementos `<audio>` no evento `RoomEvent.ParticipantDisconnected`.
3. **Sincronização entre `voiceStore` e `callStore`:**
   - Garantir que a ativação de uma chamada DM finalize explicitamente qualquer conexão de canal de voz ativa e vice-versa.
   - Fornecer os callbacks `onTrackUpdated` e `onScreenShareEnded` ao conectar em chamadas DM.
4. **Resiliência a Quedas de Rede:**
   - Adicionar manipuladores para `RoomEvent.Reconnecting` e `RoomEvent.Reconnected` no `LiveKitManager`, expondo o status `isReconnecting` no `voiceStore` para fornecer feedback visual ao usuário.
5. **Preservação de Handlers no `processAudioBridge`:**
   - Encadear os callbacks `onended` das tracks nativas de áudio do sistema para garantir o encerramento do binário de captura WASAPI.
