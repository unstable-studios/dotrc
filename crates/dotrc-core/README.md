# dotrc-core

**Portable, pure domain and policy engine for DotRC.**

## What It Is

dotrc-core is a **pure Rust library** that implements the domain model, validation, and authorization logic for DotRC. It contains **no I/O, no database access, no external integrations**.

This crate is designed to:

- Compile to native Rust and WASM
- Be reusable across SaaS (Cloudflare Workers) and self-hosted deployments
- Enable deterministic testing without mocks or fixtures

## Architecture

### Command → Write-Set Pattern

All operations follow a pure functional pattern:

```
Input → Validation → Policy Decision → Write-Set (records to persist)
```

Core **never performs side effects**. Adapters:

1. Gather data (existing dots, grants, memberships)
2. Call core functions
3. Persist the returned write-sets

### Core Responsibilities

1. **Domain Types** - Immutable primitives (Dot, Link, VisibilityGrant)
2. **Validation** - Normalize and validate inputs deterministically
3. **Authorization** - ACL policy decisions based on provided facts
4. **Commands** - Return write-sets for create, grant, link operations

### What Core Does NOT Do

- ❌ Query databases
- ❌ Make HTTP requests
- ❌ Access filesystems
- ❌ Perform async operations
- ❌ Know about Slack, Cloudflare, or any platform

## Core Principles

### Immutability

Dots are **never edited or deleted**. Changes are expressed as new dots with links:

```rust
// ❌ WRONG - trying to mutate
dot.title = "Updated Title";  // Won't compile - no mutable fields

// ✅ CORRECT - create new dot
let corrected_dot = create_dot(corrected_draft, &clock, &id_gen)?;
create_link(
    &corrected_dot,
    &original_dot,
    LinkType::Corrects,
    LinkGrants { from: ..., to: ... },
    ...,
)?;
```

### Explicit ACLs

Visibility is **snapshotted at creation**:

```rust
// Dot created visible to engineering scope
let result = create_dot(draft, &clock, &id_gen)?;
// Grants capture who could see it at THIS moment
// ✅ Grants never change retroactively

// To share later, append new grants
let new_grants = grant_access(&dot, &existing_grants,
    vec![new_user_id], vec![], &context, &clock)?;
```

### Pure Functions

All core logic is deterministic:

```rust
// Same inputs → same outputs, always
let title1 = normalize_title("  Test  ")?;
let title2 = normalize_title("  Test  ")?;
assert_eq!(title1, title2);  // Always true
```

## Usage Example

### 1. Implement Dependency Injection Traits

```rust
use dotrc_core::types::{Clock, IdGen, DotId, Timestamp};

struct SystemClock;
impl Clock for SystemClock {
    fn now(&self) -> Timestamp {
        chrono::Utc::now().to_rfc3339()
    }
}

struct UuidIdGen;
impl IdGen for UuidIdGen {
    fn generate_dot_id(&self) -> DotId {
        DotId::new(uuid::Uuid::new_v4().to_string())
    }
    fn generate_attachment_id(&self) -> String {
        uuid::Uuid::new_v4().to_string()
    }
}
```

### 2. Create a Dot

```rust
use dotrc_core::{
    commands::create_dot,
    types::{DotDraft, UserId, TenantId, ScopeId},
};

let draft = DotDraft {
    title: "Sprint Planning Notes".to_string(),
    body: Some("Discussed upcoming features".to_string()),
    created_by: UserId::new("alice"),
    tenant_id: TenantId::new("acme-corp"),
    scope_id: Some(ScopeId::new("eng-channel")),
    tags: vec!["meeting".to_string(), "planning".to_string()],
    visible_to_users: vec![UserId::new("alice")],
    visible_to_scopes: vec![ScopeId::new("eng-channel")],
    attachments: vec![],
};

let result = create_dot(draft, &SystemClock, &UuidIdGen)?;

// Adapter persists the write-set
database.insert_dot(&result.dot).await?;
database.insert_grants(&result.grants).await?;
```

### 3. Check Authorization

```rust
use dotrc_core::policy::{AuthContext, can_view_dot};

// Adapter provides context
let context = AuthContext::new(
    UserId::new("bob"),
    vec![ScopeId::new("eng-channel")],  // Bob's scope memberships
);

// Core makes decision
match can_view_dot(&dot, &grants, &context) {
    Ok(()) => {
        // Bob can see it - return to client
        send_dot_to_client(&dot).await?;
    }
    Err(_) => {
        // Permission denied
        return Err(AuthError::Forbidden);
    }
}
```

### 4. Grant Access

```rust
use dotrc_core::commands::grant_access;

let new_grants = grant_access(
    &dot,
    &existing_grants,
    vec![UserId::new("charlie")],  // Grant to Charlie
    vec![],
    &alice_context,  // Alice is granting
    &SystemClock,
)?;

// Adapter persists
database.insert_grants(&new_grants.grants).await?;
```

### 5. Create Links

```rust
use dotrc_core::{commands::create_link, types::LinkType};

let link = create_link(
    &followup_dot,
    &original_dot,
    LinkType::Followup,
    LinkGrants {
        from: &followup_grants,
        to: &original_grants,
    },
    &existing_links,
    &context,
    &SystemClock,
)?;

database.insert_link(&link.link).await?;
```

## Testing

All tests are pure and deterministic.

### Test Types

- **Unit tests**: live inside modules under a `#[cfg(test)] mod tests` block.
- **Integration tests**: live in `crates/dotrc-core/tests/` and exercise end-to-end flows.
- **Doc tests**: code blocks in documentation comments (e.g., `src/lib.rs`) compiled and run.

### Common Commands

```bash
cargo test -p dotrc-core           # run unit + integration + doctests for this crate
cargo test --doc -p dotrc-core     # run only doctests
cargo test --test integration_test # run a specific integration test target
```

Tests use simple test doubles for `Clock` and `IdGen`:

```rust
struct TestClock { time: String }
impl Clock for TestClock {
    fn now(&self) -> Timestamp { self.time.clone() }
}
```

No mocks, no database fixtures, no async complexity.

## Integration

### Cloudflare Workers (SaaS)

```
apps/dotrc-worker → dotrc-core-wasm → dotrc-core
```

### Self-Hosted (Enterprise)

```
crates/dotrc-server → dotrc-core
```

Both adapters implement:

- Database queries (fetch dots/grants)
- External integrations (Slack auth, etc.)
- HTTP handlers
- Storage (D1, Postgres)

Core remains pure and portable.

## License

See repository root.
