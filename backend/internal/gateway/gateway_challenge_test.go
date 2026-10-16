package gateway_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// Helper: setups an HTTP test server that mounts gateway.ServeWs
func setupGatewayTestServer(t *testing.T, hub *gateway.Hub, userID uuid.UUID) *httptest.Server {
	t.Helper()
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gateway.ServeWs(hub, w, r, userID)
	})
	return httptest.NewServer(handler)
}

// =============================================================================
// CHALLENGE 1: WebSocket Gateway Query Parameter Parsing (device_id)
// =============================================================================

func TestChallenge_Gateway_DeviceID_ValidUUID(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()

	userID := uuid.New()
	deviceID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + deviceID.String() + "&e2ee_version=1"
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to dial websocket with valid device_id: %v (resp: %v)", err, resp)
	}
	defer conn.Close()

	// Wait briefly for registration pump
	time.Sleep(50 * time.Millisecond)

	// Device must be recognized as online in Hub
	if !hub.IsDeviceOnline(deviceID) {
		t.Errorf("Expected device %s to be online in Hub", deviceID)
	}

	// Send message to device must succeed
	testEvent := models.WSEvent{
		Type: "E2EE_TO_DEVICE",
		Data: map[string]any{"test": "payload"},
	}
	delivered := hub.SendToDevice(deviceID, testEvent)
	if !delivered {
		t.Errorf("Expected SendToDevice to return true for online device %s", deviceID)
	}

	// Verify message arrived on client websocket
	conn.SetReadDeadline(time.Now().Add(1 * time.Second))
	_, msgBytes, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read message from websocket: %v", err)
	}

	var received models.WSEvent
	if err := json.Unmarshal(msgBytes, &received); err != nil {
		t.Fatalf("Failed to unmarshal received WSEvent: %v", err)
	}
	if received.Type != "E2EE_TO_DEVICE" {
		t.Errorf("Expected event type E2EE_TO_DEVICE, got %s", received.Type)
	}
}

func TestChallenge_Gateway_DeviceID_Missing(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()

	userID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	// Connect without device_id query parameter
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?e2ee_version=1"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect without device_id: %v", err)
	}
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	// User is online, but no device is registered
	if !hub.IsUserOnline(userID) {
		t.Errorf("Expected user %s to be online", userID)
	}

	randomDevID := uuid.New()
	if hub.IsDeviceOnline(randomDevID) {
		t.Errorf("Random device %s should not be online", randomDevID)
	}
	if hub.SendToDevice(randomDevID, models.WSEvent{Type: "PING"}) {
		t.Errorf("SendToDevice to unregistered device should return false")
	}
}

func TestChallenge_Gateway_DeviceID_MalformedInputs(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()

	userID := uuid.New()
	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	malformedDeviceIDs := []string{
		"not-a-uuid",
		"12345",
		"0000-1111-2222",
		"'; DROP TABLE e2ee_devices; --",
		"<script>alert(1)</script>",
		strings.Repeat("a", 1000),
		"nil",
		"undefined",
	}

	for _, malformedID := range malformedDeviceIDs {
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + url.QueryEscape(malformedID)
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("Malformed device_id %q crashed or failed handshake: %v", malformedID, err)
		}

		time.Sleep(20 * time.Millisecond)

		// User connects normally, but no device is registered under malformed ID
		if !hub.IsUserOnline(userID) {
			t.Errorf("User should be online even with malformed device_id %q", malformedID)
		}

		conn.Close()
		time.Sleep(20 * time.Millisecond)
	}
}

// =============================================================================
// CHALLENGE 2: WebSocket Gateway e2ee_version Query Parameter Handling
// =============================================================================

func TestChallenge_Gateway_E2EEVersion_QueryParam_Behavior(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()

	userID := uuid.New()
	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	// Test case matrix for e2ee_version query parameter
	versionCases := []struct {
		name       string
		versionVal string
	}{
		{"Valid version 1", "1"},
		{"Valid version 2", "2"},
		{"Version 0 (legacy/unsupported)", "0"},
		{"Negative version", "-1"},
		{"Missing version", ""},
		{"Malformed text", "invalid"},
	}

	for _, tc := range versionCases {
		t.Run(tc.name, func(t *testing.T) {
			wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
			if tc.versionVal != "" {
				wsURL += "?e2ee_version=" + tc.versionVal
			}

			conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
			if err != nil {
				t.Logf("Dial result for e2ee_version=%q: failed (%v, resp=%v)", tc.versionVal, err, resp)
				return
			}
			defer conn.Close()

			// Check current behavior: Gateway currently allows connection regardless of e2ee_version
			// Revision 6 note: §4 specifies handshake sends version; if version < min, server should reject E2EE flow
			t.Logf("Gateway connected with e2ee_version=%q (status: %d)", tc.versionVal, resp.StatusCode)
		})
	}
}

