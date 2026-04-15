/**
 * Scraper agent types for AI-powered event extraction
 *
 * Types for raw event data, scraper configurations, and agent interactions
 */

import type { EventCategory } from './events';

// ============================================================================
// SCRAPER TYPES
// ============================================================================

/**
 * Scraper status enum matching Prisma schema
 */
export enum ScraperStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Scraper run metadata
 */
export interface ScraperRun {
  id: string;
  sourceName: string;
  sourceUrl: string | null;
  status: ScraperStatus;
  eventsFound: number;
  eventsNew: number;
  eventsUpdated: number;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  startedAt: Date;
  completedAt: Date | null;
}

/**
 * Create scraper run request
 */
export interface CreateScraperRunRequest {
  sourceName: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Update scraper run request
 */
export interface UpdateScraperRunRequest {
  id: string;
  status?: ScraperStatus;
  eventsFound?: number;
  eventsNew?: number;
  eventsUpdated?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  completedAt?: Date;
}

// ============================================================================
// RAW EVENT TYPES (from AI extraction)
// ============================================================================

/**
 * Raw event data extracted by AI agents before normalization
 */
export interface RawEvent {
  title: string;
  description?: string;
  startDateTime: string | Date;
  endDateTime?: string | Date;
  venue: RawVenue;
  category?: string[];
  tags?: string[];
  images?: string[];
  ticketUrl?: string;
  price?: RawPrice;
  ageRestriction?: string;
  isRecurring?: boolean;
  recurringPattern?: string;
  sourceUrl: string;
  sourceName: string;
  confidence?: number;
  rawHtml?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Raw venue data from scraping
 */
export interface RawVenue {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  website?: string;
  phone?: string;
  venueType?: string;
}

/**
 * Raw price data (flexible formats)
 */
export interface RawPrice {
  min?: number | string;
  max?: number | string;
  isFree?: boolean;
  currency?: string;
  description?: string;
}

// ============================================================================
// AI AGENT PROMPT TYPES
// ============================================================================

/**
 * Event extraction prompt context
 */
export interface EventExtractionContext {
  sourceUrl: string;
  sourceName: string;
  htmlContent: string;
  scrapedAt: Date;
  instructions?: string;
}

/**
 * AI agent response for event extraction
 */
export interface EventExtractionResponse {
  events: RawEvent[];
  totalFound: number;
  confidence: number;
  reasoning?: string;
  issues?: string[];
}

/**
 * Event normalization request
 */
export interface EventNormalizationRequest {
  rawEvent: RawEvent;
  existingVenues?: Array<{
    id: string;
    name: string;
    normalizedName: string;
    city?: string;
  }>;
}

/**
 * Normalized event ready for database insertion
 */
export interface NormalizedEvent {
  title: string;
  normalizedTitle: string;
  description?: string;
  startDateTime: Date;
  endDateTime?: Date;
  venueId: string;
  category: EventCategory[];
  tags: string[];
  images: string[];
  ticketUrl?: string;
  priceMin?: number;
  priceMax?: number;
  isFree: boolean;
  ageRestriction?: string;
  isRecurring: boolean;
  recurringPattern?: Record<string, unknown>;
  confidenceScore: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SCRAPER CONFIGURATION
// ============================================================================

/**
 * Scraper source configuration
 */
export interface ScraperSource {
  name: string;
  url: string;
  type: ScraperSourceType;
  enabled: boolean;
  schedule?: string; // Cron expression
  selectors?: ScraperSelectors;
  options?: ScraperOptions;
}

/**
 * Type of scraper source
 */
export enum ScraperSourceType {
  STATIC_HTML = 'STATIC_HTML',
  DYNAMIC_JS = 'DYNAMIC_JS',
  API = 'API',
  RSS = 'RSS',
  CALENDAR = 'CALENDAR',
}

/**
 * CSS/XPath selectors for HTML scraping
 */
export interface ScraperSelectors {
  eventList?: string;
  eventItem?: string;
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  venue?: string;
  price?: string;
  image?: string;
  link?: string;
}

/**
 * Scraper execution options
 */
export interface ScraperOptions {
  timeout?: number;
  retries?: number;
  rateLimit?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  waitForSelector?: string;
  scrollToBottom?: boolean;
  screenshot?: boolean;
  useProxy?: boolean;
}

// ============================================================================
// DEDUPLICATION TYPES
// ============================================================================

/**
 * Event similarity comparison
 */
export interface EventSimilarity {
  event1Id: string;
  event2Id: string;
  titleSimilarity: number;
  dateSimilarity: number;
  venueSimilarity: number;
  overallSimilarity: number;
  isDuplicate: boolean;
}

/**
 * Duplicate detection request
 */
export interface DetectDuplicatesRequest {
  eventId: string;
  threshold?: number;
  checkWindow?: {
    before: number; // hours
    after: number; // hours
  };
}

/**
 * Duplicate detection response
 */
export interface DetectDuplicatesResponse {
  eventId: string;
  potentialDuplicates: Array<{
    eventId: string;
    similarityScore: number;
    reasons: string[];
  }>;
}

/**
 * Merge events request
 */
export interface MergeEventsRequest {
  canonicalEventId: string;
  duplicateEventIds: string[];
  mergeStrategy?: MergeStrategy;
}

/**
 * Strategy for merging duplicate events
 */
export enum MergeStrategy {
  KEEP_CANONICAL = 'KEEP_CANONICAL',
  KEEP_MOST_COMPLETE = 'KEEP_MOST_COMPLETE',
  MERGE_ALL_FIELDS = 'MERGE_ALL_FIELDS',
}

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

/**
 * Vector embedding for semantic search
 */
export interface Embedding {
  vector: number[];
  model: string;
  dimensions: number;
}

/**
 * Generate embedding request
 */
export interface GenerateEmbeddingRequest {
  text: string;
  model?: string;
}

/**
 * Semantic search request
 */
export interface SemanticSearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: {
    category?: EventCategory[];
    venueId?: string;
    startDate?: Date;
    endDate?: Date;
  };
}

/**
 * Semantic search result
 */
export interface SemanticSearchResult {
  eventId: string;
  title: string;
  description?: string;
  similarity: number;
  matchReason?: string;
}

// ============================================================================
// JOB QUEUE TYPES
// ============================================================================

/**
 * Scraper job payload for BullMQ
 */
export interface ScraperJobPayload {
  scraperRunId: string;
  source: ScraperSource;
  options?: ScraperOptions;
}

/**
 * Event processing job payload
 */
export interface EventProcessingJobPayload {
  eventId: string;
  action: 'GENERATE_EMBEDDING' | 'DETECT_DUPLICATES' | 'NORMALIZE';
  options?: Record<string, unknown>;
}

/**
 * Job progress update
 */
export interface JobProgress {
  jobId: string;
  progress: number;
  status: string;
  message?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// BATCH PROCESSING TYPES
// ============================================================================

/**
 * Batch scrape request
 */
export interface BatchScrapeRequest {
  sources: string[];
  options?: ScraperOptions;
  parallel?: boolean;
  maxConcurrent?: number;
}

/**
 * Batch scrape response
 */
export interface BatchScrapeResponse {
  scraperRuns: ScraperRun[];
  totalEvents: number;
  totalNew: number;
  totalUpdated: number;
  errors: Array<{
    sourceName: string;
    error: string;
  }>;
}

/**
 * Batch event import request
 */
export interface BatchEventImportRequest {
  events: RawEvent[];
  sourceName: string;
  options?: {
    detectDuplicates?: boolean;
    generateEmbeddings?: boolean;
    skipValidation?: boolean;
  };
}

/**
 * Batch event import response
 */
export interface BatchEventImportResponse {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{
    eventTitle: string;
    error: string;
  }>;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Event validation result
 */
export interface EventValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

/**
 * Venue validation result
 */
export interface VenueValidationResult {
  valid: boolean;
  existingVenueId?: string;
  similarity?: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
