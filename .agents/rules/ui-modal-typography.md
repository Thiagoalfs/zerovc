# Diretrizes de Tipografia Padronizada para Modais e Views

## 🎚️ Constantes Oficiais (`client/src/constants/modalTypography.ts`)

| Categoria | Constante | Estilo Tailwind | Descrição |
|-----------|-----------|-----------------|-----------|
| **Toggles & Opções** | `MODAL_TOGGLE_HEADER_CLASS` / `MODAL_OPTION_HEADER_CLASS` | `text-sm font-bold text-white` | Títulos de switches, checkboxes e itens selecionáveis (14px, peso 700). |
| **Seções & Categorias** | `MODAL_SECTION_HEADER_CLASS` | `text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5` | Divisores e grupos de configurações em caixas altas (12px, tracking-wider). |
| **Labels de Inputs** | `MODAL_FIELD_LABEL_CLASS` | `block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5` | Rótulos de campos de texto, textareas e seletores (12px). |
| **Títulos de Modais** | `MODAL_TITLE_CLASS` | `text-lg sm:text-xl font-bold text-white` | Cabeçalho principal no topo de modais de diálogo (18-20px). |
| **Sub-modais / Diálogos** | `MODAL_DIALOG_TITLE_CLASS` | `text-base font-bold text-white` | Títulos de janelas de confirmação e sub-diálogos (16px). |
| **Card Simples / Sub-modal** | `MODAL_CARD_PADDING_CLASS` | `p-4 sm:p-6` | Padding interno geral para modais simples e sub-modais de edição. |
| **Cabeçalho de Modal** | `MODAL_HEADER_PADDING_CLASS` | `p-4 sm:p-6 pb-3` | Padding do bloco de cabeçalho de modais com divisão. |
| **Corpo / Formulário** | `MODAL_BODY_PADDING_CLASS` | `p-4 sm:p-6` | Padding do container de campos/conteúdo. |
| **Rodapé de Ações** | `MODAL_FOOTER_PADDING_CLASS` | `p-4 sm:p-6 pt-3` | Padding do bloco de botões de ação e cancelamento. |
| **Linha de Opções / Toggle** | `MODAL_ITEM_ROW_PADDING_CLASS` | `py-3.5 first:pt-0 last:pb-0` | Padding vertical para itens de lista em `divide-y divide-white/5`. |
| **Divisória de Seções** | `MODAL_DIVIDER_CLASS` | `h-px bg-white/5` | Linha separadora horizontal entre grupos de configurações. |
| **Descrição de Apoio** | `MODAL_DESCRIPTION_CLASS` | `text-xs text-gray-400 leading-relaxed` | Textos explicativos e descrições de switches e opções (12px). |
| **Botão Cancelar** | `MODAL_CANCEL_BUTTON_CLASS` | `px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:underline transition-all cursor-pointer disabled:opacity-50` | Botão padrão de cancelar em diálogos e rodapés. |
| **Botão Primário** | `MODAL_PRIMARY_BUTTON_CLASS` | `bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 cursor-pointer` | Botão padrão de confirmação/salvar. |
| **Botão Destrutivo** | `MODAL_DANGER_BUTTON_CLASS` | `bg-dnd hover:bg-red-600 active:scale-95 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 cursor-pointer` | Botão de exclusão, banimento e ações destrutivas irreversíveis. |
| **Backdrop de Modal** | `MODAL_BACKDROP_CLASS` | `fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150` | Overlay/backdrop padrão escurecido com blur. |
| **Switch Container** | `MODAL_SWITCH_CONTAINER_CLASS` | `w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0` | Invólucro do switch toggle interativo. |
| **Switch Knob** | `MODAL_SWITCH_KNOB_CLASS` | `bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200` | Bolinha interna do switch com animação translate. |

## 📌 Escopo de Aplicação
Esta regra aplica-se a **TODOS os modais e views** do aplicativo.
Sempre importe e utilize as constantes oficiais para evitar discrepâncias visuais de tamanho de fonte, peso ou espaçamentos.