// =============================================================================
// CHALLENGE 3: Duplicate Device ID Registration & Disconnect Bug Audit
// =============================================================================

func TestChallenge_Gateway_DuplicateDeviceID_DisconnectEdgeCase(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()

	userID := uuid.New()
	sharedDeviceID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + sharedDeviceID.String()

	// Client 1 connects with sharedDeviceID
	conn1, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Client 1 failed to connect: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	if !hub.IsDeviceOnline(sharedDeviceID) {
		t.Fatalf("Device %s should be online after Client 1 connects", sharedDeviceID)
	}

	// Client 2 connects with the SAME sharedDeviceID (e.g. second browser tab)
	conn2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Client 2 failed to connect: %v", err)
	}
	time.Sleep(40 * time.Millisecond)

	if !hub.IsDeviceOnline(sharedDeviceID) {
		t.Fatalf("Device %s should still be online after Client 2 connects", sharedDeviceID)
	}

	// Client 1 disconnects (closes tab)
	conn1.Close()
	time.Sleep(60 * time.Millisecond)

	// AUDIT CHECK: Is the device still online via Client 2?
	// In naive unregistration (`delete(clientsByDevice, *client.DeviceID)`),
	// Client 1 unregistering erases Client 2's mapping!
	isOnlineAfterClient1Close := hub.IsDeviceOnline(sharedDeviceID)
	t.Logf("AUDIT FINDING: Device online status after Client 1 close while Client 2 is still alive: %v", isOnlineAfterClient1Close)
	if !isOnlineAfterClient1Close {
		t.Errorf("Device %s should still be online via Client 2 after Client 1 close", sharedDeviceID)
	}

	conn2.Close()
	time.Sleep(40 * time.Millisecond)
}

// =============================================================================
// CHALLENGE 4: Device Push Stress & Send Channel Saturation
// =============================================================================

func TestChallenge_Gateway_SendToDevice_ChannelSaturation(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()

	userID := uuid.New()
	deviceID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + deviceID.String()
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	time.Sleep(50 * time.Millisecond)

	// Send 300 messages without reading to test buffer capacity (buffer is 256)
	event := models.WSEvent{Type: "E2EE_TO_DEVICE", Data: "buffer_test"}
	var droppedCount int
	var deliveredCount int

	for i := 0; i < 300; i++ {
		if hub.SendToDevice(deviceID, event) {
			deliveredCount++
		} else {
			droppedCount++
		}
	}

	t.Logf("SendToDevice saturation test: delivered=%d, dropped_due_to_full_buffer=%d", deliveredCount, droppedCount)
	// Non-blocking select in SendToDevice prevents gateway deadlock
	if deliveredCount == 0 {
		t.Errorf("Expected at least some messages to be delivered")
	}
}

// =============================================================================
// CHALLENGE 5: Gateway Device Ownership & Revocation Validation
// =============================================================================

func TestChallenge_Gateway_DeviceOwnership_Validation(t *testing.T) {
	hub := gateway.NewHub()
	legitUser := uuid.New()
	attackerUser := uuid.New()
	legitDeviceID := uuid.New()

	// Hub validator: only legitUser owns legitDeviceID
	hub.DeviceValidator = func(ctx context.Context, uID, dID uuid.UUID) bool {
		return uID == legitUser && dID == legitDeviceID
	}
	go hub.Run()

	// Attacker tries to connect claiming legitDeviceID
	server := setupGatewayTestServer(t, hub, attackerUser)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?device_id=" + legitDeviceID.String() + "&e2ee_version=1"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Connection failed: %v", err)
	}
	defer conn.Close()
	time.Sleep(50 * time.Millisecond)

	// Device should NOT be registered to the attacker in hub
	if hub.IsDeviceOnline(legitDeviceID) {
		t.Errorf("Attacker must not be able to bind another user's device %s", legitDeviceID)
	}
}

// =============================================================================
// CHALLENGE 6: Gateway e2ee_version Handshake Rejection
// =============================================================================

func TestChallenge_Gateway_E2EEVersion_TooOld_Rejection(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()
	userID := uuid.New()

	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	// Connect with e2ee_version=0 (below minimum 1)
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?e2ee_version=0"
	_, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		t.Fatalf("Expected handshake to fail for outdated e2ee_version=0, but succeeded")
	}
	if resp != nil && resp.StatusCode != http.StatusUpgradeRequired {
		t.Errorf("Expected HTTP 426 Upgrade Required, got %d", resp.StatusCode)
	}
}
