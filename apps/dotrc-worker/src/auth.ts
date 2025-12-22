/**
 * Pluggable authentication system for DotRC.
 *
 * Supports multiple auth providers:
 * - JWT/OIDC: Industry standard, works with Auth0, Okta, Azure AD, GitHub, Google
 * - Cloudflare Access: CF-specific OIDC wrapper
 * - Trusted Headers: Reverse proxy (nginx, Traefik, K8s)
 * - Development: Local testing (NOT for production)
 *
 * Core principle: No auth logic in dotrc-core. Auth is adapter-specific.
 */

import type { AuthContext } from "./types";

/**
 * Result of auth provider extraction
 */
export interface AuthExtractionResult {
  tenant_id: string;
  user_id: string;
  scope_memberships: string[]; // Will be populated by scope resolution
}

/**
 * Auth provider interface - implement to add new auth methods
 */
export interface AuthProvider {
  /**
   * Check if this provider can handle the request
   * @returns true if provider recognizes the auth method
   */
  canHandle(request: Request): boolean;

  /**
   * Extract auth context from request
   * @returns AuthExtractionResult if successful, null if provider can't handle
   */
  extract(request: Request): Promise<AuthExtractionResult | null>;
}

/**
 * JWT/OIDC Provider - supports Auth0, Okta, Azure AD, GitHub, Google, etc.
 * Expects a Bearer token in Authorization header with a JWT
 *
 * JWT claims expected:
 * - sub: User identifier (required)
 * - tenant: Tenant identifier (required)
 * - scope: Space-separated list of scopes (optional)
 *
 * ⚠️  For production, implement proper JWT signature verification!
 * This is a placeholder that trusts the token claims (dev-only mode).
 */
export class JWTProvider implements AuthProvider {
  canHandle(request: Request): boolean {
    const auth = request.headers.get("authorization");
    return auth?.toLowerCase().startsWith("bearer ") ?? false;
  }

  async extract(request: Request): Promise<AuthExtractionResult | null> {
    const auth = request.headers.get("authorization");
    if (!auth?.toLowerCase().startsWith("bearer ")) {
      return null;
    }

    const token = auth.slice(7); // Remove "Bearer "

    try {
      // Decode JWT (without verification for now - prod should verify!)
      const [, payloadBase64] = token.split(".");
      if (!payloadBase64) return null;

      // Decode base64 (using atob for Worker compatibility)
      const payloadJson = atob(payloadBase64);
      const payload = JSON.parse(payloadJson);

      const tenant_id = payload.tenant || payload.aud;
      const user_id = payload.sub;
      const scopes = payload.scope ? (payload.scope as string).split(" ") : [];

      if (!tenant_id || !user_id) {
        return null;
      }

      return {
        tenant_id,
        user_id,
        scope_memberships: scopes,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Cloudflare Access Provider
 * Extracts auth from CF-Access-Authenticated-User-Identity header
 * (which is a signed JWT from Cloudflare's Access service)
 */
export class CloudflareAccessProvider implements AuthProvider {
  canHandle(request: Request): boolean {
    return request.headers.has("cf-access-authenticated-user-identity");
  }

  async extract(request: Request): Promise<AuthExtractionResult | null> {
    const headerValue = request.headers.get(
      "cf-access-authenticated-user-identity"
    );
    if (!headerValue) {
      return null;
    }

    try {
      // CF header is base64-encoded JSON
      const decoded = JSON.parse(atob(headerValue));

      // Extract from CF identity claims
      const user_id = decoded.sub || decoded.email;
      const tenant_id = request.headers.get("cf-access-authenticated-org-id");

      if (!user_id || !tenant_id) {
        return null;
      }

      return {
        tenant_id,
        user_id,
        scope_memberships: [],
      };
    } catch {
      return null;
    }
  }
}

/**
 * Trusted Header Provider
 * For reverse proxy deployments (nginx, Traefik, K8s ingress)
 *
 * ⚠️  SECURITY CRITICAL ⚠️
 * This provider ONLY works if the reverse proxy is in the trusted path.
 * Only enable in controlled deployments where headers cannot be spoofed.
 *
 * Expected headers:
 * - X-Forwarded-User: User identifier
 * - X-Forwarded-Tenant: Tenant identifier
 * - X-Forwarded-Groups: Comma-separated scope memberships
 */
export class TrustedHeaderProvider implements AuthProvider {
  private readonly requireSecureScheme: boolean;

  constructor(
    options: { requireSecureScheme: boolean } = { requireSecureScheme: true }
  ) {
    this.requireSecureScheme = options.requireSecureScheme;
  }

  canHandle(request: Request): boolean {
    const hasUserHeader = request.headers.has("x-forwarded-user");
    const hasTenantHeader = request.headers.has("x-forwarded-tenant");
    const isSecure =
      !this.requireSecureScheme || request.url.startsWith("https://");

    return hasUserHeader && hasTenantHeader && isSecure;
  }

  async extract(request: Request): Promise<AuthExtractionResult | null> {
    const user_id = request.headers.get("x-forwarded-user");
    const tenant_id = request.headers.get("x-forwarded-tenant");
    const groups = request.headers.get("x-forwarded-groups") || "";

    if (!user_id || !tenant_id) {
      return null;
    }

    // Validate format
    if (
      !/^[a-zA-Z0-9_-]+$/.test(user_id) ||
      !/^[a-zA-Z0-9_-]+$/.test(tenant_id)
    ) {
      return null;
    }

    return {
      tenant_id,
      user_id,
      scope_memberships: groups
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
}

/**
 * Development Provider
 * For local testing ONLY - accepts x-tenant-id and x-user-id headers
 * Should never be enabled in production
 *
 * ⚠️  INSECURE - For development/testing only ⚠️
 */
export class DevelopmentProvider implements AuthProvider {
  canHandle(request: Request): boolean {
    return (
      request.headers.has("x-tenant-id") && request.headers.has("x-user-id")
    );
  }

  async extract(request: Request): Promise<AuthExtractionResult | null> {
    const tenant_id = request.headers.get("x-tenant-id");
    const user_id = request.headers.get("x-user-id");

    if (!tenant_id || !user_id) {
      return null;
    }

    // Basic validation
    if (
      !/^[a-zA-Z0-9_-]+$/.test(tenant_id) ||
      !/^[a-zA-Z0-9_-]+$/.test(user_id)
    ) {
      return null;
    }

    return {
      tenant_id,
      user_id,
      scope_memberships: [],
    };
  }
}

/**
 * Resolve auth context from request using available providers
 * Tries providers in order until one succeeds
 *
 * @param request - The incoming request
 * @param providers - Auth providers to try (in order)
 * @returns AuthContext if successful, null if no provider matches
 */
export async function resolveAuthContext(
  request: Request,
  providers: AuthProvider[]
): Promise<(AuthContext & { tenant_id: string }) | null> {
  for (const provider of providers) {
    if (provider.canHandle(request)) {
      const result = await provider.extract(request);
      if (result) {
        return {
          tenant_id: result.tenant_id,
          requesting_user: result.user_id,
          user_scope_memberships: result.scope_memberships,
        };
      }
    }
  }

  return null;
}
