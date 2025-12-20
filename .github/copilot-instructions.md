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

When generating or updating documentation files in the `docs/` folder, ensure that they accurately reflect the core principles and architecture of DotRC as outlined above. Documentation should be clear, concise, and focused on invariants rather than implementation details.

Whenever making changes to the codebase that affect core concepts (e.g., Dots, Links, ACLs), developer experience/setup, or other critical aspects, update the relevant documentation files to maintain consistency and clarity, including docs/ and the root README.md if necessary.
