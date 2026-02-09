# Embedded Usage (Local-First)

The `dotrc` package lets you run DotRC entirely in the browser without a server. It bundles the WASM core with pluggable storage adapters for local-first applications.

## Installation

```bash
npm install dotrc
# or
pnpm add dotrc
```

You also need the WASM module. Build it from source:

```bash
make build-wasm
```

## Quick Start

```typescript
import { Dotrc, MemoryStorage } from "dotrc";
// Import the WASM module (bundler handles .wasm loading)
import * as wasm from "dotrc-core-wasm/dotrc_core_wasm.js";

const dotrc = Dotrc.open(
  { tenant: "my-app", user: "alice" },
  wasm,
);

// Create a dot
const { dot_id } = await dotrc.createDot({
  title: "Local note",
  body: "This is stored in the browser.",
  tags: ["local"],
});

// Retrieve it
const dot = await dotrc.getDot(dot_id);
console.log(dot.title); // "Local note"

// Clean up
await dotrc.close();
```

## Storage Adapters

### In-Memory (default)

Data lives in memory and is lost when the page closes. Useful for testing and server-side rendering.

```typescript
import { Dotrc, MemoryStorage } from "dotrc";

const dotrc = Dotrc.open(
  { tenant: "test", user: "alice" },
  wasm,
);
```

### IndexedDB (persistent)

Data persists in the browser's IndexedDB. Survives page refreshes and browser restarts.

```typescript
import { Dotrc, IndexedDBStorage } from "dotrc";

const dotrc = Dotrc.open(
  {
    tenant: "my-app",
    user: "alice",
    storage: new IndexedDBStorage(),
  },
  wasm,
);
```

You can pass a custom database name to avoid collisions:

```typescript
const storage = new IndexedDBStorage("my-app-dotrc");
```

### Custom Storage

Implement the `EmbeddedStorage` interface for any storage backend:

```typescript
import type { EmbeddedStorage, Dot, VisibilityGrant, Link } from "dotrc";

class MyStorage implements EmbeddedStorage {
  async storeDot(dot: Dot, grants: VisibilityGrant[], links: Link[]): Promise<void> { /* ... */ }
  async getDot(tenantId: string, dotId: string): Promise<Dot | null> { /* ... */ }
  async getGrants(tenantId: string, dotId: string): Promise<VisibilityGrant[]> { /* ... */ }
  async listDots(tenantId: string, userId: string, limit: number, offset: number) { /* ... */ }
  async storeGrants(grants: VisibilityGrant[]): Promise<void> { /* ... */ }
  async storeLink(link: Link, tenantId: string): Promise<void> { /* ... */ }
  async getLinks(tenantId: string, dotId: string): Promise<Link[]> { /* ... */ }
  async close(): Promise<void> { /* ... */ }
}
```

## API

The `Dotrc` class mirrors the `DotrcClient` API from `dotrc-sdk`, making it easy to swap between local and remote modes.

### `Dotrc.open(config, wasm)`

Create a new embedded instance.

```typescript
const dotrc = Dotrc.open({
  tenant: "my-app",        // Required: tenant isolation
  user: "alice",           // Required: current user ID
  scopeMemberships: [],    // Optional: user's scope memberships
  storage: new IndexedDBStorage(),  // Optional: defaults to MemoryStorage
}, wasm);
```

### `dotrc.createDot(input)`

Create a new dot. Same input as `DotrcClient.createDot()`.

### `dotrc.getDot(dotId)`

Retrieve a dot. Returns `null` if not found or not visible to the current user.

### `dotrc.listDots(options?)`

List dots visible to the current user with pagination.

### `dotrc.grantAccess(dotId, input)`

Grant access to a dot. Throws `DotrcError` if the user is not authorized.

### `dotrc.createLink(fromDotId, input)`

Create a link between two dots. Both must exist and be in the same tenant.

### `dotrc.getGrants(dotId)` / `dotrc.getLinks(dotId)`

List grants or links for a dot.

### `dotrc.close()`

Close the storage connection. Call this when done to release resources.

## Switching Between Local and Remote

```typescript
import { Dotrc } from "dotrc";
import { DotrcClient } from "dotrc-sdk";

// Both share the same API surface
type DotrcApi = Dotrc | DotrcClient;

function createApi(mode: "local" | "remote"): DotrcApi {
  if (mode === "local") {
    return Dotrc.open({ tenant: "app", user: "alice" }, wasm);
  }
  return new DotrcClient({ baseUrl: "https://api.dotrc.dev", token: "..." });
}
```

## Error Handling

```typescript
import { DotrcError } from "dotrc";

try {
  await dotrc.createDot({ title: "" });
} catch (err) {
  if (err instanceof DotrcError) {
    console.error(`${err.kind}: ${err.message}`);
    // kind: "Validation" | "Authorization" | "Link" | "ServerError"
  }
}
```
