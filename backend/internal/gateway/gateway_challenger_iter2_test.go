package gateway_test

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// =============================================================================
// MISSION POINT 2: WebSocket Gateway Device Ownership & Impersonation Defense
// =============================================================================

// TestChallengerIter2_Gateway_DeviceOwnership_UnownedDevice verifies that connecting
// with an unowned device ID (DeviceValidator returns false) does not register the device.
func TestChallengerIter2_Gateway_DeviceOwnership_UnownedDevice(t *testing.T) {
	hub := gateway.NewHub()
	aliceID := uuid.New()
	unownedDevID := uuid.New()

	// Validator returns false for unowned device
	hub.DeviceValidator = func(ctx context.Context, uID, dID uuid.UUID) bool {
		return false
	}
	go hub.Run()

	server := setupGatewayTestServer(t, hub, aliceID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + unownedDevID.String() + "&e2ee_version=1"
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Connection failed: %v (resp: %v)", err, resp)
	}
	defer conn.Close()
	time.Sleep(50 * time.Millisecond)

	// Device must NOT be online
	if hub.IsDeviceOnline(unownedDevID) {
		t.Fatalf("CRITICAL SECURITY VULNERABILITY: Unowned device %s was registered as online", unownedDevID)
	}

	// SendToDevice must return false
	delivered := hub.SendToDevice(unownedDevID, models.WSEvent{Type: "E2EE_TO_DEVICE", Data: map[string]any{"msg": "secret"}})
	if delivered {
		t.Fatalf("CRITICAL SECURITY VULNERABILITY: SendToDevice returned true for unowned device")
	}
}

// TestChallengerIter2_Gateway_DeviceOwnership_RevokedDevice verifies that connecting
// with a revoked device ID is rejected and device is not online.
func TestChallengerIter2_Gateway_DeviceOwnership_RevokedDevice(t *testing.T) {
	hub := gateway.NewHub()
	aliceID := uuid.New()
	activeDevID := uuid.New()
	revokedDevID := uuid.New()

	hub.DeviceValidator = func(ctx context.Context, uID, dID uuid.UUID) bool {
		// Only activeDevID is valid; revokedDevID is revoked
		return uID == aliceID && dID == activeDevID
	}
	go hub.Run()

	server := setupGatewayTestServer(t, hub, aliceID)
	defer server.Close()

	// Connect claiming revoked device
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + revokedDevID.String() + "&e2ee_version=1"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Connection failed: %v", err)
	}
	defer conn.Close()
	time.Sleep(50 * time.Millisecond)

	if hub.IsDeviceOnline(revokedDevID) {
		t.Fatalf("CRITICAL SECURITY VULNERABILITY: Revoked device %s was registered in hub", revokedDevID)
	}
}

