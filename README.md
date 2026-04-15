# SLO Events - AI-First Events Discovery Platform

> Discover all events and activities happening in San Luis Obispo, powered by AI.

## 🎯 Features

- **AI-Powered Scraping**: 23+ intelligent agents automatically discover events from venues across SLO
  - Claude Vision API for Instagram event posters
  - Chunked HTML processing for large event calendars
  - Custom scrapers for complex sites (Siren, Libertine)
- **Zero Duplicates**: Advanced deduplication using pgvector semantic similarity
- **Smart Search & Filters**: Text search + category filtering with real-time results
- **Time Range Support**: Events display start and end times (e.g., "8:00 PM - 10:30 PM")
- **Spotify Integration**: Get notified when your favorite artists perform nearby (coming soon)
- **Personalized Recommendations**: ML-powered suggestions based on your preferences (coming soon)
- **Modern Stack**: TypeScript, React, Express, tRPC, Prisma, PostgreSQL with pgvector

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Setup (Automated)

Use the convenient startup script that handles everything:

```bash
./start.sh
# Or use the npm script:
pnpm start
```

This script will:
- Check prerequisites
- Install dependencies
- Start Docker services (PostgreSQL + Redis)
- Wait for services to be ready
- Initialize the database
- Start all development servers

### Setup (Manual)

1. **Clone and install dependencies**:
   ```bash
   pnpm install
   ```

2. **Start local services** (PostgreSQL + Redis):
   ```bash
   pnpm docker:up
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Initialize database**:
   ```bash
   pnpm db:push
   ```

5. **Start development servers**:
   ```bash
   pnpm dev
   ```

### Available URLs

- **Frontend**: http://localhost:6100
- **Backend API**: http://localhost:6001
- **Prisma Studio**: http://localhost:6555 (run `pnpm db:studio`)
- **Redis Commander**: http://localhost:6081
- **Mailhog**: http://localhost:6026

**Note**: Redis runs on port 6381 (connection string: `redis://localhost:6381`)

## 📁 Project Structure

```
slo-events/
├── apps/
│   ├── frontend/         # React + TypeScript + Vite
│   ├── backend/          # Express + tRPC + Prisma
│   └── agents/           # AI scraper agents
├── packages/
│   ├── database/         # Prisma schema & migrations
│   ├── types/            # Shared TypeScript types
│   ├── ui/               # Shadcn/ui components
│   └── config/           # Shared configurations
├── infrastructure/       # Terraform for AWS
├── docs/                 # Documentation
├── scripts/              # Utility scripts
└── docker-compose.yml    # Local development services
```

## 🛠️ Development

### Available Commands

```bash
# Development
pnpm dev                  # Start all services in watch mode
pnpm build                # Build all packages
pnpm test                 # Run tests
pnpm lint                 # Lint all packages
pnpm type-check           # TypeScript type checking

# Database
pnpm db:push              # Push schema changes to database
pnpm db:studio            # Open Prisma Studio
pnpm db:migrate           # Create a migration
pnpm db:seed              # Seed database with sample data

# Docker
pnpm docker:up            # Start local services
pnpm docker:down          # Stop local services
pnpm docker:logs          # View service logs
```

### Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed system architecture.

### Product Requirements

See [docs/PRD.md](./docs/PRD.md) for complete product specifications.

## 🤖 AI Agents

The platform uses 23+ specialized AI agents for event discovery:

### Scraper Types:
- **ClaudeUniversalScraper**: Uses Claude AI to extract events from any webpage
  - Automatically chunks large pages (handles 30+ events)
  - Works with any venue website format
- **SirenCustomScraper**: Custom scraper with specific selectors for The Siren
  - Multi-page pagination support
  - Time range extraction (start + end times)
- **InstagramVisionScraper**: Uses Claude Vision API to read event posters (ready for use)
  - Extracts details from images
  - Perfect for Instagram-only venues

