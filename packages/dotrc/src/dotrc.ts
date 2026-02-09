import { DotrcCore } from "./core";
import type { DotrcWasm } from "./core";
import { MemoryStorage } from "./storage-memory";
import type {
  Dot,
  DotId,
  CreateDotInput,
  CreateDotResponse,
  CreateLinkInput,
  CreateLinkResponse,
  GrantAccessInput,
  GrantAccessResponse,
  ListDotsResponse,
  ListGrantsResponse,
  ListLinksResponse,
  PaginationOptions,
  DotrcConfig,
  EmbeddedStorage,
  DotDraft,
  AuthContext,
  LinkType,
} from "./types";
import { DotrcError } from "./types";

/**
 * Embedded DotRC client that runs entirely in the browser.
 *
 * Uses the WASM core for validation/policy and a pluggable storage
 * adapter (IndexedDB or in-memory) for persistence.
 *
 * API mirrors `DotrcClient` from `dotrc-sdk` so apps can swap
 * between local and remote modes.
 */
export class Dotrc {
  private core: DotrcCore;
  private storage: EmbeddedStorage;
  private tenantId: string;
  private userId: string;
  private scopeMemberships: string[];

  private constructor(
    core: DotrcCore,
    storage: EmbeddedStorage,
    config: DotrcConfig,
  ) {
    this.core = core;
    this.storage = storage;
    this.tenantId = config.tenant;
    this.userId = config.user;
    this.scopeMemberships = config.scopeMemberships ?? [];
  }

  /**
   * Open an embedded DotRC instance.
   *
   * @param config - Tenant, user, and optional storage adapter
   * @param wasm - WASM module exports (pass the imported WASM module)
   * @returns Configured Dotrc instance
   */
  static open(config: DotrcConfig, wasm: DotrcWasm): Dotrc {
    const core = new DotrcCore(wasm);
    const storage = config.storage ?? new MemoryStorage();
    return new Dotrc(core, storage, config);
  }

  /** Get the WASM core version. */
  version(): string {
    return this.core.version();
  }

  /** Create a new dot. */
  async createDot(input: CreateDotInput): Promise<CreateDotResponse> {
    const timestamp = new Date().toISOString();
    const dotId = crypto.randomUUID();

    const draft: DotDraft = {
      title: input.title,
      body: input.body,
      created_by: this.userId,
      tenant_id: this.tenantId,
      scope_id: input.scope_id,
      tags: input.tags ?? [],
      visible_to_users: input.visible_to_users ?? [this.userId],
      visible_to_scopes: input.visible_to_scopes ?? [],
      attachments: [],
    };

    const result = this.core.createDot(draft, timestamp, dotId);

    await this.storage.storeDot(result.dot, result.grants, result.links);

    return {
      dot_id: result.dot.id,
      created_at: result.dot.created_at,
      grants_count: result.grants.length,
      links_count: result.links.length,
    };
  }

  /** Retrieve a specific dot by ID. Returns null if not found or not visible. */
  async getDot(dotId: DotId): Promise<Dot | null> {
    const dot = await this.storage.getDot(this.tenantId, dotId);
    if (!dot) return null;

    // Check visibility
    const grants = await this.storage.getGrants(this.tenantId, dotId);
    const canView =
      dot.created_by === this.userId ||
      grants.some((g) => g.user_id === this.userId);

    if (!canView) return null;

    return dot;
  }

  /** List dots visible to the current user. */
  async listDots(options?: PaginationOptions): Promise<ListDotsResponse> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const result = await this.storage.listDots(
      this.tenantId,
      this.userId,
      limit,
      offset,
    );

    return {
      dots: result.dots,
      total: result.total,
      has_more: result.hasMore,
      limit,
      offset,
    };
  }

  /** Grant access to a dot. */
  async grantAccess(
    dotId: DotId,
    input: GrantAccessInput,
  ): Promise<GrantAccessResponse> {
    const dot = await this.storage.getDot(this.tenantId, dotId);
    if (!dot) {
      throw new DotrcError("Validation", "Dot not found");
    }

    const existingGrants = await this.storage.getGrants(this.tenantId, dotId);
    const context: AuthContext = {
      requesting_user: this.userId,
      user_scope_memberships: this.scopeMemberships,
    };

    const timestamp = new Date().toISOString();
    const result = this.core.grantAccess(
      dot,
      existingGrants,
      input.user_ids ?? [],
      input.scope_ids ?? [],
      context,
      timestamp,
    );

    await this.storage.storeGrants(result.grants);

    return {
      grants: result.grants,
      grants_count: result.grants.length,
    };
  }

  /** List grants for a dot. */
  async getGrants(dotId: DotId): Promise<ListGrantsResponse> {
    const dot = await this.storage.getDot(this.tenantId, dotId);
    if (!dot) {
      throw new DotrcError("Validation", "Dot not found");
    }

    const grants = await this.storage.getGrants(this.tenantId, dotId);
    return { grants };
  }

  /** Create a link from one dot to another. */
  async createLink(
    fromDotId: DotId,
    input: CreateLinkInput,
  ): Promise<CreateLinkResponse> {
    const fromDot = await this.storage.getDot(this.tenantId, fromDotId);
    if (!fromDot) {
      throw new DotrcError("Validation", "Source dot not found");
    }

    const toDot = await this.storage.getDot(this.tenantId, input.to_dot_id);
    if (!toDot) {
      throw new DotrcError("Validation", "Target dot not found");
    }

    const fromGrants = await this.storage.getGrants(this.tenantId, fromDotId);
    const toGrants = await this.storage.getGrants(
      this.tenantId,
      input.to_dot_id,
    );
    const existingLinks = await this.storage.getLinks(
      this.tenantId,
      fromDotId,
    );

    const context: AuthContext = {
      requesting_user: this.userId,
      user_scope_memberships: this.scopeMemberships,
    };

    const timestamp = new Date().toISOString();
    const result = this.core.createLink(
      fromDot,
      toDot,
      input.link_type as LinkType,
      { from: fromGrants, to: toGrants },
      existingLinks,
      context,
      timestamp,
    );

    await this.storage.storeLink(result.link, this.tenantId);

    return { link: result.link };
  }

  /** List links for a dot. */
  async getLinks(dotId: DotId): Promise<ListLinksResponse> {
    const links = await this.storage.getLinks(this.tenantId, dotId);
    return { links };
  }

  /** Close the storage connection. */
  async close(): Promise<void> {
    await this.storage.close();
  }
}
