#!/bin/bash

# SLO Events - Local Development Setup Script
# This script sets up your local development environment

set -e

echo "🚀 Setting up SLO Events Platform..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "${BLUE}📋 Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo "${YELLOW}❌ Node.js is not installed. Please install Node.js 20+${NC}"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "${YELLOW}❌ pnpm is not installed. Installing pnpm...${NC}"
    npm install -g pnpm
fi

if ! command -v docker &> /dev/null; then
    echo "${YELLOW}❌ Docker is not installed. Please install Docker Desktop${NC}"
    exit 1
fi

echo "${GREEN}✅ All prerequisites installed${NC}"
echo ""

# Install dependencies
echo "${BLUE}📦 Installing dependencies...${NC}"
pnpm install
echo "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "${BLUE}📝 Creating .env file...${NC}"
    cp .env.example .env
    echo "${YELLOW}⚠️  Please edit .env and add your API keys:${NC}"
    echo "   - ANTHROPIC_API_KEY"
    echo "   - OPENAI_API_KEY"
    echo "   - SPOTIFY_CLIENT_ID (optional for MVP)"
    echo "   - SPOTIFY_CLIENT_SECRET (optional for MVP)"
    echo ""
fi

# Start Docker services
echo "${BLUE}🐳 Starting Docker services (PostgreSQL + Redis)...${NC}"
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "${BLUE}⏳ Waiting for PostgreSQL to be ready...${NC}"
until docker-compose exec -T postgres pg_isready -U sloevents > /dev/null 2>&1; do
    echo "   Waiting for PostgreSQL..."
    sleep 2
done
echo "${GREEN}✅ PostgreSQL is ready${NC}"
echo ""

# Generate Prisma client
echo "${BLUE}🔧 Generating Prisma client...${NC}"
cd packages/database && pnpm prisma generate && cd ../..
echo "${GREEN}✅ Prisma client generated${NC}"
echo ""

# Push database schema
echo "${BLUE}📊 Pushing database schema...${NC}"
cd packages/database && pnpm prisma db push && cd ../..
echo "${GREEN}✅ Database schema pushed${NC}"
echo ""

# Seed database
echo "${BLUE}🌱 Seeding database with sample data...${NC}"
cd packages/database && pnpm db:seed && cd ../..
echo "${GREEN}✅ Database seeded${NC}"
echo ""

# Summary
echo ""
echo "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "${BLUE}📚 Next steps:${NC}"
echo "  1. Edit .env and add your API keys"
echo "  2. Run: ${YELLOW}pnpm dev${NC} to start all services"
echo "  3. Open: ${YELLOW}http://localhost:5173${NC} (Frontend)"
echo "  4. Open: ${YELLOW}http://localhost:3001${NC} (Backend API)"
echo ""
echo "${BLUE}🔧 Useful commands:${NC}"
echo "  ${YELLOW}pnpm dev${NC}          - Start development servers"
echo "  ${YELLOW}pnpm db:studio${NC}    - Open Prisma Studio (DB GUI)"
echo "  ${YELLOW}pnpm docker:logs${NC}  - View Docker logs"
echo "  ${YELLOW}pnpm docker:down${NC}  - Stop Docker services"
echo ""
echo "${BLUE}🌐 Services:${NC}"
echo "  - Frontend:        http://localhost:5173"
echo "  - Backend API:     http://localhost:3001"
echo "  - Prisma Studio:   http://localhost:5555"
echo "  - Redis Commander: http://localhost:8081"
echo "  - Mailhog:         http://localhost:8025"
echo ""
