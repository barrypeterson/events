# SLO Events Platform - Frontend

AI-first events discovery platform built with React 18, TypeScript, and Vite.

## Features

- Browse and search events in San Luis Obispo
- AI-powered semantic search
- Filter by category and date
- Responsive design (mobile-first)
- Dark mode support
- Event details with maps integration
- Similar events recommendations

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TanStack Query** - Data fetching and caching
- **tRPC** - End-to-end typesafe APIs
- **Zustand** - State management
- **React Router** - Client-side routing
- **Tailwind CSS** - Styling
- **Shadcn/ui** - Component library
- **Lucide Icons** - Icon library

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Start the development server:
```bash
npm run dev
```

The app will be available at http://localhost:3000

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── ui/              # Shadcn/ui components
│   ├── layout/          # Layout components (Header, Footer)
│   └── events/          # Event-specific components
├── features/
│   └── events/          # Event pages
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and tRPC client
├── stores/              # Zustand stores
├── types/               # TypeScript types
├── App.tsx              # Main app component with routing
├── main.tsx             # React entry point
└── index.css            # Global styles
```

## Key Components

### Pages
- **EventsPage** - Main events listing with search and filters
- **EventDetailPage** - Individual event details
- **NotFoundPage** - 404 error page

### Components
- **EventCard** - Event card in grid view
- **EventList** - Grid of event cards with loading states
- **EventDetail** - Full event information display
- **SearchBar** - Search input with debounce
- **EventFilters** - Category filter pills
- **SimilarEvents** - Horizontal scrolling carousel

### Hooks
- **useEvents** - Fetch events with filters
- **useEventDetail** - Fetch single event
- **useSearch** - Search with debounce
- **useFilters** - Filter state management

## Environment Variables

- `VITE_API_URL` - Backend API URL (default: http://localhost:3001)

## Development Guidelines

### Code Style
- Use TypeScript for all new files
- Follow React hooks best practices
- Use functional components
- Add data-testid attributes for E2E testing

### Styling
- Use Tailwind utility classes
- Follow mobile-first responsive design
- Use Shadcn/ui components for consistency
- Implement smooth transitions (200ms)

### State Management
- Use TanStack Query for server state
- Use Zustand for client state (search, filters)
- Cache API responses for 5 minutes

## Testing

E2E tests can access components via data-testid attributes:
- `data-testid="event-card-{id}"`
- `data-testid="search-input"`
- `data-testid="category-filter-{category}"`
- etc.

## Performance

- Images lazy loaded
- 5-minute cache for API responses
- Debounced search (500ms)
- Code splitting with React Router
- Optimized bundle size

## License

MIT
