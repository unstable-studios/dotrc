import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { GrantAccessInput } from "dotrc-sdk";
import { createClient } from "@/lib/api";
import { useAuth } from "@/context/auth";

function useClient() {
  const { auth } = useAuth();
  if (!auth) throw new Error("Not authenticated");
  return createClient(auth.tenantId, auth.userId);
}

export function useGetGrants(dotId: string | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["grants", dotId],
    queryFn: () => client.getGrants(dotId!),
    enabled: !!dotId,
  });
}

export function useGrantAccess(dotId: string) {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GrantAccessInput) => client.grantAccess(dotId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants", dotId] });
    },
  });
}
