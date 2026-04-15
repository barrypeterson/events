# System Architecture: AI-First SLO Events Platform

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            USER LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   Web App    │  │  Mobile App  │  │   API Users  │                 │
│  │  (React)     │  │(React Native)│  │  (Partners)  │                 │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
└─────────┼──────────────────┼──────────────────┼──────────────────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
                    ┌────────▼────────┐
                    │   AWS CloudFront │
                    │   (CDN + WAF)    │
                    └────────┬────────┘
                             │
┌────────────────────────────┼──────────────────────────────────────────────┐
│                    APPLICATION LAYER                                      │
│            ┌────────────────┴────────────────┐                           │
│            │                                  │                           │
│   ┌────────▼────────┐              ┌─────────▼────────┐                 │
│   │  Static Assets  │              │   API Gateway    │                 │
│   │    (S3/CF)      │              │  (ALB + ECS)     │                 │
│   └─────────────────┘              └─────────┬────────┘                 │
│                                               │                           │
│                              ┌────────────────┼────────────────┐         │
│                              │                │                │         │
│                    ┌─────────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐ │
│                    │  Web API       │  │  tRPC API  │  │  Admin API │ │
│                    │  (Express)     │  │  (Express) │  │  (Express) │ │
│                    │  - Public REST │  │  - Type-   │  │  - Internal│ │
│                    │  - Webhooks    │  │    safe    │  │  - Mgmt    │ │
│                    └─────────┬──────┘  └─────┬──────┘  └─────┬──────┘ │
└──────────────────────────────┼─────────────────┼────────────────┼────────┘
                               │                 │                │
                               └─────────────────┴────────────────┘
                                                  │
