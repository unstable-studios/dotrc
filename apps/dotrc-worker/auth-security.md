# Auth Security Best Practices

DotRC's pluggable auth system is designed for security, but deployment requires careful configuration.

## Security Principles

### 1. Explicit Trust Boundaries

The auth provider chain defines trust:

```
Untrusted Internet
         ↓
    [Auth Boundary]
         ↓
Trusted Auth Context
         ↓
   Reverse Proxy
         ↓
    [Auth Boundary]
         ↓
DotRC Worker
```

**Key rule**: Only trust headers/tokens that come from your configured auth system.

### 2. Pluggable Doesn't Mean Insecure

Each provider has security built-in:

| Provider          | Trust Source         | Validation        | Suitable For                    |
| ----------------- | -------------------- | ----------------- | ------------------------------- |
| JWT               | External OIDC issuer | Signature (TODO)  | Production if issuer is trusted |
| Cloudflare Access | Cloudflare           | Signed by CF      | Production with CF              |
| Trusted Headers   | Reverse proxy        | HTTPS enforcement | Production behind trusted proxy |
| Development       | Local testing        | None              | Development only                |

**Development provider is NOT production-safe**.

### 3. Tenant Isolation is Enforced

The core validates that `tenant_id` from auth context matches what the user can access:

```rust
// In dotrc-core
pub fn can_view(dot: &Dot, requesting_user: &str, tenant_id: &str) -> bool {
    // Always checks tenant_id first
    if dot.tenant_id != tenant_id {
        return false;  // Different tenant = no access
    }

    // Then checks visibility
    dot.visible_to_users.contains(requesting_user)
}
```

**Even if auth is wrong, core blocks cross-tenant access.**

## Configuration Checklist

### Development Environment

```typescript
const authProviders: AuthProvider[] = [
  new JWTProvider(), // Optional: test OIDC locally
  new TrustedHeaderProvider({ requireSecureScheme: false }), // Only dev!
  new DevelopmentProvider(), // Always available
];
```

✅ Use DevelopmentProvider freely  
❌ Never use real credentials  
❌ Never expose to internet

### Staging Environment

```typescript
const authProviders: AuthProvider[] = [
  new JWTProvider(), // Test with real issuer
  new TrustedHeaderProvider({ requireSecureScheme: true }), // HTTPS only
  // new DevelopmentProvider(), ← Removed
];
```

✅ Behind reverse proxy with auth  
✅ HTTPS enforced  
❌ Still no production data

### Production Environment

```typescript
const authProviders: AuthProvider[] = [
  // Choose ONE primary + optional fallback
  new CloudflareAccessProvider(), // If using Cloudflare
  // OR
  new JWTProvider(), // If using OIDC issuer
  // OR
  new TrustedHeaderProvider({ requireSecureScheme: true }), // If using reverse proxy

  // NEVER include:
  // new DevelopmentProvider(), ← FORBIDDEN
];
```

**Critical requirements**:

1. ✅ **HTTPS everywhere**: All external communication encrypted
2. ✅ **Token validation**: Verify JWT signatures (implement in JWTProvider)
3. ✅ **Tenant enforcement**: Core always validates tenant_id
4. ✅ **Monitoring**: Log all 401 responses for audit
5. ✅ **Credential rotation**: Periodic key rotation for JWT/OIDC
6. ✅ **Rate limiting**: Prevent brute force via auth endpoint

## JWT Signature Verification (CRITICAL TODO)

Current implementation **does not verify JWT signatures**. This is acceptable for development only.

**For production**, implement signature verification:

```typescript
class JWTProvider implements AuthProvider {
  private publicKey: string;

  async extract(request: Request): Promise<AuthExtractionResult | null> {
    const token = this.getBearer(request);
    if (!token) return null;

    try {
      // TODO: Implement real signature verification
      // Using webcrypto or jose library

      const claims = await this.verifyJWTSignature(token, this.publicKey);

      return {
        tenant_id: claims.tenant,
        user_id: claims.sub,
        scope_memberships: claims.scope?.split(" ") || [],
      };
    } catch (error) {
      console.error("JWT verification failed", error);
      return null; // Reject invalid signatures
    }
  }

  private async verifyJWTSignature(
    token: string,
    publicKey: string
  ): Promise<any> {
    // TODO: Implement using:
    // - webcrypto for Workers
    // - jose library for Node.js
    throw new Error("Not implemented");
  }
}
```

**Why this matters**: Without signature verification, attackers can forge tokens.

## Tenant Isolation Checklist

- ✅ `tenant_id` comes from trusted auth source (never client-provided)
- ✅ Core validates tenant on every operation
- ✅ No global/default tenant exists
- ✅ Dot visibility filtered by tenant + user
- ✅ No bulk operations across tenants

**Test tenant isolation**:

```bash
# User from tenant-1 cannot see tenant-2 data
curl http://api.example.com/dots?tenant=tenant-2 \
  -H "X-Tenant-ID: tenant-1" \
  -H "X-User-ID: alice@example.com"
# Result: Empty list (even if dots exist in tenant-2)
```

