FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    DATABASE_PATH=/app/var/laluan.db

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY data ./data
COPY scripts ./scripts

# Run as a normal user. data/ stays writable for the refresh job's raw-count cache; snapshots and
# review decisions go to the database. var/ holds the local SQLite file (unused when DATABASE_URL is set).
RUN useradd --create-home laluan && mkdir -p var && chown -R laluan:laluan /app/data /app/var
USER laluan

EXPOSE 8000
# Cloud Run and most hosts pass the port in $PORT.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