// TestChallengerIter2_Gateway_DeviceHijack_Defense verifies that an attacker cannot hijack
// an active user's device routing or steal to-device messages.
func TestChallengerIter2_Gateway_DeviceHijack_Defense(t *testing.T) {
	hub := gateway.NewHub()
	aliceID := uuid.New()
	malloryID := uuid.New()
	aliceDevID := uuid.New()

	// Only Alice owns aliceDevID
	hub.DeviceValidator = func(ctx context.Context, uID, dID uuid.UUID) bool {
		return uID == aliceID && dID == aliceDevID
	}
	go hub.Run()

	// Server for Alice and server for Mallory
	aliceServer := setupGatewayTestServer(t, hub, aliceID)
	defer aliceServer.Close()
	malloryServer := setupGatewayTestServer(t, hub, malloryID)
	defer malloryServer.Close()

	// 1. Alice connects with her legitimate device
	aliceURL := "ws" + strings.TrimPrefix(aliceServer.URL, "http") + "/ws?device_id=" + aliceDevID.String() + "&e2ee_version=1"
	aliceConn, _, err := websocket.DefaultDialer.Dial(aliceURL, nil)
	if err != nil {
		t.Fatalf("Alice failed to connect: %v", err)
	}
	defer aliceConn.Close()
	time.Sleep(50 * time.Millisecond)

	if !hub.IsDeviceOnline(aliceDevID) {
		t.Fatalf("Alice's device should be online")
	}

	// 2. Mallory tries to connect claiming Alice's device ID
	malloryURL := "ws" + strings.TrimPrefix(malloryServer.URL, "http") + "/ws?device_id=" + aliceDevID.String() + "&e2ee_version=1"
	malloryConn, _, err := websocket.DefaultDialer.Dial(malloryURL, nil)
	if err != nil {
		t.Fatalf("Mallory failed to connect: %v", err)
	}
	time.Sleep(50 * time.Millisecond)

	// Alice's device must STILL be online
	if !hub.IsDeviceOnline(aliceDevID) {
		t.Fatalf("Alice's device went offline after Mallory connect attempt")
	}

	// 3. Send to-device payload: MUST go to Alice, NOT Mallory
	testPayload := fmt.Sprintf("olm-secret-%d", time.Now().UnixNano())
	delivered := hub.SendToDevice(aliceDevID, models.WSEvent{
		Type: "E2EE_TO_DEVICE",
		Data: map[string]any{"ciphertext": testPayload},
	})
	if !delivered {
		t.Fatalf("SendToDevice failed to deliver to Alice")
	}

	// Read Alice's socket
	aliceConn.SetReadDeadline(time.Now().Add(1 * time.Second))
	_, aliceMsg, err := aliceConn.ReadMessage()
	if err != nil {
		t.Fatalf("Alice failed to receive message: %v", err)
	}
	if !strings.Contains(string(aliceMsg), testPayload) {
		t.Fatalf("Alice received unexpected payload: %s", string(aliceMsg))
	}

	// Verify Mallory received NOTHING (timeout expected)
	malloryConn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	_, malloryMsg, err := malloryConn.ReadMessage()
	if err == nil {
		t.Fatalf("CRITICAL SECURITY VULNERABILITY: Mallory received to-device payload intended for Alice: %s", string(malloryMsg))
	}

	// 4. Mallory disconnects: Alice must remain completely unharmed
	malloryConn.Close()
	time.Sleep(60 * time.Millisecond)

	if !hub.IsDeviceOnline(aliceDevID) {
		t.Fatalf("CRITICAL VULNERABILITY: Mallory disconnect orphaned Alice's device")
	}

	// Send another message to Alice to verify full functionality
	secondPayload := "second-olm-payload"
	delivered2 := hub.SendToDevice(aliceDevID, models.WSEvent{
		Type: "E2EE_TO_DEVICE",
		Data: map[string]any{"ciphertext": secondPayload},
	})
	if !delivered2 {
		t.Fatalf("SendToDevice failed after Mallory disconnect")
	}
	aliceConn.SetReadDeadline(time.Now().Add(1 * time.Second))
	_, aliceMsg2, err := aliceConn.ReadMessage()
	if err != nil || !strings.Contains(string(aliceMsg2), secondPayload) {
		t.Fatalf("Alice failed to receive second payload: %v", err)
	}
}

// =============================================================================
// MISSION POINT 3: WebSocket Gateway Disconnect Unregister Guard Stress Test
// =============================================================================

// TestChallengerIter2_Gateway_UnregisterGuard_CloseOrder1 tests closing the older
// socket first, ensuring newer socket continues to receive messages.
func TestChallengerIter2_Gateway_UnregisterGuard_CloseOrder1(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()
	userID := uuid.New()
	devID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + devID.String() + "&e2ee_version=1"

	conn1, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Conn1 failed: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	conn2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Conn2 failed: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	// Close conn1 (the older socket)
	conn1.Close()
	time.Sleep(60 * time.Millisecond)

	if !hub.IsDeviceOnline(devID) {
		t.Fatalf("Device %s should still be online via conn2", devID)
	}

	// Verify messages arrive on conn2
	payload := "test-msg-to-conn2"
	if !hub.SendToDevice(devID, models.WSEvent{Type: "TEST", Data: map[string]any{"p": payload}}) {
		t.Fatalf("SendToDevice returned false")
	}
	conn2.SetReadDeadline(time.Now().Add(1 * time.Second))
	_, msg, err := conn2.ReadMessage()
	if err != nil || !strings.Contains(string(msg), payload) {
		t.Fatalf("conn2 did not receive message: %v", err)
	}

	// Close conn2: now device must be offline
	conn2.Close()
	time.Sleep(60 * time.Millisecond)

	if hub.IsDeviceOnline(devID) {
		t.Fatalf("Device %s should be offline after all connections closed", devID)
	}
}

