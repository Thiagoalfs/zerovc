# Multi-stage build (100% offline & self-contained, zero apk network dependencies)
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY . .

# Compile static Go binary using pre-packaged vendor dependencies
RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -ldflags="-s -w" -o zerovc-server ./cmd/server/main.go

# Minimal runtime container
FROM alpine:latest

WORKDIR /app

# Copy root certificates from builder (eliminates need for 'apk add ca-certificates')
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /app/zerovc-server .

EXPOSE 8080

CMD ["./zerovc-server"]
