FROM python:3.13-slim

WORKDIR /app

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install production dependencies only (no dev extras)
RUN uv sync --frozen --no-dev --no-install-project

# Copy application source
COPY app/ ./app/

# Port used by Cloud Run
ENV PORT=8080

EXPOSE 8080

# Run FastAPI with uvicorn
# --timeout-keep-alive 300: SSE streams can be long-lived
CMD ["uv", "run", "uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-keep-alive", "300"]
