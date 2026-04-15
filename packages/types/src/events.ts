/**
 * Event-related types for SLO Events Platform
 *
 * These types match the Prisma schema and provide type-safe interfaces
 * for working with events, venues, and related entities.
 */

import type { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Event category classifications
 */
export enum EventCategory {
  MUSIC = 'MUSIC',
  COMEDY = 'COMEDY',
  THEATER = 'THEATER',
  SPORTS = 'SPORTS',
  FOOD_WINE = 'FOOD_WINE',
  ARTS = 'ARTS',
  COMMUNITY = 'COMMUNITY',
  FAMILY = 'FAMILY',
  OUTDOOR = 'OUTDOOR',
  FITNESS = 'FITNESS',
  EDUCATION = 'EDUCATION',
  BUSINESS = 'BUSINESS',
  OTHER = 'OTHER',
}

/**
 * Event lifecycle status
 */
export enum EventStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  POSTPONED = 'POSTPONED',
  MERGED = 'MERGED',
  DELETED = 'DELETED',
}

/**
 * User interaction types with events
 */
export enum InteractionType {
  INTERESTED = 'INTERESTED',
  GOING = 'GOING',
  NOT_INTERESTED = 'NOT_INTERESTED',
  SAVED = 'SAVED',
  SHARED = 'SHARED',
}

/**
 * Spotify listening time ranges
 */
export enum SpotifyTerm {
  SHORT = 'SHORT',
  MEDIUM = 'MEDIUM',
  LONG = 'LONG',
}

// ============================================================================
// VENUE TYPES
// ============================================================================

/**
 * Venue entity matching Prisma schema
 */
export interface Venue {
  id: string;
  name: string;
  normalizedName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  latitude: Decimal | null;
  longitude: Decimal | null;
  website: string | null;
  phone: string | null;
  venueType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Venue with event count for display purposes
 */
export interface VenueWithCount extends Venue {
  eventCount: number;
}

/**
 * Simplified venue for dropdown/selection
 */
export interface VenueOption {
  id: string;
  name: string;
  city: string | null;
  venueType: string | null;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Full event entity matching Prisma schema
 */
export interface Event {
  id: string;
  title: string;
  normalizedTitle: string;
  description: string | null;
  startDateTime: Date;
  endDateTime: Date | null;
  timezone: string;
  venueId: string;
  category: EventCategory[];
  tags: string[];
  images: string[];
  ticketUrl: string | null;
  priceMin: Decimal | null;
  priceMax: Decimal | null;
  isFree: boolean;
  ageRestriction: string | null;
  isRecurring: boolean;
  recurringPattern: Record<string, unknown> | null;
  recurringSeriesId: string | null;
  confidenceScore: Decimal;
  status: EventStatus;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Event with venue relation populated
 */
export interface EventWithVenue extends Event {
  venue: Venue;
}

/**
 * Event with all relations for detailed views
 */
export interface EventWithRelations extends EventWithVenue {
  sources: EventSource[];
  userInteraction?: UserEventInteraction;
}

/**
 * Simplified event for list displays
 */
export interface EventListItem {
  id: string;
  title: string;
  startDateTime: Date;
  endDateTime: Date | null;
  category: EventCategory[];
  images: string[];
  isFree: boolean;
  priceMin: Decimal | null;
  priceMax: Decimal | null;
  venue: {
    id: string;
    name: string;
    city: string | null;
  };
}

// ============================================================================
// EVENT SOURCE TYPES
// ============================================================================

/**
 * Event source tracking for deduplication
 */
export interface EventSource {
  id: string;
  eventId: string;
  sourceUrl: string;
  sourceName: string;
  scrapedAt: Date;
  rawData: Record<string, unknown> | null;
}

// ============================================================================
// EVENT DUPLICATE TYPES
// ============================================================================

/**
 * Event duplicate relationship
 */
export interface EventDuplicate {
  id: string;
  canonicalEventId: string;
  duplicateEventId: string;
  similarityScore: Decimal;
  mergedAt: Date;
}

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * User entity (sensitive fields omitted from public types)
 */
export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  spotifyUserId: string | null;
  preferences: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

/**
 * User event interaction
 */
export interface UserEventInteraction {
  id: string;
  userId: string;
  eventId: string;
  interactionType: InteractionType;
  createdAt: Date;
}

/**
 * User blocked event
 */
export interface UserBlockedEvent {
  userId: string;
  eventId: string;
  blockedAt: Date;
  reason: string | null;
}

/**
 * User blocked recurring pattern
 */
export interface UserBlockedRecurring {
  userId: string;
  recurringPatternId: string;
  blockedAt: Date;
  reason: string | null;
}

/**
 * User Spotify artist preference
 */
export interface UserSpotifyArtist {
  id: string;
  userId: string;
  artistName: string;
  spotifyArtistId: string;
  playCount: number;
  term: SpotifyTerm;
  lastUpdated: Date;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Event filtering options for queries
 */
export interface EventFilters {
  category?: EventCategory[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  venueId?: string;
  isFree?: boolean;
  priceMax?: number;
  tags?: string[];
  status?: EventStatus;
  isRecurring?: boolean;
}

/**
 * Venue filtering options
 */
export interface VenueFilters {
  city?: string;
  venueType?: string;
  search?: string;
}

/**
 * Sorting options for event queries
 */
export enum EventSortBy {
  START_DATE = 'startDateTime',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  TITLE = 'title',
  PRICE = 'priceMin',
  RELEVANCE = 'relevance',
}

/**
 * Sort direction
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Complete event query options
 */
export interface EventQueryOptions {
  filters?: EventFilters;
  sortBy?: EventSortBy;
  sortOrder?: SortOrder;
  limit?: number;
  cursor?: string;
}

// ============================================================================
// RECURRING EVENT TYPES
// ============================================================================

/**
 * Recurring event pattern structure
 */
export interface RecurringPattern {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: Date;
  exceptions?: Date[];
}

// ============================================================================
// PRICE RANGE TYPES
// ============================================================================

/**
 * Price range for filtering
 */
export interface PriceRange {
  min: number;
  max: number;
}

/**
 * Price statistics for events
 */
export interface PriceStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  freeCount: number;
  paidCount: number;
}

// ============================================================================
// METADATA TYPES
// ============================================================================

/**
 * Event metadata structure (flexible JSON field)
 */
export interface EventMetadata {
  sourceQuality?: number;
  lastVerified?: Date;
  externalIds?: Record<string, string>;
  accessibility?: {
    wheelchairAccessible?: boolean;
    assistiveListening?: boolean;
    closedCaptioning?: boolean;
  };
  [key: string]: unknown;
}

/**
 * Venue metadata structure (flexible JSON field)
 */
export interface VenueMetadata {
  capacity?: number;
  parkingInfo?: string;
  publicTransport?: string[];
  amenities?: string[];
  accessibility?: {
    wheelchairAccessible?: boolean;
    elevator?: boolean;
    accessibleParking?: boolean;
  };
  [key: string]: unknown;
}
