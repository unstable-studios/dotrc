# Storage Layer Architecture

This document describes the persistence layer implementation for dotrc-worker using Cloudflare D1 and R2.

## Overview

The storage layer follows the repository's core architectural principles:

- **Clean abstraction**: Platform-agnostic interfaces separate domain logic from storage implementation
- **Adapter pattern**: D1 and R2 adapters implement storage interfaces
- **No logic in storage**: Storage layer only persists and retrieves - all business logic stays in core
- **Explicit interfaces**: Clear contracts for persistence operations
- **Atomic operations**: Transactions ensure consistency

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Worker Handler (index.ts)                │
│                                                               │
│  • Receives HTTP requests                                    │
│  • Calls dotrc-core for validation/policy                    │
│  • Persists write-sets via storage adapters                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Storage Interfaces (storage.ts)                │
│                                                               │
│  • DotStorage: dots, grants, links                           │
│  • AttachmentStorage: file uploads/downloads                 │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  D1DotStorage            │  │  R2AttachmentStorage     │
│  (storage-d1.ts)         │  │  (storage-r2.ts)         │
│                          │  │                          │
│  • Stores metadata       │  │  • Stores file data      │
│  • SQL operations        │  │  • Object storage        │
│  • Atomic batch writes   │  │  • Hierarchical keys     │
└──────────────────────────┘  └──────────────────────────┘
                │                           │
                ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│    Cloudflare D1         │  │    Cloudflare R2         │
│    (SQLite)              │  │    (Object Storage)      │
└──────────────────────────┘  └──────────────────────────┘
```

## Storage Interfaces

### DotStorage

Handles persistence of dots and related entities:

```typescript
interface DotStorage {
  // Store dot + grants + links atomically
  storeDot(request: StoreDotRequest): Promise<StoreDotResult>;
  
  // Retrieve a single dot
  getDot(tenantId: TenantId, dotId: DotId): Promise<Dot | null>;
  
  // Get ACL grants for a dot
  getGrants(tenantId: TenantId, dotId: DotId): Promise<VisibilityGrant[]>;
  
  // List dots visible to user (paginated)
  listDotsForUser(request: ListDotsRequest): Promise<ListDotsResult>;
}
```

### AttachmentStorage

Handles file storage operations:

```typescript
interface AttachmentStorage {
  // Upload file and return storage key
  uploadAttachment(request: UploadAttachmentRequest): Promise<string>;
  
  // Download file by storage key
  getAttachment(storageKey: string): Promise<AttachmentData | null>;
  
  // Generate presigned URL (optional)
  getAttachmentUrl(storageKey: string, expiresIn?: number): Promise<string>;
}
```

## D1 Implementation

### Schema

The D1 schema (see `migrations/0001_initial_schema.sql`) implements the full data model:

- **tenants**: Multi-tenancy isolation
- **users**: Internal user identities
- **scopes**: Context/channels/teams
- **dots**: Immutable records
- **tags**: Sparse labels
- **links**: Directed relationships
- **visibility_grants**: Explicit ACLs
- **attachment_refs**: File metadata
- **external_identities**: Provider mappings
- **integrations**: External service connections
- **scope_memberships**: User-scope relationships

All tables include appropriate indexes for query performance.

### Key Features

**Atomic Operations**

Uses D1 batch API to ensure all-or-nothing writes:

```typescript
const statements = [
  insertDot,
  ...insertTags,
  ...insertGrants,
  ...insertLinks,
];
await db.batch(statements);
```

**Tenant Isolation**

All queries filter by `tenant_id` to enforce multi-tenancy:

```sql
SELECT * FROM dots WHERE tenant_id = ? AND id = ?
```

**Visibility Filtering**

Lists only dots where user has explicit grants:

```sql
SELECT DISTINCT d.*
FROM dots d
JOIN visibility_grants vg ON d.id = vg.dot_id
WHERE d.tenant_id = ?
  AND (vg.user_id = ? OR d.created_by = ?)
```

## R2 Implementation

### Storage Key Structure

Files are organized hierarchically:

```
{tenantId}/{dotId}/{attachmentId}/{filename}
```

Example:
```
tenant-abc/dot-123/att-456/document.pdf
```

This structure provides:
- **Tenant isolation**: Easy to list/delete all tenant data
- **Dot grouping**: Files grouped by parent dot
- **Unique IDs**: Prevents naming conflicts
- **Original names**: Preserves user-provided filenames

### Security

- **Filename sanitization**: Removes path separators and dangerous characters
- **Content-type metadata**: Stored with file for proper delivery
- **Tenant scoping**: Keys include tenant ID for isolation

### Future: Presigned URLs

R2 presigned URLs aren't yet available in Workers runtime. When supported, the adapter will generate time-limited direct access URLs without proxying through the worker.

## Usage

### Creating a Dot

```typescript
// Core validates and returns write-set
const result = core.createDot(draft, timestamp, dotId);

