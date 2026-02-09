import { openDB, type IDBPDatabase } from "idb";
import type { Dot, VisibilityGrant, Link, Tag } from "./types";
import type { EmbeddedStorage } from "./types";

const DB_NAME = "dotrc";
const DB_VERSION = 1;

interface DotRow {
  id: string;
  tenant_id: string;
  title: string;
  body?: string;
  created_by: string;
  created_at: string;
  scope_id?: string;
}

interface TagRow {
  dot_id: string;
  tag: string;
}

interface GrantRow {
  dot_id: string;
  user_id?: string;
  scope_id?: string;
  granted_at: string;
  granted_by?: string;
}

interface LinkRow {
  from_dot_id: string;
  to_dot_id: string;
  link_type: string;
  tenant_id: string;
  created_at: string;
}

interface DotrcDB {
  dots: {
    key: string;
    value: DotRow;
    indexes: { by_tenant_created: [string, string] };
  };
  tags: {
    key: [string, string];
    value: TagRow;
    indexes: { by_dot_id: string };
  };
  grants: {
    key: number;
    value: GrantRow;
    indexes: { by_dot_id: string; by_user_id: string };
  };
  links: {
    key: [string, string, string];
    value: LinkRow;
    indexes: { by_from_dot_id: string; by_to_dot_id: string };
  };
}

/** IndexedDB storage adapter for browser environments. */
export class IndexedDBStorage implements EmbeddedStorage {
  private db: IDBPDatabase<DotrcDB> | null = null;
  private dbName: string;

  constructor(dbName: string = DB_NAME) {
    this.dbName = dbName;
  }

  private async getDB(): Promise<IDBPDatabase<DotrcDB>> {
    if (this.db) return this.db;

    this.db = await openDB<DotrcDB>(this.dbName, DB_VERSION, {
      upgrade(db) {
        // Dots store
        const dotsStore = db.createObjectStore("dots", { keyPath: "id" });
        dotsStore.createIndex("by_tenant_created", [
          "tenant_id",
          "created_at",
        ]);

        // Tags store
        const tagsStore = db.createObjectStore("tags", {
          keyPath: ["dot_id", "tag"],
        });
        tagsStore.createIndex("by_dot_id", "dot_id");

        // Grants store
        const grantsStore = db.createObjectStore("grants", {
          autoIncrement: true,
        });
        grantsStore.createIndex("by_dot_id", "dot_id");
        grantsStore.createIndex("by_user_id", "user_id");

        // Links store
        const linksStore = db.createObjectStore("links", {
          keyPath: ["from_dot_id", "to_dot_id", "link_type"],
        });
        linksStore.createIndex("by_from_dot_id", "from_dot_id");
        linksStore.createIndex("by_to_dot_id", "to_dot_id");
      },
    });

    return this.db;
  }

  async storeDot(
    dot: Dot,
    grants: VisibilityGrant[],
    links: Link[],
  ): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(["dots", "tags", "grants", "links"], "readwrite");

    // Store dot (without tags/attachments — those are stored separately)
    const dotRow: DotRow = {
      id: dot.id,
      tenant_id: dot.tenant_id,
      title: dot.title,
      body: dot.body,
      created_by: dot.created_by,
      created_at: dot.created_at,
      scope_id: dot.scope_id,
    };
    tx.objectStore("dots").put(dotRow);

    // Store tags
    for (const tag of dot.tags) {
      tx.objectStore("tags").put({ dot_id: dot.id, tag });
    }

    // Store grants
    for (const grant of grants) {
      tx.objectStore("grants").put({
        dot_id: grant.dot_id,
        user_id: grant.user_id,
        scope_id: grant.scope_id,
        granted_at: grant.granted_at,
        granted_by: grant.granted_by,
      });
    }

    // Store links
    for (const link of links) {
      tx.objectStore("links").put({
        from_dot_id: link.from_dot_id,
        to_dot_id: link.to_dot_id,
        link_type: link.link_type,
        tenant_id: dot.tenant_id,
        created_at: link.created_at,
      });
    }

