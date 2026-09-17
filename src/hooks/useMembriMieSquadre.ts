/**
 * I membri delle squadre di cui l'utente è responsabile (Impostazioni → Team),
 * nell'azienda su cui lavora.
 *
 * Con «Solo i propri» il responsabile vede e lavora anche quello che è assegnato
 * ai membri: lo decide la RLS (`membri_mie_squadre()` nelle policy e in
 * `check_staff_visibility`). Qui serve per offrire i membri nelle scelte, per
 * esempio a chi assegnare un appuntamento.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useMembriMieSquadre(abilitato = true) {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  return useQuery({
    queryKey: ["membri-mie-squadre", user?.id, companyId],
    enabled: abilitato && !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("membri_mie_squadre" as never);
      if (error) throw error;
      return (data as string[] | null) ?? [];
    },
  });
}
