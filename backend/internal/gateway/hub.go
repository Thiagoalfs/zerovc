package gateway

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/models"
)

type Hub struct {
	// Registered clients mapped by UserID -> map[*Client]bool
	clients map[uuid.UUID]map[*Client]bool

	// Subscriptions: GuildID -> map[UserID]bool
	guildMembers map[uuid.UUID]map[uuid.UUID]bool

	// Channels for managing lifecycle
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan BroadcastMessage

	// Disconnect Hook
	OnUserDisconnected func(userID uuid.UUID)

	mu sync.RWMutex
}

type BroadcastMessage struct {
	GuildID   *uuid.UUID
	ChannelID *uuid.UUID
	Event     models.WSEvent
}

func NewHub() *Hub {
	return &Hub{
		clients:      make(map[uuid.UUID]map[*Client]bool),
		guildMembers: make(map[uuid.UUID]map[uuid.UUID]bool),
		Register:     make(chan *Client),
		Unregister:   make(chan *Client),
		Broadcast:    make(chan BroadcastMessage, 1024),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			if h.clients[client.UserID] == nil {
				h.clients[client.UserID] = make(map[*Client]bool)
			}
			h.clients[client.UserID][client] = true
			h.mu.Unlock()

			log.Printf("[Gateway] Client connected: user_id=%s, socket_count=%d", client.UserID, len(h.clients[client.UserID]))

		case client := <-h.Unregister:
			var userFullyDisconnected bool
			h.mu.Lock()
			if userClients, ok := h.clients[client.UserID]; ok {
				delete(userClients, client)
				close(client.send)
				if len(userClients) == 0 {
					delete(h.clients, client.UserID)
					userFullyDisconnected = true
					log.Printf("[Gateway] User fully disconnected: user_id=%s", client.UserID)
				}
			}
			h.mu.Unlock()

			if userFullyDisconnected && h.OnUserDisconnected != nil {
				go h.OnUserDisconnected(client.UserID)
			}

		case msg := <-h.Broadcast:
			payload, err := json.Marshal(msg.Event)
			if err != nil {
				log.Printf("[Gateway] Failed to marshal broadcast event: %v", err)
				continue
			}

			h.mu.RLock()
			if msg.GuildID != nil {
				// Broadcast only to guild members
				if members, ok := h.guildMembers[*msg.GuildID]; ok {
					for memberID := range members {
						if userClients, exists := h.clients[memberID]; exists {
							for c := range userClients {
								select {
								case c.send <- payload:
								default:
									close(c.send)
									delete(userClients, c)
								}
							}
						}
					}
				}
			} else {
				// Broadcast to all connected clients
				for _, userClients := range h.clients {
					for c := range userClients {
						select {
						case c.send <- payload:
						default:
							close(c.send)
							delete(userClients, c)
						}
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) UpdateGuildMembers(guildID uuid.UUID, memberIDs []uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.guildMembers[guildID] == nil {
		h.guildMembers[guildID] = make(map[uuid.UUID]bool)
	}
	for _, id := range memberIDs {
		h.guildMembers[guildID][id] = true
	}
}

func (h *Hub) AddGuildMember(guildID uuid.UUID, userID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.guildMembers[guildID] == nil {
		h.guildMembers[guildID] = make(map[uuid.UUID]bool)
	}
	h.guildMembers[guildID][userID] = true
}

func (h *Hub) RemoveGuildMember(guildID uuid.UUID, userID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if members, ok := h.guildMembers[guildID]; ok {
		delete(members, userID)
	}
}

func (h *Hub) BroadcastToGuild(guildID uuid.UUID, event models.WSEvent) {
	h.Broadcast <- BroadcastMessage{
		GuildID: &guildID,
		Event:   event,
	}
}

func (h *Hub) BroadcastGlobal(event models.WSEvent) {
	h.Broadcast <- BroadcastMessage{
		GuildID: nil,
		Event:   event,
	}
}

func (h *Hub) SendToUser(userID uuid.UUID, event models.WSEvent) {
	payload, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	if userClients, ok := h.clients[userID]; ok {
		for c := range userClients {
			select {
			case c.send <- payload:
			default:
			}
		}
	}
}
