# Glossary

Concise definitions for DotRC terms. Refer to architecture and data model docs for deeper detail.

- **Dot**: Immutable fact record (title/body, created_by, optional scope, tags, attachments). Never edited or deleted.
- **Link**: Directed, typed relation between dots (`Followup`, `Corrects`, `Supersedes`, `Related`). Optional; no required chains.
- **VisibilityGrant (ACL)**: Append-only record granting a user (principal) access to a dot. Captured as a snapshot at creation; later sharing adds more grants.
- **Scope**: Context/provenance (channel, project, team). Used for expansion at creation; not an enforcement mechanism in core.
- **Tenant**: Isolation boundary. Every entity belongs to exactly one tenant; cross-tenant references are invalid.
- **Tag**: Optional, normalized label on a dot; for grouping/filtering, not semantics.
- **AttachmentRef**: Metadata pointer to externally stored file (hash, size, storage key). Immutable.
- **Integration**: Tenant-level connection to an external provider (e.g., Slack), holding workspace/org context and credentials (adapter-managed).
- **ExternalIdentity**: Per-user mapping to an integration’s user id; keeps internal user stable across re-linking.
- **Command**: Input to core describing an intent (e.g., `create_dot`).
- **Write-set**: Deterministic output from core (dots, links, grants) to be persisted atomically by the adapter.
- **Adapter**: Platform-specific boundary (worker/server) that gathers facts, resolves scope membership, and persists write-sets. Core stays pure.
- **ACL Snapshot**: The explicit principal list captured when a dot is created. Immutable; later access requires new grants.
- **Policy**: Deterministic authorization rules in core (can_view, can_grant, can_link) operating only on provided facts.
