# Prisma Best Practices Implementation

This document outlines all the Prisma best practices improvements implemented for the SLO Events platform.

## Overview

The following improvements have been implemented to enhance performance, reliability, observability, and developer experience:

1. Connection pool configuration
2. Query performance monitoring
3. Structured error logging with Winston integration
4. Connection retry logic
5. Transaction helper utilities
6. Query extensions for common patterns
7. Environment-specific configuration
8. Graceful shutdown handlers
9. Metrics collection system
10. Vector search optimization helpers

---

## 1. Connection Pool Configuration

### Location
- `.env.example`

### Changes
Added explicit connection pool parameters to the `DATABASE_URL`:

```env
DATABASE_URL="postgresql://user:pass@host:port/db?connection_limit=10&pool_timeout=20&connect_timeout=10"
```

### Configuration Guidelines
- **Backend API**: `connection_limit=10` (default for web servers)
- **Scraper Agents**: `connection_limit=5` (fewer, long-running connections)
- **Production**: `connection_limit=20-50` (based on instance size and load)

### Benefits
- Prevents connection exhaustion
- Optimizes resource usage per service
- Reduces connection timeouts

---

## 2. Query Performance Monitoring

### Location
- `packages/database/src/index.ts` (lines 31-66)

### Implementation
Event handlers that track query execution time and log slow queries:

```typescript
const SLOW_QUERY_THRESHOLD = 1000; // 1 second

prisma.$on('query', (e) => {
  const duration = e.duration;
  metrics.incrementQuery(duration);

  if (duration > SLOW_QUERY_THRESHOLD) {
    // Log to logs/prisma-slow-queries.log
  }
});
```

Note: Using event-based logging (`emit: 'event'`) instead of middleware (`$use`) provides better integration with the event system and avoids conflicts with Prisma Client Extensions.

### Output
Slow queries are logged to `logs/prisma-slow-queries.log` with:
- Timestamp
- Model name
- Action (findMany, create, etc.)
- Duration
- Query arguments

### Benefits
- Identify performance bottlenecks
- Track query optimization effectiveness
- Debug production performance issues

---

## 3. Structured Error Logging

### Locations
- `packages/database/src/index.ts` (lines 68-89)
- `apps/backend/src/config/database.ts` (lines 12-45)

### Implementation
Integrated Prisma errors with Winston logger:

```typescript
prisma.$on('error', (e) => {
  logger.error('Prisma error', {
    target: e.target,
    timestamp: e.timestamp,
    message: e.message,
  });
});
```

### Output Files
- `logs/prisma-errors.log` - All database errors
- `logs/prisma-warnings.log` - Warning messages
- `logs/prisma-queries.log` - Query logs (when `LOG_QUERIES=true`)

### Benefits
- Centralized error tracking
- Integration with existing logging infrastructure
- Easy debugging without losing error context

---

## 4. Connection Retry Logic

### Location
- `packages/database/src/utils.ts` (lines 30-58)
- `apps/backend/src/config/database.ts` (lines 65-75)

### Implementation
```typescript
export async function connectWithRetry(
  maxRetries = 5,
  delay = 5000
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}
```

### Benefits
- Handles transient database connection failures
- Critical for scraper agents with long-running processes
- Prevents startup failures due to temporary issues

---

## 5. Transaction Helper Utilities

### Location
- `packages/database/src/utils.ts` (lines 1-28)

### Implementation
```typescript
export async function withTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: options?.maxWait ?? 5000,
    timeout: options?.timeout ?? 10000,
    isolationLevel: options?.isolationLevel,
  });
}
```

### Usage Example
```typescript
import { withTransaction } from '@slo-events/database';

await withTransaction(async (tx) => {
  const event = await tx.event.create({ ... });
  await tx.eventSource.create({ ... });
  return event;
}, {
  timeout: 15000,
  isolationLevel: 'Serializable'
});
```

### Benefits
- Simplified transaction management
- Consistent timeout and retry configuration
- Type-safe transaction client

---

## 6. Query Extensions

### Location
- `packages/database/src/extensions.ts`

### Implementation
Custom query methods for common patterns:

```typescript
// Find active events
await prismaExtended.event.findActive({
  startAfter: new Date(),
  categories: [EventCategory.MUSIC],
  limit: 50
});

// Find venues with upcoming events
await prismaExtended.venue.findWithUpcomingEvents({
  city: 'San Luis Obispo',
  limit: 20
});
```

### Available Extensions
- `event.findActive()` - Active events with filters
- `event.findByDateRange()` - Events in date range with pagination
- `event.findUpcomingByVenue()` - Upcoming events for a venue
- `venue.findWithUpcomingEvents()` - Venues with their upcoming events

### Benefits
- Reduces code duplication
- Type-safe query helpers
- Encapsulates business logic

---

## 7. Environment-Specific Configuration

### Location
- `packages/database/src/config.ts`

### Implementation
Different Prisma configurations per environment:

```typescript
{
  development: {
    log: ['query', 'error', 'warn', 'info'],
    errorFormat: 'pretty'
  },
  production: {
    log: ['error', 'warn'],
    errorFormat: 'minimal'
  }
}
```

### Benefits
- Optimized logging per environment
- Reduced overhead in production
- Better debugging in development

---

## 8. Graceful Shutdown Handlers

### Locations
- `apps/backend/src/config/database.ts` (lines 48-63)
- `apps/agents/src/orchestrator/index.ts` (lines 14-49)
- `apps/agents/src/cli.ts` (lines 14-30)

