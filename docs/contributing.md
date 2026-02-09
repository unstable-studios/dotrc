# Contributing to DotRC

## Development Setup

### Prerequisites

- Rust stable with `clippy`, `rustfmt`, and `wasm32-unknown-unknown` target
- Node.js 24+
- pnpm 9.x
- `wasm-bindgen-cli` (for WASM builds)

### Bootstrap

```bash
git clone https://github.com/unstable-studios/dotrc.git
cd dotrc
pnpm install
```

This installs Husky pre-commit hooks that run formatting and linting.

## Repository Structure

```
crates/
  dotrc-core/          Pure Rust domain engine (no I/O, no async)
  dotrc-core-wasm/     WASM wrapper for the core
  dotrc-server/        Self-hosted Rust HTTP server

apps/
  dotrc-worker/        Cloudflare Workers adapter (D1 + R2)
  dotrc-web/           Web UI (React)

packages/
  dotrc-sdk/           TypeScript HTTP client SDK
  dotrc/               Embeddable npm package (WASM + IndexedDB)

docs/                  Canonical invariants and rules (binding)
```

## Running Tests

```bash
# All tests
make test

# Individual suites
make test-rust       # Rust core tests
make test-wasm       # WASM integration tests
make test-worker     # Worker HTTP handler tests
make test-sdk        # SDK client tests
make test-dotrc      # Embeddable package tests
make test-web        # Web UI tests
make test-core       # Core-only Rust tests (fast)
```

## Linting and Formatting

```bash
make fmt             # Format Rust code
make lint            # Clippy + TypeScript type checks
```

Pre-commit hooks run `cargo fmt --check` and `cargo clippy` automatically.

## Building

```bash
make build-wasm      # Build WASM module
make build-dotrc     # Build embeddable package
```

## Development Servers

```bash
make dev-worker      # Cloudflare Worker at :8787
make dev-web         # Web UI
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint.

Format: `type(scope): subject`

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`, `ci`

**Scopes:** `core`, `wasm`, `server`, `worker`, `web`, `sdk`, `docs`, `repo`, `infra`, `deps`

Examples:

```
feat(core): add attachment size validation
fix(worker): handle missing scope_id in dot draft
docs(guides): add Slack integration setup guide
test(sdk): add batch operations tests
```

## Architecture Rules

These are non-negotiable:

1. **`dotrc-core` is pure** — no I/O, no databases, no async, no HTTP
2. **Dots are never edited or deleted** — changes create new dots + links
3. **History is append-only** — ACL changes are append-only grants
4. **Visibility is explicit** — ACL snapshots at creation, no retroactive access
5. **Multi-tenancy is always explicit** — all entities belong to a tenant
6. **Links are semantic** — directed and typed, dots exist independently

## Pull Request Process

1. Create a branch from `main`
2. Make your changes following the architecture rules
3. Run `make test` and `make lint` — both must pass
4. Commit with conventional format
5. Open a PR with:
   - Summary of what and why
   - `Fixes #<issue>` if applicable
   - Test plan with verification steps

## Documentation

The `docs/` folder is **canonical and binding**. When code and docs disagree, it's a bug. If changing core behavior, update docs in the same commit.

- `docs/*.md` — Invariants, architecture, data model (stable, rarely changes)
- `docs/guides/` — How-to guides, API reference, setup guides (changes with features)
