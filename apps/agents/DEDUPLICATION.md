# Event Deduplication Logic

## Overview

The event deduplication system prevents duplicate events from cluttering the database and user experience. Events are deduplicated during scraping using a multi-stage matching strategy that balances precision (avoiding false positives) with recall (catching true duplicates).

**Location:** `/apps/agents/src/lib/deduplicator.ts`

## ⚠️ IMPORTANT: Venue Deduplication First!

Before running event deduplication, **always deduplicate venues first**. Duplicate venues cause unnecessary cross-venue matching complexity and can lead to missed duplicates.

**Recommended workflow:**
1. Find and merge duplicate venues (see [Venue Deduplication](#venue-deduplication) section)
2. Then run event deduplication
3. This simplifies event matching and improves accuracy

**Prevention:** The venue matching logic during scraping has been enhanced to check address and coordinates, preventing most duplicate venues from being created in the first place.

---

## Venue Matching During Scraping

**Location:** `/apps/agents/src/lib/venue-matcher.ts`

When scrapers normalize events, they call `matchOrCreateVenue()` which uses a 4-step process to find existing venues:

### Step 1: Exact Normalized Name
```sql
WHERE normalizedName = {normalizedName} AND city = {city}
```

**Example:** "The Mark SLO" normalizes to "the mark slo"

### Step 2: Same Address
```sql
WHERE address = {address} AND city = {city}
```

**Example:** "1 Grand Ave" in San Luis Obispo
**Prevents:** Creating "Cal Poly Arts" when "Performing Arts Center SLO" already exists at that address

### Step 3: Nearby Coordinates (< 50 meters)
```sql
WHERE (distance via Haversine formula) < 50 meters
```

**Example:** Two venues at (35.3051, -120.6597)
**Prevents:** Creating venue when one exists at exact same GPS coordinates

### Step 4: Fuzzy Name Match (85% similarity)
```sql
Levenshtein similarity > 0.85
```

**Example:**
- "SLO Brew Rock" matches "SLO Brew"
- "Performing Arts Center SLO" matches "PAC SLO"

### If No Match: Create New Venue

Only if ALL 4 checks fail will a new venue be created. The new venue includes any provided address/coordinates to help future matching.

### Current State & Limitations

**Current:** Most scrapers only extract venue names (not addresses/coordinates), so only Steps 1 and 4 (name matching) are used.

**Future Enhancement:** Claude could extract addresses from event pages, which would enable address/coordinate matching during scraping.

**Current Workflow:**
1. Scraper extracts venue name
2. Venue matcher finds/creates by name (Steps 1 & 4 only)
3. Venue enricher adds address/coordinates later
4. **Manual step:** Run `find-duplicate-venues` periodically to catch duplicates

**Recommended Practice:**
- After adding new scrapers, run `find-duplicate-venues`
- Merge any duplicates found
- This prevents duplicate venue accumulation over time

---

## Core Principles

### 1. **Venue-First Matching**
Events at different physical locations are NEVER duplicates, even with identical titles.

**Why:** The same artist can perform at multiple venues on the same night. Example: "Tribute Band XYZ" playing at both Fremont Theater and SLO Brew on the same evening are two separate events.

**Exception:** Cross-venue matching for venues at the SAME physical location (e.g., "Cal Poly Arts" and "Performing Arts Center SLO" both at 1 Grand Ave).

### 2. **Time Proximity Required**
Events must occur close together in time to be considered duplicates.

**Why:** Prevents matching recurring events (e.g., "Trivia Night" on Tuesday vs Thursday, or "Santa Visits" on Dec 5 vs Dec 6).

### 3. **Title Flexibility**
Different scrapers may format titles differently for the same event.

**Examples:**
- "Sue & Jordan" vs "Sue & Jordan Live Music"
- "Sweet Spots Dance Party" vs "Sweet Spots - Free Afternoon Dance Party"
- "Morgan Freeman's Symphonic Blues Experience" (identical across sources)

---

## Deduplication Pipeline

The system uses a **5-step cascade**, checking each condition in order until a match is found:

### Step 1: Exact Time Match (Same Venue)
**Criteria:**
- Same `venue_id`
- Start times within **1 minute** of each other
- Status: `ACTIVE`

**Business Logic:**
Two events at the same venue starting at exactly the same time are almost certainly duplicates, regardless of title differences.

**Example:**
```
Event A: "Sue & Jordan" at Siren Morro Bay, 7:00 PM
Event B: "Sue & Jordan Live Music" at Siren Morro Bay, 7:00 PM
→ MATCH (same venue, same time, even though titles differ)
```

**Implementation:**
```sql
WHERE venue_id = {venueId}
AND ABS(EXTRACT(EPOCH FROM (start_datetime - {startDateTime})) / 60) <= 1
AND status = 'ACTIVE'
```

**Action:** Update existing event, add new source

---

### Step 2: Cross-Venue Match (Same Location)
**Criteria:**
- **Different** `venue_id`
- Title similarity > **95%**
- Start times within **1 minute**
- Venues within **100 meters** of each other
- Status: `ACTIVE`

**Business Logic:**
Some events are listed under different venue names for the same physical location. "Cal Poly Arts" presents shows at "Performing Arts Center SLO" - they're the same building with different organizational names.

**Example:**
```
Event A: "Morgan Freeman's Symphonic Blues Experience" at Cal Poly Arts (1 Grand Ave)
Event B: "Morgan Freeman's Symphonic Blues Experience" at PAC SLO (1 Grand Ave)
Distance: 0 meters
→ MATCH (identical title, same time, same physical location)
```

**Why 100 meters:**
- Same building: 0m
- Adjacent venues: 10-50m
- Different blocks: > 100m

**Why 95% title similarity:**
Prevents matching different events at nearby venues. With cross-venue matching, we need very high title similarity to ensure it's actually the same event.

**Implementation:**
```sql
WHERE e.venue_id != {venueId}
AND similarity(e.normalized_title, {normalizedTitle}) > 0.95
AND ABS(EXTRACT(EPOCH FROM (e.start_datetime - {startDateTime})) / 60) <= 1
AND (distance calculation using Haversine formula) < 100
AND status = 'ACTIVE'
```

**Action:** Update existing event, add new source

**Note:** Uses Haversine formula with LEAST/GREATEST to handle identical coordinates:
```sql
6371000 * acos(
  LEAST(1.0, GREATEST(-1.0,
    cos(radians(lat1)) * cos(radians(lat2)) *
    cos(radians(lon2) - radians(lon1)) +
    sin(radians(lat1)) * sin(radians(lat2))
  ))
)
```

---

### Step 3: Core Words + Time Proximity (Same Venue)
**Criteria:**
- Same `venue_id`
- Within **8 hours** of each other
- Share 2+ core words (significant words from title)
- Status: `ACTIVE`

**Business Logic:**
Events with the same core identity may have different promotional titles. One scraper might capture "Sweet Spots Dance Party" while another gets "Sweet Spots - Free Afternoon Dance Party". The core event ("Sweet Spots" performing on that day) is the same.

**Stop Words (excluded from core matching):**
`at, the, and, with, live, night, show, event, concert, series, music, free, afternoon, evening, morning`

**Core Word Extraction:**
```javascript
const coreWords = event.normalizedTitle
  .replace(/[^a-z0-9\s]/g, '')
  .split(/\s+/)
  .filter(w => w.length > 3 && !stopWords.has(w))
  .slice(0, 3); // First 3 significant words
```

**Example:**
```
"Sweet Spots - Free Afternoon Dance Party"
→ Core words: ["sweet", "spots", "dance"]
→ Pattern: sweet.*spots.*dance

Matches:
- "Sweet Spots Dance Party" ✓
- "Sweet Spots" ✓
- "Dance Party Sweet Spots" ✓
```

**Why 8 hours:**
- Same-day events with different time info: ✓ (e.g., 2-5 PM vs 5 PM)
- Next-day recurring events: ✗ (e.g., "Santa Visits" Dec 5 7PM vs Dec 6 2PM = 19 hours)

**Implementation:**
```sql
WHERE venue_id = {venueId}
AND ABS(EXTRACT(EPOCH FROM (start_datetime - {startDateTime})) / 3600) <= 8
AND normalized_title ~ {coreWordPattern}  -- PostgreSQL regex
AND status = 'ACTIVE'
```

**Action:** Update existing event, add new source

---

### Step 4: Fuzzy Title Match (Same Venue)
**Criteria:**
- Same `venue_id`
- Within **6 hours** of each other
- Title similarity > **70%** (PostgreSQL `pg_trgm` similarity)
- Status: `ACTIVE`

**Business Logic:**
Traditional fuzzy string matching for events with reasonably similar titles at the same venue on the same day.

**Why 70% threshold:**
- Catches legitimate variations: "Artist Name Concert" vs "Artist Name Live"
- Avoids false positives: Different events with some common words

**Why 6 hours:**
Tighter than core words matching because we have better title similarity signal.

**Implementation:**
```sql
WHERE venue_id = {venueId}
AND ABS(EXTRACT(EPOCH FROM (start_datetime - {startDateTime})) / 3600) < 6
AND similarity(normalized_title, {normalizedTitle}) > 0.7
AND status = 'ACTIVE'
```

**Action:** Update existing event, add new source

---

### Step 5: Vector Similarity (AI Semantic Matching)
**Criteria:**
- Same `venue_id`
- Within **48 hours**
- Semantic similarity > **85%** (pgvector cosine similarity)
- Status: `ACTIVE`

**Business Logic:**
Final fallback using AI-generated embeddings to catch semantically similar events that might have very different wording.

**Why same venue only:**
Vector matching is powerful but can have false positives. Restricting to same venue keeps it safe.

**Why 85% threshold:**
High bar for auto-merge. Lower similarity scores should be manually reviewed.

**Implementation:**
```sql
SELECT id, title, 1 - (embedding <=> {embedding}::vector) as similarity
FROM events
WHERE venue_id = {venueId}
AND start_datetime BETWEEN NOW() - INTERVAL '48 hours' AND NOW() + INTERVAL '48 hours'
AND status = 'ACTIVE'
ORDER BY embedding <=> {embedding}::vector
```

**Action:** Auto-merge if similarity ≥ 0.85

---

## Test Cases (Required for Regression Prevention)

### ✓ Should Match (True Positives)

#### Case 1: Same Venue, Exact Time, Different Titles
```
Event A: "Sue & Jordan" at Siren Morro Bay, Nov 15 @ 7:00 PM
Event B: "Sue & Jordan Live Music" at Siren Morro Bay, Nov 15 @ 7:00 PM
Expected: MATCH via Step 1 (exact time)
```

#### Case 2: Cross-Venue, Same Location
```
Event A: "Morgan Freeman's Symphonic Blues Experience" at Cal Poly Arts, Nov 16 @ 7:00 PM
Event B: "Morgan Freeman's Symphonic Blues Experience" at PAC SLO, Nov 16 @ 7:00 PM
Cal Poly Arts address: 1 Grand Ave (35.3051, -120.6597)
PAC SLO address: 1 Grand Ave (35.3051, -120.6597)
Distance: 0 meters
Expected: MATCH via Step 2 (cross-venue)
```

#### Case 3: Same Venue, Core Words, Time Overlap
```
Event A: "Sweet Spots Dance Party" at Siren Morro Bay, Nov 15 @ 5:00 PM
Event B: "Sweet Spots - Free Afternoon Dance Party" at Siren Morro Bay, Nov 15 @ 2-5 PM
Time difference: 3 hours
Core words: [sweet, spots, dance]
Expected: MATCH via Step 3 (core words)
```

#### Case 4: Same Venue, High Title Similarity
```
Event A: "Acoustic Showcase with Local Artists" at The Mark, Nov 20 @ 8:00 PM
Event B: "Acoustic Showcase - Local Artists" at The Mark, Nov 20 @ 8:30 PM
Title similarity: 85%
Time difference: 0.5 hours
Expected: MATCH via Step 4 (fuzzy title)
```

### ✗ Should NOT Match (True Negatives)

#### Case 5: Different Venues, Same Title
```
Event A: "Tribute Band XYZ" at Fremont Theater, Nov 15 @ 7:00 PM
Event B: "Tribute Band XYZ" at SLO Brew, Nov 15 @ 7:00 PM
Expected: NO MATCH (different venues, no cross-venue criteria met)
```

#### Case 6: Same Venue, Recurring Event
```
Event A: "Santa Visits BarrelHouse" at BarrelHouse, Dec 5 @ 7:00 PM
Event B: "Santa Visits BarrelHouse" at BarrelHouse, Dec 6 @ 2:00 PM
Time difference: 19 hours
Expected: NO MATCH (exceeds 8-hour window for core words)
```

#### Case 7: Same Venue, Different Events, Same Day
```
Event A: "Artist A" at The Siren, Nov 15 @ 6:00 PM
Event B: "Artist B" at The Siren, Nov 15 @ 9:00 PM
Core words don't match, title similarity < 70%
Expected: NO MATCH (different artists, no title similarity)
```

#### Case 8: Cross-Venue, Different Locations
```
Event A: "Local Band" at Downtown SLO Venue A, Nov 15 @ 7:00 PM
Event B: "Local Band" at Venue B (500m away), Nov 15 @ 7:00 PM
Distance: 500 meters
Expected: NO MATCH (exceeds 100m distance threshold)
```

---

## Known Edge Cases

### Edge Case 1: Event Brands vs Recurring Events
**Problem:** "Bingo Loco" contains "bingo" but is a touring event brand, not a weekly bingo night.

**Solution:** Exclusion list in recurring keyword detector:
```javascript
const excludedBrands = ['bingo loco', 'is it friday yet', 'friday night lights'];
```

### Edge Case 2: Multiple Venue Names for Same Location
**Problem:** Events get listed under different names:
- "Cal Poly Arts" (presenting organization)
- "Performing Arts Center SLO" (physical venue)
- Both at 1 Grand Ave

**Solution:** Cross-venue matching with geospatial distance check.

### Edge Case 3: Time Range vs Point Time
**Problem:**
- Event A: "Sweet Spots" at 5:00 PM (point time)
- Event B: "Sweet Spots - Free Afternoon Dance Party" 2:00-5:00 PM (range)

Event A's start time matches Event B's end time.

**Solution:** Step 3 (core words) with 8-hour window catches these without requiring exact time match.

### Edge Case 4: Same Source, Different Dates
**Problem:** When moving event sources during merge, unique constraint fails if both events came from same scraper.

**Solution:** Use `upsert` instead of `create` for event sources:
```typescript
await prisma.eventSource.upsert({
  where: { eventId_sourceUrl: { eventId, sourceUrl } },
  create: { ... },
  update: { scrapedAt: new Date() }
});
```

---

## Database Schema

### Event Source Unique Constraint
```prisma
model EventSource {
  eventId   String
  sourceUrl String

  @@unique([eventId, sourceUrl])
}
```

**Purpose:** Prevents duplicate source records when re-scraping.

### Event Duplicate Tracking
```prisma
model EventDuplicate {
  canonicalEventId String
  duplicateEventId String
  similarityScore  Decimal
  mergedAt         DateTime

  @@unique([canonicalEventId, duplicateEventId])
}
```

**Purpose:** Tracks which events have been merged for auditing and potential rollback.

---

## Performance Considerations

### Why Not Just Vector Similarity?
Vector similarity is powerful but:
1. **Expensive:** Requires OpenAI API call to generate embedding
2. **Slower:** Database vector search is slower than simple SQL
3. **Less Precise:** Can have false positives across venues

**Solution:** Use fast SQL checks (exact time, fuzzy title) first, vector similarity as fallback.

### Why Multiple Queries Instead of One?
**Early Exit Pattern:**
- Step 1 (exact time): Fastest, catches ~40% of duplicates
- Step 2 (cross-venue): Only runs if Step 1 fails
- Step 3-5: Progressively more expensive

**Benefit:** Most duplicates are caught by fast checks. Expensive checks only run when needed.

---

## Configuration Values

| Parameter | Value | Reasoning | Test Case Reference |
|-----------|-------|-----------|---------------------|
| Exact time window | 1 minute | Same event, minor scraper time diff | Case 1 |
| Cross-venue distance | 100 meters | Same building or very close | Case 2 |
| Cross-venue title similarity | 95% | High bar for different venues | Case 2 |
| Core words time window | 8 hours | Same day, not recurring | Case 3, Case 6 |
| Core words count | 2+ words | Meaningful matching | Case 3 |
| Fuzzy title similarity | 70% | Balance precision/recall | Case 4 |
| Fuzzy time window | 6 hours | Same evening events | Case 4 |
| Vector similarity threshold | 85% | Auto-merge confidence | - |
| Vector time window | 48 hours | Multi-day events | - |

---

## Common Failure Modes

### Failure Mode 1: Timezone Issues
**Symptom:** Events on same date appear as different dates in queries.

**Cause:** PostgreSQL `DATE()` function interprets timestamps differently with/without timezone conversion.

**Solution:** Use time difference calculations instead of `DATE()` comparisons:
```sql
-- BAD: Can fail with timezone confusion
DATE(start_datetime) = DATE({comparison_datetime})

-- GOOD: Direct time comparison
ABS(EXTRACT(EPOCH FROM (start_datetime - {comparison_datetime})) / 3600) <= 8
```

**Fix Applied:** Nov 8, 2025 - Removed `AT TIME ZONE` conversions, use direct timestamp comparisons

### Failure Mode 2: Cross-Venue Filtering After Ordering
**Symptom:** Cross-venue query returns wrong event (oldest at different venue instead of actual match).

**Cause:** Distance filter was in `HAVING` or checked post-query instead of in `WHERE` clause.

**Solution:** Move distance check into `WHERE` clause to filter before `ORDER BY ... LIMIT 1`.

**Fix Applied:** Nov 8, 2025 - Moved distance calculation into WHERE clause

### Failure Mode 3: Stop Words Too Aggressive
**Symptom:** Core words matching fails because important words filtered out.

**Example:** "Sweet Spots Dance Party" - if "dance" and "party" are stop words, only "sweet spots" remains.

**Solution:** Carefully curated stop word list. Only truly generic words like "at", "the", "and", "with", "live", "music", "show", "event".

**Don't include as stop words:** Genre-specific words (dance, rock, jazz), event-specific words (party, festival), unless testing shows they cause false positives.

---

## Manual Deduplication Tools

### Find Duplicates (Dry Run)
```bash
pnpm --filter @slo-events/agents find-dupes
```

Shows duplicate groups without making changes.

### Merge Duplicates
```bash
pnpm --filter @slo-events/agents merge-dupes
```

Automatically merges detected duplicates.

### Delete Venue Events (Cleanup)
```bash
pnpm --filter @slo-events/agents tsx src/scripts/delete-venue-events.ts "Venue Name" --confirm
```

Removes all events from a venue (useful before re-scraping with corrected data).

---

## Testing Deduplication Changes

### Before Making Changes

1. **Document the problem:**
   - Which events should match but don't?
   - Which events shouldn't match but do?

2. **Run current state test:**
   ```bash
   pnpm --filter @slo-events/agents find-dupes > before.txt
   ```

3. **Test with specific events:**
   ```bash
   # Update event IDs in src/scripts/analyze-events.ts
   npx tsx src/scripts/analyze-events.ts
   ```

### After Making Changes

1. **Verify fix works:**
   ```bash
   npx tsx src/scripts/analyze-events.ts
   ```

2. **Check for regressions:**
   ```bash
   pnpm --filter @slo-events/agents find-dupes > after.txt
   diff before.txt after.txt
   ```

3. **Add test case to this document**

### Writing Tests (TODO)

Consider adding automated tests:
```typescript
describe('Deduplication', () => {
  it('should match same venue exact time', () => {
    // Test Case 1
  });

  it('should match cross-venue same location', () => {
    // Test Case 2
  });

  it('should NOT match different venues far apart', () => {
    // Test Case 5
  });
});
```

---

## Troubleshooting

### Events Not Deduplicating?

1. **Check venue IDs:**
   ```bash
   npx tsx src/scripts/check-venues.ts
   ```

2. **Test cross-venue logic:**
   ```bash
   npx tsx src/scripts/test-cross-venue.ts
   ```

3. **Test core words extraction:**
   ```bash
   npx tsx src/scripts/test-core-words.ts
   ```

4. **Check time difference:**
   ```bash
   npx tsx src/scripts/analyze-events.ts
   ```

### False Positives?

1. **Check which step matched:**
   Look at logs: `Found [step] match for...`

2. **Verify time window:**
   Are they actually close in time or is it a recurring event?

3. **Check venue distance:**
   Are they at the same physical location or truly different venues?

4. **Adjust thresholds:**
   Consider if the threshold for that step needs tuning.

---

## Change Log

### Nov 8, 2025 (PM)
- **Added:** Venue deduplication system (find and merge duplicate venues)
- **Enhanced:** Venue matcher to check address and coordinates (4-step matching)
- **Added:** Scripts: `find-duplicate-venues.ts`, `merge-venues.ts`
- **Fixed:** Event source upsert to prevent constraint violations on re-scraping
- **Documented:** Complete deduplication strategy with test cases

### Nov 8, 2025 (AM)
- **Fixed:** Timezone issues in date comparisons (removed `AT TIME ZONE`, use time diffs)
- **Fixed:** Cross-venue distance filtering (moved to WHERE clause)
- **Fixed:** Duplicate source errors (changed to upsert)
- **Added:** Core words + time proximity matching (Step 3)
- **Added:** Cross-venue matching for same physical location (Step 2)
- **Increased:** Fuzzy title threshold from 50% → 70%
- **Added:** Time proximity requirement to prevent recurring event matches

### Nov 7, 2025
- **Initial:** Multi-stage deduplication system created
- **Added:** Venue-first matching principle
- **Added:** Vector similarity with pgvector

---

## Future Improvements

### Potential Enhancements

1. **Venue Aliases:** Database table mapping venue name variations to canonical venue
   - "Cal Poly Arts" → canonical: "Performing Arts Center SLO"
   - Would simplify cross-venue logic

2. **Recurring Event Series:** Explicit series tracking
   - Link "Santa Visits Dec 5" and "Santa Visits Dec 6" as series instances
   - Prevents treating them as duplicates while acknowledging relationship

3. **Confidence Scoring:** Instead of binary match/no-match, score each event pair
   - 0.9-1.0: Auto-merge
   - 0.7-0.9: Flag for review
   - < 0.7: Separate events

4. **Machine Learning:** Train model on confirmed duplicate/non-duplicate pairs
   - Learn venue-specific patterns
   - Improve over time with user feedback

---

## Venue Deduplication

### Why Deduplicate Venues?

Duplicate venues create cascading problems:
- Events at the same physical location appear as separate events
- Requires complex cross-venue matching logic for events
- User sees duplicate events that are actually the same show
- Harder to browse events by venue

**Example Problem:**
```
Venue A: "Cal Poly Arts" (31 events)
Venue B: "Performing Arts Center SLO" (20 events)
Venue C: "Performing Arts Center San Luis Obispo" (0 events)

All three are at: 1 Grand Ave, San Luis Obispo
Same coordinates: 35.3051, -120.6597

Result: 51 events split across 3 venue records
Issue: "Morgan Freeman" show appears twice (once under each venue)
```

### Detection Criteria

Venues are considered duplicates if they match **ANY** of:

1. **Exact address match**
   ```
   address = "1 Grand Ave" AND city = "San Luis Obispo"
   ```

2. **Coordinates within 50 meters**
   - Same building: 0-10m
   - Adjacent buildings: 10-50m
   - Different blocks: > 50m (not duplicates)

**Why 50 meters:** Tighter than event cross-venue (100m) because venues should be exact matches.

### Merge Strategy

**Keep:** Venue with most events OR best data quality
**Merge:** Other venues into canonical

**Merge Process:**
1. Move all events to canonical venue (`UPDATE events SET venue_id = canonical`)
2. Merge venue metadata (keep best data from both)
3. Soft-delete duplicate venue (add metadata: `{status: 'MERGED', mergedInto: canonical}`)

**Data Preservation:**
- All events preserved and moved to canonical
- Duplicate venue kept for audit trail (soft-delete)
- Metadata merged (canonical fields preferred, duplicates fill gaps)

### Tools

**Find duplicate venues:**
```bash
pnpm --filter @slo-events/agents find-duplicate-venues
```

**Merge venues:**
```bash
pnpm --filter @slo-events/agents tsx src/scripts/merge-venues.ts <canonical-id> <duplicate-id> --confirm
```

### Current Duplicates Found

Based on latest scan (Nov 8, 2025):

**Group 1: PAC SLO (3 venues, 51 events)**
- Cal Poly Arts (31 events) ← Suggested canonical
- Performing Arts Center SLO (20 events)
- Performing Arts Center San Luis Obispo (0 events)

**Group 2: SLO Brew (2 venues, 29 events)**
- SLO Brew Rock (29 events) ← Suggested canonical
- SLO Brew Rock duplicate (0 events)

**Recommendation:** Merge these venues first, then re-run event deduplication. The Morgan Freeman duplicates will automatically resolve.

### After Venue Merge

Once venues are merged:
1. Events automatically have correct venue_id
2. Cross-venue matching becomes unnecessary for those venues
3. Event deduplication becomes simpler and faster
4. Users see cleaner venue listings

---

## References

- **Deduplication Service:** `/apps/backend/src/services/deduplication.service.ts`
- **Search Service:** `/apps/backend/src/services/search.service.ts`
- **Base Scraper:** `/apps/agents/src/scrapers/base.ts`
- **Event Model:** `/packages/database/prisma/schema.prisma`
- **Venue Scripts:** `/apps/agents/src/scripts/find-duplicate-venues.ts`, `/apps/agents/src/scripts/merge-venues.ts`