### Implementation
```typescript
const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

signals.forEach(signal => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, closing gracefully...`);
    await prisma.$disconnect();
    process.exit(0);
  });
});
```

### Benefits
- Prevents connection leaks
- Ensures clean shutdown
- Proper resource cleanup

---

## 9. Metrics Collection

### Location
- `packages/database/src/metrics.ts`

### Implementation
```typescript
export const metrics = new PrismaMetrics();

// Automatically tracked via middleware
metrics.incrementQuery(duration);
metrics.incrementError();
metrics.incrementSlowQuery();

// Get current metrics
const stats = metrics.getMetrics();
```

### Available Metrics
- Total queries executed
- Total errors
- Slow query count
- Average query time
- Queries per second
- Uptime

### Usage
```typescript
import { metrics } from '@slo-events/database';

export function getDatabaseMetrics() {
  return metrics.getMetrics();
}
```

### Benefits
- Real-time performance monitoring
- Health check data
- Observability for production

---

## 10. Vector Search Optimization

### Location
- `packages/database/src/vector.ts`

### Implementation
Optimized pgvector queries using raw SQL:

```typescript
// Find similar events
const similar = await findSimilarEvents(embedding, {
  limit: 10,
  minSimilarity: 0.8,
  excludeEventIds: ['id1', 'id2']
});

// Find potential duplicates
const duplicates = await findPotentialDuplicates(eventId, {
  minSimilarity: 0.85,
  timeDeltaHours: 24
});

// Calculate similarity between two events
const similarity = await calculateEventSimilarity(id1, id2);
```

### Available Functions
- `findSimilarEvents()` - Semantic event search
- `findSimilarVenues()` - Venue similarity search
- `calculateEventSimilarity()` - Direct similarity calculation
- `findPotentialDuplicates()` - Deduplication helper

### Benefits
- Optimized vector search performance
- Simplified deduplication logic
- Consistent similarity scoring

---

## Usage Examples

### Basic Query with Monitoring
```typescript
import { prisma } from '@slo-events/database';

// Automatically tracked and logged if slow
const events = await prisma.event.findMany({
  where: { status: 'ACTIVE' },
  include: { venue: true }
});
```

### Using Query Extensions
```typescript
import { prismaExtended } from '@slo-events/database';

const upcomingEvents = await prismaExtended.event.findActive({
  startAfter: new Date(),
  categories: [EventCategory.MUSIC, EventCategory.COMEDY],
  limit: 50
});
```

### Transaction with Retry
```typescript
import { withTransaction } from '@slo-events/database';

const result = await withTransaction(async (tx) => {
  const event = await tx.event.create({ data: eventData });
  await tx.eventSource.createMany({ data: sources });
  return event;
}, { timeout: 15000 });
```

### Vector Search
```typescript
import { findSimilarEvents } from '@slo-events/database';

const embedding = await generateEmbedding(eventDescription);
const similar = await findSimilarEvents(embedding, {
  limit: 5,
  minSimilarity: 0.85
});
```

### Getting Metrics
```typescript
import { metrics, getDatabaseMetrics } from '@slo-events/database';

// In your health check endpoint
app.get('/health/database', (req, res) => {
  res.json(getDatabaseMetrics());
});
```

---

## File Structure

```
packages/database/src/
├── index.ts              # Main Prisma client with middleware
├── config.ts             # Environment-specific configuration
├── metrics.ts            # Metrics collection
├── utils.ts              # Transaction helpers and retry logic
├── extensions.ts         # Query extensions
├── vector.ts             # Vector search helpers
└── seed.ts               # Database seeding

apps/backend/src/config/
└── database.ts           # Backend-specific setup with Winston

apps/agents/src/
├── orchestrator/index.ts # Agent orchestrator with shutdown
└── cli.ts                # CLI with graceful cleanup
```

---

## Log Files

All log files are stored in `logs/` directory (ignored by git):

- `logs/prisma-errors.log` - All database errors
- `logs/prisma-warnings.log` - Warning messages
- `logs/prisma-slow-queries.log` - Queries exceeding 1s threshold
- `logs/prisma-queries.log` - All queries (when `LOG_QUERIES=true`)

---

## Environment Variables

```env
# Database connection with pool settings
DATABASE_URL="postgresql://user:pass@host:port/db?connection_limit=10&pool_timeout=20&connect_timeout=10"

# Enable query logging (verbose, development only)
LOG_QUERIES="false"
```

---

## Performance Impact

### Before
- No visibility into slow queries
- Connection pool defaults only
- Manual transaction management
- Repeated complex queries
- No metrics collection

### After
- Automatic slow query detection
- Optimized connection pools per service
- Simplified transaction API
- Reusable query extensions
- Real-time metrics and monitoring

---

## Monitoring Recommendations

1. **Review slow queries weekly**
   ```bash
   tail -f logs/prisma-slow-queries.log
   ```

2. **Check error logs daily**
   ```bash
   tail -f logs/prisma-errors.log
   ```

3. **Monitor metrics endpoint**
   ```bash
   curl http://localhost:3001/health/database
   ```

4. **Alert on consecutive failures**
   - Set up alerts for `metrics.errorCount` spikes
   - Monitor connection retry failures

---

## Future Enhancements

- [ ] Add Prisma query caching with Redis
- [ ] Implement read replicas for heavy read workloads
- [ ] Add query result pagination helpers
- [ ] Create custom Prisma middleware for audit logging
- [ ] Implement connection pool metrics
- [ ] Add automatic index suggestions based on slow queries
