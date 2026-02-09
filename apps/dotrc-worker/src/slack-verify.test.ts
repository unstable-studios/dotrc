import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifySlackSignature } from "./slack-verify";

const SIGNING_SECRET = "test-signing-secret-1234567890";

/**
 * Helper to compute a valid Slack signature for testing.
 */
async function computeSignature(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sigBasestring));
  return (
    "v0=" +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

describe("verifySlackSignature", () => {
  const realDateNow = Date.now;

  beforeEach(() => {
    // Fix time to a known value
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a valid signature", async () => {
    const timestamp = "1700000000";
    const body = '{"type":"url_verification","challenge":"abc"}';
    const signature = await computeSignature(SIGNING_SECRET, timestamp, body);

    const result = await verifySlackSignature(
      SIGNING_SECRET,
      signature,
      timestamp,
      body,
    );
    expect(result).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    const timestamp = "1700000000";
    const body = '{"type":"url_verification"}';

    const result = await verifySlackSignature(
      SIGNING_SECRET,
      "v0=0000000000000000000000000000000000000000000000000000000000000000",
      timestamp,
      body,
    );
    expect(result).toBe(false);
  });

  it("rejects a signature with wrong secret", async () => {
    const timestamp = "1700000000";
    const body = '{"type":"event_callback"}';
    const signature = await computeSignature("wrong-secret", timestamp, body);

    const result = await verifySlackSignature(
      SIGNING_SECRET,
      signature,
      timestamp,
      body,
    );
    expect(result).toBe(false);
  });

  it("rejects a timestamp too old (>5 minutes)", async () => {
    const oldTimestamp = String(1700000000 - 301); // 5 minutes + 1 second ago
    const body = '{"type":"event_callback"}';
    const signature = await computeSignature(SIGNING_SECRET, oldTimestamp, body);

    const result = await verifySlackSignature(
      SIGNING_SECRET,
      signature,
      oldTimestamp,
      body,
    );
    expect(result).toBe(false);
  });

  it("accepts a timestamp within 5 minutes", async () => {
    const recentTimestamp = String(1700000000 - 299); // 4:59 ago
    const body = '{"type":"event_callback"}';
    const signature = await computeSignature(SIGNING_SECRET, recentTimestamp, body);

    const result = await verifySlackSignature(
      SIGNING_SECRET,
      signature,
      recentTimestamp,
      body,
    );
    expect(result).toBe(true);
  });

  it("rejects non-numeric timestamp", async () => {
    const result = await verifySlackSignature(
      SIGNING_SECRET,
      "v0=abc",
      "not-a-number",
      "body",
    );
    expect(result).toBe(false);
  });

  it("rejects empty signature", async () => {
    const result = await verifySlackSignature(
      SIGNING_SECRET,
      "",
      "1700000000",
      "body",
    );
    expect(result).toBe(false);
  });
});
