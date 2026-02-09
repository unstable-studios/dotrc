/**
 * Structured JSON logger for Cloudflare Workers.
 *
 * Zero dependencies — uses console.log which Workers route to
 * Logpush/Tail Workers/dashboard. Each log entry is a single JSON line.
 */

export interface LogContext {
  requestId: string;
  method?: string;
  path?: string;
  tenantId?: string;
  userId?: string;
}

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
  requestId: string;
  method?: string;
  path?: string;
  tenantId?: string;
  userId?: string;
  data?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(extra: Partial<LogContext>): Logger;
}

function buildEntry(
  context: LogContext,
  level: LogEntry["level"],
  message: string,
  data?: Record<string, unknown>
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    requestId: context.requestId,
  };
  if (context.method) entry.method = context.method;
  if (context.path) entry.path = context.path;
  if (context.tenantId) entry.tenantId = context.tenantId;
  if (context.userId) entry.userId = context.userId;
  if (data && Object.keys(data).length > 0) entry.data = data;
  return entry;
}

export function createLogger(context: LogContext): Logger {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      console.log(JSON.stringify(buildEntry(context, "debug", message, data)));
    },
    info(message: string, data?: Record<string, unknown>) {
      console.log(JSON.stringify(buildEntry(context, "info", message, data)));
    },
    warn(message: string, data?: Record<string, unknown>) {
      console.log(JSON.stringify(buildEntry(context, "warn", message, data)));
    },
    error(message: string, data?: Record<string, unknown>) {
      console.log(JSON.stringify(buildEntry(context, "error", message, data)));
    },
    child(extra: Partial<LogContext>): Logger {
      return createLogger({ ...context, ...extra });
    },
  };
}