## Scope/Group Handling

Current system supports group-based access via scopes. **Be careful**:

### ❌ Dynamic Scope Expansion (WRONG)

```typescript
// WRONG: Expanding scopes at request time
async function handleRequest(request: Request) {
  const authContext = await resolveAuthContext(request, providers);

  // ❌ DON'T DO THIS: Fetch current channel members
  const currentMembers = await slack.getChannelMembers(scopeId);

  // ❌ This changes access retroactively
  dot.visible_to_users = currentMembers;
}
```

**Problem**: If Slack channel membership changes, dot visibility changes retroactively. This violates immutability.

### ✅ Snapshot at Creation Time (RIGHT)

```typescript
// ✅ RIGHT: Capture scope members at creation
async function handleRequest(request: Request) {
  const authContext = await resolveAuthContext(request, providers);

  // Resolve scope to explicit users
  const scopeMembers = await slack.getChannelMembers(scopeId);

  // Snapshot in dot
  const draft: DotDraft = {
    created_by: authContext.requesting_user,
    visible_to_users: [
      ...explicitUsers,
      ...scopeMembers, // Snapshot members at this moment
    ],
  };

  await core.createDot(draft);
}
```

**Benefit**: ACL snapshot is permanent. If Slack membership changes later, access doesn't change.

## Monitoring and Audit

### Log All Auth Events

```typescript
// In index.ts
const authContext = await resolveAuthContext(request, authProviders);

if (!authContext) {
  console.error("AUTH_FAILED", {
    path: request.pathname,
    method: request.method,
    ip: request.headers.get("x-forwarded-for"),
    timestamp: new Date().toISOString(),
  });

  return json(401, { error: "unauthorized" });
}

// Log successful auth for audit
console.log("AUTH_SUCCESS", {
  user: authContext.requesting_user,
  tenant: authContext.tenant_id,
  timestamp: new Date().toISOString(),
});
```

### Alert on Failures

Set up monitoring for:

```
401 response count > threshold in 5min window
  → Alert: Possible auth bypass attempt

Different user_id per tenant in single request
  → Alert: Possible multi-tenancy exploit

Token/header parsing errors (logs)
  → Alert: Misconfigured auth system
```

## HTTPS Enforcement

### ✅ Correct: HTTPS Only

```typescript
// TrustedHeaderProvider enforces
new TrustedHeaderProvider({ requireSecureScheme: true });

// Checks X-Forwarded-Proto header
if (request.headers.get("x-forwarded-proto") !== "https") {
  return null; // Reject non-HTTPS
}
```

### ❌ Wrong: HTTP Allowed

```typescript
// NEVER do this in production
new TrustedHeaderProvider({ requireSecureScheme: false });
```

**Why**: Headers can be intercepted/forged over HTTP.

## Credential Rotation

### JWT/OIDC Keys

Plan for periodic key rotation with your OIDC provider:

1. Provider publishes new public key
2. Worker validates against both old and new keys (overlap period)
3. Old key deprecated after grace period

Most OIDC providers (Auth0, Okta, Azure AD) handle this automatically via `/.well-known/openid-configuration`.

### Service Tokens

For Cloudflare Access or other service-based auth:

1. Rotate tokens quarterly or on suspected compromise
2. Keep old tokens valid during transition period
3. Audit token usage logs

## Security Testing

### Test Auth Bypass Vectors

```bash
# 1. Missing auth header
curl -X POST http://localhost:8787/dots -d '{...}'
# Expected: 401

# 2. Forged headers (without proper auth)
curl -X POST http://localhost:8787/dots \
  -H "X-Forwarded-User: admin@example.com" \
  -d '{...}'
# Expected: 401 (TrustedHeaderProvider requires reverse proxy validation)

# 3. Cross-tenant access
curl http://localhost:8787/dots?tenant=admin \
  -H "X-Tenant-ID: user" \
  -H "X-User-ID: alice@example.com"
# Expected: Filtered to user's tenant only
```

### Test Signature Verification (TODO)

Once JWT verification is implemented:

```bash
# Test with altered token
TOKEN="eyJ..." # Valid token
ALTERED="${TOKEN%.*}.fakesignature"

curl -X POST http://localhost:8787/dots \
  -H "Authorization: Bearer $ALTERED" \
  -d '{...}'
# Expected: 401
```

## Incident Response

If auth is compromised:

1. **Revoke credentials immediately**:

   - Disable compromised service tokens
   - Rotate JWT signing keys
   - Reset reverse proxy credentials

2. **Audit affected data**:

   - Check access logs for unauthorized reads
   - Review dots created/modified by compromised account
   - Notify affected tenants

3. **Implement mitigations**:
   - Tighten auth provider rules
   - Add rate limiting
   - Enable request signing/mutual TLS

## References

- [TRUSTED_AUTH.md](./TRUSTED_AUTH.md) - Architecture
- [Visibility and Security](../../docs/visibility-and-security.md) - Core principles
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
