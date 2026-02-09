import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Dotrc } from "../dotrc";
import { MemoryStorage } from "../storage-memory";
import { DotrcError } from "../types";
import type { DotrcWasm } from "../core";

// Minimal WASM mock that implements core logic for testing
function createMockWasm(): DotrcWasm {
  return {
    core_version() {
      return "0.1.0-mock";
    },

    wasm_create_dot(draftJson: string, now: string, dotId: string) {
      const draft = JSON.parse(draftJson);

      if (!draft.title || draft.title.trim() === "") {
        return JSON.stringify({
          type: "err",
          kind: "Validation",
          message: "title must not be empty",
        });
      }

      const dot = {
        id: dotId,
        tenant_id: draft.tenant_id,
        title: draft.title,
        body: draft.body || undefined,
        created_by: draft.created_by,
        created_at: now,
        scope_id: draft.scope_id || undefined,
        tags: draft.tags || [],
        attachments: draft.attachments || [],
      };

      const grants = draft.visible_to_users.map((uid: string) => ({
        dot_id: dotId,
        user_id: uid,
        granted_at: now,
        granted_by: draft.created_by,
      }));

      return JSON.stringify({
        type: "ok",
        data: { dot, grants, links: [] },
      });
    },

    wasm_grant_access(
      dotJson: string,
      existingGrantsJson: string,
      targetUsersJson: string,
      targetScopesJson: string,
      contextJson: string,
      now: string,
    ) {
      const dot = JSON.parse(dotJson);
      const existingGrants = JSON.parse(existingGrantsJson);
      const targetUsers: string[] = JSON.parse(targetUsersJson);
      const context = JSON.parse(contextJson);

      // Check authorization: only creator or existing grantees can grant
      const isCreator = dot.created_by === context.requesting_user;
      const hasGrant = existingGrants.some(
        (g: { user_id?: string }) => g.user_id === context.requesting_user,
      );

      if (!isCreator && !hasGrant) {
        return JSON.stringify({
          type: "err",
          kind: "Authorization",
          message: "not authorized to grant access",
        });
      }

      const grants = targetUsers.map((uid: string) => ({
        dot_id: dot.id,
        user_id: uid,
        granted_at: now,
        granted_by: context.requesting_user,
      }));

      return JSON.stringify({ type: "ok", data: { grants } });
    },

    wasm_create_link(
      fromDotJson: string,
      toDotJson: string,
      linkType: string,
      grantsJson: string,
      existingLinksJson: string,
      contextJson: string,
      now: string,
    ) {
      const fromDot = JSON.parse(fromDotJson);
      const toDot = JSON.parse(toDotJson);
      const existingLinks = JSON.parse(existingLinksJson);

      // Check for self-reference
      if (fromDot.id === toDot.id) {
        return JSON.stringify({
          type: "err",
          kind: "Link",
          message: "cannot link a dot to itself",
        });
      }

      // Check for duplicate
      const isDuplicate = existingLinks.some(
        (l: { from_dot_id: string; to_dot_id: string; link_type: string }) =>
          l.from_dot_id === fromDot.id &&
          l.to_dot_id === toDot.id &&
          l.link_type === linkType,
      );
      if (isDuplicate) {
        return JSON.stringify({
          type: "err",
          kind: "Link",
          message: "link already exists",
        });
      }

      const link = {
        from_dot_id: fromDot.id,
        to_dot_id: toDot.id,
        link_type: linkType,
        created_at: now,
      };

      return JSON.stringify({ type: "ok", data: { link } });
    },

    wasm_can_view_dot(
      dotJson: string,
      grantsJson: string,
      contextJson: string,
    ) {
      const dot = JSON.parse(dotJson);
      const grants = JSON.parse(grantsJson);
      const context = JSON.parse(contextJson);

      const canView =
        dot.created_by === context.requesting_user ||
        grants.some(
          (g: { user_id?: string }) =>
            g.user_id === context.requesting_user,
        );

      return JSON.stringify({ type: "ok", data: { can_view: canView } });
    },

    wasm_filter_visible_dots(
      dotsJson: string,
      grantsJson: string,
      contextJson: string,
    ) {
      const dots = JSON.parse(dotsJson);
      const grants = JSON.parse(grantsJson);
      const context = JSON.parse(contextJson);

      const visible = dots.filter(
        (dot: { id: string; created_by: string }) =>
          dot.created_by === context.requesting_user ||
          grants.some(
            (g: { dot_id: string; user_id?: string }) =>
              g.dot_id === dot.id &&
              g.user_id === context.requesting_user,
          ),
      );

      return JSON.stringify({ type: "ok", data: { dots: visible } });
    },
  };
}

