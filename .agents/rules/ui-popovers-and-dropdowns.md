# Diretrizes Oficiais para Dropdowns, Dropups e Popovers Flutuantes

Esta regra estabelece os padrões obrigatórios de posicionamento, renderização e comportamento para **todos os dropdowns, dropups, popovers e menus contextuais** do ZeroVC.

---

## 🚫 Proibições Estritas (Zero Drag / Zero Glitch)

1. **PROIBIDO Inicialização com Coordenadas Arbitrárias / Padrão:**
   * NUNCA inicialize o estado de coordenadas com valores fixos fictícios (como `useState({ bottom: 60, left: 10 })` ou `top: 0, left: 0`).
   * Isso faz com que o menu seja renderizado na posição errada no primeiro frame e depois "salte" ou "deslize" até o botão de destino, parecendo que está sendo arrastado pela tela.
   * **Padrão Obrigatório:** As coordenadas devem ser calculadas sincronamente na inicialização do estado (`useState(() => calculateCoords(anchorRef.current))`) e atualizadas via `useLayoutEffect` (antes do paint no DOM).
   * Caso o anchor ainda não esteja pronto, o menu **NÃO DEVE** ser renderizado: `if (!coords) return null;`.

2. **PROIBIDO Transições de Posicionamento (`transition-all` / `transition-[top,left,bottom]`):**
   * O container com `fixed` ou `absolute` do menu flutuante DEVE ter a classe explícita `transition-none` no que tange a propriedades de layout.
   * Animações permitidas são **exclusivamente de opacidade e escala** (ex: `animate-in fade-in zoom-in-95 duration-100`).
   * Transições CSS de coordenadas são estritamente vetadas para evitar interpolação de movimento ou sensação de arraste.

3. **PROIBIDO Arrastamento Nativo do Navegador (Ghost Drag & Text Selection):**
   * Todo dropdown, dropup e seus respectivos botões/gatilhos DEVEM conter:
     * `select-none` (`user-select: none;`)
     * `draggable={false}`
     * `onDragStart={(e) => e.preventDefault()}`
   * Nenhum elemento de menu ou botão acionador deve permitir a seleção de texto ou a criação de "imagem fantasma" ao ser clicado ou clicado-e-movido.

---

## 🎯 Padrão de Fechamento Resiliente

1. **Fechamento em Scroll e Resize:**
   * Menus flutuantes do tipo dropup/dropdown não devem tentar perseguir o botão em movimento enquanto o usuário rola a tela ou redimensiona a sidebar/janela.
   * Ao detectar eventos de `scroll` (com capture `true`) ou `resize`, o menu deve chamar imediatamente `onClose()`.

2. **Backdrop Transparente com Z-Index Adequado:**
   * Renderize um backdrop invisível `fixed inset-0 z-[120]` interceptando `onClick` e `onContextMenu` para fechar o popout com segurança sem disparar cliques indesejados em botões subjacentes.

3. **Renderização via Portal:**
   * Dropups e menus flutuantes que precisam ultrapassar containers com `overflow-hidden` (como a UserBar ou a Sidebar) DEVEM ser renderizados em `createPortal(..., document.body)`.

---

## 📋 Checklist de Verificação para Novos Dropdowns

- [ ] Coordenadas calculadas no `useState` inicial ou `useLayoutEffect` (sem valores default arbitrários que causem salto visual).
- [ ] `if (!coords) return null;` presente antes da montagem do JSX.
- [ ] Container com `transition-none` e `select-none`.
- [ ] Atributos `draggable={false}` e `onDragStart={(e) => e.preventDefault()}` no container e nos botões.
- [ ] Fechamento imediato em `scroll` e `resize`.
- [ ] Suporte a tecla `Escape`.
- [ ] Renderizado via `createPortal(..., document.body)` quando houver containers com `overflow-hidden`.
