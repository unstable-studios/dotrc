# Auth Setup Verification Checklist

Use this checklist to verify your DotRC authentication setup is correct.

## Pre-Deployment (Development/Staging)

### Code Setup

- [ ] Auth provider chain configured in `index.ts`
- [ ] DevelopmentProvider included (for local testing)
- [ ] TypeScript compilation clean: `pnpm run typecheck`
- [ ] All tests passing: `pnpm run test`
- [ ] No console errors when starting worker: `pnpm run dev`

### Testing

- [ ] Can send auth requests with dev headers:
  ```bash
  curl -X POST http://localhost:8787/dots \
    -H "X-Tenant-ID: test-tenant" \
    -H "X-User-ID: test@example.com" \
    -d '{"title": "Test", "body": "Works"}'
  ```
- [ ] Receives 200 response with created dot
- [ ] Auth errors return 401 with proper error message
- [ ] Multiple tenants work correctly
- [ ] Visibility ACLs enforced (different users see different data)

## Production Deployment

### Authentication Method

Choose exactly ONE primary auth method:

#### If using JWT/OIDC:

- [ ] Issuer URL configured (Auth0, Okta, Azure AD, GitHub, Google)
- [ ] Test JWT token created at https://jwt.io
- [ ] Token contains `sub` and `tenant` claims
- [ ] Bearer token sent: `Authorization: Bearer <token>`
- [ ] Worker successfully extracts claims
- [ ] JWTProvider is first in provider chain (or only provider)

#### If using Cloudflare Access:

- [ ] Cloudflare Access configured on your domain
- [ ] Access policy allows your users
- [ ] Test request passes CF Access authentication
- [ ] Headers `CF-Access-Authenticated-User-Identity` and `CF-Access-Authenticated-Org-ID` present
- [ ] CloudflareAccessProvider is first in provider chain
- [ ] CF Access app is deployed and functioning

#### If using Trusted Headers (Reverse Proxy):

- [ ] Reverse proxy (nginx/Traefik/K8s ingress) configured
- [ ] Auth system (oauth2-proxy/similar) sets headers
- [ ] Headers include: `X-Forwarded-User`, `X-Forwarded-Tenant`
- [ ] `X-Forwarded-Proto: https` is set (enforced by provider)
- [ ] Only reverse proxy can reach worker (not direct internet)
- [ ] TrustedHeaderProvider has `requireSecureScheme: true`
- [ ] TrustedHeaderProvider in provider chain

### Security Configuration

- [ ] DevelopmentProvider **REMOVED** from production config
- [ ] HTTPS enforced:
  - If TrustedHeaderProvider: `requireSecureScheme: true` (default)
  - If JWT/CF: Workers uses HTTPS by default
- [ ] No hardcoded secrets in code (use environment variables)
- [ ] Secrets stored in Cloudflare Workers Secrets or environment
- [ ] Firewall rules prevent direct access to worker (reverse proxy only)

### Deployment Verification

- [ ] Worker deployed successfully
- [ ] Health check endpoint returns 200
- [ ] Test request with valid auth returns 200 + data
- [ ] Test request without auth returns 401
- [ ] Test request with invalid auth returns 401
- [ ] Error messages don't leak auth details

### Monitoring & Logging

- [ ] Auth success logging enabled
- [ ] Auth failure logging enabled with details:
  - Path
  - Method
  - Source IP
  - Timestamp
  - Reason (missing header, invalid token, etc.)
- [ ] Alerts configured for:
  - `401` response count > threshold in 5-min window
  - Auth errors in worker logs
  - Unexpected auth patterns

### Tenant Isolation

- [ ] Each request validates tenant_id
- [ ] Users cannot see data from other tenants
- [ ] Test confirms isolation:
  ```bash
  # User A creates dot in tenant-1
  # User A cannot access tenant-2 data
  # User B cannot access User A's data
  ```
- [ ] Tenant enforcement is at core level (verified in code)

### Team Handoff

- [ ] Team has access to:

  - [ ] [trusted-auth.md](./trusted-auth.md) — Architecture
  - [ ] [jwt-setup.md](./jwt-setup.md) — JWT configuration
  - [ ] [cloudflare-access-setup.md](./cloudflare-access-setup.md) — CF setup
  - [ ] [trusted-headers-setup.md](./trusted-headers-setup.md) — Reverse proxy setup
  - [ ] [auth-security.md](./auth-security.md) — Security best practices
  - [ ] [local-development.md](./local-development.md) — Development guide

