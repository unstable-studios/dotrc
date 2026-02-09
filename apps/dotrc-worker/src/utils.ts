// Utility functions for the worker

/**
 * Generate a unique ID for a dot
 * Uses crypto.randomUUID() which is available in Workers
 */
export function generateDotId(): string {
  return `dot-${crypto.randomUUID()}`;
}

/**
 * Generate a unique ID for an attachment
 */
export function generateAttachmentId(): string {
  return `att-${crypto.randomUUID()}`;
}

/**
 * Get current timestamp in RFC3339 format (UTC)
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Parse tenant ID from request.
 *
 * ⚠️  SECURITY CRITICAL ⚠️
 * The current implementation accepts x-tenant-id directly from client headers.
 * This is INSECURE and must NEVER be used in production, as it allows
 * arbitrary tenant impersonation and breaks multi-tenant isolation.
 *
 * Proper implementations MUST derive tenant ID from a verified, authenticated
 * context such as:
 * - Validated JWT claim
 * - Cloudflare Access authenticated request
 * - OAuth token verification
 * - Trusted subdomain routing
 *
 * Validation applied:
 * - Length: 1-256 characters
 * - Characters: alphanumeric, hyphens, underscores only (prevents injection)
 *
 * This temporary implementation is for development/testing ONLY.
 */
export function parseTenantId(request: Request): string | null {
  const header = request.headers.get("x-tenant-id");
  if (!header || header.length === 0 || header.length > 256) {
    return null;
  }
  // Whitelist validation: allow only alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(header)) {
    return null;
  }
  return header;
}

/**
 * Parse user ID from request.
 *
 * ⚠️  SECURITY CRITICAL ⚠️
 * The current implementation accepts x-user-id directly from client headers.
 * This is INSECURE and must NEVER be used in production, as it allows
 * arbitrary user impersonation and authorization bypass.
 *
 * Proper implementations MUST derive user ID from a verified, authenticated
 * context such as:
 * - Validated JWT/OIDC token
 * - Slack OAuth token
 * - Cloudflare Access authentication
 * - Session token verification
 *
 * Validation applied:
 * - Length: 1-256 characters
 * - Characters: alphanumeric, hyphens, underscores only (prevents injection)
 *
 * This temporary implementation is for development/testing ONLY.
 */
export function parseUserId(request: Request): string | null {
  const header = request.headers.get("x-user-id");
  if (!header || header.length === 0 || header.length > 256) {
    return null;
  }
  // Whitelist validation: allow only alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(header)) {
    return null;
  }
  return header;
}

/**
 * Build scope memberships from request context
 * For now, return empty array
 */
export function parseScopeMemberships(request: Request): string[] {
  // TODO: Fetch from Slack API or session
  return [];
}

/**
 * Parse and clamp pagination parameters from URL search params.
 * - limit: clamped to [1, 100], defaults to 50
 * - offset: clamped to [0, ∞), defaults to 0
 */
export function parsePaginationParams(url: URL): {
  limit: number;
  offset: number;
} {
  const rawLimit = url.searchParams.get("limit") || "50";
  const rawOffset = url.searchParams.get("offset") || "0";
  const limit = Math.min(Math.max(1, parseInt(rawLimit, 10) || 50), 100);
  const offset = Math.max(0, parseInt(rawOffset, 10) || 0);
  return { limit, offset };
}

/**
 * Allowed MIME types for attachment uploads.
 */
export const ALLOWED_MIME_TYPES = new Set([
  // Documents
  "application/pdf",
  "application/json",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/xml",
  "text/xml",
  // Images
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Archives
  "application/zip",
  "application/gzip",
  // Office
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Fallback
  "application/octet-stream",
]);
