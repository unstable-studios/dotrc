# Getting Started with DotRC

DotRC is an append-only record system for logging immutable facts ("dots") with explicit visibility and durable history. This guide walks you through deploying the Cloudflare Worker and creating your first dot.

## Prerequisites

- Node.js 24+
- pnpm 9.x
- A Cloudflare account (for Worker deployment)
- Rust stable with `wasm32-unknown-unknown` target (for building WASM)

## Quick Setup

### 1. Clone and install

```bash
git clone https://github.com/unstable-studios/dotrc.git
cd dotrc
pnpm install
```

### 2. Build the WASM core

```bash
make build-wasm
```

### 3. Start the local worker

```bash
make dev-worker
```

The worker starts at `http://localhost:8787`.

### 4. Create your first dot

In development mode, authentication uses the `x-tenant-id` and `x-user-id` headers:

```bash
curl -X POST http://localhost:8787/dots \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: my-team" \
  -H "x-user-id: alice" \
  -d '{
    "title": "First dot",
    "body": "This is my first immutable record.",
    "tags": ["getting-started"]
  }'
```

Response:

```json
{
  "dot_id": "d-abc123...",
  "created_at": "2024-01-15T10:30:00.000Z",
  "grants_count": 1,
  "links_count": 0
}
```

### 5. Retrieve the dot

```bash
curl http://localhost:8787/dots/d-abc123... \
  -H "x-tenant-id: my-team" \
  -H "x-user-id: alice"
```

### 6. List all visible dots

```bash
curl "http://localhost:8787/dots?limit=10&offset=0" \
  -H "x-tenant-id: my-team" \
  -H "x-user-id: alice"
```

## Next Steps

- [API Reference](./api-reference.md) — All endpoints with request/response schemas
- [Authentication](./authentication.md) — Configure auth providers for production
- [Deployment](./deployment.md) — Deploy to Cloudflare Workers
- [SDK Usage](./sdk-usage.md) — Use the TypeScript SDK
- [Error Reference](./error-reference.md) — Error codes and troubleshooting
