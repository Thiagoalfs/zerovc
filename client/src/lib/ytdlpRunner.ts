import { api } from './api';

export interface YtdlpExecuteParams {
  format: 'mp4' | 'mp3';
  link: string;
  contextType: 'channel' | 'dm' | 'dm_group';
  contextId: string;
  onError?: (error: string) => void;
}

export async function executeYtdlpCommand(params: YtdlpExecuteParams): Promise<void> {
  const { format, link, contextType, contextId, onError } = params;

  if (!window.electronAPI?.ytdlpDownload) {
    const errorMsg = 'O comando /yt-dlp requer o aplicativo Desktop (Electron) com yt-dlp instalado no computador.';
    onError?.(errorMsg);
    return;
  }

  let progressMessageId: string | null = null;
  let unsubscribeProgress: (() => void) | null = null;
  let intervalId: any = null;

  const deleteProgressMessage = async () => {
    if (!progressMessageId) return;
    const msgIdToDelete = progressMessageId;
    progressMessageId = null;
    try {
      if (contextType === 'channel') {
        await api.channels.deleteMessage(contextId, msgIdToDelete);
      } else if (contextType === 'dm') {
        await api.dms.deleteMessage(contextId, msgIdToDelete);
      } else {
        await api.dmGroups.deleteMessage(contextId, msgIdToDelete);
      }
    } catch (e) {
      console.warn('[yt-dlp] Could not delete progress message:', e);
    }
  };

  const cleanupDocuments = async () => {
    try {
      await window.electronAPI?.ytdlpCleanup?.();
    } catch (e) {
      console.warn('[yt-dlp] Cleanup failed:', e);
    }
  };

  try {
    // 1. Post initial loading / progress message in chat
    try {
      const initPayload = {
        command: 'ytdlp_progress',
        args: {
          progress: 0,
          text: 'Iniciando download...',
        },
      };
      let res: any = null;
      if (contextType === 'channel') {
        res = await api.commands.executeChannelCommand(contextId, initPayload);
      } else if (contextType === 'dm') {
        res = await api.commands.executeDMRoomCommand(contextId, initPayload);
      } else {
        res = await api.commands.executeDMGroupCommand(contextId, initPayload);
      }
      if (res && res.id) {
        progressMessageId = res.id;
      }
    } catch (initErr) {
      console.warn('[yt-dlp] Failed to post initial progress message:', initErr);
    }

    // 2. Track real-time progress & update chat every 5 seconds
    let currentProgress: { percent: number; text?: string } = { percent: 0, text: 'Iniciando download...' };
    let lastUpdatedPercent = 0;

    if (window.electronAPI.onYtdlpProgress) {
      unsubscribeProgress = window.electronAPI.onYtdlpProgress((data) => {
        if (typeof data.percent === 'number') {
          currentProgress = data;
        }
      });
    }

    intervalId = setInterval(async () => {
      if (!progressMessageId) return;
      const rounded = Math.round(currentProgress.percent);
      if (rounded !== lastUpdatedPercent) {
        lastUpdatedPercent = rounded;
        const content = `⏳ **Baixando mídia com yt-dlp...** (${rounded}%)\n\`${currentProgress.text || 'Processando download...'}\``;
        try {
          if (contextType === 'channel') {
            await api.channels.updateMessage(contextId, progressMessageId, { content });
          } else if (contextType === 'dm') {
            await api.dms.updateMessage(contextId, progressMessageId, { content });
          } else {
            await api.dmGroups.updateMessage(contextId, progressMessageId, { content });
          }
        } catch (err) {
          console.warn('[yt-dlp] Failed to update progress in chat:', err);
        }
      }
    }, 5000);

    // 3. Execute download via Electron IPC
    const res = await window.electronAPI.ytdlpDownload({ format, link });

    if (intervalId) clearInterval(intervalId);
    if (unsubscribeProgress) unsubscribeProgress();

    if (!res.success || !res.data) {
      await deleteProgressMessage();
      await cleanupDocuments();
      const errorMsg = res.error || 'Falha ao processar download com yt-dlp.';
      onError?.(errorMsg);
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

    // Upload attachment to backend with Gork Bot ID permission for large files and temporary 24h retention
    const uploadRes = await api.upload.attachment(file, { botId: '00000000-0000-0000-0000-000000000001', temp: true });

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

    // 4. Delete the loading/progress message and clean up directory
    await deleteProgressMessage();
    await cleanupDocuments();
  } catch (err: any) {
    if (intervalId) clearInterval(intervalId);
    if (unsubscribeProgress) unsubscribeProgress();
    await deleteProgressMessage();
    await cleanupDocuments();
    console.error('Failed to run ytdlp command:', err);
    onError?.(err?.message || 'Erro inesperado ao processar mídia com yt-dlp.');
  }
}
