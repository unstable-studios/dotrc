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

## What not to do

- Don’t add DB access to core
- Don’t mutate dots
- Don’t infer permissions
- Don’t add “states”
- Don’t make links mandatory

If you feel tempted, re-read docs/overview.md.

## License & usage

- Core is licensed for reuse under <TBD>
- SaaS and enterprise offerings are built on the same engine
- No logic forks between deployments
