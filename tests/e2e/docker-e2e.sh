#!/usr/bin/env bash
# Docker-backed E2E validation for the Infrahub TypeScript SDK.
#
# Starts a live Infrahub instance via Docker Compose, loads a test schema,
# exercises the full CLI pipeline (schema export → codegen), and runs a
# consumer project that performs real CRUD + relationship operations.
#
# Usage:  bash tests/e2e/docker-e2e.sh
# Exit:   0 on success, 1 on any failure.

set -euo pipefail

# ── Step 1: Preamble ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

INFRAHUB_PORT="${INFRAHUB_PORT:-8000}"
MAX_WAIT="${MAX_WAIT:-600}"
COMPOSE_PROJECT="infrahub-sdk-e2e"
ADDR="http://localhost:${INFRAHUB_PORT}"

TMPDIR_COMPOSE=""
TMPDIR_CONSUMER=""

# Discovered endpoints (populated during health-check probing)
SCHEMA_ENDPOINT=""
GRAPHQL_ENDPOINT=""

echo "=== Infrahub SDK E2E Test ==="
echo "Project root: $PROJECT_ROOT"
echo "Infrahub address: $ADDR"
echo ""

# Check prerequisites
for cmd in docker node npx; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' is required but not found in PATH"
    exit 1
  fi
done

if ! docker compose version &>/dev/null; then
  echo "ERROR: 'docker compose' plugin is required"
  exit 1
fi

# ── Step 2: Cleanup trap ─────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "=== Cleaning up ==="

  if [[ -n "$TMPDIR_COMPOSE" && -f "$TMPDIR_COMPOSE/docker-compose.yml" ]]; then
    echo "Stopping Docker Compose..."
    docker compose -p "$COMPOSE_PROJECT" -f "$TMPDIR_COMPOSE/docker-compose.yml" down -v --remove-orphans 2>/dev/null || true
  fi

  if [[ -n "$TMPDIR_COMPOSE" && -d "$TMPDIR_COMPOSE" ]]; then
    rm -rf "$TMPDIR_COMPOSE"
  fi

  if [[ -n "$TMPDIR_CONSUMER" && -d "$TMPDIR_CONSUMER" ]]; then
    rm -rf "$TMPDIR_CONSUMER"
  fi

  echo "Cleanup complete."
}

trap cleanup EXIT INT TERM

# ── Helpers ───────────────────────────────────────────────────────────────────

# Probe a list of candidate URLs; print the first that responds HTTP 200.
probe_endpoint() {
  for url in "$@"; do
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
      echo "$url"
      return 0
    fi
  done
  return 1
}

# Try a GraphQL query against a candidate URL; print the version on success.
probe_graphql() {
  local url="$1"
  local version
  version=$(curl -s -X POST "$url" \
    -H "Content-Type: application/json" \
    -d '{"query":"{ InfrahubInfo { version } }"}' 2>/dev/null \
    | node -e "
      let d='';
      process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try { console.log(JSON.parse(d).data.InfrahubInfo.version); }
        catch { console.log(''); }
      });
    " 2>/dev/null || echo "")
  echo "$version"
}

# ── Step 3: Build SDK ─────────────────────────────────────────────────────────

echo "--- Step 3: Building SDK ---"
cd "$PROJECT_ROOT"
npm run build
echo "Build complete."
echo ""

# ── Step 4: Start Infrahub ────────────────────────────────────────────────────

echo "--- Step 4: Starting Infrahub via Docker Compose ---"
TMPDIR_COMPOSE="$(mktemp -d)"
COMPOSE_FILE="$TMPDIR_COMPOSE/docker-compose.yml"

curl -fsSL https://raw.githubusercontent.com/opsmill/infrahub/stable/docker-compose.yml -o "$COMPOSE_FILE"
echo "Downloaded compose file to $COMPOSE_FILE"

docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d
echo "Docker Compose started."
echo ""

# ── Step 5: Health check polling ──────────────────────────────────────────────

echo "--- Step 5: Waiting for Infrahub to become healthy ---"
SECONDS_WAITED=0
INTERVAL=5
RESTARTED=false

