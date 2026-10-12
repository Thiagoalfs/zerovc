# Diretrizes de Tipografia Padronizada para Modais e Views

## 🎚️ Constantes Oficiais (`client/src/constants/modalTypography.ts`)

| Categoria | Constante | Estilo Tailwind | Descrição |
|-----------|-----------|-----------------|-----------|
| **Toggles & Opções** | `MODAL_TOGGLE_HEADER_CLASS` / `MODAL_OPTION_HEADER_CLASS` | `text-sm font-bold text-white` | Títulos de switches, checkboxes e itens selecionáveis (14px, peso 700). |
| **Seções & Categorias** | `MODAL_SECTION_HEADER_CLASS` | `text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5` | Divisores e grupos de configurações em caixas altas (12px, tracking-wider). |
| **Labels de Inputs** | `MODAL_FIELD_LABEL_CLASS` | `block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5` | Rótulos de campos de texto, textareas e seletores (12px). |
| **Títulos de Modais** | `MODAL_TITLE_CLASS` | `text-lg sm:text-xl font-bold text-white` | Cabeçalho principal no topo de modais de diálogo (18-20px). |
| **Sub-modais / Diálogos** | `MODAL_DIALOG_TITLE_CLASS` | `text-base font-bold text-white` | Títulos de janelas de confirmação e sub-diálogos (16px). |

## 📌 Escopo de Aplicação
Esta regra aplica-se a **TODOS os modais e views** do aplicativo.
Sempre importe e utilize as constantes oficiais para evitar discrepâncias visuais de tamanho de fonte, peso ou espaçamentos.
