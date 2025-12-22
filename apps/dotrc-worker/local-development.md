# Local Development with DevelopmentProvider

The `DevelopmentProvider` allows testing auth without setting up a full OIDC system.

## Quick Start

When using the default auth provider chain, DevelopmentProvider is the fallback:

```typescript
const authProviders: AuthProvider[] = [
  new CloudflareAccessProvider(),
  new JWTProvider(),
  new TrustedHeaderProvider(),
  new DevelopmentProvider(), // ← Catches dev headers
];
```

## Testing Locally

### 1. Start the Worker in Development Mode

```bash
cd apps/dotrc-worker
pnpm run dev  # Starts on http://localhost:8787
```

### 2. Send Requests with Dev Headers

The DevelopmentProvider looks for:

- `X-Tenant-ID`: Your test tenant
- `X-User-ID`: Your test user

```bash
# Create a draft dot
curl -X POST http://localhost:8787/dots \
  -H "X-Tenant-ID: my-tenant" \
  -H "X-User-ID: alice@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Dot",
    "body": "Testing locally",
    "visible_to_users": ["alice@example.com"]
  }'
```

### 3. Verify Response

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "created_by": "alice@example.com",
  "tenant_id": "my-tenant",
  "draft": false,
  "title": "Test Dot",
  "body": "Testing locally",
  "visible_to_users": ["alice@example.com"]
}
```

## Testing Multiple Tenants

Each request can specify a different tenant:

```bash
# User in tenant-1
curl -X POST http://localhost:8787/dots \
  -H "X-Tenant-ID: tenant-1" \
  -H "X-User-ID: alice@example.com" \
  -d '{"title": "Tenant 1 Dot", ...}'

# Same user in tenant-2 (separate namespace)
curl -X POST http://localhost:8787/dots \
  -H "X-Tenant-ID: tenant-2" \
  -H "X-User-ID: alice@example.com" \
  -d '{"title": "Tenant 2 Dot", ...}'
```

The dots are isolated per tenant, even for the same user.

## Testing without Headers

If you don't provide dev headers:

```bash
curl -X POST http://localhost:8787/dots \
  -H "Content-Type: application/json" \
  -d '{"title": "No Auth", ...}'
```

Result:

```json
{
  "error": "unauthorized",
  "detail": "No valid authentication provided"
}
```

## Testing Multiple Auth Methods

You can test different providers without changing code:

### Test JWT Provider

```bash
# Create a test token at jwt.io (HS256) and start dev server with the same secret
JWT_HS256_SECRET=dev-secret-key pnpm run dev

# In another terminal, send the signed token
curl -X POST http://localhost:8787/dots \
  -H "Authorization: Bearer eyJ..." \
  -d '{"title": "JWT Test", ...}'
```

Tokens signed with the wrong secret are rejected; the worker will continue to the next configured provider.

### Test Trusted Headers

```bash
# Enable locally by setting requireSecureScheme: false (dev only!)
curl -X POST http://localhost:8787/dots \
  -H "X-Forwarded-User: alice@example.com" \
  -H "X-Forwarded-Tenant: my-tenant" \
  -d '{"title": "Header Test", ...}'
```

### Fall Back to Development

```bash
# No valid auth method → tries development provider
curl -X POST http://localhost:8787/dots \
  -H "X-Tenant-ID: my-tenant" \
  -H "X-User-ID: alice@example.com" \
  -d '{"title": "Dev Test", ...}'
```

## Testing Visibility and ACLs

Test that ACL enforcement works:

```bash
# Alice creates a dot visible only to herself
curl -X POST http://localhost:8787/dots \
  -H "X-Tenant-ID: my-tenant" \
  -H "X-User-ID: alice@example.com" \
  -d '{
    "title": "Private Dot",
    "body": "Only Alice sees this",
    "visible_to_users": ["alice@example.com"]
  }'
# Returns: id = "abc123"

# Bob tries to view it
curl http://localhost:8787/dots/abc123 \
  -H "X-Tenant-ID: my-tenant" \
  -H "X-User-ID: bob@example.com"
# Result: 404 (not found - Bob has no access)
```

## Testing Scope Memberships

The DevelopmentProvider doesn't support scope claims (for simplicity). To test scopes:

1. **Use JWTProvider with test token**:

   ```json
   {
     "sub": "user@example.com",
     "tenant": "my-tenant",
     "scope": "scope-1 scope-2"
   }
   ```

2. **Send as Bearer token**:
   ```bash
   curl -X POST http://localhost:8787/dots \
     -H "Authorization: Bearer eyJ..." \
     -d '{"title": "Test", ...}'
   ```

## Testing Error Cases

### Invalid tenant (contains invalid characters)

```bash
curl -X POST http://localhost:8787/dots \
  -H "X-Tenant-ID: tenant with spaces" \
  -H "X-User-ID: alice@example.com" \
  -d '{"title": "Test", ...}'
# Result: 400 Bad Request (invalid tenant format)
```

### Missing required field

```bash
curl -X POST http://localhost:8787/dots \
  -H "X-Tenant-ID: my-tenant" \
  -H "X-User-ID: alice@example.com" \
  -d '{"title": "No body"}'  # Missing body
# Result: 400 Bad Request
```

### Unauthorized access

```bash
# Only alice@example.com can see this
curl http://localhost:8787/dots/abc123 \
  -H "X-Tenant-ID: my-tenant" \
  -H "X-User-ID: bob@example.com"
# Result: 404 (not found due to ACL)
```

## CI/Testing Environment

The DevelopmentProvider is perfect for CI:

```bash
# Docker compose for CI tests
version: '3.8'
services:
  dotrc-worker:
    image: your-dotrc-worker-image
    environment:
      NODE_ENV: development
    ports:
      - "8787:8000"

  test:
    image: node:18
    depends_on:
      - dotrc-worker
    command: |
      npm install -g curl
      curl -X POST http://dotrc-worker:8000/dots \
        -H "X-Tenant-ID: test-tenant" \
        -H "X-User-ID: test@example.com" \
        -d '{"title": "CI Test", "body": "Works"}'
```

## Debugging

Enable debug logging to see auth flow:

```typescript
// In apps/dotrc-worker/src/index.ts
const authContext = await resolveAuthContext(request, authProviders);
if (!authContext) {
  console.log("Auth failed - tried all providers:");
  // Log which providers were tried and why they failed
}
```

Check worker logs:

```bash
pnpm run dev  # Shows logs in terminal
```

## Removing DevelopmentProvider from Production

When deploying to production, remove or disable DevelopmentProvider:

```typescript
const authProviders: AuthProvider[] = [
  new CloudflareAccessProvider(),
  new JWTProvider(),
  new TrustedHeaderProvider(),
  // new DevelopmentProvider(),  // ← Remove this
];
```

This prevents accidental use of insecure dev headers in production.

## References

- [trusted-auth.md](./trusted-auth.md) - Architecture overview
- [jwt-setup.md](./jwt-setup.md) - JWT configuration
- [Testing Guide](../../docs/testing.md) - Integration tests
