import type { Dot, VisibilityGrant, Link } from "./types";
import type { EmbeddedStorage } from "./types";

/** In-memory storage adapter for testing and SSR. */
export class MemoryStorage implements EmbeddedStorage {
  private dots = new Map<string, Dot>();
  private grants: VisibilityGrant[] = [];
  private links: Link[] = [];

  private key(tenantId: string, dotId: string): string {
    return `${tenantId}:${dotId}`;
  }

  async storeDot(
    dot: Dot,
    grants: VisibilityGrant[],
    links: Link[],
  ): Promise<void> {
    this.dots.set(this.key(dot.tenant_id, dot.id), dot);
    this.grants.push(...grants);
    this.links.push(...links);
  }

  async getDot(tenantId: string, dotId: string): Promise<Dot | null> {
    return this.dots.get(this.key(tenantId, dotId)) ?? null;
  }

  async getGrants(
    tenantId: string,
    dotId: string,
  ): Promise<VisibilityGrant[]> {
    // Filter grants for dots that belong to this tenant
    const dot = this.dots.get(this.key(tenantId, dotId));
    if (!dot) return [];
    return this.grants.filter((g) => g.dot_id === dotId);
  }

  async listDots(
    tenantId: string,
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ dots: Dot[]; total: number; hasMore: boolean }> {
    // Get all dots in this tenant visible to the user
    const visibleDots: Dot[] = [];

    for (const dot of this.dots.values()) {
      if (dot.tenant_id !== tenantId) continue;

      // User can see dots they created or have grants for
      if (dot.created_by === userId) {
        visibleDots.push(dot);
        continue;
      }

      const hasGrant = this.grants.some(
        (g) => g.dot_id === dot.id && g.user_id === userId,
      );
      if (hasGrant) {
        visibleDots.push(dot);
      }
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
    this.grants.push(...grants);
  }

  async storeLink(link: Link): Promise<void> {
    this.links.push(link);
  }

  async getLinks(tenantId: string, dotId: string): Promise<Link[]> {
    // Only return links where at least one dot belongs to this tenant
    return this.links.filter((l) => {
      const fromDot = this.dots.get(this.key(tenantId, l.from_dot_id));
      const toDot = this.dots.get(this.key(tenantId, l.to_dot_id));
      return (
        (fromDot || toDot) &&
        (l.from_dot_id === dotId || l.to_dot_id === dotId)
      );
    });
  }

  async close(): Promise<void> {
    this.dots.clear();
    this.grants = [];
    this.links = [];
  }
}
