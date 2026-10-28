import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import type { EvidenzaFascicolo } from "@/lib/sicurezza/fascicolo";
export interface SdsAziendale extends EvidenzaFascicolo {
  impronta: string;
  precedente_id: string | null;
  successive: Array<{
    id: string;
    titolo: string;
    revisione: string | null;
    stato: string;
  }>;
  impieghi: Array<{
    id: string;
    order_id: string;
    order_code: string;
    nome: string;
    versione: number;
    fase_id: string | null;
    dal: string;
    al: string | null;
    annullato: boolean;
  }>;
}
export async function leggiSdsAziendali(
  companyId: string,
): Promise<SdsAziendale[]> {
  const { data, error } = await supabase.rpc(
    "sds_aziendali_quadro" as never,
    { _company: companyId } as never,
  );
  if (error) throw new Error(error.message);
  const r = data as unknown as SdsAziendale[] | null;
  if (
    !Array.isArray(r) ||
    r.some(
      (e) =>
        e.company_id !== companyId ||
        e.tipo !== "sds" ||
        e.order_id !== null ||
        e.subappaltatore_id !== null ||
        e.operaio_id !== null ||
        e.incarico_id !== null ||
        e.fase_id !== null ||
        typeof e.impronta !== "string" ||
        !Array.isArray(e.successive) ||
        !Array.isArray(e.impieghi),
    )
  )
    throw new Error("Libreria SDS non disponibile per questa azienda.");
  return r;
}
export function useSdsAziendali(companyId: string) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["sds-aziendali", companyId],
    enabled: !!companyId && p.canViewSicurezzaCantiere,
    queryFn: () => leggiSdsAziendali(companyId),
  });
}
export function useCollegaRevisioneSds(companyId: string) {
  const p = usePermissions();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      documentoId: string;
      precedenteId: string;
      improntaPrecedente: string;
      improntaDocumento: string;
    }) => {
      if (!p.canViewSicurezzaCantiere || p.solaLettura)
        throw new Error("Non puoi collegare revisioni SDS.");
      const { data, error } = await supabase.rpc(
        "sds_collega_revisione" as never,
        {
          _company: companyId,
          _documento: v.documentoId,
          _precedente: v.precedenteId,
          _impronta_precedente: v.improntaPrecedente,
          _impronta_documento: v.improntaDocumento,
        } as never,
      );
      if (error) throw new Error(error.message);
      const r = data as unknown as {
        documento_id: string;
        precedente_id: string;
        company_id: string;
      } | null;
      if (
        !r ||
        r.company_id !== companyId ||
        r.documento_id !== v.documentoId ||
        r.precedente_id !== v.precedenteId
      )
        throw new Error("Collegamento tra revisioni non confermato.");
      return r;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["sds-aziendali", companyId] }),
  });
}
