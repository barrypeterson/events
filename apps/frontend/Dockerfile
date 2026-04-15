FROM node:20-slim AS build
RUN corepack enable pnpm

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Copy package manifests
COPY packages/database/package.json packages/database/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/
COPY apps/frontend/package.json apps/frontend/
COPY apps/backend/package.json apps/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/frontend/ apps/frontend/
COPY apps/backend/ apps/backend/

# Build frontend (VITE_API_URL is baked in at build time)
ARG VITE_API_URL
ARG VITE_GOOGLE_MAPS_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_MAPS_KEY=$VITE_GOOGLE_MAPS_KEY
RUN cd apps/frontend && pnpm build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
