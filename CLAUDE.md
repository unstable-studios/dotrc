# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

DotRC is an append-only record system for logging immutable facts ("dots") with explicit visibility and durable history. It's a Rust/TypeScript monorepo with a pure domain core, WASM bridge, and Cloudflare Workers adapter.

## Commands

```bash
make help           # Show all targets
make bootstrap      # Install JS deps (pnpm install)
make fmt            # Format Rust code (cargo fmt)
make lint           # Run clippy + TypeScript type checks
make test           # Run all tests (rust + wasm + worker)
make test-rust      # Rust tests only (cargo test --workspace)
make test-core      # dotrc-core tests only (cargo test -p dotrc-core)
make test-wasm      # WASM integration tests (requires build-wasm first)
make test-worker    # Worker tests (cd apps/dotrc-worker && pnpm test)
make build-wasm     # Build WASM module (./scripts/build-wasm.sh)
make dev-worker     # Run Cloudflare Worker locally (:8787)
make dev-web        # Run web UI locally
make clean          # Clean build artifacts
```

Prerequisites: Rust stable (with clippy, rustfmt), Node.js 24+, pnpm 9.x, wasm-bindgen-cli (for WASM builds).

## Architecture

### Layered Structure

```
crates/dotrc-core         → Pure Rust domain/policy engine (no I/O, no async, no_std compatible)
crates/dotrc-core-wasm    → WASM wrapper: JSON ↔ WASM ↔ Rust core
crates/dotrc-server       → Self-hosted runtime adapter (stub)
apps/dotrc-worker         → Cloudflare Workers SaaS adapter (D1 + R2 storage)
apps/dotrc-web            → Web UI
packages/dotrc-sdk        → TypeScript client SDK (stub)
docs/                     → Canonical invariants and rules (binding — code must match)
```

### Command → Write-Set Pattern

This is the central architectural pattern. Core never persists anything:

1. Adapter gathers context (HTTP request, auth, existing records)
2. Adapter calls core (directly or via WASM JSON interface)
3. Core validates, applies policy, returns records to persist
4. Adapter persists the write-set (D1/R2/Postgres)

### WASM Bridge

The WASM layer (`dotrc-core-wasm`) is a pure serialization adapter — no logic. All functions accept JSON strings and return JSON `{ type: "ok", data: {...} }` or `{ type: "err", kind, message }`. Timestamps and IDs are injected by the adapter (dependency injection via `InjectedClock`/`InjectedIdGen`).

Build: `./scripts/build-wasm.sh` → outputs to `crates/dotrc-core-wasm/pkg/`

### Worker Storage

- **D1 (SQLite)**: dots, grants, links, tags, users, scopes — migrations in `apps/dotrc-worker/migrations/`
- **R2 (Object Storage)**: attachment files
- Storage interfaces: `DotStorage`/`D1DotStorage`, `AttachmentStorage`/`R2AttachmentStorage`

### Core Modules (`crates/dotrc-core/src/`)

- `types.rs` — Immutable domain primitives (Dot, Link, VisibilityGrant, IDs)
- `errors.rs` — Two-layer error system with kinds (Validation, Authorization, Link, ServerError)
- `normalize.rs` — Pure validation and normalization functions
- `policy.rs` — Authorization logic (can_view_dot, can_grant_access)
- `commands.rs` — Write-set handlers (create_dot, grant_access, create_link)

## Domain Rules (Non-Negotiable)

These invariants are enforced across the entire codebase:

- **Dots are never edited or deleted.** Changes create new dots + links (`Corrects`, `Supersedes`). Never add mutable fields like `status`, `updated_at`, or `is_deleted`.
- **History is append-only.** ACL changes are append-only grants, never rewrites.
- **Visibility is explicit ACL snapshots at creation.** No retroactive access from group membership changes. Sharing later = append a new grant.
- **dotrc-core is pure.** No I/O, no databases, no async, no HTTP, no platform-specific code. Adapters gather data; core decides.
- **Multi-tenancy is always explicit.** All entities belong to a tenant. Never assume global namespace.
- **Links are semantic, not structural.** Directed and typed (followup, corrects, supersedes, related). Dots exist independently of links.

## Commit Convention

Conventional Commits enforced by commitlint in CI.

Format: `type(scope): subject`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `chore`, `ci`

Scopes: `core`, `wasm`, `server`, `worker`, `web`, `sdk`, `docs`, `repo`, `infra`, `deps`

## Documentation

The `docs/` folder is **canonical and binding**. When code and docs disagree, it's a bug. If changing core behavior, update docs in the same commit. Key docs: `overview.md`, `core-architecture.md`, `data-model.md`, `glossary.md`.

## Autonomous Issue Workflow

When given a list of GitHub issues to implement as stacked PRs:

1. **Read all issues first** with `gh issue view <number>` to understand scope and ordering.
2. **Work in order.** Each issue gets its own branch based on the previous one (stacked):
   - Issue 1: `git checkout -b issue-<N1> main`
   - Issue 2: `git checkout -b issue-<N2> issue-<N1>`
   - Issue 3: `git checkout -b issue-<N3> issue-<N2>`
3. **For each issue:**
   - Create the branch from the previous branch (or main for the first)
   - Implement the change, following the architecture and domain rules above
   - Run `make test` (or the relevant subset) and fix until passing
   - Run `make lint` and fix any issues
   - Commit with conventional format: `type(scope): description` — include `Fixes #<number>` in the commit body
   - Push: `git push -u origin <branch>`
   - Create PR with `gh pr create --base <previous-branch> --title "..." --body "..."`
4. **PR body format:**
   ```
   ## Summary
   <what and why>

   Fixes #<number>

   ## Test plan
   - [ ] <verification steps>
   ```
5. **If stuck on an issue**, skip it — create a comment on the issue explaining what blocked you and move to the next one.
6. **Never force-push or rewrite history** on branches that already have PRs.
