// WASM client wrapper with type-safe interface — adapted from apps/dotrc-worker/src/core.ts

import type {
  AuthContext,
  CreateDotOutput,
  CreateLinkOutput,
  DotDraft,
  GrantAccessOutput,
  LinkGrants,
  WasmResult,
} from "./types";
import { unwrapWasmResult } from "./types";
import type { Dot, LinkType, VisibilityGrant, Link } from "./types";

export interface DotrcWasm {
  core_version(): string;
  wasm_create_dot(draftJson: string, now: string, dotId: string): string;
  wasm_grant_access(
    dotJson: string,
    existingGrantsJson: string,
    targetUsersJson: string,
    targetScopesJson: string,
    contextJson: string,
    now: string,
  ): string;
  wasm_create_link(
    fromDotJson: string,
    toDotJson: string,
    linkType: string,
    grantsJson: string,
    existingLinksJson: string,
    contextJson: string,
    now: string,
  ): string;
  wasm_can_view_dot(
    dotJson: string,
    grantsJson: string,
    contextJson: string,
  ): string;
  wasm_filter_visible_dots(
    dotsJson: string,
    grantsJson: string,
    contextJson: string,
  ): string;
}

export class DotrcCore {
  constructor(private wasm: DotrcWasm) {}

  version(): string {
    return this.wasm.core_version();
  }

  createDot(draft: DotDraft, now: string, dotId: string): CreateDotOutput {
    const resultJson = this.wasm.wasm_create_dot(
      JSON.stringify(draft),
      now,
      dotId,
    );
    const result: WasmResult<CreateDotOutput> = JSON.parse(resultJson);
    return unwrapWasmResult(result);
  }

  grantAccess(
    dot: Dot,
    existingGrants: VisibilityGrant[],
    targetUsers: string[],
    targetScopes: string[],
    context: AuthContext,
    now: string,
  ): GrantAccessOutput {
    const resultJson = this.wasm.wasm_grant_access(
      JSON.stringify(dot),
      JSON.stringify(existingGrants),
      JSON.stringify(targetUsers),
      JSON.stringify(targetScopes),
      JSON.stringify(context),
      now,
    );
    const result: WasmResult<GrantAccessOutput> = JSON.parse(resultJson);
    return unwrapWasmResult(result);
  }

  createLink(
    fromDot: Dot,
    toDot: Dot,
    linkType: LinkType,
    grants: LinkGrants,
    existingLinks: Link[],
    context: AuthContext,
    now: string,
  ): CreateLinkOutput {
    const resultJson = this.wasm.wasm_create_link(
      JSON.stringify(fromDot),
      JSON.stringify(toDot),
      linkType,
      JSON.stringify(grants),
      JSON.stringify(existingLinks),
      JSON.stringify(context),
      now,
    );
    const result: WasmResult<CreateLinkOutput> = JSON.parse(resultJson);
    return unwrapWasmResult(result);
  }

  canViewDot(
    dot: Dot,
    grants: VisibilityGrant[],
    context: AuthContext,
  ): boolean {
    const resultJson = this.wasm.wasm_can_view_dot(
      JSON.stringify(dot),
      JSON.stringify(grants),
      JSON.stringify(context),
    );
    const result: WasmResult<{ can_view: boolean }> = JSON.parse(resultJson);
    return unwrapWasmResult(result).can_view;
  }

  filterVisibleDots(
    dots: Dot[],
    grants: VisibilityGrant[],
    context: AuthContext,
  ): Dot[] {
    const resultJson = this.wasm.wasm_filter_visible_dots(
      JSON.stringify(dots),
      JSON.stringify(grants),
      JSON.stringify(context),
    );
    const result: WasmResult<{ dots: Dot[] }> = JSON.parse(resultJson);
    return unwrapWasmResult(result).dots;
  }
}
