# Trusted Authentication

DotRC uses a **pluggable authentication system** where auth is adapter-specific and platform-agnostic.

## Architecture Principle

**Core stays pure**: `dotrc-core` contains zero auth logic. It receives an `AuthContext` and validates domain policy (can_view, can_grant). Auth resolution happens in adapters.

```
External Auth System (Cloudflare Access, JWT issuer, reverse proxy)
        ↓
Adapter Auth Provider (Worker/Server)
        ↓
AuthContext { tenant_id, requesting_user, scope_memberships }
        ↓
dotrc-core (validates policy only, no auth)
```

## Supported Auth Methods

### 1. JWT/OIDC Provider (Industry Standard)

Verifies signed tokens from any OIDC provider:

- **Auth0, Okta, Azure AD**: Standard JWT tokens
- **GitHub, Google**: OIDC ID tokens
- **Cloudflare Access**: Uses OIDC under the hood

**Token Claims Expected**:

```json
{
  "sub": "user@example.com", // User identifier (required)
  "tenant": "acme-corp", // Tenant (required)
  "scope": "scope-1 scope-2" // Space-separated scopes (optional)
}
```

**Usage**:

```typescript
const provider = new JWTProvider();
const result = await provider.extract(request);
// { tenant_id: "acme-corp", user_id: "user@example.com", scope_memberships: ["scope-1", "scope-2"] }
```

### 2. Cloudflare Access Provider

Extracts identity from Cloudflare Access headers (CF-specific optimization).

**Headers Used**:

- `CF-Access-Authenticated-User-Identity`: Base64 JWT with user claims
- `CF-Access-Authenticated-Org-ID`: Tenant identifier

**Setup**: Enable Cloudflare Access on your worker, headers are automatically set.

### 3. Trusted Header Provider

For reverse proxy deployments (nginx, Traefik, Kubernetes ingress).

**⚠️ Security Critical**: Only enable if the reverse proxy is in the trusted path.

**Headers Expected**:

- `X-Forwarded-User`: User identifier
- `X-Forwarded-Tenant`: Tenant identifier
- `X-Forwarded-Groups`: Comma-separated scopes (optional)

**Usage**:

```typescript
const provider = new TrustedHeaderProvider({
  requireSecureScheme: true, // Enforce HTTPS
});
```

### 4. Development Provider

For local testing only. Accepts direct headers:

- `X-Tenant-ID`: Tenant identifier
- `X-User-ID`: User identifier

**⚠️ NOT for production**.

## Provider Resolution

The worker tries providers in order until one succeeds:

```typescript
const authProviders: AuthProvider[] = [
  new CloudflareAccessProvider(), // Production: CF
  new JWTProvider(), // Production: JWT/OIDC
  new TrustedHeaderProvider(), // Production: Reverse proxy
  new DevelopmentProvider(), // Testing only
];

const authContext = await resolveAuthContext(request, authProviders);
```

**Key behavior**:

- First matching provider wins
- Order determines precedence (most restrictive first)
- Production deployments should remove DevelopmentProvider
- Each request tries all providers in order

## Implementing Custom Providers

Create a provider by implementing `AuthProvider`:

```typescript
interface AuthProvider {
  canHandle(request: Request): boolean;
  extract(request: Request): Promise<AuthExtractionResult | null>;
}

export class CustomProvider implements AuthProvider {
  canHandle(request: Request): boolean {
    // Return true if this request uses your auth method
    return request.headers.has("x-custom-auth");
  }

  async extract(request: Request): Promise<AuthExtractionResult | null> {
    const token = request.headers.get("x-custom-auth");
    if (!token) return null;

    // Validate and extract credentials
    try {
      const claims = await verifyAndDecode(token);
      return {
        tenant_id: claims.org_id,
        user_id: claims.user_id,
        scope_memberships: claims.groups || [],
      };
    } catch {
      return null;
    }
  }
}
```

Then add it to the provider list in `index.ts`.

## Production Deployment Checklist

- ✅ **Remove DevelopmentProvider** from production deployments
- ✅ **Configure HTTPS**: TrustedHeaderProvider enforces HTTPS by default
- ✅ **Verify JWT signatures**: JWT provider enforces HS256/RS256 signatures (configure `JWT_JWKS_URL` or `JWT_HS256_SECRET` plus `JWT_AUDIENCE`/`JWT_ISSUER`)
- ✅ **Test auth flow**: Ensure chosen provider matches your auth system
- ✅ **Monitor auth failures**: Log and alert on 401 responses
- ✅ **Implement tenant lookup**: Current implementation trusts tenant claim (add database validation)

## JWT Signature Verification

JWT signatures are verified before claims are accepted. Configure one of:

- **RS256 (recommended)**: Set `JWT_JWKS_URL` to your issuer JWKS endpoint, and optionally `JWT_AUDIENCE` / `JWT_ISSUER` for claim checks.
- **HS256 (dev/local)**: Set `JWT_HS256_SECRET` to the shared secret used to sign tokens.
- Optional: `JWT_CLOCK_SKEW_SECONDS` to allow small drift for `exp`/`nbf`.

## Scope Membership Expansion

Current implementation passes scope claims from auth context directly to core.

For dynamic scopes (like Slack channels), the adapter must expand scope members to explicit user grants **before calling core**:

```typescript
// Adapter responsibility
const scopeMembers = await fetchSlackChannelMembers(scopeId);
const expandedUsers = [...explicitUsers, ...scopeMembers];

// Then call core with expanded list
await core.createDot({
  ...draft,
  visible_to_users: expandedUsers,
});
```

This ensures the ACL snapshot captures actual members, preventing accidental access changes later.

## Security Properties

1. **No retroactive access**: Snapshot at creation captures explicit users
2. **Clear boundaries**: Auth outside core, policy inside core
3. **Pluggable**: Swap providers without changing core
4. **Multi-tenant isolation**: Tenant claim validated on every request
5. **Audit trail**: All auth method supported by structured logs

## References

- [Core Architecture](../../docs/core-architecture.md)
- [Visibility and Security](../../docs/visibility-and-security.md)
