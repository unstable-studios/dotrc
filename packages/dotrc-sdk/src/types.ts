/** RFC3339 timestamp string. */
export type Timestamp = string;

export type TenantId = string;
export type UserId = string;
export type ScopeId = string;
export type DotId = string;
export type Tag = string;

export type LinkType = "followup" | "corrects" | "supersedes" | "related";

/** An immutable dot record. */
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

/** Input for creating a dot via the SDK. */
export interface CreateDotInput {
  title: string;
  body?: string;
  scope_id?: string;
  tags?: string[];
  visible_to_users?: string[];
  visible_to_scopes?: string[];
}

/** Response from creating a dot. */
export interface CreateDotResponse {
  dot_id: DotId;
  created_at: Timestamp;
  grants_count: number;
  links_count: number;
}

/** Attachment metadata reference. */
export interface AttachmentRef {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string;
  storage_key?: string;
  created_at: Timestamp;
}

/** Response from uploading an attachment. */
export interface UploadAttachmentResponse {
  attachment_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string;
  created_at: Timestamp;
}

/** A visibility grant for a dot. */
export interface VisibilityGrant {
  dot_id: DotId;
  user_id?: UserId;
  scope_id?: ScopeId;
  granted_at: Timestamp;
  granted_by?: UserId;
}

/** Input for granting access to a dot. */
export interface GrantAccessInput {
  user_ids?: string[];
  scope_ids?: string[];
}

/** Response from granting access. */
export interface GrantAccessResponse {
  grants: VisibilityGrant[];
  grants_count: number;
}

/** A directed, typed link between two dots. */
export interface Link {
  from_dot_id: DotId;
  to_dot_id: DotId;
  link_type: LinkType;
  created_at: Timestamp;
}

/** Input for creating a link. */
export interface CreateLinkInput {
  to_dot_id: DotId;
  link_type: LinkType;
}

/** Response from creating a link. */
export interface CreateLinkResponse {
  link: Link;
}

/** Paginated list of dots. */
export interface ListDotsResponse {
  dots: Dot[];
  total: number;
  has_more: boolean;
  limit: number;
  offset: number;
}

/** Pagination options for list endpoints. */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/** List grants response. */
export interface ListGrantsResponse {
  grants: VisibilityGrant[];
}

/** List links response. */
export interface ListLinksResponse {
  links: Link[];
}

/** Single result in a batch operation. */
export interface BatchDotResult {
  index: number;
  status: "ok" | "error";
  dot_id?: string;
  created_at?: string;
  grants_count?: number;
  error?: string;
}

/** Response from batch dot creation. */
export interface BatchDotsResponse {
  results: BatchDotResult[];
}

/** Input for a single batch grant request. */
export interface BatchGrantInput {
  dot_id: DotId;
  user_ids?: string[];
  scope_ids?: string[];
}

/** Single result in a batch grant operation. */
export interface BatchGrantResult {
  index: number;
  status: "ok" | "error";
  dot_id?: string;
  grants_count?: number;
  error?: string;
}

/** Response from batch grant. */
export interface BatchGrantsResponse {
  results: BatchGrantResult[];
}

/** Health check response. */
export interface HealthResponse {
  status: string;
  service: string;
}

/** Configuration for the DotrcClient. */
export interface DotrcClientConfig {
  /** Base URL of the dotrc API (e.g., "https://api.dotrc.dev"). */
  baseUrl: string;
  /** Bearer token for authentication. */
  token?: string;
  /** Custom headers to include on every request. */
  headers?: Record<string, string>;
  /** Custom fetch implementation (defaults to global fetch). */
  fetch?: typeof globalThis.fetch;
}