┌─────────────────────────────────────────────────┼──────────────────────────┐
│                         SERVICE LAYER                                      │
│                                                  │                          │
│  ┌───────────────────┐  ┌──────────────────┐  ┌┴───────────────────┐     │
│  │ Authentication    │  │  Search Service  │  │ Recommendation     │     │
│  │   Service         │  │  - Semantic      │  │   Engine           │     │
│  │ - JWT            │  │  - Keyword       │  │ - Content-based    │     │
│  │ - Session        │  │  - Filters       │  │ - Collaborative    │     │
│  │ - OAuth          │  │  - pgvector      │  │ - Spotify-aware    │     │
│  └───────────────────┘  └──────────────────┘  └────────────────────┘     │
│                                                                            │
│  ┌───────────────────┐  ┌──────────────────┐  ┌────────────────────┐    │
│  │ Event Service     │  │  User Service    │  │ Notification       │    │
│  │ - CRUD           │  │  - Preferences   │  │   Service          │    │
│  │ - Deduplication  │  │  - Blocking      │  │ - Email            │    │
│  │ - Normalization  │  │  - Interactions  │  │ - Push             │    │
│  └───────────────────┘  └──────────────────┘  └────────────────────┘    │
│                                                                            │
│  ┌───────────────────┐  ┌──────────────────┐                             │
│  │ Spotify Service   │  │  Analytics       │                             │
│  │ - OAuth          │  │   Service        │                             │
│  │ - Artist Sync    │  │ - Tracking       │                             │
│  │ - Matching       │  │ - Reporting      │                             │
│  └───────────────────┘  └──────────────────┘                             │
└────────────────────────────────────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┼─────────────────────────────────────┐
│                          AI AGENT LAYER                                    │
│                                      │                                     │
│               ┌──────────────────────▼──────────────────────┐             │
│               │    Agent Orchestrator (BullMQ Queues)       │             │
│               │  - Job Scheduling                           │             │
│               │  - Rate Limiting                            │             │
│               │  - Error Handling & Retries                 │             │
│               │  - Monitoring & Alerts                      │             │
│               └──────────────────────┬──────────────────────┘             │
│                                      │                                     │
│        ┌─────────────────────────────┼─────────────────────────┐          │
│        │                             │                         │          │
│  ┌─────▼──────┐            ┌─────────▼────────┐    ┌─────────▼────────┐ │
│  │  Venue     │            │   Platform       │    │   Generic        │ │
│  │  Scrapers  │            │   Scrapers       │    │   Scrapers       │ │
│  │ (20+ agents)│            │ - Eventbrite    │    │ - LLM-powered    │ │
│  │            │            │ - Meetup         │    │ - Self-learning  │ │
│  │ - Fremont  │            │ - Bandsintown    │    │ - Adaptive       │ │
│  │ - PAC SLO  │            │ - Songkick       │    │                  │ │
│  │ - SLO Brew │            │ - Facebook       │    │                  │ │
│  │ - Cal Poly │            │ - Instagram      │    │                  │ │
│  │ - etc...   │            │                  │    │                  │ │
│  └─────┬──────┘            └─────────┬────────┘    └─────────┬────────┘ │
│        │                             │                        │          │
│        └─────────────────────────────┴────────────────────────┘          │
│                                      │                                     │
│               ┌──────────────────────▼──────────────────────┐             │
│               │   Normalization & Processing Pipeline       │             │
│               │  1. Content Extraction (Claude API)         │             │
│               │  2. Entity Recognition & Categorization     │             │
│               │  3. Embedding Generation (OpenAI)           │             │
│               │  4. Venue Geocoding                         │             │
│               │  5. Image Processing                        │             │
│               └──────────────────────┬──────────────────────┘             │
│                                      │                                     │
│               ┌──────────────────────▼──────────────────────┐             │
│               │   Deduplication Engine                      │             │
│               │  1. Vector Similarity Search (pgvector)     │             │
│               │  2. Fuzzy String Matching                   │             │
│               │  3. Temporal Proximity Check                │             │
│               │  4. Venue Matching                          │             │
│               │  5. Confidence Scoring                      │             │
│               └──────────────────────┬──────────────────────┘             │
└──────────────────────────────────────┼─────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┼─────────────────────────────────────┐
│                         DATA LAYER                                         │
│                                      │                                     │
│  ┌───────────────────────────────────▼──────────────────────────────┐    │
│  │              PostgreSQL 16 + pgvector (RDS)                       │    │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐    │    │
│  │  │   Events     │  │    Venues     │  │  Event Sources     │    │    │
│  │  │  - Metadata  │  │  - Locations  │  │  - Source URLs     │    │    │
│  │  │  - Vectors   │  │  - Embeddings │  │  - Raw Data        │    │    │
│  │  └──────────────┘  └───────────────┘  └────────────────────┘    │    │
│  │                                                                   │    │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐    │    │
│  │  │   Users      │  │ User Actions  │  │  Spotify Artists   │    │    │
│  │  │  - Auth      │  │  - Blocks     │  │  - Top Artists     │    │    │
│  │  │  - Prefs     │  │  - Likes      │  │  - Match Cache     │    │    │
│  │  └──────────────┘  └───────────────┘  └────────────────────┘    │    │
│  │                                                                   │    │
│  │  ┌──────────────────────────────────────────────────────┐        │    │
│  │  │        Indexes                                        │        │    │
│  │  │  - pgvector IVFFlat (events.embedding)              │        │    │
│  │  │  - GIN index (categories, tags)                     │        │    │
│  │  │  - B-tree (start_datetime, venue_id)                │        │    │
│  │  └──────────────────────────────────────────────────────┘        │    │
│  └───────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                   Redis (ElastiCache)                             │   │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐    │   │
│  │  │  API Cache   │  │  Rate Limit   │  │  Session Store     │    │   │
│  │  │  - Events    │  │  - Scraper    │  │  - User Sessions   │    │   │
│  │  │  - Search    │  │  - API        │  │  - OAuth State     │    │   │
│  │  └──────────────┘  └───────────────┘  └────────────────────┘    │   │
│  │                                                                   │   │
│  │  ┌──────────────┐  ┌───────────────┐                             │   │
│  │  │  Job Queues  │  │  Pub/Sub      │                             │   │
│  │  │  - BullMQ    │  │  - Real-time  │                             │   │
│  │  └──────────────┘  └───────────────┘                             │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                      S3 Buckets                                   │   │
│  │  - Event Images (CloudFront cached)                               │   │
│  │  - Scraper Logs & Artifacts                                       │   │
│  │  - User Uploads (future)                                          │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┼─────────────────────────────────────┐
│                    EXTERNAL SERVICES                                       │
│                                      │                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────┐  │
│  │  Claude API   │  │  OpenAI API   │  │  Spotify API  │  │  Mapbox  │  │
│  │  (Anthropic)  │  │  - Embeddings │  │  - OAuth      │  │  - Geo   │  │
│  │  - Scraping   │  │  - Vectors    │  │  - Artists    │  │           │  │
│  │  - Normalize  │  │               │  │  - Tracks     │  │           │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └──────────┘  │
│                                                                            │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────┐  │
│  │  Eventbrite   │  │    Meetup     │  │  Bandsintown  │  │ Songkick │  │
│  │     API       │  │     API       │  │     API       │  │   API    │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └──────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────┼─────────────────────────────────────┐
│                   OBSERVABILITY LAYER                                      │
│                                      │                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────┐  │
│  │   Datadog     │  │    Sentry     │  │   PostHog     │  │CloudWatch│  │
│  │  - APM        │  │  - Errors     │  │  - Analytics  │  │ - Logs   │  │
│  │  - Metrics    │  │  - Alerts     │  │  - Features   │  │ - Alarms │  │
│  │  - Logs       │  │               │  │  - A/B Tests  │  │           │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └──────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend Architecture

