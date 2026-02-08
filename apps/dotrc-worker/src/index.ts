import { DotrcCore } from "./core";
import type { DotrcWasm } from "./core";
import type { DotDraft, AuthContext, LinkType } from "./types";
import { DotrcError } from "./types";
import { generateDotId, generateAttachmentId, now } from "./utils";
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

// Helper type for values that are JSON-serializable
// This is intentionally broad to allow domain types (like Dot) that don't have
// index signatures but are structurally JSON-serializable
export type JsonSerializable = JsonValue | { [key: string]: any } | any[];

import { D1DotStorage, type D1Database } from "./storage-d1";
import { R2AttachmentStorage, type R2Bucket } from "./storage-r2";

interface Env {
  // D1 database binding for persistence
  DB?: D1Database;
  // R2 bucket binding for attachment storage
  ATTACHMENTS?: R2Bucket;
  // JWT configuration
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
  body: JsonSerializable,
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

/**
 * Helper function to resolve authentication context from request.
 * Configures auth providers and validates clock skew.
 */
async function getAuthContext(
  request: Request,
  env: Env
): Promise<(AuthContext & { tenant_id: string }) | null> {
  // Validate and parse clock skew configuration
  const clockSkewSeconds = env.JWT_CLOCK_SKEW_SECONDS
    ? Number(env.JWT_CLOCK_SKEW_SECONDS)
    : undefined;
  const validClockSkew =
    clockSkewSeconds !== undefined &&
    !isNaN(clockSkewSeconds) &&
    Number.isFinite(clockSkewSeconds)
      ? clockSkewSeconds
      : undefined;

  // Configure auth providers in order of preference
  // Production: Cloudflare Access → JWT → Trusted Headers
  // Development: Add DevelopmentProvider for local testing
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
    new DevelopmentProvider(),
  ];

  return await resolveAuthContext(request, authProviders);
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
      // Resolve auth context from trusted sources
      const authContext = await getAuthContext(request, env);

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

        // Persist to D1 if available
        if (env.DB) {
          const storage = new D1DotStorage(env.DB);
          const storeRequest = {
            dot: result.dot,
            grants: result.grants,
            links: result.links,
          };
          // Lazily ensure all referenced users/scopes/tenant exist
          await storage.ensureEntities(storeRequest, timestamp);
          await storage.storeDot(storeRequest);
        }

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

