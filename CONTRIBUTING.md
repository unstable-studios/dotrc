# Contributing to DotRC

Thank you for contributing! Here's how to get started.

## Setup

```bash
# Install dependencies
pnpm install

# Build WASM (required)
./scripts/build-wasm.sh
```

## Testing

We maintain three test suites to ensure code quality across all layers:

### 1. Rust Tests (Core Logic)

Tests domain logic, validation, policy decisions, and WASM bindings.

```bash
# Run all Rust tests
make test-rust
cargo test --workspace

# Run core tests only
make test-core
cargo test -p dotrc-core
```

### 2. WASM Integration Tests

Tests the WASM module and its JSON interface.

```bash
# Build WASM first
./scripts/build-wasm.sh

# Run WASM tests
make test-wasm
node crates/dotrc-core-wasm/tests/integration.mjs
```

### 3. TypeScript Worker Tests

Tests the HTTP handler, auth parsing, error handling, and response formats.

```bash
# Run worker tests
make test-worker
cd apps/dotrc-worker && pnpm test
```

### Run All Tests

```bash
# From repo root
make test
```

This runs all three test suites (Rust → WASM → Worker) and ensures the entire stack is working.

## Type Checking

Always type-check TypeScript before committing:

```bash
make lint
# or: cd apps/dotrc-worker && pnpm typecheck
```

## Development Workflow

1. **Make your changes** in the appropriate layer:

   - Domain logic → `crates/dotrc-core/src/`
   - WASM bindings → `crates/dotrc-core-wasm/src/lib.rs`
   - Worker/API → `apps/dotrc-worker/src/`

2. **Type-check** locally:

   ```bash
   make lint
   ```

3. **Run tests**:

   ```bash
   make test
   ```

4. **Commit** when all tests pass.

## Code Organization

### Pure Domain (No Side Effects)

- `crates/dotrc-core` — Domain types, validation, policy
- Should NOT do I/O, database access, or async work
- Functions should be deterministic

### WASM Boundary

- `crates/dotrc-core-wasm/src/lib.rs` — JSON serialization layer
- Accepts JSON, calls core, returns JSON
- No business logic here

### Adapter (Thin HTTP Layer)

- `apps/dotrc-worker/src/` — REST API handler
- Parses HTTP requests, calls WASM, persists to D1
- No domain logic here

## Documentation

When adding features, update the relevant docs:

- **API changes** → `apps/dotrc-worker/README.md` (examples + diagrams)
- **Core changes** → `docs/core-architecture.md`
- **Data model changes** → `docs/data-model.md`

## User and Scope Auto-Creation (Lazy Strategy)

Users, scopes, and tenants are **lazily created** on first reference. When a dot is created, the adapter calls `D1DotStorage.ensureEntities()` which uses `INSERT OR IGNORE` to idempotently create any referenced tenants, users, and scopes that don't yet exist.

This means:
- No separate admin endpoint or migration is needed to seed users/scopes
- The first API request from a new user automatically provisions their identity
- Duplicate creation attempts are silently ignored (idempotent)
- Display names currently default to the user/scope ID; there is no endpoint yet to update them

## Architecture Principles

See [Copilot Instructions](/.github/copilot-instructions.md) for core principles:

- Immutability is sacred
- Append-only history
- Explicit visibility (ACLs)
- dotrc-core is pure
- Command → write-set model
- Links are semantic
- Tags are optional
- Multi-tenancy is explicit

## Questions?

See the docs in `docs/` for architecture details, design decisions, and glossary.
