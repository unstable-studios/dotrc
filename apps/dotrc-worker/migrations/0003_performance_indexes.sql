-- Composite index covering the listDotsForUser query's
-- WHERE tenant_id = ? ... ORDER BY created_at DESC pattern.
-- Allows a single index scan instead of a full table scan + sort.
CREATE INDEX IF NOT EXISTS idx_dots_tenant_created_at ON dots(tenant_id, created_at DESC);
