/**
 * ZeroVC Opt-in E2EE — Simulated In-Memory WebSocket Gateway
 *
 * Implements real-time event distribution for:
 *  - E2EE_TO_DEVICE (Olm key exchange delivery)
 *  - E2EE_ROSTER_UPDATE (Signed roster broadcast)
 *  - E2EE_ROTATION_REQUIRED (Audience change notifications)
 *  - E2EE_DEVICE_LIST_UPDATE (Device registration / revocation alerts)
 */

export interface WSClientConnection {
  userId: string;
  deviceId: string;
  e2eeVersion: number;
  rooms: Set<string>;
  messageInbox: Array<{ event: string; data: any; timestamp: number }>;
}

export class MockWebSocketGateway {
  private clients: Map<string, WSClientConnection> = new Map(); // deviceId -> connection

  connect(userId: string, deviceId: string, queryParams: { e2ee_version?: number }): {
    success: boolean;
    error?: string;
  } {
    const version = queryParams.e2ee_version ?? 0;
    if (version < 1) {
      return { success: false, error: 'e2ee_client_outdated' };
    }

    const conn: WSClientConnection = {
      userId,
      deviceId,
      e2eeVersion: version,
      rooms: new Set(),
      messageInbox: [],
    };

    this.clients.set(deviceId, conn);
    return { success: true };
  }

  disconnect(deviceId: string): void {
    this.clients.delete(deviceId);
  }

  joinRoom(deviceId: string, roomId: string): void {
    const client = this.clients.get(deviceId);
    if (client) {
      client.rooms.add(roomId);
    }
  }

  leaveRoom(deviceId: string, roomId: string): void {
    const client = this.clients.get(deviceId);
    if (client) {
      client.rooms.delete(roomId);
    }
  }

  sendToDevice(recipientDeviceId: string, eventData: any): boolean {
    const client = this.clients.get(recipientDeviceId);
    if (client) {
      client.messageInbox.push({
        event: 'E2EE_TO_DEVICE',
        data: eventData,
        timestamp: Date.now(),
      });
      return true;
    }
    return false; // offline / not connected
  }

  broadcastToRoom(roomId: string, event: string, data: any): number {
    let deliveredCount = 0;
    for (const client of this.clients.values()) {
      if (client.rooms.has(roomId)) {
        client.messageInbox.push({
          event,
          data,
          timestamp: Date.now(),
        });
        deliveredCount++;
      }
    }
    return deliveredCount;
  }

  broadcastDeviceListUpdate(userId: string, data: any): number {
    let deliveredCount = 0;
    for (const client of this.clients.values()) {
      client.messageInbox.push({
        event: 'E2EE_DEVICE_LIST_UPDATE',
        data: { user_id: userId, ...data },
        timestamp: Date.now(),
      });
      deliveredCount++;
    }
    return deliveredCount;
  }

  getInbox(deviceId: string): Array<{ event: string; data: any; timestamp: number }> {
    const client = this.clients.get(deviceId);
    return client ? [...client.messageInbox] : [];
  }

  clearInbox(deviceId: string): void {
    const client = this.clients.get(deviceId);
    if (client) {
      client.messageInbox = [];
    }
  }
}
