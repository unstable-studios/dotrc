-- DotRC Postgres schema (mirrors D1 schema from dotrc-worker)
-- All tables are append-only. Dots are never edited or deleted.

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS scopes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'auto',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scopes_tenant ON scopes(tenant_id);

CREATE TABLE IF NOT EXISTS dots (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    title TEXT NOT NULL,
    body TEXT,
    created_by TEXT NOT NULL REFERENCES users(id),
    scope_id TEXT REFERENCES scopes(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dots_tenant ON dots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dots_created_by ON dots(created_by);
CREATE INDEX IF NOT EXISTS idx_dots_tenant_created_at ON dots(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tags (
    dot_id TEXT NOT NULL REFERENCES dots(id),
    tag TEXT NOT NULL,
    PRIMARY KEY (dot_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

CREATE TABLE IF NOT EXISTS visibility_grants (
    dot_id TEXT NOT NULL REFERENCES dots(id),
    user_id TEXT REFERENCES users(id),
    scope_id TEXT REFERENCES scopes(id),
    granted_at TEXT NOT NULL,
    granted_by TEXT REFERENCES users(id),
    CHECK (user_id IS NOT NULL OR scope_id IS NOT NULL),
    UNIQUE (dot_id, user_id, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_grants_dot ON visibility_grants(dot_id);
CREATE INDEX IF NOT EXISTS idx_grants_user ON visibility_grants(user_id);

CREATE TABLE IF NOT EXISTS links (
    from_dot_id TEXT NOT NULL REFERENCES dots(id),
    to_dot_id TEXT NOT NULL REFERENCES dots(id),
    link_type TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (from_dot_id, to_dot_id, link_type)
);
CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_dot_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_dot_id);

CREATE TABLE IF NOT EXISTS attachment_refs (
    id TEXT PRIMARY KEY,
    dot_id TEXT NOT NULL REFERENCES dots(id),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    content_hash TEXT NOT NULL,
    storage_key TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_dot ON attachment_refs(dot_id);

CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    provider TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider, workspace_id);

CREATE TABLE IF NOT EXISTS external_identities (
    user_id TEXT NOT NULL REFERENCES users(id),
    integration_id TEXT NOT NULL REFERENCES integrations(id),
    external_user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    PRIMARY KEY (user_id, integration_id)
);
CREATE INDEX IF NOT EXISTS idx_ext_id_lookup ON external_identities(integration_id, external_user_id);

CREATE TABLE IF NOT EXISTS scope_memberships (
    scope_id TEXT NOT NULL REFERENCES scopes(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (scope_id, user_id)
);
