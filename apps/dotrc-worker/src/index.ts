type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

// Minimal D1 typings to avoid external deps
interface D1Result<T = unknown> {
  success: boolean;
  error?: string;
  results?: T[];
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB: D1Database;
}

function json(
  status: number,
  body: JsonValue,
  headers: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

async function readJson(request: Request): Promise<JsonValue> {
  const text = await request.text();
  if (!text) return null;
  return JSON.parse(text) as JsonValue;
}

function parsePath(url: URL): string[] {
  const cleaned = url.pathname.replace(/\/+$/, "");
  return cleaned.split("/").filter(Boolean);
}

async function insertDot(env: Env, tenant: string, payload: JsonObject) {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const stmt = env.DB.prepare(
    "INSERT INTO dots (id, tenant, body, created_at) VALUES (?1, ?2, ?3, ?4)"
  ).bind(id, tenant, JSON.stringify(payload), createdAt);

  const result = await stmt.run();
  if (!result.success) {
    throw new Error(result.error || "failed to insert dot");
  }

  return { id, tenant, created_at: createdAt };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const segments = parsePath(url);

    // Health
    if (request.method === "GET" && segments.length === 0) {
      return json(200, { status: "ok", service: "dotrc-worker" });
    }

    // POST /dots
    if (
      request.method === "POST" &&
      segments.length === 1 &&
      segments[0] === "dots"
    ) {
      let body: JsonValue;
      try {
        body = await readJson(request);
      } catch (err) {
        return json(400, {
          error: "invalid_json",
          detail: (err as Error).message,
        });
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(400, {
          error: "invalid_body",
          detail: "Expected JSON object",
        });
      }

      const payload = body as Record<string, JsonValue>;
      const tenant = payload["tenant"];
      if (typeof tenant !== "string" || tenant.trim() === "") {
        return json(400, {
          error: "missing_tenant",
          detail: "Provide tenant as non-empty string",
        });
      }

      // TODO: integrate dotrc-core-wasm for validation/policy
      try {
        const dot = await insertDot(env, tenant, payload);
        return json(202, { status: "accepted", dot });
      } catch (err) {
        return json(500, {
          error: "storage_error",
          detail: (err as Error).message,
        });
      }
    }

    return json(404, { error: "not_found", path: url.pathname });
  },
};
