# DotRC Overview

## **Core idea**

DotRC is an append-only system for logging small, immutable facts (“dots”) so you can prove something happened later without turning it into a workflow tool. It’s about evidence and recall, not management.

## **Dots**

A dot is a single, timestamped, immutable record with a title, optional body, attachments, tags (used sparingly), and metadata about who created it and where it came from. Dots are never edited or deleted. If something changes, you add a new dot.

## **Visibility & safety (ACLs)**

Each dot captures a snapshot of who could see it at creation time (users and/or scopes). This snapshot never changes automatically, which prevents accidental exposure of sensitive information. If you want to share a dot later, you explicitly grant access via an append-only permission event—no cloning, no rewriting history.

## **Users & identity**

Every user has an internal UUID. External services (Slack, future integrations) map to users via ExternalIdentity records. App-level connections to services live in Integrations (tokens, secrets, workspace IDs), keeping user identity separate from provider setup and making multi-tenancy sane.

## **Scopes**

A scope represents the context a dot was created in (Slack channel, project, team, private group, etc.). Scopes are future-proof abstractions, not Slack-specific. Visibility can reference scopes, but access is always resolved explicitly.

## **Links (not chains)**

Dots are individually trustworthy. Relationships between dots are optional and explicit via directed links (followup, corrects, supersedes, related). Chains and trails are _derived views_, not enforced structures. Nothing requires a dot to be linked to exist.

## **Superseding & corrections**

Instead of mutating a dot, newer dots can supersede or correct older ones using links. UIs may prefer the newest dot, but the full history always remains intact.

## **Attachments**

Attachments are first-class: stored separately, hashed for integrity, and referenced by dots. This keeps receipts, screenshots, and docs durable and auditable.

## **Views**

Views (or trails) are saved queries and filters over dots—by scope, tag, links, user, time. They’re not core data structures; they’re perspectives.

## **Architecture philosophy**

The domain model (dots, visibility, links) is portable and integration-agnostic. Storage (D1/Postgres), ingestion (Slack/web/email), and UI are adapters on top. This keeps the core reusable for future tools or licensing.

## **Bottom line**

- Dots are facts, not tasks
- History is append-only
- Visibility is explicit and safe
- Chains are optional, views are derived
- Nothing disappears, nothing silently changes

It’s Git-like where it matters (immutability, provenance), and intentionally boring everywhere else—which is exactly what you want for a system whose job is to remember things correctly.

# **dotrc-core Architecture Summary**

**dotrc-core** is a portable, pure domain/policy engine. It contains no I/O, no storage, no integrations, and no platform-specific logic. It defines _what is allowed_ and _what records should exist_, not _how_ they’re stored or fetched.

The core is designed to compile to both native Rust and WASM, and to be reused by:

- dotrc-worker (Cloudflare Workers / SaaS)
- dotrc-server (self-hosted / enterprise)
- tests and future tools

## **Core responsibilities**

### **1. Immutable domain primitives**

Core defines the canonical types:

- Dot, DotDraft
- UserId, ScopeId, TenantId
- VisibilityGrant (ACL snapshot + explicit grants)
- Link (directed, typed relationships)
- AttachmentRef (metadata only)
- Tag (optional, sparse)

Dots are immutable. Nothing is edited or deleted.

### **2. Validation & normalization (pure functions)**

Core validates and normalizes inputs deterministically:

- titles, bodies, tags
- link formats and targets
- attachment metadata
- content hashes

Example responsibility:

> “Given a draft dot and context, is this a valid dot and what is its canonical form?”

### **3. Authorization & visibility policy (ACL logic)**

Core answers visibility and sharing questions based on _provided facts_:

- Can user X view dot Y?
- Can user X grant access to dot Y?

Visibility is:

- snapshotted at creation
- append-only via explicit grants
- never inferred retroactively

Core never fetches memberships; adapters supply them.

### **4. Command → write-set model**

Actions are handled as commands that return **what should be written**, not side effects.

Examples:

- create dot → returns dot + ACL snapshot + links + attachment refs
- grant access → returns new visibility grant records
- add follow-up → returns new dot + link

Adapters persist the results.

### **5. Links, not chains**

- Links are directed and typed (followup, corrects, supersedes, related)
- Chains/trails are _derived views_, not enforced structures
- Superseding/corrections are represented by links, never mutation

### **6. Minimal injected traits**

Core uses tiny abstractions only where needed:

- Clock (timestamps)
- IdGen (IDs)

No async, no DB traits, no platform leakage.

## **API surface shape (high level)**

Core functions fall into four groups:

1. normalize/validate inputs
2. authorization decisions
3. command handlers that output write-sets
4. optional helpers to interpret dot state (e.g., superseded)

Core never:

- talks to Slack
- queries a database
- performs HTTP
- accesses filesystem/network

## **Key philosophy**

- Dots are facts, not tasks
- History is append-only
- Visibility is explicit and safe
- Rules live in one place
- Adapters deal with reality

This keeps the system small, auditable, portable, and resistant to feature creep.
