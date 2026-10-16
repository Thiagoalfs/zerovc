import { create } from 'zustand';

export type ConfirmVariant = 'danger' | 'warning' | 'primary' | 'info' | 'success';

export interface ConfirmOptions {
  title: string;
  message: string;
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  icon?: 'trash' | 'alert' | 'info' | 'shield' | 'user' | 'check';
}

export interface AlertOptions {
  title?: string;
  message: string;
  detail?: string;
  buttonText?: string;
  variant?: ConfirmVariant;
}

interface ConfirmModalState {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title: string;
  message: string;
  detail?: string;
  confirmText: string;
  cancelText: string;
  variant: ConfirmVariant;
  icon?: 'trash' | 'alert' | 'info' | 'shield' | 'user' | 'check';
  resolver: ((value: boolean) => void) | null;

  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
  handleConfirm: () => void;
  handleCancel: () => void;
}

export const useConfirmModalStore = create<ConfirmModalState>((set, get) => ({
  isOpen: false,
  type: 'confirm',
  title: '',
  message: '',
  detail: undefined,
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  variant: 'primary',
  icon: undefined,
  resolver: null,

  confirm: (options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        type: 'confirm',
        title: options.title,
        message: options.message,
        detail: options.detail,
        confirmText: options.confirmText || 'Confirmar',
        cancelText: options.cancelText || 'Cancelar',
        variant: options.variant || (options.title.toLowerCase().includes('excluir') || options.title.toLowerCase().includes('banir') || options.title.toLowerCase().includes('expulsar') ? 'danger' : 'primary'),
        icon: options.icon,
        resolver: resolve,
      });
    });
  },

  alert: (options: AlertOptions | string) => {
    return new Promise<void>((resolve) => {
      const opts: AlertOptions = typeof options === 'string' ? { message: options } : options;
      set({
        isOpen: true,
        type: 'alert',
        title: opts.title || 'Aviso',
        message: opts.message,
        detail: opts.detail,
        confirmText: opts.buttonText || 'Entendido',
        cancelText: '',
        variant: opts.variant || 'info',
        icon: 'info',
        resolver: () => resolve(),
      });
    });
  },

  handleConfirm: () => {
    const { resolver } = get();
    if (resolver) resolver(true);
    set({ isOpen: false, resolver: null });
  },

  handleCancel: () => {
    const { resolver } = get();
    if (resolver) resolver(false);
    set({ isOpen: false, resolver: null });
  },
}));

// Export convenient global functions for non-hook callers
export const showConfirm = (options: ConfirmOptions) => useConfirmModalStore.getState().confirm(options);
export const showAlert = (options: AlertOptions | string) => useConfirmModalStore.getState().alert(options);
