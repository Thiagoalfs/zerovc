package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
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
	go hub.Run()

	// 4. Initialize Handlers
	authHandler := handlers.NewAuthHandler(db, authService)
	guildHandler := handlers.NewGuildHandler(db, hub)
	channelHandler := handlers.NewChannelHandler(db, hub, livekitService)
	messageHandler := handlers.NewMessageHandler(db, hub)

	// 5. Router & Middleware
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// CORS Configuration (Permissive for Desktop and Dev)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Public Health Check (No token required)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","time":"` + time.Now().UTC().Format(time.RFC3339) + `"}`))
	})

	// Public Auth Endpoints (Register and Login only)
	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", authHandler.Register)
		r.Post("/login", authHandler.Login)
	})

	// ALL other API routes are strictly PROTECTED by JWT Authentication Middleware
	r.Group(func(r chi.Router) {
		r.Use(authService.Middleware)

		// Current User
		r.Get("/api/auth/me", authHandler.Me)

		// Guilds (Protected)
		r.Get("/api/guilds", guildHandler.List)
		r.Post("/api/guilds", guildHandler.Create)
		r.Get("/api/guilds/{id}", guildHandler.GetDetails)
		r.Post("/api/guilds/{id}/join", guildHandler.Join)
		r.Post("/api/guilds/{guildID}/channels", channelHandler.Create)

		// Messages (Protected)
		r.Get("/api/channels/{channelID}/messages", messageHandler.List)
		r.Post("/api/channels/{channelID}/messages", messageHandler.Send)

		// Voice & WebRTC (Protected)
		r.Post("/api/channels/{id}/join-voice", channelHandler.JoinVoice)
		r.Post("/api/channels/{id}/leave-voice", channelHandler.LeaveVoice)
		r.Post("/api/channels/{id}/voice-state", channelHandler.UpdateVoiceState)

		// WebSocket Gateway (Protected)
		r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
			userID, ok := auth.GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			// Load and sync user's authorized guilds into the hub
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

	// 6. Graceful Server Lifecycle
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
