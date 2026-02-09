import { describe, it, expect, vi, beforeEach } from "vitest";
import { DotrcClient } from "./client";
import { DotrcApiError, DotrcNetworkError } from "./errors";
import type { Dot } from "./types";

function mockFetch(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
    headers: new Headers(headers ?? {}),
  } as unknown as Response);
}

function createClient(fetchFn: ReturnType<typeof mockFetch>, token?: string) {
  return new DotrcClient({
    baseUrl: "https://api.test",
    token,
    fetch: fetchFn as unknown as typeof globalThis.fetch,
  });
}

describe("DotrcClient", () => {
  describe("constructor", () => {
    it("strips trailing slash from baseUrl", async () => {
      const fn = mockFetch(200, { status: "ok", service: "dotrc-worker" });
      const client = new DotrcClient({
        baseUrl: "https://api.test///",
        fetch: fn as unknown as typeof globalThis.fetch,
      });
      await client.health();
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/",
        expect.any(Object),
      );
    });
  });

  describe("health", () => {
    it("returns health response", async () => {
      const fn = mockFetch(200, { status: "ok", service: "dotrc-worker" });
      const client = createClient(fn);
      const result = await client.health();
      expect(result).toEqual({ status: "ok", service: "dotrc-worker" });
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  describe("createDot", () => {
    it("sends POST /dots with body", async () => {
      const fn = mockFetch(201, {
        dot_id: "dot-1",
        created_at: "2025-01-01T00:00:00Z",
        grants_count: 1,
        links_count: 0,
      });
      const client = createClient(fn, "my-token");
      const result = await client.createDot({ title: "Test Dot" });

      expect(result.dot_id).toBe("dot-1");
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/dots",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Test Dot" }),
          headers: expect.objectContaining({
            authorization: "Bearer my-token",
            "content-type": "application/json",
          }),
        }),
      );
    });

    it("sends optional fields", async () => {
      const fn = mockFetch(201, {
        dot_id: "dot-2",
        created_at: "2025-01-01T00:00:00Z",
        grants_count: 2,
        links_count: 0,
      });
      const client = createClient(fn);
      await client.createDot({
        title: "Full Dot",
        body: "Some body",
        scope_id: "scope-1",
        tags: ["a", "b"],
        visible_to_users: ["u1", "u2"],
        visible_to_scopes: ["s1"],
      });

      const callBody = JSON.parse(fn.mock.calls[0][1].body);
      expect(callBody.title).toBe("Full Dot");
      expect(callBody.body).toBe("Some body");
      expect(callBody.scope_id).toBe("scope-1");
      expect(callBody.tags).toEqual(["a", "b"]);
      expect(callBody.visible_to_users).toEqual(["u1", "u2"]);
      expect(callBody.visible_to_scopes).toEqual(["s1"]);
    });
  });

  describe("getDot", () => {
    it("returns dot on success", async () => {
      const dot: Dot = {
        id: "dot-1",
        tenant_id: "t-1",
        title: "Hello",
        created_by: "u-1",
        created_at: "2025-01-01T00:00:00Z",
        tags: [],
        attachments: [],
      };
      const fn = mockFetch(200, dot);
      const client = createClient(fn);
      const result = await client.getDot("dot-1");
      expect(result).toEqual(dot);
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/dots/dot-1",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("returns null on 404", async () => {
      const fn = mockFetch(404, { error: "not_found", detail: "Dot not found" });
      const client = createClient(fn);
      const result = await client.getDot("dot-missing");
      expect(result).toBeNull();
    });

    it("throws DotrcApiError on non-404 errors", async () => {
      const fn = mockFetch(403, { error: "forbidden", detail: "No access" });
      const client = createClient(fn);
      await expect(client.getDot("dot-1")).rejects.toThrow(DotrcApiError);
    });

    it("encodes dotId in URL", async () => {
      const fn = mockFetch(200, {
        id: "dot/special",
        tenant_id: "t-1",
        title: "Test",
        created_by: "u-1",
        created_at: "2025-01-01T00:00:00Z",
        tags: [],
        attachments: [],
      });
      const client = createClient(fn);
      await client.getDot("dot/special");
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/dots/dot%2Fspecial",
        expect.any(Object),
      );
    });
  });

  describe("listDots", () => {
    it("returns paginated results", async () => {
      const response = {
        dots: [],
        total: 0,
        has_more: false,
        limit: 50,
        offset: 0,
      };
      const fn = mockFetch(200, response);
      const client = createClient(fn);
      const result = await client.listDots();
      expect(result).toEqual(response);
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/dots",
        expect.any(Object),
      );
    });

    it("passes pagination params", async () => {
      const fn = mockFetch(200, {
        dots: [],
        total: 0,
        has_more: false,
        limit: 10,
        offset: 20,
      });
      const client = createClient(fn);
      await client.listDots({ limit: 10, offset: 20 });
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/dots?limit=10&offset=20",
        expect.any(Object),
      );
    });
  });

  describe("grantAccess", () => {
    it("sends POST /dots/:id/grants", async () => {
      const fn = mockFetch(201, { grants: [], grants_count: 2 });
      const client = createClient(fn);
      const result = await client.grantAccess("dot-1", {
        user_ids: ["u1", "u2"],
      });
      expect(result.grants_count).toBe(2);
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/dots/dot-1/grants",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ user_ids: ["u1", "u2"] }),
        }),
      );
    });
  });

  describe("getGrants", () => {
    it("returns grants list", async () => {
      const fn = mockFetch(200, { grants: [{ dot_id: "dot-1", user_id: "u-1" }] });
      const client = createClient(fn);
      const result = await client.getGrants("dot-1");
      expect(result.grants).toHaveLength(1);
    });
  });

  describe("createLink", () => {
    it("sends POST /dots/:id/links", async () => {
      const fn = mockFetch(201, {
        link: {
          from_dot_id: "dot-1",
          to_dot_id: "dot-2",
          link_type: "followup",
          created_at: "2025-01-01T00:00:00Z",
        },
      });
      const client = createClient(fn);
      const result = await client.createLink("dot-1", {
        to_dot_id: "dot-2",
        link_type: "followup",
      });
      expect(result.link.link_type).toBe("followup");
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/dots/dot-1/links",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("getLinks", () => {
    it("returns links list", async () => {
      const fn = mockFetch(200, { links: [] });
      const client = createClient(fn);
      const result = await client.getLinks("dot-1");
      expect(result.links).toEqual([]);
    });
  });

  describe("uploadAttachment", () => {
    it("sends multipart form data with File", async () => {
      const fn = mockFetch(201, {
        attachment_id: "att-1",
        filename: "test.txt",
        mime_type: "text/plain",
        size_bytes: 5,
        content_hash: "sha256:abc",
        created_at: "2025-01-01T00:00:00Z",
      });
      const client = createClient(fn, "tok");
      const file = new File(["hello"], "test.txt", { type: "text/plain" });
      const result = await client.uploadAttachment("dot-1", file);

      expect(result.attachment_id).toBe("att-1");
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/dots/dot-1/attachments",
        expect.objectContaining({ method: "POST" }),
      );
      // Should NOT set content-type (let fetch handle multipart boundary)
      const callHeaders = fn.mock.calls[0][1].headers;
      expect(callHeaders["content-type"]).toBeUndefined();
      // Should set authorization
      expect(callHeaders["authorization"]).toBe("Bearer tok");
    });

    it("sends multipart form data with {name, data, type}", async () => {
      const fn = mockFetch(201, {
        attachment_id: "att-2",
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size_bytes: 100,
        content_hash: "sha256:def",
        created_at: "2025-01-01T00:00:00Z",
      });
      const client = createClient(fn);
      const result = await client.uploadAttachment("dot-1", {
        name: "doc.pdf",
        data: new Blob(["pdf content"]),
        type: "application/pdf",
      });
      expect(result.filename).toBe("doc.pdf");
    });
  });

  describe("getAttachment", () => {
    it("returns the raw response", async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "text/plain",
          "content-disposition": 'attachment; filename="test.txt"',
        }),
        body: "file-data",
      } as unknown as Response);
      const client = createClient(fn as any);
      const response = await client.getAttachment("att-1");
      expect(response.status).toBe(200);
      expect(fn).toHaveBeenCalledWith(
        "https://api.test/attachments/att-1",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  describe("batchCreateDots", () => {
    it("sends POST /batch/dots with array body", async () => {
      const fn = mockFetch(201, {
        results: [
          { index: 0, status: "ok", dot_id: "dot-1" },
          { index: 1, status: "ok", dot_id: "dot-2" },
        ],
      });
      const client = createClient(fn);
      const result = await client.batchCreateDots([
        { title: "Dot A" },
        { title: "Dot B" },
      ]);
      expect(result.results).toHaveLength(2);
      const callBody = JSON.parse(fn.mock.calls[0][1].body);
      expect(callBody).toHaveLength(2);
    });
  });

  describe("batchGrantAccess", () => {
    it("sends POST /batch/grants with array body", async () => {
      const fn = mockFetch(201, {
        results: [{ index: 0, status: "ok", dot_id: "dot-1", grants_count: 1 }],
      });
      const client = createClient(fn);
      const result = await client.batchGrantAccess([
        { dot_id: "dot-1", user_ids: ["u1"] },
      ]);
      expect(result.results).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("throws DotrcApiError with parsed details", async () => {
      const fn = mockFetch(
        400,
        { error: "validation_failed", detail: "Missing title", kind: "Validation" },
        { "x-request-id": "req-123" },
      );
      const client = createClient(fn);

      try {
        await client.createDot({ title: "" });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(DotrcApiError);
        const apiErr = err as DotrcApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.code).toBe("validation_failed");
        expect(apiErr.detail).toBe("Missing title");
        expect(apiErr.kind).toBe("Validation");
        expect(apiErr.requestId).toBe("req-123");
        expect(apiErr.message).toBe("validation_failed: Missing title");
      }
    });

    it("handles non-JSON error responses", async () => {
      const fn = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: () => Promise.reject(new Error("not json")),
        headers: new Headers(),
      } as unknown as Response);
      const client = createClient(fn as any);

      await expect(client.health()).rejects.toThrow(DotrcApiError);
      try {
        await client.health();
      } catch (err) {
        const apiErr = err as DotrcApiError;
        expect(apiErr.status).toBe(502);
        expect(apiErr.code).toBe("unknown_error");
      }
    });

    it("throws DotrcNetworkError on fetch failure", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createClient(fn as any);

      await expect(client.health()).rejects.toThrow(DotrcNetworkError);
      try {
        await client.health();
      } catch (err) {
        expect((err as DotrcNetworkError).message).toContain("ECONNREFUSED");
      }
    });

    it("throws DotrcApiError for 401 unauthorized", async () => {
      const fn = mockFetch(401, {
        error: "unauthorized",
        detail: "No valid authentication provided",
      });
      const client = createClient(fn);

      await expect(client.listDots()).rejects.toThrow(DotrcApiError);
      try {
        await client.listDots();
      } catch (err) {
        expect((err as DotrcApiError).status).toBe(401);
      }
    });
  });

  describe("authentication", () => {
    it("sends Bearer token when configured", async () => {
      const fn = mockFetch(200, { status: "ok", service: "dotrc-worker" });
      const client = createClient(fn, "secret-token");
      await client.health();

      const callHeaders = fn.mock.calls[0][1].headers;
      expect(callHeaders.authorization).toBe("Bearer secret-token");
    });

    it("does not send authorization without token", async () => {
      const fn = mockFetch(200, { status: "ok", service: "dotrc-worker" });
      const client = createClient(fn);
      await client.health();

      const callHeaders = fn.mock.calls[0][1].headers;
      expect(callHeaders.authorization).toBeUndefined();
    });

    it("merges custom headers", async () => {
      const fn = mockFetch(200, { status: "ok", service: "dotrc-worker" });
      const client = new DotrcClient({
        baseUrl: "https://api.test",
        headers: { "x-tenant-id": "t-1", "x-user-id": "u-1" },
        fetch: fn as unknown as typeof globalThis.fetch,
      });
      await client.health();

      const callHeaders = fn.mock.calls[0][1].headers;
      expect(callHeaders["x-tenant-id"]).toBe("t-1");
      expect(callHeaders["x-user-id"]).toBe("u-1");
    });
  });
});
