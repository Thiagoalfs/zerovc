// Detecta se o app está rodando dentro do cliente desktop (Electron) ou no navegador.
//
// Isso importa para a estratégia de sessão (ver F4 da auditoria de segurança):
// - No navegador, o app roda na MESMA origem da API (servida pelo próprio backend Go),
//   então o cookie httpOnly setado no login é enviado automaticamente em toda requisição
//   e no handshake do WebSocket. Não há motivo para guardar o token em localStorage ali,
//   e fazer isso expõe o token a roubo via XSS.
// - No Electron empacotado, a UI é carregada via `file://` (client/electron/main.ts),
//   o que torna toda chamada à API cross-site. Cookies com SameSite=Lax não acompanham
//   requisições cross-site feitas via fetch/XHR, então o cliente desktop PRECISA do
//   token em localStorage + header Authorization: Bearer para continuar autenticado.
export const isElectron = (): boolean =>
  typeof window !== 'undefined' &&
  (!!window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));