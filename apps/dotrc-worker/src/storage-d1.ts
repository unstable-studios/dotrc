/**
 * Cloudflare D1 storage adapter implementation.
 * 
 * Provides persistence for dots, grants, links using Cloudflare D1 (SQLite).
 * Follows adapter pattern - gathers facts, persists write-sets from core.
 */

import type {
  DotStorage,
  StoreDotRequest,
  StoreDotResult,
  ListDotsRequest,
  ListDotsResult,
} from "./storage";
import type {
  Dot,
  VisibilityGrant,
  Link,
  AttachmentRef,
  TenantId,
  DotId,
  UserId,
  ScopeId,
} from "./types";

/**
 * D1 database interface (Cloudflare Workers binding).
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  success: boolean;
  error?: string;
  meta?: {
    duration?: number;
    rows_read?: number;
    rows_written?: number;
  };
  results?: T[];
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

/**
 * D1-backed storage implementation for dots and related entities.
 */
export class D1DotStorage implements DotStorage {
  constructor(private db: D1Database) {}

  /**
   * Ensure a tenant exists, creating it idempotently if not.
   * Uses INSERT OR IGNORE for idempotency — no error on duplicate.
   */
  async ensureTenant(tenantId: TenantId, now: string): Promise<void> {
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?)`
      )
      .bind(tenantId, tenantId, now)
      .run();
    if (!result.success) {
      throw new Error(`Failed to ensure tenant ${tenantId}: ${result.error}`);
    }
  }

  /**
   * Ensure a user exists within a tenant, creating it idempotently if not.
   * Uses INSERT OR IGNORE for idempotency — no error on duplicate.
   */
  async ensureUser(
    userId: UserId,
    tenantId: TenantId,
    now: string
  ): Promise<void> {
    await this.ensureTenant(tenantId, now);
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO users (id, tenant_id, display_name, created_at) VALUES (?, ?, ?, ?)`
      )
      .bind(userId, tenantId, userId, now)
      .run();
    if (!result.success) {
      throw new Error(`Failed to ensure user ${userId}: ${result.error}`);
    }
    // Verify tenant isolation: users.id is a global PK, so INSERT OR IGNORE
    // silently keeps the first tenant association. Reject cross-tenant reuse.
    const existing = await this.db
      .prepare(`SELECT tenant_id FROM users WHERE id = ?`)
      .bind(userId)
      .first<{ tenant_id: string }>();
    if (existing && existing.tenant_id !== tenantId) {
      throw new Error(
        `User ${userId} belongs to tenant ${existing.tenant_id}, not ${tenantId}`
      );
    }
  }

  /**
   * Ensure a scope exists within a tenant, creating it idempotently if not.
   * Uses INSERT OR IGNORE for idempotency — no error on duplicate.
   */
  async ensureScope(
    scopeId: ScopeId,
    tenantId: TenantId,
    now: string
  ): Promise<void> {
    await this.ensureTenant(tenantId, now);
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO scopes (id, tenant_id, name, type, created_at) VALUES (?, ?, ?, ?, ?)`
      )
      .bind(scopeId, tenantId, scopeId, "auto", now)
      .run();
    if (!result.success) {
      throw new Error(`Failed to ensure scope ${scopeId}: ${result.error}`);
    }
    // Verify tenant isolation: scopes.id is a global PK, so INSERT OR IGNORE
    // silently keeps the first tenant association. Reject cross-tenant reuse.
    const existing = await this.db
      .prepare(`SELECT tenant_id FROM scopes WHERE id = ?`)
      .bind(scopeId)
      .first<{ tenant_id: string }>();
    if (existing && existing.tenant_id !== tenantId) {
      throw new Error(
        `Scope ${scopeId} belongs to tenant ${existing.tenant_id}, not ${tenantId}`
      );
    }
  }

  /**
   * Ensure all referenced users and scopes exist before storing a dot.
   * This implements lazy creation: entities are auto-created on first reference.
   */
  async ensureEntities(request: StoreDotRequest, now: string): Promise<void> {
    const { dot, grants } = request;

    // Ensure tenant exists first (other ensures depend on it)
    await this.ensureTenant(dot.tenant_id, now);

    // Collect and deduplicate all user/scope IDs
    const userIds = new Set<string>();
    const scopeIds = new Set<string>();

    userIds.add(dot.created_by);
    if (dot.scope_id) {
      scopeIds.add(dot.scope_id);
    }

    for (const grant of grants) {
      if (grant.user_id) userIds.add(grant.user_id);
      if (grant.scope_id) scopeIds.add(grant.scope_id);
      if (grant.granted_by) userIds.add(grant.granted_by);
    }

    // Ensure all users and scopes in parallel (tenant already ensured above)
    await Promise.all([
      ...Array.from(userIds).map((uid) =>
        this.ensureUser(uid, dot.tenant_id, now)
      ),
      ...Array.from(scopeIds).map((sid) =>
        this.ensureScope(sid, dot.tenant_id, now)
      ),
    ]);
  }

  /**
   * Store a dot with its grants and links atomically using D1 batch.
   */
  async storeDot(request: StoreDotRequest): Promise<StoreDotResult> {
    const { dot, grants, links } = request;

    const statements: D1PreparedStatement[] = [];

    // Insert dot
    statements.push(
      this.db
        .prepare(
          `INSERT INTO dots (
            id, tenant_id, title, body, created_by, scope_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          dot.id,
          dot.tenant_id,
          dot.title,
          dot.body || null,
          dot.created_by,
          dot.scope_id || null,
          dot.created_at
        )
    );

    // Insert tags
    for (const tag of dot.tags) {
      statements.push(
        this.db
          .prepare(`INSERT INTO tags (dot_id, tag) VALUES (?, ?)`)
          .bind(dot.id, tag)
      );
    }

    // Insert visibility grants
    for (const grant of grants) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO visibility_grants (
              dot_id, user_id, scope_id, granted_at, granted_by
            ) VALUES (?, ?, ?, ?, ?)`
          )
          .bind(
            grant.dot_id,
            grant.user_id || null,
            grant.scope_id || null,
            grant.granted_at,
            grant.granted_by || null
          )
      );
    }

    // Insert links
    for (const link of links) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO links (
              from_dot_id, to_dot_id, link_type, tenant_id, created_at
            ) VALUES (?, ?, ?, ?, ?)`
          )
          .bind(
            link.from_dot_id,
            link.to_dot_id,
            link.link_type,
            dot.tenant_id,
            link.created_at
          )
      );
    }

    // Insert attachment refs (if any)
    for (const attachment of dot.attachments) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO attachment_refs (
              id, dot_id, filename, mime_type, size_bytes, content_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            attachment.id,
            dot.id,
            attachment.filename,
            attachment.mime_type,
            attachment.size_bytes,
            attachment.content_hash,
            attachment.created_at
          )
      );
    }

    // Execute batch atomically
    const results = await this.db.batch(statements);

    // Check for errors
    for (const result of results) {
      if (!result.success) {
        throw new Error(`D1 batch operation failed: ${result.error}`);
      }
    }

    return {
      success: true,
      dotId: dot.id,
    };
  }

  /**
   * Retrieve a dot by ID within a tenant.
   */
  async getDot(tenantId: TenantId, dotId: DotId): Promise<Dot | null> {
    // Get dot
    const dotResult = await this.db
      .prepare(
        `SELECT id, tenant_id, title, body, created_by, scope_id, created_at
         FROM dots
         WHERE tenant_id = ? AND id = ?`
      )
      .bind(tenantId, dotId)
      .first<{
        id: string;
        tenant_id: string;
        title: string;
        body: string | null;
        created_by: string;
        scope_id: string | null;
        created_at: string;
      }>();

    if (!dotResult) {
      return null;
    }

    // Get tags
    const tagsResult = await this.db
      .prepare(`SELECT tag FROM tags WHERE dot_id = ?`)
      .bind(dotId)
      .all<{ tag: string }>();

    const tags = tagsResult.results?.map((r) => r.tag) || [];

    // Get attachments
    const attachmentsResult = await this.db
      .prepare(
        `SELECT id, filename, mime_type, size_bytes, content_hash, created_at
         FROM attachment_refs
         WHERE dot_id = ?`
      )
      .bind(dotId)
      .all<{
        id: string;
        filename: string;
        mime_type: string;
        size_bytes: number;
        content_hash: string;
        created_at: string;
      }>();

    const attachments =
      attachmentsResult.results?.map((r) => ({
        id: r.id,
        filename: r.filename,
        mime_type: r.mime_type,
        size_bytes: r.size_bytes,
        content_hash: r.content_hash,
        created_at: r.created_at,
      })) || [];

    return {
      id: dotResult.id,
      tenant_id: dotResult.tenant_id,
      title: dotResult.title,
      body: dotResult.body || undefined,
      created_by: dotResult.created_by,
      scope_id: dotResult.scope_id || undefined,
      created_at: dotResult.created_at,
      tags,
      attachments,
    };
  }

  /**
   * Retrieve visibility grants for a specific dot.
   */
  async getGrants(tenantId: TenantId, dotId: DotId): Promise<VisibilityGrant[]> {
    const result = await this.db
      .prepare(
        `SELECT vg.dot_id, vg.user_id, vg.scope_id, vg.granted_at, vg.granted_by
         FROM visibility_grants vg
         JOIN dots d ON vg.dot_id = d.id
         WHERE d.tenant_id = ? AND vg.dot_id = ?`
      )
      .bind(tenantId, dotId)
      .all<{
        dot_id: string;
        user_id: string | null;
        scope_id: string | null;
        granted_at: string;
        granted_by: string | null;
      }>();

    return (
      result.results?.map((r) => ({
        dot_id: r.dot_id,
        user_id: r.user_id || undefined,
        scope_id: r.scope_id || undefined,
        granted_at: r.granted_at,
        granted_by: r.granted_by || undefined,
      })) || []
    );
  }

  /**
   * Store additional visibility grants for an existing dot.
   * Grants are append-only — never deleted.
   */
  async storeGrants(grants: VisibilityGrant[]): Promise<void> {
    if (grants.length === 0) return;

    const statements: D1PreparedStatement[] = [];
    for (const grant of grants) {
      statements.push(
        this.db
          .prepare(
            `INSERT OR IGNORE INTO visibility_grants (
              dot_id, user_id, scope_id, granted_at, granted_by
            ) VALUES (?, ?, ?, ?, ?)`
          )
          .bind(
            grant.dot_id,
            grant.user_id || null,
            grant.scope_id || null,
            grant.granted_at,
            grant.granted_by || null
          )
      );
    }

    const results = await this.db.batch(statements);
    for (const result of results) {
      if (!result.success) {
        throw new Error(`D1 batch operation failed: ${result.error}`);
      }
    }
  }

  /**
   * Store a link between two dots.
   */
  async storeLink(link: Link, tenantId: TenantId): Promise<void> {
    const result = await this.db
      .prepare(
        `INSERT INTO links (
          from_dot_id, to_dot_id, link_type, tenant_id, created_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        link.from_dot_id,
        link.to_dot_id,
        link.link_type,
        tenantId,
        link.created_at
      )
      .run();
    if (!result.success) {
      throw new Error(`Failed to store link: ${result.error}`);
    }
  }

  /**
   * Retrieve links for a specific dot (both from and to).
   */
  async getLinks(tenantId: TenantId, dotId: DotId): Promise<Link[]> {
    const result = await this.db
      .prepare(
        `SELECT from_dot_id, to_dot_id, link_type, created_at
         FROM links
         WHERE tenant_id = ? AND (from_dot_id = ? OR to_dot_id = ?)`
      )
      .bind(tenantId, dotId, dotId)
      .all<{
        from_dot_id: string;
        to_dot_id: string;
        link_type: string;
        created_at: string;
      }>();

    if (!result.success) {
      throw new Error(`Failed to get links for dot ${dotId}: ${result.error}`);
    }

    return (
      result.results?.map((r) => ({
        from_dot_id: r.from_dot_id,
        to_dot_id: r.to_dot_id,
        link_type: r.link_type as Link["link_type"],
        created_at: r.created_at,
      })) || []
    );
  }

  /**
   * Store an attachment reference in D1 (metadata only — file data is in R2).
   */
  async storeAttachmentRef(
    dotId: DotId,
    attachment: AttachmentRef
  ): Promise<void> {
    const result = await this.db
      .prepare(
        `INSERT INTO attachment_refs (
          id, dot_id, filename, mime_type, size_bytes, content_hash, storage_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        attachment.id,
        dotId,
        attachment.filename,
        attachment.mime_type,
        attachment.size_bytes,
        attachment.content_hash,
        attachment.storage_key || null,
        attachment.created_at
      )
      .run();
    if (!result.success) {
      throw new Error(
        `Failed to store attachment ref ${attachment.id}: ${result.error}`
      );
    }
  }

  /**
   * Get an attachment reference by ID, scoped to a specific tenant.
   * JOINs with dots to enforce tenant isolation.
   * Returns the attachment metadata and its parent dot_id.
   */
  async getAttachmentRef(
    attachmentId: string,
    tenantId?: TenantId
  ): Promise<(AttachmentRef & { dot_id: DotId }) | null> {
    const query = tenantId
      ? `SELECT ar.id, ar.dot_id, ar.filename, ar.mime_type, ar.size_bytes, ar.content_hash, ar.storage_key, ar.created_at
         FROM attachment_refs ar
         JOIN dots d ON ar.dot_id = d.id
         WHERE ar.id = ? AND d.tenant_id = ?`
      : `SELECT id, dot_id, filename, mime_type, size_bytes, content_hash, storage_key, created_at
         FROM attachment_refs
         WHERE id = ?`;

    const stmt = tenantId
      ? this.db.prepare(query).bind(attachmentId, tenantId)
      : this.db.prepare(query).bind(attachmentId);

    const result = await stmt.first<{
      id: string;
      dot_id: string;
      filename: string;
      mime_type: string;
      size_bytes: number;
      content_hash: string;
      storage_key: string | null;
      created_at: string;
    }>();

    if (!result) return null;

    return {
      id: result.id,
      dot_id: result.dot_id,
      filename: result.filename,
      mime_type: result.mime_type,
      size_bytes: result.size_bytes,
      content_hash: result.content_hash,
      storage_key: result.storage_key || undefined,
      created_at: result.created_at,
    };
  }

  /**
   * List dots visible to a user (based on grants).
   * Returns paginated results.
   */
  async listDotsForUser(request: ListDotsRequest): Promise<ListDotsResult> {
    const { tenantId, userId, limit = 50, offset = 0 } = request;

    // Query dots where user has a grant
    const result = await this.db
      .prepare(
        `SELECT DISTINCT d.id, d.tenant_id, d.title, d.body, d.created_by, d.scope_id, d.created_at
         FROM dots d
         JOIN visibility_grants vg ON d.id = vg.dot_id
         WHERE d.tenant_id = ? 
           AND (vg.user_id = ? OR d.created_by = ?)
         ORDER BY d.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(tenantId, userId, userId, limit + 1, offset)
      .all<{
        id: string;
        tenant_id: string;
        title: string;
        body: string | null;
        created_by: string;
        scope_id: string | null;
        created_at: string;
      }>();

    const rows = result.results || [];
    const hasMore = rows.length > limit;
    const dots = rows.slice(0, limit);

    if (dots.length === 0) {
      return { dots: [], total: 0, hasMore: false };
    }

    // Collect all dot IDs for batch fetching
    const dotIds = dots.map((d) => d.id);
    const dotIdsPlaceholder = dotIds.map(() => "?").join(",");

    // Fetch all tags in one query
    const tagsResult = await this.db
      .prepare(`SELECT dot_id, tag FROM tags WHERE dot_id IN (${dotIdsPlaceholder})`)
      .bind(...dotIds)
      .all<{ dot_id: string; tag: string }>();

    // Group tags by dot_id
    const tagsByDotId = new Map<string, string[]>();
    for (const row of tagsResult.results || []) {
      const tags = tagsByDotId.get(row.dot_id) || [];
      tags.push(row.tag);
      tagsByDotId.set(row.dot_id, tags);
    }

    // Fetch all attachments in one query
    const attachmentsResult = await this.db
      .prepare(
        `SELECT id, dot_id, filename, mime_type, size_bytes, content_hash, created_at
         FROM attachment_refs
         WHERE dot_id IN (${dotIdsPlaceholder})`
      )
      .bind(...dotIds)
      .all<{
        id: string;
        dot_id: string;
        filename: string;
        mime_type: string;
        size_bytes: number;
        content_hash: string;
        created_at: string;
      }>();

    // Group attachments by dot_id
    const attachmentsByDotId = new Map<string, AttachmentRef[]>();
    for (const row of attachmentsResult.results || []) {
      const attachments = attachmentsByDotId.get(row.dot_id) || [];
      attachments.push({
        id: row.id,
        filename: row.filename,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        content_hash: row.content_hash,
        created_at: row.created_at,
      });
      attachmentsByDotId.set(row.dot_id, attachments);
    }

    // Combine dots with their tags and attachments
    const enrichedDots = dots.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      title: row.title,
      body: row.body || undefined,
      created_by: row.created_by,
      scope_id: row.scope_id || undefined,
      created_at: row.created_at,
      tags: tagsByDotId.get(row.id) || [],
      attachments: attachmentsByDotId.get(row.id) || [],
    }));

    return {
      dots: enrichedDots,
      total: enrichedDots.length,
      hasMore,
    };
  }
}