**Technology Stack**:
- React 18 with TypeScript
- Vite for build tooling
- TanStack Query for server state
- Zustand for client state
- React Router for routing
- Shadcn/ui components
- Tailwind CSS for styling
- React Hook Form + Zod for forms

**Key Features**:
- Server-side rendering for SEO (consider Next.js in future)
- Code splitting by route
- Progressive image loading
- Service Worker for offline support
- WebSocket for real-time updates

**Folder Structure**:
```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/           # Shadcn components
│   │   ├── events/       # Event-specific components
│   │   ├── search/       # Search components
│   │   └── layout/       # Layout components
│   ├── features/
│   │   ├── events/       # Event listing, detail, search
│   │   ├── auth/         # Authentication
│   │   ├── profile/      # User profile
│   │   └── spotify/      # Spotify integration
│   ├── lib/
│   │   ├── api/          # tRPC client
│   │   ├── utils/        # Utilities
│   │   └── hooks/        # Custom hooks
│   ├── stores/           # Zustand stores
│   ├── types/            # TypeScript types
│   └── App.tsx
├── public/
└── index.html
```

### 2. Backend Architecture

**Technology Stack**:
- Node.js 20 LTS
- Express.js
- TypeScript (strict mode)
- Prisma ORM
- tRPC for type-safe APIs
- Bull MQ for job queues
- JWT for authentication
- Zod for validation

**Service Architecture**:
```
backend/
├── src/
│   ├── api/
│   │   ├── rest/         # REST endpoints
│   │   ├── trpc/         # tRPC routers
│   │   └── webhooks/     # Webhook handlers
│   ├── services/
│   │   ├── events/       # Event service
│   │   ├── search/       # Search service
│   │   ├── recommendations/ # Recommendation engine
│   │   ├── spotify/      # Spotify integration
│   │   ├── auth/         # Authentication
│   │   └── notifications/ # Notifications
│   ├── agents/
│   │   ├── orchestrator/ # Agent coordinator
│   │   ├── scrapers/     # Scraper agents
│   │   ├── normalizer/   # Data normalization
│   │   └── deduplicator/ # Deduplication engine
│   ├── lib/
│   │   ├── prisma/       # Prisma client
│   │   ├── redis/        # Redis client
│   │   ├── ai/           # AI clients (Claude, OpenAI)
│   │   └── utils/        # Utilities
│   ├── middleware/       # Express middleware
│   ├── types/            # Shared types
│   └── server.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── package.json
```

### 3. AI Agent System

#### Orchestrator Agent

**Responsibilities**:
- Schedule scraping jobs (cron-based)
- Distribute work across agent pool
- Monitor agent health and performance
- Handle failures and retries
- Generate daily reports
- Adaptive scheduling (scrape more frequently if venue updates often)

