# One container: the visual Next.js frontend (public port) + FastAPI scientific API (internal 127.0.0.1:8000).
# Works on any Docker host (Railway, Hugging Face Spaces, Fly, Cloud Run, a laptop). Secrets come from
# environment variables at runtime; nothing secret is baked into the image.

FROM node:22-bookworm-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
COPY --from=web /usr/local/bin/node /usr/local/bin/node
RUN pip install --no-cache-dir uv==0.11.32
COPY pyproject.toml uv.lock .python-version README.md ./
COPY apps/api apps/api
RUN uv sync --locked --no-dev
COPY . .
COPY --from=web /app/frontend/node_modules frontend/node_modules
COPY --from=web /app/frontend/.next frontend/.next
# Writable locations for hosts that run containers as a non-root user (for example uid 1000).
RUN mkdir -p /data work && chmod -R a+rwX /data work data frontend/.next
ENV DATA_DIR=/data PORT=3000 NEXT_TELEMETRY_DISABLED=1 PYTHONUNBUFFERED=1
EXPOSE 3000
CMD ["bash", "scripts/start_container.sh"]