- [ ] Team understands:
  - [ ] Which auth method is in use
  - [ ] How to test auth locally
  - [ ] How to add new users/tenants
  - [ ] Security requirements (HTTPS, token validation)
  - [ ] How to troubleshoot auth failures

## Integration Verification

### API Requests

Test these scenarios:

```bash
# Scenario 1: Valid auth, authorized user
curl -H "Authorization: Bearer <valid-token>" \
  https://api.example.com/dots
# Expected: 200 + list of dots visible to user

# Scenario 2: Invalid auth
curl https://api.example.com/dots
# Expected: 401

# Scenario 3: Valid auth, unauthorized user
curl -H "Authorization: Bearer <token-for-different-user>" \
  https://api.example.com/dots/abc123
# Expected: 404 (ACL denies access)

# Scenario 4: Malformed auth
curl -H "Authorization: Bearer invalid" \
  https://api.example.com/dots
# Expected: 401

# Scenario 5: Cross-tenant access attempt
curl -H "X-Tenant-ID: attacker-tenant" \
  https://api.example.com/dots
# Expected: 401 or 404 (no cross-tenant access)
```

### Data Validation

- [ ] Dot data includes `created_by` from auth context
- [ ] Dot data includes correct `tenant_id`
- [ ] `visible_to_users` matches who can actually view
- [ ] Timestamps are correct
- [ ] All immutable fields present

## Troubleshooting

### "No valid authentication provided"

- [ ] Verify auth header is present and correctly formatted
- [ ] Check token/header values match expected format
- [ ] If JWT: Decode token at jwt.io, verify `sub` and `tenant` claims
- [ ] If CF: Verify CF Access is enabled and user passed authentication
- [ ] If Headers: Verify reverse proxy is setting headers correctly
- [ ] Check worker logs for which providers were tried

### User Cannot Access Data

- [ ] Verify user ID in token matches creator/visible_to_users
- [ ] Verify tenant_id in auth context matches dot's tenant_id
- [ ] Check ACL snapshot in database
- [ ] Verify no typos in email/user ID format
- [ ] Test with different user to confirm isolation works

### HTTPS Errors (TrustedHeaderProvider)

- [ ] Verify `X-Forwarded-Proto: https` header is set
- [ ] Ensure reverse proxy terminates SSL
- [ ] Check requireSecureScheme setting (should be true)
- [ ] Test direct connection to worker (may fail, that's correct)

### Multi-Tenant Issues

- [ ] Verify each request includes tenant_id in auth context
- [ ] Check that tenant_id is immutable per request
- [ ] Verify users can have different tenant_ids
- [ ] Confirm core enforces tenant isolation
- [ ] Test that dots from different tenants are separate

### Performance Issues

- [ ] If using JWT with token validation: Consider token caching
- [ ] If using CF Access: Monitor CF latency
- [ ] If using reverse proxy: Check proxy performance
- [ ] Monitor worker CPU and memory usage

## Rollback Plan

If auth issues arise in production:

1. **Immediate (keep service up)**:

   - If possible, temporarily disable auth validation in code
   - Or temporarily remove DevelopmentProvider and allow insecure headers
   - Notify team of incident

2. **Short term (30 mins)**:

   - Revert worker to previous version
   - Verify service is available
   - Assess root cause

3. **Medium term (hours)**:

   - Fix auth configuration
   - Test thoroughly in staging
   - Re-deploy with monitoring

4. **Post-incident**:
   - Document what went wrong
   - Review auth configuration
   - Add monitoring to catch similar issues
   - Update runbook for team

## Success Criteria

✅ All items checked  
✅ All tests passing  
✅ Auth working in production  
✅ Team trained and confident  
✅ Monitoring and logging enabled  
✅ Runbooks and documentation in place

**DotRC auth is production-ready!**

---

## Support

If you're stuck:

1. **Check the relevant setup guide**:

   - JWT → [jwt-setup.md](./jwt-setup.md)
   - CF → [cloudflare-access-setup.md](./cloudflare-access-setup.md)
   - Headers → [trusted-headers-setup.md](./trusted-headers-setup.md)

2. **Review security practices** → [AUTH_SECURITY.md](./AUTH_SECURITY.md)

3. **Debug locally** → [local-development.md](./local-development.md)

4. **Check architecture** → [trusted-auth.md](./trusted-auth.md)

5. **Read logs** → Enable debug logging in worker

Still stuck? Check worker logs, verify header format, and test each provider individually.