// Adapter persists atomically
if (env.DB) {
  const storage = new D1DotStorage(env.DB);
  await storage.storeDot({
    dot: result.dot,
    grants: result.grants,
    links: result.links,
  });
}
```

### Retrieving a Dot

```typescript
const storage = new D1DotStorage(env.DB);
const dot = await storage.getDot(tenantId, dotId);

if (!dot) {
  return json(404, { error: "not_found" });
}

// Check permissions
const grants = await storage.getGrants(tenantId, dotId);
const canView = 
  dot.created_by === userId ||
  grants.some(g => g.user_id === userId);

if (!canView) {
  return json(403, { error: "forbidden" });
}

return json(200, dot);
```

### Listing Dots

```typescript
const storage = new D1DotStorage(env.DB);
const result = await storage.listDotsForUser({
  tenantId,
  userId,
  limit: 50,
  offset: 0,
});

return json(200, {
  dots: result.dots,
  total: result.total,
  has_more: result.hasMore,
});
```

### Uploading an Attachment

```typescript
const attachmentStorage = new R2AttachmentStorage(env.ATTACHMENTS);
const storageKey = await attachmentStorage.uploadAttachment({
  tenantId,
  dotId,
  filename: "report.pdf",
  contentType: "application/pdf",
  data: fileBuffer,
});

// Store metadata in D1
// storageKey: "tenant-1/dot-123/att-456/report.pdf"
```

## Database Setup

### Local Development

```bash
# Create local D1 database
wrangler d1 create dotrc --local

# Run migrations
wrangler d1 migrations apply dotrc --local

# Create R2 bucket
wrangler r2 bucket create dotrc-attachments
```

### Production

```bash
# Create production D1 database
wrangler d1 create dotrc

# Note the database ID from output
# Update wrangler.jsonc with database_id

# Run migrations
wrangler d1 migrations apply dotrc

# Create R2 bucket
wrangler r2 bucket create dotrc-attachments

# Update wrangler.jsonc with bucket name
```

## Testing

Tests use mock implementations of D1/R2 interfaces:

```bash
# Run all tests
pnpm test

# Type check
pnpm run check
```

See `storage-d1.test.ts` for comprehensive storage layer tests.

## Performance Considerations

### Query Optimization

- Indexes on all foreign keys and frequently queried columns
- LIMIT/OFFSET for pagination
- Batch operations for atomic multi-record writes
- Eager loading of related data (tags, attachments) to avoid N+1 queries

### Scaling

- D1 is SQLite-based with read-from-replica support
- R2 is globally distributed object storage
- Consider connection pooling for high-traffic scenarios
- Add caching layer (KV/Cache API) if needed

## Migration Strategy

### Adding New Tables

1. Create new SQL file in `migrations/`
2. Name with incrementing number: `0002_add_feature.sql`
3. Apply with: `wrangler d1 migrations apply dotrc`

### Schema Changes

D1 supports standard SQLite ALTER TABLE commands:

```sql
ALTER TABLE dots ADD COLUMN new_field TEXT;
```

### Data Backups

```bash
# Export data
wrangler d1 export dotrc --output backup.sql

# Import data
wrangler d1 execute dotrc --file backup.sql
```

## Design Principles

This implementation adheres to the repository's core principles:

✅ **Immutability**: Dots are never edited, only new records created  
✅ **Append-only**: All changes add records, nothing is deleted  
✅ **Explicit ACLs**: Visibility grants are explicit snapshots  
✅ **Tenant isolation**: All operations enforce tenant boundaries  
✅ **No retroactive access**: Grants are point-in-time snapshots  
✅ **Clean abstractions**: Storage interfaces separate from implementation  
✅ **Adapter pattern**: Platform-specific code isolated in adapters  
✅ **Pure core**: Business logic stays in dotrc-core, not storage layer

## Error Handling

Storage operations may fail for various reasons:

- **Constraint violations**: Duplicate keys, foreign key errors
- **Quota limits**: D1/R2 capacity exceeded
- **Network issues**: Temporary connectivity problems

The adapter wraps these as standard JavaScript errors. The worker handler converts them to appropriate HTTP status codes:

- 400: Client errors (validation, duplicates)
- 403: Permission denied
- 500: Server/storage errors
- 503: Service unavailable

## Future Enhancements

- **Read replicas**: Use D1 read replicas for better read performance
- **Caching**: Add KV/Cache API layer for frequently accessed dots
- **Full-text search**: Integrate Cloudflare Workers Search (when available)
- **Analytics**: Track usage patterns with Durable Objects or Analytics Engine
- **Presigned URLs**: Use R2 presigned URLs when available in Workers
- **Compression**: Compress large body text before storage
- **Encryption**: Encrypt sensitive attachments at rest

## Related Documentation

- [Core Architecture](../../docs/core-architecture.md)
- [Data Model](../../docs/data-model.md)
- [WASM Implementation](../../docs/wasm-implementation.md)
