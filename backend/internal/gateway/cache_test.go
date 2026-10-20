package gateway_test

import (
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/gateway"
)

func TestUserGuildsCache(t *testing.T) {
	cache := gateway.NewUserGuildsCache(100 * time.Millisecond)

	userID := uuid.New()
	guild1 := uuid.New()
	guild2 := uuid.New()

	// 1. Deve retornar false se não existir
	_, found := cache.Get(userID)
	if found {
		t.Fatal("esperava que chave inexistente retornasse false")
	}

	// 2. Set e Get com sucesso
	cache.Set(userID, []uuid.UUID{guild1, guild2})
	guilds, found := cache.Get(userID)
	if !found || len(guilds) != 2 {
		t.Fatalf("esperava encontrar 2 guildas, obteve %d (found=%v)", len(guilds), found)
	}

	// 3. Invalidate
	cache.Invalidate(userID)
	_, found = cache.Get(userID)
	if found {
		t.Fatal("esperava que chave invalidada retornasse false")
	}

	// 4. TTL Expiration
	cache.Set(userID, []uuid.UUID{guild1})
	time.Sleep(120 * time.Millisecond)
	_, found = cache.Get(userID)
	if found {
		t.Fatal("esperava que chave expirasse após TTL")
	}

	// 5. Teste de Concorrência RWMutex
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			cache.Set(userID, []uuid.UUID{guild1})
		}()
		go func() {
			defer wg.Done()
			_, _ = cache.Get(userID)
		}()
	}
	wg.Wait()
}