### Current Venues (23 scrapers):
- **Theaters**: Fremont Theater, PAC SLO, Cal Poly Arts
- **Large Venues**: Vina Robles, Santa Barbara Bowl, Madonna Inn
- **Bars & Pubs**: The Siren, The Mark, Black Sheep, Club Car Bar
- **Breweries**: Libertine, Bang the Drum, Humdinger, Shindig Cider, Central Coast, Tap It, 7 Sisters, BarrelHouse Paso
- **Aggregators**: Downtown SLO, Big Big SLO, Visit SLO, Highway 1 Roadtrip
- **Concerts**: SLO Brew Rock

### Agent CLI Commands:
```bash
pnpm cli list                      # List all scrapers
pnpm cli run <scraper-name>        # Run specific scraper
pnpm cli run-all                   # Run all scrapers
pnpm cli test <scraper-name>       # Test without saving to DB
pnpm cli health                    # Check scraper health
pnpm cli report <scraper> [days]   # Detailed scraper report
pnpm cli status                    # Show system status
pnpm cli queue                     # Show queue statistics
```

### Recent Agent Improvements:
- ✅ **Chunked HTML Processing**: Large pages split into chunks for complete event extraction
- ✅ **Time Range Extraction**: Events now capture both start and end times
- ✅ **Pagination Support**: Multi-page venue calendars fully scraped
- ✅ **Smart Year Detection**: Correctly handles events spanning year boundaries
- ✅ **Duplicate Detection**: Fuzzy matching prevents duplicate events across sources

## 🗄️ Database

PostgreSQL 16 with pgvector extension for semantic search:

- **Events**: Core event data with 1536-dim embeddings
  - Currently: **87 active events** across **8 venues**
  - **43 events** have time ranges (start + end times)
- **Venues**: Venue information and geocoding
- **Users**: User accounts and preferences
- **Event Sources**: Track all source URLs for deduplication
- **Event Duplicates**: Similarity scores and merge relationships

## 🎨 Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for blazing-fast builds
- TanStack Query for data fetching
- Zustand for state management
- Shadcn/ui component library
- Tailwind CSS for styling

### Backend
- Node.js 20 with Express
- tRPC for type-safe APIs
- Prisma ORM with PostgreSQL
- BullMQ for job queues
- Redis for caching
- JWT authentication

### AI & ML
- Anthropic Claude for content understanding
- OpenAI for embeddings (text-embedding-3-large)
- LangChain for agent orchestration
- Playwright for web scraping

### Infrastructure
- Docker Compose for local development
- Terraform for AWS production infrastructure
- GitHub Actions for CI/CD

## 📊 Development Tools

- **Prisma Studio**: Database GUI at http://localhost:6555
- **Redis Commander**: Redis GUI at http://localhost:6081
- **Mailhog**: Email testing at http://localhost:6026
- **tRPC Panel**: API explorer (coming soon)

**Note**: Port 6000 is blocked by browsers as unsafe (reserved for X11), so we use port 6100 for the frontend.

## 🚢 Deployment

Production infrastructure is managed with Terraform:

```bash
cd infrastructure/
terraform init
terraform plan
terraform apply
```

See [infrastructure/README.md](./infrastructure/README.md) for deployment guide.

## 🤝 Contributing

This is currently a private project. For questions or issues, contact the team.

## 📝 License

Proprietary - All rights reserved

## 🎯 Roadmap

### Phase 1: MVP (Current)
- [x] Project setup
- [x] Database schema with pgvector
- [x] 23 scraper agents covering major SLO venues
- [x] Event deduplication engine with fuzzy matching
- [x] Text search and category filtering
- [x] Basic UI with event cards and detail pages
- [x] Time range support for events
- [x] Chunked scraping for large event calendars

### Phase 2: Personalization
- [ ] User authentication
- [ ] Spotify integration
- [ ] Event blocking
- [ ] Recommendations
- [ ] Email notifications

### Phase 3: Coverage Expansion
- [ ] 80+ scraper agents
- [ ] Social media scrapers
- [ ] API integrations
- [ ] Admin dashboard

### Phase 4: Advanced Features
- [ ] Social features
- [ ] Mobile app
- [ ] Advanced analytics
- [ ] Event reviews

---

Built with ❤️ for the SLO community
