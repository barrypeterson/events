# @slo-events/ui

Shared UI components for the SLO Events Platform.

## Status

**Phase 2** - Package structure created, implementation pending.

## Planned Features

### Components
- `EventCard` - Display event information
- `EventList` - Paginated event listing
- `VenueCard` - Display venue information
- `FilterBar` - Event filtering interface
- `CategoryBadge` - Event category display
- `PriceDisplay` - Price range formatting
- `DateDisplay` - Date/time formatting
- `LoadingSpinner` - Loading states
- `ErrorMessage` - Error display

### Hooks
- `useEvents` - Fetch and manage events
- `useVenues` - Fetch and manage venues
- `useAuth` - Authentication state
- `useFilters` - Filter state management
- `usePagination` - Cursor-based pagination
- `useDebounce` - Debounced search

### Utilities
- Date formatting helpers
- Price formatting helpers
- Text normalization
- Image URL helpers
- Category helpers

## Usage (Future)

```tsx
import { EventCard, useEvents } from '@slo-events/ui';

function EventListPage() {
  const { events, loading } = useEvents({ limit: 10 });

  return (
    <div>
      {events.map(event => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
```

## Installation

This package is part of the monorepo workspace and will be automatically linked.

```bash
# In any app/package that needs UI components
# Already configured in package.json dependencies
```

## Development

```bash
# Type check
pnpm type-check

# Lint
pnpm lint

# Watch mode
pnpm dev
```

## Design System

To be determined in Phase 2. Consider:
- Tailwind CSS for styling
- Radix UI for accessible primitives
- shadcn/ui for component patterns
- Custom theme configuration