    // GET /dots/:dotId - Retrieve a specific dot
    if (
      request.method === "GET" &&
      segments.length === 2 &&
      segments[0] === "dots"
    ) {
      const dotId = segments[1];

      // Resolve auth context
      const authContext = await getAuthContext(request, env);

      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
        });
      }

      // Retrieve from D1 if available
      if (!env.DB) {
        return json(503, {
          error: "service_unavailable",
          detail: "Database not configured",
        });
      }

      try {
        const storage = new D1DotStorage(env.DB);
        const dot = await storage.getDot(authContext.tenant_id, dotId);

        if (!dot) {
          return json(404, {
            error: "not_found",
            detail: "Dot not found",
          });
        }

        // Check if user can view this dot
        const grants = await storage.getGrants(authContext.tenant_id, dotId);
        const canView =
          dot.created_by === authContext.requesting_user ||
          grants.some((g) => g.user_id === authContext.requesting_user);

        if (!canView) {
          return json(403, {
            error: "forbidden",
            detail: "You do not have permission to view this dot",
          });
        }

        return json(200, dot);
      } catch (err: unknown) {
        if (err instanceof Error) {
          return json(500, {
            error: "internal_error",
            detail: "Failed to retrieve dot",
          });
        }

        return json(500, {
          error: "internal_error",
          detail: "Unknown error",
        });
      }
    }

    // GET /dots - List dots for current user
    if (
      request.method === "GET" &&
      segments.length === 1 &&
      segments[0] === "dots"
    ) {
      // Resolve auth context
      const authContext = await getAuthContext(request, env);

      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
        });
      }

      // Retrieve from D1 if available
      if (!env.DB) {
        return json(503, {
          error: "service_unavailable",
          detail: "Database not configured",
        });
      }

      try {
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);

        const storage = new D1DotStorage(env.DB);
        const result = await storage.listDotsForUser({
          tenantId: authContext.tenant_id,
          userId: authContext.requesting_user,
          limit,
          offset,
        });

        return json(200, {
          dots: result.dots,
          total: result.total,
          has_more: result.hasMore,
          limit,
          offset,
        });
      } catch (err: unknown) {
        if (err instanceof Error) {
          return json(500, {
            error: "internal_error",
            detail: "Failed to list dots",
          });
        }

        return json(500, {
          error: "internal_error",
          detail: "Unknown error",
        });
      }
    }

    // POST /dots/:dotId/grants - Grant access to an existing dot
    if (
      request.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "dots" &&
      segments[2] === "grants"
    ) {
      const dotId = segments[1];

      const authContext = await getAuthContext(request, env);
      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
        });
      }

      if (!env.DB) {
        return json(503, {
          error: "service_unavailable",
          detail: "Database not configured",
        });
      }

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
      const userIds = Array.isArray(payload.user_ids)
        ? payload.user_ids.filter((u): u is string => typeof u === "string")
        : [];
      const scopeIds = Array.isArray(payload.scope_ids)
        ? payload.scope_ids.filter((s): s is string => typeof s === "string")
        : [];

      if (userIds.length === 0 && scopeIds.length === 0) {
        return json(400, {
          error: "invalid_body",
          detail: "At least one entry in user_ids or scope_ids is required",
        });
      }

      try {
        const storage = new D1DotStorage(env.DB);
        const dot = await storage.getDot(authContext.tenant_id, dotId);

        if (!dot) {
          return json(404, {
            error: "not_found",
            detail: "Dot not found",
          });
        }

        const existingGrants = await storage.getGrants(
          authContext.tenant_id,
          dotId
        );

        const timestamp = now();
        const result = core.grantAccess(
          dot,
          existingGrants,
          userIds,
          scopeIds,
          {
            requesting_user: authContext.requesting_user,
            user_scope_memberships:
              authContext.user_scope_memberships || [],
          },
          timestamp
        );

        // Ensure all new grantee users/scopes exist
        for (const grant of result.grants) {
          if (grant.user_id) {
            await storage.ensureUser(
              grant.user_id,
              authContext.tenant_id,
              timestamp
            );
          }
          if (grant.scope_id) {
            await storage.ensureScope(
              grant.scope_id,
              authContext.tenant_id,
              timestamp
            );
          }
        }

        await storage.storeGrants(result.grants);

        return json(201, {
          grants: result.grants,
          grants_count: result.grants.length,
        });
      } catch (err: unknown) {
        if (err instanceof DotrcError) {
          const status =
            err.kind === "Validation"
              ? 400
              : err.kind === "Authorization"
              ? 403
              : 500;

          return json(status, {
            error:
              status === 400
                ? "validation_failed"
                : status === 403
                ? "forbidden"
                : "internal_error",
            kind: err.kind,
            detail:
              status < 500
                ? err.message
                : "Request processing failed",
          });
        }

        return json(500, {
          error: "internal_error",
          detail: "Request processing failed",
        });
      }
    }

    // GET /dots/:dotId/grants - List grants for a dot
    if (
      request.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "dots" &&
      segments[2] === "grants"
    ) {
      const dotId = segments[1];

      const authContext = await getAuthContext(request, env);
      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
        });
      }

      if (!env.DB) {
        return json(503, {
          error: "service_unavailable",
          detail: "Database not configured",
        });
      }

      try {
        const storage = new D1DotStorage(env.DB);
        const dot = await storage.getDot(authContext.tenant_id, dotId);

        if (!dot) {
          return json(404, {
            error: "not_found",
            detail: "Dot not found",
          });
        }

        const grants = await storage.getGrants(authContext.tenant_id, dotId);

        // Only creator or existing grantees can view grants
        const canView =
          dot.created_by === authContext.requesting_user ||
          grants.some((g) => g.user_id === authContext.requesting_user);

        if (!canView) {
          return json(403, {
            error: "forbidden",
            detail: "You do not have permission to view grants for this dot",
          });
        }

        return json(200, { grants });
      } catch (err: unknown) {
        return json(500, {
          error: "internal_error",
          detail: "Failed to retrieve grants",
        });
      }
    }

    // POST /dots/:dotId/links - Create a link between dots
    if (
      request.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "dots" &&
      segments[2] === "links"
    ) {
      const fromDotId = segments[1];

      const authContext = await getAuthContext(request, env);
      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
        });
      }

      if (!env.DB) {
        return json(503, {
          error: "service_unavailable",
          detail: "Database not configured",
        });
      }

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
      const toDotId =
        typeof payload.to_dot_id === "string" ? payload.to_dot_id : "";
      const linkType =
        typeof payload.link_type === "string" ? payload.link_type : "";

      if (!toDotId) {
        return json(400, {
          error: "invalid_body",
          detail: "Missing 'to_dot_id' field",
        });
      }

      const validLinkTypes: LinkType[] = [
        "followup",
        "corrects",
        "supersedes",
        "related",
      ];
      if (!validLinkTypes.includes(linkType as LinkType)) {
        return json(400, {
          error: "invalid_body",
          detail: `Invalid link_type '${linkType}'. Must be one of: ${validLinkTypes.join(", ")}`,
        });
      }

      try {
        const storage = new D1DotStorage(env.DB);
        const fromDot = await storage.getDot(
          authContext.tenant_id,
          fromDotId
        );

        if (!fromDot) {
          return json(404, {
            error: "not_found",
            detail: "Source dot not found",
          });
        }

        const toDot = await storage.getDot(authContext.tenant_id, toDotId);

        if (!toDot) {
          return json(404, {
            error: "not_found",
            detail: "Target dot not found",
          });
        }

        const fromGrants = await storage.getGrants(
          authContext.tenant_id,
          fromDotId
        );
        const toGrants = await storage.getGrants(
          authContext.tenant_id,
          toDotId
        );
        const existingLinks = await storage.getLinks(
          authContext.tenant_id,
          fromDotId
        );

        const timestamp = now();
        const result = core.createLink(
          fromDot,
          toDot,
          linkType as LinkType,
          { from: fromGrants, to: toGrants },
          existingLinks,
          {
            requesting_user: authContext.requesting_user,
            user_scope_memberships:
              authContext.user_scope_memberships || [],
          },
          timestamp
        );

        await storage.storeLink(result.link, authContext.tenant_id);

        return json(201, { link: result.link });
      } catch (err: unknown) {
        if (err instanceof DotrcError) {
          const status =
            err.kind === "Validation"
              ? 400
              : err.kind === "Authorization"
              ? 403
              : err.kind === "Link"
              ? 409
              : 500;

          return json(status, {
            error:
              status === 400
                ? "validation_failed"
                : status === 403
                ? "forbidden"
                : status === 409
                ? "link_error"
                : "internal_error",
            kind: err.kind,
            detail:
              status < 500
                ? err.message
                : "Request processing failed",
          });
        }

        return json(500, {
          error: "internal_error",
          detail: "Request processing failed",
        });
      }
    }

    // GET /dots/:dotId/links - List links for a dot
    if (
      request.method === "GET" &&
      segments.length === 3 &&
      segments[0] === "dots" &&
      segments[2] === "links"
    ) {
      const dotId = segments[1];

      const authContext = await getAuthContext(request, env);
      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
        });
      }

      if (!env.DB) {
        return json(503, {
          error: "service_unavailable",
          detail: "Database not configured",
        });
      }

      try {
        const storage = new D1DotStorage(env.DB);
        const dot = await storage.getDot(authContext.tenant_id, dotId);

        if (!dot) {
          return json(404, {
            error: "not_found",
            detail: "Dot not found",
          });
        }

        // Check if user can view this dot
        const grants = await storage.getGrants(authContext.tenant_id, dotId);
        const canView =
          dot.created_by === authContext.requesting_user ||
          grants.some((g) => g.user_id === authContext.requesting_user);

        if (!canView) {
          return json(403, {
            error: "forbidden",
            detail: "You do not have permission to view this dot",
          });
        }

        const links = await storage.getLinks(authContext.tenant_id, dotId);

        // Filter out links to dots the requester cannot view
        const visibleLinks = [];
        for (const link of links) {
          const otherDotId =
            link.from_dot_id === dotId ? link.to_dot_id : link.from_dot_id;
          const otherDot = await storage.getDot(
            authContext.tenant_id,
            otherDotId
          );
          if (!otherDot) continue;
          const otherGrants = await storage.getGrants(
            authContext.tenant_id,
            otherDotId
          );
          const canViewOther =
            otherDot.created_by === authContext.requesting_user ||
            otherGrants.some(
              (g) => g.user_id === authContext.requesting_user
            );
          if (canViewOther) {
            visibleLinks.push(link);
          }
        }

        return json(200, { links: visibleLinks });
      } catch (err: unknown) {
        return json(500, {
          error: "internal_error",
          detail: "Failed to retrieve links",
        });
      }
    }

    // POST /dots/:dotId/attachments - Upload an attachment
    if (
      request.method === "POST" &&
      segments.length === 3 &&
      segments[0] === "dots" &&
      segments[2] === "attachments"
    ) {
      const dotId = segments[1];

      const authContext = await getAuthContext(request, env);
      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
        });
      }

      if (!env.DB) {
        return json(503, {
          error: "service_unavailable",
          detail: "Database not configured",
        });
      }

      if (!env.ATTACHMENTS) {
        return json(503, {
          error: "service_unavailable",
          detail: "Attachment storage not configured",
        });
      }

      // Early size check via Content-Length header (before buffering the body)
      const contentLength = request.headers.get("content-length");
      const maxSize = 10 * 1024 * 1024;
      if (contentLength && parseInt(contentLength, 10) > maxSize) {
        return json(413, {
          error: "file_too_large",
          detail: `File exceeds maximum size of ${maxSize} bytes`,
        });
      }

      // Parse multipart form data
      const reqContentType = request.headers.get("content-type") || "";
      if (!reqContentType.includes("multipart/form-data")) {
        return json(400, {
          error: "invalid_body",
          detail: "Expected multipart/form-data",
        });
      }

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch (err) {
        return json(400, {
          error: "invalid_body",
          detail: "Failed to parse multipart form data",
        });
      }

      try {
        const storage = new D1DotStorage(env.DB);
        const dot = await storage.getDot(authContext.tenant_id, dotId);

        if (!dot) {
          return json(404, {
            error: "not_found",
            detail: "Dot not found",
          });
        }

        // Only the creator can add attachments
        if (dot.created_by !== authContext.requesting_user) {
          return json(403, {
            error: "forbidden",
            detail: "Only the dot creator can add attachments",
          });
        }

        // Enforce max attachments limit (aligned with core MAX_ATTACHMENTS = 10)
        const MAX_ATTACHMENTS = 10;
        if (dot.attachments.length >= MAX_ATTACHMENTS) {
          return json(400, {
            error: "validation_failed",
            detail: `Dot already has the maximum number of attachments (${MAX_ATTACHMENTS})`,
          });
        }

        const fileEntry = formData.get("file");

        if (!fileEntry || typeof fileEntry === "string") {
          return json(400, {
            error: "invalid_body",
            detail: "Missing 'file' field in form data",
          });
        }

        const file = fileEntry as unknown as {
          name: string;
          type: string;
          size: number;
          arrayBuffer(): Promise<ArrayBuffer>;
        };

        // Size limit: 10MB
        if (file.size > maxSize) {
          return json(413, {
            error: "file_too_large",
            detail: `File exceeds maximum size of ${maxSize} bytes`,
          });
        }

        // Validate filename
        if (!file.name || file.name.trim().length === 0) {
          return json(400, {
            error: "invalid_body",
            detail: "Filename is required",
          });
        }
        if (file.name.length > 255) {
          return json(400, {
            error: "invalid_body",
            detail: "Filename exceeds maximum length of 255 characters",
          });
        }
        if (/[\/\\]/.test(file.name)) {
          return json(400, {
            error: "invalid_body",
            detail: "Filename must not contain path separators",
          });
        }
        // eslint-disable-next-line no-control-regex
        if (/[\x00-\x1f\x7f]/.test(file.name)) {
          return json(400, {
            error: "invalid_body",
            detail: "Filename must not contain control characters",
          });
        }

        const timestamp = now();
        const attachmentId = generateAttachmentId();
        const fileData = new Uint8Array(await file.arrayBuffer());

        // Compute content hash
        const hashBuffer = await crypto.subtle.digest("SHA-256", fileData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const contentHash =
          "sha256:" +
          hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

        // Upload to R2
        const r2Storage = new R2AttachmentStorage(env.ATTACHMENTS);
        const storageKey = await r2Storage.uploadAttachment({
          tenantId: authContext.tenant_id,
          dotId,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          data: fileData,
        });

        // Store metadata in D1 (including R2 storage key for retrieval)
        // On failure, clean up the R2 object to prevent orphans
        try {
          await storage.storeAttachmentRef(dotId, {
            id: attachmentId,
            filename: file.name,
            mime_type: file.type || "application/octet-stream",
            size_bytes: file.size,
            content_hash: contentHash,
            storage_key: storageKey,
            created_at: timestamp,
          });
        } catch (metadataErr) {
          // Best-effort cleanup of orphaned R2 object
          try {
            await r2Storage.deleteAttachment(storageKey);
          } catch {
            // Swallow cleanup error — the original error is more important
          }
          throw metadataErr;
        }

        return json(201, {
          attachment_id: attachmentId,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          content_hash: contentHash,
          created_at: timestamp,
        });
      } catch (err: unknown) {
        return json(500, {
          error: "internal_error",
          detail: "Failed to upload attachment",
        });
      }
    }

    // GET /attachments/:attachmentId - Download an attachment
    if (
      request.method === "GET" &&
      segments.length === 2 &&
      segments[0] === "attachments"
    ) {
      const attachmentId = segments[1];

      const authContext = await getAuthContext(request, env);
      if (!authContext) {
        return json(401, {
          error: "unauthorized",
          detail: "No valid authentication provided",
        });
      }

      if (!env.DB) {
        return json(503, {
          error: "service_unavailable",
          detail: "Database not configured",
        });
      }

      if (!env.ATTACHMENTS) {
        return json(503, {
          error: "service_unavailable",
          detail: "Attachment storage not configured",
        });
      }

      try {
        const storage = new D1DotStorage(env.DB);
        const attachmentRef = await storage.getAttachmentRef(attachmentId);

        if (!attachmentRef) {
          return json(404, {
            error: "not_found",
            detail: "Attachment not found",
          });
        }

        // Check if user can view the parent dot
        const dot = await storage.getDot(
          authContext.tenant_id,
          attachmentRef.dot_id
        );

        if (!dot) {
          return json(404, {
            error: "not_found",
            detail: "Attachment not found",
          });
        }

        const grants = await storage.getGrants(
          authContext.tenant_id,
          attachmentRef.dot_id
        );
        const canView =
          dot.created_by === authContext.requesting_user ||
          grants.some((g) => g.user_id === authContext.requesting_user);

        if (!canView) {
          return json(403, {
            error: "forbidden",
            detail: "You do not have permission to view this attachment",
          });
        }

        if (!attachmentRef.storage_key) {
          return json(404, {
            error: "not_found",
            detail: "Attachment storage key not available",
          });
        }

        const r2Storage = new R2AttachmentStorage(env.ATTACHMENTS);
        const attachmentData = await r2Storage.getAttachment(
          attachmentRef.storage_key
        );

        if (!attachmentData) {
          return json(404, {
            error: "not_found",
            detail: "Attachment file not found in storage",
          });
        }

        // Sanitize filename for Content-Disposition header to prevent injection
        const safeFilename = attachmentRef.filename
          .replace(/[\r\n]/g, "") // Strip CRLF
          .replace(/"/g, '\\"'); // Escape quotes
        // RFC 5987 encoding for UTF-8 filenames
        const encodedFilename = encodeURIComponent(attachmentRef.filename)
          .replace(/'/g, "%27");

        return new Response(attachmentData.data, {
          status: 200,
          headers: {
            "content-type": attachmentData.contentType,
            "content-length": String(attachmentData.sizeBytes),
            "content-disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
          },
        });
      } catch (err: unknown) {
        return json(500, {
          error: "internal_error",
          detail: "Failed to retrieve attachment",
        });
      }
    }

    return json(404, { error: "not_found", path: url.pathname });
  },
};
