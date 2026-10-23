/**
 * I materiali VALIDATI dal tecnico di tutte le commesse (order_items di natura
 * «materiale» nelle fasi validate), con lo stato d'acquisto calcolato dalla
 * copertura degli ordini come in planMaterial, più i legami che servono alla
 * pipeline: la richiesta d'offerta e gli ordini che contengono la riga.
 *
 * Le righe arrivano dalla funzione acquisti_materiali_da_ordinare, non dalle
 * tabelle delle commesse: così le legge anche chi ha solo «Ufficio acquisti»
 * (senza il permesso sulle commesse), e riceve soltanto i campi della
 * pipeline (codice della commessa, nome della fase, il materiale col suo costo
 * d'acquisto), mai prezzi di vendita o margini. Chi vede cosa lo decide il
 * database: azienda in cui si lavora, permesso, commesse assegnate.
 *
 * La chiave ["acquisti-da-fare", …] la invalidano le azioni sui materiali
 * (useAzioniMateriali): resta la stessa di quando era una pagina a parte.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadMaterialCoverage } from "@/hooks/useMaterialProcurement";
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";
import { planMaterial } from "@/lib/orders/materialProcurement";
import { statoAcquistoMateriale } from "@/lib/distinta/fasiMateriali";
import type { MaterialeAcquisti } from "@/lib/acquisti/pipelineAcquisti";

/** Una riga di acquisti_materiali_da_ordinare. */
export type RigaMaterialeDaOrdinare = Omit<MaterialeFase, "stato" | "ordinabile" | "avviso"> & {
  rfq_id: string | null;
  commessa: string | null;
  fase: string | null;
  posizione_fase: number | null;
};

export async function caricaAcquistiDaOrdinare(companyId: string): Promise<MaterialeAcquisti[]> {
  const { data, error } = await supabase.rpc("acquisti_materiali_da_ordinare" as never, { p_company: companyId } as never);
  if (error) throw error;
  const righe = (data ?? []) as unknown as RigaMaterialeDaOrdinare[];
  const copertura = await loadMaterialCoverage(companyId, righe.map((r) => r.id));
  return righe.map(({ rfq_id, commessa, fase, posizione_fase, ...r }) => {
    const quantity = Number(r.quantity);
    const piano = planMaterial({ ...r, quantity }, copertura);
    const odaIds = [...new Set(copertura
      .filter((c) => c.order_item_id === r.id && c.purchase_orders && c.purchase_orders.status !== "annullato")
      .map((c) => c.purchase_orders!.id))];
    return {
      ...r,
      quantity,
      stato: statoAcquistoMateriale({ ...r, quantity, drafted: piano.drafted, issued: piano.issued, received: piano.received }),
      ordinabile: piano.canOrder,
      avviso: piano.review,
      commessa: commessa ?? "Commessa",
      fase: fase ?? "Fase",
      posizioneFase: posizione_fase ?? 0,
      rfqId: rfq_id ?? null,
      odaIds,
    };
  });
}

export function useAcquistiDaOrdinare(companyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["acquisti-da-fare", companyId],
    enabled: !!companyId && enabled,
    queryFn: () => caricaAcquistiDaOrdinare(companyId!),
  });
}