while true; do
  if (( SECONDS_WAITED >= MAX_WAIT )); then
    echo "ERROR: Infrahub did not become healthy within ${MAX_WAIT}s"
    echo ""
    echo "--- Docker Compose ps ---"
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps 2>/dev/null || true
    echo ""
    echo "--- infrahub-server logs (last 200 lines) ---"
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" logs --tail=200 infrahub-server 2>/dev/null || true
    exit 1
  fi

  # Init workaround: if infrahub-server crashed with the schema_hash error
  # (known first-run issue), perform ONE controlled restart and keep waiting.
  if [[ "$RESTARTED" == "false" ]] && (( SECONDS_WAITED > 0 )); then
    SERVER_LOGS=$(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \
      logs --no-log-prefix infrahub-server 2>/dev/null || echo "")
    if echo "$SERVER_LOGS" | grep -q "schema_hash has not been loaded"; then
      echo "  Detected schema_hash init error — restarting infrahub-server..."
      docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" restart infrahub-server 2>/dev/null || true
      RESTARTED=true
      echo "  Restart issued. Continuing to wait..."
      sleep "$INTERVAL"
      SECONDS_WAITED=$((SECONDS_WAITED + INTERVAL))
      continue
    fi
  fi

  # Also restart if health checks have been failing for 120s (server may be
  # stuck in a crash loop without the specific log message).
  if [[ "$RESTARTED" == "false" ]] && (( SECONDS_WAITED >= 120 )); then
    echo "  Health checks failing for ${SECONDS_WAITED}s — restarting infrahub-server as precaution..."
    docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" restart infrahub-server 2>/dev/null || true
    RESTARTED=true
    echo "  Restart issued. Continuing to wait..."
    sleep "$INTERVAL"
    SECONDS_WAITED=$((SECONDS_WAITED + INTERVAL))
    continue
  fi

  # Probe REST schema endpoint candidates (no trailing slash first, then with)
  FOUND_SCHEMA=$(probe_endpoint \
    "${ADDR}/api/schema?branch=main" \
    "${ADDR}/api/schema/?branch=main" \
  ) || FOUND_SCHEMA=""

  if [[ -n "$FOUND_SCHEMA" ]]; then
    # REST is responding — now probe GraphQL candidates
    for gql_path in "/graphql" "/graphql/main"; do
      VERSION=$(probe_graphql "${ADDR}${gql_path}")
      if [[ -n "$VERSION" ]]; then
        SCHEMA_ENDPOINT="$FOUND_SCHEMA"
        GRAPHQL_ENDPOINT="${ADDR}${gql_path}"
        echo "Infrahub is healthy! Version: $VERSION (waited ${SECONDS_WAITED}s)"
        echo "  Schema endpoint: $SCHEMA_ENDPOINT"
        echo "  GraphQL endpoint: $GRAPHQL_ENDPOINT"
        break 2
      fi
    done
  fi

  # Show status using the preferred endpoint's HTTP code
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${ADDR}/api/schema?branch=main" 2>/dev/null || echo "000")
  echo "  Waiting... (${SECONDS_WAITED}s / ${MAX_WAIT}s, HTTP=$HTTP_CODE)"
  sleep "$INTERVAL"
  SECONDS_WAITED=$((SECONDS_WAITED + INTERVAL))
done
echo ""

# Derive the schema base path (everything before the query string)
SCHEMA_BASE="${SCHEMA_ENDPOINT%%\?*}"

# ── Step 6: Authenticate + create API token ───────────────────────────────────

echo "--- Step 6: Authenticating ---"

ACCESS_TOKEN=$(curl -s -X POST "${ADDR}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"infrahub"}' \
  | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { console.log(JSON.parse(d).access_token); }
      catch { console.log(''); }
    });
  ")

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "ERROR: Failed to obtain access token"
  exit 1
fi
echo "Got access token."

TOKEN_RESPONSE=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"query":"mutation { InfrahubAccountTokenCreate(data: { name: \"e2e-test-token\" }) { ok object { token { value } } } }"}')

API_TOKEN=$(echo "$TOKEN_RESPONSE" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { console.log(JSON.parse(d).data.InfrahubAccountTokenCreate.object.token.value); }
      catch { console.log(''); }
    });
  ")

if [[ -z "$API_TOKEN" ]]; then
  echo "ERROR: Failed to create API token"
  echo "  GraphQL response: $TOKEN_RESPONSE"
  exit 1
fi
echo "Created API token."
echo ""

# ── Step 7: Load schema ──────────────────────────────────────────────────────

echo "--- Step 7: Loading E2E schema ---"
SCHEMA_FILE="$SCRIPT_DIR/e2e-schema.json"

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "ERROR: Schema file not found at $SCHEMA_FILE"
  exit 1
fi