**Implementation**:
```typescript
// Agent Orchestrator
class AgentOrchestrator {
  private queue: Queue;
  private agents: Map<string, ScraperAgent>;

  async initialize() {
    // Load all scraper agents
    this.agents = await this.loadAgents();

    // Create BullMQ queue
    this.queue = new Queue('event-scraping', {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      }
    });

    // Schedule jobs
    await this.scheduleAgents();
  }

  async scheduleAgents() {
    for (const [name, agent] of this.agents) {
      await this.queue.add(
        'scrape',
        { agentName: name },
        { repeat: { pattern: agent.schedule } }
      );
    }
  }

  async processJob(job: Job) {
    const { agentName } = job.data;
    const agent = this.agents.get(agentName);

    const run = await this.createRun(agentName);

    try {
      // Execute scraping
      const rawEvents = await agent.scrape();

      // Normalize events
      const events = await Promise.all(
        rawEvents.map(e => agent.normalize(e))
      );

      // Deduplicate
      for (const event of events) {
        await this.deduplicateAndStore(event);
      }

      await this.completeRun(run.id, { success: true, eventsFound: events.length });
    } catch (error) {
      await this.failRun(run.id, error);
      throw error;
    }
  }
}
```

#### Scraper Agent Interface

```typescript
interface ScraperAgent {
  name: string;
  sourceUrl: string;
  schedule: string; // cron expression

  // Main scraping logic
  scrape(): Promise<RawEvent[]>;

  // Normalize raw data to standard format
  normalize(raw: RawEvent): Promise<Event>;

  // Agent-specific configuration
  config: {
    rateLimit: number; // requests per minute
    timeout: number; // request timeout
    usePlaywright: boolean; // for JavaScript-heavy sites
    selectors?: Record<string, string>; // CSS selectors
  };
}
```

#### Example: Fremont Theater Scraper

```typescript
class FremontTheaterAgent implements ScraperAgent {
  name = 'fremont-theater';
  sourceUrl = 'https://www.fremontslo.com/shows';
  schedule = '0 */6 * * *'; // Every 6 hours

  config = {
    rateLimit: 10,
    timeout: 10000,
    usePlaywright: false,
  };

  async scrape(): Promise<RawEvent[]> {
    const html = await fetch(this.sourceUrl).then(r => r.text());
    const $ = cheerio.load(html);

    const events: RawEvent[] = [];

    $('.event-card').each((i, el) => {
      const title = $(el).find('.event-title').text().trim();
      const dateStr = $(el).find('.event-date').text().trim();
      const image = $(el).find('img').attr('src');
      const ticketUrl = $(el).find('a.ticket-link').attr('href');

      events.push({
        title,
        dateStr,
        image,
        ticketUrl,
        source: this.sourceUrl,
      });
    });

    return events;
  }

  async normalize(raw: RawEvent): Promise<Event> {
    // Use Claude to normalize and extract details
    const prompt = `
      Extract structured event data from this raw event:
      Title: ${raw.title}
      Date: ${raw.dateStr}
      Source: Fremont Theater

      Return JSON with:
      - normalizedTitle (clean, proper case)
      - startDateTime (ISO 8601)
      - description (if you can infer genre/type)
      - category (from: Music, Comedy, Theater, etc.)
      - tags (array of relevant tags)
    `;

    const response = await claude.complete(prompt);
    const parsed = JSON.parse(response);

    // Generate embedding
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: `${parsed.normalizedTitle} ${parsed.description} Fremont Theater SLO`,
    });

    return {
      ...parsed,
      venue: await this.getVenue('Fremont Theater'),
      images: [raw.image],
      ticketUrl: raw.ticketUrl,
      embedding: embedding.data[0].embedding,
      sources: [{ url: raw.source, scrapedAt: new Date() }],
    };
  }

  private async getVenue(name: string): Promise<Venue> {
    // Find or create venue
    return prisma.venue.upsert({
      where: { normalizedName: normalizeVenueName(name) },
      create: { name, normalizedName: normalizeVenueName(name) },
      update: {},
    });
  }
}
```

#### Generic LLM-Powered Scraper

