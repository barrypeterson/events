# Artist Enrichment Service

## Overview

Automatically enriches music events with artist information from Spotify and YouTube, providing users with:
- Artist photos
- Music genres
- Popularity metrics
- Top tracks with preview clips
- Spotify/YouTube links
- Enhanced search and discovery

**Location:** `/apps/agents/src/lib/artist-enrichment.ts`

---

## How It Works

### Pipeline Integration

Artist enrichment happens **automatically during event normalization** for all MUSIC category events:

```
Raw Event → Normalize → Extract Artist → Spotify Lookup → YouTube Lookup → Enriched Event
```

### 1. Artist Name Extraction

Uses Claude AI to intelligently parse event titles and extract the primary artist/performer.

**Examples:**
```
"Morgan Freeman's Symphonic Blues Experience" → "Morgan Freeman"
"Tis the Season with Ben Folds" → "Ben Folds"
"ZZ Top with Night Ranger" → "ZZ Top" (headliner)
"Sweet Spots Dance Party" → "Sweet Spots"
"Trivia Night" → null (not a music event)
```

**Logic:**
- Removes venue names, "vs", "with", "featuring"
- Identifies headliner from multi-artist events
- Returns null for non-music events

### 2. Spotify Integration

**Data Retrieved:**
- Artist name (official spelling)
- Spotify ID and URL
- Genres (e.g., "indie rock", "jazz", "electronic")
- Popularity score (0-100)
- Monthly listeners / follower count
- Top 3 tracks with preview URLs
- High-resolution artist image

**API:** Uses Spotify Web API with Client Credentials flow (no user auth required)

### 3. YouTube Integration (Optional)

**Data Retrieved:**
- YouTube channel ID
- Channel URL

**Requirement:** `YOUTUBE_API_KEY` in environment variables

---

## Setup

### 1. Get Spotify Credentials

**Free tier available** - No credit card required

1. Go to https://developer.spotify.com/dashboard
2. Create an app (name: "SLO Events Platform")
3. Copy Client ID and Client Secret
4. Add to `.env`:

```bash
SPOTIFY_CLIENT_ID="your_client_id_here"
SPOTIFY_CLIENT_SECRET="your_client_secret_here"
```

### 2. (Optional) Get YouTube API Key

1. Go to https://console.cloud.google.com/apis/credentials
2. Create project
3. Enable YouTube Data API v3
4. Create API key
5. Add to `.env`:

```bash
YOUTUBE_API_KEY="your_api_key_here"
```

---

## Testing

Test the enrichment service:

```bash
pnpm exec tsx src/scripts/test-artist-enrichment.ts
```

This will test artist extraction and Spotify lookup on sample events.

**Example Output:**
```
Event: Tis the Season with Ben Folds
--------------------------------------------------------------------------------
  Extracted Artist: "Ben Folds"

  Spotify Data:
    Name: Ben Folds
    Genres: piano rock, indie pop
    Popularity: 61/100
    Monthly Listeners: 892,453
    Spotify URL: https://open.spotify.com/artist/...
    Image: Available
    Top Tracks:
      1. Brick
      2. The Luckiest
      3. Landed
```

---

## Data Storage

Artist information is stored in the event's `metadata` field:

```json
{
  "metadata": {
    "original": { ... },
    "claudeResponse": { ... },
    "artistInfo": {
      "name": "Ben Folds",
      "spotifyId": "2ueoLVCXQ",
      "spotifyUrl": "https://open.spotify.com/artist/...",
      "genres": ["piano rock", "indie pop"],
      "imageUrl": "https://i.scdn.co/image/...",
      "popularity": 61,
      "monthlyListeners": 892453,
      "topTracks": [
        {
          "name": "Brick",
          "previewUrl": "https://p.scdn.co/mp3-preview/..."
        }
      ],
      "youtubeChannelUrl": "https://www.youtube.com/channel/...",
      "youtubeChannelId": "UC..."
    }
  }
}
```

---

## Frontend Integration

The enriched artist data can be displayed in the event detail page:

### Event Card Enhancements

**Artist Image:**
```typescript
const artistImage = event.metadata?.artistInfo?.imageUrl;
// Use as fallback if event has no image
```

**Spotify Player:**
```typescript
const topTrack = event.metadata?.artistInfo?.topTracks?.[0];
if (topTrack?.previewUrl) {
  // Embed 30-second preview player
}
```

**Artist Link:**
```typescript
const spotifyUrl = event.metadata?.artistInfo?.spotifyUrl;
// "Listen on Spotify" button
```

**Genre Tags:**
```typescript
const genres = event.metadata?.artistInfo?.genres;
// Display as badges: "piano rock", "indie pop"
```

### Search Improvements

Use enriched genres for better search/filtering:
- Users can discover events by music genre
- "Show me all jazz events"
- "Find indie rock concerts"

