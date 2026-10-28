import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import type { RitenutaBonifico } from "@/lib/fatturazione/bonificiParlanti";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { invalidaStatisticheFatturazione } from "@/lib/fatturazione/invalidaStatistiche";

export function useRitenuteBonifici(anno: number, enabled = true) {
  const companyId = useEffectiveCompanyId(),
    permissions = usePermissions(),
    qc = useQueryClient();
  const canEdit =
    !!companyId &&
    permissions.isAdmin &&
    !permissions.solaLettura &&
    !permissions.isLoading;
  const query = useQuery({
    queryKey: ["ritenute-bonifici", companyId, anno],
    enabled: !!companyId && enabled,
    staleTime: 60000,
    retry: false,
    queryFn: async ({ signal }) =>
      readAllPages<RitenutaBonifico>(
        (from, to) =>
          supabase
            .from("ritenute_bonifici" as never)
            .select("*")
            .eq("company_id", companyId!)
            .gte("data_accredito", `${anno}-01-01`)
            .lte("data_accredito", `${anno}-12-31`)
            .order("data_accredito", { ascending: false })
            .order("id")
            .range(from, to)
            .abortSignal(signal) as never,
      ),
  });
  const mutation = useMutation({
    mutationFn: async (input: {
      id: string;
      revisione: number;
      azione: "certifica" | "storna";
      riferimento: string;
    }) => {
      if (!canEdit) throw Error("Modifica fiscale non autorizzata");
      const { error } = await supabase.rpc(
        "aggiorna_ritenuta_bonifico" as never,
        {
          p_company: companyId,
          p_id: input.id,
          p_revisione: input.revisione,
          p_azione: input.azione,
          p_riferimento: input.riferimento,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      invalidaStatisticheFatturazione(qc, companyId);
      for (const key of [
        queryKeys.documentiFiscali.all,
        queryKeys.primaNota.all,
        queryKeys.scadenzario.all,
        queryKeys.orders.all,
      ])
        void qc.invalidateQueries({ queryKey: key });
      for (const key of [
        "ritenute-bonifici",
        "movimenti-cassa",
        "documenti-fiscali",
        "prima-nota",
        "scadenzario",
        "orders",
        "cashflow",
      ])
        void qc.invalidateQueries({ queryKey: [key] });
      toast.success("Registro aggiornato; nessun versamento F24 effettuato");
    },
    onError: (error: Error) =>
      toast.error("Operazione non eseguita", { description: error.message }),
  });
  return { ...query, companyId, canEdit, mutation };
}
