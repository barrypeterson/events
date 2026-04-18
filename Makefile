.PHONY: dev setup stop clean db-studio db-seed db-push logs

# Start everything: Docker services, DB schema, dev servers
dev: .env node_modules
	@docker-compose up -d --wait
	@cd packages/database && pnpm prisma generate --no-hints 2>/dev/null && pnpm prisma db push --accept-data-loss 2>/dev/null
	@echo ""
	@echo "  Frontend:        http://localhost:6100"
	@echo "  Backend API:     http://localhost:6001"
	@echo "  Redis Commander: http://localhost:6081"
	@echo ""
	pnpm dev

# First-time setup only
setup: .env node_modules
	docker-compose up -d --wait
	cd packages/database && pnpm prisma generate && pnpm prisma db push
	@echo "Ready. Run: make dev"

# Create .env from example if missing
.env:
	cp .env.example .env
	@echo "Created .env from .env.example — add your ANTHROPIC_API_KEY then re-run."
	@exit 1

# Install deps if node_modules is stale
node_modules: package.json pnpm-lock.yaml
	pnpm install
	@touch node_modules

# Stop local dev servers (frontend/backend) + Docker services
stop:
	-@pkill -f "tsx.*src/server.ts" 2>/dev/null || true
	-@pkill -f "node.*vite" 2>/dev/null || true
	docker-compose down

# Stop everything + wipe volumes
clean:
	-@pkill -f "tsx.*src/server.ts" 2>/dev/null || true
	-@pkill -f "node.*vite" 2>/dev/null || true
	docker-compose down -v

# Prisma Studio (DB browser)
db-studio:
	cd packages/database && pnpm prisma studio

# Seed sample data
db-seed:
	pnpm db:seed

# Push schema changes
db-push:
	cd packages/database && pnpm prisma db push

# Tail Docker logs
logs:
	docker-compose logs -f
