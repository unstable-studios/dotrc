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
  TenantId,
  DotId,
  UserId,
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
    const attachmentsByDotId = new Map<string, any[]>();
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
