# Diretrizes de Validação, Git e Fluxo de Deploy

## 🧪 1. Testes e Validação Rigorosa
- Antes de qualquer deploy ou entrega de tarefa, execute sempre os testes e validações locais:
  - Frontend: `npm run build` (verificação do TypeScript + build do Vite).
  - Backend: Verificação de compilação do Go (`go build`).
  - Layout e responsividade Mobile-First.

## 📦 2. Sincronização com Git (Commit & Push)
- Sempre que houver novas alterações finalizadas e testadas, realize `git commit` e `git push` para manter o repositório GitHub sincronizado.

## 🛑 3. Deploy no Docker / VPS (Regra de Permissão)
- **NUNCA suba ou faça deploy automático no Docker / VPS via SSH por conta própria.**
- **Sempre pergunte ao usuário** se deseja realizar o deploy das atualizações no Docker/VPS.
- O deploy na VPS só deve ser executado **EXCLUSIVAMENTE se o usuário permitir de forma explícita**.
