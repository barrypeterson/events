// Frontend-specific types and tRPC router type
export interface ArtistInfo {
  name: string
  spotifyId?: string
  spotifyUrl?: string
  genres?: string[]
  imageUrl?: string
  popularity?: number
  monthlyListeners?: number
  topTracks?: Array<{
    name: string
    previewUrl?: string
  }>
  youtubeChannelUrl?: string
}

export interface Event {
  id: string
  title: string
  description: string
  date: string // Legacy field, use startDateTime instead
  startDateTime?: string // ISO 8601 date string
  endDateTime?: string | null // ISO 8601 date string for events with time ranges
  venue: string
  venueAddress?: string
  category: string
  imageUrl?: string
  price?: number
  isFree: boolean
  isRecurring?: boolean
  url?: string
  latitude?: number
  longitude?: number
  organizerName?: string
  organizerUrl?: string
  metadata?: {
    artistInfo?: ArtistInfo
    [key: string]: any
  }
  createdAt: string
  updatedAt: string
}

export interface EventFilters {
  categories?: string[] // Changed from single category to array for multi-select
  dateFrom?: string
  dateTo?: string
  search?: string
  isFree?: boolean
  showPastEvents?: boolean
  showRecurringEvents?: boolean
}

export interface SearchState {
  query: string
  filters: EventFilters
  setQuery: (query: string) => void
  setFilters: (filters: Partial<EventFilters>) => void
  resetFilters: () => void
}

// Import the backend tRPC router type
import type { AppRouter as BackendAppRouter } from '../../../backend/src/api/trpc/router'

export type AppRouter = BackendAppRouter
