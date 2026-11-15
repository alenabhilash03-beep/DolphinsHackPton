#!/usr/bin/env bash
# Start the API (internal) and the web app (public $PORT); exit if either stops so the host restarts us.
set -euo pipefail
cd "$(dirname "$0")/.."
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/workspaces"
export WORKSPACES_DIR="${WORKSPACES_DIR:-$DATA_DIR/workspaces}"
export PREPARATION_DB_PATH="${PREPARATION_DB_PATH:-$DATA_DIR/preparations.sqlite3}"
export RESEARCH_DB_PATH="${RESEARCH_DB_PATH:-$DATA_DIR/research-jobs.db}"
export API_BASE_URL="http://127.0.0.1:8000"
# Accounts switch on automatically when a Supabase project is configured.
if [[ -n "${SUPABASE_URL:-}" && -z "${AUTH_MODE:-}" ]]; then export AUTH_MODE=supabase; fi
.venv/bin/uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000 &
# The visual frontend: signed-in users, per-user workspaces under $WORKSPACES_DIR/visual.
(cd frontend && HYPOTHESIM_HOSTED=1 exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}") &
trap 'kill 0' TERM INT
wait -n
echo "A service stopped; exiting so the host restarts the container." >&2
kill 0
exit 1
