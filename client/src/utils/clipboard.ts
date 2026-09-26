/**
 * Copia um texto para a área de transferência com fallback universal e multiplataforma
 * (suporta navegadores modernos, HTTP, HTTPS, Electron, Mobile e navegadores legados).
 */
export async function copyToClipboard(text: any): Promise<boolean> {
  if (text === undefined || text === null) return false;
  const str = String(text);

  // 1. Tentar a API moderna navigator.clipboard (se em contexto seguro HTTPS/localhost)
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(str);
      return true;
    } catch (err) {
      console.warn('[Clipboard] navigator.clipboard.writeText falhou, usando fallback síncrono:', err);
    }
  }

  // 2. Fallback robusto via textarea temporário + document.execCommand('copy')
  try {
    if (typeof document === 'undefined') return false;

    const textArea = document.createElement('textarea');
    textArea.value = str;

    // Garante que o elemento seja renderizável mas totalmente imperceptível ao usuário
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    textArea.style.zIndex = '-99999';
    textArea.style.pointerEvents = 'none';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, str.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      return true;
    }
  } catch (err) {
    console.error('[Clipboard] Falha no fallback execCommand:', err);
  }

  return false;
}
