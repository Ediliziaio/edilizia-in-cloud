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
    // Le assegnazioni cambiano quando l'ufficio assegna qualcuno: non ogni minuto. Ogni rilettura sono 4-7
    // richieste, e il telefono le rifaceva a ogni minuto (e a ogni ritorno da Maps o da una chiamata).
    staleTime: 120_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
}
