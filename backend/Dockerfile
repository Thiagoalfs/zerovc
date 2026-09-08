# Multi-stage build
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Cache Go dependencies layer
COPY go.mod go.sum ./
RUN go mod download

# Copy backend source code
COPY . .

# Compile static Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -mod=mod -ldflags="-s -w" -o zerovc-server ./cmd/server/main.go

# Minimal runtime container
FROM alpine:latest

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy root certificates from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /app/zerovc-server .

# Copy static Web App assets into container
COPY --from=builder /app/web ./web

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

CMD ["./zerovc-server"]
