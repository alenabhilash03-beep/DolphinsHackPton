# One container: Next.js web app (public port) + FastAPI scientific API (internal 127.0.0.1:8000).
# Works on any Docker host (Railway, Hugging Face Spaces, Fly, Cloud Run, a laptop). Secrets come from
# environment variables at runtime; nothing secret is baked into the image.

FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --no-audit --no-fund
COPY apps/web apps/web
COPY data data
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace apps/web

FROM python:3.12-slim-bookworm
WORKDIR /app
COPY --from=web /usr/local/bin/node /usr/local/bin/node
RUN pip install --no-cache-dir uv==0.11.32
COPY pyproject.toml uv.lock .python-version README.md ./
COPY apps/api apps/api
RUN uv sync --locked --no-dev
COPY . .
COPY --from=web /app/node_modules node_modules
COPY --from=web /app/apps/web/.next apps/web/.next
# Writable locations for hosts that run containers as a non-root user (for example uid 1000).
RUN mkdir -p /data work && chmod -R a+rwX /data work data apps/web/.next
ENV DATA_DIR=/data PORT=3000 NEXT_TELEMETRY_DISABLED=1 PYTHONUNBUFFERED=1
EXPOSE 3000
CMD ["bash", "scripts/start_container.sh"]
