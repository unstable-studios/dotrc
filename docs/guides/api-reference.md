# API Reference

All endpoints require authentication (see [Authentication](./authentication.md)). Responses include an `x-request-id` header for debugging.

## Health

### `GET /`

Check API health.

**Response** `200 OK`

```json
{
  "status": "ok",
  "service": "dotrc-worker"
}
```

---

## Dots

### `POST /dots`

Create a new dot.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Dot title (non-empty) |
| `body` | string | No | Dot body text |
| `scope_id` | string | No | Scope the dot belongs to |
| `tags` | string[] | No | Tags for categorization |
| `visible_to_users` | string[] | No | User IDs who can see this dot (defaults to creator) |
| `visible_to_scopes` | string[] | No | Scope IDs whose members can see this dot |

**Response** `201 Created`

```json
{
  "dot_id": "d-550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2024-01-15T10:30:00.000Z",
  "grants_count": 1,
  "links_count": 0
}
```

**Errors:** `400` (missing title), `401` (unauthorized)

---

### `GET /dots/:dotId`

Retrieve a specific dot.

**Response** `200 OK`

```json
{
  "id": "d-550e8400...",
  "tenant_id": "my-team",
  "title": "Example dot",
  "body": "Optional body text",
  "created_by": "user-1",
  "created_at": "2024-01-15T10:30:00.000Z",
  "scope_id": null,
  "tags": ["bug"],
  "attachments": []
}
```

**Errors:** `401`, `403` (not visible), `404` (not found)

---

### `GET /dots`

List dots visible to the authenticated user.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Maximum results (1-100) |
| `offset` | number | 0 | Pagination offset |

**Response** `200 OK`

```json
{
  "dots": [...],
  "total": 42,
  "has_more": true,
  "limit": 50,
  "offset": 0
}
```

---

## Grants

### `POST /dots/:dotId/grants`

Grant access to an existing dot. Only the creator or existing grantees can grant access.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_ids` | string[] | No* | User IDs to grant access to |
| `scope_ids` | string[] | No* | Scope IDs to grant access to |

*At least one of `user_ids` or `scope_ids` is required.

**Response** `201 Created`

```json
{
  "grants": [
    {
      "dot_id": "d-550e8400...",
      "user_id": "user-2",
      "granted_at": "2024-01-15T11:00:00.000Z",
      "granted_by": "user-1"
    }
  ],
  "grants_count": 1
}
```

**Errors:** `400` (no targets), `401`, `403` (not authorized), `404` (dot not found)

---

### `GET /dots/:dotId/grants`

List visibility grants for a dot. Only visible to the creator and existing grantees.

**Response** `200 OK`

```json
{
  "grants": [
    {
      "dot_id": "d-550e8400...",
      "user_id": "user-1",
      "granted_at": "2024-01-15T10:30:00.000Z",
      "granted_by": "user-1"
    }
  ]
}
```

**Errors:** `401`, `403`, `404`

---

## Links

### `POST /dots/:dotId/links`

Create a directed link from one dot to another. Both dots must be in the same tenant and visible to the user.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to_dot_id` | string | Yes | Target dot ID |
| `link_type` | string | Yes | One of: `followup`, `corrects`, `supersedes`, `related` |

**Link types:**

| Type | Meaning |
|------|---------|
| `followup` | A continuation or next step |
| `corrects` | Fixes an error in the source dot |
| `supersedes` | Replaces the source dot entirely |
| `related` | General semantic relationship |

**Response** `201 Created`

```json
{
  "link": {
    "from_dot_id": "d-aaa...",
    "to_dot_id": "d-bbb...",
    "link_type": "followup",
    "created_at": "2024-01-15T12:00:00.000Z"
  }
}
```

**Errors:** `400` (missing fields, invalid link_type), `401`, `403`, `404` (dot not found), `409` (self-reference or duplicate link)

---

### `GET /dots/:dotId/links`

List links for a dot (both incoming and outgoing). Links to dots the user cannot view are filtered out.

**Response** `200 OK`

```json
{
  "links": [
    {
      "from_dot_id": "d-aaa...",
      "to_dot_id": "d-bbb...",
      "link_type": "followup",
      "created_at": "2024-01-15T12:00:00.000Z"
    }
  ]
}
```

---

## Attachments

### `POST /dots/:dotId/attachments`

Upload an attachment to a dot. Only the dot creator can add attachments. Maximum 10 attachments per dot, 10MB per file.

**Content-Type:** `multipart/form-data`

**Form fields:**

| Field | Type | Description |
|-------|------|-------------|
| `file` | File | The file to upload |

**Allowed MIME types:** `text/plain`, `text/csv`, `text/markdown`, `application/json`, `application/pdf`, `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`, `application/zip`, `application/gzip`

**Response** `201 Created`

```json
{
  "attachment_id": "att-abc123...",
  "filename": "screenshot.png",
  "mime_type": "image/png",
  "size_bytes": 45678,
  "content_hash": "sha256:a1b2c3...",
  "created_at": "2024-01-15T13:00:00.000Z"
}
```

**Errors:** `400` (invalid file, unsupported type), `401`, `403` (not creator), `404`, `413` (file too large)

---

### `GET /attachments/:attachmentId`

Download an attachment. Returns the raw file data. The user must be able to view the parent dot.

**Response** `200 OK`

Headers include `content-type`, `content-length`, and `content-disposition`.

**Errors:** `401`, `403`, `404`

---

## Batch Operations

### `POST /batch/dots`

Create multiple dots in a single request. Maximum 50 dots per batch.

**Request body:** JSON array of dot objects (same schema as `POST /dots`).

**Response** `201` (all succeeded), `207` (partial success), or `400` (all failed)

```json
{
  "results": [
    {
      "index": 0,
      "status": "ok",
      "dot_id": "d-aaa...",
      "created_at": "2024-01-15T10:30:00.000Z",
      "grants_count": 1
    },
    {
      "index": 1,
      "status": "error",
      "error": "Missing or empty 'title' field"
    }
  ]
}
```

---

### `POST /batch/grants`

Grant access to multiple dots in a single request. Maximum 50 grant operations per batch.

**Request body:** JSON array of grant objects:

```json
[
  {
    "dot_id": "d-aaa...",
    "user_ids": ["user-2"],
    "scope_ids": []
  }
]
```

**Response** `201`, `207`, or `400` (same pattern as batch dots)

---

## Slack Integration

### `POST /slack/events`

Slack Events API webhook. Handles `url_verification` challenges and `event_callback` events (e.g., messages that create dots).

Requires `SLACK_SIGNING_SECRET` for signature verification.

### `POST /slack/commands`

Slack slash command handler. Supports `/dot` for creating dots inline.

### `GET /slack/install`

Redirects to Slack's OAuth authorization page. Requires `SLACK_CLIENT_ID`.

### `GET /slack/oauth_redirect`

Handles the OAuth callback after Slack authorization. Creates the integration record and tenant mapping.

See [Slack Integration](./slack-integration.md) for setup details.

---

## Common Error Format

All error responses follow this format:

```json
{
  "error": "error_code",
  "detail": "Human-readable message",
  "kind": "Validation"
}
```

The `kind` field maps to HTTP status codes:

| Kind | Status | Description |
|------|--------|-------------|
| `Validation` | 400 | Invalid input |
| `Authorization` | 403 | Insufficient permissions |
| `Link` | 409 | Invalid link operation |
| `ServerError` | 500 | Internal error |

See [Error Reference](./error-reference.md) for the complete list.
