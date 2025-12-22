import { describe, it, expect, beforeEach, vi } from "vitest";
import { D1DotStorage, type D1Database } from "./storage-d1";
import type { Dot, VisibilityGrant, Link } from "./types";

// Mock D1 database
class MockD1Database implements D1Database {
  private data: {
    dots: Map<string, any>;
    grants: Map<string, any[]>;
    tags: Map<string, string[]>;
    attachments: Map<string, any[]>;
    links: Map<string, any[]>;
  };

  constructor() {
    this.data = {
      dots: new Map(),
      grants: new Map(),
      tags: new Map(),
      attachments: new Map(),
      links: new Map(),
    };
  }

  prepare(query: string) {
    const self = this;
    const bindings: unknown[] = [];

    return {
      bind(...values: unknown[]) {
        bindings.push(...values);
        return this;
      },
      async run() {
        // Parse INSERT queries
        if (query.includes("INSERT INTO dots")) {
          const [id, tenant_id, title, body, created_by, scope_id, created_at] = bindings;
          self.data.dots.set(id as string, {
            id,
            tenant_id,
            title,
            body,
            created_by,
            scope_id,
            created_at,
          });
        } else if (query.includes("INSERT INTO tags")) {
          const [dot_id, tag] = bindings;
          const tags = self.data.tags.get(dot_id as string) || [];
          tags.push(tag as string);
          self.data.tags.set(dot_id as string, tags);
        } else if (query.includes("INSERT INTO visibility_grants")) {
          const [dot_id, user_id, scope_id, granted_at, granted_by] = bindings;
          const grants = self.data.grants.get(dot_id as string) || [];
          grants.push({ dot_id, user_id, scope_id, granted_at, granted_by });
          self.data.grants.set(dot_id as string, grants);
        } else if (query.includes("INSERT INTO links")) {
          const [from_dot_id, to_dot_id, link_type, tenant_id, created_at] = bindings;
          const links = self.data.links.get(from_dot_id as string) || [];
          links.push({ from_dot_id, to_dot_id, link_type, tenant_id, created_at });
          self.data.links.set(from_dot_id as string, links);
        } else if (query.includes("INSERT INTO attachment_refs")) {
          const [id, dot_id, filename, mime_type, size_bytes, content_hash, created_at] = bindings;
          const attachments = self.data.attachments.get(dot_id as string) || [];
          attachments.push({ id, dot_id, filename, mime_type, size_bytes, content_hash, created_at });
          self.data.attachments.set(dot_id as string, attachments);
        }

        return { success: true, meta: {} };
      },
      async first<T = unknown>(): Promise<T | null> {
        if (query.includes("SELECT") && query.includes("FROM dots")) {
          const [tenant_id, dot_id] = bindings;
          const dot = self.data.dots.get(dot_id as string);
          if (!dot || dot.tenant_id !== tenant_id) {
            return null;
          }
          return dot as T;
        }
        return null;
      },
      async all<T = unknown>() {
        if (query.includes("SELECT tag FROM tags")) {
          const [dot_id] = bindings;
          const tags = self.data.tags.get(dot_id as string) || [];
          return {
            success: true,
            results: tags.map((tag) => ({ tag })) as T[],
          };
        } else if (query.includes("SELECT") && query.includes("FROM attachment_refs")) {
          const [dot_id] = bindings;
          const attachments = self.data.attachments.get(dot_id as string) || [];
          return {
            success: true,
            results: attachments as T[],
          };
        } else if (query.includes("SELECT") && query.includes("FROM visibility_grants")) {
          const [tenant_id, dot_id] = bindings;
          const grants = self.data.grants.get(dot_id as string) || [];
          return {
            success: true,
            results: grants as T[],
          };
        } else if (query.includes("SELECT DISTINCT") && query.includes("FROM dots")) {
          // List dots query
          const [tenant_id, user_id, user_id2, limit, offset] = bindings;
          const results: any[] = [];
          for (const [id, dot] of self.data.dots.entries()) {
            if (dot.tenant_id === tenant_id) {
              const grants = self.data.grants.get(id) || [];
              const hasGrant = grants.some((g: any) => g.user_id === user_id) || dot.created_by === user_id;
              if (hasGrant) {
                results.push(dot);
              }
            }
          }
          return {
            success: true,
            results: results.slice(offset as number, (offset as number) + (limit as number)) as T[],
          };
        }
        return { success: true, results: [] as T[] };
      },
    };
  }

