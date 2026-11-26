# Multi-stage build
FROM node:20-alpine AS frontend-builder

WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY client/index.html client/vite.config.ts client/tsconfig.json client/tailwind.config.js client/postcss.config.js ./
COPY client/public ./public
COPY client/src ./src
RUN npx tsc && npx vite build

FROM golang:1.23-alpine AS builder

WORKDIR /app

# Cache Go dependencies layer
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy backend source code
COPY backend/ .

# Compile static Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -mod=mod -ldflags="-s -w" -o zerovc-server ./cmd/server/main.go

# Minimal runtime container
FROM alpine:latest

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy root certificates from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /app/zerovc-server .

# Copy freshly built Web App assets into container
COPY --from=frontend-builder /client/dist ./web

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

CMD ["./zerovc-server"]
