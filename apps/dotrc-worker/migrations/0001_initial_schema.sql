-- Initial schema for dotrc D1 database
-- This schema implements the immutable, append-only data model for dots, grants, links, and related entities.

-- Tenants: Multi-tenancy isolation boundary
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Users: Internal identity for people who create and view dots
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- Scopes: Context where a dot was created (channel, team, project)
CREATE TABLE IF NOT EXISTS scopes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'slack_channel', 'team', 'project', etc.
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_scopes_tenant ON scopes(tenant_id);

-- Dots: Immutable, timestamped records
-- Title and body limits enforced by core
CREATE TABLE IF NOT EXISTS dots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT, -- Optional
  created_by TEXT NOT NULL,
  scope_id TEXT, -- Optional: context where dot was created
  created_at TEXT NOT NULL, -- RFC3339 timestamp
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (scope_id) REFERENCES scopes(id)
);

CREATE INDEX IF NOT EXISTS idx_dots_tenant ON dots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dots_created_by ON dots(created_by);
CREATE INDEX IF NOT EXISTS idx_dots_scope ON dots(scope_id);
CREATE INDEX IF NOT EXISTS idx_dots_created_at ON dots(created_at DESC);

-- Tags: Optional, sparse labels for categorization
-- Tag count and length limits enforced by core
CREATE TABLE IF NOT EXISTS tags (
  dot_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (dot_id, tag),
  FOREIGN KEY (dot_id) REFERENCES dots(id)
);

CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

-- Links: Directed, typed relationships between dots
-- Types: 'followup', 'corrects', 'supersedes', 'related'
CREATE TABLE IF NOT EXISTS links (
  from_dot_id TEXT NOT NULL,
  to_dot_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (from_dot_id, to_dot_id, link_type),
  FOREIGN KEY (from_dot_id) REFERENCES dots(id),
  FOREIGN KEY (to_dot_id) REFERENCES dots(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_dot_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_dot_id);
CREATE INDEX IF NOT EXISTS idx_links_tenant ON links(tenant_id);

-- Visibility Grants: Explicit, append-only ACL records
-- At least one of user_id or scope_id must be set
CREATE TABLE IF NOT EXISTS visibility_grants (
  dot_id TEXT NOT NULL,
  user_id TEXT, -- NULL for scope grants
  scope_id TEXT, -- NULL for user grants
  granted_at TEXT NOT NULL,
  granted_by TEXT, -- Optional: who created the grant
  PRIMARY KEY (dot_id, user_id, scope_id),
  FOREIGN KEY (dot_id) REFERENCES dots(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (scope_id) REFERENCES scopes(id),
  FOREIGN KEY (granted_by) REFERENCES users(id),
  CHECK (user_id IS NOT NULL OR scope_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_grants_dot ON visibility_grants(dot_id);
CREATE INDEX IF NOT EXISTS idx_grants_user ON visibility_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_grants_scope ON visibility_grants(scope_id);

-- Attachment References: Metadata for externally stored files
-- Actual files stored in R2, this table only holds metadata
-- Attachment count and file size limits enforced by core
CREATE TABLE IF NOT EXISTS attachment_refs (
  id TEXT PRIMARY KEY,
  dot_id TEXT NOT NULL,
  filename TEXT NOT NULL, -- Max 255 chars
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_hash TEXT NOT NULL, -- Format: 'algorithm:hash' (e.g., 'sha256:abc123...')
  created_at TEXT NOT NULL,
  FOREIGN KEY (dot_id) REFERENCES dots(id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_dot ON attachment_refs(dot_id);

-- External Identities: Maps internal users to external service identities
CREATE TABLE IF NOT EXISTS external_identities (
  user_id TEXT NOT NULL,
  integration_id TEXT NOT NULL,
  external_user_id TEXT NOT NULL, -- e.g., Slack U0123456
  display_name TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, integration_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (integration_id) REFERENCES integrations(id)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_external_user ON external_identities(integration_id, external_user_id);

-- Integrations: Tenant's connection to external services
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'slack', 'github', etc.
  workspace_id TEXT NOT NULL, -- External workspace/org identifier
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider, workspace_id);

-- Scope Memberships: Users belong to scopes (many-to-many)
CREATE TABLE IF NOT EXISTS scope_memberships (
  scope_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (scope_id, user_id),
  FOREIGN KEY (scope_id) REFERENCES scopes(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_scope ON scope_memberships(scope_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON scope_memberships(user_id);
