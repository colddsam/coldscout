#!/bin/bash
set -e

# ── DATABASE READINESS ──────────────────────────────────────────
# Extract host and port from DATABASE_URL if they aren't explicitly provided.
# We use Python's urllib.parse for robust parsing (handles SQLAlchemy
# "+driver" dialects like postgresql+asyncpg:// correctly).
if [ -z "$DATABASE_HOST" ] && [ -n "$DATABASE_URL" ]; then
    PARSED=$(python -c "
import os, sys
from urllib.parse import urlparse
try:
    url = os.environ['DATABASE_URL']
    # Strip SQLAlchemy driver suffix (e.g., postgresql+asyncpg -> postgresql)
    if '+' in url.split('://', 1)[0]:
        scheme, rest = url.split('://', 1)
        url = scheme.split('+')[0] + '://' + rest
    u = urlparse(url)
    host = u.hostname or ''
    port = u.port or 5432
    print(f'{host}|{port}')
except Exception as e:
    sys.stderr.write(f'DATABASE_URL parse error: {e}\n')
    print('|5432')
" 2>/dev/null || echo "|5432")
    DATABASE_HOST="${PARSED%%|*}"
    DATABASE_PORT="${PARSED##*|}"
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
