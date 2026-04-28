#!/bin/bash
# =============================================================
# WorkLearn Platform — Production Deploy Script
# Usage: bash scripts/deploy.sh [--fresh]
# =============================================================
set -euo pipefail

BOLD="\033[1m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
log()  { echo -e "${GREEN}[$(date +%H:%M:%S)] ✅ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠️  $1${NC}"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ❌ $1${NC}"; exit 1; }

echo -e "${BOLD}🚀 WorkLearn Platform — Deploy Script${NC}"
echo "=================================================="

# ── Pre-flight checks ──────────────────────────────────────
[ ! -f .env ] && err ".env not found. Run: cp .env.example .env && fill values"
[ -z "$(grep 'ANTHROPIC_API_KEY=sk-ant' .env || true)" ] && warn "ANTHROPIC_API_KEY may not be set"
[ -z "$(grep 'FPAY_MERCHANT_ID=' .env | grep -v '=$' || true)" ] && warn "FPAY_MERCHANT_ID not set (payment disabled)"
command -v docker >/dev/null || err "Docker not installed"
command -v docker compose version >/dev/null 2>&1 || err "Docker Compose v2 not installed"

FRESH="${1:-}"

# ── Fresh install ──────────────────────────────────────────
if [ "$FRESH" = "--fresh" ]; then
  warn "Fresh install: removing all volumes"
  docker compose down -v --remove-orphans 2>/dev/null || true
fi

# ── Pull latest images ─────────────────────────────────────
log "Pulling base images..."
docker compose pull postgres redis elasticsearch minio nginx 2>/dev/null || true

# ── Build application images ───────────────────────────────
log "Building backend image..."
docker compose build --no-cache backend

log "Building frontend image..."
docker compose build --no-cache frontend

# ── Start infrastructure first ─────────────────────────────
log "Starting infrastructure services..."
docker compose up -d postgres redis elasticsearch minio

log "Waiting for PostgreSQL to be ready..."
timeout 60 bash -c 'until docker compose exec -T postgres pg_isready -U worklearn; do sleep 2; done'

log "Waiting for Redis..."
timeout 30 bash -c 'until docker compose exec -T redis redis-cli -a "$(grep REDIS_PASSWORD .env | cut -d= -f2)" ping | grep -q PONG; do sleep 2; done'

log "Waiting for Elasticsearch..."
timeout 120 bash -c 'until curl -sf http://localhost:9200/_cluster/health 2>/dev/null; do sleep 5; done' || warn "ES may still be starting"

# ── Run migrations ─────────────────────────────────────────
log "Running database migrations..."
for migration in backend/database/migrations/*.sql; do
  echo "  → $(basename $migration)"
  docker compose exec -T postgres psql -U worklearn -d worklearn -f /dev/stdin < "$migration" 2>/dev/null || \
  docker compose run --rm -v "$(pwd)/backend/database/migrations:/migrations" backend \
    sh -c "PGPASSWORD=\$PGPASSWORD psql -h postgres -U worklearn -d worklearn -f /migrations/$(basename $migration)" 2>/dev/null || \
  warn "Migration $(basename $migration) may already be applied"
done

# ── Seed on fresh install ──────────────────────────────────
if [ "$FRESH" = "--fresh" ]; then
  log "Seeding demo data..."
  docker compose run --rm backend node database/seeds/seed.js
fi

# ── Start application ──────────────────────────────────────
log "Starting backend and frontend..."
docker compose up -d backend frontend

log "Waiting for backend health check..."
timeout 60 bash -c 'until curl -sf http://localhost:4000/api/v1/health | grep -q "ok"; do sleep 3; done' || err "Backend health check failed"

log "Starting nginx..."
docker compose up -d nginx

# ── SSL Certificate (if domain configured) ────────────────
DOMAIN=$(grep "CORS_ORIGIN" .env | sed 's/.*https:\/\///' | sed 's/\/.*//' || echo "")
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost:3000" ]; then
  if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    log "Obtaining SSL certificate for $DOMAIN..."
    docker compose up -d certbot
    sleep 5
    docker compose exec certbot certbot certonly --webroot \
      -w /var/www/certbot \
      -d "$DOMAIN" -d "www.$DOMAIN" \
      --non-interactive --agree-tos \
      -m "admin@$DOMAIN" || warn "SSL cert failed - check domain DNS"
  else
    log "SSL certificate already exists for $DOMAIN"
  fi
fi

# ── Cloudflare Workers deploy (optional) ──────────────────
if command -v wrangler >/dev/null 2>&1 && [ -f "cloudflare/wrangler.toml" ]; then
  log "Deploying Cloudflare Workers..."
  cd cloudflare && npx wrangler deploy && cd ..
else
  warn "Wrangler not found — skip Cloudflare Workers deploy"
fi

# ── Final health check ─────────────────────────────────────
sleep 3
HEALTH=$(curl -sf http://localhost/api/v1/health 2>/dev/null || curl -sf http://localhost:4000/api/v1/health 2>/dev/null || echo '{}')
echo ""
echo -e "${BOLD}📊 Deployment Status${NC}"
echo "=================================================="
echo "  Health: $HEALTH"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo -e "${GREEN}✅ WorkLearn Platform deployed successfully!${NC}"
echo ""
echo -e "  🌐 Frontend:  https://${DOMAIN:-localhost:3000}"
echo -e "  🔧 API:       https://${DOMAIN:-localhost:4000}/api/v1/health"
echo -e "  🪣 MinIO:     http://localhost:9001"
echo ""
echo -e "  Demo accounts:"
echo -e "    NLD:   minh@worklearn.demo / password123"
echo -e "    NTD:   hoa@worklearn.demo  / password123"
echo -e "    DTDT:  tuan@worklearn.demo / password123"
echo -e "    Admin: admin@worklearn.demo / password123"
