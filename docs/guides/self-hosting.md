# Self-Hosting with dotrc-server

`dotrc-server` is a standalone Rust HTTP server for self-hosted deployments. It uses the same `dotrc-core` engine as the Cloudflare Worker but stores data in Postgres and S3-compatible object storage.

## Prerequisites

- Rust stable
- PostgreSQL 14+
- S3-compatible object storage (optional, for attachments)

## Quick Start

### 1. Build

```bash
cargo build --release -p dotrc-server
```

### 2. Set up Postgres

Create a database and run migrations:

```bash
createdb dotrc
psql -d dotrc -f crates/dotrc-server/migrations/001_initial_schema.sql
```

### 3. Configure

Set environment variables or create a `.env` file:

```bash
# Required
DATABASE_URL=postgres://user:pass@localhost:5432/dotrc

# Server
LISTEN_ADDR=0.0.0.0:8080

# Object storage (optional, for attachments)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=dotrc-attachments
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_REGION=us-east-1
```

### 4. Run

```bash
./target/release/dotrc-server
```

The server starts at `http://0.0.0.0:8080`.

## Docker

A Dockerfile is provided:

```bash
cd crates/dotrc-server
docker build -t dotrc-server .
```

Run with Docker Compose (includes Postgres and MinIO):

```bash
docker compose up
```

The `docker-compose.yml` in `crates/dotrc-server/` sets up:

- **dotrc-server** on port 8080
- **PostgreSQL** on port 5432
- **MinIO** (S3-compatible) on port 9000

## Configuration Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | Postgres connection string |
| `LISTEN_ADDR` | No | `0.0.0.0:8080` | Server listen address |
| `S3_ENDPOINT` | No | - | S3-compatible storage endpoint |
| `S3_BUCKET` | No | `dotrc-attachments` | S3 bucket name |
| `S3_ACCESS_KEY_ID` | No | - | S3 access key |
| `S3_SECRET_ACCESS_KEY` | No | - | S3 secret key |
| `S3_REGION` | No | `us-east-1` | S3 region |

## API Compatibility

The self-hosted server exposes the same REST API as the Cloudflare Worker. The [API Reference](./api-reference.md) applies to both deployments.

Authentication uses trusted headers (`x-tenant-id`, `x-user-id`) — deploy behind a reverse proxy that handles authentication and sets these headers.

## Production Considerations

1. **Always deploy behind a reverse proxy** (nginx, Traefik, Caddy) that handles TLS and authentication
2. **Set up database backups** — DotRC data is append-only and immutable
3. **Monitor disk usage** — dots and grants grow indefinitely by design
4. **Use connection pooling** (PgBouncer) for high-traffic deployments
