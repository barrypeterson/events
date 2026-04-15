/**
 * API request/response types and tRPC router types
 *
 * Defines the contract between frontend and backend services
 */

import type {
  Event,
  EventWithVenue,
  EventWithRelations,
  EventListItem,
  EventFilters,
  EventQueryOptions,
  Venue,
  VenueWithCount,
  VenueFilters,
  User,
  UserEventInteraction,
  InteractionType,
  EventCategory,
} from './events';

// ============================================================================
// PAGINATION TYPES
// ============================================================================

/**
 * Cursor-based pagination metadata
 */
export interface PaginationMeta {
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

/**
 * Generic paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

/**
 * Pagination input parameters
 */
export interface PaginationInput {
  limit?: number;
  cursor?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// EVENT API TYPES
// ============================================================================

/**
 * Event list request
 */
export interface GetEventsRequest extends PaginationInput {
  filters?: EventFilters;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Event list response
 */
export type GetEventsResponse = PaginatedResponse<EventListItem>;

/**
 * Single event request
 */
export interface GetEventRequest {
  id: string;
  includeRelations?: boolean;
}

/**
 * Single event response
 */
export type GetEventResponse = EventWithRelations | EventWithVenue;

/**
 * Create event request (for admin/scraper)
 */
export interface CreateEventRequest {
  title: string;
  description?: string;
  startDateTime: Date | string;
  endDateTime?: Date | string;
  venueId: string;
  category: EventCategory[];
  tags?: string[];
  images?: string[];
  ticketUrl?: string;
  priceMin?: number;
  priceMax?: number;
  isFree?: boolean;
  ageRestriction?: string;
  isRecurring?: boolean;
  recurringPattern?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Update event request
 */
export interface UpdateEventRequest {
  id: string;
  data: Partial<CreateEventRequest>;
}

/**
 * Search events request
 */
export interface SearchEventsRequest extends PaginationInput {
  query: string;
  filters?: EventFilters;
  useSemanticSearch?: boolean;
}

/**
 * Search events response with relevance scores
 */
export interface SearchEventsResponse extends PaginatedResponse<EventListItem> {
  query: string;
  resultCount: number;
}

// ============================================================================
// VENUE API TYPES
// ============================================================================

/**
 * Venue list request
 */
export interface GetVenuesRequest extends PaginationInput {
  filters?: VenueFilters;
  includeEventCount?: boolean;
}

/**
 * Venue list response
 */
export type GetVenuesResponse = PaginatedResponse<Venue | VenueWithCount>;

/**
 * Single venue request
 */
export interface GetVenueRequest {
  id: string;
}

/**
 * Single venue response
 */
export interface GetVenueResponse extends Venue {
  upcomingEventCount?: number;
}

/**
 * Create venue request
 */
export interface CreateVenueRequest {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  website?: string;
  phone?: string;
  venueType?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Update venue request
 */
export interface UpdateVenueRequest {
  id: string;
  data: Partial<CreateVenueRequest>;
}

// ============================================================================
// USER API TYPES
// ============================================================================

/**
 * User registration request
 */
export interface RegisterUserRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/**
 * User login request
 */
export interface LoginUserRequest {
  email: string;
  password: string;
}

/**
 * Auth response with token
 */
export interface AuthResponse {
  user: User;
  token: string;
  expiresAt: Date;
}

/**
 * Update user profile request
 */
export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  preferences?: Record<string, unknown>;
}

/**
 * User preferences structure
 */
export interface UserPreferences {
  notifications?: {
    email?: boolean;
    push?: boolean;
    newEvents?: boolean;
    eventReminders?: boolean;
  };
  defaultFilters?: EventFilters;
  favoriteCategories?: EventCategory[];
  favoriteVenues?: string[];
}

// ============================================================================
// USER INTERACTION API TYPES
// ============================================================================

/**
 * Create/update user event interaction
 */
export interface SetInteractionRequest {
  eventId: string;
  interactionType: InteractionType;
}

/**
 * Remove user event interaction
 */
export interface RemoveInteractionRequest {
  eventId: string;
  interactionType: InteractionType;
}

/**
 * Get user's events by interaction type
 */
export interface GetUserEventsRequest extends PaginationInput {
  interactionType: InteractionType;
  includeUpcoming?: boolean;
}

/**
 * User events response
 */
export type GetUserEventsResponse = PaginatedResponse<EventWithVenue>;

/**
 * Block event request
 */
export interface BlockEventRequest {
  eventId: string;
  reason?: string;
}

/**
 * Block recurring series request
 */
export interface BlockRecurringRequest {
  recurringSeriesId: string;
  reason?: string;
}

// ============================================================================
// SPOTIFY API TYPES
// ============================================================================

/**
 * Spotify OAuth callback data
 */
export interface SpotifyAuthCallback {
  code: string;
  state: string;
}

/**
 * Spotify authentication response
 */
export interface SpotifyAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  spotifyUserId: string;
}

/**
 * Sync Spotify artists request
 */
export interface SyncSpotifyArtistsRequest {
  term?: 'SHORT' | 'MEDIUM' | 'LONG';
}

/**
 * Spotify-based event recommendations
 */
export interface SpotifyRecommendationsRequest extends PaginationInput {
  term?: 'SHORT' | 'MEDIUM' | 'LONG';
  filters?: EventFilters;
}

/**
 * Spotify recommendations response
 */
export interface SpotifyRecommendationsResponse extends PaginatedResponse<EventListItem> {
  matchedArtists: Array<{
    artistName: string;
    eventCount: number;
  }>;
}

// ============================================================================
// ANALYTICS API TYPES
// ============================================================================

/**
 * Event statistics request
 */
export interface GetEventStatsRequest {
  startDate?: Date;
  endDate?: Date;
  category?: EventCategory[];
  venueId?: string;
}

/**
 * Event statistics response
 */
export interface EventStatsResponse {
  totalEvents: number;
  upcomingEvents: number;
  eventsByCategory: Record<EventCategory, number>;
  eventsByVenue: Array<{
    venueId: string;
    venueName: string;
    eventCount: number;
  }>;
  priceStats: {
    averagePrice: number;
    freeEventsPercentage: number;
  };
}

/**
 * Venue statistics response
 */
export interface VenueStatsResponse {
  totalVenues: number;
  venuesByType: Record<string, number>;
  topVenues: Array<{
    venueId: string;
    venueName: string;
    eventCount: number;
  }>;
}

// ============================================================================
// TRPC ROUTER TYPES
// ============================================================================

/**
 * tRPC context type (to be extended by implementation)
 */
export interface TRPCContext {
  user?: User;
  req?: {
    headers: Record<string, string | string[] | undefined>;
    ip?: string;
  };
}

/**
 * tRPC public context (no auth required)
 */
export interface TRPCPublicContext extends TRPCContext {
  user?: never;
}

/**
 * tRPC protected context (auth required)
 */
export interface TRPCProtectedContext extends TRPCContext {
  user: User;
}

/**
 * Event router input types (for tRPC)
 */
export interface EventRouterInputs {
  getEvents: GetEventsRequest;
  getEvent: GetEventRequest;
  searchEvents: SearchEventsRequest;
  createEvent: CreateEventRequest;
  updateEvent: UpdateEventRequest;
}

/**
 * Venue router input types (for tRPC)
 */
export interface VenueRouterInputs {
  getVenues: GetVenuesRequest;
  getVenue: GetVenueRequest;
  createVenue: CreateVenueRequest;
  updateVenue: UpdateVenueRequest;
}

/**
 * User router input types (for tRPC)
 */
export interface UserRouterInputs {
  register: RegisterUserRequest;
  login: LoginUserRequest;
  updateProfile: UpdateUserRequest;
  setInteraction: SetInteractionRequest;
  removeInteraction: RemoveInteractionRequest;
  getUserEvents: GetUserEventsRequest;
  blockEvent: BlockEventRequest;
  blockRecurring: BlockRecurringRequest;
}

/**
 * Spotify router input types (for tRPC)
 */
export interface SpotifyRouterInputs {
  authCallback: SpotifyAuthCallback;
  syncArtists: SyncSpotifyArtistsRequest;
  getRecommendations: SpotifyRecommendationsRequest;
}

// ============================================================================
// WEBSOCKET TYPES
// ============================================================================

/**
 * WebSocket event types
 */
export enum WebSocketEventType {
  NEW_EVENT = 'NEW_EVENT',
  EVENT_UPDATED = 'EVENT_UPDATED',
  EVENT_CANCELLED = 'EVENT_CANCELLED',
  SCRAPER_PROGRESS = 'SCRAPER_PROGRESS',
}

/**
 * WebSocket message structure
 */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketEventType;
  data: T;
  timestamp: Date;
}

/**
 * Scraper progress WebSocket payload
 */
export interface ScraperProgressPayload {
  sourceName: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  eventsFound: number;
  eventsNew: number;
  eventsUpdated: number;
  progress?: number;
}
