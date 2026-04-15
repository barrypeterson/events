-- Rate limiting table for external service requests
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service VARCHAR(100) NOT NULL,  -- 'instagram', 'twitter', etc.
  endpoint VARCHAR(255),           -- Specific endpoint or profile
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_rate_limit_service_window
ON rate_limit_tracking(service, window_end)
WHERE window_end > NOW();

-- Index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_rate_limit_window_end
ON rate_limit_tracking(window_end);

COMMENT ON TABLE rate_limit_tracking IS 'Track API/scraping requests for rate limiting';
