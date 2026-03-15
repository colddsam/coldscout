FROM python:3.11-slim-bookworm

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Set the working directory
WORKDIR /app

# Install system dependencies for WeasyPrint, Playwright, and general build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-xlib-2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN adduser --disabled-password --gecos '' appuser && \
    mkdir -p /ms-playwright && \
    chown -R appuser:appuser /app /ms-playwright

# Copy requirements file first (for caching)
COPY requirements.txt .

# Install Python dependencies and Playwright
# We run playwright install as root so it can install any missing --with-deps (debian packages),
# then we transfer ownership of the downloaded browser artifacts to appuser.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    playwright install chromium --with-deps && \
    chown -R appuser:appuser /ms-playwright

# Copy the rest of the application code
COPY --chown=appuser:appuser . .

# Switch to the non-root user
USER appuser

# Expose the application port
EXPOSE $PORT

# Docker-native health check — verifies the API process is responsive
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-8000}/api/v1/health')" || exit 1

# Start the uvicorn server with proxy headers enabled for reverse-proxy (e.g. Render/Nginx)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
