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

	// Memory & pool tuning for 1 vCore / 2GB RAM (High concurrency optimized)
	config.MaxConns = 50
	config.MinConns = 10
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

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

	// Defensive cleanup of legacy bot Gork
	db.Pool.Exec(ctx, "UPDATE messages SET author_id = invoker_id WHERE author_id = '00000000-0000-0000-0000-000000000001' AND invoker_id IS NOT NULL")
	db.Pool.Exec(ctx, "DELETE FROM messages WHERE author_id = '00000000-0000-0000-0000-000000000001'")
	db.Pool.Exec(ctx, "UPDATE dm_messages SET author_id = invoker_id WHERE author_id = '00000000-0000-0000-0000-000000000001' AND invoker_id IS NOT NULL")
	db.Pool.Exec(ctx, "DELETE FROM dm_messages WHERE author_id = '00000000-0000-0000-0000-000000000001'")
	db.Pool.Exec(ctx, "UPDATE dm_group_messages SET author_id = invoker_id WHERE author_id = '00000000-0000-0000-0000-000000000001' AND invoker_id IS NOT NULL")
	db.Pool.Exec(ctx, "DELETE FROM dm_group_messages WHERE author_id = '00000000-0000-0000-0000-000000000001'")
	db.Pool.Exec(ctx, "DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000001' OR LOWER(username) = 'gork'")

	// Ensure guild_roles columns exist
	db.Pool.Exec(ctx, "ALTER TABLE guild_roles ADD COLUMN IF NOT EXISTS hoist BOOLEAN DEFAULT FALSE")
	db.Pool.Exec(ctx, "ALTER TABLE guild_roles ADD COLUMN IF NOT EXISTS mentionable BOOLEAN DEFAULT FALSE")
	// Backfill PermUseCommands (524288) for existing roles that already have PermSendMessages (128)
	db.Pool.Exec(ctx, "UPDATE guild_roles SET permissions = permissions | 524288 WHERE (permissions & 128) != 0 AND (permissions & 524288) = 0")

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
	db.Pool.Exec(ctx, "ALTER TABLE dm_rooms ADD COLUMN IF NOT EXISTS user1_closed_at TIMESTAMP WITH TIME ZONE")
	db.Pool.Exec(ctx, "ALTER TABLE dm_rooms ADD COLUMN IF NOT EXISTS user2_closed_at TIMESTAMP WITH TIME ZONE")

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
	// Ensure all dm_groups have a valid owner who is a member of that group
	db.Pool.Exec(ctx, `
		UPDATE dm_groups g
		SET owner_id = (
			SELECT gm.user_id
			FROM dm_group_members gm
			WHERE gm.group_id = g.id
			ORDER BY gm.joined_at ASC
			LIMIT 1
		)
		WHERE g.owner_id IS NULL
		   OR NOT EXISTS (
			   SELECT 1 FROM dm_group_members gm WHERE gm.group_id = g.id AND gm.user_id = g.owner_id
		   )
	`)

	// Clean up any empty dm_groups with no members
	db.Pool.Exec(ctx, `
		DELETE FROM dm_groups
		WHERE id NOT IN (SELECT DISTINCT group_id FROM dm_group_members)
	`)

	// Ensure bot, riot and embeds columns exist
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE")
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS riot_game_name VARCHAR(64) DEFAULT ''")
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS riot_tag_line VARCHAR(16) DEFAULT ''")
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS riot_region VARCHAR(16) DEFAULT 'br1'")
	db.Pool.Exec(ctx, "ALTER TABLE users ADD COLUMN IF NOT EXISTS riot_puuid VARCHAR(128) DEFAULT ''")

	db.Pool.Exec(ctx, "ALTER TABLE messages ADD COLUMN IF NOT EXISTS embeds JSONB DEFAULT '[]'::jsonb")
	db.Pool.Exec(ctx, "ALTER TABLE messages ADD COLUMN IF NOT EXISTS invoker_id UUID REFERENCES users(id) ON DELETE SET NULL")
	db.Pool.Exec(ctx, "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_tts BOOLEAN DEFAULT FALSE")

	db.Pool.Exec(ctx, "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS embeds JSONB DEFAULT '[]'::jsonb")
	db.Pool.Exec(ctx, "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS invoker_id UUID REFERENCES users(id) ON DELETE SET NULL")
	db.Pool.Exec(ctx, "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS is_tts BOOLEAN DEFAULT FALSE")

	db.Pool.Exec(ctx, "ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS embeds JSONB DEFAULT '[]'::jsonb")
	db.Pool.Exec(ctx, "ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS invoker_id UUID REFERENCES users(id) ON DELETE SET NULL")
	db.Pool.Exec(ctx, "ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS is_tts BOOLEAN DEFAULT FALSE")

	// Ensure bot_temp_files table exists
	db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS bot_temp_files (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			file_url TEXT NOT NULL,
			file_path TEXT NOT NULL,
			message_id UUID,
			channel_id UUID,
			dm_room_id UUID,
			dm_group_id UUID,
			expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 day'),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)
	`)
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_bot_temp_files_expires_at ON bot_temp_files (expires_at)")

	// Ensure E2EE conversation flags and rotation epochs exist (default TRUE for DMs and DM Groups)
	db.Pool.Exec(ctx, "ALTER TABLE dm_rooms ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT TRUE")
	db.Pool.Exec(ctx, "ALTER TABLE dm_rooms ADD COLUMN IF NOT EXISTS rotation_epoch INT DEFAULT 1")
	db.Pool.Exec(ctx, "ALTER TABLE dm_rooms ALTER COLUMN e2ee_enabled SET DEFAULT TRUE")
	db.Pool.Exec(ctx, "ALTER TABLE dm_groups ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT TRUE")
	db.Pool.Exec(ctx, "ALTER TABLE dm_groups ADD COLUMN IF NOT EXISTS rotation_epoch INT DEFAULT 1")
	db.Pool.Exec(ctx, "ALTER TABLE dm_groups ALTER COLUMN e2ee_enabled SET DEFAULT TRUE")
	// Activate E2EE for all active DMs and groups
	db.Pool.Exec(ctx, "UPDATE dm_rooms SET e2ee_enabled = TRUE, rotation_epoch = COALESCE(rotation_epoch, 1) WHERE e2ee_enabled IS NOT TRUE")
	db.Pool.Exec(ctx, "UPDATE dm_groups SET e2ee_enabled = TRUE, rotation_epoch = COALESCE(rotation_epoch, 1) WHERE e2ee_enabled IS NOT TRUE")
	db.Pool.Exec(ctx, "ALTER TABLE channels ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT FALSE")
	db.Pool.Exec(ctx, "ALTER TABLE channels ADD COLUMN IF NOT EXISTS rotation_epoch INT DEFAULT 1")
	db.Pool.Exec(ctx, "ALTER TABLE channels ADD COLUMN IF NOT EXISTS audience_limit INT DEFAULT 15")
	db.Pool.Exec(ctx, "ALTER TABLE channels ADD COLUMN IF NOT EXISTS audience_hash TEXT")

	// Ensure E2EE message ciphertext and metadata columns exist
	db.Pool.Exec(ctx, "ALTER TABLE messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE")
	db.Pool.Exec(ctx, "ALTER TABLE messages ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT")
	db.Pool.Exec(ctx, "ALTER TABLE messages ADD COLUMN IF NOT EXISTS e2ee_meta JSONB")
	db.Pool.Exec(ctx, "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE")
	db.Pool.Exec(ctx, "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT")
	db.Pool.Exec(ctx, "ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS e2ee_meta JSONB")
	db.Pool.Exec(ctx, "ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE")
	db.Pool.Exec(ctx, "ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT")
	db.Pool.Exec(ctx, "ALTER TABLE dm_group_messages ADD COLUMN IF NOT EXISTS e2ee_meta JSONB")
	db.Pool.Exec(ctx, "ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS dm_group_message_id UUID REFERENCES dm_group_messages(id) ON DELETE CASCADE")
	db.Pool.Exec(ctx, "ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT")
	db.Pool.Exec(ctx, "ALTER TABLE message_reactions ALTER COLUMN emoji DROP NOT NULL")
	db.Pool.Exec(ctx, "CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_dm_group_reaction ON message_reactions (dm_group_message_id, user_id, emoji) WHERE dm_group_message_id IS NOT NULL")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_message_reactions_dm_group ON message_reactions (dm_group_message_id)")

	// Ensure E2EE attachments table exists
	db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS e2ee_attachments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			file_size BIGINT NOT NULL,
			associated_message_id UUID,
			conversation_type VARCHAR(16) CHECK (conversation_type IN ('dm', 'dm_group', 'channel')),
			conversation_id UUID,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)
	`)
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_e2ee_attachments_uploader ON e2ee_attachments (uploader_id)")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_e2ee_attachments_created ON e2ee_attachments (created_at)")

	// Ensure composite unique indexes for message idempotency exist
	db.Pool.Exec(ctx, "CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_dm_msg_room_id ON dm_messages (dm_room_id, id)")
	db.Pool.Exec(ctx, "CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_dm_group_msg_group_id ON dm_group_messages (group_id, id)")
	db.Pool.Exec(ctx, "CREATE UNIQUE INDEX IF NOT EXISTS idx_uniq_channel_msg_channel_id ON messages (channel_id, id)")

	// Ensure E2EE performance indexes exist
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_e2ee_devices_user ON e2ee_devices (user_id) WHERE revoked_at IS NULL")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_e2ee_one_time_keys_device ON e2ee_one_time_keys (device_id) WHERE claimed_at IS NULL")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_e2ee_to_device_recipient ON e2ee_to_device (recipient_device_id, created_at ASC)")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_e2ee_rosters_latest ON e2ee_rosters (conversation_type, conversation_id, version DESC)")

	// Ensure E2EE key backups table and envelope columns exist
	db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS e2ee_key_backups (
			user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			backup_public_key TEXT NOT NULL DEFAULT '',
			wrapped_private_key TEXT NOT NULL DEFAULT '',
			ciphertext TEXT,
			iv TEXT,
			salt TEXT,
			key_count INT DEFAULT 0,
			version BIGINT NOT NULL DEFAULT 1,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)
	`)
	db.Pool.Exec(ctx, "ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS ciphertext TEXT")
	db.Pool.Exec(ctx, "ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS iv TEXT")
	db.Pool.Exec(ctx, "ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS salt TEXT")
	db.Pool.Exec(ctx, "ALTER TABLE e2ee_key_backups ADD COLUMN IF NOT EXISTS key_count INT DEFAULT 0")
	db.Pool.Exec(ctx, "ALTER TABLE e2ee_key_backups ALTER COLUMN backup_public_key DROP NOT NULL")
	db.Pool.Exec(ctx, "ALTER TABLE e2ee_key_backups ALTER COLUMN wrapped_private_key DROP NOT NULL")

	// Ensure E2EE room keys table and indexes exist
	db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS e2ee_room_keys (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			conversation_type VARCHAR(16) NOT NULL CHECK (conversation_type IN ('dm', 'dm_group', 'channel')),
			conversation_id UUID NOT NULL,
			session_id TEXT NOT NULL,
			session_key TEXT NOT NULL,
			sender_device_id TEXT NOT NULL DEFAULT '',
			epoch INT NOT NULL DEFAULT 1,
			created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			CONSTRAINT uq_e2ee_room_keys_conv_session UNIQUE (conversation_id, session_id)
		)
	`)
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_e2ee_room_keys_conv ON e2ee_room_keys (conversation_id)")
	db.Pool.Exec(ctx, "CREATE INDEX IF NOT EXISTS idx_e2ee_room_keys_session ON e2ee_room_keys (session_id)")

	log.Println("Database schema migration executed successfully")
	return nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
