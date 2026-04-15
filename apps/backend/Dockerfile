FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable pnpm && npm install -g tsx prisma

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy package manifests for all workspace packages
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/
COPY apps/backend/package.json apps/backend/
COPY apps/agents/package.json apps/agents/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install Playwright Chromium (needed for venue analyzer/refresher)
RUN cd apps/agents && npx playwright install chromium

# Copy source
COPY packages/ packages/
COPY apps/backend/ apps/backend/
COPY apps/agents/ apps/agents/

# Generate Prisma client
RUN cd packages/database && pnpm prisma generate

EXPOSE 6001
ENV NODE_ENV=production
CMD ["sh", "apps/backend/start.sh"]