describe("Dotrc", () => {
  let dotrc: Dotrc;

  beforeEach(() => {
    dotrc = Dotrc.open(
      { tenant: "test-tenant", user: "user-1" },
      createMockWasm(),
    );
  });

  afterEach(async () => {
    await dotrc.close();
  });

  it("returns the core version", () => {
    expect(dotrc.version()).toBe("0.1.0-mock");
  });

  describe("createDot", () => {
    it("creates a dot and returns response", async () => {
      const response = await dotrc.createDot({ title: "Test dot" });

      expect(response.dot_id).toBeDefined();
      expect(response.created_at).toBeDefined();
      expect(response.grants_count).toBe(1); // default: visible to creator
      expect(response.links_count).toBe(0);
    });

    it("creates a dot with body and tags", async () => {
      const response = await dotrc.createDot({
        title: "Tagged dot",
        body: "Some body text",
        tags: ["bug", "urgent"],
      });

      const dot = await dotrc.getDot(response.dot_id);
      expect(dot).not.toBeNull();
      expect(dot!.title).toBe("Tagged dot");
      expect(dot!.body).toBe("Some body text");
      expect(dot!.tags).toEqual(["bug", "urgent"]);
    });

    it("throws on empty title", async () => {
      await expect(dotrc.createDot({ title: "" })).rejects.toThrow(DotrcError);
    });
  });

  describe("getDot", () => {
    it("returns null for non-existent dot", async () => {
      const dot = await dotrc.getDot("nonexistent");
      expect(dot).toBeNull();
    });

    it("retrieves a created dot", async () => {
      const { dot_id } = await dotrc.createDot({ title: "Fetch me" });
      const dot = await dotrc.getDot(dot_id);

      expect(dot).not.toBeNull();
      expect(dot!.id).toBe(dot_id);
      expect(dot!.title).toBe("Fetch me");
      expect(dot!.tenant_id).toBe("test-tenant");
      expect(dot!.created_by).toBe("user-1");
    });

    it("returns null for dots not visible to user", async () => {
      // Create a dot as user-1 visible only to user-1
      const { dot_id } = await dotrc.createDot({ title: "Private" });

      // Open as different user
      const other = Dotrc.open(
        {
          tenant: "test-tenant",
          user: "user-2",
          storage: (dotrc as any).storage,
        },
        createMockWasm(),
      );

      const dot = await other.getDot(dot_id);
      expect(dot).toBeNull();
    });
  });

  describe("listDots", () => {
    it("lists dots with pagination", async () => {
      await dotrc.createDot({ title: "Dot 1" });
      await dotrc.createDot({ title: "Dot 2" });
      await dotrc.createDot({ title: "Dot 3" });

      const page1 = await dotrc.listDots({ limit: 2, offset: 0 });
      expect(page1.dots).toHaveLength(2);
      expect(page1.total).toBe(3);
      expect(page1.has_more).toBe(true);

      const page2 = await dotrc.listDots({ limit: 2, offset: 2 });
      expect(page2.dots).toHaveLength(1);
      expect(page2.has_more).toBe(false);
    });

    it("returns empty list when no dots exist", async () => {
      const result = await dotrc.listDots();
      expect(result.dots).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe("grantAccess", () => {
    it("grants access to another user", async () => {
      const { dot_id } = await dotrc.createDot({ title: "Shared dot" });

      const result = await dotrc.grantAccess(dot_id, {
        user_ids: ["user-2"],
      });

      expect(result.grants_count).toBe(1);
      expect(result.grants[0].user_id).toBe("user-2");
      expect(result.grants[0].dot_id).toBe(dot_id);
    });

    it("throws when dot does not exist", async () => {
      await expect(
        dotrc.grantAccess("nonexistent", { user_ids: ["user-2"] }),
      ).rejects.toThrow(DotrcError);
    });

    it("makes dot visible to grantee", async () => {
      const { dot_id } = await dotrc.createDot({ title: "For user-2" });
      await dotrc.grantAccess(dot_id, { user_ids: ["user-2"] });

      const other = Dotrc.open(
        {
          tenant: "test-tenant",
          user: "user-2",
          storage: (dotrc as any).storage,
        },
        createMockWasm(),
      );

      const dot = await other.getDot(dot_id);
      expect(dot).not.toBeNull();
      expect(dot!.title).toBe("For user-2");
    });
  });

  describe("getGrants", () => {
    it("lists grants for a dot", async () => {
      const { dot_id } = await dotrc.createDot({ title: "Granted" });
      await dotrc.grantAccess(dot_id, { user_ids: ["user-2", "user-3"] });

      const result = await dotrc.getGrants(dot_id);
      // 1 initial grant (creator) + 2 new grants
      expect(result.grants).toHaveLength(3);
    });

    it("throws for non-existent dot", async () => {
      await expect(dotrc.getGrants("nonexistent")).rejects.toThrow(DotrcError);
    });
  });

  describe("createLink", () => {
    it("creates a link between two dots", async () => {
      const { dot_id: from } = await dotrc.createDot({ title: "From" });
      const { dot_id: to } = await dotrc.createDot({ title: "To" });

      const result = await dotrc.createLink(from, {
        to_dot_id: to,
        link_type: "related",
      });

      expect(result.link.from_dot_id).toBe(from);
      expect(result.link.to_dot_id).toBe(to);
      expect(result.link.link_type).toBe("related");
    });

    it("throws for non-existent source dot", async () => {
      const { dot_id: to } = await dotrc.createDot({ title: "To" });

      await expect(
        dotrc.createLink("nonexistent", {
          to_dot_id: to,
          link_type: "followup",
        }),
      ).rejects.toThrow(DotrcError);
    });

    it("throws for non-existent target dot", async () => {
      const { dot_id: from } = await dotrc.createDot({ title: "From" });

      await expect(
        dotrc.createLink(from, {
          to_dot_id: "nonexistent",
          link_type: "followup",
        }),
      ).rejects.toThrow(DotrcError);
    });
  });

  describe("getLinks", () => {
    it("lists links for a dot", async () => {
      const { dot_id: a } = await dotrc.createDot({ title: "A" });
      const { dot_id: b } = await dotrc.createDot({ title: "B" });
      const { dot_id: c } = await dotrc.createDot({ title: "C" });

      await dotrc.createLink(a, { to_dot_id: b, link_type: "related" });
      await dotrc.createLink(a, { to_dot_id: c, link_type: "followup" });

      const result = await dotrc.getLinks(a);
      expect(result.links).toHaveLength(2);
    });
  });

  describe("round-trip", () => {
    it("full create → get → grant → link workflow", async () => {
      // Create two dots
      const { dot_id: id1 } = await dotrc.createDot({
        title: "First dot",
        body: "Body of first dot",
        tags: ["important"],
      });

      const { dot_id: id2 } = await dotrc.createDot({
        title: "Second dot",
        tags: ["followup"],
      });

      // Verify both retrievable
      const dot1 = await dotrc.getDot(id1);
      const dot2 = await dotrc.getDot(id2);
      expect(dot1!.title).toBe("First dot");
      expect(dot2!.title).toBe("Second dot");

      // Grant access to user-2
      await dotrc.grantAccess(id1, { user_ids: ["user-2"] });
      const grants = await dotrc.getGrants(id1);
      expect(grants.grants.length).toBeGreaterThanOrEqual(2);

      // Create link
      await dotrc.createLink(id1, {
        to_dot_id: id2,
        link_type: "followup",
      });
      const links = await dotrc.getLinks(id1);
      expect(links.links).toHaveLength(1);
      expect(links.links[0].link_type).toBe("followup");

      // List all dots
      const list = await dotrc.listDots();
      expect(list.dots).toHaveLength(2);
      expect(list.total).toBe(2);
    });
  });
});
