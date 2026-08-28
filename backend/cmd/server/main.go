package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/handlers"
	"github.com/zerovc/zerovc/backend/internal/models"
	"github.com/zerovc/zerovc/backend/internal/voice"
)

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func main() {
	port := getEnv("PORT", "8080")
	dbURL := getEnv("DATABASE_URL", "postgres://zerovc_user:zerovc_password_change_me@localhost:5432/zerovc?sslmode=disable")
	jwtSecret := getEnv("JWT_SECRET", "zerovc_super_secret_jwt_key_32bytes_long")
	livekitPublicURL := getEnv("LIVEKIT_PUBLIC_URL", "ws://localhost:7880")
	livekitKey := getEnv("LIVEKIT_API_KEY", "devkey")
	livekitSecret := getEnv("LIVEKIT_API_SECRET", "secret_livekit_key_change_in_production")
	webDir := getEnv("WEB_DIR", "./web")

	log.Printf("[ZeroVC] Starting backend on port %s...", port)

	// 1. Connect to Database
	db, err := database.Connect(dbURL)
	if err != nil {
		log.Fatalf("[ZeroVC] Database connection failed: %v", err)
	}
	defer db.Close()

	// 2. Run initial schema migrations
	if err := db.AutoMigrate(context.Background()); err != nil {
		log.Printf("[ZeroVC] Migration warning: %v", err)
	}

	// 3. Initialize Services
	authService := auth.NewService(jwtSecret)
	livekitService := voice.NewLiveKitService(livekitKey, livekitSecret, livekitPublicURL)
	hub := gateway.NewHub()

	// On user connection: update user status to 'online' if was 'offline', and broadcast
	hub.OnUserConnected = func(userID uuid.UUID) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var currentStatus string
		_ = db.Pool.QueryRow(ctx, "SELECT status FROM users WHERE id = $1", userID).Scan(&currentStatus)
		if currentStatus == "offline" || currentStatus == "" {
			db.Pool.Exec(ctx, "UPDATE users SET status = 'online' WHERE id = $1", userID)
			currentStatus = "online"
		}

		hub.BroadcastGlobal(models.WSEvent{
			Type: models.EventUserUpdate,
			Data: map[string]any{
				"id":     userID,
				"status": currentStatus,
			},
		})
	}

	// Auto-clean voice session on user disconnection and mark as offline
	hub.OnUserDisconnected = func(userID uuid.UUID) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var channelID, guildID uuid.UUID
		query := `
			SELECT vs.channel_id, c.guild_id
			FROM voice_sessions vs
			INNER JOIN channels c ON c.id = vs.channel_id
			WHERE vs.user_id = $1
		`
		err := db.Pool.QueryRow(ctx, query, userID).Scan(&channelID, &guildID)
		if err == nil {
			db.Pool.Exec(ctx, "DELETE FROM voice_sessions WHERE user_id = $1", userID)
			if guildID != uuid.Nil {
				hub.BroadcastToGuild(guildID, models.WSEvent{
					Type: models.EventVoiceStateUpdate,
					Data: map[string]any{
						"action":     "leave",
						"channel_id": channelID,
						"user_id":    userID,
					},
				})
			}
		}

		// Update database status to offline and broadcast
		db.Pool.Exec(ctx, "UPDATE users SET status = 'offline' WHERE id = $1", userID)
		hub.BroadcastGlobal(models.WSEvent{
			Type: models.EventUserUpdate,
			Data: map[string]any{
				"id":     userID,
				"status": "offline",
			},
		})
	}

	go hub.Run()

	// 4. Initialize Handlers
	authHandler := handlers.NewAuthHandler(db, authService)
	userHandler := handlers.NewUserHandler(db, hub)
	guildHandler := handlers.NewGuildHandler(db, hub)
	channelHandler := handlers.NewChannelHandler(db, hub, livekitService)
	messageHandler := handlers.NewMessageHandler(db, hub)
	inviteHandler := handlers.NewInviteHandler(db, hub)
	friendHandler := handlers.NewFriendHandler(db, hub)
	roleHandler := handlers.NewRoleHandler(db, hub)
	dmHandler := handlers.NewDMHandler(db, hub, livekitService)
	dmGroupHandler := handlers.NewDMGroupHandler(db, hub, livekitService)

	uploadDir := getEnv("UPLOAD_DIR", "./assets")
	uploadHandler := handlers.NewUploadHandler(uploadDir)

	// 5. Router & Middleware
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// CORS Configuration
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc:  func(r *http.Request, origin string) bool { return true },
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Public Health Check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","time":"` + time.Now().UTC().Format(time.RFC3339) + `"}`))
	})

	// Public Auth Endpoints
	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", authHandler.Register)
		r.Post("/login", authHandler.Login)
		r.Post("/logout", authHandler.Logout)
	})

	// Public Invite Preview
	r.Get("/api/invites/{code}", inviteHandler.GetInvite)

	// Protected API Routes
	r.Group(func(r chi.Router) {
		r.Use(authService.Middleware)

		// Current User & Profile Customization
		r.Get("/api/auth/me", authHandler.Me)
		r.Post("/api/auth/2fa/generate", authHandler.Generate2FA)
		r.Post("/api/auth/2fa/enable", authHandler.Enable2FA)
		r.Post("/api/auth/2fa/disable", authHandler.Disable2FA)
		r.Post("/api/auth/change-password", authHandler.ChangePassword)
		r.Post("/api/auth/change-email", authHandler.ChangeEmail)
		r.Patch("/api/users/@me", userHandler.UpdateProfile)
		r.Get("/api/users/me/blocks", userHandler.ListBlockedUsers)
		r.Post("/api/users/{id}/block", userHandler.BlockUser)
		r.Delete("/api/users/{id}/block", userHandler.UnblockUser)

		// Guilds (Protected)
		r.Get("/api/guilds", guildHandler.List)
		r.Post("/api/guilds", guildHandler.Create)
		r.Get("/api/guilds/{id}", guildHandler.GetDetails)
		r.Patch("/api/guilds/{id}", guildHandler.Update)
		r.Delete("/api/guilds/{id}", guildHandler.Delete)
		r.Post("/api/guilds/{id}/join", guildHandler.Join)
		r.Post("/api/guilds/{id}/invites", inviteHandler.CreateInvite)

		// Guild Moderation (Protected)
		r.Post("/api/guilds/{id}/members/{userID}/kick", guildHandler.KickMember)
		r.Post("/api/guilds/{id}/bans", guildHandler.BanMember)
		r.Delete("/api/guilds/{id}/bans/{userID}", guildHandler.UnbanMember)
		r.Post("/api/guilds/{id}/members/{userID}/mute", guildHandler.MuteMember)

		// Channels (Protected)
		r.Post("/api/guilds/{guildID}/channels", channelHandler.Create)
		r.Patch("/api/channels/{id}", channelHandler.Update)
		r.Delete("/api/channels/{id}", channelHandler.Delete)
		r.Put("/api/guilds/{guildID}/channels/positions", channelHandler.Reorder)

		// Server Roles (Protected)
		r.Get("/api/guilds/{guildID}/roles", roleHandler.List)
		r.Post("/api/guilds/{guildID}/roles", roleHandler.Create)
		r.Patch("/api/guilds/{guildID}/roles/{roleID}", roleHandler.Update)
		r.Delete("/api/guilds/{guildID}/roles/{roleID}", roleHandler.Delete)
		r.Post("/api/guilds/{guildID}/members/{userID}/roles/{roleID}", roleHandler.AssignRole)
		r.Delete("/api/guilds/{guildID}/members/{userID}/roles/{roleID}", roleHandler.RemoveRole)

		// Join server via 10-char invite hash
		r.Post("/api/invites/{code}/join", inviteHandler.JoinByInvite)

		// Friends & Friend Requests (Protected)
		r.Get("/api/friends", friendHandler.ListFriends)
		r.Post("/api/friends/request", friendHandler.SendRequest)
		r.Post("/api/friends/{id}/accept", friendHandler.AcceptRequest)
		r.Post("/api/friends/{id}/reject", friendHandler.RemoveFriend)

		// Direct Messages 1x1 (Protected)
		r.Get("/api/dms", dmHandler.ListRooms)
		r.Post("/api/dms", dmHandler.CreateOrGetRoom)
		r.Get("/api/dms/{roomID}/messages", dmHandler.ListMessages)
		r.Post("/api/dms/{roomID}/messages", dmHandler.SendMessage)
		r.Post("/api/dms/{roomID}/messages/{messageID}/reactions", dmHandler.AddReaction)
		r.Delete("/api/dms/{roomID}/messages/{messageID}/reactions/{emoji}", dmHandler.RemoveReaction)
		r.Post("/api/dms/{roomID}/call/invite", dmHandler.InviteCall)
		r.Post("/api/dm/rooms/{roomID}/call/invite", dmHandler.InviteCall)
		r.Post("/api/dms/{roomID}/call/accept", dmHandler.AcceptCall)
		r.Post("/api/dm/rooms/{roomID}/call/accept", dmHandler.AcceptCall)
		r.Post("/api/dms/{roomID}/call/reject", dmHandler.RejectCall)
		r.Post("/api/dm/rooms/{roomID}/call/reject", dmHandler.RejectCall)
		r.Post("/api/dms/{roomID}/call/leave", dmHandler.LeaveCall)
		r.Post("/api/dm/rooms/{roomID}/call/leave", dmHandler.LeaveCall)

		// DM Groups (Protected - Up to 10 Members)
		r.Get("/api/dm/groups", dmGroupHandler.ListGroups)
		r.Post("/api/dm/groups", dmGroupHandler.CreateGroup)
		r.Get("/api/dm/groups/{id}", dmGroupHandler.GetGroup)
		r.Patch("/api/dm/groups/{id}", dmGroupHandler.UpdateGroup)
		r.Post("/api/dm/groups/{id}/members", dmGroupHandler.AddMembers)
		r.Delete("/api/dm/groups/{id}/members/{userID}", dmGroupHandler.RemoveMember)
		r.Get("/api/dm/groups/{id}/messages", dmGroupHandler.ListMessages)
		r.Post("/api/dm/groups/{id}/messages", dmGroupHandler.SendMessage)
		r.Post("/api/dm/groups/{id}/voice-token", dmGroupHandler.JoinVoice)

		// Messages (Protected)
		r.Get("/api/channels/{channelID}/messages", messageHandler.List)
		r.Post("/api/channels/{channelID}/messages", messageHandler.Send)
		r.Patch("/api/channels/{channelID}/messages/{messageID}", messageHandler.Update)
		r.Delete("/api/channels/{channelID}/messages/{messageID}", messageHandler.Delete)
		r.Post("/api/channels/{channelID}/messages/{messageID}/reactions", messageHandler.AddReaction)
		r.Delete("/api/channels/{channelID}/messages/{messageID}/reactions/{emoji}", messageHandler.RemoveReaction)
		r.Post("/api/channels/{channelID}/messages/{messageID}/pin", messageHandler.TogglePin)

		// Voice & WebRTC (Protected)
		r.Post("/api/channels/{id}/join-voice", channelHandler.JoinVoice)
		r.Post("/api/channels/{id}/leave-voice", channelHandler.LeaveVoice)
		r.Post("/api/channels/{id}/voice-state", channelHandler.UpdateVoiceState)
		r.Post("/api/channels/{channelID}/members/{userID}/voice-state", channelHandler.AdminUpdateVoiceState)

		// Upload Endpoints (Protected)
		r.Post("/api/upload/avatar", uploadHandler.UploadAvatar)
		r.Post("/api/upload/guild-icon", uploadHandler.UploadGuildIcon)
		r.Post("/api/upload/guild-banner", uploadHandler.UploadGuildBanner)
		r.Post("/api/upload/banner", uploadHandler.UploadBanner)
		r.Post("/api/upload/attachment", uploadHandler.UploadAttachment)

		// WebSocket Gateway (Protected)
		r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
			userID, ok := auth.GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			rows, err := db.Pool.Query(r.Context(), "SELECT guild_id FROM guild_members WHERE user_id = $1", userID)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var gID uuid.UUID
					if scanErr := rows.Scan(&gID); scanErr == nil {
						hub.AddGuildMember(gID, userID)
					}
				}
			}

			gateway.ServeWs(hub, w, r, userID)
		})
	})

	// 6. Internal CDN for user and guild uploaded media
	userAssetsDir := filepath.Join(uploadDir, "user")
	guildAssetsDir := filepath.Join(uploadDir, "guild")
	os.MkdirAll(userAssetsDir, 0755)
	os.MkdirAll(guildAssetsDir, 0755)

	r.Get("/assets/user/*", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.StripPrefix("/assets/user/", http.FileServer(http.Dir(userAssetsDir))).ServeHTTP(w, r)
	})
	r.Get("/assets/guild/*", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.StripPrefix("/assets/guild/", http.FileServer(http.Dir(guildAssetsDir))).ServeHTTP(w, r)
	})

	// 7. Serve Web Application (Single Page Application)
	if _, err := os.Stat(webDir); err == nil {
		fileServer := http.FileServer(http.Dir(webDir))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			if strings.HasPrefix(path, "/api") || path == "/ws" || path == "/health" {
				http.NotFound(w, r)
				return
			}

			fpath := filepath.Join(webDir, filepath.Clean(path))
			if info, err := os.Stat(fpath); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}

			http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
		})
		log.Printf("[ZeroVC] Web App enabled: serving from %s", webDir)
	} else {
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"name":"ZeroVC API","status":"online","version":"1.0.0"}`))
		})
	}

	// 7. Graceful Server Lifecycle
	server := &http.Server{
		Addr:         fmt.Sprintf("0.0.0.0:%s", port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[ZeroVC] Server listening on http://0.0.0.0:%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[ZeroVC] Server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("[ZeroVC] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("[ZeroVC] Server forced to shutdown: %v", err)
	}

	log.Println("[ZeroVC] Server stopped.")
}
