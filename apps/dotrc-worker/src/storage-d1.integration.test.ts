import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import { D1DotStorage } from "./storage-d1";
import type { D1Database } from "./storage-d1";
import type { Dot, VisibilityGrant, Link } from "./types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../migrations");

function readMigration(filename: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, filename), "utf-8");
}

/**
 * Apply a migration file by splitting into individual statements
 * and running each via prepare().run(). Miniflare's db.exec() fails
 * on certain DDL statements (CREATE INDEX) with missing result fields.
 */
async function applyMigration(db: any, filename: string): Promise<void> {
  const sql = readMigration(filename);
  const cleaned = sql.replace(/--[^\n]*/g, "");
  const stmts = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of stmts) {
    await db.prepare(stmt).run();
  }
}

let mf: Miniflare;
let storage: D1DotStorage;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  await applyMigration(db, "0001_initial_schema.sql");
  await applyMigration(db, "0002_attachment_storage_key.sql");
  storage = new D1DotStorage(db as unknown as D1Database);
});

afterAll(async () => {
  await mf?.dispose();
});

function makeDot(overrides: Partial<Dot> = {}): Dot {
  return {
    id: `dot-${crypto.randomUUID()}`,
    tenant_id: "tenant-1",
    title: "Test Dot",
    created_by: "user-1",
    created_at: new Date().toISOString(),
    tags: [],
    attachments: [],
    ...overrides,
  };
}

function makeGrant(
  dotId: string,
  userId: string,
  extra: Partial<VisibilityGrant> = {}
): VisibilityGrant {
  return {
    dot_id: dotId,
    user_id: userId,
    granted_at: new Date().toISOString(),
    ...extra,
  };
}

