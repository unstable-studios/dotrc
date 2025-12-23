/**
 * Storage abstraction layer for dotrc-worker.
 * 
 * Follows repository philosophies:
 * - Clean, modular abstractions
 * - Explicit interfaces
 * - Adapter pattern for platform-specific implementations
 * - No logic in storage layer - only persistence
 */

import type {
  Dot,
  VisibilityGrant,
  Link,
  Tag,
  AttachmentRef,
  TenantId,
  DotId,
  UserId,
} from "./types";

/**
 * Storage interface for persisting dots and related entities.
 * Implementations handle platform-specific storage (D1, Postgres, etc.)
 */
export interface DotStorage {
  /**
   * Store a dot with its grants, links, tags, and attachments atomically.
   * Either all records are persisted or none are (transaction semantics).
   */
  storeDot(request: StoreDotRequest): Promise<StoreDotResult>;

  /**
   * Retrieve a dot by ID within a tenant.
   */
  getDot(tenantId: TenantId, dotId: DotId): Promise<Dot | null>;

  /**
   * Retrieve visibility grants for a specific dot.
   */
  getGrants(tenantId: TenantId, dotId: DotId): Promise<VisibilityGrant[]>;

  /**
   * List dots visible to a user (based on grants).
   * Returns paginated results.
   */
  listDotsForUser(request: ListDotsRequest): Promise<ListDotsResult>;
}

/**
 * Request to store a dot and its related entities.
 */
export interface StoreDotRequest {
  dot: Dot;
  grants: VisibilityGrant[];
  links: Link[];
}

/**
 * Result of storing a dot.
 */
export interface StoreDotResult {
  success: boolean;
  dotId: DotId;
}

/**
 * Request to list dots for a user.
 */
export interface ListDotsRequest {
  tenantId: TenantId;
  userId: UserId;
  limit?: number;
  offset?: number;
}

/**
 * Result of listing dots.
 */
export interface ListDotsResult {
  dots: Dot[];
  total: number;
  hasMore: boolean;
}

/**
 * Storage interface for attachment files.
 * Separates file storage (R2/S3) from metadata (D1/Postgres).
 */
export interface AttachmentStorage {
  /**
   * Upload an attachment file and return its storage key.
   */
  uploadAttachment(request: UploadAttachmentRequest): Promise<string>;

  /**
   * Retrieve an attachment file by storage key.
   */
  getAttachment(storageKey: string): Promise<AttachmentData | null>;

  /**
   * Generate a signed URL for direct attachment access (optional).
   */
  getAttachmentUrl(storageKey: string, expiresIn?: number): Promise<string>;
}

/**
 * Request to upload an attachment.
 */
export interface UploadAttachmentRequest {
  tenantId: TenantId;
  dotId: DotId;
  filename: string;
  contentType: string;
  data: ArrayBuffer | Uint8Array;
}

/**
 * Attachment file data.
 */
export interface AttachmentData {
  data: ArrayBuffer;
  contentType: string;
  sizeBytes: number;
}
