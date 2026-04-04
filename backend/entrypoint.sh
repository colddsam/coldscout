#!/bin/bash
set -e

# ── DATABASE READINESS ──────────────────────────────────────────
# Extract host and port from DATABASE_URL if they aren't explicitly provided
# Example: postgresql+asyncpg://user:pass@host:port/dbname
if [ -z "$DATABASE_HOST" ] && [ -n "$DATABASE_URL" ]; then
    # Remove protocol and credentials part
    DB_URL_WITHOUT_PROTO_CREDS=$(echo "$DATABASE_URL" | sed -E 's/^[a-z0-9+]+:\/\/(.*@)?//')
    
    # Extract host (part before first colon or slash)
    DATABASE_HOST=$(echo "$DB_URL_WITHOUT_PROTO_CREDS" | sed -E 's/[:/].*//')
    
    # Extract port (part between first colon and first slash, if present)
    if [[ "$DB_URL_WITHOUT_PROTO_CREDS" == *":"* ]]; then
        PORT_PART=$(echo "$DB_URL_WITHOUT_PROTO_CREDS" | sed -E 's/^[^:]+:([0-9]+).*$/\1/')
        if [[ "$PORT_PART" =~ ^[0-9]+$ ]]; then
            DATABASE_PORT="$PORT_PART"
        else
            DATABASE_PORT=5432 # Default PostgreSQL port
        fi
    else
        DATABASE_PORT=5432 # Default PostgreSQL port
    fi
fi

# Default to db:5432 if still unset
DATABASE_HOST=${DATABASE_HOST:-db}
DATABASE_PORT=${DATABASE_PORT:-5432}

echo "Waiting for PostgreSQL at ${DATABASE_HOST}:${DATABASE_PORT}..."
until nc -z "$DATABASE_HOST" "$DATABASE_PORT"; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done
echo "PostgreSQL is up - executing migrations"

# Run alembic migrations
alembic upgrade head

# Seed the initial admin account
python scripts/seed_admin.py

# Start the application
echo "Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'
