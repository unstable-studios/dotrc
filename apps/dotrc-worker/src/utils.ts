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
 * Parse tenant ID from request (from header, subdomain, or body)
 * For now, extract from x-tenant-id header or default
 */
export function parseTenantId(request: Request): string | null {
  const header = request.headers.get("x-tenant-id");
  if (header) {
    return header;
  }
  // TODO: Parse from subdomain or JWT
  return null;
}

/**
 * Parse user ID from request (from auth token)
 * For now, extract from x-user-id header or default
 */
export function parseUserId(request: Request): string | null {
  const header = request.headers.get("x-user-id");
  if (header) {
    return header;
  }
  // TODO: Parse from JWT or Slack auth
  return null;
}

/**
 * Build scope memberships from request context
 * For now, return empty array
 */
export function parseScopeMemberships(request: Request): string[] {
  // TODO: Fetch from Slack API or session
  return [];
}
