# Product Requirements Document: AI-First SLO Events Platform

## 1. Executive Summary

### Vision
Create an intelligent, AI-powered events discovery platform for San Luis Obispo that automatically aggregates, normalizes, and curates local events from 100+ sources, providing personalized recommendations and eliminating duplicate entries.

### Problem Statement
- **Information Fragmentation**: Events are scattered across 100+ websites, social media, and venues
- **Manual Discovery**: Users must check multiple sources to find events
- **Duplicate Content**: Same events listed multiple times across platforms
- **No Personalization**: Generic event listings without user preferences
- **Missing Context**: No connection to user interests (music taste, past behavior)

### Success Metrics
- **Coverage**: 95%+ of SLO area events captured within 24 hours
- **Accuracy**: <2% duplicate event rate
- **Engagement**: 70%+ weekly active user retention
- **Personalization**: 80%+ user satisfaction with recommendations
- **Performance**: <500ms page load, <100ms search response

## 2. User Personas

### Primary: Event Enthusiast (Sarah, 28)
- Cal Poly graduate who stayed in SLO
- Loves live music, wine tastings, outdoor activities
- Spotify premium user with eclectic taste
- Checks events 2-3x/week
- Frustrated by scattered information

### Secondary: Tourist/Visitor (Mike, 45)
- Weekend visitor to wine country
- Wants to discover local events
- Limited local knowledge
- Needs curated recommendations

### Tertiary: Local Business Owner (Maria, 35)
- Promotes her venue's events
- Needs analytics on event reach
- Wants to understand competition

## 3. Core Features

### 3.1 AI-Powered Event Aggregation

#### Multi-Agent Scraping System
**User Story**: As the system, I want to automatically discover and collect events from all sources so that users have comprehensive coverage.

**Acceptance Criteria**:
- [ ] 20+ dedicated AI scraper agents for major venues
- [ ] Generic scraper agents for WordPress/common platforms
- [ ] Social media scrapers for Facebook Events, Instagram
- [ ] API integrations (Eventbrite, Meetup, Bandsintown, Songkick)
- [ ] RSS/iCal feed parsers
- [ ] Runs every 4-6 hours
- [ ] Automatic retry and error handling
- [ ] Change detection to avoid duplicate processing

**Technical Requirements**:
- LangChain/LlamaIndex for agent orchestration
- Playwright/Puppeteer for dynamic content
- Claude API for content understanding and normalization
- Rate limiting and respectful scraping (robots.txt compliance)

#### Event Normalization & Deduplication
**User Story**: As a user, I want to see each event only once even if it's listed on 5 different websites.

**Acceptance Criteria**:
- [ ] AI-powered semantic similarity detection using pgvector
- [ ] Combine multiple listings into single canonical event
- [ ] Preserve all source URLs for verification
- [ ] Confidence score for duplicate detection (>0.9 = merge)
- [ ] Manual review queue for uncertain matches (0.7-0.9)

**Data Model**:
```typescript
interface Event {
  id: string;
  title: string;
  normalizedTitle: string; // AI-cleaned
  description: string;
  startDateTime: Date;
  endDateTime?: Date;
  venue: Venue;
  category: EventCategory[];
  tags: string[];
  images: string[];
  ticketUrl?: string;
  price?: PriceRange;
  ageRestriction?: string;
  embedding: number[]; // pgvector for similarity
  sources: EventSource[]; // All URLs where found
  confidence: number; // Data quality score
  recurring?: RecurringPattern;
}
```

### 3.2 Intelligent Discovery & Search

#### Semantic Search
**User Story**: As a user, I want to search "live jazz this weekend" and find relevant events even if they don't contain the exact words.

**Acceptance Criteria**:
- [ ] Natural language search processing
- [ ] Vector similarity search with pgvector
- [ ] Hybrid search (keyword + semantic)
- [ ] Filters: date range, category, venue, price, distance
- [ ] Fuzzy matching for typos
- [ ] Search suggestions and autocomplete

#### AI-Powered Recommendations
**User Story**: As a user, I want personalized event recommendations based on my interests and listening habits.

**Acceptance Criteria**:
- [ ] Spotify integration to analyze music taste
- [ ] Artist proximity alerts ("Tame Impala nearby!")
- [ ] Similar event recommendations ("More like this")
- [ ] Collaborative filtering (users like you also attended...)
- [ ] Time-based recommendations (weekend plans, tonight)
- [ ] Explanation for recommendations ("Because you listen to...")

