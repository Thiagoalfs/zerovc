package gateway

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

type userGuildsCacheEntry struct {
	guildIDs  []uuid.UUID
	expiresAt time.Time
}

// UserGuildsCache armazena em memória as guildas de cada usuário com TTL
// para evitar que cada nova conexão de WebSocket consulte o banco de dados.
type UserGuildsCache struct {
	mu      sync.RWMutex
	entries map[uuid.UUID]userGuildsCacheEntry
	ttl     time.Duration
}

func NewUserGuildsCache(ttl time.Duration) *UserGuildsCache {
	return &UserGuildsCache{
		entries: make(map[uuid.UUID]userGuildsCacheEntry),
		ttl:     ttl,
	}
}

// Get retorna as guildas em cache se a entrada existir e não estiver expirada
func (c *UserGuildsCache) Get(userID uuid.UUID) ([]uuid.UUID, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.entries[userID]
	if !ok || time.Now().After(entry.expiresAt) {
		return nil, false
	}

	// Retorna uma cópia para evitar concorrência acidental
	result := make([]uuid.UUID, len(entry.guildIDs))
	copy(result, entry.guildIDs)
	return result, true
}

// Set armazena as guildas no cache com o TTL configurado
func (c *UserGuildsCache) Set(userID uuid.UUID, guildIDs []uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[userID] = userGuildsCacheEntry{
		guildIDs:  guildIDs,
		expiresAt: time.Now().Add(c.ttl),
	}
}

// Invalidate remove um usuário específico do cache (ex: ao entrar/sair de servidor)
func (c *UserGuildsCache) Invalidate(userID uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.entries, userID)
}

// InvalidateAll limpa todas as entradas do cache
func (c *UserGuildsCache) InvalidateAll() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries = make(map[uuid.UUID]userGuildsCacheEntry)
}