```typescript
class GenericLLMAgent implements ScraperAgent {
  name: string;
  sourceUrl: string;
  schedule = '0 */12 * * *'; // Every 12 hours

  config = {
    rateLimit: 5,
    timeout: 15000,
    usePlaywright: true, // Render JavaScript
  };

  async scrape(): Promise<RawEvent[]> {
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();
    await page.goto(this.sourceUrl, { waitUntil: 'networkidle' });

    const html = await page.content();
    await browser.close();

    // Use Claude to understand the page
    const prompt = `
      You are an expert web scraper. Extract all events from this HTML.

      HTML:
      ${html.slice(0, 50000)} // Truncate if needed

      Extract all events you can find. For each event, return:
      - title
      - date and time (if available)
      - description
      - ticket link
      - image URL
      - any other relevant details

      Return as JSON array.
    `;

    const response = await claude.complete(prompt, {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
    });

    const events = JSON.parse(response);
    return events.map(e => ({ ...e, source: this.sourceUrl }));
  }

  async normalize(raw: RawEvent): Promise<Event> {
    // Similar to venue-specific agents
    // ...
  }
}
```

### 4. Deduplication Engine

**Strategy**: Multi-stage similarity detection

```typescript
class DeduplicationEngine {
  async findDuplicates(event: Event): Promise<{ id: string; similarity: number }[]> {
    // Stage 1: Vector similarity search
    const vectorMatches = await this.vectorSearch(event);

    // Stage 2: Temporal proximity filter (±3 hours)
    const temporalMatches = vectorMatches.filter(m =>
      Math.abs(m.startDateTime - event.startDateTime) < 3 * 60 * 60 * 1000
    );

    // Stage 3: Venue matching
    const venueMatches = temporalMatches.filter(m =>
      m.venue.id === event.venue.id || this.fuzzyVenueMatch(m.venue, event.venue)
    );

    // Stage 4: Title similarity
    const titleMatches = venueMatches.map(m => ({
      ...m,
      titleSimilarity: this.stringSimilarity(m.normalizedTitle, event.normalizedTitle),
    }));

    // Combine scores
    return titleMatches.map(m => ({
      id: m.id,
      similarity: m.vectorSimilarity * 0.5 + m.titleSimilarity * 0.5,
    }));
  }

  private async vectorSearch(event: Event): Promise<Event[]> {
    const results = await prisma.$queryRaw`
      SELECT id, title, start_datetime, venue_id,
             1 - (embedding <=> ${event.embedding}::vector) as similarity
      FROM events
      WHERE start_datetime >= ${event.startDateTime} - INTERVAL '7 days'
        AND start_datetime <= ${event.startDateTime} + INTERVAL '7 days'
        AND id != ${event.id}
      ORDER BY embedding <=> ${event.embedding}::vector
      LIMIT 10
    `;

    return results.filter(r => r.similarity > 0.7);
  }

  private stringSimilarity(a: string, b: string): number {
    // Levenshtein distance normalized
    return leven(a.toLowerCase(), b.toLowerCase()) / Math.max(a.length, b.length);
  }

  private fuzzyVenueMatch(v1: Venue, v2: Venue): boolean {
    if (!v1.latitude || !v2.latitude) return false;

    // Same location within 100m
    const distance = this.haversineDistance(
      v1.latitude, v1.longitude,
      v2.latitude, v2.longitude
    );

    return distance < 0.1; // 100 meters
  }

  async mergeDuplicates(canonicalId: string, duplicateId: string) {
    await prisma.$transaction(async tx => {
      // Merge sources
      await tx.eventSource.updateMany({
        where: { eventId: duplicateId },
        data: { eventId: canonicalId },
      });

      // Record duplicate
      await tx.eventDuplicate.create({
        data: {
          canonicalEventId: canonicalId,
          duplicateEventId: duplicateId,
          similarityScore: 0.95, // Store actual score
        },
      });

      // Soft delete duplicate
      await tx.event.update({
        where: { id: duplicateId },
        data: { status: 'merged' },
      });
    });
  }
}
```

### 5. Recommendation Engine

**Hybrid Recommendation System**:

```typescript
class RecommendationEngine {
  async getRecommendations(userId: string, limit = 20): Promise<Event[]> {
    const user = await this.getUserProfile(userId);

    // Get candidate events (upcoming, not blocked)
    const candidates = await this.getCandidateEvents(user);

    // Score each event
    const scored = await Promise.all(
      candidates.map(async event => ({
        event,
        score: await this.scoreEvent(event, user),
      }))
    );

    // Sort by score and return top N
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.event);
  }

  private async scoreEvent(event: Event, user: UserProfile): Promise<number> {
    let score = 0;

    // 1. Content-based similarity (0-40 points)
    if (user.likedEventsEmbedding) {
      const similarity = cosineSimilarity(
        event.embedding,
        user.likedEventsEmbedding
      );
      score += similarity * 40;
    }

    // 2. Spotify artist match (0-30 points)
    if (await this.matchesSpotifyArtist(event, user.spotifyArtists)) {
      score += 30;
    }

    // 3. Category preference (0-15 points)
    const categoryMatches = user.preferredCategories.filter(c =>
      event.category.includes(c)
    );
    score += categoryMatches.length * 5;

    // 4. Venue preference (0-10 points)
    if (user.favoriteVenues.includes(event.venue.id)) {
      score += 10;
    }

    // 5. Temporal preference (0-10 points)
    const dayOfWeek = event.startDateTime.getDay();
    const hour = event.startDateTime.getHours();

    if (user.preferredDays.includes(dayOfWeek)) {
      score += 5;
    }

    if (hour >= user.preferredTimeStart && hour <= user.preferredTimeEnd) {
      score += 5;
    }

    // 6. Social proof (0-10 points)
    const friendsGoing = await this.getFriendsGoing(event.id, user.friends);
    score += Math.min(friendsGoing.length * 2, 10);

    // 7. Recency boost (0-5 points)
    const daysUntil = daysBetween(new Date(), event.startDateTime);
    if (daysUntil <= 7) score += 5;
    else if (daysUntil <= 14) score += 2;

    return score;
  }

  private async matchesSpotifyArtist(
    event: Event,
    artists: SpotifyArtist[]
  ): Promise<boolean> {
    // Extract potential artist names from event title/description
    const eventArtists = this.extractArtistNames(event);

    for (const spotifyArtist of artists) {
      for (const eventArtist of eventArtists) {
        if (this.fuzzyMatch(spotifyArtist.name, eventArtist)) {
          return true;
        }
      }
    }

    return false;
  }

  private fuzzyMatch(a: string, b: string): boolean {
    // Normalize and compare
    const normalize = (s: string) =>
      s.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim();

    const aNorm = normalize(a);
    const bNorm = normalize(b);

    // Exact match
    if (aNorm === bNorm) return true;

    // One contains the other
    if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return true;

    // Levenshtein distance
    const distance = leven(aNorm, bNorm);
    const maxLen = Math.max(aNorm.length, bNorm.length);

    return distance / maxLen < 0.2; // 80% similar
  }
}
```

### 6. Infrastructure

**Terraform Modules**:

```hcl
# Main infrastructure
module "vpc" {
  source = "./modules/vpc"
  # Multi-AZ VPC with public/private subnets
}

module "rds_postgres" {
  source = "./modules/rds"

  instance_class = "db.t4g.large"
  engine_version = "16.1"
  allocated_storage = 100

  # Enable pgvector extension
  parameter_group_name = aws_db_parameter_group.postgres16_pgvector.name
}

module "elasticache_redis" {
  source = "./modules/elasticache"

  node_type = "cache.t4g.medium"
  num_cache_nodes = 2
}

module "ecs_cluster" {
  source = "./modules/ecs"

  services = {
    web_api = {
      cpu = 512
      memory = 1024
      desired_count = 2
      autoscaling = true
    }

    agent_orchestrator = {
      cpu = 1024
      memory = 2048
      desired_count = 1
    }
  }
}

module "lambda_scrapers" {
  source = "./modules/lambda"

  # Deploy each scraper agent as separate Lambda
  # Triggered by EventBridge cron rules
}

module "cloudfront" {
  source = "./modules/cloudfront"

  origins = {
    s3_static = module.s3_static.bucket_regional_domain_name
    alb_api = module.alb.dns_name
  }
}
```

**Deployment Pipeline**:
```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
      - run: npm run lint

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: |
          docker build -t events-api:${{ github.sha }} ./backend
      - name: Push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker push $ECR_REGISTRY/events-api:${{ github.sha }}
      - name: Deploy to ECS
        run: |
          aws ecs update-service --cluster events-prod --service web-api --force-new-deployment

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - name: Deploy to S3
        run: aws s3 sync ./dist s3://events-frontend-prod
      - name: Invalidate CloudFront
        run: aws cloudfront create-invalidation --distribution-id $CF_DIST_ID --paths "/*"
```