**Recommendation Engine**:
- Content-based: Event embeddings similarity
- Collaborative: User behavior patterns
- Hybrid: Combine both approaches
- Cold start: Use Spotify data for new users

### 3.3 User Preferences & Blocking

#### Event Blocking
**User Story**: As a user, I don't want to see "Farmers Market" every week after I've decided it's not for me.

**Acceptance Criteria**:
- [ ] Block individual events
- [ ] Block recurring event series
- [ ] Block entire categories
- [ ] Block specific venues
- [ ] Temporary "snooze" option (hide for 30 days)
- [ ] Undo blocking from profile

#### "More Like This" Feature
**User Story**: As a user, when I mark an event as interesting, I want to see similar events.

**Acceptance Criteria**:
- [ ] "Interested" / "Going" / "Not Interested" buttons
- [ ] Save events to personal calendar
- [ ] Generate embeddings from liked events
- [ ] Surface similar events in feed
- [ ] Email notifications for similar events (opt-in)

### 3.4 Spotify Integration

**User Story**: As a user, I want to connect my Spotify account and get notified when my favorite artists perform nearby.

**Acceptance Criteria**:
- [ ] OAuth integration with Spotify
- [ ] Fetch user's top artists (short/medium/long term)
- [ ] Fetch recently played tracks
- [ ] Match artist names to event performers (fuzzy matching)
- [ ] Real-time alerts for artist matches
- [ ] "Your Artists Playing" section on homepage
- [ ] Configurable notification preferences

**Technical Stack**:
- Spotify Web API
- Artist name normalization (handle variations)
- Bandsintown/Songkick cross-reference for accuracy

### 3.5 Social Features (Future Phase)

- Share events with friends
- See what friends are attending
- Group calendar planning
- Event reviews and ratings
- Photo uploads from events

## 4. Technical Architecture

### 4.1 Tech Stack

**Frontend**:
- React 18 with TypeScript
- Shadcn/ui component library
- TanStack Query for data fetching
- Zustand for state management
- React Hook Form + Zod for forms
- AWS CloudFront distribution

**Backend**:
- Node.js 20+ with Express
- TypeScript strict mode
- PostgreSQL 16 with pgvector extension
- Prisma ORM
- Redis for caching and rate limiting
- tRPC for type-safe APIs

**AI Infrastructure**:
- Claude API (Anthropic) for content understanding
- OpenAI Embeddings (text-embedding-3-large) for vectors
- LangChain for agent orchestration
- Playwright for web scraping
- BullMQ for job queuing

**Infrastructure**:
- AWS ECS Fargate for backend services
- AWS RDS PostgreSQL with pgvector
- AWS ElastiCache (Redis)
- AWS S3 for images
- AWS Lambda for scraper agents
- Terraform for IaC

**Monitoring**:
- Datadog for APM and logs
- Sentry for error tracking
- PostHog for product analytics

### 4.2 Database Schema