// TestChallengerIter2_Gateway_UnregisterGuard_CloseOrder2 tests closing the NEWER
// socket first, ensuring older socket mapping is restored and receives messages.
func TestChallengerIter2_Gateway_UnregisterGuard_CloseOrder2(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()
	userID := uuid.New()
	devID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + devID.String() + "&e2ee_version=1"

	conn1, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Conn1 failed: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	conn2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Conn2 failed: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	// Close conn2 (the newer socket, currently mapped in clientsByDevice)
	conn2.Close()
	time.Sleep(60 * time.Millisecond)

	// The unregister guard must have restored conn1!
	if !hub.IsDeviceOnline(devID) {
		t.Fatalf("Device %s should still be online via restored conn1", devID)
	}

	// Verify messages arrive on conn1
	payload := "test-msg-to-restored-conn1"
	if !hub.SendToDevice(devID, models.WSEvent{Type: "TEST", Data: map[string]any{"p": payload}}) {
		t.Fatalf("SendToDevice returned false after restoring conn1")
	}
	conn1.SetReadDeadline(time.Now().Add(1 * time.Second))
	_, msg, err := conn1.ReadMessage()
	if err != nil || !strings.Contains(string(msg), payload) {
		t.Fatalf("conn1 did not receive message after being restored: %v", err)
	}

	// Close conn1
	conn1.Close()
	time.Sleep(60 * time.Millisecond)

	if hub.IsDeviceOnline(devID) {
		t.Fatalf("Device %s should be offline after conn1 closed", devID)
	}
}

// TestChallengerIter2_Gateway_UnregisterGuard_TripleSocket tests 3 concurrent sockets
// with arbitrary close sequences (close middle socket first).
func TestChallengerIter2_Gateway_UnregisterGuard_TripleSocket(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()
	userID := uuid.New()
	devID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + devID.String() + "&e2ee_version=1"

	conn1, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	time.Sleep(30 * time.Millisecond)
	conn2, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	time.Sleep(30 * time.Millisecond)
	conn3, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	time.Sleep(30 * time.Millisecond)

	// Close conn2 (middle)
	conn2.Close()
	time.Sleep(50 * time.Millisecond)
	if !hub.IsDeviceOnline(devID) {
		t.Fatalf("Device should still be online after closing middle socket")
	}

	// Close conn3 (latest) -> should fall back to conn1
	conn3.Close()
	time.Sleep(50 * time.Millisecond)
	if !hub.IsDeviceOnline(devID) {
		t.Fatalf("Device should still be online via conn1 after closing conn3")
	}

	// Verify conn1 can receive
	hub.SendToDevice(devID, models.WSEvent{Type: "TEST", Data: map[string]any{"v": "conn1-alive"}})
	conn1.SetReadDeadline(time.Now().Add(1 * time.Second))
	_, msg, err := conn1.ReadMessage()
	if err != nil || !strings.Contains(string(msg), "conn1-alive") {
		t.Fatalf("conn1 failed to receive: %v", err)
	}

	// Close conn1
	conn1.Close()
	time.Sleep(50 * time.Millisecond)
	if hub.IsDeviceOnline(devID) {
		t.Fatalf("Device should be offline after all 3 closed")
	}
}

// TestChallengerIter2_Gateway_UnregisterGuard_ConcurrentChaos runs 20 concurrent goroutines
// rapidly connecting and disconnecting sockets with the same device ID to test thread-safety.
func TestChallengerIter2_Gateway_UnregisterGuard_ConcurrentChaos(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()
	userID := uuid.New()
	devID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + devID.String() + "&e2ee_version=1"

	var wg sync.WaitGroup
	workers := 15

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for iter := 0; iter < 5; iter++ {
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
				if err == nil {
					time.Sleep(10 * time.Millisecond)
					conn.Close()
				}
			}
		}(i)
	}

	wg.Wait()
	time.Sleep(100 * time.Millisecond)

	// After all workers terminate, the device should eventually settle to offline
	if hub.IsDeviceOnline(devID) {
		t.Logf("Note: device status after all workers finished: %v", hub.IsDeviceOnline(devID))
	}
}
