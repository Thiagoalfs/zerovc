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

	log.Println("Database schema migration executed successfully")
	return nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
