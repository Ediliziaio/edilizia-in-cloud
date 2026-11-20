FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ocrmypdf tesseract-ocr-ita poppler-utils python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py /app/server.py
ENV OMP_THREAD_LIMIT=1 PORT=8080 PYTHONUNBUFFERED=1
USER 65534:65534
EXPOSE 8080
CMD ["python3", "/app/server.py"]
