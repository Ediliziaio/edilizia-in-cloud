FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-dejavu-core libnss3-tools libreoffice-writer openssl poppler-utils \
    python3-venv tesseract-ocr tesseract-ocr-eng tesseract-ocr-ita unzip \
    && rm -rf /var/lib/apt/lists/*
COPY services/gare-appalti/requirements.txt /tmp/gare-requirements.txt
RUN python3 -m venv /opt/gare-python \
    && /opt/gare-python/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/gare-requirements.txt \
    && rm /tmp/gare-requirements.txt

WORKDIR /app
COPY services/gare-appalti/package.json services/gare-appalti/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server/ server/
COPY services/gare-appalti/server.mjs services/gare-appalti/server.mjs
COPY src/modules/gare-appalti/source-current.js src/modules/gare-appalti/source-current.js
COPY src/modules/gare-appalti/reader/text-model.js src/modules/gare-appalti/reader/text-model.js
COPY src/modules/gare-appalti/dossier/*.js src/modules/gare-appalti/dossier/

ENV NODE_ENV=production GARE_PYTHON=/opt/gare-python/bin/python PYTHONDONTWRITEBYTECODE=1
USER node
EXPOSE 8081
CMD ["node", "services/gare-appalti/server.mjs"]
