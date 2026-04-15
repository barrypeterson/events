# Testing Guide

Complete testing strategy for the SLO Events Platform with E2E, integration, and unit tests.

## 🎯 Testing Philosophy

We follow the **testing pyramid**:

```
        /\
       /E2E\     ← Few, high-value happy path tests
      /------\
     /  API  \   ← Integration tests for API endpoints
    /--------\
   /  UNIT   \  ← Many, fast unit tests
  /----------\
```

## 🧪 Test Types

### 1. E2E Tests (Playwright)

**Location**: `apps/e2e/tests/`

**Purpose**: Test complete user workflows from browser to database

**Examples**:
- User browses events → clicks event → views details
- User searches "jazz" → filters by category → finds events
- User visits non-existent event → sees 404 page

**Run**:
```bash
cd apps/e2e
pnpm test              # Run all E2E tests
pnpm test:ui           # Open Playwright UI
pnpm test:headed       # Run with browser visible
pnpm test:debug        # Debug mode
```

### 2. API Tests (Playwright + Request)

**Location**: `apps/e2e/tests/api/`

**Purpose**: Test backend API endpoints directly

**Examples**:
- GET /api/trpc/events.list returns events
- POST /api/trpc/events.search with query returns results
- GET /api/trpc/events.getById with invalid ID returns 404

**Run**:
```bash
cd apps/e2e
pnpm test tests/api/
```

### 3. Backend Unit Tests (Vitest)

**Location**: `apps/backend/tests/`

**Purpose**: Test individual functions and services

**Examples**:
- Event service creates event correctly
- Deduplication engine detects similar events
- Search service generates correct embeddings

**Run**:
```bash
cd apps/backend
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
```

### 4. Frontend Unit Tests (Vitest + React Testing Library)

**Location**: `apps/frontend/tests/`

**Purpose**: Test React components in isolation

**Examples**:
- EventCard displays event information
- SearchBar handles input correctly
- EventFilter applies category filter

**Run**:
```bash
cd apps/frontend
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
```

## 📁 Test Structure

```
apps/
├── e2e/
│   ├── tests/
│   │   ├── happy-path/
│   │   │   ├── 01-homepage.spec.ts
│   │   │   ├── 02-search.spec.ts
│   │   │   └── 03-event-detail.spec.ts
│   │   ├── api/
│   │   │   └── events-api.spec.ts
│   │   ├── global-setup.ts
│   │   └── global-teardown.ts
│   ├── playwright.config.ts
│   └── package.json
│
├── backend/
│   ├── tests/
│   │   ├── services/
│   │   │   ├── event.service.test.ts
│   │   │   └── search.service.test.ts
│   │   ├── agents/
│   │   │   └── deduplication.test.ts
│   │   └── setup.ts
│   ├── vitest.config.ts
│   └── package.json
│
└── frontend/
    ├── tests/
    │   ├── components/
    │   │   ├── EventCard.test.tsx
    │   │   └── SearchBar.test.tsx
    │   └── setup.ts
    ├── vitest.config.ts
    └── package.json
```

## 🚀 Running Tests

### All Tests

```bash
# From project root
pnpm test                    # Run all tests (unit + E2E)
pnpm test:unit               # Run only unit tests
pnpm test:e2e                # Run only E2E tests
pnpm test:coverage           # Run with coverage reports
```

### Individual Test Suites

```bash
# E2E tests
cd apps/e2e
pnpm test                              # All E2E tests
pnpm test tests/happy-path/            # Only happy path tests
pnpm test tests/happy-path/01-homepage # Single test file

# Backend tests
cd apps/backend
pnpm test                              # All backend tests
pnpm test services/event               # Specific test file

# Frontend tests
cd apps/frontend
pnpm test                              # All frontend tests
pnpm test components/EventCard         # Specific test
```

### Watch Mode (Development)

```bash
# Backend (runs tests on file changes)
cd apps/backend && pnpm test:watch

# Frontend (runs tests on file changes)
cd apps/frontend && pnpm test:watch
```

## 🎭 Playwright E2E Tests

### Configuration

**`apps/e2e/playwright.config.ts`**:
- Tests run against `localhost:5173` (frontend) and `localhost:3001` (backend)
- Automatically starts dev servers if not running
- Tests run in multiple browsers: Chrome, Firefox, Safari, Mobile
- Screenshots and videos on failure
- Traces for debugging

### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    // Navigate to page
    await page.goto('/');

    // Interact with elements using data-testid
    const button = page.locator('[data-testid="my-button"]');
    await button.click();

    // Assert expectations
    await expect(page).toHaveURL('/expected-url');
  });
});
```

### Best Practices

1. **Use data-testid attributes**:
   ```tsx
   <button data-testid="get-tickets-button">Get Tickets</button>
   ```

2. **Wait for elements**:
   ```typescript
   await page.waitForSelector('[data-testid="event-card"]');
   ```

3. **Test user workflows, not implementation**:
   ✅ Good: "User searches for jazz events and finds results"
   ❌ Bad: "Search component updates state on input change"

4. **Keep tests independent**:
   - Each test should work in isolation
   - Don't rely on test execution order

5. **Use descriptive test names**:
   ```typescript
   test('should display event details when clicking event card', ...)
   ```

### Debugging E2E Tests

```bash
# Run with UI (recommended)
pnpm test:ui

# Run with browser visible
pnpm test:headed

# Debug specific test
pnpm test:debug tests/happy-path/01-homepage.spec.ts

