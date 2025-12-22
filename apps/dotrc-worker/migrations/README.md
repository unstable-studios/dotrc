# Database Migrations

This directory contains SQL migrations for the D1 database schema.

## Running Migrations

### Local Development

```bash
# Apply migrations to local D1 database
wrangler d1 migrations apply dotrc --local
```

### Production

```bash
# Apply migrations to production D1 database
wrangler d1 migrations apply dotrc
```

## Creating New Migrations

1. Create a new SQL file with an incrementing number:
   - Format: `XXXX_description.sql` (e.g., `0002_add_search_index.sql`)
   - Use leading zeros for proper sorting

2. Write your migration SQL:
   ```sql
   -- Add new table or modify schema
   CREATE TABLE IF NOT EXISTS new_feature (
     id TEXT PRIMARY KEY,
     ...
   );
   
   CREATE INDEX IF NOT EXISTS idx_new_feature ON new_feature(field);
   ```

3. Apply the migration:
   ```bash
   wrangler d1 migrations apply dotrc --local  # Test locally first
   wrangler d1 migrations apply dotrc          # Then production
   ```

## Schema Overview

The current schema includes:

- **tenants**: Multi-tenancy isolation
- **users**: Internal user identities
- **scopes**: Channels/teams/projects
- **dots**: Immutable records
- **tags**: Labels for categorization
- **links**: Relationships between dots
- **visibility_grants**: ACL records
- **attachment_refs**: File metadata
- **external_identities**: Provider mappings
- **integrations**: External service connections
- **scope_memberships**: User-scope relationships

See `0001_initial_schema.sql` for complete table definitions.

## Best Practices

- Always use `IF NOT EXISTS` for CREATE TABLE/INDEX
- Include appropriate foreign keys
- Add indexes for frequently queried columns
- Document changes in migration comments
- Test migrations locally before production
- Migrations are append-only - never edit existing migrations

## Rollback

D1 doesn't support automatic rollback. To revert:

1. Create a new migration that reverses the changes
2. Or restore from a backup:
   ```bash
   wrangler d1 export dotrc --output backup.sql
   wrangler d1 execute dotrc --file backup.sql
   ```

## Migration Tracking

Wrangler automatically tracks which migrations have been applied. Check status:

```bash
wrangler d1 migrations list dotrc
```
