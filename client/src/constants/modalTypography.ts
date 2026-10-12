/**
 * Diretrizes e Classes Tipográficas Oficiais do ZeroVC
 *
 * Padronização de tamanho, peso e espaçamento para todos os cabeçalhos,
 * toggles, opções, títulos de modais e labels em modais e views.
 */

// 1. Toggles e Opções: 14px (text-sm) + font-bold (peso 700) + text-white
export const MODAL_TOGGLE_HEADER_CLASS = 'text-sm font-bold text-white';
export const MODAL_OPTION_HEADER_CLASS = 'text-sm font-bold text-white';
export const TOGGLE_HEADER_TYPOGRAPHY = MODAL_TOGGLE_HEADER_CLASS;

// 2. Títulos de Seção / Categoria (ex: "CONFIGURAÇÕES DO APP", "ENTRADA & SAÍDA DE ÁUDIO")
// 12px (text-xs) + font-bold + text-gray-400 + uppercase + tracking-wider
export const MODAL_SECTION_HEADER_CLASS = 'text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5';

// 3. Labels de Campos / Formulários (ex: "NOME DO CANAL", "TÓPICO DO CANAL")
// 12px (text-xs) + font-bold + text-gray-300 + uppercase + tracking-wider + mb-1.5
export const MODAL_FIELD_LABEL_CLASS = 'block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5';

// 4. Títulos Principais de Modais (ex: "Criar Canal", "Criar Servidor", "Criar Categoria")
// 18px-20px (text-lg sm:text-xl) + font-bold + text-white
export const MODAL_TITLE_CLASS = 'text-lg sm:text-xl font-bold text-white';

// 5. Títulos de Sub-modais / Diálogos de Confirmação (ex: "Mudar Senha", "Banir Membro", "Excluir Servidor")
// 16px (text-base) + font-bold + text-white
export const MODAL_DIALOG_TITLE_CLASS = 'text-base font-bold text-white';

// ==========================================
// 6. Paddings e Layout Estrutural de Modais
// ==========================================

// Card inteiro de sub-modais e caixas de diálogo simples (ex: Alterar Senha, Confirmar Exclusão)
export const MODAL_CARD_PADDING_CLASS = 'p-4 sm:p-6';

// Cabeçalho de modais com divisão estruturada (ex: Criar Canal, Criar DM)
export const MODAL_HEADER_PADDING_CLASS = 'p-4 sm:p-6 pb-3';

// Corpo / Formulário interno de modais
export const MODAL_BODY_PADDING_CLASS = 'p-4 sm:p-6';

// Rodapé de ações e confirmação de modais
export const MODAL_FOOTER_PADDING_CLASS = 'p-4 sm:p-6 pt-3';

// Linhas de itens, toggles e opções em listas divididas (dentro de divide-y)
export const MODAL_ITEM_ROW_PADDING_CLASS = 'py-3.5 first:pt-0 last:pb-0';

// Divisória sutil entre blocos ou seções
export const MODAL_DIVIDER_CLASS = 'h-px bg-white/5';

// 7. Descrições de Apoio e Subtextos de Toggles/Opções: 12px (text-xs) + text-gray-400 + leading-relaxed
export const MODAL_DESCRIPTION_CLASS = 'text-xs text-gray-400 leading-relaxed';
export const MODAL_SUBTITLE_CLASS = MODAL_DESCRIPTION_CLASS;

// ==========================================
// 8. Botões e Ações Padrão de Modais
// ==========================================

// Botão Cancelar padrão
export const MODAL_CANCEL_BUTTON_CLASS = 'px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:underline transition-all cursor-pointer disabled:opacity-50';

// Botão Primário de Confirmação / Salvar
export const MODAL_PRIMARY_BUTTON_CLASS = 'bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 cursor-pointer';

// Botão Destrutivo / Excluir / Banir
export const MODAL_DANGER_BUTTON_CLASS = 'bg-dnd hover:bg-red-600 active:scale-95 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 cursor-pointer';

// ==========================================
// 9. Backdrops e Switches Padrão de Modais
// ==========================================

// Backdrop padrão de sub-modais e caixas de diálogo
export const MODAL_BACKDROP_CLASS = 'fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150';

// Switch Toggle Container
export const MODAL_SWITCH_CONTAINER_CLASS = 'w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0';

// Switch Toggle Knob
export const MODAL_SWITCH_KNOB_CLASS = 'bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200';