# Generate test code from browser actions
pnpm test:codegen
```

### Visual Testing

Playwright supports visual regression testing:

```typescript
test('should match homepage screenshot', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png');
});
```

Update snapshots:
```bash
pnpm test:update-snapshots
```

## 🧪 Backend Unit Tests

### Writing Backend Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { EventService } from '@/services/event.service';
import { prisma } from '@slo-events/database';

describe('EventService', () => {
  let eventService: EventService;

  beforeEach(() => {
    eventService = new EventService();
  });

  it('should create an event', async () => {
    const event = await eventService.create({
      title: 'Test Event',
      startDateTime: new Date(),
      venueId: 'venue-id',
      // ...
    });

    expect(event).toHaveProperty('id');
    expect(event.title).toBe('Test Event');
  });

  it('should find similar events', async () => {
    const similarEvents = await eventService.findSimilar('event-id');

    expect(Array.isArray(similarEvents)).toBe(true);
    expect(similarEvents[0]).toHaveProperty('similarity');
  });
});
```

### Mocking External Services

```typescript
import { vi } from 'vitest';

// Mock OpenAI
vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0) }],
      }),
    },
  })),
}));

// Mock Claude
vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: '{"extracted": "data"}' }],
      }),
    },
  })),
}));
```

## ⚛️ Frontend Unit Tests

### Writing Frontend Tests

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard } from '@/components/EventCard';

describe('EventCard', () => {
  const mockEvent = {
    id: '1',
    title: 'Jazz Night',
    startDateTime: new Date('2024-12-15'),
    venue: { name: 'Fremont Theater' },
  };

  it('should render event information', () => {
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('Jazz Night')).toBeInTheDocument();
    expect(screen.getByText('Fremont Theater')).toBeInTheDocument();
  });

  it('should handle click events', async () => {
    const handleClick = vi.fn();
    render(<EventCard event={mockEvent} onClick={handleClick} />);

    await userEvent.click(screen.getByRole('article'));

    expect(handleClick).toHaveBeenCalledWith(mockEvent.id);
  });
});
```

### Testing tRPC Hooks

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { trpc } from '@/lib/trpc';

// Mock tRPC client
vi.mock('@/lib/trpc', () => ({
  trpc: {
    events: {
      list: {
        useQuery: vi.fn(),
      },
    },
  },
}));

it('should fetch events', async () => {
  const mockEvents = [{ id: '1', title: 'Event 1' }];

  vi.mocked(trpc.events.list.useQuery).mockReturnValue({
    data: mockEvents,
    isLoading: false,
    isError: false,
  });

  const { result } = renderHook(() => trpc.events.list.useQuery());

  await waitFor(() => {
    expect(result.current.data).toEqual(mockEvents);
  });
});
```

## 📊 Coverage Reports

### Generate Coverage

```bash
# All tests with coverage
pnpm test:coverage

# Backend only
cd apps/backend && pnpm test:coverage

# Frontend only
cd apps/frontend && pnpm test:coverage
```

### View Coverage Reports

Coverage reports are generated in HTML format:

```bash
# Backend
open apps/backend/coverage/index.html

# Frontend
open apps/frontend/coverage/index.html
```

### Coverage Thresholds

We aim for:
- **80%+ overall coverage**
- **90%+ for critical paths** (event creation, search, deduplication)
- **100% for utility functions**

Configure in `vitest.config.ts`:
```typescript
coverage: {
  lines: 80,
  functions: 80,
  branches: 75,
  statements: 80,
}
```

## 🔄 CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm test:unit

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm docker:up
      - run: pnpm db:push
      - run: pnpm test:e2e
```

## 🐛 Test Debugging

### Backend Debugging

```bash
# Run single test with logs
cd apps/backend
DEBUG=* pnpm test services/event.service.test.ts

# Node inspector
node --inspect-brk node_modules/.bin/vitest
```

### Frontend Debugging

```bash
# Run with browser
cd apps/frontend
pnpm test:ui

# Debug specific component
pnpm test components/EventCard.test.tsx --reporter=verbose
```

### E2E Debugging

```bash
# Playwright UI (best for debugging)
cd apps/e2e
pnpm test:ui

# Debug mode (pauses on errors)
pnpm test:debug

# Headed mode (see browser)
pnpm test:headed

# Trace viewer (view recorded traces)
npx playwright show-trace trace.zip
```

## 📝 Testing Checklist

### Before Committing

- [ ] All tests pass locally
- [ ] New features have tests
- [ ] Coverage doesn't decrease
- [ ] No `.only` or `.skip` in tests
- [ ] Tests are deterministic (no random failures)

### Before Deploying

- [ ] All E2E tests pass
- [ ] API tests pass
- [ ] Coverage meets thresholds
- [ ] Performance tests pass (if applicable)
- [ ] Visual regression tests reviewed

## 🎯 Test Coverage Goals

### Phase 1 (MVP)
- **E2E**: 10-15 happy path tests
- **Backend**: 70%+ coverage
- **Frontend**: 60%+ coverage

### Phase 2 (Post-MVP)
- **E2E**: 30+ tests including edge cases
- **Backend**: 85%+ coverage
- **Frontend**: 75%+ coverage

### Phase 3 (Production)
- **E2E**: 50+ tests, visual regression, performance
- **Backend**: 90%+ coverage
- **Frontend**: 85%+ coverage

## 📚 Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Vitest Documentation](https://vitest.dev/guide/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**Happy Testing! 🧪**
