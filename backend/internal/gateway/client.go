package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/zerovc/zerovc/backend/internal/middleware"
	"github.com/zerovc/zerovc/backend/internal/models"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512 KB
)

var allowedOrigins = map[string]bool{
	"https://zerovc.safiroko.xyz": true,
	"http://localhost:5173":       true,
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" || origin == "null" {
			return true
		}
		return allowedOrigins[origin]
	},
}

type Client struct {
	Hub        *Hub
	Conn       *websocket.Conn
	UserID     uuid.UUID
	DeviceID   *uuid.UUID
	send       chan []byte
	lastTyping time.Time
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Gateway] WebSocket read error: %v", err)
			}
			break
		}

		message = bytes.TrimSpace(message)
		var incomingEvent struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}

		if err := json.Unmarshal(message, &incomingEvent); err != nil {
			continue
		}

		switch incomingEvent.Type {
		case "TYPING_START":
			now := time.Now()
			if now.Sub(c.lastTyping) < 1500*time.Millisecond {
				continue
			}
			c.lastTyping = now

			var typingData struct {
				ChannelID   uuid.UUID   `json:"channel_id"`
				GuildID     *uuid.UUID  `json:"guild_id,omitempty"`
				RecipientID *uuid.UUID  `json:"recipient_id,omitempty"`
				UserIDs     []uuid.UUID `json:"user_ids,omitempty"`
			}
			if err := json.Unmarshal(incomingEvent.Data, &typingData); err == nil && typingData.ChannelID != uuid.Nil {
				event := models.WSEvent{
					Type: models.EventTypingStart,
					Data: map[string]any{
						"channel_id": typingData.ChannelID,
						"user_id":    c.UserID,
					},
				}
				if typingData.GuildID != nil && *typingData.GuildID != uuid.Nil {
					if c.Hub.IsGuildMember(*typingData.GuildID, c.UserID) {
						if c.Hub.ChannelUsersProvider != nil {
							ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
							allowedUsers, isPrivate := c.Hub.ChannelUsersProvider(ctx, *typingData.GuildID, typingData.ChannelID)
							cancel()
							if isPrivate {
								userAllowed := false
								for _, u := range allowedUsers {
									if u == c.UserID {
										userAllowed = true
										break
									}
								}
								if userAllowed && len(allowedUsers) > 0 {
									c.Hub.BroadcastToUsers(allowedUsers, event)
								}
								continue
							}
						}
						c.Hub.BroadcastToGuild(*typingData.GuildID, event)
					}
				} else if len(typingData.UserIDs) > 0 {
					// Restrict to max 15 participants in a group DM, filter self/nil
					validTargets := make([]uuid.UUID, 0, 15)
					for _, uid := range typingData.UserIDs {
						if uid != uuid.Nil && uid != c.UserID {
							validTargets = append(validTargets, uid)
							if len(validTargets) >= 15 {
								break
							}
						}
					}
					if len(validTargets) > 0 {
						c.Hub.BroadcastToUsers(validTargets, event)
					}
				} else if typingData.RecipientID != nil && *typingData.RecipientID != uuid.Nil && *typingData.RecipientID != c.UserID {
					c.Hub.BroadcastToUsers([]uuid.UUID{*typingData.RecipientID}, event)
				}
			}

		case "PING":
			c.send <- []byte(`{"type":"PONG"}`)
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current websocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	// Validate e2ee_version if present in query parameters or headers
	verStr := r.URL.Query().Get("e2ee_version")
	if verStr == "" {
		verStr = r.Header.Get("X-Client-E2EE-Version")
	}
	if verStr != "" {
		ver, err := strconv.Atoi(verStr)
		minVer := middleware.GetMinE2EEClientVersion()
		if err != nil || ver < minVer {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUpgradeRequired)
			json.NewEncoder(w).Encode(map[string]any{
				"error":       "E2EE_VERSION_TOO_OLD",
				"min_version": minVer,
			})
			return
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Gateway] Failed to upgrade to websocket: %v", err)
		return
	}

	var deviceIDPtr *uuid.UUID
	if devIDStr := r.URL.Query().Get("device_id"); devIDStr != "" {
		if parsed, err := uuid.Parse(devIDStr); err == nil {
			if hub.DeviceValidator == nil || hub.DeviceValidator(r.Context(), userID, parsed) {
				deviceIDPtr = &parsed
			} else {
				log.Printf("[Gateway] Device %s rejected for user %s (revoked or not owned)", parsed, userID)
			}
		}
	}

	client := &Client{
		Hub:      hub,
		Conn:     conn,
		UserID:   userID,
		DeviceID: deviceIDPtr,
		send:     make(chan []byte, 256),
	}

	client.Hub.Register <- client

	go client.WritePump()
	go client.ReadPump()
}