  async batch<T = unknown>(statements: any[]) {
    const results = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  async exec(query: string) {
    return { count: 0, duration: 0 };
  }
}

describe("D1DotStorage", () => {
  let db: MockD1Database;
  let storage: D1DotStorage;

  beforeEach(() => {
    db = new MockD1Database();
    storage = new D1DotStorage(db);
  });

  describe("storeDot", () => {
    it("stores a dot with grants and tags", async () => {
      const dot: Dot = {
        id: "dot-123",
        tenant_id: "tenant-1",
        title: "Test Dot",
        body: "This is a test",
        created_by: "user-1",
        created_at: "2025-12-22T00:00:00Z",
        tags: ["test", "example"],
        attachments: [],
      };

      const grants: VisibilityGrant[] = [
        {
          dot_id: "dot-123",
          user_id: "user-1",
          granted_at: "2025-12-22T00:00:00Z",
        },
        {
          dot_id: "dot-123",
          user_id: "user-2",
          granted_at: "2025-12-22T00:00:00Z",
        },
      ];

      const result = await storage.storeDot({
        dot,
        grants,
        links: [],
      });

      expect(result.success).toBe(true);
      expect(result.dotId).toBe("dot-123");
    });

    it("stores a dot with links", async () => {
      const dot: Dot = {
        id: "dot-456",
        tenant_id: "tenant-1",
        title: "Linked Dot",
        created_by: "user-1",
        created_at: "2025-12-22T00:00:00Z",
        tags: [],
        attachments: [],
      };

      const grants: VisibilityGrant[] = [
        {
          dot_id: "dot-456",
          user_id: "user-1",
          granted_at: "2025-12-22T00:00:00Z",
        },
      ];

      const links: Link[] = [
        {
          from_dot_id: "dot-456",
          to_dot_id: "dot-123",
          link_type: "followup",
          created_at: "2025-12-22T00:00:00Z",
        },
      ];

      const result = await storage.storeDot({
        dot,
        grants,
        links,
      });

      expect(result.success).toBe(true);
      expect(result.dotId).toBe("dot-456");
    });

    it("stores a dot with attachments", async () => {
      const dot: Dot = {
        id: "dot-789",
        tenant_id: "tenant-1",
        title: "Dot with attachments",
        created_by: "user-1",
        created_at: "2025-12-22T00:00:00Z",
        tags: [],
        attachments: [
          {
            id: "att-1",
            filename: "test.pdf",
            mime_type: "application/pdf",
            size_bytes: 1024,
            content_hash: "sha256:abc123",
            created_at: "2025-12-22T00:00:00Z",
          },
        ],
      };

      const grants: VisibilityGrant[] = [
        {
          dot_id: "dot-789",
          user_id: "user-1",
          granted_at: "2025-12-22T00:00:00Z",
        },
      ];

      const result = await storage.storeDot({
        dot,
        grants,
        links: [],
      });

      expect(result.success).toBe(true);
      expect(result.dotId).toBe("dot-789");
    });
  });

  describe("getDot", () => {
    it("retrieves a stored dot", async () => {
      // Store a dot first
      const dot: Dot = {
        id: "dot-123",
        tenant_id: "tenant-1",
        title: "Test Dot",
        body: "This is a test",
        created_by: "user-1",
        created_at: "2025-12-22T00:00:00Z",
        tags: ["test"],
        attachments: [],
      };

      await storage.storeDot({
        dot,
        grants: [
          {
            dot_id: "dot-123",
            user_id: "user-1",
            granted_at: "2025-12-22T00:00:00Z",
          },
        ],
        links: [],
      });

      // Retrieve the dot
      const retrieved = await storage.getDot("tenant-1", "dot-123");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe("dot-123");
      expect(retrieved?.title).toBe("Test Dot");
      expect(retrieved?.tags).toContain("test");
    });

    it("returns null for non-existent dot", async () => {
      const retrieved = await storage.getDot("tenant-1", "nonexistent");
      expect(retrieved).toBeNull();
    });
  });

  describe("getGrants", () => {
    it("retrieves grants for a dot", async () => {
      const dot: Dot = {
        id: "dot-123",
        tenant_id: "tenant-1",
        title: "Test Dot",
        created_by: "user-1",
        created_at: "2025-12-22T00:00:00Z",
        tags: [],
        attachments: [],
      };

      const grants: VisibilityGrant[] = [
        {
          dot_id: "dot-123",
          user_id: "user-1",
          granted_at: "2025-12-22T00:00:00Z",
        },
        {
          dot_id: "dot-123",
          user_id: "user-2",
          granted_at: "2025-12-22T00:00:00Z",
        },
      ];

      await storage.storeDot({ dot, grants, links: [] });

      const retrieved = await storage.getGrants("tenant-1", "dot-123");

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].user_id).toBe("user-1");
      expect(retrieved[1].user_id).toBe("user-2");
    });
  });

