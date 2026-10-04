import { create } from 'zustand';

export interface ActiveUpload {
  id: string; // tempId of optimistic message
  fileName: string;
  fileSize: number;
  progress: number;
  abortController: AbortController;
  onCancel?: () => void;
}

interface UploadStoreState {
  uploads: Record<string, ActiveUpload>;
  startUpload: (upload: ActiveUpload) => void;
  updateProgress: (id: string, progress: number) => void;
  removeUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
}

export const useUploadStore = create<UploadStoreState>((set, get) => ({
  uploads: {},
  startUpload: (upload) =>
    set((state) => ({
      uploads: { ...state.uploads, [upload.id]: upload },
    })),
  updateProgress: (id, progress) =>
    set((state) => {
      const current = state.uploads[id];
      if (!current) return state;
      return {
        uploads: {
          ...state.uploads,
          [id]: { ...current, progress: Math.min(100, Math.max(0, progress)) },
        },
      };
    }),
  removeUpload: (id) =>
    set((state) => {
      const copy = { ...state.uploads };
      delete copy[id];
      return { uploads: copy };
    }),
  cancelUpload: (id) => {
    const upload = get().uploads[id];
    if (upload) {
      try {
        upload.abortController.abort();
      } catch (e) {
        console.warn('[UploadStore] Error aborting upload:', e);
      }
      upload.onCancel?.();
    }
    get().removeUpload(id);
  },
}));
