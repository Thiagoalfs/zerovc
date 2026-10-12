# Diretrizes de Tipografia para Toggles e Opções de Modais

## 🎚️ Regra Obrigatória para Headers de Toggles e Opções
- **Tamanho:** `14px` (`text-sm` no Tailwind CSS).
- **Peso da fonte:** `font-bold` (peso 700 no Tailwind CSS).
- **Cor:** `text-white` (ou classe correspondente de alto contraste).
- **Variável Oficial:** `MODAL_TOGGLE_HEADER_CLASS` ou `MODAL_OPTION_HEADER_CLASS` exportadas de `client/src/constants/modalTypography.ts`.

## 📌 Escopo de Aplicação
Esta regra aplica-se a **TODOS os cabeçalhos/títulos de opções e toggles** em **TODAS as views e modais** do aplicativo (Configurações de Usuário, Acessibilidade, Privacidade e Atividades, Preferências de Sistema, Configurações de Servidor, Cargos, Modo Streamer, Atalhos, Canais, etc.).

Exemplo de uso:
```tsx
import { MODAL_TOGGLE_HEADER_CLASS } from '../../constants/modalTypography';

<span className={MODAL_TOGGLE_HEADER_CLASS}>
  Ativar Modo Streamer
</span>
```
Nunca utilize `text-xs font-semibold`, `text-xs font-bold` ou `text-sm font-semibold` para títulos de toggles ou opções principais nas telas de configuração. Sempre padronize em `text-sm font-bold text-white`.
