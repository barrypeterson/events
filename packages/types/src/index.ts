/**
 * @slo-events/types
 *
 * Shared TypeScript types for the SLO Events Platform monorepo.
 * Provides type-safe interfaces for events, venues, users, API contracts,
 * and scraper agents.
 */

// ============================================================================
// EVENT TYPES
// ============================================================================

export type {
  // Core entities
  Event,
  EventWithVenue,
  EventWithRelations,
  EventListItem,
  Venue,
  VenueWithCount,
  VenueOption,
  User,
  // Event sources
  EventSource,
  EventDuplicate,
  // User interactions
  UserEventInteraction,
  UserBlockedEvent,
  UserBlockedRecurring,
  UserSpotifyArtist,
  // Filters
  EventFilters,
  VenueFilters,
  EventQueryOptions,
  // Recurring
  RecurringPattern,
  // Price
  PriceRange,
  PriceStats,
  // Metadata
  EventMetadata,
  VenueMetadata,
} from './events';

export {
  // Enums
  EventCategory,
  EventStatus,
  InteractionType,
  SpotifyTerm,
  EventSortBy,
  SortOrder,
} from './events';

// ============================================================================
// API TYPES
// ============================================================================

export type {
  // Pagination
  PaginationMeta,
  PaginatedResponse,
  PaginationInput,
  // Standard responses
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  // Event API
  GetEventsRequest,
  GetEventsResponse,
  GetEventRequest,
  GetEventResponse,
  CreateEventRequest,
  UpdateEventRequest,
  SearchEventsRequest,
  SearchEventsResponse,
  // Venue API
  GetVenuesRequest,
  GetVenuesResponse,
  GetVenueRequest,
  GetVenueResponse,
  CreateVenueRequest,
  UpdateVenueRequest,
  // User API
  RegisterUserRequest,
  LoginUserRequest,
  AuthResponse,
  UpdateUserRequest,
  UserPreferences,
  // User interactions API
  SetInteractionRequest,
  RemoveInteractionRequest,
  GetUserEventsRequest,
  GetUserEventsResponse,
  BlockEventRequest,
  BlockRecurringRequest,
  // Spotify API
  SpotifyAuthCallback,
  SpotifyAuthResponse,
  SyncSpotifyArtistsRequest,
  SpotifyRecommendationsRequest,
  SpotifyRecommendationsResponse,
  // Analytics API
  GetEventStatsRequest,
  EventStatsResponse,
  VenueStatsResponse,
  // tRPC types
  TRPCContext,
  TRPCPublicContext,
  TRPCProtectedContext,
  EventRouterInputs,
  VenueRouterInputs,
  UserRouterInputs,
  SpotifyRouterInputs,
  // WebSocket types
  WebSocketMessage,
  ScraperProgressPayload,
} from './api';

export {
  // Enums
  WebSocketEventType,
} from './api';

// ============================================================================
// AGENT TYPES
// ============================================================================

export type {
  // Scraper
  ScraperRun,
  CreateScraperRunRequest,
  UpdateScraperRunRequest,
  // Raw data
  RawEvent,
  RawVenue,
  RawPrice,
  // AI extraction
  EventExtractionContext,
  EventExtractionResponse,
  EventNormalizationRequest,
  NormalizedEvent,
  // Scraper config
  ScraperSource,
  ScraperSelectors,
  ScraperOptions,
  // Deduplication
  EventSimilarity,
  DetectDuplicatesRequest,
  DetectDuplicatesResponse,
  MergeEventsRequest,
  // Embeddings
  Embedding,
  GenerateEmbeddingRequest,
  SemanticSearchRequest,
  SemanticSearchResult,
  // Jobs
  ScraperJobPayload,
  EventProcessingJobPayload,
  JobProgress,
  // Batch operations
  BatchScrapeRequest,
  BatchScrapeResponse,
  BatchEventImportRequest,
  BatchEventImportResponse,
  // Validation
  EventValidationResult,
  ValidationError,
  ValidationWarning,
  VenueValidationResult,
} from './agents';

export {
  // Enums
  ScraperStatus,
  ScraperSourceType,
  MergeStrategy,
} from './agents';

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Re-export commonly used Prisma types
export type { Decimal } from '@prisma/client/runtime/library';
