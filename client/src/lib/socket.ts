import { API_BASE_URL } from './api';

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

  connect() {
    const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token');
    if (!token) return;

    this.isExplicitlyClosed = false;
    const baseUrl = API_BASE_URL.replace(/^http/, 'ws');
    const wsUrl = `${baseUrl}/ws?token=${token}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Socket] Connected to ZeroVC Gateway');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
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
          console.log('[Socket] Disconnected. Reconnecting in 3s...');
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Socket] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[Socket] Connection failed:', err);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  disconnect() {
    this.isExplicitlyClosed = true;
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
