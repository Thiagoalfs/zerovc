import { getApiBaseUrl } from './api';
import { isElectron } from './platform';

export interface WSEvent {
  type: string;
  data: any;
}

type EventHandler = (event: WSEvent) => void;

class SocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isExplicitlyClosed = false;
  private reconnectAttempts = 0;
  private hadConnectedOnce = false;
  private reconnectListeners: Set<() => void> = new Set();
  private currentDeviceId: string | null = null;

  onReconnect(callback: () => void): () => void {
    this.reconnectListeners.add(callback);
    return () => this.reconnectListeners.delete(callback);
  }

  getE2EEDeviceId(): string | null {
    return this.currentDeviceId;
  }

  updateE2EEDeviceId(deviceId: string) {
    if (this.currentDeviceId === deviceId) return;
    this.currentDeviceId = deviceId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zerovc_device_id', deviceId);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
      this.connect();
    }
  }

  connect() {
    const baseUrl = getApiBaseUrl().replace(/^http/, 'ws');
    const params = new URLSearchParams();

    if (isElectron()) {
      const token = typeof localStorage !== 'undefined' ? (localStorage.getItem('token') || localStorage.getItem('zerovc_token')) : null;
      if (!token) return;
      params.set('token', token);
    }

    const deviceId = this.currentDeviceId || (typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : null);
    if (deviceId) {
      params.set('device_id', deviceId);
    }
    params.set('e2ee_version', '1');

    const queryString = params.toString();
    const wsUrl = `${baseUrl}/ws${queryString ? `?${queryString}` : ''}`;

    this.isExplicitlyClosed = false;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Socket] Connected to ZeroVC Gateway');
        const isReconnection = this.hadConnectedOnce && this.reconnectAttempts > 0;
        this.hadConnectedOnce = true;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        if (isReconnection) {
          console.log('[Socket] Reconnected to gateway. Triggering resync...');
          this.reconnectListeners.forEach((fn) => {
            try { fn(); } catch (err) { console.error('[Socket] Resync error:', err); }
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const lines = event.data.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const parsed: WSEvent = JSON.parse(line);
            this.dispatch(parsed);
          }
        } catch (err) {
          console.error('[Socket] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Socket] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[Socket] Connection failed:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    // Exponential backoff with jitter: min(15000, 1000 * 1.8^attempts) + rand(0, 1000)
    const baseDelay = Math.min(15000, 1000 * Math.pow(1.8, Math.min(this.reconnectAttempts, 6)));
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.round(baseDelay + jitter);

    console.log(`[Socket] Disconnected. Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.isExplicitlyClosed = true;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  on(eventType: string, handler: EventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  off(eventType: string, handler: EventHandler) {
    if (this.handlers.has(eventType)) {
      this.handlers.get(eventType)!.delete(handler);
    }
  }

  send(type: string, data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  private dispatch(event: WSEvent) {
    const listeners = this.handlers.get(event.type);
    if (listeners) {
      listeners.forEach((handler) => handler(event));
    }

    const globalListeners = this.handlers.get('*');
    if (globalListeners) {
      globalListeners.forEach((handler) => handler(event));
    }
  }
}

export const socket = new SocketClient();