  describe("listDotsForUser", () => {
    it("lists dots visible to a user", async () => {
      // Store two dots
      const dot1: Dot = {
        id: "dot-1",
        tenant_id: "tenant-1",
        title: "First Dot",
        created_by: "user-1",
        created_at: "2025-12-22T00:00:00Z",
        tags: [],
        attachments: [],
      };

      const dot2: Dot = {
        id: "dot-2",
        tenant_id: "tenant-1",
        title: "Second Dot",
        created_by: "user-2",
        created_at: "2025-12-22T00:01:00Z",
        tags: [],
        attachments: [],
      };

      await storage.storeDot({
        dot: dot1,
        grants: [
          {
            dot_id: "dot-1",
            user_id: "user-1",
            granted_at: "2025-12-22T00:00:00Z",
          },
        ],
        links: [],
      });

      await storage.storeDot({
        dot: dot2,
        grants: [
          {
            dot_id: "dot-2",
            user_id: "user-1",
            granted_at: "2025-12-22T00:01:00Z",
          },
          {
            dot_id: "dot-2",
            user_id: "user-2",
            granted_at: "2025-12-22T00:01:00Z",
          },
        ],
        links: [],
      });

      const result = await storage.listDotsForUser({
        tenantId: "tenant-1",
        userId: "user-1",
        limit: 10,
        offset: 0,
      });

      expect(result.dots).toHaveLength(2);
      expect(result.dots.map((d) => d.id)).toContain("dot-1");
      expect(result.dots.map((d) => d.id)).toContain("dot-2");
    });

    it("respects pagination", async () => {
      // Store three dots
      for (let i = 1; i <= 3; i++) {
        const dot: Dot = {
          id: `dot-${i}`,
          tenant_id: "tenant-1",
          title: `Dot ${i}`,
          created_by: "user-1",
          created_at: `2025-12-22T00:0${i}:00Z`,
          tags: [],
          attachments: [],
        };

        await storage.storeDot({
          dot,
          grants: [
            {
              dot_id: `dot-${i}`,
              user_id: "user-1",
              granted_at: `2025-12-22T00:0${i}:00Z`,
            },
          ],
          links: [],
        });
      }

      const result = await storage.listDotsForUser({
        tenantId: "tenant-1",
        userId: "user-1",
        limit: 2,
        offset: 0,
      });

      expect(result.dots).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });
});
