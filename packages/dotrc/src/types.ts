// Import domain types for internal use
import type {
  Dot as _Dot,
  AttachmentRef as _AttachmentRef,
  VisibilityGrant as _VisibilityGrant,
  Link as _Link,
} from "dotrc-sdk";

// Re-export domain types from dotrc-sdk to avoid duplication
export type {
  Timestamp,
  TenantId,
  UserId,
  ScopeId,
  DotId,
  Tag,
  LinkType,
  Dot,
  CreateDotInput,
  CreateDotResponse,
  AttachmentRef,
  VisibilityGrant,
  GrantAccessInput,
  GrantAccessResponse,
  Link,
  CreateLinkInput,
  CreateLinkResponse,
  ListDotsResponse,
  PaginationOptions,
  ListGrantsResponse,
  ListLinksResponse,
} from "dotrc-sdk";

// Internal types for the WASM bridge

export type DotrcErrorKind =
  | "Validation"
  | "Authorization"
  | "Link"
  | "ServerError";

export type WasmResult<T> =
  | { type: "ok"; data: T }
  | { type: "err"; kind: DotrcErrorKind; message: string };

export interface DotDraft {
  title: string;
  body?: string;
  created_by: string;
  tenant_id: string;
  scope_id?: string;
  tags: string[];
  visible_to_users: string[];
  visible_to_scopes: string[];
  attachments: _AttachmentRef[];
}

export interface AuthContext {
  requesting_user: string;
  user_scope_memberships: string[];
}

export interface CreateDotOutput {
  dot: _Dot;
  grants: _VisibilityGrant[];
  links: _Link[];
}

export interface GrantAccessOutput {
  grants: _VisibilityGrant[];
}

export interface CreateLinkOutput {
  link: _Link;
}

export interface LinkGrants {
  from: _VisibilityGrant[];
  to: _VisibilityGrant[];
}

export class DotrcError extends Error {
  constructor(
    public kind: DotrcErrorKind,
    message: string,
  ) {
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

/** Configuration for opening an embedded Dotrc instance. */
export interface DotrcConfig {
  /** Tenant identifier for multi-tenancy isolation. */
  tenant: string;
  /** User identifier for the current user. */
  user: string;
  /** Scope memberships for the current user. */
  scopeMemberships?: string[];
  /** Custom storage adapter. Defaults to in-memory. */
  storage?: EmbeddedStorage;
}

/** Storage interface for the embedded Dotrc client. */
export interface EmbeddedStorage {
  storeDot(dot: _Dot, grants: _VisibilityGrant[], links: _Link[]): Promise<void>;
  getDot(tenantId: string, dotId: string): Promise<_Dot | null>;
  getGrants(tenantId: string, dotId: string): Promise<_VisibilityGrant[]>;
  listDots(
    tenantId: string,
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ dots: _Dot[]; total: number; hasMore: boolean }>;
  storeGrants(grants: _VisibilityGrant[]): Promise<void>;
  storeLink(link: _Link, tenantId: string): Promise<void>;
  getLinks(tenantId: string, dotId: string): Promise<_Link[]>;
  close(): Promise<void>;
}
