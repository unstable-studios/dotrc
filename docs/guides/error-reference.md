# Error Reference

All DotRC API errors follow a consistent JSON format with an `error` code, `detail` message, and optional `kind` field.

## Error Response Format

```json
{
  "error": "error_code",
  "detail": "Human-readable description of what went wrong",
  "kind": "Validation"
}
```

## Error Kinds

The `kind` field maps domain errors to HTTP status codes:

| Kind | HTTP Status | Description |
|------|-------------|-------------|
| `Validation` | 400 | Invalid input data |
| `Authorization` | 403 | User lacks permission |
| `Link` | 409 | Invalid link operation |
| `ServerError` | 500 | Unexpected internal error |

## Error Codes by Endpoint

### Authentication Errors

| Code | Status | Detail | Cause |
|------|--------|--------|-------|
| `unauthorized` | 401 | No valid authentication provided | Missing or invalid auth headers/token |

### Dot Errors

| Code | Status | Detail | Cause |
|------|--------|--------|-------|
| `invalid_json` | 400 | (parse error message) | Request body is not valid JSON |
| `invalid_body` | 400 | Expected JSON object | Body is null, array, or non-object |
| `invalid_body` | 400 | Missing or empty 'title' field | Title is missing or whitespace-only |
| `validation_failed` | 400 | (core message) | Core validation rejected the dot draft |
| `not_found` | 404 | Dot not found | Dot doesn't exist in this tenant |
| `forbidden` | 403 | You do not have permission to view this dot | User has no grant for this dot |
| `service_unavailable` | 503 | Database not configured | D1 binding not set |

### Grant Errors

| Code | Status | Detail | Cause |
|------|--------|--------|-------|
| `invalid_body` | 400 | At least one entry in user_ids or scope_ids is required | Both arrays are empty |
| `validation_failed` | 400 | (core message) | Core validation failed |
| `forbidden` | 403 | (core message) | User not authorized to grant access |
| `not_found` | 404 | Dot not found | Dot doesn't exist |

### Link Errors

| Code | Status | Detail | Cause |
|------|--------|--------|-------|
| `invalid_body` | 400 | Missing 'to_dot_id' field | Target dot ID not provided |
| `invalid_body` | 400 | Invalid link_type '...' | Link type not one of the valid options |
| `not_found` | 404 | Source/Target dot not found | One of the dots doesn't exist |
| `link_error` | 409 | (core message) | Self-reference, duplicate link, or cross-tenant link |

### Attachment Errors

| Code | Status | Detail | Cause |
|------|--------|--------|-------|
| `invalid_body` | 400 | Expected multipart/form-data | Wrong content type |
| `invalid_body` | 400 | Missing 'file' field in form data | No file in form |
| `invalid_body` | 400 | Filename is required | Empty filename |
| `invalid_body` | 400 | Filename exceeds maximum length | Filename > 255 chars |
| `invalid_body` | 400 | Filename must not contain path separators | `\` or `/` in filename |
| `invalid_body` | 400 | Filename must not contain control characters | Control chars in filename |
| `invalid_body` | 400 | Unsupported file type '...' | MIME type not in allowlist |
| `validation_failed` | 400 | Maximum attachments reached | Dot already has 10 attachments |
| `forbidden` | 403 | Only the dot creator can add attachments | Non-creator tried to upload |
| `file_too_large` | 413 | File exceeds maximum size | File > 10MB |
| `service_unavailable` | 503 | Attachment storage not configured | R2 binding not set |

### Batch Errors

| Code | Status | Detail | Cause |
|------|--------|--------|-------|
| `invalid_body` | 400 | Expected JSON array | Body is not an array |
| `invalid_body` | 400 | Batch size exceeds maximum of 50 | Too many items |
| `invalid_body` | 400 | Batch must contain at least one item | Empty array |

Batch responses use status `201` (all OK), `207` (partial success), or `400` (all failed).

### Slack Errors

| Code | Status | Detail | Cause |
|------|--------|--------|-------|
| `unauthorized` | 401 | Invalid Slack signature | Failed `x-slack-signature` verification |
| `service_unavailable` | 503 | Slack integration not configured | Missing `SLACK_SIGNING_SECRET` |

## Troubleshooting

### "No valid authentication provided" (401)

- **Development:** Ensure you're sending `x-tenant-id` and `x-user-id` headers
- **JWT:** Check that `Authorization: Bearer <token>` is present and the token is valid
- **Production:** Verify `ENVIRONMENT` is not set to production if using development headers

### "Dot not found" (404)

- Verify the dot ID is correct
- Ensure you're authenticated as a user in the same tenant as the dot
- The dot may have been created under a different tenant

### "forbidden" (403)

- You must be the dot creator or have been granted access
- For grants: only the creator or existing grantees can share further
- For attachments: only the creator can upload

### "link_error" (409)

- Cannot link a dot to itself
- Cannot create duplicate links (same from, to, and type)
- Both dots must belong to the same tenant

### Internal errors (500)

If you encounter 500 errors:

1. Check the `x-request-id` header for correlation
2. Review worker logs for the error details
3. Verify D1 and R2 bindings are configured correctly
