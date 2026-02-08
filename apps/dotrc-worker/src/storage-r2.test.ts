import { describe, it, expect } from "vitest";
import {
  R2AttachmentStorage,
  type R2Bucket,
  type R2Object,
  type R2PutOptions,
} from "./storage-r2";

// Mock R2 bucket
class MockR2Bucket implements R2Bucket {
  private objects: Map<
    string,
    { data: ArrayBuffer; metadata: R2PutOptions; size: number }
  > = new Map();

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream,
    options?: R2PutOptions
  ): Promise<R2Object | null> {
    const data =
      value instanceof Uint8Array
        ? new Uint8Array(value).buffer as ArrayBuffer
        : (value as ArrayBuffer);
    this.objects.set(key, {
      data,
      metadata: options || {},
      size: data.byteLength,
    });
    return this.makeR2Object(key, data, options);
  }

  async get(key: string): Promise<R2Object | null> {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return this.makeR2Object(key, entry.data, entry.metadata);
  }

  async delete(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      this.objects.delete(k);
    }
  }

  async head(key: string): Promise<R2Object | null> {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return this.makeR2Object(key, entry.data, entry.metadata);
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }

  private makeR2Object(
    key: string,
    data: ArrayBuffer | SharedArrayBuffer,
    options?: R2PutOptions
  ): R2Object {
    const buf = data as ArrayBuffer;
    return {
      key,
      version: "1",
      size: buf.byteLength,
      etag: "mock-etag",
      httpEtag: '"mock-etag"',
      checksums: {},
      httpMetadata: options?.httpMetadata || {},
      customMetadata: options?.customMetadata || {},
      uploaded: new Date(),
      async arrayBuffer() {
        return buf;
      },
      async text() {
        return new TextDecoder().decode(buf);
      },
      async json<T>() {
        return JSON.parse(new TextDecoder().decode(buf)) as T;
      },
      async blob() {
        return new Blob([buf]);
      },
    };
  }
}

// Mock R2 bucket that fails on put
class FailingR2Bucket extends MockR2Bucket {
  async put(): Promise<R2Object | null> {
    return null;
  }
}

describe("R2AttachmentStorage", () => {
  describe("uploadAttachment", () => {
    it("uploads a file and returns a storage key", async () => {
      const bucket = new MockR2Bucket();
      const storage = new R2AttachmentStorage(bucket);

      const data = new TextEncoder().encode("hello world");
      const key = await storage.uploadAttachment({
        tenantId: "tenant-1",
        dotId: "dot-123",
        filename: "test.txt",
        contentType: "text/plain",
        data,
      });

      // Validate full key format: {tenantId}/{dotId}/{uuid}/{filename}
      const parts = key.split("/");
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe("tenant-1");
      expect(parts[1]).toBe("dot-123");
      expect(parts[2]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(parts[3]).toBe("test.txt");
      expect(bucket.has(key)).toBe(true);
    });

    it("sanitizes filename in storage key", async () => {
      const bucket = new MockR2Bucket();
      const storage = new R2AttachmentStorage(bucket);

      const data = new TextEncoder().encode("content");
      const key = await storage.uploadAttachment({
        tenantId: "tenant-1",
        dotId: "dot-123",
        filename: 'my file<script>"evil.txt',
        contentType: "text/plain",
        data,
      });

      // Slashes, quotes, and special chars should be removed/replaced
      expect(key).not.toContain("<");
      expect(key).not.toContain(">");
      expect(key).not.toContain('"');
      expect(key).toContain("tenant-1/dot-123/");
    });

    it("throws on R2 failure", async () => {
      const bucket = new FailingR2Bucket();
      const storage = new R2AttachmentStorage(bucket);

      const data = new TextEncoder().encode("content");
      await expect(
        storage.uploadAttachment({
          tenantId: "tenant-1",
          dotId: "dot-123",
          filename: "test.txt",
          contentType: "text/plain",
          data,
        })
      ).rejects.toThrow("Failed to upload attachment to R2");
    });
  });

  describe("getAttachment", () => {
    it("retrieves an uploaded file", async () => {
      const bucket = new MockR2Bucket();
      const storage = new R2AttachmentStorage(bucket);

      const originalData = new TextEncoder().encode("hello world");
      const key = await storage.uploadAttachment({
        tenantId: "tenant-1",
        dotId: "dot-123",
        filename: "test.txt",
        contentType: "text/plain",
        data: originalData,
      });

      const result = await storage.getAttachment(key);

      expect(result).not.toBeNull();
      expect(result!.contentType).toBe("text/plain");
      expect(result!.sizeBytes).toBe(originalData.byteLength);
      const text = new TextDecoder().decode(result!.data);
      expect(text).toBe("hello world");
    });

    it("returns null for non-existent key", async () => {
      const bucket = new MockR2Bucket();
      const storage = new R2AttachmentStorage(bucket);

      const result = await storage.getAttachment("nonexistent/key");
      expect(result).toBeNull();
    });
  });

  describe("deleteAttachment", () => {
    it("deletes a file from R2", async () => {
      const bucket = new MockR2Bucket();
      const storage = new R2AttachmentStorage(bucket);

      const data = new TextEncoder().encode("to delete");
      const key = await storage.uploadAttachment({
        tenantId: "tenant-1",
        dotId: "dot-123",
        filename: "delete-me.txt",
        contentType: "text/plain",
        data,
      });

      expect(bucket.has(key)).toBe(true);
      await storage.deleteAttachment(key);
      expect(bucket.has(key)).toBe(false);
    });

    it("does not throw for non-existent key", async () => {
      const bucket = new MockR2Bucket();
      const storage = new R2AttachmentStorage(bucket);

      await expect(
        storage.deleteAttachment("nonexistent/key")
      ).resolves.toBeUndefined();
    });
  });

  describe("getAttachmentUrl", () => {
    it("throws because R2 presigned URLs are not supported in Workers", async () => {
      const bucket = new MockR2Bucket();
      const storage = new R2AttachmentStorage(bucket);

      await expect(
        storage.getAttachmentUrl("some/key")
      ).rejects.toThrow("R2 presigned URLs not yet supported");
    });
  });
});
