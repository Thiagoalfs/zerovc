/**
 * ZeroVC Opt-in E2EE — Proposed Changes for client/src/lib/socket.ts
 *
 * Implements Milestone M2 (Requirement R2 §10.3, R6 §4):
 *  - Gateway handshake query parameters: token, device_id, e2ee_version=1
 *  - Dynamic updateE2EEDeviceId() to seamlessly reconnect when device is registered
 *  - Handling of incoming E2EE_TO_DEVICE and E2EE_ROSTER_UPDATE events
 */

export const SOCKET_PATCH_DOCUMENTATION = `
// ============================================================================
// MODIFICATION IN SocketClient (client/src/lib/socket.ts)
// ============================================================================

import { getApiBaseUrl } from './api';
import { isElectron } from './platform';

export interface WSEvent {
  type: string;
  data: any;
}

export type E2EETargetEvent =
  | 'E2EE_TO_DEVICE'
  | 'E2EE_ROSTER_UPDATE'
  | 'E2EE_ROTATION_REQUIRED'
  | 'E2EE_DEVICE_LIST_UPDATE';

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

  /**
   * Updates current E2EE device ID. If socket is connected and deviceId has changed,
   * cleanly triggers reconnect with updated query parameters.
   */
  updateE2EEDeviceId(deviceId: string) {
    if (this.currentDeviceId === deviceId) return;
    this.currentDeviceId = deviceId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zerovc_device_id', deviceId);
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Socket] Device ID updated, reconnecting gateway with device_id:', deviceId);
      this.disconnect();
      this.connect();
    }
  }

  connect() {
    const baseUrl = getApiBaseUrl().replace(/^http/, 'ws');
    const params = new URLSearchParams();

    if (isElectron()) {
      const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token');
      if (!token) return;
      params.set('token', token);
    }

    // Attach device_id if available
    const deviceId = this.currentDeviceId || (typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : null);
    if (deviceId) {
      this.currentDeviceId = deviceId;
      params.set('device_id', deviceId);
    }

    // Always attach client E2EE version
    params.set('e2ee_version', '1');

    const queryString = params.toString();
    const wsUrl = \`\${baseUrl}/ws\${queryString ? \`?\${queryString}\` : ''}\`;

    this.isExplicitlyClosed = false;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Socket] Connected to ZeroVC Gateway (E2EE Version: 1, Device:', this.currentDeviceId || 'none', ')');
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
          const lines = event.data.split('\\n');
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

  // ... (rest of methods: scheduleReconnect, disconnect, on, off, send, dispatch) ...
}

export const socket = new SocketClient();
`;
