# Recent Updates - October 20, 2025

## Summary

Major improvements to the event scraping system, time handling, search functionality, and venue coverage.

---

## 🎯 Key Improvements

### 1. Siren Custom Scraper Fixes
**Problem**: Events had incorrect dates and times
**Solution**:
- ✅ Fixed date parsing for events spanning year boundaries (Jan/Feb 2026 events now correctly dated)
- ✅ Added multi-page pagination support (now scrapes all event pages)
- ✅ Implemented time range extraction (start + end times: "8:00 PM - 10:30 PM")
- ✅ Smart year detection based on month comparison

**Impact**: Increased from 5 events to **29 complete Siren events** with accurate times

**Files Modified**:
- `apps/agents/src/scrapers/siren-custom.ts`
- `apps/agents/src/types/index.ts` (added `rawEndTime` field)
- `apps/agents/src/lib/normalizer.ts` (passes end time to Claude)

---

### 2. Universal Scraper Chunking
**Problem**: Large pages (300KB+) were truncated, missing most events
**Solution**:
- ✅ Implemented automatic HTML chunking (150KB chunks with 20% overlap)
- ✅ Multiple Claude API calls per page
- ✅ Automatic deduplication across chunks
- ✅ Increased token limits (8192 max_tokens)

**Impact**: Libertine Brewing went from **3 events to 11 events** (3x improvement)

**Files Modified**:
- `apps/agents/src/scrapers/claude-universal.ts`

**Benefits All Scrapers**:
- All venues using ClaudeUniversalScraper now fully scraped
- Can handle pages with 30+ events
- No more truncation issues

---

### 3. Frontend Time Range Display
**Problem**: Events only showed start time, no end time
**Solution**:
- ✅ Updated Event type to include `startDateTime` and `endDateTime`
- ✅ Enhanced time formatting functions to show ranges
- ✅ Updated EventCard and EventDetail components

**Impact**: Events now display as "Saturday, October 25, 2025 at 8:00 PM - 10:30 PM"

**Files Modified**:
- `apps/frontend/src/types/index.ts`
- `apps/frontend/src/lib/utils.ts`
- `apps/frontend/src/components/events/EventDetail.tsx`
- `apps/frontend/src/components/events/EventCard.tsx`

---

### 4. Search & Category Filters Fixed
**Problem**: Search and category filters didn't work
**Solutions**:
- ✅ Added text search to `listEvents` service (searches title, description, tags)
- ✅ Fixed category enum values (frontend now sends "COMEDY" not "Comedy")
- ✅ Updated search schema to pass query parameter

**Impact**:
- Search now works: "bluegrass" finds 2 events
- Category filters work: MUSIC shows 78 events
- Combined filters work: "bluegrass" + MUSIC = 2 events

**Files Modified**:
- `apps/backend/src/services/event.service.ts`
- `apps/backend/src/api/trpc/routes/events.ts`
- `apps/frontend/src/components/events/EventFilters.tsx`

---

### 5. Event Update Logic Fixed
**Problem**: When rescra ping, event times weren't being updated
**Solution**:
- ✅ Updated `updateEvent()` function to update all fields including dates/times
- ✅ Previously only updated description, images, and prices

**Files Modified**:
- `apps/agents/src/lib/deduplicator.ts`

---

### 6. Expanded Brewery Coverage
**Added 4 new breweries**:
1. Central Coast Brewing
2. Tap It Brewing
3. 7 Sisters Brewing
4. BarrelHouse Brewing Paso Robles

**Disabled**:
- Frog & Peach (website has stale data from years ago)

**Total breweries now**: 8 (was 4)

**Files Modified**:
- `apps/agents/src/orchestrator/scheduler.ts`

---

### 7. Environment Configuration
**Fixed**:
- ✅ CORS_ORIGIN corrected to port 3000 (was 5173)
- ✅ Added proper .env loading for backend (ES modules)
- ✅ Added proper .env loading for agents
- ✅ Updated .env.example with all required fields

**Files Modified**:
- `apps/backend/src/config/env.ts`
- `apps/agents/src/orchestrator/index.ts`
- `.env.example`

---

### 8. Instagram Vision Scraper (Ready for Use)
**Created**: New scraper type for Instagram event posters
**Status**: Infrastructure ready, needs Instagram post URLs to activate
**Technology**: Claude Vision API to extract event details from images

**Files Created**:
- `apps/agents/src/scrapers/instagram-vision.ts`

**Note**: Not yet enabled due to Instagram login requirements. Can be activated with manual post URL lists.

---

## 📊 Current System Status

### Database:
- **87 active events**
- **8 unique venues**
- **43 events with time ranges**
- **7 event categories** (MUSIC: 78, COMMUNITY: 66, ARTS: 8, EDUCATION: 5, THEATER: 4, COMEDY: 2, FOOD_WINE: 1)

### Scrapers:
- **23 active scrapers** (was 19)
- Running on 6-hour schedule (`0 */6 * * *`)
- Agent orchestrator with BullMQ queue
- Health monitoring enabled

### Services:
- ✅ Frontend: http://localhost:3000
- ✅ Backend API: http://localhost:3001
- ✅ PostgreSQL + pgvector
- ✅ Redis + Redis Commander
- ✅ All scrapers scheduled and running

---

## 🐛 Issues Fixed

1. ✅ Siren events had wrong start times (was using end time)
2. ✅ January/February events dated as 2025 instead of 2026
3. ✅ Pagination missing - only first page scraped
4. ✅ Large pages truncated - missing most events
5. ✅ CORS blocking frontend API calls
6. ✅ Search not implemented
7. ✅ Category filter sending wrong enum values
8. ✅ Event updates not modifying dates/times
9. ✅ .env not loading in backend/agents

---

## 📝 Documentation Updated

### Files Updated:
- ✅ `README.md` - Corrected port numbers, updated features, added current stats
- ✅ `.env.example` - Fixed CORS_ORIGIN, added missing env vars
- ✅ `docs/RECENT_UPDATES.md` - This document

### Still Accurate:
- `docs/ARCHITECTURE.md` - Comprehensive system architecture
- `docs/PRD.md` - Product requirements
- Infrastructure docs

---

## 🚀 Next Steps

### Immediate Priorities:
1. Test all new breweries to ensure they're scraping correctly
2. Monitor scraper health over next 24 hours
3. Consider creating custom scrapers for high-value venues with complex layouts

### Future Enhancements:
1. Instagram integration (manual post URL approach)
2. Semantic/vector search (currently only text search)
3. User authentication and preferences
4. Spotify artist matching
5. Email notifications
6. Recurring event detection and handling

---

## 💡 Lessons Learned

1. **Chunking is essential** for large event calendars - single API calls hit token limits
2. **Custom scrapers** provide more reliable results than generic scrapers for complex sites
3. **Time range support** is critical - many events span multiple hours
4. **Timezone handling** is tricky - store as UTC, display in user's timezone
5. **Enum consistency** matters - frontend and backend must use exact same values

---

**Last Updated**: October 20, 2025
**Event Count**: 87 active events
**Venue Coverage**: 8 venues, 23 scrapers
