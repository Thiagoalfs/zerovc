# Multi-stage build
FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY . .

# Compile static Go binary
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o zerovc-server ./cmd/server/main.go

# Minimal runtime container
FROM alpine:latest

WORKDIR /app

# Copy root certificates from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /app/zerovc-server .

# Copy static Web App assets into container
COPY --from=builder /app/web ./web

EXPOSE 8080

CMD ["./zerovc-server"]
