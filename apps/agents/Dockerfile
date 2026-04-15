FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable pnpm && npm install -g tsx

# Playwright system deps
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy package manifests
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/
COPY apps/agents/package.json apps/agents/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install playwright browsers
RUN cd apps/agents && npx playwright install chromium

# Copy source
COPY packages/ packages/
COPY apps/agents/ apps/agents/

# Generate Prisma client
RUN cd packages/database && pnpm prisma generate

ENV NODE_ENV=production
CMD ["tsx", "apps/agents/src/orchestrator/index.ts"]
