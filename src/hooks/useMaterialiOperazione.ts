import { useQuery } from "@tanstack/react-query";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { loadMaterialCoverage } from "@/hooks/useMaterialProcurement";
import { supabase } from "@/integrations/supabase/client";
import { planMaterial, type ProcurementCoverage, type ProcurementItem } from "@/lib/orders/materialProcurement";
import { statoMateriale } from "@/lib/distinta/statoMateriale";
import type { StatoMaterialiFase } from "@/lib/distinta/statiFase";
import { readAllOrderRows } from "@/lib/orders/listScope";
import type { ArticoloNavigazione } from "@/lib/distinta/navigazioneArticoli";
import type { VoceMagazzino } from "@/lib/distinta/collegaArticoli";
import { verificaDelMateriale } from "@/lib/distinta/verificaAcquisto";
import type { RigaFabbisognoFase } from "@/lib/orders/generali/consegneFasi";

type Articolo = ProcurementItem & ArticoloNavigazione & {
  id: string;
  order_id: string;
  phase_id: string | null;
  origini: ArticoloNavigazione["origini"];
  supplier_rfq_item_id: string | null;
  data_fabbisogno: string | null;
  quantity_reserved: number | null;
  warehouse_reserved_quantity?: number | null;
  fulfillment_status?: string | null;
  quantity_received?: number | null;
  auto_deducted: boolean | null;
  fase: { name: string } | null;
  fornitore: { name: string | null } | null;
};

const COLONNE = "id,order_id,name,quantity,status,unita_misura,stock_item_id,supplier_id,article_template_id,supplier_rfq_item_id,phase_id,product_code,data_fabbisogno,posizioni,axis_selections,measure_status,misure_preventivo,misure_da_ordinare,origini,quantity_reserved,auto_deducted,warehouse_supply_quantity,warehouse_reserved_quantity,fulfillment_status,quantity_received";
const PREZZI = "purchase_price,prezzo_da_definire,prezzo_fonte,vat_rate";
const INDICE = "id,name,supplier_id,stock_item_id,unita_misura,article_template_id,product_code";
const RELAZIONI = "fase:order_work_phases!order_items_phase_id_fkey(name),fornitore:suppliers!order_items_supplier_id_fkey(name)";
const FABBISOGNI_FASE = "id,order_id,phase_id,name,quantity,quantity_received,unita_misura,data_fabbisogno,status,stock_item_id,quantity_reserved,auto_deducted,warehouse_supply_quantity";
type VoceIndice = ArticoloNavigazione & { fase: Articolo["fase"]; fornitore: Articolo["fornitore"] };

function righeDellAmbito(colonne: string, companyId: string, generaleId: string, edificio?: string, conRelazioni = true) {
  const unita = edificio ? ",unita:unita_immobiliari!unita_immobiliari_order_id_fkey!inner(id)" : "";
  const query = supabase.from("order_items")
    .select(`${colonne},${conRelazioni ? RELAZIONI + "," : ""}ambito:orders!order_items_order_id_fkey!inner(id${unita})`)
    .eq("ambito.company_id", companyId).is("ambito.deleted_at", null).eq("natura_riga", "materiale")
    .or(`id.eq.${generaleId},commessa_generale_id.eq.${generaleId}`, { referencedTable: "ambito" });
  return edificio ? query.eq("ambito.unita.edificio", edificio).eq("ambito.unita.company_id", companyId) : query;
}

export function useConsegneFasiOperazione(generaleId: string, commessaId: string | undefined, edificio: string | undefined, abilitato: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["generale-materiali-operazione", "consegne-fasi", companyId, generaleId, commessaId, edificio],
    enabled: abilitato && !!companyId,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const materiali = await readAllOrderRows<RigaFabbisognoFase>((da, a) => {
        const righe = righeDellAmbito(FABBISOGNI_FASE, companyId!, generaleId, edificio, false)
          .not("phase_id", "is", null).gt("quantity", 0);
        if (commessaId) righe.eq("order_id", commessaId);
        return righe.order("id").range(da, a).abortSignal(signal).returns<RigaFabbisognoFase[]>();
      });
      const coperture = await loadMaterialCoverage(companyId!, materiali.map(r => r.id), { signal });
      return { materiali, coperture };
    },
  });
}

