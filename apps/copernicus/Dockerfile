FROM python:3.12-slim

WORKDIR /app

COPY apps/copernicus/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/copernicus/src /app/src
COPY apps/copernicus/tests /app/tests

ENV PYTHONPATH=/app/src \
    COPERNICUS_DOWNLOAD_DIR=/app/data/downloads

CMD ["python", "-m", "copernicus.main"]
