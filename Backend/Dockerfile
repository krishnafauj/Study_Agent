# ── Backend image: Node app + Python PDF extractor ──────────────────────────
FROM node:20-bookworm-slim

# System deps:
#   python3/pip  -> run integration/python/extract.py
#   tesseract-ocr-> OCR fallback for scanned PDFs (optional but recommended)
#   ca-certificates -> HTTPS to Groq/OpenAI/S3
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      tesseract-ocr \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Python deps first (better layer caching)
COPY integration/python/requirements.txt ./integration/python/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r integration/python/requirements.txt

# 2) Node deps (use lockfile when present; fall back to install)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# 3) App source
COPY . .

ENV NODE_ENV=production
ENV PYTHON_BIN=python3
ENV PORT=4000
EXPOSE 4000

CMD ["node", "index.js"]
