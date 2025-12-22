/**
 * Cloudflare R2 storage adapter for attachments.
 * 
 * Provides file storage using Cloudflare R2 (S3-compatible object storage).
 * Separates file data from metadata (metadata stored in D1).
 */

import type {
  AttachmentStorage,
  UploadAttachmentRequest,
  AttachmentData,
} from "./storage";

/**
 * R2 bucket interface (Cloudflare Workers binding).
 */
export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream,
    options?: R2PutOptions
  ): Promise<R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
  head(key: string): Promise<R2Object | null>;
}

export interface R2PutOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2GetOptions {
  range?: R2Range;
}

export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
}

export interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

export interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  checksums: R2Checksums;
  httpMetadata: R2HTTPMetadata;
  customMetadata: Record<string, string>;
  uploaded: Date;
  body?: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  blob(): Promise<Blob>;
}

export interface R2Checksums {
  md5?: ArrayBuffer;
  sha1?: ArrayBuffer;
  sha256?: ArrayBuffer;
}

/**
 * R2-backed attachment storage implementation.
 */
export class R2AttachmentStorage implements AttachmentStorage {
  constructor(private bucket: R2Bucket) {}

  /**
   * Upload an attachment file to R2 and return its storage key.
   * Storage key format: {tenantId}/{dotId}/{attachmentId}/{filename}
   */
  async uploadAttachment(request: UploadAttachmentRequest): Promise<string> {
    const { tenantId, dotId, filename, contentType, data } = request;

    // Generate unique storage key with tenant/dot isolation
    const attachmentId = crypto.randomUUID();
    const storageKey = this.buildStorageKey(tenantId, dotId, attachmentId, filename);

    // Upload to R2 with metadata
    const result = await this.bucket.put(storageKey, data, {
      httpMetadata: {
        contentType,
        contentDisposition: `attachment; filename="${this.sanitizeFilename(filename)}"`,
      },
      customMetadata: {
        tenant_id: tenantId,
        dot_id: dotId,
        attachment_id: attachmentId,
        original_filename: filename,
      },
    });

    if (!result) {
      throw new Error(`Failed to upload attachment to R2: ${storageKey}`);
    }

    return storageKey;
  }

  /**
   * Retrieve an attachment file from R2.
   */
  async getAttachment(storageKey: string): Promise<AttachmentData | null> {
    const object = await this.bucket.get(storageKey);

    if (!object) {
      return null;
    }

    const data = await object.arrayBuffer();

    return {
      data,
      contentType: object.httpMetadata.contentType || "application/octet-stream",
      sizeBytes: object.size,
    };
  }

  /**
   * Generate a signed URL for direct attachment access.
   * Note: R2 doesn't natively support signed URLs in Workers yet.
   * This returns a placeholder - adapter should use R2 presigned URLs via REST API.
   */
  async getAttachmentUrl(storageKey: string, expiresIn = 3600): Promise<string> {
    // TODO: Implement R2 presigned URLs when available in Workers
    // For now, return a placeholder that indicates the limitation
    throw new Error(
      "R2 presigned URLs not yet supported in Workers runtime. Use getAttachment() instead."
    );
  }

  /**
   * Build a hierarchical storage key for tenant/dot isolation.
   * Format: {tenantId}/{dotId}/{attachmentId}/{filename}
   */
  private buildStorageKey(
    tenantId: string,
    dotId: string,
    attachmentId: string,
    filename: string
  ): string {
    const safeFilename = this.sanitizeFilename(filename);
    return `${tenantId}/${dotId}/${attachmentId}/${safeFilename}`;
  }

  /**
   * Sanitize filename to prevent path traversal and other security issues.
   */
  private sanitizeFilename(filename: string): string {
    // Remove path separators and other dangerous characters
    return filename
      .replace(/[\/\\]/g, "_") // Replace slashes with underscores
      .replace(/["]/g, "") // Remove quotes to prevent header injection
      .replace(/[^\w\s.-]/g, "") // Keep only alphanumeric, spaces, dots, dashes
      .substring(0, 255); // Limit to 255 chars
  }
}
