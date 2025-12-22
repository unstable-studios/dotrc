# DotRC Worker - Authentication Documentation Index

Welcome! This directory contains the Cloudflare Workers deployment of DotRC with a production-ready pluggable authentication system.

## 📍 Start Here

**New to DotRC auth?** → [quick-start.md](./quick-start.md)  
**How it works** → [trusted-auth.md](./trusted-auth.md)

## 📚 Documentation Map

### For Everyone

| Document                             | Purpose                                      | Time   |
| ------------------------------------ | -------------------------------------------- | ------ |
| [quick-start.md](./quick-start.md)   | Entry point: choose auth method, quick setup | 5 min  |
| [trusted-auth.md](./trusted-auth.md) | How the pluggable auth system works          | 10 min |

### Setup Guides (Choose One)

| Document                                                   | Use When                                                    | Time   |
| ---------------------------------------------------------- | ----------------------------------------------------------- | ------ |
| [jwt-setup.md](./jwt-setup.md)                             | Using OIDC provider (Auth0, Okta, Azure AD, GitHub, Google) | 15 min |
| [cloudflare-access-setup.md](./cloudflare-access-setup.md) | Using Cloudflare Access zero-trust proxy                    | 10 min |
| [trusted-headers-setup.md](./trusted-headers-setup.md)     | Behind reverse proxy (nginx, Traefik, K8s)                  | 15 min |
| [local-development.md](./local-development.md)             | Testing locally or in CI                                    | 10 min |

### Before Shipping

| Document                                 | Purpose                                                  | Time   |
| ---------------------------------------- | -------------------------------------------------------- | ------ |
| [auth-security.md](./auth-security.md)   | Security best practices, environment configs, monitoring | 20 min |
| [auth-checklist.md](./auth-checklist.md) | Pre-deployment verification checklist                    | 15 min |

## 🔧 Implementation

### Code Files

- **[src/auth.ts](./src/auth.ts)** — Auth provider implementations (250+ lines)
- **[src/auth.test.ts](./src/auth.test.ts)** — Comprehensive auth tests (16 tests, all passing)
- **[src/index.ts](./src/index.ts)** — Worker entrypoint with auth integration

### Test Coverage

```
Test Files  2 passed (2)
     Tests  38 passed (38)  ✅
   Duration  122ms
```

Run tests: `pnpm run test`

## 🚀 Getting Started

### 1️⃣ Local Development (5 minutes)

```bash
# Start worker
pnpm run dev

# Test with development headers
curl -X POST http://localhost:8787/dots \
  -H "X-Tenant-ID: test-tenant" \
  -H "X-User-ID: alice@example.com" \
  -H "Content-Type: application/json" \
  -d '{"title": "Hello", "body": "DotRC"}'
```

→ See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for more examples

### 2️⃣ Choose Your Auth Method

| Method                | Effort | Portability | Best For             |
| --------------------- | ------ | ----------- | -------------------- |
| **JWT/OIDC**          | 30 min | High ✅     | Portable, standard   |
| **Cloudflare Access** | 15 min | CF-only     | Using Cloudflare     |
| **Trusted Headers**   | 45 min | High ✅     | Behind reverse proxy |

→ Follow the setup guide for your choice above

### 3️⃣ Verify & Deploy

1. Run tests: `pnpm run test`
2. TypeScript check: `pnpm run typecheck`
3. Use [AUTH_CHECKLIST.md](./AUTH_CHECKLIST.md) to verify setup
4. Review [AUTH_SECURITY.md](./AUTH_SECURITY.md) for production
5. Deploy with confidence

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ User/Client sends request with auth credential          │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ dotrc-worker receives request                           │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Try Auth Providers in order:                            │
│  1. CloudflareAccessProvider                            │
│  2. JWTProvider                                         │
│  3. TrustedHeaderProvider                               │
│  4. DevelopmentProvider (local testing only)            │
└──────────────────────────┬──────────────────────────────┘
                           │
                    First match wins
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ AuthContext extracted:                                  │
│  • tenant_id (which tenant?)                            │
│  • user_id (who?)                                       │
│  • scope_memberships (permissions)                      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ dotrc-core policy engine:                               │
│  • Validate tenant isolation                            │
│  • Check ACL visibility                                 │
│  • Enforce immutability                                 │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Response (200 ✅ or 401/404 ❌)                         │
└─────────────────────────────────────────────────────────┘
```

**Key principle**: Auth is adapter-specific. Core stays pure with zero auth logic.

## ✨ Key Features

✅ **Pluggable** — Swap auth methods without changing code  
✅ **Portable** — No vendor lock-in (JWT/OIDC standard)  
✅ **Secure** — HTTPS enforced, tenant isolation, immutable ACLs  
✅ **Multi-tenant** — Strong isolation at core level  
✅ **Well-tested** — 38 tests passing, comprehensive coverage  
✅ **Well-documented** — 9 guides + checklist  
✅ **Production-ready** — Security best practices included

## ❓ Common Questions

**Q: Which auth method should I use?**  
→ See [quick-start.md](./quick-start.md) for comparison table

**Q: Can I change methods later?**  
→ Yes, the pluggable design allows switching without code changes

**Q: How do I test locally?**  
→ Use [local-development.md](./local-development.md) with DevelopmentProvider

**Q: Is this production-ready?**  
→ Yes! Follow [auth-checklist.md](./auth-checklist.md) before shipping

**Q: Can I use custom auth?**  
→ Yes! Implement the `AuthProvider` interface (see [trusted-auth.md](./trusted-auth.md))

**Q: What if auth fails?**  
→ Worker returns 401 with `{ error: "unauthorized" }`

## 📖 Documentation Standards

- All guides have curl examples for testing
- Setup guides include configuration for multiple providers
- Security doc covers deployment environments (dev/staging/prod)
- Checklist provides step-by-step verification
- All code examples are copy-paste ready

## 🔗 Related Files

- **Main README**: [../../README.md](../../README.md)
- **Core architecture**: [../../docs/core-architecture.md](../../docs/core-architecture.md)
- **Security model**: [../../docs/visibility-and-security.md](../../docs/visibility-and-security.md)

## 📞 Support

1. **Quick answers** → Check [quick-start.md](./quick-start.md) FAQs
2. **Setup help** → Read the setup guide for your auth method
3. **Security questions** → See [auth-security.md](./auth-security.md)
4. **Testing issues** → Use [local-development.md](./local-development.md) guide
5. **Pre-deployment** → Follow [auth-checklist.md](./auth-checklist.md)

---

**Everything you need is in this directory. Start with [quick-start.md](./quick-start.md)!** 🚀
