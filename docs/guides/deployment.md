# Cloudflare Worker Deployment

This guide covers deploying DotRC as a Cloudflare Worker with D1 (SQLite) and R2 (object storage).

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/)
- [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed (`npm install -g wrangler`)
- Rust stable with `wasm32-unknown-unknown` target
- `wasm-bindgen-cli` installed

## 1. Build WASM Core

```bash
make build-wasm
```

This compiles the Rust core to WASM and generates bindings at `crates/dotrc-core-wasm/pkg/`.

## 2. Create D1 Database

```bash
wrangler d1 create dotrc-db
```

Note the database ID from the output. Update `apps/dotrc-worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "dotrc-db"
database_id = "<your-database-id>"
```

## 3. Run Migrations

```bash
cd apps/dotrc-worker
wrangler d1 migrations apply dotrc-db --remote
```

Migrations are in `apps/dotrc-worker/migrations/`.

## 4. Create R2 Bucket

```bash
wrangler r2 bucket create dotrc-attachments
```

Update `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "ATTACHMENTS"
bucket_name = "dotrc-attachments"
```

## 5. Configure Secrets

Set secrets for your deployment:

```bash
# Required for production authentication
wrangler secret put JWT_JWKS_URL
wrangler secret put JWT_AUDIENCE
wrangler secret put JWT_ISSUER

# Optional: Slack integration
wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put SLACK_BOT_TOKEN
wrangler secret put SLACK_CLIENT_ID
wrangler secret put SLACK_CLIENT_SECRET
```

Set the environment:

```toml
[vars]
ENVIRONMENT = "production"
```

## 6. Deploy

```bash
cd apps/dotrc-worker
wrangler deploy
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENVIRONMENT` | No | Set to `"production"` to disable development auth |
| `JWT_JWKS_URL` | For JWT auth | JWKS endpoint for token verification |
| `JWT_AUDIENCE` | For JWT auth | Expected JWT audience claim |
| `JWT_ISSUER` | For JWT auth | Expected JWT issuer claim |
| `JWT_HS256_SECRET` | For HS256 | Symmetric signing key |
| `JWT_CLOCK_SKEW_SECONDS` | No | Clock tolerance for JWT validation |
| `SLACK_SIGNING_SECRET` | For Slack | Slack app signing secret |
| `SLACK_BOT_TOKEN` | For Slack | Slack bot OAuth token |
| `SLACK_CLIENT_ID` | For Slack OAuth | Slack app client ID |
| `SLACK_CLIENT_SECRET` | For Slack OAuth | Slack app client secret |

## Bindings

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 | SQLite database for dots, grants, links |
| `ATTACHMENTS` | R2 | Object storage for attachment files |

## Custom Domain

To use a custom domain:

```toml
routes = [
  { pattern = "api.dotrc.dev/*", zone_name = "dotrc.dev" }
]
```

Or configure via the Cloudflare dashboard under Workers > Triggers > Custom Domains.

## Monitoring

- Worker logs: `wrangler tail` for real-time logs
- D1 metrics: Cloudflare dashboard > D1 > dotrc-db
- R2 metrics: Cloudflare dashboard > R2 > dotrc-attachments
- All requests include `x-request-id` for correlation

## Local Development

```bash
cd apps/dotrc-worker
cp .env.example .env
pnpm dev
```

The local worker runs at `http://localhost:8787` with development auth enabled (accepts `x-tenant-id` and `x-user-id` headers).
