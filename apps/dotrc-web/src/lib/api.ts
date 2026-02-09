import { DotrcClient } from "dotrc-sdk";

export function createClient(tenantId: string, userId: string): DotrcClient {
  return new DotrcClient({
    baseUrl: "/api",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": userId,
    },
  });
}
