import { formatAssetUrl } from './api';
import { useAuthStore } from '../stores/authStore';

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

export const sendNativeNotification = ({ title, body, icon, tag, onClick }: NotificationPayload): void => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  // 1. Não Perturbe (DND) - Não recebe notificações
  try {
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.status === 'dnd') {
      return;
    }
  } catch {}

  // 2. Configuração de notificações de desktop
  try {
    const isDesktopNotifEnabled = localStorage.getItem('zerovc_notifications_desktop') !== 'false';
    if (!isDesktopNotifEnabled) {
      return;
    }
  } catch {}

  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    const appLogo = typeof window !== 'undefined' ? `${window.location.origin}/icon.png` : undefined;
    const resolvedIcon = icon
      ? icon.startsWith('http') || icon.startsWith('/')
        ? icon
        : formatAssetUrl(icon)
      : appLogo;

    const notification = new Notification(title, {
      body,
      icon: resolvedIcon || appLogo,
      badge: appLogo,
      tag: tag || 'zerovc-notification',
      silent: false,
    });

    notification.onclick = () => {
      window.focus();
      if (onClick) {
        onClick();
      }
      notification.close();
    };
  } catch (err) {
    console.warn('[Notification] Failed to display native notification:', err);
  }
};
