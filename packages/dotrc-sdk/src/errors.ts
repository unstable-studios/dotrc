/** Error kind matching the dotrc API error codes. */
export type DotrcErrorKind =
  | "Validation"
  | "Authorization"
  | "Link"
  | "ServerError";

/** Structured error from the dotrc API. */
export class DotrcApiError extends Error {
  /** HTTP status code from the response. */
  readonly status: number;
  /** Machine-readable error code (e.g., "validation_failed", "not_found"). */
  readonly code: string;
  /** Human-readable error detail from the API. */
  readonly detail: string;
  /** Error kind when available (e.g., "Validation", "Authorization"). */
  readonly kind?: DotrcErrorKind;
  /** Request ID from x-request-id header, if present. */
  readonly requestId?: string;

  constructor(opts: {
    status: number;
    code: string;
    detail: string;
    kind?: DotrcErrorKind;
    requestId?: string;
  }) {
    super(`${opts.code}: ${opts.detail}`);
    this.name = "DotrcApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail;
    this.kind = opts.kind;
    this.requestId = opts.requestId;
  }
}

/** Error thrown when a network or fetch error occurs. */
export class DotrcNetworkError extends Error {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "DotrcNetworkError";
    this.cause = cause;
  }
}
