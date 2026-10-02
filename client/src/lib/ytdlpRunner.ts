import { api } from './api';

export interface YtdlpExecuteParams {
  format: 'mp4' | 'mp3';
  link: string;
  contextType: 'channel' | 'dm' | 'dm_group';
  contextId: string;
}

export async function executeYtdlpCommand(params: YtdlpExecuteParams): Promise<void> {
  const { format, link, contextType, contextId } = params;

  if (!window.electronAPI?.ytdlpDownload) {
    const errorMsg = '⚠️ O comando `/yt-dlp` requer a versão Desktop (Electron) do ZeroVC com `yt-dlp` instalado no computador.';
    await dispatchYtdlpError(contextType, contextId, errorMsg);
    return;
  }

  try {
    const res = await window.electronAPI.ytdlpDownload({ format, link });
    if (!res.success || !res.data) {
      const errorMsg = res.error || 'Falha ao processar download com yt-dlp.';
      await dispatchYtdlpError(contextType, contextId, errorMsg);
      return;
    }

    const { base64, filename, mimeType, title, size } = res.data;

    // Convert base64 to File object
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const file = new File([blob], filename, { type: mimeType });

    // Upload attachment to backend
    const uploadRes = await api.upload.attachment(file);

    const payload = {
      command: 'ytdlp_publish',
      args: {
        url: uploadRes.url,
        filename: uploadRes.filename || filename,
        format,
        title,
        size: uploadRes.size || size,
      },
      attachments: [
        {
          url: uploadRes.url,
          filename: uploadRes.filename || filename,
          size: uploadRes.size || size,
          content_type: mimeType,
        },
      ],
    };

    if (contextType === 'channel') {
      await api.commands.executeChannelCommand(contextId, payload);
    } else if (contextType === 'dm') {
      await api.commands.executeDMRoomCommand(contextId, payload);
    } else {
      await api.commands.executeDMGroupCommand(contextId, payload);
    }
  } catch (err: any) {
    console.error('Failed to run ytdlp command:', err);
    await dispatchYtdlpError(contextType, contextId, err?.message || 'Erro inesperado ao processar mídia.');
  }
}

async function dispatchYtdlpError(contextType: 'channel' | 'dm' | 'dm_group', contextId: string, error: string) {
  const payload = {
    command: 'ytdlp_error',
    args: { error },
  };

  try {
    if (contextType === 'channel') {
      await api.commands.executeChannelCommand(contextId, payload);
    } else if (contextType === 'dm') {
      await api.commands.executeDMRoomCommand(contextId, payload);
    } else {
      await api.commands.executeDMGroupCommand(contextId, payload);
    }
  } catch (e) {
    console.error('Failed to dispatch ytdlp error message:', e);
  }
}
