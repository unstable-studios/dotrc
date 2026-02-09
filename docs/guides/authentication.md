# Authentication

DotRC uses a pluggable authentication system where adapters handle trust boundaries and the core enforces policy. The worker resolves authentication using a provider chain — the first provider that succeeds determines the user context.

## Provider Chain

Providers are tried in order:

1. **Cloudflare Access** — Zero-trust proxy (production)
2. **JWT/OIDC** — Industry-standard tokens (Auth0, Okta, Azure AD)
3. **Trusted Headers** — Reverse proxy deployments
4. **Development** — Local testing only (non-production environments)

## Auth Context

Every authenticated request produces an `AuthContext`:

```typescript
interface AuthContext {
  tenant_id: string;        // Tenant isolation boundary
  requesting_user: string;  // Internal user ID
  user_scope_memberships: string[];  // Scopes the user belongs to
}
```

All operations are scoped to the tenant. Users in one tenant cannot see or modify data in another.

## Cloudflare Access

When deployed behind Cloudflare Access, the `cf-access-jwt-assertion` header contains a signed JWT. The worker validates it using Cloudflare's public keys.

**Required headers:**
- `cf-access-jwt-assertion` — Cloudflare Access JWT

**Extracted claims:**
- `sub` — User ID
- `custom:tenant_id` — Tenant ID (from Access policy)

## JWT/OIDC

For standard identity providers (Auth0, Okta, Azure AD, Google, GitHub):

**Required headers:**
- `Authorization: Bearer <token>` — JWT token

**Environment variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_JWKS_URL` | JWKS endpoint for key verification | `https://example.auth0.com/.well-known/jwks.json` |
| `JWT_AUDIENCE` | Expected `aud` claim | `https://api.dotrc.dev` |
| `JWT_ISSUER` | Expected `iss` claim | `https://example.auth0.com/` |
| `JWT_HS256_SECRET` | Symmetric key (if using HS256) | Secret string |
| `JWT_CLOCK_SKEW_SECONDS` | Clock tolerance for `exp`/`nbf` | `30` |

**JWT claims mapping:**
- `sub` — User ID
- `tenant_id` or `custom:tenant_id` — Tenant ID
- `scope_memberships` — Array of scope IDs (optional)

## Trusted Headers

For deployments behind a reverse proxy (nginx, Traefik, Kubernetes ingress) that handles authentication and sets trusted headers:

**Required headers:**
- `x-tenant-id` — Tenant identifier
- `x-user-id` — User identifier

**Optional headers:**
- `x-user-scopes` — Comma-separated scope memberships

> **Security:** Only use trusted headers when the worker is behind a proxy that strips these headers from external requests. Never expose the worker directly to the internet with trusted headers enabled.

## Development Provider

Available when `ENVIRONMENT` is not `"production"`. Uses the same headers as trusted headers but without proxy requirements.

**Required headers:**
- `x-tenant-id` — Tenant identifier
- `x-user-id` — User identifier

This is intended for local development only. The development provider is automatically disabled in production.

## Error Responses

Failed authentication returns `401 Unauthorized`:

```json
{
  "error": "unauthorized",
  "detail": "No valid authentication provided"
}
```

Insufficient permissions return `403 Forbidden`:

```json
{
  "error": "forbidden",
  "detail": "You do not have permission to view this dot"
}
```

## Security Best Practices

1. Always use JWT or Cloudflare Access in production
2. Set `ENVIRONMENT=production` to disable the development provider
3. Rotate JWT secrets regularly
4. Use HTTPS for all API communication
5. Validate `aud` and `iss` claims to prevent token reuse
6. Set a reasonable `JWT_CLOCK_SKEW_SECONDS` (default: no tolerance)