```sql
-- Core tables
CREATE TABLE venues (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  website VARCHAR(500),
  phone VARCHAR(20),
  venue_type VARCHAR(50),
  embedding vector(1536), -- pgvector
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  normalized_title VARCHAR(500),
  description TEXT,
  start_datetime TIMESTAMP NOT NULL,
  end_datetime TIMESTAMP,
  venue_id UUID REFERENCES venues(id),
  category VARCHAR(100)[],
  tags VARCHAR(100)[],
  images TEXT[],
  ticket_url VARCHAR(500),
  price_min DECIMAL(10, 2),
  price_max DECIMAL(10, 2),
  age_restriction VARCHAR(50),
  embedding vector(1536), -- pgvector for similarity
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_pattern JSONB,
  confidence_score DECIMAL(3, 2),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_embedding ON events
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_events_start_datetime ON events(start_datetime);
CREATE INDEX idx_events_category ON events USING GIN(category);

-- Event sources (for deduplication)
CREATE TABLE event_sources (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  source_url VARCHAR(500) NOT NULL,
  source_name VARCHAR(100),
  scraped_at TIMESTAMP DEFAULT NOW(),
  raw_data JSONB,
  UNIQUE(event_id, source_url)
);

-- Duplicate event clusters
CREATE TABLE event_duplicates (
  id UUID PRIMARY KEY,
  canonical_event_id UUID REFERENCES events(id),
  duplicate_event_id UUID REFERENCES events(id),
  similarity_score DECIMAL(3, 2),
  merged_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(canonical_event_id, duplicate_event_id)
);

-- User preferences
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  spotify_user_id VARCHAR(255),
  spotify_access_token TEXT,
  spotify_refresh_token TEXT,
  preferences JSONB, -- notification settings, etc.
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_blocked_events (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  blocked_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE user_blocked_recurring (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recurring_pattern_id VARCHAR(255), -- e.g., "farmers-market-thursday"
  blocked_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, recurring_pattern_id)
);

CREATE TABLE user_event_interactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  interaction_type VARCHAR(20), -- 'interested', 'going', 'not_interested'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Spotify artist tracking
CREATE TABLE user_spotify_artists (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  artist_name VARCHAR(255) NOT NULL,
  spotify_artist_id VARCHAR(255),
  play_count INT DEFAULT 0,
  term VARCHAR(20), -- 'short', 'medium', 'long'
  last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_spotify_artists_user ON user_spotify_artists(user_id);

-- Scraping metadata
CREATE TABLE scraper_runs (
  id UUID PRIMARY KEY,
  source_name VARCHAR(100) NOT NULL,
  source_url VARCHAR(500),
  status VARCHAR(20), -- 'running', 'success', 'failed'
  events_found INT DEFAULT 0,
  events_new INT DEFAULT 0,
  events_updated INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

### 4.3 AI Agent Architecture

#### Scraper Agent Types

**1. Venue-Specific Agents** (20+ agents)
- Each major venue gets dedicated agent
- Learns venue-specific patterns
- Maintains scraping strategy in memory
- Examples: `FremonttTheaterAgent`, `PacSLOAgent`, `SLOBrewAgent`

**2. Platform-Specific Agents** (5-10 agents)
- WordPress Events Calendar agent
- Eventbrite API agent
- Meetup API agent
- Facebook Events agent (via unofficial APIs)
- Ticketing platform agents (eVenue, Ticketware, Prekindle)

**3. Generic Web Scraper Agent**
- Handles unknown venues
- Uses Claude to understand page structure
- Learns patterns and adapts

**Agent Workflow**:
```typescript
interface ScraperAgent {
  name: string;
  sourceUrl: string;
  schedule: string; // cron expression

  async scrape(): Promise<RawEvent[]> {
    // 1. Fetch page content
    // 2. Use Claude to extract event data
    // 3. Return structured events
  }

  async normalize(raw: RawEvent): Promise<Event> {
    // 1. Clean and standardize data
    // 2. Generate embedding with OpenAI
    // 3. Geocode venue if needed
    // 4. Categorize and tag
  }

  async deduplicate(event: Event): Promise<UUID> {
    // 1. Vector similarity search in pgvector
    // 2. If match found (>0.9 similarity), merge
    // 3. If uncertain (0.7-0.9), flag for review
    // 4. If unique, create new event
  }
}
```

#### Orchestration Agent
- Coordinates all scraper agents
- Manages scheduling and rate limiting
- Handles errors and retries
- Monitors coverage and data quality
- Generates daily reports

### 4.4 API Design

**REST + tRPC Hybrid**:
- Public REST API for webhooks, integrations
- tRPC for type-safe frontend-backend communication

**Key Endpoints**:
```typescript
// tRPC routes
const appRouter = router({
  events: {
    list: procedure
      .input(z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        categories: z.array(z.string()).optional(),
        search: z.string().optional(),
        limit: z.number().default(20),
        cursor: z.string().optional(),
      }))
      .query(async ({ input }) => {
        // Return paginated events
      }),

    similarEvents: procedure
      .input(z.object({ eventId: z.string().uuid() }))
      .query(async ({ input }) => {
        // Vector similarity search
      }),

    searchSemantic: procedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        // Embed query, search vectors
      }),
  },

  user: {
    blockEvent: procedure
      .input(z.object({ eventId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        // Add to blocked events
      }),

    connectSpotify: procedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // OAuth token exchange
      }),

    recommendations: procedure
      .query(async ({ ctx }) => {
        // Personalized recommendations
      }),
  },
});
```

## 5. AI Features Deep Dive

### 5.1 Event Understanding with LLMs

**Claude Agent Responsibilities**:
1. **Content Extraction**: Parse unstructured HTML/text
2. **Entity Recognition**: Identify venue, date, time, price
3. **Categorization**: Assign categories and tags
4. **Description Enhancement**: Rewrite poorly formatted descriptions
5. **Image Validation**: Verify images are relevant

**Prompt Example**:
```
You are an event extraction specialist. Analyze this webpage and extract event details.

