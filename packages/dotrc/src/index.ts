export { Dotrc } from "./dotrc";
export { MemoryStorage } from "./storage-memory";
export { IndexedDBStorage } from "./storage-indexeddb";
export { DotrcError } from "./types";
export type { DotrcErrorKind, DotrcConfig, EmbeddedStorage } from "./types";
export type { DotrcWasm } from "./core";

// Re-export domain types from dotrc-sdk
export type {
  Timestamp,
  TenantId,
  UserId,
  ScopeId,
  DotId,
  Tag,
  LinkType,
  Dot,
  CreateDotInput,
  CreateDotResponse,
  AttachmentRef,
  VisibilityGrant,
  GrantAccessInput,
  GrantAccessResponse,
  Link,
  CreateLinkInput,
  CreateLinkResponse,
  ListDotsResponse,
  PaginationOptions,
  ListGrantsResponse,
  ListLinksResponse,
} from "./types";
