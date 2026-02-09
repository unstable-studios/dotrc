import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import { R2AttachmentStorage } from "./storage-r2";
import type { R2Bucket } from "./storage-r2";

let mf: Miniflare;
let r2Storage: R2AttachmentStorage;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    r2Buckets: ["ATTACHMENTS"],
  });
  const bucket = await mf.getR2Bucket("ATTACHMENTS");
  r2Storage = new R2AttachmentStorage(bucket as unknown as R2Bucket);
});

afterAll(async () => {
  await mf?.dispose();
});

describe("R2AttachmentStorage integration", () => {
  describe("upload → download round-trip", () => {
    it("uploads and downloads a file with correct content", async () => {
      const content = "Hello, R2 integration test!";
      const data = new TextEncoder().encode(content);

      const storageKey = await r2Storage.uploadAttachment({
        tenantId: "tenant-r2",
        dotId: "dot-r2-1",
        filename: "hello.txt",
        contentType: "text/plain",
        data,
      });

      expect(storageKey).toContain("tenant-r2/dot-r2-1/");

      const result = await r2Storage.getAttachment(storageKey);
      expect(result).not.toBeNull();
      expect(result!.contentType).toBe("text/plain");
      expect(result!.sizeBytes).toBe(data.byteLength);

      const text = new TextDecoder().decode(result!.data);
      expect(text).toBe(content);
    });

    it("handles binary data correctly", async () => {
      const binaryData = new Uint8Array([0, 1, 2, 255, 254, 128, 0]);

      const storageKey = await r2Storage.uploadAttachment({
        tenantId: "tenant-r2",
        dotId: "dot-r2-2",
        filename: "binary.bin",
        contentType: "application/octet-stream",
        data: binaryData,
      });

      const result = await r2Storage.getAttachment(storageKey);
      expect(result).not.toBeNull();
      const downloaded = new Uint8Array(result!.data);
      expect(downloaded).toEqual(binaryData);
    });
  });

  describe("upload → delete → download", () => {
    it("deletes a file so it is no longer retrievable", async () => {
      const data = new TextEncoder().encode("delete me");

      const storageKey = await r2Storage.uploadAttachment({
        tenantId: "tenant-r2",
        dotId: "dot-r2-3",
        filename: "to-delete.txt",
        contentType: "text/plain",
        data,
      });

      // Verify it exists
      const before = await r2Storage.getAttachment(storageKey);
      expect(before).not.toBeNull();

      // Delete
      await r2Storage.deleteAttachment(storageKey);

      // Verify it's gone
      const after = await r2Storage.getAttachment(storageKey);
      expect(after).toBeNull();
    });
  });

  describe("non-existent key", () => {
    it("returns null for a key that was never uploaded", async () => {
      const result = await r2Storage.getAttachment(
        "tenant-r2/dot-nope/uuid/nope.txt"
      );
      expect(result).toBeNull();
    });
  });

  describe("storage key isolation", () => {
    it("different tenants produce different keys for same filename", async () => {
      const data = new TextEncoder().encode("same content");

      const key1 = await r2Storage.uploadAttachment({
        tenantId: "tenant-alpha",
        dotId: "dot-same",
        filename: "file.txt",
        contentType: "text/plain",
        data,
      });

      const key2 = await r2Storage.uploadAttachment({
        tenantId: "tenant-beta",
        dotId: "dot-same",
        filename: "file.txt",
        contentType: "text/plain",
        data,
      });

      expect(key1).not.toBe(key2);
      expect(key1).toContain("tenant-alpha/");
      expect(key2).toContain("tenant-beta/");
    });
  });

  describe("large file", () => {
    it("handles a 1MB file", async () => {
      const size = 1024 * 1024;
      const data = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        data[i] = i % 256;
      }

      const storageKey = await r2Storage.uploadAttachment({
        tenantId: "tenant-r2",
        dotId: "dot-r2-large",
        filename: "large.bin",
        contentType: "application/octet-stream",
        data,
      });

      const result = await r2Storage.getAttachment(storageKey);
      expect(result).not.toBeNull();
      expect(result!.sizeBytes).toBe(size);
    });
  });
});
