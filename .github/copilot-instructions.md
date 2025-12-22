# Copilot Instructions — DotRC

This repository implements **DotRC**, an append-only record system for immutable facts (“dots”).
When generating code, suggestions MUST respect the architectural and domain constraints below.

If there is ambiguity, prefer **boring, explicit, and conservative** designs.

---

## Core Principles (Do Not Violate)

### 1. Immutability is sacred

- Dots are **never edited or deleted**
- Any “change” must result in a **new dot**
- Corrections, updates, or overrides are represented via **links** (`corrects`, `supersedes`)
- Never suggest mutable fields like `status`, `updated_at`, or `is_deleted` on a dot

If you feel tempted to mutate, stop and create a new dot instead.

---

### 2. Append-only history

- All state changes are modeled as **new records**
- ACL changes are append-only grants, never rewrites
- History must always be reconstructable

---

### 3. Explicit visibility (ACLs)

- Visibility is determined by **explicit ACL snapshots at creation**
- No retroactive access based on group membership changes
- Sharing later = append a new visibility grant record
- Never infer permissions dynamically from current Slack/channel membership

If access is unclear, default to **deny**.

---

### 4. dotrc-core is pure

`dotrc-core`:

- MUST NOT perform I/O
- MUST NOT access databases
- MUST NOT call external services
- MUST NOT depend on async runtimes
- MUST NOT know about Slack, HTTP, Cloudflare, or storage

`dotrc-core`:

- Defines domain types, validation, normalization, and policy decisions
- Accepts facts as inputs, returns decisions or write-sets as outputs

Adapters gather data. Core decides.

---

### 5. Command → write-set model

Core logic should be structured as:

- input command
- validation + policy
- returned records to persist

Core functions should **not** persist anything directly.

---

### 6. Links are semantic, not structural

- Links are **directed** and **typed**
- Dots do not require links to exist
- “Chains” or “trails” are derived views, not enforced structures

Do not suggest mandatory parent/child relationships.

---

### 7. Tags are optional and sparse

- Tags are labels, not relationships
- Do not overload tags to replace links
- Prefer links for meaning, tags for grouping

---

### 8. Multi-tenancy is always explicit

- All persisted entities belong to a tenant
- Never assume a global namespace
- IDs are scoped to tenants

---

## Repository Structure Awareness

- `crates/dotrc-core`  
  Pure domain + policy engine (Rust)

- `crates/dotrc-core-wasm`  
  WASM wrapper around the core

- `apps/dotrc-worker`  
  Cloudflare Workers SaaS adapter

- `crates/dotrc-server`  
  Self-hosted / enterprise adapter

- `docs/`  
  Canonical source of truth for invariants and intent

Do not blur responsibilities across these layers.

---

## Preferred Patterns

- Small, explicit types over “god structs”
- Functions over inheritance
- Traits only when abstraction is required
- Deterministic behavior over cleverness
- Clear naming over brevity

---

## Anti-Patterns (Avoid)

- Mutable dot fields
- Implicit permission checks
- “Soft deletes”
- State machines or workflow logic
- Retroactive access changes
- Database logic in core
- Platform-specific code in core
- Over-generalization before it’s needed

---

## When Unsure

If unsure how to model something, prefer:

- a new dot
- an explicit link
- an append-only record
- or leaving it out entirely

Ask:

> “Does this help Future Me prove that something happened?”

If not, it probably doesn’t belong.

---

## Tone for Suggestions

- Conservative
- Explicit
- Minimal
- Domain-aligned

DotRC values correctness and trustworthiness over speed or convenience.

---

## Repo Hygiene and Documentation

### Documentation as Contract

Documentation in the `docs/` folder is **canonical and binding**. It describes invariants, not implementation suggestions. When code and docs disagree, this is a bug.

**Before making changes:**

1. Read relevant docs to understand the system's intent
2. If changing core behavior, update docs **in the same commit**
3. If docs are unclear or wrong, fix them

**Documentation Accuracy Requirements:**

When updating or reviewing documentation:

- **Verify limits and constants** against actual code (e.g., `MAX_TAGS`, `MAX_TITLE_LENGTH`)
- **Check type names and variants** match implementation (error types, enums, structs)
- **Validate field names and schemas** against type definitions
- **Ensure HTTP status codes** match error kind mappings in adapters
- **Confirm terminology consistency** across all docs (use glossary as reference)

**Critical areas requiring vigilance:**

- `docs/data-model.md`: All field names, limits, and constraints must match `crates/dotrc-core/src/types.rs` and `normalize.rs`
- `docs/core-architecture.md`: Error types must reflect actual `errors.rs` implementation
- `docs/glossary.md`: Single source of truth for terminology; other docs should use these exact terms
- `README.md`: Feature claims and architecture must align with current codebase

**Documentation Review Process:**

When asked to review or update documentation:

1. **Cross-reference code**: Read relevant Rust files to verify claims
2. **Check constants**: Grep for `const.*MAX`, `const.*LIMIT` to find actual values
3. **Verify types**: Read type definitions, not just comments
4. **Test examples**: Ensure code snippets would actually compile/work
5. **Flag drift**: If docs don't match code, this is a P0 issue

**Anti-patterns in documentation:**

- ❌ "Should" language where "must" is required (e.g., "adapters should expand scopes" → "adapters must expand scopes")
- ❌ Out-of-date limits (claiming 100 MB when code says 50 MB)
- ❌ Missing error variants or mismatched enum names
- ❌ Ambiguous wording that leaves implementation unclear
- ❌ Outdated diagrams that don't reflect current architecture

**When to update docs:**

- Adding/changing core types → update `data-model.md`
- Adding/changing error types → update `core-architecture.md` and `glossary.md`
- Changing limits/constants → update relevant docs
- Adding features → update `README.md` and feature-specific docs
- Changing architectural patterns → update `core-architecture.md` and `overview.md`

Documentation is not separate from code. It's part of the contract.
