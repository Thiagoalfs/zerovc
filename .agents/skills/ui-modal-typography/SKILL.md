---
name: ui-modal-typography
description: Padrão obrigatório de tipografia para headers de toggles/opções (14px font-bold text-white) e subtítulos de categorias (10px font-bold text-gray-400 uppercase tracking-wider) em todas as views e modais do ZeroVC.
---

# UI Modal Typography Standards (ZeroVC)

## Descrição
Garante que todos os cabeçalhos de toggles, switches, opções de configurações e subtítulos de categorias em todas as views e modais do aplicativo utilizem os padrões estritos de tipografia:
- **Headers de Toggles e Opções:** **14px** e peso **font-bold** (`text-sm font-bold text-white`).
- **Subtítulos de Categorias:** **10px**, peso **font-bold**, caixa alta e tracking largo (`block text-[10px] font-bold text-gray-400 uppercase tracking-wider`).

## Constantes Disponíveis
Em `client/src/constants/modalTypography.ts`:
- `MODAL_TOGGLE_HEADER_CLASS = 'text-sm font-bold text-white'`
- `MODAL_OPTION_HEADER_CLASS = 'text-sm font-bold text-white'`
- `TOGGLE_HEADER_TYPOGRAPHY = 'text-sm font-bold text-white'`
- `MODAL_SECTION_HEADER_CLASS = 'text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5'`
- `MODAL_CATEGORY_SUBTITLE_CLASS = 'block text-[10px] font-bold text-gray-400 uppercase tracking-wider'`

## Padrão de Implementação
Sempre que criar ou editar toggles, opções de formulários, subtítulos de categorias ou configurações em modais:
```tsx
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_CATEGORY_SUBTITLE_CLASS,
} from '../../constants/modalTypography';

<span className={MODAL_TOGGLE_HEADER_CLASS}>
  Nome da Opção / Toggle
</span>

<label className={`${MODAL_CATEGORY_SUBTITLE_CLASS} mb-1.5`}>
  Subtítulo da Categoria
</label>
```
ou diretamente usando as classes Tailwind correspondentes (`text-sm font-bold text-white` e `block text-[10px] font-bold text-gray-400 uppercase tracking-wider`).
