#!/bin/bash

# SLO Events - Local Development Startup Script
# This script starts all necessary services for local development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
log_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Print header
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SLO Events - Local Development Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    log_warning ".env file not found"
    log_info "Creating .env from .env.example..."
    cp .env.example .env
    log_success ".env file created"
    log_warning "Please edit .env with your API keys before continuing"
    echo ""
    read -p "Press enter to continue once you've updated .env, or Ctrl+C to exit..."
fi

# Check for required commands
log_info "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { log_error "node is required but not installed. Aborting."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { log_error "pnpm is required but not installed. Aborting."; exit 1; }
command -v docker >/dev/null 2>&1 || { log_error "docker is required but not installed. Aborting."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { log_error "docker-compose is required but not installed. Aborting."; exit 1; }
log_success "All prerequisites found"
echo ""

# Install dependencies
log_info "Installing dependencies..."
pnpm install
log_success "Dependencies installed"
echo ""

# Start Docker services
log_info "Starting Docker services (PostgreSQL, Redis, etc.)..."
pnpm docker:up
log_success "Docker services started"
echo ""

# Wait for PostgreSQL to be ready
log_info "Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=0
until docker exec slo-events-postgres pg_isready -U sloevents >/dev/null 2>&1 || [ $attempt -eq $max_attempts ]; do
    attempt=$((attempt + 1))
    echo -n "."
    sleep 1
done
echo ""

if [ $attempt -eq $max_attempts ]; then
    log_error "PostgreSQL did not start in time"
    exit 1
fi
log_success "PostgreSQL is ready"
echo ""

# Wait for Redis to be ready
log_info "Waiting for Redis to be ready..."
max_attempts=30
attempt=0
until docker exec slo-events-redis redis-cli ping >/dev/null 2>&1 || [ $attempt -eq $max_attempts ]; do
    attempt=$((attempt + 1))
    echo -n "."
    sleep 1
done
echo ""

if [ $attempt -eq $max_attempts ]; then
    log_error "Redis did not start in time"
    exit 1
fi
log_success "Redis is ready"
echo ""

# Push database schema
log_info "Pushing database schema..."
pnpm db:push
log_success "Database schema updated"
echo ""

# Start development servers
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Development Servers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_success "All services are ready!"
echo ""
echo "Available URLs:"
echo "  Frontend:        http://localhost:6000"
echo "  Backend API:     http://localhost:6001"
echo "  Prisma Studio:   http://localhost:6555 (run 'pnpm db:studio')"
echo "  Redis Commander: http://localhost:6081"
echo "  Mailhog:         http://localhost:6026"
echo ""
echo "Starting development servers (press Ctrl+C to stop)..."
echo ""

# Start development servers with pnpm
pnpm dev