HTML Content: [...]

Extract:
- Event title
- Date and time (convert to ISO 8601)
- Venue name and address
- Description (clean and concise)
- Ticket URL
- Price range
- Age restrictions
- Categories (choose from: Music, Comedy, Theater, Sports, Food & Wine, Arts, Community, Family, Outdoor)
- Artist names (if applicable)

Return as JSON.
```

### 5.2 Vector Embeddings for Similarity

**Embedding Strategy**:
- Generate embeddings for event title + description + venue + tags
- Use OpenAI `text-embedding-3-large` (1536 dimensions)
- Store in pgvector column
- Index with IVFFlat for fast approximate search

**Similarity Use Cases**:
1. Deduplication (cosine similarity >0.9)
2. "More like this" recommendations
3. Semantic search
4. Related events sidebar

**Example Query**:
```sql
-- Find similar events
SELECT id, title, 1 - (embedding <=> $1::vector) as similarity
FROM events
WHERE start_datetime >= NOW()
  AND id != $2
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### 5.3 Recommendation Engine

**Hybrid Approach**:

**1. Content-Based Filtering**:
- User's liked events embeddings
- Find events with high cosine similarity
- Weight by recency of interaction

**2. Spotify Integration**:
- Fetch top 50 artists (short/medium/long term)
- Match artist names to event performers (fuzzy matching)
- Boost events with matched artists

**3. Collaborative Filtering** (Phase 2):
- Users with similar taste profiles
- "Users like you also attended..."

**Scoring Formula**:
```typescript
function recommendationScore(event: Event, user: User): number {
  let score = 0;

  // Content similarity (0-40 points)
  const contentSim = cosineSimilarity(event.embedding, user.preferenceEmbedding);
  score += contentSim * 40;

  // Spotify match (0-30 points)
  if (eventMatchesSpotifyArtist(event, user.spotifyArtists)) {
    score += 30;
  }

  // Category preference (0-15 points)
  const categoryMatch = user.preferredCategories.filter(c =>
    event.category.includes(c)
  ).length;
  score += categoryMatch * 5;

  // Recency boost (0-10 points)
  const daysUntil = daysBetween(now, event.startDateTime);
  if (daysUntil <= 7) score += 10;
  else if (daysUntil <= 14) score += 5;

  // Time preference (0-5 points)
  if (matchesUserTimePreference(event, user)) {
    score += 5;
  }

  return score;
}
```

## 6. User Experience & Design

### 6.1 Homepage
- Hero section: "What's happening in SLO?"
- Smart search bar with suggestions
- "Tonight", "This Weekend", "This Week" quick filters
- **Personalized feed** (logged in users):
  - "Your Artists Playing" (Spotify matches)
  - "Recommended for You"
  - "Popular This Week"
- **Discovery feed** (logged out):
  - Featured events
  - Trending events
  - Events by category

### 6.2 Event Detail Page
- Large hero image
- Title, date, time, venue
- Description (AI-enhanced if needed)
- Map with venue location
- "Get Tickets" CTA
- "Similar Events" carousel
- "More at this Venue" section
- Source attribution links
- Social sharing buttons

### 6.3 Search & Filters
- Natural language search
- Filters sidebar:
  - Date range picker
  - Categories (multi-select)
  - Price range
  - Distance radius
  - Venue type
- Sort options: Relevance, Date, Popularity

### 6.4 User Profile
- Connected accounts (Spotify)
- Saved events calendar
- Blocked events/categories management
- Notification preferences
- Event history
- Recommendation tuning

## 7. Development Phases

### Phase 1: MVP (8-10 weeks)
**Goal**: Core functionality with 20 major venues

**Deliverables**:
- [ ] Database schema with pgvector
- [ ] 20 venue-specific scraper agents
- [ ] Event normalization and deduplication
- [ ] Basic search and filtering
- [ ] Responsive UI with Shadcn/ui
- [ ] Event detail pages
- [ ] No user accounts (anonymous browsing)

### Phase 2: Personalization (4-6 weeks)
**Goal**: User accounts and Spotify integration

**Deliverables**:
- [ ] User authentication (email + OAuth)
- [ ] Spotify integration
- [ ] Event blocking features
- [ ] "More like this" recommendations
- [ ] Artist proximity alerts
- [ ] Email notifications

