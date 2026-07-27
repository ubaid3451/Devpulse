# ── Backend Dockerfile ───────────────────────────────────────────────────────
FROM python:3.12-slim

# Prevents Python from writing .pyc files and buffering stdout/stderr —
# both make container logs and debugging easier.
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies needed to build psycopg2 (Postgres driver) from source.
# If you're using psycopg2-binary instead, this can be trimmed, but keeping
# it is harmless and avoids a rebuild if you ever switch.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first, separately from copying the rest of the
# code — this lets Docker cache this layer, so `docker build` doesn't
# reinstall every package every time you change a .py file.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the actual application code.
COPY . .

# Directory for uploaded files (chat images, etc.) — created here so the
# container doesn't fail on first upload if the dir doesn't exist.
RUN mkdir -p uploads

EXPOSE 8000

# Run migrations, then start the server. In production you'd usually run
# migrations as a separate step/job rather than on every container start,
# but for a project this size, doing it here keeps things simple.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]