---

## Performance Considerations

### API Rate Limits

**Spotify:**
- Client Credentials: Generous limits (thousands per hour)
- No user-specific auth required
- Rate limit enforced by Spotify, not documented

**YouTube:**
- 10,000 quota units per day
- Search = 100 units
- ~100 searches per day limit

### Caching Strategy

Artist data is cached in event metadata:
- Once enriched, no need to re-fetch
- Updates only when event is re-scraped
- Reduces API calls significantly

### Performance Impact

**Time Added per Event:**
- Artist extraction (Claude): ~500ms
- Spotify search + details: ~800ms
- YouTube search (if enabled): ~300ms
- **Total:** ~1.6 seconds per music event

**Mitigation:**
- Only runs for MUSIC category events
- Only if Spotify credentials configured
- Non-blocking (doesn't fail if enrichment fails)
- Can be disabled by removing Spotify credentials

---

## Configuration

### Enable/Disable

**Enable:**
```bash
# Add to .env
SPOTIFY_CLIENT_ID="..."
SPOTIFY_CLIENT_SECRET="..."
```

**Disable:**
```bash
# Remove or comment out Spotify credentials
# SPOTIFY_CLIENT_ID=""
# SPOTIFY_CLIENT_SECRET=""
```

Enrichment automatically skips if credentials not found.

### Selective Enrichment

To only enrich specific events, modify the condition in `normalizer.ts`:

```typescript
// Current: All MUSIC events
if (normalized.category.includes('MUSIC') && process.env.SPOTIFY_CLIENT_ID) {

// Example: Only concerts (not DJs or dance parties)
if (normalized.category.includes('MUSIC') &&
    !normalized.tags.includes('dj') &&
    process.env.SPOTIFY_CLIENT_ID) {
```

---

## Troubleshooting

### No Artist Data Showing

1. **Check Spotify credentials:**
   ```bash
   echo $SPOTIFY_CLIENT_ID
   echo $SPOTIFY_CLIENT_SECRET
   ```

2. **Test enrichment:**
   ```bash
   pnpm exec tsx src/scripts/test-artist-enrichment.ts
   ```

3. **Check logs:**
   Look for: `Enriched event with artist data: ...`

### Artist Not Found

- Artist may not be on Spotify (local bands, DJs)
- Artist name extraction may be incorrect
- Spelling variations (check Claude's extraction)

### API Errors

**Spotify 401 Unauthorized:**
- Invalid client credentials
- Verify credentials at https://developer.spotify.com/dashboard

**Spotify 429 Too Many Requests:**
- Rate limit exceeded (unlikely with client credentials)
- Add delay between enrichment calls

**YouTube quota exceeded:**
- 10,000 units per day limit
- Disable YouTube enrichment or request quota increase

---

## Future Enhancements

### 1. Artist Database Table

Create dedicated `artists` table:
```sql
CREATE TABLE artists (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  spotify_id VARCHAR(100),
  genres TEXT[],
  popularity INTEGER,
  image_url TEXT,
  updated_at TIMESTAMPTZ
);
```

**Benefits:**
- Cache artist data across events
- One API call per artist (not per event)
- Browse events by artist
- Artist pages on frontend

### 2. Setlist Integration

Use **Setlist.fm API** to get:
- Recent setlists
- Tour dates
- Typical show length
- Song list

### 3. Similar Artist Recommendations

Use Spotify's "Related Artists" endpoint:
- Suggest similar events
- "If you like X, you might like Y"
- Improve event discovery

### 4. Ticket Price Predictions

Use artist popularity + venue size to estimate ticket prices when not listed.

---

## Example: Enriched Event

**Before Enrichment:**
```json
{
  "title": "Ben Folds Live",
  "category": ["MUSIC"],
  "tags": ["concert", "live music"],
  "images": []
}
```

**After Enrichment:**
```json
{
  "title": "Ben Folds Live",
  "category": ["MUSIC"],
  "tags": ["concert", "live music", "piano rock", "indie pop"],
  "images": ["https://i.scdn.co/image/ben-folds.jpg"],
  "metadata": {
    "artistInfo": {
      "name": "Ben Folds",
      "spotifyUrl": "https://open.spotify.com/artist/...",
      "genres": ["piano rock", "indie pop"],
      "popularity": 61,
      "topTracks": [
        { "name": "Brick", "previewUrl": "https://..." }
      ]
    }
  }
}
```

**User Benefits:**
- See artist photo on event card
- Listen to preview of their music
- Discover similar artists/events
- Better search (by genre)
- More context about who's performing

---

## API References

- **Spotify Web API:** https://developer.spotify.com/documentation/web-api
- **YouTube Data API:** https://developers.google.com/youtube/v3
- **Setlist.fm API:** https://api.setlist.fm/docs/1.0/index.html
