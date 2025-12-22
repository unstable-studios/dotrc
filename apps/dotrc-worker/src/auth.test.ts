import { describe, it, expect } from "vitest";
import {
  JWTProvider,
  CloudflareAccessProvider,
  TrustedHeaderProvider,
  DevelopmentProvider,
  resolveAuthContext,
} from "./auth";

describe("Auth Providers", () => {
  describe("JWTProvider", () => {
    const provider = new JWTProvider();

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
      const request = new Request("http://localhost", {
        headers: {
          authorization:
            "Bearer header.eyJzdWIiOiJ1c2VyLTEyMyIsInRlbmFudCI6InRlbmFudC00NTYiLCJzY29wZSI6InNjb3BlLTEgc2NvcGUtMiJ9.sig",
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
      const request = new Request("https://localhost", {
        headers: {
          "x-forwarded-user": "user@invalid",
          "x-forwarded-tenant": "tenant-456",
        },
      });

      const result = await provider.extract(request);
      expect(result).toBeNull();
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
