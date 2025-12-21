import { DotrcCore } from "./core";
import type { DotDraft, AuthContext } from "./types";
import {
  generateDotId,
  now,
  parseTenantId,
  parseUserId,
  parseScopeMemberships,
} from "./utils";

// Import WASM module
// @ts-expect-error - WASM module will be bundled
import * as wasm from "../../crates/dotrc-core-wasm/pkg/dotrc_core_wasm.js";

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

// Minimal D1 typings to avoid external deps
interface D1Result<T = unknown> {
  success: boolean;
  error?: string;
  results?: T[];
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB: D1Database;
}

// Initialize WASM core wrapper
const core = new DotrcCore(wasm);

function json(
  status: number,
  body: JsonValue,
  headers: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

async function readJson(request: Request): Promise<JsonValue> {
  const text = await request.text();
  if (!text) return null;
  return JSON.parse(text) as JsonValue;
}

function parsePath(url: URL): string[] {
  const cleaned = url.pathname.replace(/\/+$/, "");
  return cleaned.split("/").filter(Boolean);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const segments = parsePath(url);

    // Health
    if (request.method === "GET" && segments.length === 0) {
      return json(200, { status: "ok", service: "dotrc-worker" });
    }

    // POST /dots
    if (
      request.method === "POST" &&
      segments.length === 1 &&
      segments[0] === "dots"
    ) {
      // Parse auth context
      const tenantId = parseTenantId(request);
      const userId = parseUserId(request);

      if (!tenantId || !userId) {
        return json(401, {
          error: "unauthorized",
          detail: "Missing tenant or user authentication",
        });
      }

      // Parse request body
      let body: JsonValue;
      try {
        body = await readJson(request);
      } catch (err) {
        return json(400, {
          error: "invalid_json",
          detail: (err as Error).message,
        });
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(400, {
          error: "invalid_body",
          detail: "Expected JSON object",
        });
      }

      const payload = body as Record<string, JsonValue>;

      // Build dot draft
      const draft: DotDraft = {
        title: typeof payload.title === "string" ? payload.title : "",
        body: typeof payload.body === "string" ? payload.body : undefined,
        created_by: userId,
        tenant_id: tenantId,
        scope_id:
          typeof payload.scope_id === "string" ? payload.scope_id : undefined,
        tags: Array.isArray(payload.tags)
          ? payload.tags.filter((t): t is string => typeof t === "string")
          : [],
        visible_to_users: Array.isArray(payload.visible_to_users)
          ? payload.visible_to_users.filter(
              (u): u is string => typeof u === "string"
            )
          : [userId], // Default: visible to creator
        visible_to_scopes: Array.isArray(payload.visible_to_scopes)
          ? payload.visible_to_scopes.filter(
              (s): s is string => typeof s === "string"
            )
          : [],
        attachments: [], // TODO: Handle attachments
      };

      // Call core to create dot
      try {
        const timestamp = now();
        const dotId = generateDotId();
        const result = core.createDot(draft, timestamp, dotId);

        // TODO: Persist result.dot, result.grants, result.links to D1

        return json(201, {
          dot_id: result.dot.id,
          created_at: result.dot.created_at,
          grants_count: result.grants.length,
        });
      } catch (err: unknown) {
        // Handle DotrcError
        if (err instanceof Error) {
          return json(400, {
            error: "validation_failed",
            detail: err.message,
          });
        }
        return json(500, {
          error: "internal_error",
          detail: "Unknown error",
        });
      }
    }

    return json(404, { error: "not_found", path: url.pathname });
  },
};
