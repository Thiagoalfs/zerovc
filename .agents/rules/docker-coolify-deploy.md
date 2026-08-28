# Diretrizes de Deploy Docker & Coolify

## Nomes de Serviços e DNS Interno
- Em ambientes com redes compartilhadas (como a rede `coolify`), NUNCA utilize nomes genéricos de host para dependências internas (ex: `postgres`, `redis`, `db`).
- Sempre utilize o nome específico do container ou alias único (ex: `zerovc-postgres`, `zerovc-redis`) nas variáveis de ambiente (`DATABASE_URL`, etc.) e no `docker-compose.yml` para evitar conflito de resolução com outros containers no mesmo servidor.

## Traefik Labels no Docker Compose
- Ao expor containers via Traefik no Coolify, declare roteadores tanto para `http` quanto para `https`.
- Isso garante suporte a tráfego web direto, compatibilidade com proxies reversos e emissão automática e contínua de certificados SSL via Let's Encrypt (desafio HTTP-01).

## Diagnóstico de Conectividade Externa (Firewall & DNAT)
- Caso portas abertas no `ufw` continuem apresentando `connection timed out` externamente, verifique a tabela NAT do `iptables` (`iptables-save | grep PREROUTING`) para garantir que regras de DNAT legadas não estejam desviando pacotes das portas 80/443.
