import { formatAssetUrl } from './api';

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

  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    const resolvedIcon = icon ? formatAssetUrl(icon) : undefined;
    const notification = new Notification(title, {
      body,
      icon: resolvedIcon,
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
