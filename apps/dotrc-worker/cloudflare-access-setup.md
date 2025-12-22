# Cloudflare Access Setup

Cloudflare Access is a zero-trust proxy that requires authentication before reaching your worker.

## Quick Start

1. **Set up Cloudflare Access** on your domain:

   - In Cloudflare dashboard → Access → Applications → Create
   - Set application to your worker URL
   - Configure identity providers (Google, GitHub, etc.)
   - Create access policies

2. **Enable Access headers in Worker**:

   - Headers `CF-Access-Authenticated-User-Identity` and `CF-Access-Authenticated-Org-ID` are automatically added by Cloudflare Access

3. **Deploy worker** using the provided auth provider:
   ```typescript
   const authProviders: AuthProvider[] = [
     new CloudflareAccessProvider(), // Tries CF headers first
     new JWTProvider(), // Fallback
     // ...
   ];
   ```

## Headers Added by Cloudflare Access

### `CF-Access-Authenticated-User-Identity`

Base64-encoded JWT containing user info:

```json
{
  "aud": "your-access-app-id",
  "email": "user@example.com",
  "id": "user-uuid",
  "iat": 1234567890,
  "iss": "https://access.cloudflare.com",
  "type": "google"
}
```

**⚠️ Important**: This header is signed by Cloudflare but **is not verified by default**. For production, enable signature verification:

[TODO: Implement CF signature verification using CF docs](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validate-tokens/)

### `CF-Access-Authenticated-Org-ID`

Contains your organization's Cloudflare ID (used as tenant):

```
org-id: abc123def456
```

## Mapping CF Identity to DotRC

The provider extracts:

```typescript
{
  tenant_id: request.headers.get("cf-access-authenticated-org-id"),
  user_id: decodedJwt.email,  // From CF header
  scope_memberships: []  // CF doesn't provide scopes by default
}
```

## Adding Scope Information

CF Access doesn't natively support custom scopes, but you can:

1. **Use service tokens + identity headers**:

   - Issue service tokens for apps/groups
   - Create access policies that require specific identity providers
   - Map CF email domain to scope

2. **Add custom JWT claims** (if using CF with OIDC):
   - Configure your identity provider to return custom claims
   - Modify provider to extract them

Example (Okta with CF):

```json
{
  "email": "user@example.com",
  "scope": "finance viewer" // Custom claim from Okta
}
```

3. **Query external system** (in adapter, not core):
   ```typescript
   const scopes = await getSlackChannelsForUser(user.email);
   return {
     tenant_id,
     user_id,
     scope_memberships: scopes,
   };
   ```

## Access Policies

Configure who can access your API:

### Example 1: Email Domain

```
Users from: example.com
Provider: Any identity provider
```

```javascript
// In CF policy rule
email.contains("example.com");
```

### Example 2: Specific Users

```
Users: user@example.com, admin@example.com
Provider: Google
```

### Example 3: Service Tokens

For automated systems:

```
Service Tokens: internal-api-token
```

Then send the token as:

```bash
curl -H "CF-Access-Client-ID: token-id" \
     -H "CF-Access-Client-Secret: token-secret" \
     https://your-api.example.com/dots
```

Cloudflare validates the token automatically.

## Multi-Tenant with Cloudflare Access

Since `CF-Access-Authenticated-Org-ID` is your Cloudflare org (not per-tenant), you must:

1. **Use service tokens per tenant**:

   - Create different service tokens for each tenant
   - Map token ID to tenant in your adapter

2. **Or use email domain mapping**:
   - `user@tenant1.example.com` → tenant1
   - `user@tenant2.example.com` → tenant2

Example adapter code:

```typescript
const cfProvider = new CloudflareAccessProvider();
const authContext = await cfProvider.extract(request);

if (authContext) {
  // Map email domain to tenant
  const domain = authContext.user_id.split("@")[1];
  authContext.tenant_id = domain; // Override CF org with domain-based tenant

  return authContext;
}
```

## Troubleshooting

**Headers missing in worker**

- Verify application is created in CF Access dashboard
- Confirm access policy allows your identity
- Check that CF Access is enabled (can appear "disabled" if no policies exist)
- Test at `https://<your-domain>/cdn-cgi/access/` (CF Access login page should appear)

**"No valid authentication provided" error**

- Confirm you passed CF Access authentication before hitting worker
- Verify `CF-Access-Authenticated-Org-ID` header is present:
  ```bash
  curl -v https://your-api.example.com/dots
  # Look for: CF-Access-Authenticated-User-Identity
  # Look for: CF-Access-Authenticated-Org-ID
  ```

**User not in header**

- Header is base64-encoded JWT
- Decode it to see the actual claims
- If claims are missing, check your identity provider configuration in CF

## Performance Notes

- CF Access adds ~50-100ms latency for token validation
- Service tokens add minimal latency
- Consider caching tenant lookups if using email domain mapping

## References

- [Cloudflare Access Docs](https://developers.cloudflare.com/cloudflare-one/identity/)
- [Validating Tokens](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validate-tokens/)
- [Service Tokens](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/)
