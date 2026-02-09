import { DotrcApiError, DotrcNetworkError } from "./errors";
import type {
  DotrcClientConfig,
  Dot,
  DotId,
  CreateDotInput,
  CreateDotResponse,
  ListDotsResponse,
  PaginationOptions,
  GrantAccessInput,
  GrantAccessResponse,
  ListGrantsResponse,
  CreateLinkInput,
  CreateLinkResponse,
  ListLinksResponse,
  UploadAttachmentResponse,
  BatchDotsResponse,
  BatchGrantInput,
  BatchGrantsResponse,
  HealthResponse,
} from "./types";

/** Type-safe client for the dotrc HTTP API. */
export class DotrcClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly customHeaders: Record<string, string>;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: DotrcClientConfig) {
    // Strip trailing slash for consistent URL joining
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.customHeaders = config.headers ?? {};
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Check API health. */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/");
  }

  /** Create a new dot. */
  async createDot(input: CreateDotInput): Promise<CreateDotResponse> {
    return this.request<CreateDotResponse>("POST", "/dots", input);
  }

  /** Retrieve a specific dot by ID. Returns null if not found. */
  async getDot(dotId: DotId): Promise<Dot | null> {
    try {
      return await this.request<Dot>("GET", `/dots/${encodeURIComponent(dotId)}`);
    } catch (err) {
      if (err instanceof DotrcApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /** List dots visible to the authenticated user. */
  async listDots(options?: PaginationOptions): Promise<ListDotsResponse> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.offset !== undefined) params.set("offset", String(options.offset));
    const query = params.toString();
    const path = query ? `/dots?${query}` : "/dots";
    return this.request<ListDotsResponse>("GET", path);
  }

  /** Grant access to a dot. */
  async grantAccess(
    dotId: DotId,
    input: GrantAccessInput,
  ): Promise<GrantAccessResponse> {
    return this.request<GrantAccessResponse>(
      "POST",
      `/dots/${encodeURIComponent(dotId)}/grants`,
      input,
    );
  }

  /** List grants for a dot. */
  async getGrants(dotId: DotId): Promise<ListGrantsResponse> {
    return this.request<ListGrantsResponse>(
      "GET",
      `/dots/${encodeURIComponent(dotId)}/grants`,
    );
  }

  /** Create a link from one dot to another. */
  async createLink(
    fromDotId: DotId,
    input: CreateLinkInput,
  ): Promise<CreateLinkResponse> {
    return this.request<CreateLinkResponse>(
      "POST",
      `/dots/${encodeURIComponent(fromDotId)}/links`,
      input,
    );
  }

  /** List links for a dot. */
  async getLinks(dotId: DotId): Promise<ListLinksResponse> {
    return this.request<ListLinksResponse>(
      "GET",
      `/dots/${encodeURIComponent(dotId)}/links`,
    );
  }

  /** Upload an attachment to a dot. Accepts File, Blob, or {name, data, type}. */
  async uploadAttachment(
    dotId: DotId,
    file: File | Blob | { name: string; data: Blob; type?: string },
  ): Promise<UploadAttachmentResponse> {
    const formData = new FormData();

    if (file instanceof Blob && "name" in file) {
      // File object (has name)
      formData.append("file", file);
    } else if (file instanceof Blob) {
      // Plain Blob — use a default filename
      formData.append("file", file, "upload");
    } else {
      // { name, data, type } object
      const blob = file.type
        ? new Blob([await file.data.arrayBuffer()], { type: file.type })
        : file.data;
      formData.append("file", blob, file.name);
    }

    const url = `${this.baseUrl}/dots/${encodeURIComponent(dotId)}/attachments`;
    const headers: Record<string, string> = {
      ...this.customHeaders,
    };
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }
    // Do NOT set content-type — let fetch set the multipart boundary

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers,
        body: formData,
      });
    } catch (err) {
      throw new DotrcNetworkError(
        `Failed to upload attachment: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    }

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return (await response.json()) as UploadAttachmentResponse;
  }

  /** Download an attachment. Returns the raw Response for streaming. */
  async getAttachment(attachmentId: string): Promise<Response> {
    const url = `${this.baseUrl}/attachments/${encodeURIComponent(attachmentId)}`;
    const headers: Record<string, string> = {
      ...this.customHeaders,
    };
    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, { method: "GET", headers });
    } catch (err) {
      throw new DotrcNetworkError(
        `Failed to download attachment: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    }

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return response;
  }

  /** Create multiple dots in a single batch request. */
  async batchCreateDots(
    inputs: CreateDotInput[],
  ): Promise<BatchDotsResponse> {
    return this.request<BatchDotsResponse>("POST", "/batch/dots", inputs);
  }

  /** Grant access to multiple dots in a single batch request. */
  async batchGrantAccess(
    inputs: BatchGrantInput[],
  ): Promise<BatchGrantsResponse> {
    return this.request<BatchGrantsResponse>("POST", "/batch/grants", inputs);
  }

  /**
   * Internal: make a JSON request to the API.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      accept: "application/json",
      ...this.customHeaders,
    };

    if (this.token) {
      headers["authorization"] = `Bearer ${this.token}`;
    }

    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new DotrcNetworkError(
        `Request failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    }

    if (!response.ok) {
      await this.throwApiError(response);
    }

    return (await response.json()) as T;
  }

  /** Parse an error response and throw DotrcApiError. */
  private async throwApiError(response: Response): Promise<never> {
    const requestId = response.headers.get("x-request-id") ?? undefined;
    let body: Record<string, unknown>;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new DotrcApiError({
        status: response.status,
        code: "unknown_error",
        detail: response.statusText || "Unknown error",
        requestId,
      });
    }

    throw new DotrcApiError({
      status: response.status,
      code: typeof body.error === "string" ? body.error : "unknown_error",
      detail: typeof body.detail === "string" ? body.detail : "Unknown error",
      kind:
        typeof body.kind === "string"
          ? (body.kind as DotrcApiError["kind"])
          : undefined,
      requestId,
    });
  }
}
