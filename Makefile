.PHONY: setup api web contracts check build

setup:
	uv sync --locked
	npm ci

api:
	uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

web:
	npm run dev:web

contracts:
	uv run npm run contracts:generate

check:
	uv run pytest
	npm run contracts:check
	npm run typecheck

build:
	npm run build
