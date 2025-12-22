import { DotrcCore } from "./core";
import type { DotrcWasm } from "./core";
import type { DotDraft, AuthContext } from "./types";
import { DotrcError } from "./types";
import { generateDotId, now } from "./utils";
import {
  resolveAuthContext,
  JWTProvider,
  CloudflareAccessProvider,
  TrustedHeaderProvider,
  DevelopmentProvider,
  type AuthProvider,
} from "./auth";

// Import WASM module functions
// The bundler target automatically initializes the WASM module on import
// @ts-ignore - Suppress module resolution error when pkg is not built during typecheck
import * as wasm from "../../../crates/dotrc-core-wasm/pkg/dotrc_core_wasm.js";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

// D1 database binding (optional, persistence not yet wired)
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
  // Optional: D1 database binding will be configured when persistence is implemented
  DB?: D1Database;
  JWT_JWKS_URL?: string;
  JWT_AUDIENCE?: string;
  JWT_ISSUER?: string;
  JWT_HS256_SECRET?: string;
  JWT_CLOCK_SKEW_SECONDS?: string;
}

// Initialize WASM core wrapper (bundler target auto-initializes on import)
const core = new DotrcCore(wasm as DotrcWasm);

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
      // Configure auth providers in order of preference
      // Production: Cloudflare Access → JWT → Trusted Headers
      // Development: Add DevelopmentProvider for local testing
      const clockSkewSeconds = env.JWT_CLOCK_SKEW_SECONDS
        ? Number(env.JWT_CLOCK_SKEW_SECONDS)
        : undefined;
      const validClockSkew =
        clockSkewSeconds !== undefined &&
        !isNaN(clockSkewSeconds) &&
        Number.isFinite(clockSkewSeconds)
          ? clockSkewSeconds
          : undefined;

      const authProviders: AuthProvider[] = [
        new CloudflareAccessProvider(),
        new JWTProvider({
          jwksUrl: env.JWT_JWKS_URL,
          audience: env.JWT_AUDIENCE,
          issuer: env.JWT_ISSUER,
          symmetricKey: env.JWT_HS256_SECRET,
          clockToleranceSeconds: validClockSkew,
        }),
        new TrustedHeaderProvider(),
        new DevelopmentProvider(), // Only for testing
      ];

      // Resolve auth context from trusted sources
      const authContext = await resolveAuthContext(request, authProviders);

      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
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

      // Validate required fields before building draft
      const title =
        typeof payload.title === "string" ? payload.title.trim() : "";
      if (!title) {
        return json(400, {
          error: "invalid_body",
          detail: "Missing or empty 'title' field",
        });
      }

      // Build dot draft using auth context
      const draft: DotDraft = {
        title,
        body: typeof payload.body === "string" ? payload.body : undefined,
        created_by: authContext.requesting_user,
        tenant_id: authContext.tenant_id, // From auth context
        scope_id:
          typeof payload.scope_id === "string" ? payload.scope_id : undefined,
        tags: Array.isArray(payload.tags)
          ? payload.tags.filter((t): t is string => typeof t === "string")
          : [],
        visible_to_users: Array.isArray(payload.visible_to_users)
          ? payload.visible_to_users.filter(
              (u): u is string => typeof u === "string"
            )
          : [authContext.requesting_user], // Default: visible to creator
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
          links_count: result.links.length,
        });
      } catch (err: unknown) {
        // Handle errors from core with typed error kinds
        if (err instanceof DotrcError) {
          const status =
            err.kind === "Validation"
              ? 400
              : err.kind === "Authorization"
              ? 403
              : 500;

          const errorCode =
            err.kind === "Validation"
              ? "validation_failed"
              : err.kind === "Authorization"
              ? "unauthorized"
              : "internal_error";

          return json(status, {
            error: errorCode,
            kind: err.kind,
            // For client errors (4xx), return the actual error message for better debugging.
            // For server errors (5xx), avoid leaking internal details.
            detail:
              status >= 400 && status < 500
                ? err.message
                : "Request processing failed",
          });
        }

        // Fallback for unexpected errors
        if (err instanceof Error) {
          return json(500, {
            error: "internal_error",
            detail: "Request processing failed",
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
