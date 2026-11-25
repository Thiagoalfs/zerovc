package gateway_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

func TestSecurity_WebSocket_BlocksNullOrigin(t *testing.T) {
	hub := gateway.NewHub()
	go hub.Run()

	userID := uuid.New()
	server := setupGatewayTestServer(t, hub, userID)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"

	// Origin: null must be rejected (CSWSH protection)
	nullHeader := http.Header{}
	nullHeader.Set("Origin", "null")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nullHeader)
	if err == nil {
		conn.Close()
		t.Fatal("expected WebSocket upgrade with Origin: null to fail, but it succeeded")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected HTTP 403 for Origin: null, got resp=%v err=%v", resp, err)
	}

	// Disallowed cross-origin must also be rejected
	evilHeader := http.Header{}
	evilHeader.Set("Origin", "https://evil.example")
	connEvil, respEvil, errEvil := websocket.DefaultDialer.Dial(wsURL, evilHeader)
	if errEvil == nil {
		connEvil.Close()
		t.Fatal("expected WebSocket upgrade with disallowed Origin to fail, but it succeeded")
	}
	if respEvil == nil || respEvil.StatusCode != http.StatusForbidden {
		t.Fatalf("expected HTTP 403 for disallowed Origin, got resp=%v err=%v", respEvil, errEvil)
	}

	// Allowed origin must succeed
	okHeader := http.Header{}
	okHeader.Set("Origin", "https://zerovc.safiroko.xyz")
	connOK, _, errOK := websocket.DefaultDialer.Dial(wsURL, okHeader)
	if errOK != nil {
		t.Fatalf("expected allowed Origin to connect, got error: %v", errOK)
	}
	connOK.Close()
}

func TestSecurity_TypingStart_DMMembershipValidation(t *testing.T) {
	hub := gateway.NewHub()
	aliceID := uuid.New()
	bobID := uuid.New()
	charlieID := uuid.New()
	attackerTargetID := uuid.New()
	dmRoomID := uuid.New()

	hub.DMParticipantsProvider = func(ctx context.Context, conversationID uuid.UUID, senderID uuid.UUID) []uuid.UUID {
		if conversationID == dmRoomID && senderID == aliceID {
			// Include senderID to verify ReadPump excludes self, and valid peer bobID
			return []uuid.UUID{aliceID, bobID}
		}
		return nil
	}
	go hub.Run()

	aliceSrv := setupGatewayTestServer(t, hub, aliceID)
	defer aliceSrv.Close()
	bobSrv := setupGatewayTestServer(t, hub, bobID)
	defer bobSrv.Close()
	charlieSrv := setupGatewayTestServer(t, hub, charlieID)
	defer charlieSrv.Close()
	attackerTargetSrv := setupGatewayTestServer(t, hub, attackerTargetID)
	defer attackerTargetSrv.Close()

	dial := func(srvURL string) *websocket.Conn {
		c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srvURL, "http")+"/ws", nil)
		if err != nil {
			t.Fatalf("dial failed: %v", err)
		}
		return c
	}

	aliceConn := dial(aliceSrv.URL)
	defer aliceConn.Close()
	bobConn := dial(bobSrv.URL)
	defer bobConn.Close()
	charlieConn := dial(charlieSrv.URL)
	defer charlieConn.Close()
	attackerTargetConn := dial(attackerTargetSrv.URL)
	defer attackerTargetConn.Close()

	time.Sleep(50 * time.Millisecond)

	// 1. Alice sends TYPING_START for dmRoomID, also attempting to inject attackerTargetID in user_ids & recipient_id
	payload, _ := json.Marshal(map[string]any{
		"type": "TYPING_START",
		"data": map[string]any{
			"channel_id":   dmRoomID,
			"recipient_id": attackerTargetID,
			"user_ids":     []uuid.UUID{attackerTargetID},
		},
	})
	if err := aliceConn.WriteMessage(websocket.TextMessage, payload); err != nil {
		t.Fatalf("alice write failed: %v", err)
	}

	// Bob (verified DM participant) MUST receive TYPING_START
	bobConn.SetReadDeadline(time.Now().Add(1 * time.Second))
	_, msgBytes, err := bobConn.ReadMessage()
	if err != nil {
		t.Fatalf("expected Bob to receive TYPING_START: %v", err)
	}
	var ev models.WSEvent
	if err := json.Unmarshal(msgBytes, &ev); err != nil || ev.Type != models.EventTypingStart {
		t.Fatalf("unexpected event for Bob: %s (err=%v)", string(msgBytes), err)
	}

	// Alice (sender) must NOT receive her own TYPING_START
	aliceConn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	if _, msg, err := aliceConn.ReadMessage(); err == nil {
		t.Fatalf("sender Alice should not receive self TYPING_START: %s", string(msg))
	}

	// Injected attackerTargetID must NOT receive anything
	attackerTargetConn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	if _, msg, err := attackerTargetConn.ReadMessage(); err == nil {
		t.Fatalf("non-member attackerTargetID should not receive TYPING_START: %s", string(msg))
	}

	// 2. Charlie (not a member of dmRoomID) sends TYPING_START targeting dmRoomID and Bob
	charliePayload, _ := json.Marshal(map[string]any{
		"type": "TYPING_START",
		"data": map[string]any{
			"channel_id":   dmRoomID,
			"recipient_id": bobID,
			"user_ids":     []uuid.UUID{bobID},
		},
	})
	if err := charlieConn.WriteMessage(websocket.TextMessage, charliePayload); err != nil {
		t.Fatalf("charlie write failed: %v", err)
	}

	// Bob must NOT receive anything from non-member Charlie
	bobConn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	if _, msg, err := bobConn.ReadMessage(); err == nil {
		t.Fatalf("Bob should not receive TYPING_START from non-member Charlie: %s", string(msg))
	}
}
