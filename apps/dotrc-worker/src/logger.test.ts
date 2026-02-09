import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "./logger";
import type { LogEntry } from "./logger";

describe("createLogger", () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(msg);
    });
  });

  function lastEntry(): LogEntry {
    return JSON.parse(logs[logs.length - 1]);
  }

  it("logs info with all context fields", () => {
    const logger = createLogger({
      requestId: "req-1",
      method: "GET",
      path: "/dots",
      tenantId: "t-1",
      userId: "u-1",
    });

    logger.info("request.start");
    const entry = lastEntry();

    expect(entry.level).toBe("info");
    expect(entry.message).toBe("request.start");
    expect(entry.requestId).toBe("req-1");
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/dots");
    expect(entry.tenantId).toBe("t-1");
    expect(entry.userId).toBe("u-1");
    expect(entry.timestamp).toBeTruthy();
  });

  it("logs all four levels", () => {
    const logger = createLogger({ requestId: "req-2" });

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(logs).toHaveLength(4);
    expect(JSON.parse(logs[0]).level).toBe("debug");
    expect(JSON.parse(logs[1]).level).toBe("info");
    expect(JSON.parse(logs[2]).level).toBe("warn");
    expect(JSON.parse(logs[3]).level).toBe("error");
  });

  it("includes data when provided", () => {
    const logger = createLogger({ requestId: "req-3" });
    logger.info("request.complete", { status: 200, durationMs: 42 });

    const entry = lastEntry();
    expect(entry.data).toEqual({ status: 200, durationMs: 42 });
  });

  it("omits data when not provided", () => {
    const logger = createLogger({ requestId: "req-4" });
    logger.info("no data");

    const entry = lastEntry();
    expect(entry.data).toBeUndefined();
  });

  it("omits optional context fields when not set", () => {
    const logger = createLogger({ requestId: "req-5" });
    logger.info("minimal");

    const entry = lastEntry();
    expect(entry.method).toBeUndefined();
    expect(entry.path).toBeUndefined();
    expect(entry.tenantId).toBeUndefined();
    expect(entry.userId).toBeUndefined();
  });

  it("child inherits parent context and adds extra fields", () => {
    const parent = createLogger({ requestId: "req-6", method: "POST" });
    const child = parent.child({ tenantId: "t-child", userId: "u-child" });

    child.info("child log");

    const entry = lastEntry();
    expect(entry.requestId).toBe("req-6");
    expect(entry.method).toBe("POST");
    expect(entry.tenantId).toBe("t-child");
    expect(entry.userId).toBe("u-child");
  });

  it("produces valid JSON on each call", () => {
    const logger = createLogger({ requestId: "req-7" });
    logger.info("test", { nested: { a: 1 } });
    logger.error("err", { stack: "Error at line 1" });

    for (const log of logs) {
      expect(() => JSON.parse(log)).not.toThrow();
    }
  });
});
