# dotrc-core-wasm

WASM wrapper around [dotrc-core](../dotrc-core) for use in JavaScript/TypeScript environments (Cloudflare Workers, browsers, Node.js).

## Architecture

This crate exposes `dotrc-core` functionality via `wasm-bindgen` with a JSON-based interface:

- **Pure boundary**: WASM exports accept JSON strings and return JSON strings
- **Explicit DI**: Timestamps and IDs are injected from the adapter (no WASM clock/ID generation)
- **Type-safe wrapper**: TypeScript layer provides type checking (see `apps/dotrc-worker/src/core.ts`)

## Building

```bash
# From repository root
./scripts/build-wasm.sh

# Or manually
cargo build --target wasm32-unknown-unknown --release
wasm-bindgen ../../target/wasm32-unknown-unknown/release/dotrc_core_wasm.wasm \
  --out-dir pkg \
  --target web
```

Outputs generated files to `pkg/`:

- `dotrc_core_wasm.js` - JS glue code
- `dotrc_core_wasm_bg.wasm` - WASM binary
- `dotrc_core_wasm.d.ts` - TypeScript definitions

## Usage

### Node.js

```javascript
import { readFile } from "fs/promises";
import init, { wasm_create_dot } from "./pkg/dotrc_core_wasm.js";

// Load WASM
const wasmBytes = await readFile("./pkg/dotrc_core_wasm_bg.wasm");
await init(wasmBytes);

// Call functions
const result = wasm_create_dot(
  JSON.stringify(draft),
  "2025-12-20T12:00:00Z",
  "dot-123"
);
const parsed = JSON.parse(result);
```

### Cloudflare Workers

```typescript
import { DotrcCore } from "./core";
import * as wasm from "./dotrc_core_wasm.js";

const core = new DotrcCore(wasm);
const result = core.createDot(draft, now, dotId);
```

### Browser

```javascript
import init from "./pkg/dotrc_core_wasm.js";

await init(); // Fetches .wasm automatically
```

## API

All exports follow the pattern:

- **Input**: JSON strings + primitives (timestamp, IDs)
- **Output**: JSON string with `{ type: "ok", data: {...} }` or `{ type: "err", kind, message }`

### Exports

- `core_version()` - Returns core version string
- `wasm_create_dot(draft_json, now, dot_id)` - Create a dot
- `wasm_grant_access(dot_json, grants_json, users_json, scopes_json, context_json, now)` - Grant access
- `wasm_create_link(from_json, to_json, link_type, grants_json, links_json, context_json, now)` - Create link
- `wasm_can_view_dot(dot_json, grants_json, context_json)` - Check view permission
- `wasm_filter_visible_dots(dots_json, grants_json, context_json)` - Filter visible dots

See TypeScript definitions in `apps/dotrc-worker/src/types.ts` for detailed schemas.

## Design Principles

1. **Core stays pure** - No I/O, no side effects, no WASM-specific code in `dotrc-core`
2. **JSON boundary** - Simple, debuggable, language-agnostic interface
3. **Explicit injection** - Adapter controls time and ID generation
4. **Small binary** - Optimized for size with `opt-level = "z"` and `lto = true`

## Development

Test changes:

```bash
./scripts/build-wasm.sh
node crates/dotrc-core-wasm/tests/integration.mjs
```
