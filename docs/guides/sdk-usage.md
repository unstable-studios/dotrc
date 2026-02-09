# TypeScript SDK Usage

The `dotrc-sdk` package provides a type-safe HTTP client for the DotRC API.

## Installation

```bash
npm install dotrc-sdk
# or
pnpm add dotrc-sdk
```

## Quick Start

```typescript
import { DotrcClient } from "dotrc-sdk";

const client = new DotrcClient({
  baseUrl: "https://api.dotrc.dev",
  token: "your-jwt-token",
});

// Create a dot
const { dot_id } = await client.createDot({
  title: "Meeting notes",
  body: "Discussed Q1 priorities...",
  tags: ["meeting", "q1"],
  visible_to_users: ["alice", "bob"],
});

console.log(`Created dot: ${dot_id}`);
```

## Configuration

```typescript
const client = new DotrcClient({
  // Required: API base URL
  baseUrl: "https://api.dotrc.dev",

  // Optional: Bearer token for authentication
  token: "eyJhbG...",

  // Optional: Custom headers (e.g., for trusted header auth)
  headers: {
    "x-tenant-id": "my-team",
    "x-user-id": "alice",
  },

  // Optional: Custom fetch implementation
  fetch: customFetch,
});
```

## Creating Dots

```typescript
const response = await client.createDot({
  title: "Bug report: login page broken",
  body: "Users see a 500 error when clicking...",
  tags: ["bug", "login", "p1"],
  scope_id: "engineering",
  visible_to_users: ["alice", "bob"],
  visible_to_scopes: ["engineering"],
});

// response: { dot_id, created_at, grants_count, links_count }
```

## Retrieving Dots

```typescript
// Get a single dot (returns null if not found)
const dot = await client.getDot("d-abc123...");
if (dot) {
  console.log(dot.title, dot.tags, dot.created_at);
}

// List dots with pagination
const { dots, total, has_more } = await client.listDots({
  limit: 20,
  offset: 0,
});
```

## Granting Access

```typescript
// Share a dot with specific users
const { grants, grants_count } = await client.grantAccess("d-abc123...", {
  user_ids: ["charlie", "dave"],
  scope_ids: ["design-team"],
});
```

## Creating Links

```typescript
// Create a follow-up link
const { link } = await client.createLink("d-abc123...", {
  to_dot_id: "d-def456...",
  link_type: "followup",
});

// Available link types: "followup", "corrects", "supersedes", "related"
```

## Attachments

```typescript
// Upload a file
const file = new File(["content"], "report.pdf", { type: "application/pdf" });
const attachment = await client.uploadAttachment("d-abc123...", file);
console.log(attachment.attachment_id, attachment.content_hash);

// Download a file
const response = await client.getAttachment("att-xyz...");
const blob = await response.blob();
```

## Batch Operations

```typescript
// Create multiple dots at once
const { results } = await client.batchCreateDots([
  { title: "Dot 1", tags: ["batch"] },
  { title: "Dot 2", tags: ["batch"] },
  { title: "Dot 3", tags: ["batch"] },
]);

for (const result of results) {
  if (result.status === "ok") {
    console.log(`Created: ${result.dot_id}`);
  } else {
    console.error(`Failed at index ${result.index}: ${result.error}`);
  }
}

// Batch grant access
await client.batchGrantAccess([
  { dot_id: "d-aaa...", user_ids: ["bob"] },
  { dot_id: "d-bbb...", user_ids: ["charlie"] },
]);
```

## Error Handling

```typescript
import { DotrcClient, DotrcApiError, DotrcNetworkError } from "dotrc-sdk";

try {
  await client.createDot({ title: "" });
} catch (err) {
  if (err instanceof DotrcApiError) {
    // API returned an error response
    console.error(`${err.code}: ${err.detail}`);
    console.error(`Status: ${err.status}, Kind: ${err.kind}`);
    console.error(`Request ID: ${err.requestId}`);
  } else if (err instanceof DotrcNetworkError) {
    // Network failure (DNS, timeout, etc.)
    console.error(`Network error: ${err.message}`);
  }
}
```

## Types

All types are exported from the package:

```typescript
import type {
  Dot,
  CreateDotInput,
  CreateDotResponse,
  VisibilityGrant,
  GrantAccessInput,
  Link,
  CreateLinkInput,
  LinkType,
  ListDotsResponse,
  PaginationOptions,
  DotrcClientConfig,
} from "dotrc-sdk";
```
