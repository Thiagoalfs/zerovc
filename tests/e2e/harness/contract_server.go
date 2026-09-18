package harness

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ContractServer is an in-process HTTP server simulating the ZeroVC backend contracts strictly.
type ContractServer struct {
	Server *httptest.Server
	URL    string

	mu sync.Mutex

	// In-memory data store
	users       map[uuid.UUID]*UserPublic
	userTokens  map[string]uuid.UUID     // token -> userID
	userCSRF    map[uuid.UUID]string     // userID -> csrfToken
	passwords   map[string]string        // email -> password
	userByEmail map[string]*UserPublic
	blocks      map[uuid.UUID]map[uuid.UUID]bool // userID -> set of blocked userIDs

	guilds      map[uuid.UUID]*Guild
	guildMembers map[uuid.UUID]map[uuid.UUID]bool // guildID -> set of userIDs
	guildBans   map[uuid.UUID]map[uuid.UUID]string // guildID -> userID -> reason
	guildMutes  map[uuid.UUID]map[uuid.UUID]time.Time // guildID -> userID -> mutedUntil
	roles       map[uuid.UUID]*Role
	memberRoles map[uuid.UUID]map[uuid.UUID][]uuid.UUID // guildID -> userID -> []roleID
	invites     map[string]*Invite

	channels    map[uuid.UUID]*Channel
	messages    map[uuid.UUID]*Message
	readStates  map[uuid.UUID]map[uuid.UUID]uuid.UUID // guildID/channelID -> userID -> lastReadMsgID

	dmRooms     map[uuid.UUID]*DMRoom
	dmGroups    map[uuid.UUID]*DMGroup
	dmMessages  map[uuid.UUID]*Message

	voiceSessions map[uuid.UUID]*VoiceSession // userID -> session
	auditLogs   map[uuid.UUID][]map[string]any // guildID -> logs

	// Rate limiting counters
	rateLimits map[string][]time.Time // key -> timestamps
}

// NewContractServer instantiates a mock server adhering strictly to the ZeroVC specifications.
func NewContractServer() *ContractServer {
	cs := &ContractServer{
		users:         make(map[uuid.UUID]*UserPublic),
		userTokens:    make(map[string]uuid.UUID),
		userCSRF:      make(map[uuid.UUID]string),
		passwords:     make(map[string]string),
		userByEmail:   make(map[string]*UserPublic),
		blocks:        make(map[uuid.UUID]map[uuid.UUID]bool),
		guilds:        make(map[uuid.UUID]*Guild),
		guildMembers:  make(map[uuid.UUID]map[uuid.UUID]bool),
		guildBans:     make(map[uuid.UUID]map[uuid.UUID]string),
		guildMutes:    make(map[uuid.UUID]map[uuid.UUID]time.Time),
		roles:         make(map[uuid.UUID]*Role),
		memberRoles:   make(map[uuid.UUID]map[uuid.UUID][]uuid.UUID),
		invites:       make(map[string]*Invite),
		channels:      make(map[uuid.UUID]*Channel),
		messages:      make(map[uuid.UUID]*Message),
		readStates:    make(map[uuid.UUID]map[uuid.UUID]uuid.UUID),
		dmRooms:       make(map[uuid.UUID]*DMRoom),
		dmGroups:      make(map[uuid.UUID]*DMGroup),
		dmMessages:    make(map[uuid.UUID]*Message),
		voiceSessions: make(map[uuid.UUID]*VoiceSession),
		auditLogs:     make(map[uuid.UUID][]map[string]any),
		rateLimits:    make(map[string][]time.Time),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", cs.handleAll)

	server := httptest.NewServer(mux)
	cs.Server = server
	cs.URL = server.URL
	return cs
}

func (cs *ContractServer) Close() {
	if cs.Server != nil {
		cs.Server.Close()
	}
}

func (cs *ContractServer) authenticate(r *http.Request) (*UserPublic, error) {
	authHeader := r.Header.Get("Authorization")
	var token string
	if strings.HasPrefix(authHeader, "Bearer ") {
		token = strings.TrimPrefix(authHeader, "Bearer ")
	} else if cookie, err := r.Cookie("token"); err == nil {
		token = cookie.Value
	}

	if token == "" {
		return nil, fmt.Errorf("missing token")
	}

	userID, exists := cs.userTokens[token]
	if !exists {
		return nil, fmt.Errorf("invalid token")
	}

	user, ok := cs.users[userID]
	if !ok {
		return nil, fmt.Errorf("user not found")
	}
	return user, nil
}

func (cs *ContractServer) validateCSRF(r *http.Request, userID uuid.UUID) bool {
	// Rule: Safe methods GET, HEAD, OPTIONS bypass CSRF
	if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
		return true
	}

	// Mutation methods POST, PATCH, PUT, DELETE must have valid X-CSRF-Token
	receivedToken := r.Header.Get("X-CSRF-Token")
	if receivedToken == "" {
		return false
	}

	expectedToken, ok := cs.userCSRF[userID]
	if !ok || expectedToken == "" {
		return false
	}

	// Constant-time comparison
	return subtle.ConstantTimeCompare([]byte(expectedToken), []byte(receivedToken)) == 1
}

