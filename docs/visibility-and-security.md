# Visibility and Security Model

DotRC enforces safety and correctness through explicit, immutable visibility rules.

## Core Rules

- **Snapshot at Creation:** When a dot is created, its visibility is captured as an immutable snapshot of principals (users) who can see it.
- **Explicit Grants Only:** Sharing later is modeled as append-only visibility grants that enumerate specific principals. No retroactive access is inferred from current group/channel membership.
- **Scopes as Provenance:** Scopes (e.g., channels, teams) indicate context and provenance at creation time. They are not used by core to infer access dynamically. Adapters may record the scope, but enforcement relies on explicit principal grants.
- **Immutability:** Dots and grants are append-only. Corrections or superseding are represented via typed links.

## Adapter Responsibilities

Adapters (Workers/Server) gather facts and persist write-sets:

- At dot creation, if visibility references a scope, adapters should resolve scope membership to **explicit user grants** and persist those as part of the ACL snapshot write-set.
- Later sharing (e.g., adding a user) is represented by new `VisibilityGrant` records appended to history.
- Adapters do not retroactively change visibility based on current scope membership; instead, they must create new grants to share with newly joined members.

## Enforcement in Core

Core policy checks are deterministic and based on provided facts:

- `can_view_dot()` returns allowed only if the requester is the creator or is explicitly present in a principal grant for that dot.
- `can_grant_access()` requires the requester to be the creator or an existing viewer.
- `can_create_link()` requires the requester to view both source and target dots.

## Implications

- New members of a scope/channel do **not** gain access to past dots unless explicit grants are added.
- Removing a user from a scope does **not** revoke visibility to past dots; revocation, if supported, must be modeled as an append-only record (future work) and interpreted by adapters.

## Multi-Tenancy Safety

- All dots and grants are tenant-scoped.
- Adapters must ensure target principals for grants are within the same tenant.

## Auditable History

- Visibility decisions are reconstructable from the immutable sequence of dots and grants.
- Scopes and links provide context but do not alter enforcement semantics.
