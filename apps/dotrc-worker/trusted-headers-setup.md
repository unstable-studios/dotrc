# Trusted Header Provider Setup

Use Trusted Headers when DotRC is behind a reverse proxy that authenticates requests.

## Common Deployments

### Kubernetes with Ingress Authentication

```yaml
# nginx ingress with oauth2-proxy
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dotrc-api
  annotations:
    # oauth2-proxy injects headers
    nginx.ingress.kubernetes.io/auth-url: http://oauth2-proxy:4180/oauth2/auth
    nginx.ingress.kubernetes.io/auth-signin: http://oauth2-proxy:4180/oauth2/start
    nginx.ingress.kubernetes.io/auth-response-headers: X-Forwarded-User, X-Forwarded-Email, X-Forwarded-Groups
spec:
  rules:
    - host: api.dotrc.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: dotrc-worker
                port:
                  number: 8000
```

### Docker Compose with Traefik

```yaml
version: "3.8"
services:
  auth:
    image: oauth2-proxy/oauth2-proxy
    environment:
      OAUTH2_PROXY_CLIENT_ID: your-client-id
      OAUTH2_PROXY_CLIENT_SECRET: your-secret
      # Configures injected headers

  dotrc:
    image: your-dotrc-image
    labels:
      # Traefik middleware to inject auth headers
      traefik.http.middlewares.auth.forwardauth.address: http://auth:4180
      traefik.http.middlewares.auth.forwardauth.trustForwardHeader: true
```

### Traditional nginx Setup

```nginx
server {
  listen 443 ssl http2;
  server_name api.dotrc.example.com;

  location / {
    # Set upstream proxy
    proxy_pass http://dotrc-worker:8000;

    # Forward auth to oauth2-proxy
    auth_request /oauth2/auth;
    auth_request_set $user $upstream_http_x_oauth_user;
    auth_request_set $tenant $upstream_http_x_oauth_tenant;
    auth_request_set $groups $upstream_http_x_oauth_groups;

    # Inject headers into upstream request
    proxy_set_header X-Forwarded-User $user;
    proxy_set_header X-Forwarded-Tenant $tenant;
    proxy_set_header X-Forwarded-Groups $groups;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $remote_addr;
  }

  location /oauth2/ {
    proxy_pass http://oauth2-proxy:4180;
  }
}
```

## Header Format

The TrustedHeaderProvider expects these headers (all optional, at least one required):

| Header               | Format                 | Example             | Purpose                |
| -------------------- | ---------------------- | ------------------- | ---------------------- |
| `X-Forwarded-User`   | string                 | `user@example.com`  | User identifier        |
| `X-Forwarded-Tenant` | string                 | `acme-corp`         | Tenant/organization ID |
| `X-Forwarded-Groups` | comma-separated string | `finance,eng,admin` | Scopes/groups          |
| `X-Forwarded-Proto`  | `http` or `https`      | `https`             | Protocol (checked)     |

## Required Security

⚠️ **TrustedHeaderProvider requires HTTPS** by default:

```typescript
const provider = new TrustedHeaderProvider({
  requireSecureScheme: true, // Default: true
});
```

This is enforced by checking `X-Forwarded-Proto: https`. Only enable HTTP in development:

```typescript
const provider = new TrustedHeaderProvider({
  requireSecureScheme: false, // Only for local testing!
});
```

## Setup Steps

### 1. Configure Reverse Proxy to Set Headers

Using oauth2-proxy (most common):

```bash
# Install oauth2-proxy
docker run -it oauth2-proxy/oauth2-proxy --help

# Example configuration (config.cfg)
client_id = "your-client-id"
client_secret = "your-secret"
redirect_url = "https://api.dotrc.example.com/oauth2/callback"
upstreams = [
    "http://dotrc-worker:8000"
]
cookie_secure = true
cookie_httponly = true
pass_basic_auth = false

# Headers injected by oauth2-proxy
# X-Forwarded-User: oauth login
# X-Forwarded-Email: oauth email
# X-Forwarded-Groups: oauth groups (if configured)
```

