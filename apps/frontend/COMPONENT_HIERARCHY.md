# Component Hierarchy

```
App (React Router + TanStack Query + tRPC Provider)
└── Layout
    ├── Header
    │   ├── Logo Link
    │   ├── Navigation
    │   └── Mobile Menu (DropdownMenu)
    │
    ├── Main Content (Routes)
    │   │
    │   ├── Route: /
    │   │   └── EventsPage
    │   │       ├── SearchBar
    │   │       │   └── Input (with clear button)
    │   │       ├── EventFilters
    │   │       │   └── Category Badges
    │   │       └── EventList
    │   │           ├── EventCard (multiple)
    │   │           │   ├── Card
    │   │           │   ├── Image
    │   │           │   ├── CardHeader
    │   │           │   │   ├── CardTitle
    │   │           │   │   └── Badge (Free)
    │   │           │   ├── CardContent
    │   │           │   │   ├── Date/Time
    │   │           │   │   └── Venue
    │   │           │   └── CardFooter
    │   │           │       └── Badge (Category)
    │   │           ├── Skeleton (loading state)
    │   │           └── EmptyState / ErrorState
    │   │
    │   ├── Route: /events/:id
    │   │   └── EventDetailPage
    │   │       ├── EventDetail
    │   │       │   ├── Back Button
    │   │       │   ├── Share Button
    │   │       │   ├── Hero Image
    │   │       │   ├── Event Info
    │   │       │   │   ├── Badges (Category, Free)
    │   │       │   │   ├── Title
    │   │       │   │   ├── Date/Time
    │   │       │   │   ├── Venue
    │   │       │   │   └── Organizer
    │   │       │   ├── Description
    │   │       │   ├── Get Tickets Button
    │   │       │   └── Map Card
    │   │       │       ├── Embedded Map
    │   │       │       └── View in Maps Button
    │   │       ├── Separator
    │   │       └── SimilarEvents
    │   │           └── ScrollArea
    │   │               └── EventCard (multiple)
    │   │
    │   └── Route: *
    │       └── NotFoundPage
    │           ├── Icon
    │           ├── Error Message
    │           └── Back Button
    │
    └── Footer
        ├── About Section
        ├── Quick Links
        ├── Social Links
        ├── Separator
        └── Copyright

State Management:
├── Zustand Store (search.ts)
│   ├── query (search string)
│   └── filters (category, date, isFree)
│
└── TanStack Query Cache
    ├── events.list (5 min cache)
    └── events.getById (5 min cache)

Custom Hooks:
├── useEvents (wraps trpc.events.list)
├── useEventDetail (wraps trpc.events.getById)
├── useSearch (debounced search with Zustand)
└── useFilters (filter state management)

Utilities:
├── utils.ts
│   ├── cn() - className merger
│   ├── formatEventDate() - date formatting
│   ├── getCategoryColor() - category badge colors
│   ├── debounce() - debounce utility
│   └── truncate() - text truncation
│
├── api.ts
│   ├── getImageUrl() - image URL helper
│   └── getMapUrl() - Google Maps URL
│
└── trpc.ts
    └── tRPC client configuration
```

## Data Flow

```
User Interaction
    ↓
Component (EventsPage, EventDetailPage)
    ↓
Hook (useEvents, useEventDetail, useSearch, useFilters)
    ↓
Zustand Store (search state) / TanStack Query (server state)
    ↓
tRPC Client
    ↓
HTTP Request to Backend (http://localhost:3001/api/trpc)
    ↓
Backend API Response
    ↓
TanStack Query Cache (5 min)
    ↓
Component Re-render with Data
    ↓
UI Update
```

## Component Categories

### Presentation Components (No state)
- EventCard
- EventFilters
- SearchBar
- Header
- Footer
- Layout

### Container Components (State management)
- EventsPage
- EventDetailPage
- EventList
- EventDetail
- SimilarEvents

### UI Components (Shadcn/ui)
- Button
- Card
- Input
- Badge
- Dialog
- DropdownMenu
- Select
- Skeleton
- Separator
- Avatar
- ScrollArea
- Calendar
- Label
