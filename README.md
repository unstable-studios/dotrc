# dotrc Monorepo

DotRC is an append-only record system for logging immutable “dots” (facts) with explicit visibility and durable history.
This repository contains the portable core engine and multiple runtime adapters.

```
dotrc/
├─ README.md
├─ CONTRIBUTING.md
├─ LICENSE
├─ .gitignore
├─ .editorconfig
├─ .env.example
├─ Cargo.toml # Rust workspace
├─ package.json # JS workspace (pnpm)
├─ pnpm-workspace.yaml
├─ rust-toolchain.toml
│
├─ crates/
│ ├─ dotrc-core/ # Pure domain / policy engine (Rust)
│ │ ├─ README.md
│ │ ├─ Cargo.toml
│ │ └─ src/
│ │ ├─ lib.rs
│ │ ├─ types.rs # Dot, Link, ACL, IDs
│ │ ├─ commands.rs # CreateDot, GrantAccess, etc.
│ │ ├─ policy.rs # Visibility + auth rules
│ │ ├─ normalize.rs # Validation & canonicalization
│ │ └─ errors.rs
│ │
│ ├─ dotrc-core-wasm/ # WASM wrapper for Workers
│ │ ├─ Cargo.toml
│ │ └─ src/lib.rs
│ │
│ └─ dotrc-server/ # Self-hosted / enterprise runtime
│ ├─ Cargo.toml
│ └─ src/
│ ├─ main.rs
│ ├─ http/ # API layer
│ ├─ storage/ # Postgres adapters
│ └─ integrations/ # Slack, etc.
│
├─ apps/
│ ├─ dotrc-worker/ # Cloudflare Workers (SaaS)
│ │ ├─ wrangler.toml
│ │ ├─ package.json
│ │ └─ src/
│ │ ├─ index.ts # Worker entrypoint
│ │ ├─ api/ # HTTP routes
│ │ ├─ slack/ # Slack events & commands
│ │ ├─ storage/ # D1 / R2 adapters
│ │ └─ core/ # WASM bindings
│ │
│ └─ dotrc-web/ # Web UI (optional)
│ ├─ package.json
│ └─ src/
│
├─ packages/
│ └─ dotrc-sdk/ # TS client SDK (optional)
│
└─ docs/
├─ overview.md # Product + mental model
├─ core-architecture.md # Domain + policy rules
├─ data-model.md
└─ security.md
```

## Prerequisites

Pick a lane; install only what you need.

### Core (Rust-only)

- Git
- Rust (stable) and tools: `rustup install stable && rustup component add clippy rustfmt`
- pnpm (for the pre-commit hook runner): `npm install -g pnpm`

### JS/Workers/Web

- Everything above
- Node.js 24+ (repo ships .nvmrc with 24 for convenience)
- pnpm (repo uses `packageManager: pnpm@9.x`)

## Bootstrap

Run once to install dev hooks and deps:

```
pnpm install
```

This installs Husky and sets up the pre-commit hook that runs formatting/linting.

### Editor defaults (VS Code)

- Repo includes .vscode/settings.json with format on save (Prettier), rust-analyzer as Rust formatter, and clippy as the Rust check command.
- Recommended extensions in .vscode/extensions.json: rust-analyzer, Prettier, ESLint.
- If you prefer a different editor, mirror the same behaviors: format-on-save and clippy/fmt before commit.

### Quick start options

#### Work on the core engine only (recommended first)

No JS, no Workers, no Slack.

```
cargo test -p dotrc-core
```

Validates dot creation, ACL semantics, link behavior, immutability. No external deps.

#### Run the Cloudflare Worker (SaaS mode)

```
cd apps/dotrc-worker
pnpm install
cp .env.example .env
pnpm dev
```

Requires Slack creds (optional), Cloudflare bindings (D1/R2), auth secrets.

#### Run the self-hosted server (enterprise mode)

```
cargo run -p dotrc-server
```

Requires Postgres, object storage (S3-compatible), and config via env vars/config file.

## Key architectural rules

