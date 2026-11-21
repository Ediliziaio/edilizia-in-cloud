import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadMaterialCoverage, loadUnmappedPurchaseOrders } from "./useMaterialProcurement";
import type { ContestoAcquisti, MaterialeEsistente } from "@/lib/distinta/pianoAcquisti";
import type { VoceMagazzino } from "@/lib/distinta/collegaArticoli";
import type { ConteggioTavola } from "@/lib/distinta/confrontaTavole";
import { leggiPaginePiano as pagine } from "@/lib/distinta/leggiPaginePiano";

export function usePianoAcquistiComputo(companyId: string, orderId: string | null, enabled: boolean, nuovaCommessa = false) {
  return useQuery({
    queryKey: ["piano-acquisti-computo", companyId, orderId],
    enabled: enabled && !!companyId && (!!orderId || nuovaCommessa),
    staleTime: 0,
    queryFn: async (): Promise<ContestoAcquisti> => {
      return caricaContestoPianoAcquisti(companyId, orderId);
    },
  });
}

/** Lettura condivisa fra anteprima, commessa e collaudo del piano reale. */
export async function caricaContestoPianoAcquisti(companyId: string, orderId: string | null): Promise<ContestoAcquisti> {
  if (!companyId) throw new Error("Azienda non disponibile");
  const [magazzino, esistenti, fasi, fornitori, articoli, conteggiTavole] = await Promise.all([
    pagine<VoceMagazzino>((da, a) => supabase.from("warehouse_stock")
      .select("id, name, internal_code, unita_misura, quantity_available").eq("company_id", companyId).gt("quantity_available", 0).order("id").range(da, a)),
    orderId ? pagine<MaterialeEsistente>((da, a) => supabase.from("order_items")
      .select("id, updated_at, name, description, riferimento, chiave_materiale, stock_item_id, auto_deducted, quantity_reserved, quantity, quantita_calcolata, unita_misura, specifiche, origini, data_fabbisogno, phase_id, supplier_id, article_template_id, product_code, orders!inner(company_id)")
      .eq("orders.company_id", companyId).eq("order_id", orderId).order("id").range(da, a))
      : Promise.resolve([]),
    orderId ? pagine<ContestoAcquisti["fasi"][number]>((da, a) => supabase.from("order_work_phases").select("id, start_date").eq("company_id", companyId).eq("order_id", orderId).order("id").range(da, a)) : Promise.resolve([]),
    pagine<ContestoAcquisti["fornitori"][number]>((da, a) => supabase.from("suppliers").select("id, lead_time_days").eq("company_id", companyId).order("id").range(da, a)),
    pagine<{ id: string; sku: string | null }>((da, a) => supabase.from("article_templates").select("id, sku").eq("company_id", companyId).order("id").range(da, a)),
    orderId ? pagine<ConteggioTavola>((da, a) => supabase.from("planimetrie_conteggi").select("id,metodo,documento_id,documento_nome,pagina,simbolo,descrizione_legenda,quantita,unita,phase_id,locale,confermato,updated_at,dettaglio").eq("company_id", companyId).eq("order_id", orderId).order("id").range(da, a)) : Promise.resolve([]),
  ]);
  const [coperture, senzaCollegamento] = await Promise.all([loadMaterialCoverage(companyId, esistenti.map(e => e.id)), orderId ? loadUnmappedPurchaseOrders(companyId, orderId) : Promise.resolve([])]);
  return { magazzino, esistenti, coperture, fasi, fornitori, conteggiTavole, coperturaIncompleta: senzaCollegamento.length > 0 || coperture.some(c => esistenti.some(e => e.id === c.order_item_id && !e.chiave_materiale)),
    codiciArticoli: { ...Object.fromEntries(articoli.map(a => [a.id, a.sku])),
      ...Object.fromEntries(esistenti.filter(e => e.article_template_id && e.product_code).map(e => [e.article_template_id!, e.product_code])) } };
}