    await tx.done;
  }

  async getDot(tenantId: string, dotId: string): Promise<Dot | null> {
    const db = await this.getDB();
    const dotRow = await db.get("dots", dotId);

    if (!dotRow || dotRow.tenant_id !== tenantId) return null;

    // Get tags
    const tagRows = await db.getAllFromIndex("tags", "by_dot_id", dotId);
    const tags: Tag[] = tagRows.map((r) => r.tag);

    return {
      id: dotRow.id,
      tenant_id: dotRow.tenant_id,
      title: dotRow.title,
      body: dotRow.body,
      created_by: dotRow.created_by,
      created_at: dotRow.created_at,
      scope_id: dotRow.scope_id,
      tags,
      attachments: [], // TODO: attachment support
    };
  }

  async getGrants(
    tenantId: string,
    dotId: string,
  ): Promise<VisibilityGrant[]> {
    const db = await this.getDB();
    const grantRows = await db.getAllFromIndex("grants", "by_dot_id", dotId);

    // Verify the dot belongs to this tenant
    const dot = await db.get("dots", dotId);
    if (!dot || dot.tenant_id !== tenantId) return [];

    return grantRows.map((r) => ({
      dot_id: r.dot_id,
      user_id: r.user_id,
      scope_id: r.scope_id,
      granted_at: r.granted_at,
      granted_by: r.granted_by,
    }));
  }

  async listDots(
    tenantId: string,
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ dots: Dot[]; total: number; hasMore: boolean }> {
    const db = await this.getDB();

    // Get all grants for this user to determine visible dots
    const userGrants = await db.getAllFromIndex(
      "grants",
      "by_user_id",
      userId,
    );
    const grantedDotIds = new Set(userGrants.map((g) => g.dot_id));

    // Get all dots in this tenant
    const allDots = await db.getAll("dots");
    const visibleDots: Dot[] = [];

    for (const dotRow of allDots) {
      if (dotRow.tenant_id !== tenantId) continue;
      if (
        dotRow.created_by !== userId &&
        !grantedDotIds.has(dotRow.id)
      ) {
        continue;
      }

      const tagRows = await db.getAllFromIndex("tags", "by_dot_id", dotRow.id);
      visibleDots.push({
        id: dotRow.id,
        tenant_id: dotRow.tenant_id,
        title: dotRow.title,
        body: dotRow.body,
        created_by: dotRow.created_by,
        created_at: dotRow.created_at,
        scope_id: dotRow.scope_id,
        tags: tagRows.map((r) => r.tag),
        attachments: [],
      });
    }

    // Sort by created_at descending
    visibleDots.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const total = visibleDots.length;
    const sliced = visibleDots.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return { dots: sliced, total, hasMore };
  }

  async storeGrants(grants: VisibilityGrant[]): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction("grants", "readwrite");

    for (const grant of grants) {
      tx.store.put({
        dot_id: grant.dot_id,
        user_id: grant.user_id,
        scope_id: grant.scope_id,
        granted_at: grant.granted_at,
        granted_by: grant.granted_by,
      });
    }

    await tx.done;
  }

  async storeLink(link: Link, tenantId: string): Promise<void> {
    const db = await this.getDB();
    await db.put("links", {
      from_dot_id: link.from_dot_id,
      to_dot_id: link.to_dot_id,
      link_type: link.link_type,
      tenant_id: tenantId,
      created_at: link.created_at,
    });
  }

  async getLinks(tenantId: string, dotId: string): Promise<Link[]> {
    const db = await this.getDB();

    const fromLinks = await db.getAllFromIndex(
      "links",
      "by_from_dot_id",
      dotId,
    );
    const toLinks = await db.getAllFromIndex("links", "by_to_dot_id", dotId);

    // Merge and deduplicate
    const seen = new Set<string>();
    const result: Link[] = [];

    for (const row of [...fromLinks, ...toLinks]) {
      if (row.tenant_id !== tenantId) continue;
      const key = `${row.from_dot_id}:${row.to_dot_id}:${row.link_type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        from_dot_id: row.from_dot_id,
        to_dot_id: row.to_dot_id,
        link_type: row.link_type as Link["link_type"],
        created_at: row.created_at,
      });
    }

    return result;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
