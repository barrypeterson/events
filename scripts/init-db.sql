-- Initialize database with pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For fuzzy text search

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE sloevents TO sloevents;

-- Log successful initialization
\echo 'Database initialized with pgvector extension'