## Data Flow Diagrams

### Event Scraping Flow

```
┌─────────────┐
│  Scheduler  │ (BullMQ + Cron)
└──────┬──────┘
       │
       │ Trigger scrape job
       ▼
┌─────────────────┐
│ Scraper Agent   │
│ - Fetch page    │
│ - Parse HTML    │
│ - Extract data  │
└────────┬────────┘
         │
         │ Raw events
         ▼
┌─────────────────┐
│  Claude API     │
│ - Normalize     │
│ - Categorize    │
│ - Extract       │
└────────┬────────┘
         │
         │ Structured event
         ▼
┌─────────────────┐
│  OpenAI API     │
│ - Generate      │
│   embedding     │
└────────┬────────┘
         │
         │ Event + embedding
         ▼
┌──────────────────┐
│ Deduplication    │
│ - Vector search  │
│ - Similarity     │
│ - Merge/Create   │
└────────┬─────────┘
         │
         │ Final event
         ▼
┌──────────────────┐
│  PostgreSQL      │
│  - Store event   │
│  - Update index  │
└──────────────────┘
```

### User Search Flow

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │
       │ Search query: "jazz this weekend"
       ▼
┌─────────────────┐
│  API Gateway    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Redis Cache    │
│  Check cache    │
└────────┬────────┘
         │
         │ Cache miss
         ▼
┌─────────────────┐
│  OpenAI API     │
│ - Embed query   │
└────────┬────────┘
         │
         │ Query embedding
         ▼
┌─────────────────┐
│  PostgreSQL     │
│ - Vector search │
│ - Apply filters │
└────────┬────────┘
         │
         │ Results
         ▼
┌─────────────────┐
│  API Gateway    │
│ - Format        │
│ - Cache result  │
└────────┬────────┘
         │
         │ JSON response
         ▼
┌─────────────┐
│    User     │
└─────────────┘
```

## Security Architecture

### Authentication Flow

```
User → Frontend → API Gateway → Auth Service → PostgreSQL
                        │
                        └──→ JWT validation → Redis (session)
```

### Spotify OAuth Flow

```
User → Frontend → API → Spotify OAuth
                    │
                    └──→ Callback → Exchange token
                                 │
                                 └──→ Store in PostgreSQL (encrypted)
```

### API Security

- Rate limiting: Redis-based sliding window
- API keys for partners
- CORS configuration
- Input validation with Zod
- SQL injection prevention (Prisma)
- XSS prevention (sanitization)
- CSRF tokens for state-changing operations

## Performance Optimizations

### Database

- **pgvector indexes**: IVFFlat for approximate nearest neighbor
- **Partial indexes**: On frequently queried columns
- **Connection pooling**: PgBouncer for connection reuse
- **Read replicas**: For heavy read operations
- **Query optimization**: EXPLAIN ANALYZE all slow queries

### Caching Strategy

**L1 - Browser Cache**:
- Static assets: 1 year
- API responses: 5 minutes

**L2 - CloudFront Cache**:
- Static assets: 1 year
- API responses: 1 minute
- Vary by query parameters

**L3 - Application Cache (Redis)**:
- Event listings: 5 minutes
- Search results: 10 minutes
- User preferences: 1 hour
- Spotify data: 24 hours

**L4 - Database Query Cache**:
- PostgreSQL shared buffers
- OS page cache

### API Performance

- Response compression (gzip/brotli)
- Pagination with cursor-based paging
- Field selection (GraphQL-style)
- Batch API requests
- WebSocket for real-time updates

## Monitoring & Alerting

### Key Metrics

**Application**:
- API response time (p50, p95, p99)
- Error rate
- Request throughput
- Active users
- Database query time

**Scrapers**:
- Success rate per agent
- Events discovered per run
- Duplicate rate
- Failed scrapes

**Business**:
- New events per day
- Search queries
- Recommendation CTR
- Spotify connections

### Alerts

- API error rate >1%
- Scraper failures >3 consecutive runs
- Database CPU >80%
- Disk space <20%
- Duplicate rate >5%

---

This architecture provides a scalable, maintainable foundation for the AI-first SLO Events platform with room for growth and future enhancements.
