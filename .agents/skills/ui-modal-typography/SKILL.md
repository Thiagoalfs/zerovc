---
name: ui-modal-typography
description: Padrão obrigatório de tipografia para headers de toggles e opções em todas as views e modais do ZeroVC (14px font-bold text-white).
---

# UI Modal Typography Standards (ZeroVC)

## Descrição
Garante que todos os cabeçalhos de toggles, switches e opções de configurações em todas as views e modais do aplicativo utilizem o padrão estrito de **14px** e peso **font-bold** (`text-sm font-bold text-white`).

## Constantes Disponíveis
Em `client/src/constants/modalTypography.ts`:
- `MODAL_TOGGLE_HEADER_CLASS = 'text-sm font-bold text-white'`
- `MODAL_OPTION_HEADER_CLASS = 'text-sm font-bold text-white'`
- `TOGGLE_HEADER_TYPOGRAPHY = 'text-sm font-bold text-white'`

## Padrão de Implementação
Sempre que criar ou editar toggles, opções de formulários ou configurações em modais:
```tsx
import { MODAL_TOGGLE_HEADER_CLASS } from '../../constants/modalTypography';

<span className={MODAL_TOGGLE_HEADER_CLASS}>
  Nome da Opção / Toggle
</span>
```
ou diretamente usando a classe Tailwind correspondente: `text-sm font-bold text-white`.
