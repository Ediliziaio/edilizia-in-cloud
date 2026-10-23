/**
 * I materiali VALIDATI dal tecnico di tutte le commesse (order_items di natura
 * «materiale» nelle fasi validate), con lo stato d'acquisto calcolato dalla
 * copertura degli ordini come in planMaterial, più i legami che servono alla
 * pipeline: la richiesta d'offerta e gli ordini che contengono la riga.
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

type RigaGrezza = Omit<MaterialeFase, "stato" | "ordinabile" | "avviso"> & { rfq_item?: { rfq_id: string } | null };

export async function caricaAcquistiDaOrdinare(companyId: string): Promise<MaterialeAcquisti[]> {
  const { data: fasi, error } = await supabase
    .from("materiali_fasi_validazione")
    .select("phase_id, order_id, validata_il, fase:order_work_phases(name, position), commessa:orders(order_code)")
    .eq("company_id", companyId)
    .eq("stato", "validata");
  if (error) throw error;
  const info = new Map((fasi ?? []).map((f) => {
    const r = f as unknown as { phase_id: string; fase: { name: string; position: number } | null; commessa: { order_code: string | null } | null };
    return [r.phase_id, { fase: r.fase?.name ?? "Fase", posizione: r.fase?.position ?? 0, commessa: r.commessa?.order_code ?? "Commessa" }];
  }));
  const idsFasi = [...info.keys()];
  const righe: RigaGrezza[] = [];
  for (let i = 0; i < idsFasi.length; i += 100) {
    const { data, error: e } = await supabase.from("order_items")
      .select("id, order_id, name, description, quantity, status, supplier_id, purchase_price, vat_rate, phase_id, unita_misura, specifiche, origine_materiale, quantita_calcolata, origini, locale, supplier_rfq_item_id, stock_item_id, posizioni, rfq_item:supplier_rfq_items(rfq_id)")
      .in("phase_id", idsFasi.slice(i, i + 100)).eq("natura_riga", "materiale").order("position").limit(5000);
    if (e) throw e;
    righe.push(...((data ?? []) as unknown as RigaGrezza[]));
  }
  const copertura = await loadMaterialCoverage(companyId, righe.map((r) => r.id));
  return righe.map(({ rfq_item, ...r }) => {
    const piano = planMaterial({ ...r, quantity: Number(r.quantity) }, copertura);
    const i = info.get(r.phase_id!)!;
    const odaIds = [...new Set(copertura
      .filter((c) => c.order_item_id === r.id && c.purchase_orders && c.purchase_orders.status !== "annullato")
      .map((c) => c.purchase_orders!.id))];
    return {
      ...r,
      quantity: Number(r.quantity),
      stato: statoAcquistoMateriale({ ...r, quantity: Number(r.quantity), drafted: piano.drafted, issued: piano.issued, received: piano.received }),
      ordinabile: piano.canOrder,
      avviso: piano.review,
      commessa: i.commessa,
      fase: i.fase,
      posizioneFase: i.posizione,
      rfqId: rfq_item?.rfq_id ?? null,
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
