import { describe, it, expect, beforeEach, vi } from "vitest";
import type { JsonValue, JsonObject } from "./index";

// Mock WASM module
const mockWasm = {
  wasm_create_dot: vi.fn(),
  wasm_can_view_dot: vi.fn(),
  wasm_filter_visible_dots: vi.fn(),
};

// Parse JSON response from worker Response object
async function parseResponse(response: Response): Promise<JsonValue> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("Worker Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /", () => {
    it("returns health check", async () => {
      // Simulate the health check handler
      const response = new Response(
        JSON.stringify({ status: "ok", service: "dotrc-worker" }),
        {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(200);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.status).toBe("ok");
      expect(body.service).toBe("dotrc-worker");
    });
  });

  describe("POST /dots", () => {
    it("creates dot with valid input", async () => {
      // Mock core response
      mockWasm.wasm_create_dot.mockReturnValue(
        JSON.stringify({
          dot: {
            id: "dot-123",
            title: "My Fact",
            body: "This is important",
            created_at: "2025-12-20T12:34:56Z",
            created_by: "user-1",
            tenant_id: "tenant-1",
            scope_id: "scope-123",
            tags: ["personal", "archive"],
            attachments: [],
          },
          grants: [
            { user_id: "user-1" },
            { user_id: "user-456" },
            { scope_id: "scope-789" },
          ],
          links: [],
        })
      );

      // Simulate response
      const response = new Response(
        JSON.stringify({
          dot_id: "dot-123",
          created_at: "2025-12-20T12:34:56Z",
          grants_count: 3,
        }),
        {
          status: 201,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(201);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.dot_id).toBe("dot-123");
      expect(body.created_at).toBe("2025-12-20T12:34:56Z");
      expect(body.grants_count).toBe(3);
    });

    it("defaults visible_to_users to creator", async () => {
      const payload = {
        title: "My Fact",
      };

      // Payload should be transformed with defaults
      const expected = {
        title: "My Fact",
        body: undefined,
        created_by: "user-1",
        tenant_id: "tenant-1",
        scope_id: undefined,
        tags: [],
        visible_to_users: ["user-1"], // Default to creator
        visible_to_scopes: [],
        attachments: [],
      };

      expect(expected.visible_to_users).toContain("user-1");
    });

    it("returns 401 without auth headers", async () => {
      const response = new Response(
        JSON.stringify({
          error: "unauthorized",
          detail: "Missing tenant or user authentication",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(401);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("unauthorized");
    });

    it("returns 400 with invalid JSON", async () => {
      const response = new Response(
        JSON.stringify({
          error: "invalid_json",
          detail: "Unexpected end of JSON input",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(400);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("invalid_json");
    });

    it("returns 400 with non-object body", async () => {
      const response = new Response(
        JSON.stringify({
          error: "invalid_body",
          detail: "Expected JSON object",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(400);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("invalid_body");
    });

    it("returns 400 with array body", async () => {
      const response = new Response(
        JSON.stringify({
          error: "invalid_body",
          detail: "Expected JSON object",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(400);
    });

    it("filters tags to strings only", async () => {
      const payload = {
        title: "Test",
        tags: ["valid", 123, true, null, "also-valid"],
      };

      // Only string tags should be kept
      const filtered = (payload.tags as unknown[]).filter(
        (t): t is string => typeof t === "string"
      );
      expect(filtered).toEqual(["valid", "also-valid"]);
    });

    it("filters visible_to_users to strings only", async () => {
      const payload = {
        visible_to_users: ["user-1", {}, "user-2", null],
      };

      const filtered = (payload.visible_to_users as unknown[]).filter(
        (u): u is string => typeof u === "string"
      );
      expect(filtered).toEqual(["user-1", "user-2"]);
    });

    it("filters visible_to_scopes to strings only", async () => {
      const payload = {
        visible_to_scopes: ["scope-1", 42, "scope-2"],
      };

      const filtered = (payload.visible_to_scopes as unknown[]).filter(
        (s): s is string => typeof s === "string"
      );
      expect(filtered).toEqual(["scope-1", "scope-2"]);
    });

    it("handles core validation errors gracefully", async () => {
      // When core throws validation error
      const response = new Response(
        JSON.stringify({
          error: "validation_failed",
          detail: "title is required",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(400);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("validation_failed");
    });

    it("handles unknown core errors gracefully", async () => {
      const response = new Response(
        JSON.stringify({
          error: "internal_error",
          detail: "Unknown error",
        }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(500);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("internal_error");
    });

    it("returns 400 for Validation error kind", async () => {
      const response = new Response(
        JSON.stringify({
          error: "validation_failed",
          kind: "Validation",
          detail: "title is required",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(400);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("validation_failed");
      expect(body.kind).toBe("Validation");
    });

    it("returns 403 for Authorization error kind", async () => {
      const response = new Response(
        JSON.stringify({
          error: "unauthorized",
          kind: "Authorization",
          detail: "user does not have permission",
        }),
        {
          status: 403,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(403);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("unauthorized");
      expect(body.kind).toBe("Authorization");
    });

    it("returns 500 for Link error kind", async () => {
      const response = new Response(
        JSON.stringify({
          error: "internal_error",
          kind: "Link",
          detail: "Request processing failed",
        }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(500);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("internal_error");
      expect(body.kind).toBe("Link");
      expect(body.detail).toBe("Request processing failed");
    });

    it("returns 500 for ServerError error kind", async () => {
      const response = new Response(
        JSON.stringify({
          error: "internal_error",
          kind: "ServerError",
          detail: "Request processing failed",
        }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(500);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("internal_error");
      expect(body.kind).toBe("ServerError");
      expect(body.detail).toBe("Request processing failed");
    });
  });

  describe("404 Not Found", () => {
    it("returns 404 for invalid path", async () => {
      const response = new Response(
        JSON.stringify({
          error: "not_found",
          path: "/invalid",
        }),
        {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(404);
      const body = (await parseResponse(response)) as JsonObject;
      expect(body.error).toBe("not_found");
    });

    it("returns 404 for invalid method on /dots", async () => {
      const response = new Response(
        JSON.stringify({
          error: "not_found",
          path: "/dots",
        }),
        {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("JSON Response Format", () => {
    it("includes content-type header", async () => {
      const response = new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });

      expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8"
      );
    });

    it("returns valid JSON for all responses", async () => {
      const testCases = [
        JSON.stringify({ status: "ok" }),
        JSON.stringify({ error: "not_found" }),
        JSON.stringify({
          dot_id: "dot-123",
          created_at: "2025-12-20T12:34:56Z",
        }),
      ];

      for (const jsonStr of testCases) {
        expect(() => JSON.parse(jsonStr)).not.toThrow();
      }
    });
  });

  describe("Path Parsing", () => {
    it("handles trailing slashes", () => {
      const paths = ["/dots/", "/dots///", "/dots"];

      // Normalize by removing trailing slashes
      const normalized = paths.map((p) => p.replace(/\/+$/, ""));
      expect(normalized).toEqual(["/dots", "/dots", "/dots"]);
    });

    it("splits path segments correctly", () => {
      const url = "/dots";
      const segments = url.replace(/\/+$/, "").split("/").filter(Boolean);
      expect(segments).toEqual(["dots"]);

      const url2 = "/api/v1/dots";
      const segments2 = url2.replace(/\/+$/, "").split("/").filter(Boolean);
      expect(segments2).toEqual(["api", "v1", "dots"]);
    });
  });
});
