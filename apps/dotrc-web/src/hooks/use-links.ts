import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateLinkInput } from "dotrc-sdk";
import { createClient } from "@/lib/api";
import { useAuth } from "@/context/auth";

function useClient() {
  const { auth } = useAuth();
  if (!auth) throw new Error("Not authenticated");
  return createClient(auth.tenantId, auth.userId);
}

export function useGetLinks(dotId: string | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["links", dotId],
    queryFn: () => client.getLinks(dotId!),
    enabled: !!dotId,
  });
}

export function useCreateLink(fromDotId: string) {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLinkInput) =>
      client.createLink(fromDotId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links", fromDotId] });
    },
  });
}