describe("D1DotStorage integration", () => {
  describe("storeDot → getDot round-trip", () => {
    it("stores and retrieves a dot with all fields", async () => {
      const dot = makeDot({
        title: "Round-trip test",
        body: "Some body content",
        tags: ["alpha", "beta"],
      });

      await storage.ensureEntities(
        { dot, grants: [makeGrant(dot.id, dot.created_by)], links: [] },
        dot.created_at
      );
      await storage.storeDot({
        dot,
        grants: [makeGrant(dot.id, dot.created_by)],
        links: [],
      });

      const retrieved = await storage.getDot(dot.tenant_id, dot.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(dot.id);
      expect(retrieved!.title).toBe("Round-trip test");
      expect(retrieved!.body).toBe("Some body content");
      expect(retrieved!.tags).toContain("alpha");
      expect(retrieved!.tags).toContain("beta");
      expect(retrieved!.tenant_id).toBe("tenant-1");
    });

    it("returns null for non-existent dot", async () => {
      const result = await storage.getDot("tenant-1", "nonexistent-id");
      expect(result).toBeNull();
    });

    it("isolates dots by tenant — different tenant returns null", async () => {
      const userId = `user-iso-${crypto.randomUUID()}`;
      const dot = makeDot({ tenant_id: "tenant-iso", created_by: userId });
      await storage.ensureEntities(
        { dot, grants: [makeGrant(dot.id, userId)], links: [] },
        dot.created_at
      );
      await storage.storeDot({
        dot,
        grants: [makeGrant(dot.id, userId)],
        links: [],
      });

      const sameTenant = await storage.getDot("tenant-iso", dot.id);
      expect(sameTenant).not.toBeNull();

      const otherTenant = await storage.getDot("tenant-other", dot.id);
      expect(otherTenant).toBeNull();
    });
  });

  describe("storeGrants → getGrants round-trip", () => {
    it("stores and retrieves grants for a dot", async () => {
      const dot = makeDot();
      const grants = [
        makeGrant(dot.id, "user-1"),
        makeGrant(dot.id, "user-2", { granted_by: "user-1" }),
      ];

      await storage.ensureEntities(
        { dot, grants, links: [] },
        dot.created_at
      );
      await storage.storeDot({ dot, grants, links: [] });

      const retrieved = await storage.getGrants(dot.tenant_id, dot.id);
      expect(retrieved).toHaveLength(2);
      const userIds = retrieved.map((g) => g.user_id);
      expect(userIds).toContain("user-1");
      expect(userIds).toContain("user-2");
    });

    it("appends grants with storeGrants", async () => {
      const dot = makeDot();
      const initialGrants = [makeGrant(dot.id, "user-1")];

      await storage.ensureEntities(
        { dot, grants: initialGrants, links: [] },
        dot.created_at
      );
      await storage.storeDot({ dot, grants: initialGrants, links: [] });

      // Ensure user-3 exists, then add a new grant
      await storage.ensureUser("user-3", dot.tenant_id, dot.created_at);
      await storage.storeGrants([
        makeGrant(dot.id, "user-3", { granted_by: "user-1" }),
      ]);

      const allGrants = await storage.getGrants(dot.tenant_id, dot.id);
      expect(allGrants).toHaveLength(2);
      expect(allGrants.map((g) => g.user_id)).toContain("user-3");
    });
  });

  describe("storeLink → getLinks round-trip", () => {
    it("stores and retrieves a link between two dots", async () => {
      const dot1 = makeDot({ title: "Source" });
      const dot2 = makeDot({ title: "Target" });

      for (const dot of [dot1, dot2]) {
        await storage.ensureEntities(
          { dot, grants: [makeGrant(dot.id, dot.created_by)], links: [] },
          dot.created_at
        );
        await storage.storeDot({
          dot,
          grants: [makeGrant(dot.id, dot.created_by)],
          links: [],
        });
      }

      const link: Link = {
        from_dot_id: dot1.id,
        to_dot_id: dot2.id,
        link_type: "followup",
        created_at: new Date().toISOString(),
      };
      await storage.storeLink(link, dot1.tenant_id);

      const links = await storage.getLinks(dot1.tenant_id, dot1.id);
      expect(links).toHaveLength(1);
      expect(links[0].from_dot_id).toBe(dot1.id);
      expect(links[0].to_dot_id).toBe(dot2.id);
      expect(links[0].link_type).toBe("followup");
    });

    it("retrieves links from either direction", async () => {
      const dot1 = makeDot({ title: "A" });
      const dot2 = makeDot({ title: "B" });

      for (const dot of [dot1, dot2]) {
        await storage.ensureEntities(
          { dot, grants: [makeGrant(dot.id, dot.created_by)], links: [] },
          dot.created_at
        );
        await storage.storeDot({
          dot,
          grants: [makeGrant(dot.id, dot.created_by)],
          links: [],
        });
      }

      const link: Link = {
        from_dot_id: dot1.id,
        to_dot_id: dot2.id,
        link_type: "related",
        created_at: new Date().toISOString(),
      };
      await storage.storeLink(link, dot1.tenant_id);

      // Query from target side
      const linksFromTarget = await storage.getLinks(
        dot2.tenant_id,
        dot2.id
      );
      expect(linksFromTarget).toHaveLength(1);
      expect(linksFromTarget[0].from_dot_id).toBe(dot1.id);
    });
  });

  describe("storeAttachmentRef → getAttachmentRef round-trip", () => {
    it("stores and retrieves an attachment reference", async () => {
      const dot = makeDot();
      await storage.ensureEntities(
        { dot, grants: [makeGrant(dot.id, dot.created_by)], links: [] },
        dot.created_at
      );
      await storage.storeDot({
        dot,
        grants: [makeGrant(dot.id, dot.created_by)],
        links: [],
      });

      const attId = `att-${crypto.randomUUID()}`;
      await storage.storeAttachmentRef(dot.id, {
        id: attId,
        filename: "photo.png",
        mime_type: "image/png",
        size_bytes: 4096,
        content_hash: "sha256:deadbeef",
        storage_key: `${dot.tenant_id}/${dot.id}/uuid/photo.png`,
        created_at: dot.created_at,
      });

      const ref = await storage.getAttachmentRef(attId);
      expect(ref).not.toBeNull();
      expect(ref!.id).toBe(attId);
      expect(ref!.dot_id).toBe(dot.id);
      expect(ref!.filename).toBe("photo.png");
      expect(ref!.storage_key).toBe(
        `${dot.tenant_id}/${dot.id}/uuid/photo.png`
      );
    });

    it("returns null for non-existent attachment ref", async () => {
      const ref = await storage.getAttachmentRef("nonexistent-att");
      expect(ref).toBeNull();
    });
  });

  describe("ensureUser / ensureScope — cross-tenant collision", () => {
    it("rejects a user ID that already belongs to another tenant", async () => {
      const userId = `user-collision-${crypto.randomUUID()}`;
      await storage.ensureTenant("tenant-a", new Date().toISOString());
      await storage.ensureTenant("tenant-b", new Date().toISOString());
      await storage.ensureUser(userId, "tenant-a", new Date().toISOString());

      await expect(
        storage.ensureUser(userId, "tenant-b", new Date().toISOString())
      ).rejects.toThrow(/belongs to tenant tenant-a, not tenant-b/);
    });

    it("rejects a scope ID that already belongs to another tenant", async () => {
      const scopeId = `scope-collision-${crypto.randomUUID()}`;
      await storage.ensureTenant("tenant-c", new Date().toISOString());
      await storage.ensureTenant("tenant-d", new Date().toISOString());
      await storage.ensureScope(
        scopeId,
        "tenant-c",
        new Date().toISOString()
      );

      await expect(
        storage.ensureScope(scopeId, "tenant-d", new Date().toISOString())
      ).rejects.toThrow(/belongs to tenant tenant-c, not tenant-d/);
    });
  });

  describe("ensureEntities — deduplication", () => {
    it("does not fail on duplicate ensure calls", async () => {
      const dot = makeDot({ scope_id: "scope-dedup" });
      const grants = [
        makeGrant(dot.id, "user-1"),
        makeGrant(dot.id, "user-1", { granted_by: "user-1" }),
      ];

      // Call ensureEntities twice — should not throw
      await storage.ensureEntities(
        { dot, grants, links: [] },
        dot.created_at
      );
      await storage.ensureEntities(
        { dot, grants, links: [] },
        dot.created_at
      );
    });
  });

  describe("listDotsForUser", () => {
    it("lists dots visible to a specific user with pagination", async () => {
      const tenantId = `tenant-list-${crypto.randomUUID()}`;

      // Create 5 dots, all visible to user-lister
      for (let i = 0; i < 5; i++) {
        const dot = makeDot({
          tenant_id: tenantId,
          title: `List dot ${i}`,
          created_by: "user-lister",
          created_at: new Date(2025, 0, 1, 0, i).toISOString(),
        });
        await storage.ensureEntities(
          {
            dot,
            grants: [makeGrant(dot.id, "user-lister")],
            links: [],
          },
          dot.created_at
        );
        await storage.storeDot({
          dot,
          grants: [makeGrant(dot.id, "user-lister")],
          links: [],
        });
      }

      // Page 1: limit 2
      const page1 = await storage.listDotsForUser({
        tenantId,
        userId: "user-lister",
        limit: 2,
        offset: 0,
      });
      expect(page1.dots).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      // Page 3: offset 4
      const page3 = await storage.listDotsForUser({
        tenantId,
        userId: "user-lister",
        limit: 2,
        offset: 4,
      });
      expect(page3.dots).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it("returns dots ordered by created_at DESC", async () => {
      const tenantId = `tenant-order-${crypto.randomUUID()}`;
      const timestamps = [
        "2025-03-01T00:00:00Z",
        "2025-01-01T00:00:00Z",
        "2025-02-01T00:00:00Z",
      ];

      for (const ts of timestamps) {
        const dot = makeDot({
          tenant_id: tenantId,
          created_by: "user-order",
          created_at: ts,
        });
        await storage.ensureEntities(
          {
            dot,
            grants: [makeGrant(dot.id, "user-order")],
            links: [],
          },
          dot.created_at
        );
        await storage.storeDot({
          dot,
          grants: [makeGrant(dot.id, "user-order")],
          links: [],
        });
      }

      const result = await storage.listDotsForUser({
        tenantId,
        userId: "user-order",
        limit: 10,
        offset: 0,
      });

      expect(result.dots).toHaveLength(3);
      // Should be DESC order
      expect(result.dots[0].created_at >= result.dots[1].created_at).toBe(
        true
      );
      expect(result.dots[1].created_at >= result.dots[2].created_at).toBe(
        true
      );
    });

    it("only returns dots the user has grants for", async () => {
      const tenantId = `tenant-vis-${crypto.randomUUID()}`;

      // Dot visible to user-viewer
      const visibleDot = makeDot({
        tenant_id: tenantId,
        created_by: "user-viewer",
      });
      await storage.ensureEntities(
        {
          dot: visibleDot,
          grants: [makeGrant(visibleDot.id, "user-viewer")],
          links: [],
        },
        visibleDot.created_at
      );
      await storage.storeDot({
        dot: visibleDot,
        grants: [makeGrant(visibleDot.id, "user-viewer")],
        links: [],
      });

      // Dot NOT visible to user-viewer
      const hiddenDot = makeDot({
        tenant_id: tenantId,
        created_by: "user-other",
      });
      await storage.ensureEntities(
        {
          dot: hiddenDot,
          grants: [makeGrant(hiddenDot.id, "user-other")],
          links: [],
        },
        hiddenDot.created_at
      );
      await storage.storeDot({
        dot: hiddenDot,
        grants: [makeGrant(hiddenDot.id, "user-other")],
        links: [],
      });

      const result = await storage.listDotsForUser({
        tenantId,
        userId: "user-viewer",
        limit: 50,
        offset: 0,
      });

      expect(result.dots).toHaveLength(1);
      expect(result.dots[0].id).toBe(visibleDot.id);
    });
  });

  describe("foreign key enforcement", () => {
    it("rejects a dot referencing a non-existent user", async () => {
      // D1/SQLite enforces FK constraints — storing a dot whose created_by
      // doesn't exist in users table should fail.
      const dot = makeDot({
        tenant_id: "tenant-1",
        created_by: `ghost-user-${crypto.randomUUID()}`,
      });

      await expect(
        storage.storeDot({
          dot,
          grants: [],
          links: [],
        })
      ).rejects.toThrow();
    });
  });

  describe("tenant-scoped attachment lookup", () => {
    it("returns attachment when queried with correct tenant", async () => {
      const tenantId = `tenant-att-scope-${crypto.randomUUID()}`;
      const userId = `user-att-scope-${crypto.randomUUID()}`;
      const dot = makeDot({ tenant_id: tenantId, created_by: userId });
      await storage.ensureEntities(
        { dot, grants: [makeGrant(dot.id, userId)], links: [] },
        dot.created_at
      );
      await storage.storeDot({
        dot,
        grants: [makeGrant(dot.id, userId)],
        links: [],
      });

      const attId = `att-${crypto.randomUUID()}`;
      await storage.storeAttachmentRef(dot.id, {
        id: attId,
        filename: "scoped.txt",
        mime_type: "text/plain",
        size_bytes: 100,
        content_hash: "sha256:abc",
        storage_key: `${tenantId}/${dot.id}/uuid/scoped.txt`,
        created_at: dot.created_at,
      });

      // Same tenant — should find it
      const ref = await storage.getAttachmentRef(attId, tenantId);
      expect(ref).not.toBeNull();
      expect(ref!.id).toBe(attId);
    });

    it("returns null when queried with wrong tenant", async () => {
      const tenantId = `tenant-att-wrong-${crypto.randomUUID()}`;
      const userId = `user-att-wrong-${crypto.randomUUID()}`;
      const dot = makeDot({ tenant_id: tenantId, created_by: userId });
      await storage.ensureEntities(
        { dot, grants: [makeGrant(dot.id, userId)], links: [] },
        dot.created_at
      );
      await storage.storeDot({
        dot,
        grants: [makeGrant(dot.id, userId)],
        links: [],
      });

      const attId = `att-${crypto.randomUUID()}`;
      await storage.storeAttachmentRef(dot.id, {
        id: attId,
        filename: "hidden.txt",
        mime_type: "text/plain",
        size_bytes: 100,
        content_hash: "sha256:def",
        storage_key: `${tenantId}/${dot.id}/uuid/hidden.txt`,
        created_at: dot.created_at,
      });

      // Wrong tenant — should NOT find it
      const ref = await storage.getAttachmentRef(attId, "wrong-tenant");
      expect(ref).toBeNull();
    });

    it("still works without tenant parameter (backward compatible)", async () => {
      const tenantId = `tenant-att-compat-${crypto.randomUUID()}`;
      const userId = `user-att-compat-${crypto.randomUUID()}`;
      const dot = makeDot({ tenant_id: tenantId, created_by: userId });
      await storage.ensureEntities(
        { dot, grants: [makeGrant(dot.id, userId)], links: [] },
        dot.created_at
      );
      await storage.storeDot({
        dot,
        grants: [makeGrant(dot.id, userId)],
        links: [],
      });

      const attId = `att-${crypto.randomUUID()}`;
      await storage.storeAttachmentRef(dot.id, {
        id: attId,
        filename: "compat.txt",
        mime_type: "text/plain",
        size_bytes: 50,
        content_hash: "sha256:ghi",
        storage_key: `${tenantId}/${dot.id}/uuid/compat.txt`,
        created_at: dot.created_at,
      });

      // No tenant parameter — should find it
      const ref = await storage.getAttachmentRef(attId);
      expect(ref).not.toBeNull();
    });
  });
});