# Wrap schema content into { "schemas": [...] } payload
SCHEMA_PAYLOAD=$(node -e "
  const fs = require('fs');
  const schema = JSON.parse(fs.readFileSync('$SCHEMA_FILE', 'utf-8'));
  console.log(JSON.stringify({ schemas: [schema] }));
")

LOAD_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${SCHEMA_BASE}/load?branch=main" \
  -H "Content-Type: application/json" \
  -H "X-INFRAHUB-KEY: $API_TOKEN" \
  -d "$SCHEMA_PAYLOAD")

if [[ "$LOAD_RESPONSE" != "200" && "$LOAD_RESPONSE" != "202" ]]; then
  echo "ERROR: Schema load failed with HTTP $LOAD_RESPONSE"
  # Show the full response for debugging
  curl -s -X POST "${SCHEMA_BASE}/load?branch=main" \
    -H "Content-Type: application/json" \
    -H "X-INFRAHUB-KEY: $API_TOKEN" \
    -d "$SCHEMA_PAYLOAD"
  echo ""
  exit 1
fi
echo "Schema load returned HTTP $LOAD_RESPONSE."

# Wait for schema to converge
echo "Waiting for schema convergence..."
sleep 15

SCHEMA_WAIT=0
SCHEMA_MAX=120
while true; do
  if (( SCHEMA_WAIT >= SCHEMA_MAX )); then
    echo "ERROR: TestingDevice did not appear in schema within ${SCHEMA_MAX}s"
    exit 1
  fi

  HAS_DEVICE=$(curl -s "$SCHEMA_ENDPOINT" \
    -H "X-INFRAHUB-KEY: $API_TOKEN" \
    | node -e "
      let d='';
      process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try {
          const data = JSON.parse(d);
          const nodes = data.nodes || [];
          const found = nodes.some(n => n.kind === 'TestingDevice');
          console.log(found ? 'yes' : 'no');
        } catch { console.log('no'); }
      });
    " 2>/dev/null || echo "no")

  if [[ "$HAS_DEVICE" == "yes" ]]; then
    echo "TestingDevice kind confirmed in schema (waited ${SCHEMA_WAIT}s after initial delay)."
    break
  fi

  echo "  Schema not ready yet... (${SCHEMA_WAIT}s / ${SCHEMA_MAX}s)"
  sleep 5
  SCHEMA_WAIT=$((SCHEMA_WAIT + 5))
done
echo ""

# ── Step 8: Run SDK CLI ──────────────────────────────────────────────────────

echo "--- Step 8: Running SDK CLI ---"
EXPORT_FILE="$TMPDIR_COMPOSE/schema-export.json"
CODEGEN_DIR="$TMPDIR_COMPOSE/codegen-output"

echo "Exporting schema..."
node "$PROJECT_ROOT/dist/cli.js" schema export \
  -a "$ADDR" \
  -t "$API_TOKEN" \
  -o "$EXPORT_FILE"

# Verify export contains TestingDevice
HAS_TESTING=$(node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('$EXPORT_FILE', 'utf-8'));
  const found = (data.nodes || []).some(n => n.kind === 'TestingDevice');
  console.log(found ? 'yes' : 'no');
")

if [[ "$HAS_TESTING" != "yes" ]]; then
  echo "ERROR: Exported schema does not contain TestingDevice"
  echo "Export contents:"
  cat "$EXPORT_FILE"
  exit 1
fi
echo "Schema export verified — contains TestingDevice."

echo "Running codegen..."
mkdir -p "$CODEGEN_DIR"
node "$PROJECT_ROOT/dist/cli.js" codegen \
  -s "$EXPORT_FILE" \
  -o "$CODEGEN_DIR"

# Verify generated files exist
if [[ ! -f "$CODEGEN_DIR/index.ts" ]]; then
  echo "ERROR: codegen did not produce index.ts"
  ls -la "$CODEGEN_DIR" || true
  exit 1
fi
echo "Codegen output verified."
echo ""

# ── Step 9: Create consumer project ──────────────────────────────────────────

echo "--- Step 9: Creating consumer project ---"
TMPDIR_CONSUMER="$(mktemp -d)"

# Write package.json
cat > "$TMPDIR_CONSUMER/package.json" <<'PKGJSON'
{
  "name": "e2e-consumer",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}
PKGJSON

# Write tsconfig.json
cat > "$TMPDIR_CONSUMER/tsconfig.json" <<'TSCONF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
TSCONF

# Copy generated code
mkdir -p "$TMPDIR_CONSUMER/src/generated"
cp "$CODEGEN_DIR"/*.ts "$TMPDIR_CONSUMER/src/generated/"

# Copy consumer test
cp "$SCRIPT_DIR/consumer-test.ts" "$TMPDIR_CONSUMER/src/test.ts"

# Install dependencies
echo "Installing dependencies..."
cd "$TMPDIR_CONSUMER"
npm install "infrahub-sdk@file:$PROJECT_ROOT" tsx typescript @types/node --save-dev 2>&1 | tail -3
echo "Dependencies installed."
echo ""

# ── Step 10: Type check + execute ─────────────────────────────────────────────

echo "--- Step 10: Type check + execute ---"
cd "$TMPDIR_CONSUMER"

echo "Running tsc --noEmit..."
npx tsc --noEmit
echo "Type check passed (0 errors)."
echo ""

echo "Running consumer test..."
INFRAHUB_ADDRESS="$ADDR" INFRAHUB_API_TOKEN="$API_TOKEN" npx tsx src/test.ts
echo ""
echo "Consumer test passed!"
echo ""

# ── Step 11: Cleanup (handled by trap) ────────────────────────────────────────

echo "=== E2E test suite PASSED ==="
