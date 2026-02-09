/**
 * Slack request signature verification.
 *
 * Verifies that incoming requests are authentically from Slack
 * using HMAC-SHA256 signature verification per the Slack Events API spec.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */

const SLACK_SIGNATURE_VERSION = "v0";
const MAX_TIMESTAMP_DRIFT_SECONDS = 60 * 5; // 5 minutes

/**
 * Verify that a request came from Slack using HMAC-SHA256 signature.
 *
 * @param signingSecret - Slack app signing secret
 * @param signature - Value of x-slack-signature header
 * @param timestamp - Value of x-slack-request-timestamp header
 * @param body - Raw request body string
 * @returns true if the signature is valid
 */
export async function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  // Reject if timestamp is too old (replay attack prevention)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_TIMESTAMP_DRIFT_SECONDS) {
    return false;
  }

  // Compute HMAC-SHA256 signature
  const sigBasestring = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sigBasestring));
  const computed =
    SLACK_SIGNATURE_VERSION +
    "=" +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Constant-time comparison
  return timingSafeEqual(computed, signature);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