### Phase 3: Coverage Expansion (4-6 weeks)
**Goal**: Comprehensive SLO area coverage

**Deliverables**:
- [ ] 80+ scraper agents (all research sources)
- [ ] Social media scrapers (Facebook, Instagram)
- [ ] API integrations (Eventbrite, Meetup, Bandsintown)
- [ ] Generic scraper for unknown venues
- [ ] Admin dashboard for monitoring

### Phase 4: Advanced Features (6-8 weeks)
**Goal**: Social features and mobile app

**Deliverables**:
- [ ] Social features (friends, sharing)
- [ ] Event reviews and ratings
- [ ] Mobile app (React Native)
- [ ] Collaborative filtering recommendations
- [ ] Advanced analytics

## 8. Success Metrics & KPIs

### Data Quality
- **Event Coverage**: 95%+ of real events captured
- **Duplicate Rate**: <2% duplicates in database
- **Data Freshness**: Events added within 24 hours of posting
- **Accuracy**: 98%+ correct event details

### User Engagement
- **WAU/MAU**: 70%+ weekly active users
- **Session Duration**: 5+ minutes average
- **Events per Session**: 8+ events viewed
- **Return Rate**: 60%+ users return within 7 days

### Personalization
- **Spotify Connection**: 40%+ users connect Spotify
- **Recommendation CTR**: 15%+ click-through on recommended events
- **Notification Engagement**: 30%+ open rate on artist alerts
- **Blocking Usage**: <5% of events blocked (quality signal)

### Business Metrics (Phase 2+)
- **User Growth**: 20% MoM growth
- **Ticket Referrals**: Track outbound clicks to ticket sites
- **Venue Partnerships**: Paid listings for venues
- **API Usage**: Developer adoption (future)

## 9. Technical Risks & Mitigation

### Risk 1: Website Structure Changes
**Mitigation**:
- Monitor scraper success rates
- Alert on failures
- Self-healing agents that adapt
- Maintain multiple sources per event

### Risk 2: Rate Limiting / Blocking
**Mitigation**:
- Respect robots.txt
- Rotate IPs (residential proxies if needed)
- Reasonable request delays
- API integrations where available

### Risk 3: Duplicate Detection Accuracy
**Mitigation**:
- Manual review queue for uncertain matches
- Continuous model tuning
- User feedback on duplicates
- A/B test similarity thresholds

### Risk 4: Spotify API Limitations
**Mitigation**:
- Cache artist data locally
- Rate limiting on API calls
- Graceful degradation without Spotify
- Alternative integrations (Last.fm, Apple Music)

### Risk 5: Infrastructure Costs
**Mitigation**:
- Use Lambda for scraping (pay per execution)
- Cache aggressively with Redis
- CloudFront caching for images
- PostgreSQL connection pooling
- Monitor and optimize embedding storage

## 10. Privacy & Legal

### Data Privacy
- GDPR/CCPA compliant data handling
- Clear privacy policy
- User data deletion on request
- Encrypted Spotify tokens
- No selling of user data

### Web Scraping Ethics
- Respect robots.txt
- Attribute sources
- No bypassing authentication
- Rate limiting and respectful scraping
- Link back to original sources

### Copyright
- Use venue-provided images when possible
- Fair use for event descriptions
- Attribute all content sources
- DMCA compliance process

## 11. Go-to-Market Strategy

### Launch Strategy
1. **Beta Testing** (Week 1-2): 50 local users
2. **Soft Launch** (Week 3-4): SLO subreddit, local Facebook groups
3. **PR Push** (Week 5-6): New Times, local bloggers, Cal Poly
4. **Venue Partnerships** (Week 7+): Direct outreach to major venues

### Marketing Channels
- Social media (Instagram, Facebook, TikTok)
- Local partnerships (Visit SLO, Chamber of Commerce)
- Cal Poly student groups
- Local influencers (@enjoyslo, @bigbigslo)
- Google/Facebook ads (Phase 2)

### Competitive Advantage
1. **Comprehensive Coverage**: More sources than any competitor
2. **Zero Duplicates**: Clean, unified event listings
3. **AI Personalization**: Spotify integration is unique
4. **User Experience**: Modern UI, fast search, mobile-first
5. **Local Focus**: SLO-specific, not generic nationwide platform

---

**Next Steps**: Review with @fullstack-typescript-architect and @ai-integration-specialist to design system architecture and begin Phase 1 development.
