#!/bin/sh
set -e

echo "Pushing database schema..."
prisma db push --schema /app/packages/database/prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 || echo "Warning: prisma db push failed, continuing anyway"

echo "Starting server..."
exec tsx /app/apps/backend/src/server.ts
