# ══════════════════════════════════════════════════════════════════════
#  Multi-Stage Production Dockerfile — Node.js 20 Alpine
# ══════════════════════════════════════════════════════════════════════

# ── Stage 1: Builder ─────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install production + dev dependencies (deterministic via lockfile)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy application source
COPY src/ ./src/

# Prune devDependencies (removes dotenv etc.)
RUN npm prune --omit=dev

# ── Stage 2: Production ─────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy only production node_modules and source from builder
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/src           ./src
COPY --from=builder --chown=appuser:appgroup /app/package.json  ./package.json

# Cloud Run injects PORT; default to 8080
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Switch to non-root user
USER appuser

# Use exec-form CMD (PID 1 receives SIGTERM for graceful shutdown)
CMD ["node", "src/index.js"]
