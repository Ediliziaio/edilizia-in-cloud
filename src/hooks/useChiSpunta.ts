// src/hooks/useChiSpunta.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioModello } from "@/hooks/useModelliFasi";
import { chiSpuntaValido, type ChiSpunta } from "@/lib/orders/chiSpunta";

// La colonna non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaveChiSpunta = (companyId: string | undefined) => ["chi-spunta-fasi", companyId] as const;

/** Chi può spuntare le sottofasi. Senza scelta (o se la lettura fallisce): chiunque lavori sulla commessa, come oggi. */
export function useChiSpunta() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiaveChiSpunta(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<ChiSpunta> => {
      try {
        const { data, error } = await db.from("company_fasi_settings").select("chi_spunta").eq("company_id", companyId!).maybeSingle();
        if (error) throw error;
        return chiSpuntaValido(data?.chi_spunta);
      } catch {
        return "tutti";
      }
    },
  });

  const salva = useMutation({
    mutationFn: async (chiSpunta: ChiSpunta) => {
      const { error } = await db.rpc("fasi_impostazioni_salva", { p_company_id: companyId, p_valori: { chi_spunta: chiSpunta } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto: vale da subito, anche per chi ha l'app aperta");
      void qc.invalidateQueries({ queryKey: chiaveChiSpunta(companyId) });
    },
    onError: (e) => toast.error(messaggioModello(e, "queste impostazioni")),
  });

  return { chiSpunta: query.data ?? "tutti", isLoading: query.isLoading, salva };
}
