# Diretrizes de UI/UX Mobile-First e Responsividade

## 📱 Princípio Mobile-First
- Todo desenvolvimento de interface (UI), telas, modais e componentes deve ser pensado e implementado prioritariamente para telas móveis (smartphones) e expandido responsivamente para desktops (`sm:`, `md:`, `lg:`).

## 🖐️ Usabilidade Touch e Navegação Mobile
- **Drawers & Sidebars:** Em dispositivos móveis, barras laterais (lista de canais, lista de servidores, lista de membros) devem ser acessíveis via gavetas/drawers retráteis (hambúrguer ou swipe) com backdrop escuro e fechamento automático ao selecionar itens.
- **Áreas de Toque (Touch Targets):** Botões e ícones clicáveis devem ter área de toque mínima confortável para dedos (mínimo `40x40px` ou padding adequado).
- **Inputs & Teclados Móveis:** Garantir que barras de mensagem e formulários não quebrem o layout ou fiquem ocultos ao abrir o teclado virtual (`100dvh` / `h-[100dvh]` em vez de `100vh`).

## 🖥️ Adaptação Desktop
- Em telas maiores (`md:` ou superior), a interface deve expandir naturalmente para o layout desktop com múltiplas colunas fixas e maior densidade de informação.
