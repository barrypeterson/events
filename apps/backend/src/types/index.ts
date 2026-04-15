import { Event, Venue, User, EventCategory, EventStatus } from '@slo-events/database';

/**
 * API Response Types
 */

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SearchResult<T> {
  item: T;
  score: number;
  distance?: number;
}

/**
 * Event Types
 */

export interface EventWithVenue extends Event {
  venue: Venue;
}

export interface EventCreateInput {
  title: string;
  description?: string;
  startDateTime: Date;
  endDateTime?: Date;
  timezone?: string;
  venueId: string;
  category?: EventCategory[];
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

export interface EventUpdateInput {
  title?: string;
  description?: string;
  startDateTime?: Date;
  endDateTime?: Date;
  timezone?: string;
  venueId?: string;
  category?: EventCategory[];
  tags?: string[];
  images?: string[];
  ticketUrl?: string;
  priceMin?: number;
  priceMax?: number;
  isFree?: boolean;
  ageRestriction?: string;
  status?: EventStatus;
  metadata?: Record<string, unknown>;
}

export interface EventSearchParams {
  query?: string;
  category?: EventCategory[];
  startDate?: Date;
  endDate?: Date;
  venueId?: string;
  isFree?: boolean;
  showPastEvents?: boolean;
  showRecurringEvents?: boolean;
  limit?: number;
  offset?: number;
}

export interface SimilarEventParams {
  eventId: string;
  limit?: number;
  threshold?: number;
}

/**
 * Venue Types
 */

export interface VenueCreateInput {
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

export interface VenueUpdateInput {
  name?: string;
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
 * User Types
 */

export interface UserCreateInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface UserUpdateInput {
  firstName?: string;
  lastName?: string;
  preferences?: Record<string, unknown>;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

/**
 * Deduplication Types
 */

export interface DuplicateEvent {
  event: EventWithVenue;
  similarityScore: number;
}

export interface DeduplicationResult {
  canonicalEvent: EventWithVenue;
  duplicates: DuplicateEvent[];
  merged: boolean;
}

/**
 * Service Response Types
 */

export interface ServiceSuccess<T = void> {
  success: true;
  data: T;
}

export interface ServiceError {
  success: false;
  error: string;
  code?: string;
}

export type ServiceResponse<T = void> = ServiceSuccess<T> | ServiceError;

/**
 * Embedding Types
 */

export interface EmbeddingData {
  text: string;
  embedding: number[];
}

/**
 * Health Check Types
 */

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  services: {
    database: boolean;
    redis: boolean;
  };
  version: string;
  uptime: number;
}
