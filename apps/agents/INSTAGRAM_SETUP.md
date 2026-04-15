# Instagram Scraper Setup

## ⚠️ IMPORTANT WARNINGS

**This is for EDUCATIONAL PURPOSES ONLY**

- **Violates Instagram Terms of Service**
- **High risk of account ban** (expect it)
- **Use ONLY a dedicated test account** (never your personal account)
- **Not recommended for production use**
- **Consider using Instagram Basic Display API instead** (official, ToS-compliant)

## Setup Instructions

### Step 1: Create Rate Limiting Table

Run the migration to create the rate limiting tracking table:

```bash
psql $DATABASE_URL -f packages/database/prisma/migrations/add_rate_limiting.sql
```

Or connect to your database and run:

```sql
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service VARCHAR(100) NOT NULL,
  endpoint VARCHAR(255),
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_service_window
ON rate_limit_tracking(service, window_end)
WHERE window_end > NOW();

CREATE INDEX IF NOT EXISTS idx_rate_limit_window_end
ON rate_limit_tracking(window_end);
```

### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
# Instagram Scraping (Educational/Testing Only)
# ⚠️ Use dedicated account - NOT your personal account!
INSTAGRAM_USERNAME="your_test_account"
INSTAGRAM_PASSWORD="your_test_password"

# Rate limiting (very conservative)
INSTAGRAM_RATE_LIMIT_REQUESTS="10"   # Max 10 requests per hour
INSTAGRAM_RATE_LIMIT_WINDOW="3600"   # 1 hour window
```

### Step 3: Add Instagram Scrapers

Edit `/apps/agents/src/orchestrator/scheduler.ts` and add venues:

```typescript
// Instagram Scrapers (uncomment and configure)
['instagram-7sisters', new InstagramVisionScraper('instagram-7sisters', '7sistersbrewing', '7 Sisters Brewing', 5)],
['instagram-tapit', new InstagramVisionScraper('instagram-tapit', 'tapitbrewing', 'Tap It Brewing', 5)],
```

**Parameters:**
- `scraperId`: Unique ID for this scraper
- `instagramUsername`: Instagram handle (without @)
- `venueName`: Display name for the venue
- `maxPosts`: Number of recent posts to check (max 10, recommend 5)

## How It Works

### Authentication
- Logs in once per session using Playwright
- Stores login state in memory (does not persist cookies)
- Uses realistic user agent and browser fingerprint
- Adds human-like delays (3-6 seconds between requests)

### Rate Limiting
- **Database-tracked**: Every request logged to `rate_limit_tracking` table
- **Default**: 10 requests per hour (very conservative)
- **Per-profile tracking**: Each Instagram profile counts separately
- **Automatic skip**: If rate limit exceeded, scraper returns empty array and logs warning

### Request Pattern
1. Login (once per run)
2. Visit profile page
3. Collect post links (1 request)
4. For each post (up to 5-10):
   - Wait 3-6 seconds (randomized)
   - Visit post (1 request)
   - Extract image URL and caption
   - Wait 2-3 seconds
   - Return to profile (1 request)

**Total requests:** ~1 login + 1 profile + (2 × maxPosts) = ~11-21 requests per scraper run

### Vision Extraction
- Uses Claude Vision API to analyze event posters
- Extracts: artist name, date, time, description
- Filters out non-event posts

## Rate Limiting Configuration

### Conservative (Recommended)
```bash
INSTAGRAM_RATE_LIMIT_REQUESTS="10"   # 10 per hour
INSTAGRAM_RATE_LIMIT_WINDOW="3600"
```

- Scrape 1-2 venues per hour max
- Very low detection risk
- Suitable for learning/testing

### Moderate (Higher Risk)
```bash
INSTAGRAM_RATE_LIMIT_REQUESTS="30"   # 30 per hour
INSTAGRAM_RATE_LIMIT_WINDOW="3600"
```

- Scrape 2-3 venues per hour
- Increased ban risk
- Still relatively conservative

### Aggressive (NOT RECOMMENDED)
```bash
INSTAGRAM_RATE_LIMIT_REQUESTS="60"   # 60 per hour
INSTAGRAM_RATE_LIMIT_WINDOW="3600"
```

- High detection/ban probability
- Only for very short-term testing

## Testing

### Test a Single Instagram Scraper

```bash
# Add a scraper to scheduler.ts first, then:
pnpm --filter @slo-events/agents cli test instagram-7sisters
```

### Monitor Rate Limits

Check current rate limit status:

```sql
SELECT
  service,
  endpoint,
  SUM(request_count) as total_requests,
  MAX(window_end) as reset_at
FROM rate_limit_tracking
WHERE window_end > NOW()
GROUP BY service, endpoint;
```

## Troubleshooting

### Login Fails
- Check credentials are correct
- Try logging in manually first to verify account works
- Instagram may require 2FA (not supported - account will fail)
- Check for captcha (not supported - will fail)

### Rate Limit Errors
Check rate limit tracking:
```bash
psql $DATABASE_URL -c "SELECT * FROM rate_limit_tracking WHERE service = 'instagram' ORDER BY created_at DESC LIMIT 10;"
```

### Account Banned
- Expected behavior when automating Instagram
- Create new test account
- Wait longer between requests
- Reduce `INSTAGRAM_RATE_LIMIT_REQUESTS`

## Best Practices

1. **Use burner account**: Create account specifically for testing
2. **Start very slow**: Begin with 5 requests/hour, monitor for issues
3. **Manual fallback**: Have plan for when account gets banned
4. **Monitor logs**: Watch for login failures or blocks
5. **Cleanup old data**: Rate limit table grows over time
   ```sql
   DELETE FROM rate_limit_tracking WHERE window_end < NOW() - INTERVAL '7 days';
   ```

## Alternative: Instagram Basic Display API

For production use, strongly consider the official API:

**Pros:**
- ToS compliant
- No ban risk
- More reliable
- Free tier available

**Setup:**
1. Create Meta Developer account: https://developers.facebook.com/
2. Create Instagram Basic Display App
3. Get venues to authorize your app (OAuth flow)
4. Use official endpoints

**Docs:** https://developers.facebook.com/docs/instagram-basic-display-api

## Monitoring Rate Limits

View current status:

```typescript
import { ServiceRateLimiter } from './lib/rate-limiter';

const limiter = new ServiceRateLimiter('instagram', 10, 3600);
const status = await limiter.getStatus('7sistersbrewing');

console.log(`Used: ${status.currentCount}/${status.maxRequests}`);
console.log(`Remaining: ${status.remainingRequests}`);
console.log(`Resets at: ${status.resetAt}`);
```

## Cleanup

Remove old rate limit records (run weekly):

```sql
DELETE FROM rate_limit_tracking WHERE window_end < NOW() - INTERVAL '7 days';
```

Or use the cleanup function:

```typescript
import { ServiceRateLimiter } from './lib/rate-limiter';
await ServiceRateLimiter.cleanup(); // Removes records older than 24 hours
```
