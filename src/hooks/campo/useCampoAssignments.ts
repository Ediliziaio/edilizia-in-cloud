import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { loadCampoAssignments } from "@/lib/campo/assignments";

/** Shared read model, keyed by both tenant and user. */
export function useCampoAssignments() {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["campo-assignments", profile?.company_id, user?.id],
    enabled: !!user?.id && !!profile?.company_id,
    queryFn: () => loadCampoAssignments(user!.id, profile!.company_id!),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