export function useIndiceMaterialiOperazione(generaleId: string, edificio: string, magazzino: boolean, abilitato: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["generale-materiali-operazione", "indice", companyId, generaleId, edificio, magazzino],
    enabled: abilitato && !!companyId,
    staleTime: 30_000,
    refetchOnMount: "always",
    queryFn: ({ signal }): Promise<VoceIndice[]> => readAllOrderRows((da, a) => righeDellAmbito(
      magazzino ? `${INDICE},origini` : INDICE, companyId!, generaleId, edificio,
    ).order("data_fabbisogno", { nullsFirst: false }).order("id").range(da, a).abortSignal(signal)
      .returns<VoceIndice[]>()),
  });
}

export function useMagazzinoMaterialiOperazione(abilitato: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["generale-materiali-operazione", "magazzino", companyId],
    enabled: abilitato && !!companyId,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const [stock, catalogo] = await Promise.all([
        readAllOrderRows<VoceMagazzino>((da, a) => supabase.from("warehouse_stock")
          .select("id,name,internal_code,unita_misura,quantity_available").eq("company_id", companyId!)
          .gt("quantity_available", 0).order("id").range(da, a).abortSignal(signal)),
        readAllOrderRows((da, a) => supabase.from("article_templates").select("id,sku").eq("company_id", companyId!)
          .order("id").range(da, a).abortSignal(signal)),
      ]);
      return { stock, codici: Object.fromEntries(catalogo.map(r => [r.id, r.sku])) };
    },
  });
}

async function completaArticoli(companyId: string, articoli: Articolo[], signal: AbortSignal) {
  const fasi = [...new Set(articoli.flatMap(r => r.phase_id ? [r.phase_id] : []))];
  const validazione = new Map<string, StatoMaterialiFase>();
  const [copertura] = await Promise.all([
    loadMaterialCoverage(companyId, articoli.map(r => r.id), { signal, includeAnnullati: true }),
    (async () => {
      for (let i = 0; i < fasi.length; i += 100) {
        const { data, error } = await supabase.from("materiali_fasi_validazione").select("phase_id,stato")
          .eq("company_id", companyId).in("phase_id", fasi.slice(i, i + 100)).abortSignal(signal);
        if (error) throw error;
        for (const riga of data ?? []) validazione.set(riga.phase_id, riga.stato as StatoMaterialiFase);
      }
    })(),
  ]);
  const perArticolo = new Map<string, ProcurementCoverage[]>();
  for (const riga of copertura) {
    if (!riga.order_item_id) continue;
    const righe = perArticolo.get(riga.order_item_id);
    if (righe) righe.push(riga);
    else perArticolo.set(riga.order_item_id, [riga]);
  }
  return articoli.map(riga => {
    const righe = perArticolo.get(riga.id) ?? [];
    const acquisto = statoMateriale(riga, righe);
    return {
      ...riga, acquisto, piano: planMaterial(riga, righe),
      oda: [...new Map(righe.map(r => [r.purchase_orders.id, r.purchase_orders])).values()],
      validazione: riga.phase_id ? validazione.get(riga.phase_id) ?? null : null,
      verifica: verificaDelMateriale(riga),
    };
  });
}

export type RegistroMateriale = Awaited<ReturnType<typeof completaArticoli>>[number];

export function useCodaMaterialiOperazione(generaleId: string, abilitato: boolean, prezzi: boolean, edificio = "") {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["generale-materiali-operazione", "coda", companyId, generaleId, edificio, prezzi],
    enabled: abilitato && !!companyId,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const articoli = await readAllOrderRows((da, a) => righeDellAmbito(prezzi ? `${COLONNE},${PREZZI}` : COLONNE, companyId!, generaleId, edificio)
        .order("data_fabbisogno", { nullsFirst: false }).order("id").range(da, a).abortSignal(signal).returns<Articolo[]>());
      return completaArticoli(companyId!, articoli, signal);
    },
  });
}

export function useMaterialiOperazione(generaleId: string, edificio: string, ids: string[]) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["generale-materiali-operazione", "righe", companyId, generaleId, edificio, ids],
    enabled: ids.length > 0 && !!companyId,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const { data, error } = await righeDellAmbito(COLONNE, companyId!, generaleId, edificio)
        .in("id", ids).abortSignal(signal).returns<Articolo[]>();
      if (error) throw error;
      const articoli = new Map((data ?? []).map(r => [r.id, r]));
      const visibili = ids.flatMap(id => articoli.has(id) ? [articoli.get(id)!] : []);
      return completaArticoli(companyId!, visibili, signal);
    },
  });
}
