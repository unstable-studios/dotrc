# JWT/OIDC Provider Setup

The JWT provider works with any OIDC-compliant issuer. It extracts claims from Bearer tokens.

## Supported Services

### Auth0

1. **Create an API** in Auth0 dashboard → Applications → APIs
2. **Create a machine-to-machine app** or use existing
3. **Get your issuer URL**: `https://<YOUR_DOMAIN>.auth0.com/`
4. **Create JWT with custom claims**:

```typescript
// On your auth client (Auth0 SDK)
const getTokenWithClaims = async () => {
  return auth0Client.getTokenSilently({
    audience: "https://api.dotrc.example.com",
    scope: "scope-1 scope-2",
    // Custom claims require Rules or Actions
    // Set `sub`, `tenant`, `scope` in Auth0
  });
};
```

**Auth0 Actions (to add custom claims)**:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://dotrc.example.com/";

  api.idToken.setCustomClaim(`${namespace}tenant`, user.organization_id);
  api.idToken.setCustomClaim(`${namespace}scope`, user.teams.join(" "));
};
```

Then send the ID token as `Authorization: Bearer <token>`.

### Okta

1. **Create an authorization server** → API → Authorization Servers
2. **Add custom claims** → Claims tab:
   - Name: `tenant`, Value: `user.organization_id`
   - Name: `scope`, Value: `user.teams` (space-separated)
3. **Get authorization endpoint**: `https://<YOUR_DOMAIN>.okta.com/oauth2/v1/authorize`
4. **Create scopes** that match your DotRC scopes

**Token endpoint returns**:

```json
{
  "access_token": "eyJ...",
  "id_token": "eyJ..."
}
```

Use the `id_token` (which includes custom claims) as your Bearer token.

### Azure AD / Entra ID

1. **Register an application** → Azure AD → App registrations
2. **Add app roles**:
   - Go to App roles → Create app role
   - Set Display name to match your scopes
3. **Configure token claims** → Token configuration → Add groups claim
4. **Assign users to app roles** → Users and groups → Add user/group

**Your token will include**:

```json
{
  "sub": "user-id",
  "tenant": "tenant-id",
  "appid": "your-app-id",
  "roles": ["admin", "viewer"] // Match your scopes
}
```

Map the `roles` claim to `scope` claim in your client.

### GitHub (OIDC)

Use GitHub as an OIDC provider for GitHub-hosted applications:

1. **Enable OpenID Connect** in GitHub Actions or third-party OIDC
2. **Exchange code for ID token**:

```bash
curl -X POST https://token.actions.githubusercontent.com/getToken \
  -H "Content-Type: application/json" \
  -d '{
    "audience": "https://dotrc.example.com"
  }' \
  -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN"
```

3. **Extract claims from returned token**:

```json
{
  "sub": "repo:owner/repo:ref:refs/heads/main",
  "actor": "github-username",
  "aud": "https://dotrc.example.com"
}
```

Map these to DotRC format in your client.

### Google OAuth 2.0

1. **Create a Google Cloud project** → Credentials
2. **Create OAuth 2.0 Client ID** (Web application)
3. **Exchange authorization code for ID token**:

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=AUTHORIZATION_CODE" \
  -d "grant_type=authorization_code"
```

**Response includes ID token** with claims:

```json
{
  "sub": "google-user-id",
  "email": "user@example.com",
  "email_verified": true,
  "aud": "YOUR_CLIENT_ID"
}
```

Map email to `sub` and add `tenant`/`scope` claims via your backend.

## Expected Token Format

All JWT tokens should contain these claims:

```json
{
  "sub": "user-identifier", // Required: unique user ID
  "tenant": "tenant-id", // Required: which tenant
  "scope": "scope-1 scope-2", // Optional: space-separated scopes
  "aud": "https://api.dotrc.example.com" // Optional: audience
}
```

## Testing Locally

1. **Generate a test token** using [jwt.io](https://jwt.io):

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "dev@example.com",
    "tenant": "dev-tenant",
    "scope": "dev-scope"
  },
  "secret": "dev-secret-key"
}
```

2. **Send request**:

```bash
curl -H "Authorization: Bearer eyJ..." \
  http://localhost:8787/dots
```

3. **If JWT provider can't decode**, it falls back to next provider (TrustedHeaderProvider or DevelopmentProvider).

## Token Claims Reference

| Claim    | Required | Type                     | Example                     | Purpose                  |
| -------- | -------- | ------------------------ | --------------------------- | ------------------------ |
| `sub`    | Yes      | string                   | `user@acme.com`             | User identifier          |
| `tenant` | Yes      | string                   | `acme-corp`                 | Tenant ID                |
| `scope`  | No       | string (space-separated) | `finance eng`               | Scope memberships        |
| `aud`    | No       | string                   | `https://api.dotrc.com`     | Audience (recommended)   |
| `iss`    | No       | string                   | `https://auth.example.com/` | Issuer (recommended)     |
| `exp`    | No       | number                   | `1234567890`                | Expiration (recommended) |

## Troubleshooting

**"No valid authentication provided"**

- Check that `Authorization: Bearer` header is set
- Verify token contains `sub` and `tenant` claims
- Decode token at jwt.io to see actual claims

**Token rejected by provider**

- JWT provider expects Bearer token to base64-decode to valid JSON
- Check for whitespace, newlines, or encoding issues
- Verify claims match expected structure

**Scope claims not working**

- Ensure `scope` claim is space-separated string (not array)
- Example: `"scope": "scope-1 scope-2"` not `["scope-1", "scope-2"]`

**Multi-tenant issues**

- Each user must have different `tenant` claim
- Tenant isolation is enforced at core level (checked per request)
