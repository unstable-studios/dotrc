# Quick Start: Adding Auth to DotRC

New to DotRC auth? Start here.

## Choose Your Path

### 🚀 Just Getting Started (Local Testing)

1. Start the worker: `pnpm run dev`
2. Send requests with test headers:
   ```bash
   curl -X POST http://localhost:8787/dots \
     -H "X-Tenant-ID: my-tenant" \
     -H "X-User-ID: alice@example.com" \
     -H "Content-Type: application/json" \
     -d '{"title": "Hello", "body": "World"}'
   ```
3. See [local-development.md](./local-development.md) for more examples

### 🌍 Deploying to Production

**Step 1: Pick an auth method**

| Method            | Best For             | Setup Time | Recommended   |
| ----------------- | -------------------- | ---------- | ------------- |
| JWT/OIDC          | Any cloud provider   | 30 min     | ✅ Yes        |
| Cloudflare Access | Using Cloudflare     | 15 min     | ✅ If on CF   |
| Trusted Headers   | Behind reverse proxy | 45 min     | ✅ Enterprise |
| Development       | Testing only         | 0 min      | ❌ No         |

**Step 2: Follow the setup guide for your method**

- **JWT/OIDC (portable)** → [jwt-setup.md](./jwt-setup.md)

  - Works with Auth0, Okta, Azure AD, GitHub, Google
  - Send Bearer tokens
  - Most portable option

- **Cloudflare Access (if using CF)** → [cloudflare-access-setup.md](./cloudflare-access-setup.md)

  - Zero-trust proxy
  - Automatic CF headers
  - Best if already on Cloudflare

- **Trusted Headers (enterprise)** → [trusted-headers-setup.md](./trusted-headers-setup.md)
  - Reverse proxy (nginx, Traefik, K8s)
  - Works with oauth2-proxy
  - Traditional enterprise setup

**Step 3: Verify with the checklist**

See [AUTH_CHECKLIST.md](./AUTH_CHECKLIST.md) for:

- Pre-deployment checks
- Security configuration
- Monitoring setup
- Team handoff

**Step 4: Review security**

Read [AUTH_SECURITY.md](./AUTH_SECURITY.md) for:

- Environment-specific configs (dev/staging/production)
- HTTPS enforcement
- Tenant isolation verification
- Incident response

## Files Overview

### Implementation

- **[src/auth.ts](./src/auth.ts)** — The auth provider code
- **[src/auth.test.ts](./src/auth.test.ts)** — Tests (16 passing)
- **[src/index.ts](./src/index.ts)** — Worker integration

### Documentation

| File                                                       | When to Read        | Length |
| ---------------------------------------------------------- | ------------------- | ------ |
| [trusted-auth.md](./trusted-auth.md)                       | "How does it work?" | 10 min |
| [jwt-setup.md](./jwt-setup.md)                             | Using OIDC          | 15 min |
| [cloudflare-access-setup.md](./cloudflare-access-setup.md) | Using Cloudflare    | 10 min |
| [trusted-headers-setup.md](./trusted-headers-setup.md)     | Using reverse proxy | 15 min |
| [local-development.md](./local-development.md)             | Testing locally     | 10 min |
| [auth-security.md](./auth-security.md)                     | Security practices  | 20 min |
| [auth-checklist.md](./auth-checklist.md)                   | Before shipping     | 15 min |

## Common Questions

**Q: Which auth method should I use?**

- **JWT/OIDC** if you want portable, industry-standard auth
- **Cloudflare Access** if you're already on Cloudflare
- **Trusted Headers** if you have a reverse proxy (nginx, Traefik, K8s)
- **Development** only for local testing

**Q: Can I change auth methods later?**

- Yes! The pluggable design allows switching providers without code changes
- No database migration required

**Q: Is development provider safe for production?**

- No! Always remove DevelopmentProvider in production
- See [AUTH_CHECKLIST.md](./AUTH_CHECKLIST.md) for the production checklist

**Q: How do I test auth locally?**

- Use DevelopmentProvider with X-Tenant-ID and X-User-ID headers
- Or create test JWT tokens at jwt.io
- See [local-development.md](./local-development.md) for examples

**Q: What if a user needs access to multiple tenants?**

- Each request includes a single tenant_id
- User can authenticate to different tenants by providing different tenant claims
- Tenant isolation is enforced at core level

**Q: How do I know if auth is working?**

- Run tests: `pnpm run test`
- All 38 tests should pass
- Check TypeScript: `pnpm run typecheck`
- Test locally with curl examples in [local-development.md](./local-development.md)

**Q: What's the difference between JWT and Cloudflare Access?**

- **JWT**: Standard OIDC, portable, works anywhere
- **CF Access**: CF-specific, zero-trust proxy, already handles authentication

Both work fine. JWT is more portable; CF Access is simpler if you're on Cloudflare.

**Q: Can I use multiple auth methods at once?**

- Yes! The provider chain tries them in order
- Useful for gradual migration or supporting multiple clients
- DevelopmentProvider acts as fallback for testing

## Next Steps

1. **Local testing**: Start worker, test with dev headers
2. **Choose method**: Pick JWT/CF/Headers based on your setup
3. **Follow guide**: Read the setup guide for your method
4. **Deploy**: Push to staging first
5. **Verify**: Use AUTH_CHECKLIST.md
6. **Go live**: Ship with confidence

## Architecture Diagram

```
User/Client
    ↓
Auth Header (JWT / CF / Headers / Dev)
    ↓
Worker receives request
    ↓
Try JWTProvider → Try CFProvider → Try HeadersProvider → Try DevProvider
    ↓
First match wins
    ↓
AuthContext { tenant_id, user_id, scope_memberships }
    ↓
Core validates policy (who can see what)
    ↓
Response (200 if allowed, 404/401 if not)
```

See [TRUSTED_AUTH.md](./TRUSTED_AUTH.md) for detailed architecture.

---

## Key Principles

✅ **No client trust**: Headers come from trusted auth system, never client  
✅ **Immutable ACLs**: Snapshot at creation, not retroactive  
✅ **Tenant isolation**: Every request validated against tenant_id  
✅ **Pluggable**: Swap providers without code changes  
✅ **Portable**: JWT/OIDC standard, not platform-specific

---

**Ready? Pick your auth method and follow the setup guide!**