func (cs *ContractServer) checkRateLimit(key string, maxReq int, window time.Duration) bool {
	now := time.Now()
	cutoff := now.Add(-window)

	list := cs.rateLimits[key]
	var active []time.Time
	for _, t := range list {
		if t.After(cutoff) {
			active = append(active, t)
		}
	}

	if len(active) >= maxReq {
		cs.rateLimits[key] = active
		return false // exceeded
	}

	active = append(active, now)
	cs.rateLimits[key] = active
	return true
}

func writeJSON(w http.ResponseWriter, status int, val any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(val)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg})
}

// Master dispatch router
func (cs *ContractServer) handleAll(w http.ResponseWriter, r *http.Request) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	path := r.URL.Path

	// 1. Health & Version
	if path == "/health" {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "database": "connected"})
		return
	}
	if path == "/api/version" {
		writeJSON(w, http.StatusOK, map[string]any{"version": "1.0.0", "status": "online"})
		return
	}

	// 2. Public Auth Routes
	if strings.HasPrefix(path, "/api/auth/") {
		switch path {
		case "/api/auth/register":
			if r.Method != http.MethodPost {
				writeError(w, http.StatusMethodNotAllowed, "method not allowed")
				return
			}
			var body struct {
				Username string `json:"username"`
				Email    string `json:"email"`
				Password string `json:"password"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				writeError(w, http.StatusBadRequest, "malformed payload")
				return
			}
			if body.Username == "" || body.Email == "" || len(body.Password) < 6 {
				writeError(w, http.StatusBadRequest, "invalid registration fields")
				return
			}
			if _, exists := cs.userByEmail[body.Email]; exists {
				writeError(w, http.StatusConflict, "email already registered")
				return
			}
			userID := uuid.New()
			user := &UserPublic{
				ID:            userID,
				Username:      body.Username,
				DisplayName:   body.Username,
				Status:        "offline",
				EmailVerified: false,
			}
			cs.users[userID] = user
			cs.userByEmail[body.Email] = user
			cs.passwords[body.Email] = body.Password
			writeJSON(w, http.StatusCreated, map[string]any{
				"message": "verification code sent",
				"user_id": userID,
			})
			return

		case "/api/auth/verify-email":
			if r.Method != http.MethodPost {
				writeError(w, http.StatusMethodNotAllowed, "method not allowed")
				return
			}
			var body struct {
				Email string `json:"email"`
				Code  string `json:"code"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				writeError(w, http.StatusBadRequest, "malformed payload")
				return
			}
			user, ok := cs.userByEmail[body.Email]
			if !ok {
				writeError(w, http.StatusNotFound, "user not found")
				return
			}
			if body.Code != "123456" && body.Code != "000000" {
				writeError(w, http.StatusBadRequest, "invalid verification code")
				return
			}
			user.EmailVerified = true
			writeJSON(w, http.StatusOK, map[string]any{"message": "email verified"})
			return

		case "/api/auth/login":
			if r.Method != http.MethodPost {
				writeError(w, http.StatusMethodNotAllowed, "method not allowed")
				return
			}
			// Rate limit login
			if !cs.checkRateLimit("login_"+r.RemoteAddr, 10, time.Minute) {
				writeError(w, http.StatusTooManyRequests, "too many login attempts")
				return
			}
			var body struct {
				Email    string `json:"email"`
				Password string `json:"password"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				writeError(w, http.StatusBadRequest, "malformed payload")
				return
			}
			expectedPw, ok := cs.passwords[body.Email]
			if !ok || expectedPw != body.Password {
				writeError(w, http.StatusUnauthorized, "invalid credentials")
				return
			}
			user := cs.userByEmail[body.Email]
			token := "jwt_" + uuid.New().String()
			csrfToken := "csrf_" + uuid.New().String()
			cs.userTokens[token] = user.ID
			cs.userCSRF[user.ID] = csrfToken
			user.Status = "online"

			http.SetCookie(w, &http.Cookie{
				Name:     "token",
				Value:    token,
				Path:     "/",
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
			})
			http.SetCookie(w, &http.Cookie{
				Name:     "csrf_token",
				Value:    csrfToken,
				Path:     "/",
				HttpOnly: false,
			})
			writeJSON(w, http.StatusOK, AuthResponse{
				Token:     token,
				User:      *user,
				CSRFToken: csrfToken,
			})
			return

		case "/api/auth/logout":
			if r.Method != http.MethodPost {
				writeError(w, http.StatusMethodNotAllowed, "method not allowed")
				return
			}
			http.SetCookie(w, &http.Cookie{
				Name:     "token",
				Value:    "",
				Path:     "/",
				Expires:  time.Unix(0, 0),
				HttpOnly: true,
			})
			writeJSON(w, http.StatusOK, map[string]any{"message": "logged out"})
			return
		}
	}

	// 3. Public Invite Preview
	if strings.HasPrefix(path, "/api/invites/") && r.Method == http.MethodGet {
		code := strings.TrimPrefix(path, "/api/invites/")
		inv, ok := cs.invites[code]
		if !ok {
			writeError(w, http.StatusNotFound, "invite not found")
			return
		}
		writeJSON(w, http.StatusOK, inv)
		return
	}

	// Protected Endpoints from here on: Authenticate user
	user, err := cs.authenticate(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// CSRF validation on all state mutation methods
	if !cs.validateCSRF(r, user.ID) {
		writeError(w, http.StatusForbidden, "CSRF token missing or invalid")
		return
	}

	// Rate limit check on specific operations
	if strings.HasSuffix(path, "/messages") && r.Method == http.MethodPost {
		if !cs.checkRateLimit("msg_"+user.ID.String(), 10, time.Second) {
			writeError(w, http.StatusTooManyRequests, "sending messages too fast")
			return
		}
	}

	// Dispatch protected routes
	switch {
	case path == "/api/auth/me":
		csrf := cs.userCSRF[user.ID]
		writeJSON(w, http.StatusOK, map[string]any{
			"user":       user,
			"csrf_token": csrf,
		})
		return

	case path == "/api/auth/export-data":
		if !cs.checkRateLimit("export_"+user.ID.String(), 1, 10*time.Minute) {
			writeError(w, http.StatusTooManyRequests, "rate limit exceeded for export")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": user, "guilds": []any{}})
		return

	case path == "/api/auth/2fa/generate":
		writeJSON(w, http.StatusOK, map[string]any{
			"secret":  "JBSWY3DPEHPK3PXP",
			"otpauth": "otpauth://totp/ZeroVC?secret=JBSWY3DPEHPK3PXP",
		})
		return

	case path == "/api/auth/2fa/enable":
		var body struct {
			Code string `json:"code"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Code == "" {
			writeError(w, http.StatusBadRequest, "code required")
			return
		}
		user.TwoFactorEnabled = true
		writeJSON(w, http.StatusOK, map[string]any{"backup_codes": []string{"1111", "2222"}})
		return

	case path == "/api/auth/2fa/disable":
		user.TwoFactorEnabled = false
		writeJSON(w, http.StatusOK, map[string]any{"message": "2fa disabled"})
		return

	case path == "/api/users/@me":
		var update struct {
			DisplayName *string `json:"display_name"`
			Bio         *string `json:"bio"`
			Status      *string `json:"status"`
		}
		_ = json.NewDecoder(r.Body).Decode(&update)
		if update.DisplayName != nil {
			user.DisplayName = *update.DisplayName
		}
		if update.Bio != nil {
			user.Bio = *update.Bio
		}
		if update.Status != nil {
			user.Status = *update.Status
		}
		writeJSON(w, http.StatusOK, user)
		return

	case strings.HasPrefix(path, "/api/users/") && strings.HasSuffix(path, "/block"):
		targetIDStr := strings.TrimSuffix(strings.TrimPrefix(path, "/api/users/"), "/block")
		targetID, parseErr := uuid.Parse(targetIDStr)
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "invalid target id")
			return
		}
		if r.Method == http.MethodPost {
			if cs.blocks[user.ID] == nil {
				cs.blocks[user.ID] = make(map[uuid.UUID]bool)
			}
			cs.blocks[user.ID][targetID] = true
			writeJSON(w, http.StatusOK, map[string]any{"message": "user blocked"})
			return
		} else if r.Method == http.MethodDelete {
			if cs.blocks[user.ID] != nil {
				delete(cs.blocks[user.ID], targetID)
			}
			writeJSON(w, http.StatusOK, map[string]any{"message": "user unblocked"})
			return
		}

	case path == "/api/guilds":
		if r.Method == http.MethodGet {
			var list []*Guild
			for gID, members := range cs.guildMembers {
				if members[user.ID] {
					if g, ok := cs.guilds[gID]; ok {
						list = append(list, g)
					}
				}
			}
			writeJSON(w, http.StatusOK, list)
			return
		} else if r.Method == http.MethodPost {
			var body struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
				writeError(w, http.StatusBadRequest, "guild name required")
				return
			}
			if len(body.Name) > 100 {
				writeError(w, http.StatusBadRequest, "guild name too long")
				return
			}
			guildID := uuid.New()
			generalChanID := uuid.New()
			everyoneRoleID := uuid.New()

			guild := &Guild{
				ID:          guildID,
				Name:        body.Name,
				OwnerID:     user.ID,
				MemberCount: 1,
				Channels: []Channel{
					{
						ID:        generalChanID,
						GuildID:   guildID,
						Name:      "geral",
						Type:      "text",
						Position:  0,
						CreatedAt: time.Now(),
					},
				},
				Roles: []Role{
					{
						ID:          everyoneRoleID,
						GuildID:     guildID,
						Name:        "@everyone",
						Position:    0,
						Permissions: 104324161,
						IsDefault:   true,
					},
				},
			}
			cs.guilds[guildID] = guild
			if cs.guildMembers[guildID] == nil {
				cs.guildMembers[guildID] = make(map[uuid.UUID]bool)
			}
			cs.guildMembers[guildID][user.ID] = true
			cs.channels[generalChanID] = &guild.Channels[0]
			cs.roles[everyoneRoleID] = &guild.Roles[0]
			writeJSON(w, http.StatusCreated, guild)
			return
		}

	case strings.HasPrefix(path, "/api/guilds/"):
		parts := strings.Split(strings.TrimPrefix(path, "/api/guilds/"), "/")
		guildID, parseErr := uuid.Parse(parts[0])
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "invalid guild id")
			return
		}
		guild, exists := cs.guilds[guildID]
		if !exists {
			writeError(w, http.StatusNotFound, "guild not found")
			return
		}

		if len(parts) == 1 {
			// /api/guilds/{id}
			if r.Method == http.MethodGet {
				if !cs.guildMembers[guildID][user.ID] {
					writeError(w, http.StatusForbidden, "not a guild member")
					return
				}
				writeJSON(w, http.StatusOK, guild)
				return
			} else if r.Method == http.MethodPatch {
				if guild.OwnerID != user.ID {
					writeError(w, http.StatusForbidden, "must be guild owner to update")
					return
				}
				var update struct {
					Name *string `json:"name"`
				}
				_ = json.NewDecoder(r.Body).Decode(&update)
				if update.Name != nil {
					guild.Name = *update.Name
				}
				writeJSON(w, http.StatusOK, guild)
				return
			} else if r.Method == http.MethodDelete {
				if guild.OwnerID != user.ID {
					writeError(w, http.StatusForbidden, "must be guild owner to delete")
					return
				}
				delete(cs.guilds, guildID)
				delete(cs.guildMembers, guildID)
				writeJSON(w, http.StatusOK, map[string]any{"message": "guild deleted"})
				return
			}
		}

		// Sub-routes under /api/guilds/{id}/...
		sub := parts[1]
		switch sub {
		case "leave":
			if guild.OwnerID == user.ID {
				writeError(w, http.StatusBadRequest, "owner cannot leave guild; transfer ownership or delete")
				return
			}
			delete(cs.guildMembers[guildID], user.ID)
			writeJSON(w, http.StatusOK, map[string]any{"message": "left guild"})
			return

		case "invites":
			if r.Method == http.MethodGet {
				var list []*Invite
				for _, inv := range cs.invites {
					if inv.GuildID == guildID {
						list = append(list, inv)
					}
				}
				writeJSON(w, http.StatusOK, list)
				return
			} else if r.Method == http.MethodPost {
				code := uuid.New().String()[:8]
				inv := &Invite{
					Code:      code,
					GuildID:   guildID,
					GuildName: guild.Name,
					InviterID: user.ID,
					CreatedAt: time.Now(),
				}
				cs.invites[code] = inv
				writeJSON(w, http.StatusCreated, inv)
				return
			}

		case "channels":
			if r.Method == http.MethodPost {
				var body struct {
					Name string `json:"name"`
					Type string `json:"type"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				if body.Name == "" {
					writeError(w, http.StatusBadRequest, "channel name required")
					return
				}
				chID := uuid.New()
				ch := &Channel{
					ID:        chID,
					GuildID:   guildID,
					Name:      body.Name,
					Type:      body.Type,
					CreatedAt: time.Now(),
				}
				cs.channels[chID] = ch
				guild.Channels = append(guild.Channels, *ch)
				writeJSON(w, http.StatusCreated, ch)
				return
			}

		case "roles":
			if r.Method == http.MethodGet {
				var list []*Role
				for _, r := range cs.roles {
					if r.GuildID == guildID {
						list = append(list, r)
					}
				}
				writeJSON(w, http.StatusOK, list)
				return
			} else if r.Method == http.MethodPost {
				var body struct {
					Name        string `json:"name"`
					Permissions int64  `json:"permissions"`
					Color       string `json:"color"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				if body.Name == "" {
					writeError(w, http.StatusBadRequest, "role name required")
					return
				}
				rID := uuid.New()
				role := &Role{
					ID:          rID,
					GuildID:     guildID,
					Name:        body.Name,
					Color:       body.Color,
					Permissions: body.Permissions,
				}
				cs.roles[rID] = role
				guild.Roles = append(guild.Roles, *role)
				writeJSON(w, http.StatusCreated, role)
				return
			}

		case "members":
			if len(parts) >= 4 && parts[3] == "kick" {
				targetUID, _ := uuid.Parse(parts[2])
				if guild.OwnerID != user.ID {
					writeError(w, http.StatusForbidden, "only owner/moderator can kick")
					return
				}
				delete(cs.guildMembers[guildID], targetUID)
				writeJSON(w, http.StatusOK, map[string]any{"message": "member kicked"})
				return
			}
			if len(parts) >= 4 && parts[3] == "mute" {
				targetUID, _ := uuid.Parse(parts[2])
				if cs.guildMutes[guildID] == nil {
					cs.guildMutes[guildID] = make(map[uuid.UUID]time.Time)
				}
				cs.guildMutes[guildID][targetUID] = time.Now().Add(10 * time.Minute)
				writeJSON(w, http.StatusOK, map[string]any{"message": "member muted"})
				return
			}
			if len(parts) >= 5 && parts[3] == "roles" {
				targetUID, _ := uuid.Parse(parts[2])
				roleUID, _ := uuid.Parse(parts[4])
				if cs.memberRoles[guildID] == nil {
					cs.memberRoles[guildID] = make(map[uuid.UUID][]uuid.UUID)
				}
				if r.Method == http.MethodPost {
					cs.memberRoles[guildID][targetUID] = append(cs.memberRoles[guildID][targetUID], roleUID)
					writeJSON(w, http.StatusOK, map[string]any{"message": "role assigned"})
					return
				} else if r.Method == http.MethodDelete {
					var filtered []uuid.UUID
					for _, rID := range cs.memberRoles[guildID][targetUID] {
						if rID != roleUID {
							filtered = append(filtered, rID)
						}
					}
					cs.memberRoles[guildID][targetUID] = filtered
					writeJSON(w, http.StatusOK, map[string]any{"message": "role removed"})
					return
				}
			}

		case "bans":
			if r.Method == http.MethodPost {
				if guild.OwnerID != user.ID {
					writeError(w, http.StatusForbidden, "only owner/moderator can ban")
					return
				}
				var body struct {
					UserID string `json:"user_id"`
					Reason string `json:"reason"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				bannedUID, _ := uuid.Parse(body.UserID)
				if cs.guildBans[guildID] == nil {
					cs.guildBans[guildID] = make(map[uuid.UUID]string)
				}
				cs.guildBans[guildID][bannedUID] = body.Reason
				delete(cs.guildMembers[guildID], bannedUID)
				writeJSON(w, http.StatusOK, map[string]any{"message": "user banned"})
				return
			} else if r.Method == http.MethodDelete && len(parts) >= 3 {
				bannedUID, _ := uuid.Parse(parts[2])
				if cs.guildBans[guildID] != nil {
					delete(cs.guildBans[guildID], bannedUID)
				}
				writeJSON(w, http.StatusOK, map[string]any{"message": "user unbanned"})
				return
			}

		case "audit-logs":
			writeJSON(w, http.StatusOK, cs.auditLogs[guildID])
			return
		}

	case strings.HasPrefix(path, "/api/channels/"):
		parts := strings.Split(strings.TrimPrefix(path, "/api/channels/"), "/")
		chID, parseErr := uuid.Parse(parts[0])
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "invalid channel id")
			return
		}
		ch, exists := cs.channels[chID]
		if !exists {
			writeError(w, http.StatusNotFound, "channel not found")
			return
		}

		if len(parts) == 1 {
			if r.Method == http.MethodPatch {
				var body struct {
					Topic *string `json:"topic"`
					Name  *string `json:"name"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				if body.Topic != nil {
					ch.Topic = *body.Topic
				}
				if body.Name != nil {
					ch.Name = *body.Name
				}
				writeJSON(w, http.StatusOK, ch)
				return
			} else if r.Method == http.MethodDelete {
				delete(cs.channels, chID)
				writeJSON(w, http.StatusOK, map[string]any{"message": "channel deleted"})
				return
			}
		}

		sub := parts[1]
		switch sub {
		case "messages":
			if len(parts) == 2 {
				if r.Method == http.MethodGet {
					var list []*Message
					for _, m := range cs.messages {
						if m.ChannelID == chID {
							list = append(list, m)
						}
					}
					writeJSON(w, http.StatusOK, list)
					return
				} else if r.Method == http.MethodPost {
					// Check mute state
					if until, muted := cs.guildMutes[ch.GuildID][user.ID]; muted && until.After(time.Now()) {
						writeError(w, http.StatusForbidden, "you are muted in this server")
						return
					}
					var body struct {
						Content   string     `json:"content"`
						ReplyToID *uuid.UUID `json:"reply_to_id"`
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						writeError(w, http.StatusBadRequest, "malformed payload")
						return
					}
					if strings.TrimSpace(body.Content) == "" {
						writeError(w, http.StatusBadRequest, "content required")
						return
					}
					if len(body.Content) > 2000 {
						writeError(w, http.StatusBadRequest, "message exceeds 2000 characters limit")
						return
					}
					msgID := uuid.New()
					msg := &Message{
						ID:        msgID,
						ChannelID: chID,
						AuthorID:  user.ID,
						Author:    *user,
						Content:   body.Content,
						ReplyToID: body.ReplyToID,
						CreatedAt: time.Now(),
						UpdatedAt: time.Now(),
					}
					cs.messages[msgID] = msg
					writeJSON(w, http.StatusCreated, msg)
					return
				}
			} else if len(parts) >= 3 {
				msgID, parseMsgErr := uuid.Parse(parts[2])
				if parseMsgErr != nil {
					writeError(w, http.StatusBadRequest, "invalid message id")
					return
				}
				msg, ok := cs.messages[msgID]
				if !ok {
					writeError(w, http.StatusNotFound, "message not found")
					return
				}
				if len(parts) == 3 {
					if r.Method == http.MethodPatch {
						if msg.AuthorID != user.ID {
							writeError(w, http.StatusForbidden, "not author of message")
							return
						}
						var update struct {
							Content string `json:"content"`
						}
						_ = json.NewDecoder(r.Body).Decode(&update)
						msg.Content = update.Content
						msg.IsEdited = true
						t := time.Now()
						msg.EditedAt = &t
						writeJSON(w, http.StatusOK, msg)
						return
					} else if r.Method == http.MethodDelete {
						if msg.AuthorID != user.ID && cs.guilds[ch.GuildID].OwnerID != user.ID {
							writeError(w, http.StatusForbidden, "not allowed to delete message")
							return
						}
						delete(cs.messages, msgID)
						writeJSON(w, http.StatusOK, map[string]any{"message": "deleted"})
						return
					}
				}
				if len(parts) >= 4 && parts[3] == "pin" {
					msg.IsPinned = !msg.IsPinned
					writeJSON(w, http.StatusOK, msg)
					return
				}
				if len(parts) >= 4 && parts[3] == "reactions" {
					if r.Method == http.MethodPost {
						var body struct {
							Emoji string `json:"emoji"`
						}
						_ = json.NewDecoder(r.Body).Decode(&body)
						found := false
						for i := range msg.Reactions {
							if msg.Reactions[i].Emoji == body.Emoji {
								msg.Reactions[i].Count++
								msg.Reactions[i].UserIDs = append(msg.Reactions[i].UserIDs, user.ID)
								found = true
								break
							}
						}
						if !found {
							msg.Reactions = append(msg.Reactions, MessageReaction{
								Emoji:   body.Emoji,
								Count:   1,
								UserIDs: []uuid.UUID{user.ID},
							})
						}
						writeJSON(w, http.StatusOK, msg)
						return
					} else if r.Method == http.MethodDelete && len(parts) >= 5 {
						emoji := parts[4]
						for i := range msg.Reactions {
							if msg.Reactions[i].Emoji == emoji {
								msg.Reactions[i].Count--
								break
							}
						}
						writeJSON(w, http.StatusOK, msg)
						return
					} else if r.Method == http.MethodGet {
						writeError(w, http.StatusMethodNotAllowed, "method not allowed")
						return
					}
				}
			}

		case "pins":
			var pinned []*Message
			for _, m := range cs.messages {
				if m.ChannelID == chID && m.IsPinned {
					pinned = append(pinned, m)
				}
			}
			writeJSON(w, http.StatusOK, pinned)
			return

		case "ack":
			writeJSON(w, http.StatusOK, map[string]any{"channel_id": chID, "status": "acked"})
			return

		case "join-voice":
			tokenResp := VoiceTokenResponse{
				Token:      "livekit_token_" + uuid.New().String(),
				LiveKitURL: "wss://zerovc.safiroko.xyz/livekit",
				RoomName:   chID.String(),
			}
			cs.voiceSessions[user.ID] = &VoiceSession{
				UserID:      user.ID,
				ChannelID:   chID,
				ConnectedAt: time.Now(),
			}
			writeJSON(w, http.StatusOK, tokenResp)
			return

		case "leave-voice":
			delete(cs.voiceSessions, user.ID)
			writeJSON(w, http.StatusOK, map[string]any{"message": "left voice"})
			return

		case "voice-state":
			var state VoiceSession
			_ = json.NewDecoder(r.Body).Decode(&state)
			state.UserID = user.ID
			state.ChannelID = chID
			cs.voiceSessions[user.ID] = &state
			writeJSON(w, http.StatusOK, state)
			return
		}

	case strings.HasPrefix(path, "/api/invites/") && strings.HasSuffix(path, "/join"):
		code := strings.TrimSuffix(strings.TrimPrefix(path, "/api/invites/"), "/join")
		inv, ok := cs.invites[code]
		if !ok {
			writeError(w, http.StatusNotFound, "invite not found")
			return
		}
		// Check ban
		if _, banned := cs.guildBans[inv.GuildID][user.ID]; banned {
			writeError(w, http.StatusForbidden, "you are banned from this server")
			return
		}
		if cs.guildMembers[inv.GuildID] == nil {
			cs.guildMembers[inv.GuildID] = make(map[uuid.UUID]bool)
		}
		cs.guildMembers[inv.GuildID][user.ID] = true
		inv.Uses++
		writeJSON(w, http.StatusOK, map[string]any{"message": "joined guild", "guild_id": inv.GuildID})
		return

	case path == "/api/dms":
		if r.Method == http.MethodGet {
			var list []*DMRoom
			for _, r := range cs.dmRooms {
				if r.User1ID == user.ID || r.User2ID == user.ID {
					list = append(list, r)
				}
			}
			writeJSON(w, http.StatusOK, list)
			return
		} else if r.Method == http.MethodPost {
			var body struct {
				RecipientID string `json:"recipient_id"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			recipID, _ := uuid.Parse(body.RecipientID)

			// Check block
			if cs.blocks[recipID] != nil && cs.blocks[recipID][user.ID] {
				writeError(w, http.StatusForbidden, "recipient has blocked you")
				return
			}

			// Idempotent search
			for _, r := range cs.dmRooms {
				if (r.User1ID == user.ID && r.User2ID == recipID) || (r.User1ID == recipID && r.User2ID == user.ID) {
					writeJSON(w, http.StatusOK, r)
					return
				}
			}
			roomID := uuid.New()
			room := &DMRoom{
				ID:        roomID,
				User1ID:   user.ID,
				User2ID:   recipID,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			cs.dmRooms[roomID] = room
			writeJSON(w, http.StatusCreated, room)
			return
		}

	case strings.HasPrefix(path, "/api/dms/"):
		parts := strings.Split(strings.TrimPrefix(path, "/api/dms/"), "/")
		roomID, parseErr := uuid.Parse(parts[0])
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "invalid room id")
			return
		}
		_, ok := cs.dmRooms[roomID]
		if !ok {
			writeError(w, http.StatusNotFound, "dm room not found")
			return
		}
		if len(parts) >= 2 && parts[1] == "messages" {
			if r.Method == http.MethodPost {
				var body struct {
					Content string `json:"content"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				if strings.TrimSpace(body.Content) == "" {
					writeError(w, http.StatusBadRequest, "content required")
					return
				}
				msgID := uuid.New()
				msg := &Message{
					ID:        msgID,
					ChannelID: roomID,
					AuthorID:  user.ID,
					Author:    *user,
					Content:   body.Content,
					CreatedAt: time.Now(),
					UpdatedAt: time.Now(),
				}
				cs.dmMessages[msgID] = msg
				writeJSON(w, http.StatusCreated, msg)
				return
			}
		}
		if len(parts) >= 3 && parts[1] == "call" {
			action := parts[2]
			switch action {
			case "invite":
				writeJSON(w, http.StatusOK, map[string]any{"room_id": roomID, "status": "calling"})
				return
			case "accept":
				writeJSON(w, http.StatusOK, VoiceTokenResponse{
					Token:      "dm_call_token_" + uuid.New().String(),
					LiveKitURL: "wss://zerovc.safiroko.xyz/livekit",
					RoomName:   roomID.String(),
				})
				return
			case "reject", "leave":
				writeJSON(w, http.StatusOK, map[string]any{"room_id": roomID, "status": "ended"})
				return
			}
		}

	case path == "/api/dm/groups":
		if r.Method == http.MethodGet {
			var list []*DMGroup
			for _, g := range cs.dmGroups {
				for _, m := range g.Members {
					if m.ID == user.ID {
						list = append(list, g)
						break
					}
				}
			}
			writeJSON(w, http.StatusOK, list)
			return
		} else if r.Method == http.MethodPost {
			var body struct {
				Name      string      `json:"name"`
				MemberIDs []uuid.UUID `json:"member_ids"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if len(body.MemberIDs) > 15 {
				writeError(w, http.StatusBadRequest, "maximum 15 members allowed in dm group")
				return
			}
			gID := uuid.New()
			group := &DMGroup{
				ID:        gID,
				Name:      body.Name,
				OwnerID:   user.ID,
				Members:   []UserPublic{*user},
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			for _, mID := range body.MemberIDs {
				if m, ok := cs.users[mID]; ok {
					group.Members = append(group.Members, *m)
				}
			}
			cs.dmGroups[gID] = group
			writeJSON(w, http.StatusCreated, group)
			return
		}

	case strings.HasPrefix(path, "/api/upload/"):
		writeJSON(w, http.StatusOK, map[string]any{
			"url": "/assets/user/att_" + uuid.New().String() + ".webp",
		})
		return

	default:
		writeError(w, http.StatusNotFound, "route not found")
		return
	}

	_ = io.Discard
}
