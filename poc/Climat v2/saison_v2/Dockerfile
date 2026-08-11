FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_CACHE_HOME=/tmp/cache \
    SEASONS_DATA_DIR=/data

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-service.txt ./
RUN pip install --no-cache-dir -r requirements-service.txt

COPY engine ./engine
COPY service ./service
COPY wheel-config.json ./wheel-config.json

RUN useradd --create-home --uid 10001 seasons \
    && mkdir -p /data \
    && chown seasons:seasons /data \
    && install -D -m 644 '/app/service/assets/fonts/DancingScript[wght].ttf' '/usr/local/share/fonts/DancingScript[wght].ttf' \
    && install -D -m 644 '/app/service/assets/fonts/Inter[opsz,wght].ttf' '/usr/local/share/fonts/Inter[opsz,wght].ttf' \
    && fc-cache -f

USER seasons
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2)" || exit 1

CMD ["uvicorn", "service.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
