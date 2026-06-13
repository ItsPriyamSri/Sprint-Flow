#!/usr/bin/env bash
# RBAC smoke test — validates permission enforcement on the running API.
# Usage: API_URL=http://localhost:4000 ./scripts/rbac-smoke.sh
#   API_URL  defaults to http://localhost:4000
#   SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASS  — super admin credentials (from seed)
#   MEMBER_EMAIL / MEMBER_PASS            — regular member credentials
#   PROJECT_ID                            — a project to test against

set -euo pipefail

API="${API_URL:-http://localhost:4000}"
PASS_SUPER="${SUPER_ADMIN_PASS:-admin1234}"
PASS_MEMBER="${MEMBER_PASS:-member1234}"
SA_EMAIL="${SUPER_ADMIN_EMAIL:-admin@sprintflow.local}"
MEMBER_EMAIL="${MEMBER_EMAIL:-member@sprintflow.local}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
PASS=0; FAIL=0

ok()   { echo -e "${GREEN}[PASS]${RESET} $1"; ((PASS++)); }
fail() { echo -e "${RED}[FAIL]${RESET} $1"; ((FAIL++)); }
info() { echo -e "${YELLOW}[INFO]${RESET} $1"; }

# Returns HTTP status code for a request
http_status() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

# Login and return session cookie file path
login() {
  local email="$1" pass="$2" jar
  jar=$(mktemp)
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -c "$jar" -X POST "$API/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}")
  if [[ "$status" != "200" ]]; then
    echo "" # return empty path on failure
    rm -f "$jar"
    return
  fi
  echo "$jar"
}

# ── Setup ─────────────────────────────────────────────────────────────────────

info "Logging in as super admin ($SA_EMAIL)..."
SA_JAR=$(login "$SA_EMAIL" "$PASS_SUPER")
if [[ -z "$SA_JAR" ]]; then
  echo -e "${RED}ERROR:${RESET} Could not log in as super admin. Check SA_EMAIL/SA_PASS and that the server is running at $API"
  exit 1
fi

info "Logging in as member ($MEMBER_EMAIL)..."
M_JAR=$(login "$MEMBER_EMAIL" "$PASS_MEMBER")
if [[ -z "$M_JAR" ]]; then
  echo -e "${RED}ERROR:${RESET} Could not log in as member. Check MEMBER_EMAIL/MEMBER_PASS."
  exit 1
fi

# Get workspaceId
WORKSPACE_ID=$(curl -s -b "$SA_JAR" "$API/api/workspaces/current" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)
if [[ -z "$WORKSPACE_ID" ]]; then
  echo -e "${RED}ERROR:${RESET} Could not resolve workspaceId"
  exit 1
fi
info "Workspace: $WORKSPACE_ID"

# ── Test 1: Member CANNOT create a project (project:create requires SUPER_ADMIN) ──
status=$(http_status -b "$M_JAR" -X POST "$API/api/projects" \
  -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"$WORKSPACE_ID\",\"name\":\"Smoke Test\",\"members\":[],\"sprints\":[{\"name\":\"S1\",\"releaseMilestone\":false}],\"epicNames\":[]}")
if [[ "$status" == "403" ]]; then
  ok "Member cannot create project (403)"
else
  fail "Member create project returned $status (expected 403)"
fi

# ── Test 2: Super admin CAN create a project ──
CREATE_RESP=$(curl -s -b "$SA_JAR" -X POST "$API/api/projects" \
  -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"$WORKSPACE_ID\",\"name\":\"RBAC Smoke Project\",\"members\":[],\"sprints\":[{\"name\":\"S1\",\"releaseMilestone\":false}],\"epicNames\":[]}")
TEST_PROJECT_ID=$(echo "$CREATE_RESP" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)
if [[ -n "$TEST_PROJECT_ID" ]]; then
  ok "Super admin can create project (id: $TEST_PROJECT_ID)"
else
  fail "Super admin could not create project. Response: $CREATE_RESP"
  TEST_PROJECT_ID="${PROJECT_ID:-}"
fi

# ── Test 3: Member CANNOT update project meta (project:update requires LEAD) ──
if [[ -n "$TEST_PROJECT_ID" ]]; then
  status=$(http_status -b "$M_JAR" -X PATCH "$API/api/projects/$TEST_PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{"name":"Hacked"}')
  if [[ "$status" == "403" ]]; then
    ok "Member cannot update project (403)"
  else
    fail "Member update project returned $status (expected 403)"
  fi
fi

# ── Test 4: Super admin CAN update project meta ──
if [[ -n "$TEST_PROJECT_ID" ]]; then
  status=$(http_status -b "$SA_JAR" -X PATCH "$API/api/projects/$TEST_PROJECT_ID" \
    -H "Content-Type: application/json" \
    -d '{"name":"RBAC Smoke Project (updated)"}')
  if [[ "$status" == "200" ]]; then
    ok "Super admin can update project (200)"
  else
    fail "Super admin update project returned $status (expected 200)"
  fi
fi

# ── Test 5: Member CANNOT add board column (board:column_write requires LEAD) ──
BOARD_ID=$(curl -s -b "$SA_JAR" "$API/api/boards?workspaceId=$WORKSPACE_ID" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)
if [[ -n "$BOARD_ID" ]]; then
  status=$(http_status -b "$M_JAR" -X POST "$API/api/boards/$BOARD_ID/columns" \
    -H "Content-Type: application/json" \
    -d '{"name":"Smoke Column"}')
  if [[ "$status" == "403" ]]; then
    ok "Member cannot add board column (403)"
  else
    fail "Member add column returned $status (expected 403)"
  fi
else
  info "No board found — skipping board column test"
fi

# ── Test 6: Member CANNOT delete a sprint ──
SPRINT_ID=$(curl -s -b "$SA_JAR" "$API/api/sprints?workspaceId=$WORKSPACE_ID&projectId=$TEST_PROJECT_ID" | grep -oP '"id"\s*:\s*"\K[^"]+' | head -1)
if [[ -n "$SPRINT_ID" ]]; then
  status=$(http_status -b "$M_JAR" -X DELETE "$API/api/sprints/$SPRINT_ID?workspaceId=$WORKSPACE_ID")
  if [[ "$status" == "403" ]]; then
    ok "Member cannot delete sprint (403)"
  else
    fail "Member delete sprint returned $status (expected 403)"
  fi
else
  info "No sprint found — skipping sprint delete test"
fi

# ── Test 7: Super admin appears in no roster lists ──
ROSTER=$(curl -s -b "$SA_JAR" "$API/api/sprints?workspaceId=$WORKSPACE_ID" | grep -c "\"SUPER_ADMIN\"" || true)
if [[ "$ROSTER" -eq 0 ]]; then
  ok "Super admin not present in sprint/roster responses"
else
  fail "Super admin appeared in sprint response ($ROSTER times)"
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────
if [[ -n "$TEST_PROJECT_ID" ]]; then
  curl -s -b "$SA_JAR" -X DELETE "$API/api/projects/$TEST_PROJECT_ID" > /dev/null || true
fi
rm -f "$SA_JAR" "$M_JAR"

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
