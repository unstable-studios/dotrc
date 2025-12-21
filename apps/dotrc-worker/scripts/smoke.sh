#!/usr/bin/env bash
set -euo pipefail
BASE_URL=${BASE_URL:-http://localhost:8787}
TENANT_ID=${TENANT_ID:-tenant-123}
USER_ID=${USER_ID:-user-456}

info() { echo "[smoke] $*"; }

info "Health"
curl -sS -i "$BASE_URL/" | sed -n '1,5p'

info "Create dot (happy path)"
curl -sS -i -X POST "$BASE_URL/dots" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-user-id: $USER_ID" \
  -H "content-type: application/json" \
  --data '{
    "title": "Meeting notes",
    "body": "Discussed Q1 roadmap",
    "tags": ["meeting", "planning"],
    "scope_id": "scope-123",
    "visible_to_users": ["user-456"],
    "visible_to_scopes": ["scope-123"]
  }' | sed -n '1,8p'

info "Create dot (minimal payload)"
curl -sS -i -X POST "$BASE_URL/dots" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-user-id: $USER_ID" \
  -H "content-type: application/json" \
  --data '{"title":"Just a title"}' | sed -n '1,8p'

info "Missing auth (should be 401)"
curl -sS -i -X POST "$BASE_URL/dots" \
  -H "content-type: application/json" \
  --data '{"title":"x"}' | sed -n '1,8p'

info "Invalid JSON (should be 400)"
curl -sS -i -X POST "$BASE_URL/dots" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-user-id: $USER_ID" \
  -H "content-type: application/json" \
  --data '{"title":"unterminated"' | sed -n '1,8p'

info "Non-object body (should be 400)"
curl -sS -i -X POST "$BASE_URL/dots" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-user-id: $USER_ID" \
  -H "content-type: application/json" \
  --data '[]' | sed -n '1,8p'
