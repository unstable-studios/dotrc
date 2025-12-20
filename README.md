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

You do not need everything to get started. Pick a lane.

### Required (always)

- Git
- Rust (stable) `rustup install stable && rustup component add clippy rustfmt`

- Node.js 24+ `nvm use v24`
- pnpm `npm install -g pnpm`

### Quick start options

#### Work on the core engine only (recommended first)

No JS, no Workers, no Slack.

```
cd crates/dotrc-core
cargo test
```

This validates:

- dot creation rules
- ACL semantics
- link behavior
- immutability guarantees

Core has zero external dependencies.

#### Run the Cloudflare Worker (SaaS mode)

Setup

```
cd apps/dotrc-worker
pnpm install
cp .env.example .env
```

Required env vars:

- Slack app credentials (optional)
- Cloudflare bindings (D1, R2)
- Auth secrets

Run locally

pnpm dev

This starts:

- local Worker
- API endpoints
- Slack event handling (if configured)

#### Run the self-hosted server (enterprise mode)

```
cd crates/dotrc-server
cargo run
```

Requires:

- Postgres
- Object storage (S3-compatible)
- Config via env vars or config file

This binary embeds the same dotrc-core logic as the SaaS.

## Key architectural rules

- `dotrc-core` is pure: no I/O, no async, no platform APIs
- All mutations are append-only
- Visibility is explicit via ACL snapshots + grants
- Links express meaning; chains are derived
- Adapters gather facts → core decides → adapters persist

## Developing across layers

Common workflows:

Core change

```
cargo test -p dotrc-core
```

Worker change

```
pnpm dev
```

WASM rebuild

```
pnpm build:core
```

Full repo

```
pnpm lint
cargo test
```

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
