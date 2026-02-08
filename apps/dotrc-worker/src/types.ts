// Type definitions matching dotrc-core domain types

export type Timestamp = string; // RFC3339

// Note: These are serialized as simple strings in JSON, not objects
// The Rust newtype wrappers handle the internal structure
export type TenantId = string;
export type UserId = string;
export type ScopeId = string;
export type DotId = string;

export type LinkType = "followup" | "corrects" | "supersedes" | "related";

export interface Link {
  from_dot_id: DotId;
  to_dot_id: DotId;
  link_type: LinkType;
  created_at: Timestamp;
}

export type Tag = string;

export interface AttachmentRef {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string;
  created_at: Timestamp;
}

export interface VisibilityGrant {
  dot_id: DotId;
  user_id?: UserId;
  scope_id?: ScopeId;
  granted_at: Timestamp;
  granted_by?: UserId;
}

export interface Dot {
  id: DotId;
  tenant_id: TenantId;
  title: string;
  body?: string;
  created_by: UserId;
  created_at: Timestamp;
  scope_id?: ScopeId;
  tags: Tag[];
  attachments: AttachmentRef[];
}

export interface DotDraft {
  title: string;
  body?: string;
  created_by: UserId;
  tenant_id: TenantId;
  scope_id?: ScopeId;
  tags: string[];
  visible_to_users: UserId[];
  visible_to_scopes: ScopeId[];
  attachments: AttachmentRef[];
}

export interface AuthContext {
  requesting_user: string; // Serialized UserId
  user_scope_memberships: string[]; // Serialized ScopeId[]
}

// WASM Result types

/**
 * DotRC error kinds mapping to HTTP status codes:
 * - Validation: 400 Bad Request - Invalid input (e.g., missing required fields, invalid format)
 * - Authorization: 403 Forbidden - User lacks permission for the requested operation
 * - Link: 409 Conflict - Invalid link operation (e.g., self-reference, duplicate link)
 * - ServerError: 500 Internal Server Error - Unexpected errors (e.g., parse failures)
 */
export type DotrcErrorKind =
  | "Validation"
  | "Authorization"
  | "Link"
  | "ServerError";

export type WasmResultOk<T> = {
  type: "ok";
  data: T;
};

export type WasmResultErr = {
  type: "err";
  kind: DotrcErrorKind;
  message: string;
};

export type WasmResult<T> = WasmResultOk<T> | WasmResultErr;

// Command result payloads

export interface CreateDotOutput {
  dot: Dot;
  grants: VisibilityGrant[];
  links: Link[];
}

export interface GrantAccessOutput {
  grants: VisibilityGrant[];
}

export interface CreateLinkOutput {
  link: Link;
}

export interface CanViewDotOutput {
  can_view: boolean;
}

export interface FilterVisibleDotsOutput {
  dots: Dot[];
}

export interface LinkGrants {
  from: VisibilityGrant[];
  to: VisibilityGrant[];
}

// Error handling utilities

/**
 * Structured error type for DotRC operations.
 * Includes a typed `kind` field for programmatic error handling.
 */
export class DotrcError extends Error {
  constructor(public kind: DotrcErrorKind, message: string) {
    super(message);
    this.name = "DotrcError";
  }
}

export function unwrapWasmResult<T>(result: WasmResult<T>): T {
  if (result.type === "err") {
    throw new DotrcError(result.kind, result.message);
  }
  return result.data;
}
