# dotrc-worker

Cloudflare Worker adapter for DotRC.

## Architecture

This worker provides a REST API that:

1. Receives HTTP requests
2. Parses auth context (tenant/user from headers, TODO: JWT/Slack)
3. Calls `dotrc-core` via WASM for validation and policy decisions
4. Persists write-sets to D1 (Cloudflare's SQL database)
5. Returns results to the client

**Core principle:** The worker is a thin adapter. All domain logic lives in `dotrc-core`.

## Current Status

✅ **Implemented:**

- WASM module loading
- `DotrcCore` wrapper with type safety
- POST /dots endpoint using core validation
- Timestamp + ID generation utilities
- Basic auth context parsing (headers)

🚧 **TODO:**

- D1 persistence layer
- Slack auth integration
- Additional endpoints (grant access, create links, query dots)
- Error handling improvements

## Development

```bash
# Install dependencies (from repo root)
pnpm install

# Build WASM (required before running worker)
./scripts/build-wasm.sh

# Run locally
make dev-worker
# or: cd apps/dotrc-worker && pnpm dev
```

The dev server will start at `http://localhost:8787`

## API

### Health Check

```bash
GET /
→ 200 { "status": "ok", "service": "dotrc-worker" }
```

### Create Dot

```bash
POST /dots
Headers:
  x-tenant-id: tenant-123
  x-user-id: user-456
Body:
  {
    "title": "Meeting notes",
    "body": "Discussed Q1 roadmap",
    "tags": ["meeting", "planning"],
    "scope_id": "slack-channel-123",
    "visible_to_users": ["user-456"],
    "visible_to_scopes": ["slack-channel-123"]
  }

→ 201 {
  "dot": { ... },
  "grants": 2
}
```

**Auth (temporary):**

- `x-tenant-id` header required
- `x-user-id` header required
- TODO: Replace with JWT or Slack OAuth

## WASM Integration

The worker loads the WASM module at startup:

```typescript
import * as wasm from "../../crates/dotrc-core-wasm/pkg/dotrc_core_wasm.js";
const core = new DotrcCore(wasm);

// Use core for all operations
const result = core.createDot(draft, timestamp, dotId);
```

All validation, normalization, and policy decisions happen in WASM (pure Rust), ensuring:

- Consistent behavior across adapters
- Type-safe operations
- No business logic in the worker layer

## Deployment

```bash
# Deploy to Cloudflare Workers
cd apps/dotrc-worker
pnpm deploy
```

**Prerequisites:**

- Cloudflare account
- Wrangler CLI configured (`wrangler login`)
- D1 database created (see wrangler.toml)

## Environment Variables

None yet. Configuration will be added for:

- Slack API credentials
- JWT signing keys
- Feature flags
