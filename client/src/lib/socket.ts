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

  connect() {
    const baseUrl = getApiBaseUrl().replace(/^http/, 'ws');
    let wsUrl = `${baseUrl}/ws`;

    // No Electron o handshake do WS é cross-site (client em file://), então precisa do
    // token na query string. No navegador o cookie httpOnly já autentica automaticamente
    // (mesma origem: a SPA é servida pelo próprio backend), sem expor o token à URL/JS.
    if (isElectron()) {
      const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token');
      if (!token) return;
      wsUrl += `?token=${token}`;
    }

    this.isExplicitlyClosed = false;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Socket] Connected to ZeroVC Gateway');
        this.reconnectAttempts = 0;
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