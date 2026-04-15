# Local Development Guide

## 🚀 Quick Start

```bash
# Run the automated setup script
./scripts/setup.sh

# Start all services
pnpm dev
```

That's it! The setup script handles everything automatically.

## 📋 Prerequisites

Before running the setup script, ensure you have:

- **Node.js 20+** - [Download](https://nodejs.org/)
- **pnpm 9+** - Will be installed automatically if missing
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/)
- **Git** - [Download](https://git-scm.com/)

## 🔧 Manual Setup (if needed)

If you prefer manual setup or the script fails:

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Docker Services

```bash
docker-compose up -d
```

This starts:
- PostgreSQL 16 with pgvector extension
- Redis 7
- Redis Commander (GUI)
- Mailhog (Email testing)

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# Required for AI features
ANTHROPIC_API_KEY="sk-ant-..."
OPENAI_API_KEY="sk-..."

# Optional for Phase 2
SPOTIFY_CLIENT_ID="..."
SPOTIFY_CLIENT_SECRET="..."
```

### 4. Initialize Database

```bash
# Generate Prisma client
cd packages/database && pnpm prisma generate

# Push schema to database
pnpm prisma db push

# Seed with sample data
pnpm db:seed
```

### 5. Start Development Servers

```bash
pnpm dev
```

## 🌐 Services & URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | React app with Vite |
| Backend API | http://localhost:3001 | Express + tRPC server |
| Prisma Studio | http://localhost:5555 | Database GUI |
| Redis Commander | http://localhost:8081 | Redis GUI |
| Mailhog | http://localhost:8025 | Email testing interface |
| PostgreSQL | localhost:5432 | Database (use any SQL client) |

## 📁 Project Structure

```
slo-events/
├── apps/
│   ├── frontend/          # React + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── components/   # UI components (Shadcn)
│   │   │   ├── features/     # Feature modules
│   │   │   ├── lib/          # Utilities & API client
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   ├── backend/           # Express + tRPC + Prisma
│   │   ├── src/
│   │   │   ├── api/          # API routes (REST + tRPC)
│   │   │   ├── services/     # Business logic
│   │   │   ├── lib/          # Utilities & clients
│   │   │   └── server.ts
│   │   └── package.json
│   │
│   └── agents/            # AI scraper agents
│       ├── src/
│       │   ├── orchestrator/ # Agent coordinator
│       │   ├── scrapers/     # Venue scrapers
│       │   └── lib/          # Shared agent utilities
│       └── package.json
│
├── packages/
│   ├── database/          # Prisma schema & client
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       ├── index.ts      # Prisma client export
│   │       └── seed.ts       # Database seeding
│   │
│   ├── types/             # Shared TypeScript types
│   │   └── src/
│   │       ├── index.ts
│   │       ├── events.ts
│   │       └── api.ts
│   │
│   ├── ui/                # Shadcn/ui components
│   │   └── src/
│   │       └── components/
│   │
│   └── config/            # Shared configs (ESLint, TS, etc.)
│       ├── eslint-config.js
│       └── tsconfig.json
│
├── infrastructure/        # Terraform for AWS
│   ├── modules/
│   │   ├── vpc/
│   │   ├── ecs/
│   │   ├── rds/
│   │   └── ...
│   └── main.tf
│
├── docs/                  # Documentation
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   └── LOCAL_DEVELOPMENT.md
│
├── scripts/               # Utility scripts
│   └── setup.sh
│
├── docker-compose.yml     # Local services
├── turbo.json            # Monorepo configuration
└── package.json          # Root package
```

## 🛠️ Development Workflow

### Starting Development

```bash
# Start all services (frontend, backend, agents)
pnpm dev

# Or start individually
cd apps/frontend && pnpm dev
cd apps/backend && pnpm dev
cd apps/agents && pnpm dev
```

### Database Operations

```bash
# Open Prisma Studio (visual database editor)
pnpm db:studio

# Push schema changes without migrations (dev only)
pnpm db:push

# Create a migration (for production)
pnpm db:migrate

# Seed database with test data
pnpm db:seed

# Reset database (WARNING: deletes all data)
cd packages/database && pnpm prisma migrate reset
```

### Docker Operations

```bash
# Start services
pnpm docker:up

# Stop services
pnpm docker:down

# View logs
pnpm docker:logs

# View specific service logs
docker-compose logs -f postgres
docker-compose logs -f redis

# Restart a service
docker-compose restart postgres
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for specific package
cd apps/backend && pnpm test
```

### Linting & Formatting

```bash
# Lint all packages
pnpm lint

# Format all files
pnpm format

# Type check
pnpm type-check
```

## 🐛 Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres

# Reset database
docker-compose down -v
docker-compose up -d
pnpm db:push
```

### Port Already in Use

If you get "port already in use" errors:

```bash
# Find process using port 5432 (PostgreSQL)
lsof -i :5432

# Find process using port 3001 (Backend)
lsof -i :3001

# Kill process
kill -9 <PID>

# Or use different ports in .env
PORT=3002
```

### Prisma Client Out of Sync

```bash
# Regenerate Prisma client
cd packages/database && pnpm prisma generate

# If schema changed, push it
pnpm prisma db push
```

### Docker Issues

```bash
# Clean up Docker
docker-compose down -v
docker system prune -a

# Rebuild containers
docker-compose up -d --build
```

### pnpm Lock File Issues

```bash
# Remove lock file and reinstall
rm pnpm-lock.yaml
pnpm install
```

## 🔑 Getting API Keys

### Anthropic Claude API

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Add to `.env`: `ANTHROPIC_API_KEY="sk-ant-..."`

### OpenAI API

1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Add to `.env`: `OPENAI_API_KEY="sk-..."`

### Spotify API (Optional for Phase 1)

1. Go to https://developer.spotify.com/dashboard
2. Log in with Spotify account
3. Create an app
4. Get Client ID and Client Secret
5. Add to `.env`:
   ```
   SPOTIFY_CLIENT_ID="..."
   SPOTIFY_CLIENT_SECRET="..."
   ```

## 📊 Database Schema

The database uses PostgreSQL 16 with the pgvector extension for semantic search.

### Key Tables

- **venues**: Event locations with geocoding
- **events**: Core event data with vector embeddings (1536 dimensions)
- **event_sources**: Track all source URLs for deduplication
- **event_duplicates**: Merged duplicate events
- **users**: User accounts
- **user_event_interactions**: User actions (interested, going, etc.)
- **user_blocked_events**: Events blocked by users
- **user_spotify_artists**: Spotify listening data
- **scraper_runs**: Scraper execution metadata

### Vector Search

Events have 1536-dimensional embeddings generated by OpenAI's `text-embedding-3-large` model:

```sql
-- Find similar events using cosine similarity
SELECT id, title, 1 - (embedding <=> $1::vector) as similarity
FROM events
WHERE start_datetime >= NOW()
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### Indexes

- **pgvector IVFFlat** on `events.embedding` for fast approximate nearest neighbor search
- **GIN** indexes on array columns (categories, tags)
- **B-tree** indexes on frequently queried columns (dates, IDs)

## 🎨 Frontend Development

### Shadcn/ui Components

Install components as needed:

```bash
cd apps/frontend
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
# etc.
```

### API Client

The frontend uses tRPC for type-safe API calls:

```typescript
import { trpc } from '@/lib/trpc';

// Type-safe API call
const { data: events } = trpc.events.list.useQuery({
  startDate: new Date(),
  categories: ['MUSIC'],
});
```

## 🔧 Backend Development

### Adding a New API Route

1. Create route in `apps/backend/src/api/trpc/routes/`
2. Add to router in `apps/backend/src/api/trpc/router.ts`
3. Types are automatically inferred on frontend

### Database Queries

```typescript
import { prisma } from '@slo-events/database';

// Query events
const events = await prisma.event.findMany({
  where: {
    startDateTime: { gte: new Date() },
    status: 'ACTIVE',
  },
  include: {
    venue: true,
    sources: true,
  },
  orderBy: { startDateTime: 'asc' },
});
```

## 🤖 AI Agent Development

### Creating a New Scraper Agent

1. Create agent file in `apps/agents/src/scrapers/`
2. Implement `ScraperAgent` interface
3. Register in orchestrator
4. Add to schedule

Example structure:

```typescript
export class MyVenueAgent implements ScraperAgent {
  name = 'my-venue';
  sourceUrl = 'https://venue.com/events';
  schedule = '0 */6 * * *'; // Every 6 hours

  async scrape(): Promise<RawEvent[]> {
    // Fetch and parse events
  }

  async normalize(raw: RawEvent): Promise<Event> {
    // Use Claude to normalize data
    // Generate embedding with OpenAI
  }
}
```

## 📝 VS Code Setup

Recommended extensions:

- ESLint
- Prettier
- Prisma
- Tailwind CSS IntelliSense
- TypeScript Error Translator

`.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "[prisma]": {
    "editor.defaultFormatter": "Prisma.prisma"
  }
}
```

## 🚀 Performance Tips

### Development

- Use `pnpm dev` for all services - Turbo handles caching
- Run tests in watch mode during development
- Use Prisma Studio for quick database inspection
- Check Redis Commander for cache debugging

### Database

- Use indexes for frequently queried columns
- Use pagination for large result sets
- Use `select` to fetch only needed fields
- Use transactions for multi-step operations

### Frontend

- Code split by route
- Lazy load components
- Use TanStack Query caching
- Optimize images

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [Shadcn/ui Components](https://ui.shadcn.com/)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Turborepo Documentation](https://turbo.build/repo/docs)

---

**Happy coding! 🎉**

If you run into issues, check the [Troubleshooting](#-troubleshooting) section or ask for help.
