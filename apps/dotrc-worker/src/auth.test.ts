import { describe, it, expect } from "vitest";
import {
  JWTProvider,
  CloudflareAccessProvider,
  TrustedHeaderProvider,
  DevelopmentProvider,
  resolveAuthContext,
} from "./auth";

const encoder = new TextEncoder();

function base64UrlEncode(data: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of data) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  const maybeBuffer = (
    globalThis as {
      Buffer?: {
        from(data: Uint8Array): { toString(encoding: string): string };
      };
    }
  ).Buffer;

  if (maybeBuffer) {
    return maybeBuffer
      .from(data)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  throw new Error("Base64 encoding not supported in this environment");
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)));
}

async function createHs256Token(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const headerSegment = base64UrlEncodeJson({ alg: "HS256", typ: "JWT" });
  const payloadSegment = base64UrlEncodeJson(payload);

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const data = encoder.encode(`${headerSegment}.${payloadSegment}`);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const signatureSegment = base64UrlEncode(signature);

  return `${headerSegment}.${payloadSegment}.${signatureSegment}`;
}

describe("Auth Providers", () => {
  describe("JWTProvider", () => {
    const secret = "test-secret";
    const provider = new JWTProvider({ symmetricKey: secret });

    it("recognizes Bearer token", () => {
      const request = new Request("http://localhost", {
        headers: {
          authorization:
            "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyIsInRlbmFudCI6InRlbmFudC00NTYifQ.sig",
        },
      });

      expect(provider.canHandle(request)).toBe(true);
    });

    it("ignores missing Bearer token", () => {
      const request = new Request("http://localhost");
      expect(provider.canHandle(request)).toBe(false);
    });

    it("extracts claims from JWT payload", async () => {
      // Base64 encoded payload: {"sub":"user-123","tenant":"tenant-456","scope":"scope-1 scope-2"}
      const token = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          scope: "scope-1 scope-2",
        },
        secret
      );

      const request = new Request("http://localhost", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const result = await provider.extract(request);
      expect(result).toEqual({
        tenant_id: "tenant-456",
        user_id: "user-123",
        scope_memberships: ["scope-1", "scope-2"],
      });
    });

    it("returns null for malformed JWT", async () => {
      const request = new Request("http://localhost", {
        headers: { authorization: "Bearer invalid" },
      });

      const result = await provider.extract(request);
      expect(result).toBeNull();
    });

    it("rejects invalid signatures", async () => {
      const tampered = await createHs256Token(
        { sub: "user-123", tenant: "tenant-456" },
        "wrong-secret"
      );

      const request = new Request("http://localhost", {
        headers: { authorization: `Bearer ${tampered}` },
      });

      const result = await provider.extract(request);
      expect(result).toBeNull();
    });

    it("rejects expired tokens", async () => {
      const token = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          exp: Math.floor(Date.now() / 1000) - 120,
        },
        secret
      );

      const request = new Request("http://localhost", {
        headers: { authorization: `Bearer ${token}` },
      });

      const result = await provider.extract(request);
      expect(result).toBeNull();
    });
  });

  describe("CloudflareAccessProvider", () => {
    const provider = new CloudflareAccessProvider();

    it("recognizes CF-Access header", () => {
      const request = new Request("http://localhost", {
        headers: { "cf-access-authenticated-user-identity": "eyJ..." },
      });

      expect(provider.canHandle(request)).toBe(true);
    });

    it("ignores missing CF headers", () => {
      const request = new Request("http://localhost");
      expect(provider.canHandle(request)).toBe(false);
    });

    it("extracts CF identity claims", async () => {
      // Base64: {"sub":"user@example.com","email":"user@example.com"}
      const request = new Request("http://localhost", {
        headers: {
          "cf-access-authenticated-user-identity":
            "eyJzdWIiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIn0=",
          "cf-access-authenticated-org-id": "org-789",
        },
      });

      const result = await provider.extract(request);
      expect(result).toEqual({
        tenant_id: "org-789",
        user_id: "user@example.com",
        scope_memberships: [],
      });
    });
  });

  describe("TrustedHeaderProvider", () => {
    const provider = new TrustedHeaderProvider();

    it("recognizes X-Forwarded-* headers", () => {
      const request = new Request("https://localhost", {
        headers: {
          "x-forwarded-user": "user-123",
          "x-forwarded-tenant": "tenant-456",
        },
      });

      expect(provider.canHandle(request)).toBe(true);
    });

    it("requires HTTPS by default", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-forwarded-user": "user-123",
          "x-forwarded-tenant": "tenant-456",
        },
      });

      expect(provider.canHandle(request)).toBe(false);
    });

    it("checks X-Forwarded-Proto header for HTTPS in reverse proxy", () => {
      // Request URL is HTTP, but X-Forwarded-Proto says HTTPS (reverse proxy scenario)
      const request = new Request("http://localhost", {
        headers: {
          "x-forwarded-user": "user-123",
          "x-forwarded-tenant": "tenant-456",
          "x-forwarded-proto": "https",
        },
      });

      expect(provider.canHandle(request)).toBe(true);
    });

    it("extracts forwarded user and tenant", async () => {
      const request = new Request("https://localhost", {
        headers: {
          "x-forwarded-user": "user-123",
          "x-forwarded-tenant": "tenant-456",
          "x-forwarded-groups": "scope-1, scope-2",
        },
      });

      const result = await provider.extract(request);
      expect(result).toEqual({
        tenant_id: "tenant-456",
        user_id: "user-123",
        scope_memberships: ["scope-1", "scope-2"],
      });
    });

    it("validates user/tenant format", async () => {
      // Should reject whitespace in user_id
      const request = new Request("https://localhost", {
        headers: {
          "x-forwarded-user": "user with spaces",
          "x-forwarded-tenant": "tenant-456",
        },
      });

      const result = await provider.extract(request);
      expect(result).toBeNull();
    });

    it("accepts email addresses as user identifiers", async () => {
      const request = new Request("https://localhost", {
        headers: {
          "x-forwarded-user": "user@example.com",
          "x-forwarded-tenant": "tenant-456",
        },
      });

      const result = await provider.extract(request);
      expect(result).toEqual({
        tenant_id: "tenant-456",
        user_id: "user@example.com",
        scope_memberships: [],
      });
    });

    it("handles both comma and space-separated groups", async () => {
      const request = new Request("https://localhost", {
        headers: {
          "x-forwarded-user": "user-123",
          "x-forwarded-tenant": "tenant-456",
          "x-forwarded-groups": "scope-1 scope-2,scope-3",
        },
      });

      const result = await provider.extract(request);
      expect(result).toEqual({
        tenant_id: "tenant-456",
        user_id: "user-123",
        scope_memberships: ["scope-1", "scope-2", "scope-3"],
      });
    });
  });

  describe("DevelopmentProvider", () => {
    const provider = new DevelopmentProvider();

    it("recognizes x-tenant-id and x-user-id headers", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-tenant-id": "tenant-123",
          "x-user-id": "user-456",
        },
      });

      expect(provider.canHandle(request)).toBe(true);
    });

    it("extracts development credentials", async () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-tenant-id": "tenant-123",
          "x-user-id": "user-456",
        },
      });

      const result = await provider.extract(request);
      expect(result).toEqual({
        tenant_id: "tenant-123",
        user_id: "user-456",
        scope_memberships: [],
      });
    });
  });

  describe("resolveAuthContext", () => {
    it("tries providers in order", async () => {
      const devProvider = new DevelopmentProvider();
      const jwtProvider = new JWTProvider();

      const request = new Request("http://localhost", {
        headers: {
          "x-tenant-id": "dev-tenant",
          "x-user-id": "dev-user",
        },
      });

      const context = await resolveAuthContext(request, [
        devProvider,
        jwtProvider,
      ]);

      expect(context).toEqual({
        tenant_id: "dev-tenant",
        requesting_user: "dev-user",
        user_scope_memberships: [],
      });
    });

    it("returns null when no provider matches", async () => {
      const jwtProvider = new JWTProvider();

      const request = new Request("http://localhost");

      const context = await resolveAuthContext(request, [jwtProvider]);

      expect(context).toBeNull();
    });

    it("skips providers that cannot handle request", async () => {
      const jwtProvider = new JWTProvider();
      const devProvider = new DevelopmentProvider();

      // Only dev provider can handle this
      const request = new Request("http://localhost", {
        headers: {
          "x-tenant-id": "dev-tenant",
          "x-user-id": "dev-user",
        },
      });

      const context = await resolveAuthContext(request, [
        jwtProvider,
        devProvider,
      ]);

      expect(context?.tenant_id).toBe("dev-tenant");
    });
  });
});