### 2. Map Auth Claims to Headers

Configure your auth system to inject DotRC-specific headers:

**From OAuth2-Proxy**:

- `X-Forwarded-User` ← OAuth `preferred_username` or `email`
- `X-Forwarded-Tenant` ← Must be set by your auth system (not standard OAuth2)
- `X-Forwarded-Groups` ← OAuth provider's `groups` claim

**Tenant mapping example**:

If using email domain as tenant:

```nginx
map $upstream_http_x_oauth_email $tenant {
    ~^(.+)@(.+)$ $2;  # Extract domain from email
}

proxy_set_header X-Forwarded-Tenant $tenant;
```

Or map based on OAuth `organization` claim:

```
proxy_set_header X-Forwarded-Tenant $upstream_http_x_oauth_organization;
```

### 3. Deploy Worker with Trusted Headers

```typescript
// apps/dotrc-worker/src/index.ts
const authProviders: AuthProvider[] = [
  new CloudflareAccessProvider(), // Try CF first
  new JWTProvider(), // Try JWT
  new TrustedHeaderProvider({
    // Then reverse proxy
    requireSecureScheme: true,
  }),
  new DevelopmentProvider(), // Last resort
];

const authContext = await resolveAuthContext(request, authProviders);
```

## Validation

Test that headers flow correctly:

```bash
# Test with curl (won't pass HTTPS check without proper setup)
curl -H "X-Forwarded-User: user@example.com" \
     -H "X-Forwarded-Tenant: acme" \
     -H "X-Forwarded-Groups: finance,eng" \
     http://localhost:8000/dots  # Will fail HTTPS check in local test

# Test against deployed instance
curl -H "Authorization: Bearer ..." \  # Or other auth
     https://api.dotrc.example.com/dots
```

## Scopes/Groups Handling

Groups are extracted as space-separated or comma-separated:

```typescript
// Input headers
X-Forwarded-Groups: finance,eng,admin
// or
X-Forwarded-Groups: finance eng admin

// Output
scope_memberships: ["finance", "eng", "admin"]
```

Ensure your auth system outputs groups in one of these formats.

## Multi-Tenant Routing

If running multiple DotRC instances per tenant:

```nginx
map $http_host $backend {
    tenant1.api.example.com http://dotrc-tenant1:8000;
    tenant2.api.example.com http://dotrc-tenant2:8000;
}

server {
  listen 443 ssl http2;
  server_name *.api.example.com;

  location / {
    proxy_pass $backend;
    proxy_set_header X-Forwarded-Tenant tenant1;  # Extract from host
  }
}
```

## Troubleshooting

**"No valid authentication provided"**

- Verify reverse proxy is setting headers:
  ```bash
  # Check if headers reach the worker
  # Add logging in worker
  console.log(request.headers.get("x-forwarded-user"));
  ```
- Confirm `X-Forwarded-Proto: https` is set (if requireSecureScheme=true)
- Check reverse proxy is forwarding headers through

**Headers not appearing**

- Some reverse proxies strip headers by default
- Configure proxy to pass through custom headers:
  ```nginx
  proxy_pass_request_headers on;
  proxy_pass_request_body on;
  ```

**HTTPS enforcement failing**

- In production: Never disable `requireSecureScheme`
- In development: Temporarily disable for testing:
  ```typescript
  new TrustedHeaderProvider({ requireSecureScheme: false });
  ```

## Security Checklist

- ✅ HTTPS enforced between client and reverse proxy
- ✅ Reverse proxy location is trusted (not public internet)
- ✅ Only specific reverse proxy can reach worker
- ✅ Headers cannot be forged by external clients
- ✅ Worker validates `X-Forwarded-Proto: https`
- ✅ Tenant isolation enforced at core level

## References

- [oauth2-proxy Documentation](https://oauth2-proxy.github.io/)
- [Traefik ForwardAuth](https://doc.traefik.io/traefik/middlewares/http/forwardauth/)
- [nginx auth_request](http://nginx.org/en/docs/http/ngx_http_auth_request_module.html)
