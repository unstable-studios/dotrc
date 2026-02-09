import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { IndexedDBStorage } from "../storage-indexeddb";
import type { Dot, VisibilityGrant, Link } from "../types";

function makeDot(overrides: Partial<Dot> = {}): Dot {
  return {
    id: overrides.id ?? "dot-1",
    tenant_id: overrides.tenant_id ?? "tenant-1",
    title: overrides.title ?? "Test dot",
    body: overrides.body,
    created_by: overrides.created_by ?? "user-1",
    created_at: overrides.created_at ?? "2024-01-01T00:00:00Z",
    scope_id: overrides.scope_id,
    tags: overrides.tags ?? [],
    attachments: overrides.attachments ?? [],
  };
}

function makeGrant(overrides: Partial<VisibilityGrant> = {}): VisibilityGrant {
  return {
    dot_id: overrides.dot_id ?? "dot-1",
    user_id: overrides.user_id ?? "user-1",
    scope_id: overrides.scope_id,
    granted_at: overrides.granted_at ?? "2024-01-01T00:00:00Z",
    granted_by: overrides.granted_by,
  };
}

describe("IndexedDBStorage", () => {
  let storage: IndexedDBStorage;
  // Use unique DB name per test to avoid cross-test pollution
  let dbCounter = 0;

  beforeEach(() => {
    storage = new IndexedDBStorage(`dotrc-test-${++dbCounter}`);
  });

  afterEach(async () => {
    await storage.close();
  });

  describe("storeDot / getDot", () => {
    it("stores and retrieves a dot", async () => {
      const dot = makeDot({ tags: ["bug", "urgent"] });
      const grants = [makeGrant()];

      await storage.storeDot(dot, grants, []);

      const retrieved = await storage.getDot("tenant-1", "dot-1");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe("dot-1");
      expect(retrieved!.title).toBe("Test dot");
      expect(retrieved!.tags).toEqual(["bug", "urgent"]);
    });

    it("returns null for non-existent dot", async () => {
      const result = await storage.getDot("tenant-1", "nonexistent");
      expect(result).toBeNull();
    });

    it("enforces tenant isolation on getDot", async () => {
      const dot = makeDot({ tenant_id: "tenant-1" });
      await storage.storeDot(dot, [makeGrant()], []);

      const result = await storage.getDot("tenant-2", "dot-1");
      expect(result).toBeNull();
    });
  });

  describe("getGrants", () => {
    it("retrieves grants for a dot", async () => {
      const dot = makeDot();
      const grants = [
        makeGrant({ user_id: "user-1" }),
        makeGrant({ user_id: "user-2" }),
      ];

      await storage.storeDot(dot, grants, []);

      const retrieved = await storage.getGrants("tenant-1", "dot-1");
      expect(retrieved).toHaveLength(2);
      expect(retrieved.map((g) => g.user_id).sort()).toEqual([
        "user-1",
        "user-2",
      ]);
    });

    it("returns empty array for wrong tenant", async () => {
      const dot = makeDot();
      await storage.storeDot(dot, [makeGrant()], []);

      const result = await storage.getGrants("tenant-2", "dot-1");
      expect(result).toEqual([]);
    });
  });

  describe("storeGrants", () => {
    it("appends additional grants", async () => {
      const dot = makeDot();
      await storage.storeDot(dot, [makeGrant({ user_id: "user-1" })], []);

      await storage.storeGrants([
        makeGrant({ user_id: "user-2", granted_by: "user-1" }),
      ]);

      const grants = await storage.getGrants("tenant-1", "dot-1");
      expect(grants).toHaveLength(2);
    });
  });

  describe("listDots", () => {
    it("lists dots visible to user with pagination", async () => {
      // Create 3 dots
      for (let i = 1; i <= 3; i++) {
        const dot = makeDot({
          id: `dot-${i}`,
          title: `Dot ${i}`,
          created_at: `2024-01-0${i}T00:00:00Z`,
        });
        await storage.storeDot(dot, [makeGrant({ dot_id: `dot-${i}` })], []);
      }

      // Page 1
      const page1 = await storage.listDots("tenant-1", "user-1", 2, 0);
      expect(page1.dots).toHaveLength(2);
      expect(page1.total).toBe(3);
      expect(page1.hasMore).toBe(true);
      // Should be sorted by created_at DESC
      expect(page1.dots[0].id).toBe("dot-3");

      // Page 2
      const page2 = await storage.listDots("tenant-1", "user-1", 2, 2);
      expect(page2.dots).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it("only returns dots visible to the requesting user", async () => {
      const dot1 = makeDot({ id: "dot-1", created_by: "user-1" });
      const dot2 = makeDot({ id: "dot-2", created_by: "user-2" });

      await storage.storeDot(
        dot1,
        [makeGrant({ dot_id: "dot-1", user_id: "user-1" })],
        [],
      );
      await storage.storeDot(
        dot2,
        [makeGrant({ dot_id: "dot-2", user_id: "user-2" })],
        [],
      );

      const result = await storage.listDots("tenant-1", "user-1", 50, 0);
      expect(result.dots).toHaveLength(1);
      expect(result.dots[0].id).toBe("dot-1");
    });
  });

  describe("storeLink / getLinks", () => {
    it("stores and retrieves links", async () => {
      const dot1 = makeDot({ id: "dot-1" });
      const dot2 = makeDot({ id: "dot-2" });

      await storage.storeDot(dot1, [makeGrant({ dot_id: "dot-1" })], []);
      await storage.storeDot(dot2, [makeGrant({ dot_id: "dot-2" })], []);

      const link: Link = {
        from_dot_id: "dot-1",
        to_dot_id: "dot-2",
        link_type: "related",
        created_at: "2024-01-01T00:00:00Z",
      };

      await storage.storeLink(link, "tenant-1");

      const fromLinks = await storage.getLinks("tenant-1", "dot-1");
      expect(fromLinks).toHaveLength(1);
      expect(fromLinks[0].link_type).toBe("related");

      // Also retrievable from the other side
      const toLinks = await storage.getLinks("tenant-1", "dot-2");
      expect(toLinks).toHaveLength(1);
    });

    it("stores links atomically with dot creation", async () => {
      const dot1 = makeDot({ id: "dot-1" });
      const dot2 = makeDot({ id: "dot-2" });

      const link: Link = {
        from_dot_id: "dot-1",
        to_dot_id: "dot-2",
        link_type: "followup",
        created_at: "2024-01-01T00:00:00Z",
      };

      await storage.storeDot(dot1, [makeGrant({ dot_id: "dot-1" })], [link]);
      await storage.storeDot(dot2, [makeGrant({ dot_id: "dot-2" })], []);

      const links = await storage.getLinks("tenant-1", "dot-1");
      expect(links).toHaveLength(1);
      expect(links[0].link_type).toBe("followup");
    });
  });

  describe("close", () => {
    it("closes without error", async () => {
      await storage.storeDot(makeDot(), [makeGrant()], []);
      await expect(storage.close()).resolves.toBeUndefined();
    });
  });
});