- `dotrc-core` is pure: no I/O, no async, no platform APIs
- All mutations are append-only
- Visibility is explicit via ACL snapshots + grants
- Links express meaning; chains are derived
- Adapters gather facts → core decides → adapters persist
- Errors flow as typed kinds (Validation/Authorization/Link/ServerError) from core through WASM to adapters

## Developing across layers

```bash
# Run all tests (Rust + WASM + Worker)
make test

# Run individual test suites
make test-rust      # Core domain logic (91 tests)
make test-wasm      # WASM bindings (1 integration test)
make test-worker    # HTTP handler + TypeScript (18 tests)

# Type-check TypeScript
make lint

# Build WASM
make build-wasm

# Dev servers
make dev-worker     # Cloudflare Worker at :8787
make dev-web        # Web UI

# Full help
make help
```

**See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed testing guide.**

## Authentication & Authorization

DotRC uses a pluggable authentication system where adapters handle trust boundaries, and the core enforces policy.

**Supported Auth Methods:**

- **JWT/OIDC** — Industry standard (Auth0, Okta, Azure AD, GitHub, Google)
- **Cloudflare Access** — Zero-trust proxy with CF-specific optimization
- **Trusted Headers** — Reverse proxy deployments (nginx, Traefik, Kubernetes)
- **Development** — Local testing with insecure headers

**👉 Start here:** [auth-index.md](apps/dotrc-worker/auth-index.md) — Complete documentation map  
**💨 In a hurry:** [quick-start.md](apps/dotrc-worker/quick-start.md) — 5-minute guide

**How it works:** [trusted-auth.md](apps/dotrc-worker/trusted-auth.md) — Architecture & provider overview

**Setup Guides:**

- [jwt-setup.md](apps/dotrc-worker/jwt-setup.md) — OIDC provider (Auth0, Okta, Azure AD, GitHub, Google)
- [cloudflare-access-setup.md](apps/dotrc-worker/cloudflare-access-setup.md) — Cloudflare Access
- [trusted-headers-setup.md](apps/dotrc-worker/trusted-headers-setup.md) — Reverse proxy (K8s, Traefik, nginx)
- [local-development.md](apps/dotrc-worker/local-development.md) — Testing & debugging

**Before Shipping:**

- [auth-security.md](apps/dotrc-worker/auth-security.md) — Security best practices
- [auth-checklist.md](apps/dotrc-worker/auth-checklist.md) — Pre-deployment verification

**Key Principles:**

- No retroactive access: Visibility is a snapshot at creation time
- Multi-tenant: Tenant isolation enforced at every operation
- Pluggable: Swap providers without changing core

## Documentation

- **[Getting Started](docs/guides/getting-started.md)** — Deploy the worker and create your first dot
- **[API Reference](docs/guides/api-reference.md)** — All 15 endpoints with request/response schemas
- **[Authentication](docs/guides/authentication.md)** — Provider chain and configuration
- **[SDK Usage](docs/guides/sdk-usage.md)** — TypeScript SDK examples
- **[Deployment](docs/guides/deployment.md)** — Cloudflare Worker deployment guide
- **[Self-Hosting](docs/guides/self-hosting.md)** — dotrc-server with Postgres
- **[Slack Integration](docs/guides/slack-integration.md)** — Slack app setup
- **[Error Reference](docs/guides/error-reference.md)** — Error codes and troubleshooting
- **[OpenAPI Spec](docs/openapi.yaml)** — OpenAPI 3.1 specification
- **[Contributing](docs/contributing.md)** — Dev setup, testing, PR process

For architecture and invariants, see [docs/README.md](docs/README.md).

## What not to do

- Don't add DB access to core
- Don't mutate dots
- Don't infer permissions
- Don't add "states"
- Don't make links mandatory
- Don't trust client-provided auth headers (use adapters instead)
- Don't change ACLs retroactively (snapshot at creation)

If you feel tempted, re-read [docs/overview.md](docs/overview.md).

## License & usage

- Core is licensed for reuse under <TBD>
- SaaS and enterprise offerings are built on the same engine
- No logic forks between deployments
