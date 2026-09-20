package database

import (
	"context"
	_ "embed"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var SchemaSQL string

type DB struct {
	Pool *pgxpool.Pool
}

func Connect(databaseURL string) (*DB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	// Memory & pool tuning for 1 vCore / 2GB RAM
	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 1 * time.Hour
	config.MaxConnIdleTime = 15 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("Successfully connected to PostgreSQL")
	return &DB{Pool: pool}, nil
}

func (db *DB) AutoMigrate(ctx context.Context) error {
	_, err := db.Pool.Exec(ctx, SchemaSQL)
	if err != nil {
		return fmt.Errorf("failed to execute schema migration: %w", err)
	}

	// Clean up any stale voice sessions on server startup
	db.Pool.Exec(ctx, "DELETE FROM voice_sessions")

	// Ensure guild_roles columns exist
	db.Pool.Exec(ctx, "ALTER TABLE guild_roles ADD COLUMN IF NOT EXISTS hoist BOOLEAN DEFAULT FALSE")
	db.Pool.Exec(ctx, "ALTER TABLE guild_roles ADD COLUMN IF NOT EXISTS mentionable BOOLEAN DEFAULT FALSE")

	// Ensure guild_invites columns exist
	db.Pool.Exec(ctx, "ALTER TABLE guild_invites ADD COLUMN IF NOT EXISTS max_uses INT DEFAULT 0")
	db.Pool.Exec(ctx, "ALTER TABLE guild_invites ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE")

	// Ensure all usernames are lowercase and create unique index on LOWER(username)
	db.Pool.Exec(ctx, "UPDATE users SET username = LOWER(username)")
	db.Pool.Exec(ctx, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))")

	// Ensure email_verified column exists
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE")

	// Ensure email_verifications attempts column exists
	db.Pool.Exec(ctx, "ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0")

	// Ensure performance indexes exist
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_voice_sessions_user ON voice_sessions (user_id)")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_guild_member_roles_lookup ON guild_member_roles (guild_id, user_id)")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_guild_member_roles_role ON guild_member_roles (role_id)")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages (reply_to_id) WHERE reply_to_id IS NOT NULL")
	db.Pool.Exec(ctx, "ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON messages USING gin(search_vector)")

	// Ensure user custom_activity and server_folders exist
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_activity JSONB DEFAULT NULL")
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_activity_status BOOLEAN DEFAULT TRUE")
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_detect_activity BOOLEAN DEFAULT TRUE")
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS server_folders JSONB DEFAULT '[]'::jsonb")
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS guild_positions JSONB DEFAULT '[]'::jsonb")

	// Ensure user_sessions table and indexes exist
	db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS user_sessions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			token_hash VARCHAR(64) NOT NULL,
			ip_address VARCHAR(45) DEFAULT '',
			user_agent TEXT DEFAULT '',
			device_type VARCHAR(32) DEFAULT 'web',
			os VARCHAR(32) DEFAULT '',
			browser VARCHAR(32) DEFAULT '',
			last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)
	`)
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id)")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions (token_hash)")
	db.Pool.Exec(ctx, "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash_unique ON user_sessions (token_hash)")

	log.Println("Database schema migration executed successfully")
	return nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
