# Design Decisions

Short entries capturing the non-negotiable tradeoffs in DotRC.

## Immutability of Dots

- **Decision:** Dots are never edited or deleted; updates are new dots linked via `Corrects`/`Supersedes`.
- **Why:** Guarantees auditability and tamper-evidence; avoids hidden mutable state.
- **Implication:** UIs show latest linked dot; history remains intact.

## Append-Only ACL Snapshots

- **Decision:** Visibility is captured at dot creation as explicit user principals; later sharing appends `VisibilityGrant` records.
- **Why:** Reproducible access decisions; no reliance on ambient group membership.
- **Implication:** New scope members do not gain retroactive access; revocation must be modeled as new append-only facts (future work).

## Explicit Scope Expansion (No Dynamic Inference)

- **Decision:** Scopes are provenance/context, not enforcement. Adapters expand scope members to user grants at creation time.
- **Why:** Prevents retroactive access drift; keeps core deterministic and portable.
- **Implication:** Core evaluates only explicit principals; adapters must perform expansion and provide the facts.

## Directed, Typed Links; No Required Chains

- **Decision:** Links are directed and typed (`Followup`, `Corrects`, `Supersedes`, `Related`) and are optional.
- **Why:** Keeps dots standalone; links express semantics without enforcing hierarchy or workflow.
- **Implication:** No parent/child constraints; derived trails are a view concern.

## Pure dotrc-core; Adapters Do I/O

- **Decision:** `dotrc-core` remains pure (no I/O, no async runtimes, no platform specifics). Adapters gather inputs and persist write-sets.
- **Why:** Testability, portability (WASM/worker/server), and clear separation of concerns.
- **Implication:** Core only validates and emits write-sets; adapters handle storage, identity resolution, and transport.

## Command → Write-Set Contract

- **Decision:** All core entry points take commands and return deterministic write-sets (dots, links, grants).
- **Why:** Enables atomic persistence and easy reasoning about side effects.
- **Implication:** Core never persists; adapters must apply the write-set or fail as a unit.

## Tenant Isolation Is Explicit

- **Decision:** Every entity is tenant-scoped; cross-tenant references are invalid.
- **Why:** Prevents data leakage in multi-tenant SaaS.
- **Implication:** Adapters must reject commands where principals/dots belong to different tenants.

## No Soft Deletes or Status Flags

- **Decision:** No mutable status fields (e.g., `archived`, `deleted`, `is_active`).
- **Why:** Avoids hidden state and accidental revocation; keeps the log append-only.
- **Implication:** Removal/revocation, if ever supported, must be expressed as new immutable records and interpreted by adapters/consumers.
