import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import { readAllPages } from "@/lib/personale/readAllPages";
import {
  erroreProfilo,
  type DatiProfiloRequisiti,
  type ProfiloRequisiti,
} from "@/lib/sicurezza/profiliRequisiti";
const chiave = (companyId: string) => ["profili-requisiti", companyId];
export function useProfiliRequisiti(companyId: string) {
  const p = usePermissions();
  return useQuery({
    queryKey: chiave(companyId),
    enabled: !!companyId && p.canViewSicurezzaCantiere,
    queryFn: async () =>
      (await readAllPages((from, to) =>
        supabase
          .from("sicurezza_profili_requisiti" as never)
          .select(
            "id,company_id,famiglia_id,versione,precedente_id,nome,attivita,ruoli,limiti,criteri,creato_da,creato_il,archiviato",
          )
          .eq("company_id", companyId)
          .order("nome")
          .order("versione", { ascending: false })
          .order("id")
          .range(from, to),
      )) as unknown as ProfiloRequisiti[],
  });
}
export function useSalvaProfiloRequisiti(companyId: string) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      precedente,
      dati,
    }: {
      id: string;
      precedente: string | null;
      dati: DatiProfiloRequisiti;
    }) => {
      if (!p.canViewSicurezzaCantiere || p.solaLettura)
        throw new Error("Non puoi gestire i profili sicurezza.");
      const errore = erroreProfilo(dati);
      if (errore) throw new Error(errore);
      const { data, error } = await supabase.rpc(
        "sicurezza_salva_profilo" as never,
        {
          _id: id,
          _company: companyId,
          _precedente: precedente,
          _dati: dati,
        } as never,
      );
      if (error) throw error;
      const raw: unknown = data;
      const r = (Array.isArray(raw) ? raw[0] : raw) as ProfiloRequisiti | null;
      if (!r?.id)
        throw new Error(
          "Versione non confermata: rileggi la libreria prima di riprovare.",
        );
      return r;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chiave(companyId) }),
  });
}
export function useArchiviaProfiloRequisiti(companyId: string) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profilo: ProfiloRequisiti) => {
      if (!p.canViewSicurezzaCantiere || p.solaLettura)
        throw new Error("Non puoi gestire i profili sicurezza.");
      const { error } = await supabase.rpc(
        "sicurezza_archivia_profilo" as never,
        {
          _id: profilo.id,
          _company: companyId,
          _archiviato: !profilo.archiviato,
          _atteso: profilo.archiviato,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chiave(companyId) }),
  });
}
