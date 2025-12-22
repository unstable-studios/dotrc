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
 * - aud / iss / exp / nbf: validated when provided
 */
export type SupportedJWTAlgorithm = "HS256" | "RS256";

export interface JWTProviderOptions {
  jwksUrl?: string;
  symmetricKey?: string;
  audience?: string;
  issuer?: string;
  allowedAlgorithms?: SupportedJWTAlgorithm[];
  clockToleranceSeconds?: number;
}

interface JWTPayload {
  sub?: unknown;
  tenant?: unknown;
  aud?: unknown;
  scope?: unknown;
  iss?: unknown;
  exp?: unknown;
  nbf?: unknown;
  [key: string]: unknown;
}

interface JWTHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
  [key: string]: unknown;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64UrlToUint8Array(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );

  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const maybeBuffer = (globalThis as { Buffer?: unknown }).Buffer as
    | undefined
    | { from(data: string, encoding: string): Uint8Array };

  if (maybeBuffer) {
    return new Uint8Array(maybeBuffer.from(padded, "base64"));
  }

  throw new Error("Base64 decoding not supported in this environment");
}

async function importHs256Key(secretBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

async function importRs256Key(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

export class JWTProvider implements AuthProvider {
  private readonly allowedAlgorithms: SupportedJWTAlgorithm[];
  private readonly jwksUrl?: string;
  private readonly symmetricKeyBytes?: Uint8Array;
  private readonly audience?: string;
  private readonly issuer?: string;
  private readonly clockToleranceSeconds: number;
  private jwksCache?: { keys: JsonWebKey[]; expiresAt: number };

  constructor(options: JWTProviderOptions = {}) {
    this.allowedAlgorithms = options.allowedAlgorithms ?? ["RS256", "HS256"];
    this.jwksUrl = options.jwksUrl;
    this.symmetricKeyBytes = options.symmetricKey
      ? textEncoder.encode(options.symmetricKey)
      : undefined;
    this.audience = options.audience;
    this.issuer = options.issuer;
    this.clockToleranceSeconds = options.clockToleranceSeconds ?? 60;
  }

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
    const [headerSegment, payloadSegment, signatureSegment] = token.split(".");

    if (!headerSegment || !payloadSegment || !signatureSegment) {
      return null;
    }

    try {
      const header = this.parseHeader(headerSegment);
      if (!header) {
        return null;
      }

      if (!this.allowedAlgorithms.includes(header.alg)) {
        return null;
      }

      const payload = this.parsePayload(payloadSegment);
      if (!payload) {
        return null;
      }

      const verified = await this.verifySignature(
        header,
        headerSegment,
        payloadSegment,
        signatureSegment
      );

      if (!verified) {
        return null;
      }

      if (!this.validateTemporalClaims(payload)) {
        return null;
      }

      if (!this.validateIssuer(payload) || !this.validateAudience(payload)) {
        return null;
      }

      let tenant_id: string | undefined;
      if (typeof payload.tenant === "string") {
        tenant_id = payload.tenant;
      } else if (typeof payload.aud === "string") {
        tenant_id = payload.aud;
      } else if (Array.isArray(payload.aud)) {
        const firstAud = payload.aud.find(
          (audValue) => typeof audValue === "string" && audValue.length > 0
        );
        tenant_id = firstAud;
      }
      const user_id = typeof payload.sub === "string" ? payload.sub : undefined;
      const scopeClaim = payload.scope;
      const scopes =
        typeof scopeClaim === "string"
          ? scopeClaim.split(" ").filter(Boolean)
          : Array.isArray(scopeClaim)
          ? scopeClaim
              .map((s) => (typeof s === "string" ? s.trim() : ""))
              .filter(Boolean)
          : [];

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

  private parseHeader(
    segment: string
  ): { alg: SupportedJWTAlgorithm; kid?: string } | null {
    try {
      const raw = JSON.parse(
        textDecoder.decode(base64UrlToUint8Array(segment))
      );
      const alg = raw.alg as unknown;
      const kid = raw.kid as unknown;

      if (alg === "HS256" || alg === "RS256") {
        return {
          alg,
          kid: typeof kid === "string" ? kid : undefined,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private parsePayload(segment: string): JWTPayload | null {
    try {
      return JSON.parse(textDecoder.decode(base64UrlToUint8Array(segment)));
    } catch {
      return null;
    }
  }

  private async verifySignature(
    header: { alg: SupportedJWTAlgorithm; kid?: string },
    headerSegment: string,
    payloadSegment: string,
    signatureSegment: string
  ): Promise<boolean> {
    const data = textEncoder.encode(`${headerSegment}.${payloadSegment}`);
    const signature = base64UrlToUint8Array(signatureSegment);

    if (header.alg === "HS256") {
      if (!this.symmetricKeyBytes) return false;

      try {
        const key = await importHs256Key(this.symmetricKeyBytes);
        return crypto.subtle.verify("HMAC", key, signature, data);
      } catch {
        return false;
      }
    }

    // RS256 verification
    const jwk = await this.getJwkForKid(header.kid);
    if (!jwk) {
      return false;
    }

    try {
      const key = await importRs256Key(jwk);
      return crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        key,
        signature,
        data
      );
    } catch {
      return false;
    }
  }

  private async getJwkForKid(kid?: string): Promise<JsonWebKey | null> {
    if (!this.jwksUrl) {
      return null;
    }

    try {
      const keys = await this.loadJwks();
      if (!keys.length) {
        return null;
      }

      if (kid) {
        const match = keys.find((key) => this.getKid(key) === kid);
        if (match) {
          return this.isRsaKey(match) ? match : null;
        }
        // If JWT specifies a kid but no match found, don't fall back to single key
        return null;
      }

      // Only use single key fallback when JWT doesn't specify a kid
      if (keys.length === 1 && this.isRsaKey(keys[0])) {
        return keys[0];
      }

      return null;
    } catch {
      return null;
    }
  }

  private async loadJwks(): Promise<JsonWebKey[]> {
    const now = Date.now();
    if (this.jwksCache && this.jwksCache.expiresAt > now) {
      return this.jwksCache.keys;
    }

    if (!this.jwksUrl) return [];

    const response = await fetch(this.jwksUrl);
    if (!response.ok) {
      return [];
    }

    try {
      const body = await response.json();
      const keys = Array.isArray((body as { keys?: unknown }).keys)
        ? (body as { keys: JsonWebKey[] }).keys ?? []
        : [];

      // Cache for 5 minutes to reduce JWKS fetches
      this.jwksCache = {
        keys,
        expiresAt: now + 5 * 60 * 1000,
      };

      return keys;
    } catch {
      // Malformed or non-JSON JWKS response; treat as no keys
      return [];
    }
  }

  private validateTemporalClaims(payload: JWTPayload): boolean {
    const now = Math.floor(Date.now() / 1000);
    const leeway = this.clockToleranceSeconds;

    if (typeof payload.exp === "number" && now >= payload.exp + leeway) {
      return false;
    }

    if (typeof payload.nbf === "number" && now + leeway < payload.nbf) {
      return false;
    }

    return true;
  }

  private validateIssuer(payload: JWTPayload): boolean {
    if (!this.issuer) return true;
    return typeof payload.iss === "string" && payload.iss === this.issuer;
  }

  private validateAudience(payload: JWTPayload): boolean {
    if (!this.audience) return true;

    const aud = payload.aud;
    if (typeof aud === "string") {
      return aud === this.audience;
    }

    if (Array.isArray(aud)) {
      return aud.includes(this.audience);
    }

    return false;
  }

  private isRsaKey(jwk: JsonWebKey): jwk is JsonWebKey {
    const { kty, n, e } = jwk as { kty?: unknown; n?: unknown; e?: unknown };
    const isRsaKty = typeof kty === "string" && kty === "RSA";
    const hasModulus = typeof n === "string" && n.length > 0;
    const hasExponent = typeof e === "string" && e.length > 0;
    return isRsaKty && hasModulus && hasExponent;
  }

  private getKid(jwk: JsonWebKey): string | undefined {
    const kid = (jwk as { kid?: unknown }).kid;
    return typeof kid === "string" ? kid : undefined;
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

    // Check X-Forwarded-Proto header for reverse proxy deployments
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isForwardedHttps = forwardedProto
      ? forwardedProto.split(",")[0]!.trim().toLowerCase() === "https"
      : request.url.startsWith("https://");
    const isSecure = !this.requireSecureScheme || isForwardedHttps;

    return hasUserHeader && hasTenantHeader && isSecure;
  }

  async extract(request: Request): Promise<AuthExtractionResult | null> {
    const user_id = request.headers.get("x-forwarded-user");
    const tenant_id = request.headers.get("x-forwarded-tenant");
    const groups = request.headers.get("x-forwarded-groups") || "";

    if (!user_id || !tenant_id) {
      return null;
    }

    // Validate format: allow common identifier forms (emails, slugs, etc.)
    // Disallow whitespace and commas to keep parsing simple and unambiguous.
    const idPattern = /^[\w.@+-]+$/;
    if (!idPattern.test(user_id) || !idPattern.test(tenant_id)) {
      return null;
    }

    return {
      tenant_id,
      user_id,
      scope_memberships: groups
        .split(/[,\s]+/)
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

    // Basic validation: require non-empty, no whitespace characters
    if (!/^\S+$/.test(tenant_id) || !/^\S+$/.test(user_id)) {
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
