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

async function createRs256Token(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  kid?: string
): Promise<string> {
  const header: Record<string, unknown> = { alg: "RS256", typ: "JWT" };
  if (kid) {
    header.kid = kid;
  }
  const headerSegment = base64UrlEncodeJson(header);
  const payloadSegment = base64UrlEncodeJson(payload);

  const data = encoder.encode(`${headerSegment}.${payloadSegment}`);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      privateKey,
      data
    )
  );
  const signatureSegment = base64UrlEncode(signature);

  return `${headerSegment}.${payloadSegment}.${signatureSegment}`;
}

async function generateRsaKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JsonWebKey;
}> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;

  const publicJwk = (await crypto.subtle.exportKey(
    "jwk",
    keyPair.publicKey
  )) as JsonWebKey;

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicJwk,
  };
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

    it("handles aud as array for tenant_id extraction", async () => {
      const token = await createHs256Token(
        {
          sub: "user-123",
          aud: ["tenant-456", "other-audience"],
          scope: "scope-1",
        },
        secret
      );

      const request = new Request("http://localhost", {
        headers: { authorization: `Bearer ${token}` },
      });

      const result = await provider.extract(request);
      expect(result).toEqual({
        tenant_id: "tenant-456",
        user_id: "user-123",
        scope_memberships: ["scope-1"],
      });
    });

    it("handles scope as array", async () => {
      const token = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          scope: ["scope-1", "scope-2", "scope-3"],
        },
        secret
      );

      const request = new Request("http://localhost", {
        headers: { authorization: `Bearer ${token}` },
      });

      const result = await provider.extract(request);
      expect(result).toEqual({
        tenant_id: "tenant-456",
        user_id: "user-123",
        scope_memberships: ["scope-1", "scope-2", "scope-3"],
      });
    });

    it("validates issuer when configured", async () => {
      const providerWithIssuer = new JWTProvider({
        symmetricKey: secret,
        issuer: "https://auth.example.com",
      });

      // Token with wrong issuer should fail
      const wrongIssToken = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          iss: "https://wrong-issuer.com",
        },
        secret
      );

      const wrongRequest = new Request("http://localhost", {
        headers: { authorization: `Bearer ${wrongIssToken}` },
      });

      expect(await providerWithIssuer.extract(wrongRequest)).toBeNull();

      // Token with correct issuer should succeed
      const correctIssToken = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          iss: "https://auth.example.com",
        },
        secret
      );

      const correctRequest = new Request("http://localhost", {
        headers: { authorization: `Bearer ${correctIssToken}` },
      });

      const result = await providerWithIssuer.extract(correctRequest);
      expect(result?.tenant_id).toBe("tenant-456");
    });

    it("validates audience when configured", async () => {
      const providerWithAudience = new JWTProvider({
        symmetricKey: secret,
        audience: "my-api",
      });

      // Token with wrong audience should fail
      const wrongAudToken = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          aud: "other-api",
        },
        secret
      );

      const wrongRequest = new Request("http://localhost", {
        headers: { authorization: `Bearer ${wrongAudToken}` },
      });

      expect(await providerWithAudience.extract(wrongRequest)).toBeNull();

      // Token with correct audience should succeed
      const correctAudToken = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          aud: "my-api",
        },
        secret
      );

      const correctRequest = new Request("http://localhost", {
        headers: { authorization: `Bearer ${correctAudToken}` },
      });

      const result = await providerWithAudience.extract(correctRequest);
      expect(result?.tenant_id).toBe("tenant-456");
    });

    it("validates audience array when configured", async () => {
      const providerWithAudience = new JWTProvider({
        symmetricKey: secret,
        audience: "my-api",
      });

      // Token with audience array including configured audience should succeed
      const token = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          aud: ["other-api", "my-api", "another-api"],
        },
        secret
      );

      const request = new Request("http://localhost", {
        headers: { authorization: `Bearer ${token}` },
      });

      const result = await providerWithAudience.extract(request);
      expect(result?.tenant_id).toBe("tenant-456");
    });

    it("validates nbf (not-before) claim", async () => {
      const providerWithTolerance = new JWTProvider({
        symmetricKey: secret,
        clockToleranceSeconds: 10,
      });

      // Token not valid yet (nbf is 60 seconds in the future)
      const futureToken = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          nbf: Math.floor(Date.now() / 1000) + 60,
        },
        secret
      );

      const futureRequest = new Request("http://localhost", {
        headers: { authorization: `Bearer ${futureToken}` },
      });

      expect(await providerWithTolerance.extract(futureRequest)).toBeNull();

      // Token valid now
      const validToken = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          nbf: Math.floor(Date.now() / 1000) - 5,
        },
        secret
      );

      const validRequest = new Request("http://localhost", {
        headers: { authorization: `Bearer ${validToken}` },
      });

      const result = await providerWithTolerance.extract(validRequest);
      expect(result?.tenant_id).toBe("tenant-456");
    });

    it("applies clock tolerance to exp claim", async () => {
      const providerWithTolerance = new JWTProvider({
        symmetricKey: secret,
        clockToleranceSeconds: 30,
      });

      // Token expired 20 seconds ago, but within tolerance
      const token = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          exp: Math.floor(Date.now() / 1000) - 20,
        },
        secret
      );

      const request = new Request("http://localhost", {
        headers: { authorization: `Bearer ${token}` },
      });

      const result = await providerWithTolerance.extract(request);
      expect(result?.tenant_id).toBe("tenant-456");
    });

    it("applies clock tolerance to nbf claim", async () => {
      const providerWithTolerance = new JWTProvider({
        symmetricKey: secret,
        clockToleranceSeconds: 30,
      });

      // Token not valid for 20 more seconds, but within tolerance
      const token = await createHs256Token(
        {
          sub: "user-123",
          tenant: "tenant-456",
          nbf: Math.floor(Date.now() / 1000) + 20,
        },
        secret
      );

      const request = new Request("http://localhost", {
        headers: { authorization: `Bearer ${token}` },
      });

      const result = await providerWithTolerance.extract(request);
      expect(result?.tenant_id).toBe("tenant-456");
    });

    it("verifies RS256 signature with JWKS", async () => {
      const { privateKey, publicJwk } = await generateRsaKeyPair();

      // Mock fetch to return JWKS
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        if (url.toString() === "https://auth.example.com/.well-known/jwks.json") {
          return new Response(
            JSON.stringify({
              keys: [{ ...publicJwk, kid: "test-key-1", kty: "RSA" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(url);
      };

      try {
        const provider = new JWTProvider({
          jwksUrl: "https://auth.example.com/.well-known/jwks.json",
        });

        const token = await createRs256Token(
          {
            sub: "user-123",
            tenant: "tenant-456",
            scope: "read write",
          },
          privateKey,
          "test-key-1"
        );

        const request = new Request("http://localhost", {
          headers: { authorization: `Bearer ${token}` },
        });

        const result = await provider.extract(request);
        expect(result).toEqual({
          tenant_id: "tenant-456",
          user_id: "user-123",
          scope_memberships: ["read", "write"],
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("rejects RS256 token with wrong signature", async () => {
      const { privateKey: privateKey1, publicJwk: publicJwk1 } = await generateRsaKeyPair();
      const { privateKey: privateKey2 } = await generateRsaKeyPair();

      // Mock fetch to return JWKS with public key 1
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        if (url.toString() === "https://auth.example.com/.well-known/jwks.json") {
          return new Response(
            JSON.stringify({
              keys: [{ ...publicJwk1, kid: "key-1", kty: "RSA" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(url);
      };

      try {
        const provider = new JWTProvider({
          jwksUrl: "https://auth.example.com/.well-known/jwks.json",
        });

        // Sign with private key 2, but JWKS has public key 1
        const token = await createRs256Token(
          {
            sub: "user-123",
            tenant: "tenant-456",
          },
          privateKey2,
          "key-1"
        );

        const request = new Request("http://localhost", {
          headers: { authorization: `Bearer ${token}` },
        });

        const result = await provider.extract(request);
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles JWKS with single key when kid is not specified", async () => {
      const { privateKey, publicJwk } = await generateRsaKeyPair();

      // Mock fetch to return JWKS with single key
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        if (url.toString() === "https://auth.example.com/.well-known/jwks.json") {
          return new Response(
            JSON.stringify({
              keys: [{ ...publicJwk, kty: "RSA" }], // No kid
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(url);
      };

      try {
        const provider = new JWTProvider({
          jwksUrl: "https://auth.example.com/.well-known/jwks.json",
        });

        // Token without kid should use the single available key
        const token = await createRs256Token(
          {
            sub: "user-123",
            tenant: "tenant-456",
          },
          privateKey
        );

        const request = new Request("http://localhost", {
          headers: { authorization: `Bearer ${token}` },
        });

        const result = await provider.extract(request);
        expect(result?.tenant_id).toBe("tenant-456");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("rejects token with kid when no matching key in JWKS", async () => {
      const { privateKey, publicJwk } = await generateRsaKeyPair();

      // Mock fetch to return JWKS with different kid
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        if (url.toString() === "https://auth.example.com/.well-known/jwks.json") {
          return new Response(
            JSON.stringify({
              keys: [{ ...publicJwk, kid: "key-1", kty: "RSA" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(url);
      };

      try {
        const provider = new JWTProvider({
          jwksUrl: "https://auth.example.com/.well-known/jwks.json",
        });

        // Token with kid "key-2" but JWKS only has "key-1"
        const token = await createRs256Token(
          {
            sub: "user-123",
            tenant: "tenant-456",
          },
          privateKey,
          "key-2"
        );

        const request = new Request("http://localhost", {
          headers: { authorization: `Bearer ${token}` },
        });

        const result = await provider.extract(request);
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles malformed JWKS response gracefully", async () => {
      // Mock fetch to return invalid JSON
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        if (url.toString() === "https://auth.example.com/.well-known/jwks.json") {
          return new Response("not valid json", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return originalFetch(url);
      };

      try {
        const provider = new JWTProvider({
          jwksUrl: "https://auth.example.com/.well-known/jwks.json",
        });

        const { privateKey } = await generateRsaKeyPair();
        const token = await createRs256Token(
          {
            sub: "user-123",
            tenant: "tenant-456",
          },
          privateKey
        );

        const request = new Request("http://localhost", {
          headers: { authorization: `Bearer ${token}` },
        });

        // Should handle gracefully and return null
        const result = await provider.extract(request);
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("rejects RS256 token with malformed RSA key in JWKS", async () => {
      const { privateKey } = await generateRsaKeyPair();

      // Mock fetch to return JWKS with malformed RSA key (missing n or e)
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        if (url.toString() === "https://auth.example.com/.well-known/jwks.json") {
          return new Response(
            JSON.stringify({
              keys: [{ kty: "RSA", kid: "key-1" }], // Missing n and e
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return originalFetch(url);
      };

      try {
        const provider = new JWTProvider({
          jwksUrl: "https://auth.example.com/.well-known/jwks.json",
        });

        const token = await createRs256Token(
          {
            sub: "user-123",
            tenant: "tenant-456",
          },
          privateKey,
          "key-1"
        );

        const request = new Request("http://localhost", {
          headers: { authorization: `Bearer ${token}` },
        });

        const result = await provider.extract(request);
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
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
