import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateDotInput, PaginationOptions } from "dotrc-sdk";
import { createClient } from "@/lib/api";
import { useAuth } from "@/context/auth";

function useClient() {
  const { auth } = useAuth();
  if (!auth) throw new Error("Not authenticated");
  return createClient(auth.tenantId, auth.userId);
}

export function useListDots(options?: PaginationOptions) {
  const client = useClient();
  return useQuery({
    queryKey: ["dots", options],
    queryFn: () => client.listDots(options),
  });
}

export function useGetDot(dotId: string | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["dots", dotId],
    queryFn: () => client.getDot(dotId!),
    enabled: !!dotId,
  });
}

export function useCreateDot() {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDotInput) => client.createDot(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dots"] });
    },
  });
}
