.PHONY: up down restart build logs migrate seed test shell-be shell-db deploy backup help

# ── Docker ─────────────────────────────────────────────────
up:
	docker compose up -d --build
	@echo "✅ WorkLearn AI started at http://localhost:3000"

prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
	@echo "✅ WorkLearn Production started"

down:
	docker compose down

restart:
	docker compose restart backend frontend

build:
	docker compose build --no-cache

logs:
	docker compose logs -f --tail=100

logs-be:
	docker compose logs -f backend --tail=200

logs-ai:
	docker compose logs -f backend --tail=100 | grep -i "ai\|claude\|match\|score"

# ── Database ───────────────────────────────────────────────
migrate:
	@echo "Running migrations..."
	@for f in backend/database/migrations/*.sql; do \
		echo "  → $$f"; \
		docker compose exec -T postgres psql -U worklearn -d worklearn < "$$f" 2>/dev/null || true; \
	done
	@echo "✅ Migrations done"

seed:
	docker compose exec backend node database/seeds/seed.js
	@echo "✅ Seed data loaded"

backup:
	bash scripts/backup.sh
	@echo "✅ Backup complete"

# ── Development ────────────────────────────────────────────
dev-be:
	cd backend && npm run dev

dev-fe:
	cd frontend && npm run dev

install:
	cd backend && npm install
	cd frontend && npm install

# ── Testing ────────────────────────────────────────────────
test:
	cd backend && npm test

test-watch:
	cd backend && npm run test:watch

# ── AI-specific tools ──────────────────────────────────────
ai-test:
	@echo "Testing Claude API connection..."
	@curl -sf -X POST http://localhost:4000/api/v1/ai/jd/skills-suggest \
		-H "Content-Type: application/json" \
		-d '{"title":"Data Analyst"}' | python3 -m json.tool || echo "❌ AI endpoint unreachable"

ai-parse-jd:
	@echo "Test JD parser..."
	@curl -sf -X POST http://localhost:4000/api/v1/ai/jd/parse \
		-H "Content-Type: application/json" \
		-d '{"text":"Tuyen Data Analyst 2 nam kinh nghiem SQL Python Power BI"}' | python3 -m json.tool

ai-salary:
	@echo "Test salary prediction..."
	@curl -sf -X POST http://localhost:4000/api/v1/ai/salary/predict \
		-H "Content-Type: application/json" \
		-d '{"title":"Data Analyst","skills":["SQL","Python"],"location":"TPHCM","experienceYears":2}' | python3 -m json.tool

health:
	@curl -sf http://localhost:4000/api/v1/health | python3 -m json.tool

# ── Shell access ───────────────────────────────────────────
shell-be:
	docker compose exec backend sh

shell-db:
	docker compose exec postgres psql -U worklearn -d worklearn

shell-redis:
	docker compose exec redis redis-cli -a $$(grep REDIS_PASSWORD .env | cut -d= -f2)

# ── Production deploy ──────────────────────────────────────
deploy:
	bash scripts/deploy.sh

deploy-fresh:
	bash scripts/deploy.sh --fresh

# ── Cloudflare ─────────────────────────────────────────────
cf-deploy:
	cd cloudflare && npx wrangler deploy

cf-setup-r2:
	bash cloudflare/r2/setup.sh

# ── Cleanup ────────────────────────────────────────────────
clean:
	docker compose down -v
	@echo "✅ All volumes removed"

clean-hard:
	docker compose down -v --rmi all
	@echo "✅ All containers + images + volumes removed"

help:
	@echo ""
	@echo "WorkLearn Platform AI-Native — Available commands:"
	@echo ""
	@echo "  make up           Start all services (dev)"
	@echo "  make prod         Start in production mode"
	@echo "  make down         Stop all services"
	@echo "  make migrate      Run DB migrations"
	@echo "  make seed         Load demo data"
	@echo "  make backup       Backup PostgreSQL"
	@echo "  make deploy       Full production deploy"
	@echo "  make deploy-fresh Fresh install (clears data)"
	@echo "  make test         Run backend tests"
	@echo "  make ai-test      Test Claude AI endpoint"
	@echo "  make ai-parse-jd  Test JD parser"
	@echo "  make ai-salary    Test salary prediction"
	@echo "  make health       API health check"
	@echo "  make shell-db     PostgreSQL shell"
	@echo "  make cf-deploy    Deploy Cloudflare Workers"
	@echo ""
