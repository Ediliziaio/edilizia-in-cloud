// ============================================================================
// useDDTRicezione — Hooks per la gestione DDT fornitori (UX procedurale)
// ----------------------------------------------------------------------------
// Catena completa:
//   purchase_orders ──< ddt_ricezione ──< goods_receipts ──> warehouse_stock
//                   │                  │
//                   │                  └── goods_receipts.order_item_id ─> order_items
//                   │
//                   └── orders (via purchase_orders.order_id)
//
// Espone:
//   - useDDTRicezioneList       → tutti i DDT dell'azienda (con join PO/supplier/order)
//   - useDDTByPurchaseOrder     → DDT per un singolo ODA
//   - useDDTRicezioneDetail     → dettaglio + goods_receipts + order_item
//   - useDDTCountsByPO          → aggregato per badge nelle liste
//   - useDDTRicezioneMutations  → create/update/delete DDT + createGoodsReceipt
//   - useDDTAttachments         → upload/delete file allegati + DDT principale
// ============================================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { riceviResiduoOda } from "@/lib/orders/riceviResiduoOda";
import { readAllOrderRows } from "@/lib/orders/listScope";

// `ddt_righe` e le colonne nuove di `ddt_ricezione` (order_id, supplier_id,
// destinazione, ai_*) sono del 29/10/2026 e in `types.ts` non ci sono: su questo
// progetto i tipi generati non si rigenerano a ogni migrazione. Un alias scritto
// una volta sola, invece di un cast sparso a ogni chiamata.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ── Types ───────────────────────────────────────────────────────────────────

export type DDTStato =
  | "atteso"        // Pre-avviso, ancora da arrivare
  | "attesa"        // Legacy: in attesa di ricezione
  | "parziale"      // Ricevuto parzialmente
  | "ricevuto"      // Ricevuto completo (da verificare)
  | "verificato"    // Controllo completato, conforme
  | "non_conforme"; // Difforme da ODA / danni

export type DDTAttachmentKind =
  | "ddt"
  | "bolla"
  | "danni"
  | "packing_list"
  | "firma"
  | "altro";

export interface DDTAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
  uploaded_at: string;
  kind: DDTAttachmentKind;
  path: string; // storage path per eventuale delete
}

export interface DDTRicezione {
  id: string;
  company_id: string;
  /** L'ODA, se c'è. Dal 29/10/2026 una bolla può nascere senza ordine. */
  purchase_order_id: string | null;
  /** La commessa in chiaro sulla bolla: dedotta dall'ODA, o scelta a mano. */
  order_id: string | null;
  /** Chi ha consegnato: dedotto dall'ODA, scelto a mano o proposto dall'AI. */
  supplier_id: string | null;
  /**
   * Dove va la merce. «magazzino» entra in giacenza e uscirà con uno scarico su
   * commessa; «cantiere» scende dal camion e si posa, in giacenza non entra mai.
   * I vincoli che impediscono di contarla due volte stanno nel database.
   */
  destinazione: "magazzino" | "cantiere";
  /** Il costo nato da questa bolla. Con l'ODA resta NULL: il costo è sull'ordine. */
  company_cost_id?: string | null;
  /** Quando la merce è entrata in giacenza. È la prova che il carico è fatto. */
  caricata_a_magazzino_at?: string | null;
  warehouse_id: string | null;
  numero_ddt: string;
  data_ricezione: string;
  quantita_ricevuta: number;
  stato: DDTStato;
  note: string | null;
  created_at: string;
  created_by: string | null;

  // ── Procedural UX ─────────────────────────────────────────
  ddt_file_url?: string | null;
  ddt_file_name?: string | null;
  ddt_file_mime?: string | null;
  attachments?: DDTAttachment[];

  // Corriere / mezzo / autista
  /**
   * Chi ha portato la merce: «fornitore» col suo mezzo, «noi» (siamo andati a
   * ritirarla) o «terzi» (un corriere). NULL = non si sa. Con «noi»,
   * `autista_nome` è chi è andato e `targa_mezzo` il nostro furgone: non
   * servono colonne nuove per dire la stessa cosa in un altro contesto.
   */
  trasporto_a_cura_di?: "fornitore" | "noi" | "terzi" | null;
  /** «franco» = trasporto compreso nel prezzo, «assegnato» = a nostro carico. */
  porto?: "franco" | "assegnato" | null;
  corriere?: string | null;
  targa_mezzo?: string | null;
  autista_nome?: string | null;
  autista_telefono?: string | null;
  ora_arrivo?: string | null;
  ora_partenza?: string | null;

  // Ricezione fisica
  ricevuto_da_nome?: string | null;
  signature_url?: string | null;

  // Controllo qualità
  non_conformita?: string | null;
  has_damages?: boolean;
  verified_at?: string | null;
  verified_by?: string | null;

  // ── Lettura AI ────────────────────────────────────────────
  /** La lettura grezza del modello, intera: si rilegge senza ripagarla. */
  ai_lettura?: Record<string, unknown> | null;
  ai_confidenza?: number | null;
  ai_avvisi?: string[] | null;
}

export interface DDTRicezioneWithJoins extends DDTRicezione {
  purchase_orders?: {
    id: string;
    oda_number: string;
    supplier_id?: string | null;
    status: string;
    order_id: string | null;
    suppliers?: { name: string; email?: string | null } | null;
    orders?: { id: string; order_code: string } | null;
  } | null;
  warehouses?: { id: string; name: string } | null;
  /** Commessa e fornitore della bolla stessa: ci sono anche senza ODA. */
  orders?: { id: string; order_code: string } | null;
  suppliers?: { id: string; name: string } | null;
}

/** Una riga di merce letta sulla bolla. Vive anche senza riga di commessa. */
export interface DDTRiga {
  id: string;
  company_id: string;
  ddt_ricezione_id: string;
  posizione: number;
  codice_articolo: string | null;
  descrizione: string;
  unita_misura: string | null;
  quantita: number | null;
  prezzo_unitario: number | null;
  importo: number | null;
  iva_percentuale: number | null;
  order_item_id: string | null;
  origine: "ai" | "manuale";
  ai_originale?: Record<string, unknown> | null;
  testo_grezzo: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** Quel che si scrive: l'azienda la mette il database, non il browser. */
export type DDTRigaNuova = Omit<
  DDTRiga,
  "id" | "company_id" | "ddt_ricezione_id" | "created_at" | "updated_at"
>;

export interface GoodsReceipt {
  id: string;
  order_item_id: string;
  company_id: string;
  supplier_id: string | null;
  ddt_ricezione_id: string | null;
  warehouse_id: string | null;
  receipt_date: string;
  quantity_received: number;
  ddt_number: string | null;
  ddt_photo_url: string | null;
  received_by: string;
  notes: string | null;
  quality_check_status: "ok" | "damaged" | "partial" | "pending" | null;
  quality_notes: string | null;
  created_at: string;
  updated_at: string;
  order_items?: {
    id: string;
    description: string;
    quantity: number;
    order_id: string | null;
  } | null;
}

export interface DDTCountAggregate {
  purchase_order_id: string;
  total: number;
  ricevuti: number;
  parziali: number;
  attesa: number;
  verificati: number;
  non_conformi: number;
}

// ============================================================================
// LIST: tutti i DDT dell'azienda con join
// ============================================================================
export function useDDTRicezioneList(filters?: {
  stato?: DDTStato | "all";
  supplierId?: string;
  warehouseId?: string;
  purchaseOrderId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery<DDTRicezioneWithJoins[]>({
    queryKey: queryKeys.ddtRicezione.list(companyId, filters),
    queryFn: async () => {
      // Tutte le pagine, a blocchi di 500. Prima c'era un tetto di 500 bolle:
      // contatori, schede ed esportazione vedevano solo quelle senza dirlo.
      // La query si ricostruisce a ogni pagina: un builder già eseguito non si riusa.
      const pagina = (da: number, a: number) => {
        let q = db
          .from("ddt_ricezione")
          .select(
            // Left join sull'ODA, non !inner: dal 29/10/2026 una bolla può non
            // averne, e con l'inner join sarebbe sparita dalla lista senza che
            // nessuno lo dicesse. Commessa e fornitore si leggono dalla bolla.
            "*, purchase_orders(id, oda_number, status, order_id, supplier_id, suppliers(name, email), orders(id, order_code)), warehouses(id, name), orders(id, order_code), suppliers(id, name)"
          )
          .eq("company_id", companyId!)
          .order("data_ricezione", { ascending: false })
          .order("id");

        if (filters?.stato && filters.stato !== "all") {
          q = q.eq("stato", filters.stato);
        }
        if (filters?.purchaseOrderId) {
          q = q.eq("purchase_order_id", filters.purchaseOrderId);
        }
        if (filters?.warehouseId) {
          q = q.eq("warehouse_id", filters.warehouseId);
        }
        if (filters?.supplierId) {
          q = q.eq("supplier_id", filters.supplierId);
        }
        if (filters?.fromDate) {
          q = q.gte("data_ricezione", filters.fromDate);
        }
        if (filters?.toDate) {
          q = q.lte("data_ricezione", filters.toDate);
        }
        return q.range(da, a) as unknown as PromiseLike<{ data: DDTRicezioneWithJoins[] | null; error: unknown }>;
      };
      // Il fornitore ora è una colonna della bolla: si filtra nella query,
      // non a valle su un campo dell'ODA che le bolle senza ordine non hanno.
      return await readAllOrderRows<DDTRicezioneWithJoins>(pagina);
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// BY PURCHASE ORDER
// ============================================================================
export function useDDTByPurchaseOrder(poId: string | null | undefined) {
  return useQuery<DDTRicezione[]>({
    queryKey: queryKeys.ddtRicezione.byPurchaseOrder(poId),
    queryFn: async () => {
      // Safety cap: un PO ha tipicamente 1-5 DDT (consegne parziali), ma in
      // casi patologici (importazioni storiche) può averne molti. Limite 200
      // → copre 100% dei casi reali senza scaricare payload inutili.
      const { data, error } = await supabase
        .from("ddt_ricezione")
        .select("*")
        .eq("purchase_order_id", poId!)
        .order("data_ricezione", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as DDTRicezione[];
    },
    enabled: !!poId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// DETAIL
// ============================================================================
export function useDDTRicezioneDetail(ddtId: string | null | undefined) {
  const detailQuery = useQuery<DDTRicezioneWithJoins | null>({
    queryKey: queryKeys.ddtRicezione.detail(ddtId ?? undefined),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ddt_ricezione")
        .select(
          "*, purchase_orders(id, oda_number, status, order_id, supplier_id, suppliers(name, email), orders(id, order_code)), warehouses(id, name), orders(id, order_code), suppliers(id, name)"
        )
        .eq("id", ddtId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as DDTRicezioneWithJoins | null;
    },
    enabled: !!ddtId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const receiptsQuery = useQuery<GoodsReceipt[]>({
    queryKey: queryKeys.ddtRicezione.goodsReceipts(ddtId ?? undefined),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goods_receipts")
        // Hint obbligatorio: tra goods_receipts e order_items ci sono due strade
        // (goods_receipts.order_item_id e l'inversa order_items.receipt_id) →
        // senza hint PostgREST risponde 400 PGRST201 e le ricezioni non caricavano.
        .select("*, order_items!goods_receipts_order_item_id_fkey(id, description, quantity, order_id)")
        .eq("ddt_ricezione_id", ddtId!)
        .order("receipt_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as GoodsReceipt[];
    },
    enabled: !!ddtId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    ddt: detailQuery.data ?? null,
    isLoading: detailQuery.isLoading,
    receipts: receiptsQuery.data ?? [],
    isReceiptsLoading: receiptsQuery.isLoading,
    refetch: () => {
      detailQuery.refetch();
      receiptsQuery.refetch();
    },
  };
}

// ============================================================================
// RIGHE DELLA BOLLA
// ----------------------------------------------------------------------------
// Quello che c'è scritto sul documento, col prezzo. Separate dalle
// `goods_receipts`, che sono l'arrivo in magazzino di una riga d'ordine già
// esistente: qui una riga vive anche se non corrisponde a niente.
// ============================================================================
export function useDDTRighe(ddtId: string | null | undefined) {
  return useQuery<DDTRiga[]>({
    queryKey: queryKeys.ddtRicezione.righe(ddtId ?? undefined),
    queryFn: async () => {
      const { data, error } = await db
        .from("ddt_righe")
        .select("*, order_items(id, description, order_id)")
        .eq("ddt_ricezione_id", ddtId!)
        .order("posizione")
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as DDTRiga[];
    },
    enabled: !!ddtId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useDDTRigheMutations(ddtId: string | null | undefined) {
  const queryClient = useQueryClient();

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.righe(ddtId ?? undefined) });
  };

  const aggiungiRighe = useMutation({
    mutationFn: async (righe: DDTRigaNuova[]) => {
      if (!ddtId) throw new Error("Bolla non disponibile");
      if (righe.length === 0) return;
      const { error } = await db
        .from("ddt_righe")
        .insert(righe.map((r) => ({ ...r, ddt_ricezione_id: ddtId })) as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Righe aggiunte");
      invalida();
    },
    onError: (err: Error) => toast.error(err.message || "Errore salvataggio righe"),
  });

  const aggiornaRiga = useMutation({
    mutationFn: async (params: { id: string; updates: Partial<DDTRigaNuova> }) => {
      const { error } = await db
        .from("ddt_righe")
        .update(params.updates as never)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: invalida,
    onError: (err: Error) => toast.error(err.message || "Errore modifica riga"),
  });

  const eliminaRiga = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("ddt_righe").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Riga eliminata");
      invalida();
    },
    onError: (err: Error) => toast.error(err.message || "Errore eliminazione riga"),
  });

  return { aggiungiRighe, aggiornaRiga, eliminaRiga };
}

// ============================================================================
// COUNTS BY PO
// ============================================================================
export function useDDTCountsByPO() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery<Record<string, DDTCountAggregate>>({
    queryKey: queryKeys.ddtRicezione.countsByPO(companyId),
    queryFn: async () => {
      // A pagine: oltre le 1.000 bolle PostgREST tronca e i conteggi verrebbero bassi.
      const data: { purchase_order_id: string | null; stato: DDTStato }[] = [];
      for (let da = 0; ; da += 1000) {
        const { data: pagina, error } = await supabase
          .from("ddt_ricezione")
          .select("id, purchase_order_id, stato")
          .eq("company_id", companyId!)
          .not("purchase_order_id", "is", null)
          .order("id")
          .range(da, da + 999);
        if (error) throw error;
        data.push(...((pagina ?? []) as unknown as { purchase_order_id: string | null; stato: DDTStato }[]));
        if (!pagina || pagina.length < 1000) break;
      }

      const map: Record<string, DDTCountAggregate> = {};
      for (const row of data || []) {
        const pid = (row as { purchase_order_id: string | null }).purchase_order_id;
        // Le bolle senza ODA non hanno un ordine da contare: senza questo
        // controllo finivano tutte in un badge con chiave "undefined".
        if (!pid) continue;
        if (!map[pid]) {
          map[pid] = {
            purchase_order_id: pid,
            total: 0,
            ricevuti: 0,
            parziali: 0,
            attesa: 0,
            verificati: 0,
            non_conformi: 0,
          };
        }
        map[pid].total += 1;
        const stato = (row as { stato: DDTStato }).stato;
        if (stato === "ricevuto") map[pid].ricevuti += 1;
        else if (stato === "verificato") map[pid].verificati += 1;
        else if (stato === "parziale") map[pid].parziali += 1;
        else if (stato === "attesa" || stato === "atteso") map[pid].attesa += 1;
        else if (stato === "non_conforme") map[pid].non_conformi += 1;
      }
      return map;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================
export const MESSAGGIO_STATO_NON_AGGIORNATO =
  "Ricezione rimossa, ma lo stato dell'articolo non si è aggiornato. Ricarica la pagina e controlla l'articolo.";

/** Lo stato dell'articolo calcolato dalle ricezioni che restano dopo una cancellazione. */
export function statoDopoRicezioniRimaste(rimaste: { quantity_received?: number | null }[]) {
  const somma = rimaste.reduce((acc, r) => acc + Number(r.quantity_received ?? 0), 0);
  return somma > 0
    ? { quantity_received: somma, fulfillment_status: "received" as const, last_goods_receipt_date: new Date().toISOString() }
    : { quantity_received: 0, fulfillment_status: "not_started" as const, receipt_id: null as string | null };
}

/**
 * Il vincolo del database detto in italiano. Senza questa traduzione l'utente
 * vedeva «duplicate key value violates unique constraint
 * ddt_ricezione_una_bolla_per_fornitore», che non dice che cosa fare.
 */
export function messaggioBolla(err: unknown, predefinito: string): string {
  const e = err as { code?: string; message?: string } | null;
  const testo = e?.message ?? "";
  if (e?.code === "23505" || testo.includes("una_bolla_per_fornitore")) {
    return "Questa bolla di questo fornitore è già stata caricata: cercala nell'elenco invece di rifarla.";
  }
  if (testo.includes("cantiere_ha_commessa")) {
    return "Per dire che la merce va in cantiere serve la commessa: scegli il cantiere.";
  }
  if (testo.includes("costo_una_volta_sola")) {
    return "Questa bolla ha un ordine d'acquisto: il costo è già sull'ordine e non si registra due volte.";
  }
  if (testo.includes("cantiere_non_carica_magazzino")) {
    return "La merce posata in cantiere non entra in giacenza: non si può caricarla a magazzino.";
  }
  return testo || predefinito;
}

export function useDDTRicezioneMutations(poId?: string | null) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const invalidateAll = () => {
    refreshMaterialQueries(queryClient);
    // Performance: invalidazioni minimali e mirate.
    // Prima: 8 invalidateQueries con duplicati (`ddtRicezione.all` == `["ddt-ricezione"]`)
    // e prefix troppo broad (`["warehouse"]` matcha 20+ query del magazzino,
    // tutte quelle del kanban/list/stats/calendar) → cascade refetch storm
    // ad ogni create/update/delete DDT.
    // Ora: 1 prefix DDT + 2 prefix warehouse specifici + PO detail mirati.
    // staleTime dei consumer copre il resto senza forzare refetch immediato.
    queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.all });
    // un arrivo cambia giacenze, movimenti e stato/«Arrivato» degli ordini:
    // le chiavi vere (["warehouse-stock"] e ["warehouse-movements"] non
    // corrispondevano a nessuna query)
    queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.all });
    queryClient.invalidateQueries({ queryKey: ["warehouse-movements-registry"] });
    queryClient.invalidateQueries({ queryKey: ["magazzino-live"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    if (poId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) });
    }
  };

  const createDDT = useMutation({
    mutationFn: async (params: {
      /** Facoltativo: in cantiere la merce arriva anche senza ordine. */
      purchase_order_id?: string | null;
      /** La commessa su cui va la merce, quando l'ODA non c'è. */
      order_id?: string | null;
      /** Chi ha consegnato, quando l'ODA non c'è. */
      supplier_id?: string | null;
      /** Dove va la merce: «cantiere» esige una commessa (lo impone il database). */
      destinazione?: "magazzino" | "cantiere";
      /** Chi ha portato la merce; «noi» vuol dire che siamo andati a ritirarla. */
      trasporto_a_cura_di?: "fornitore" | "noi" | "terzi" | null;
      porto?: "franco" | "assegnato" | null;
      /** Le righe lette sulla bolla (dall'AI o a mano). */
      righe?: DDTRigaNuova[];
      /** La lettura grezza dell'AI, per rileggerla senza ripagarla. */
      ai_lettura?: Record<string, unknown> | null;
      ai_confidenza?: number | null;
      ai_avvisi?: string[] | null;
      numero_ddt: string;
      data_ricezione: string;
      quantita_ricevuta: number;
      stato: DDTStato;
      note?: string | null;
      warehouse_id?: string | null;
      // ── Procedural ─────────────────────────────
      corriere?: string | null;
      targa_mezzo?: string | null;
      autista_nome?: string | null;
      autista_telefono?: string | null;
      ora_arrivo?: string | null;
      ora_partenza?: string | null;
      ricevuto_da_nome?: string | null;
      non_conformita?: string | null;
      has_damages?: boolean;
    }) => {
      if (!companyId) throw new Error("Company non disponibile");
      if (!params.numero_ddt.trim()) throw new Error("Numero DDT obbligatorio");
      const odaId = params.purchase_order_id ?? null;

      let warehouseId = params.warehouse_id ?? null;
      if (!warehouseId && odaId) {
        const { data: po } = await supabase
          .from("purchase_orders")
          .select("delivery_warehouse_id")
          .eq("id", odaId)
          .single();
        warehouseId = (po as { delivery_warehouse_id?: string | null })?.delivery_warehouse_id ?? null;
      }
      if (!warehouseId) {
        const { data: defWh } = await supabase
          .from("warehouses")
          .select("id")
          .eq("company_id", companyId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        warehouseId = (defWh as { id?: string })?.id ?? null;
      }
      if (!warehouseId) {
        throw new Error(
          "Nessun magazzino disponibile: impostare un magazzino di default per l'azienda"
        );
      }

      const user = (await supabase.auth.getUser()).data.user;
      const payload: Record<string, unknown> = {
        company_id: companyId,
        purchase_order_id: odaId,
        order_id: params.order_id ?? null,
        supplier_id: params.supplier_id ?? null,
        destinazione: params.destinazione ?? "magazzino",
        trasporto_a_cura_di: params.trasporto_a_cura_di ?? null,
        porto: params.porto ?? null,
        warehouse_id: warehouseId,
        numero_ddt: params.numero_ddt.trim(),
        data_ricezione: params.data_ricezione,
        // Con l'ODA la quantità la scrive oda_registra_arrivo sommando le righe:
        // partire dal numero digitato la conterebbe due volte. Senza ODA non
        // c'è nessun residuo d'ordine, e la quantità è quella della bolla.
        quantita_ricevuta:
          odaId && (params.stato === "ricevuto" || params.stato === "verificato")
            ? 0
            : params.quantita_ricevuta,
        // Con l'ODA «ricevuto completo» nasce «atteso»: lo stato vero lo scrive
        // la funzione dell'arrivo, così se l'arrivo non va a buon fine la bolla
        // non resta «ricevuta» senza merce. Senza ODA lo stato è quello scelto.
        stato:
          odaId && (params.stato === "ricevuto" || params.stato === "verificato")
            ? "atteso"
            : params.stato,
        note: params.note?.trim() || null,
        created_by: user?.id ?? null,
        corriere: params.corriere?.trim() || null,
        targa_mezzo: params.targa_mezzo?.trim() || null,
        autista_nome: params.autista_nome?.trim() || null,
        autista_telefono: params.autista_telefono?.trim() || null,
        ora_arrivo: params.ora_arrivo || null,
        ora_partenza: params.ora_partenza || null,
        ricevuto_da_nome: params.ricevuto_da_nome?.trim() || null,
        non_conformita: params.non_conformita?.trim() || null,
        has_damages: params.has_damages ?? false,
        ai_lettura: params.ai_lettura ?? null,
        ai_confidenza: params.ai_confidenza ?? null,
        ai_avvisi: params.ai_avvisi && params.ai_avvisi.length > 0 ? params.ai_avvisi : null,
      };

      const { data, error } = await supabase
        .from("ddt_ricezione")
        .insert(payload as never)
        .select()
        .single();
      if (error) throw error;

      const ddtId = (data as { id: string }).id;

      // ── Lo stesso documento segnato anche dall'operaio ──────────────────
      // Il controllo dei doppioni di `campo_acquisto_registra` guarda SOLO
      // `campo_acquisti`: la merce segnata dal cantiere e la bolla caricata
      // dall'ufficio non si vedono fra loro. Qui non si blocca niente — la
      // bolla dell'ufficio è il documento vero — ma non si tace: sono due
      // registrazioni della stessa consegna, e vanno riconciliate.
      if (params.numero_ddt.trim()) {
        const { data: dalCampo } = await db
          .from("campo_acquisti")
          .select("id, fornitore, totale, order_id")
          .eq("company_id", companyId)
          .eq("numero_documento", params.numero_ddt.trim())
          .not("stato", "in", "(rifiutato,annullato)")
          .limit(1);
        const segnato = (dalCampo ?? [])[0] as { fornitore?: string | null } | undefined;
        if (segnato) {
          toast.warning("Questo documento l'ha già segnato un operaio dal cantiere", {
            description: `«Merce presa» da ${segnato.fornitore ?? "fornitore ignoto"} con lo stesso numero: controlla di non contarla due volte.`,
            duration: 10000,
          });
        }
      }

      // Le righe lette sulla bolla, subito: sono il documento, non un extra.
      // Se non entrano si avvisa, ma la bolla resta (meglio una bolla senza
      // righe che nessuna bolla).
      if (params.righe && params.righe.length > 0) {
        const { error: errRighe } = await db
          .from("ddt_righe")
          .insert(params.righe.map((r) => ({ ...r, ddt_ricezione_id: ddtId })) as never);
        if (errRighe) {
          toast.warning("DDT registrato, ma le righe della merce non si sono salvate", {
            description: errRighe.message,
          });
        }
      }

      // Con un ODA, «ricevuto completo» vuol dire che è arrivato tutto il
      // residuo: si registrano le quantità riga per riga, agganciate a QUESTA
      // bolla, con la stessa funzione del foglio «arrivo merce». È lei a portare
      // l'ordine a ricevuto (e il costo sulla commessa), a caricare il magazzino
      // e a scrivere lo stato della bolla. Prima qui si scriveva solo lo stato:
      // ordine ricevuto, costo pieno in commessa, nessuna quantità, niente
      // magazzino. Se l'arrivo non riesce la bolla resta «attesa» e lo si dice.
      if (odaId && (params.stato === "ricevuto" || params.stato === "verificato")) {
        try {
          const esito = await riceviResiduoOda({
            companyId,
            odaId,
            ddtId,
            data: params.data_ricezione,
            warehouseId,
            note: params.note?.trim() || null,
          });
          if (esito.senzaRighe || (esito.righe === 0 && esito.completo)) {
            // ordine senza righe (o già tutto arrivato): niente da contare, lo stato si mette qui
            const { error: errOda } = await supabase.from("purchase_orders")
              .update({ status: "ricevuto", actual_delivery_date: params.data_ricezione })
              .eq("id", odaId)
              .not("status", "in", "(ricevuto,annullato)");
            if (errOda) throw errOda;
            await supabase.from("ddt_ricezione").update({ stato: params.stato } as never).eq("id", ddtId);
          } else if (params.stato === "verificato") {
            await supabase.from("ddt_ricezione").update({ stato: "verificato" } as never).eq("id", ddtId);
          }
          if (!esito.senzaRighe && !esito.completo) {
            toast.warning("DDT registrato, ma l'ordine non è completo: alcune righe non sono entrate.");
          }
        } catch (e) {
          toast.warning("DDT registrato come «atteso»: l'arrivo non si è registrato", {
            description: (e as { message?: string })?.message ?? "Registralo dalla scheda dell'ordine.",
          });
        }
      }
      return data as unknown as DDTRicezione;
    },
    onSuccess: () => {
      toast.success("DDT registrato");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(messaggioBolla(err, "Errore registrazione DDT")),
  });

  const updateDDT = useMutation({
    mutationFn: async (params: { id: string; updates: Partial<DDTRicezione> }) => {
      const { data: prima } = await supabase
        .from("ddt_ricezione")
        .select("stato, purchase_order_id, warehouse_id, data_ricezione")
        .eq("id", params.id)
        .maybeSingle();

      // Una bolla che diventa «ricevuto completo» porta con sé il residuo
      // dell'ordine, come alla creazione. «Verificato» no: dice che la merce
      // arrivata è stata controllata, non che è arrivata tutta.
      // Solo da «atteso»: da parziale, verificato o non conforme la merce arrivata
      // è già registrata, e il residuo di tutto l'ordine entrerebbe senza esserci
      // (5 pezzi arrivati su 10 → ne risultavano 10). Lì cambia solo l'etichetta.
      const diventaRicevuta = !!companyId && !!prima && params.updates.stato === "ricevuto"
        && (prima.stato === "atteso" || prima.stato === "attesa");
      if (!diventaRicevuta) {
        const { error } = await supabase.from("ddt_ricezione").update(params.updates as never).eq("id", params.id);
        if (error) throw error;
        return;
      }

      // Prima gli altri campi, senza stato e quantità: lo stato lo scrive la
      // funzione dell'arrivo e la quantità è la somma delle righe (quella
      // digitata si sarebbe sommata due volte). Se l'arrivo fallisce la bolla
      // non risulta «ricevuta» e si può riprovare.
      const { stato: _stato, quantita_ricevuta: _q, ...altri } = params.updates;
      if (Object.keys(altri).length > 0) {
        const { error } = await supabase.from("ddt_ricezione").update(altri as never).eq("id", params.id);
        if (error) throw error;
      }
      const esito = await riceviResiduoOda({
        companyId: companyId!,
        odaId: prima!.purchase_order_id,
        ddtId: params.id,
        // i valori nuovi, se cambiati nella stessa modifica
        data: (altri as { data_ricezione?: string }).data_ricezione ?? prima!.data_ricezione,
        warehouseId: (altri as { warehouse_id?: string | null }).warehouse_id ?? prima!.warehouse_id,
      });
      if (esito.senzaRighe || (esito.righe === 0 && esito.completo)) {
        const { error } = await supabase.from("ddt_ricezione").update({ stato: "ricevuto" } as never).eq("id", params.id);
        if (error) throw error;
      }
      if (!esito.senzaRighe && !esito.completo) {
        toast.warning("L'ordine non è completo: alcune righe non sono entrate.");
      }
    },
    onSuccess: () => {
      toast.success("DDT aggiornato");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(messaggioBolla(err, "Errore aggiornamento DDT")),
  });

  const deleteDDT = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ddt_ricezione").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("DDT eliminato");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Errore eliminazione DDT"),
  });

  const createGoodsReceipt = useMutation({
    mutationFn: async (params: {
      ddt_ricezione_id: string;
      order_item_id: string;
      quantity_received: number;
      warehouse_id?: string | null;
      supplier_id?: string | null;
      quality_check_status?: "ok" | "damaged" | "partial" | "pending";
      quality_notes?: string | null;
      ddt_number?: string | null;
      notes?: string | null;
    }) => {
      if (!companyId) throw new Error("Company non disponibile");
      if (params.quantity_received <= 0)
        throw new Error("La quantità deve essere maggiore di zero");

      let warehouseId = params.warehouse_id ?? null;
      if (!warehouseId) {
        const { data: ddt } = await supabase
          .from("ddt_ricezione")
          .select("warehouse_id")
          .eq("id", params.ddt_ricezione_id)
          .single();
        warehouseId = (ddt as { warehouse_id?: string | null })?.warehouse_id ?? null;
      }
      if (!warehouseId) {
        throw new Error("Warehouse non specificato e DDT senza magazzino");
      }

      const { data: receiptId, error } = await supabase.rpc(
        "insert_goods_receipt_atomic",
        {
          p_order_item_id: params.order_item_id,
          p_warehouse_id: warehouseId,
          p_quantity_received: params.quantity_received,
          p_quality_check_status: params.quality_check_status ?? "ok",
          p_supplier_id: params.supplier_id ?? null,
          p_ddt_number: params.ddt_number ?? null,
          p_ddt_photo_url: null,
          p_ddt_ricezione_id: params.ddt_ricezione_id,
          p_quality_notes: params.quality_notes ?? null,
          p_notes: params.notes ?? null,
        } as never,
      );
      if (error) throw error;
      return { id: receiptId as string };
    },
    onSuccess: () => {
      toast.success("Ricezione merce registrata");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Errore registrazione ricezione"),
  });

  const deleteGoodsReceipt = useMutation({
    mutationFn: async (id: string) => {
      // Dopo la cancellazione lo stato dell'articolo si ricalcola dalle
      // ricezioni rimaste:
      //   - somma > 0 → quantity_received = somma, fulfillment_status='received'
      //   - somma = 0 → quantity_received = 0, fulfillment_status='not_started'
      //                 (il valore di partenza ammesso dal vincolo), receipt_id = NULL
      // Ogni errore di lettura o di scrittura arriva all'utente: la ricezione
      // è già tolta, e l'avviso dice che lo stato dell'articolo va ricontrollato.
      const { data: receiptRow, error: lookupErr } = await supabase
        .from("goods_receipts")
        .select("order_item_id")
        .eq("id", id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      const orderItemId = receiptRow?.order_item_id ?? null;

      const { error: delErr } = await supabase.from("goods_receipts").delete().eq("id", id);
      if (delErr) throw delErr;

      if (orderItemId) {
        const { data: remaining, error: remainingErr } = await supabase
          .from("goods_receipts")
          .select("quantity_received")
          .eq("order_item_id", orderItemId);
        if (remainingErr) throw new Error(MESSAGGIO_STATO_NON_AGGIORNATO);
        const { error: updErr } = await supabase
          .from("order_items")
          .update(statoDopoRicezioniRimaste(remaining ?? []) as never)
          .eq("id", orderItemId);
        if (updErr) throw new Error(MESSAGGIO_STATO_NON_AGGIORNATO);
      }
    },
    onSuccess: () => {
      toast.success("Ricezione rimossa");
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore rimozione ricezione");
      // La cancellazione può essere già avvenuta: si rileggono comunque i dati.
      invalidateAll();
    },
  });

  return {
    createDDT,
    updateDDT,
    deleteDDT,
    createGoodsReceipt,
    deleteGoodsReceipt,
  };
}

// ============================================================================
// ATTACHMENTS — upload/delete allegati DDT (bucket: ddt_attachments)
// ----------------------------------------------------------------------------
// Convenzione path: {company_id}/{ddt_id}/{uuid}-{filename}
// ============================================================================
export function useDDTAttachments(ddtId?: string | null) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.all });
    if (ddtId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.detail(ddtId) });
    }
  };

  const sanitizeName = (n: string) =>
    n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

  /**
   * Upload di un singolo file nello storage bucket con path per-company/per-ddt.
   * Restituisce il signed URL (1 ora) + path storage per futuri delete.
   */
  const uploadToStorage = async (
    file: File,
    targetDdtId: string,
  ): Promise<{ url: string; path: string; name: string; mime: string; size: number }> => {
    if (!companyId) throw new Error("Company non disponibile");
    const uuid = crypto.randomUUID();
    const safeName = sanitizeName(file.name);
    const path = `${companyId}/${targetDdtId}/${uuid}-${safeName}`;

    const { error: upErr } = await supabase.storage
      .from("ddt_attachments")
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (upErr) throw upErr;

    const { data: signed, error: signErr } = await supabase.storage
      .from("ddt_attachments")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 anno
    if (signErr) throw signErr;

    return {
      url: signed.signedUrl,
      path,
      name: file.name,
      mime: file.type,
      size: file.size,
    };
  };

  /**
   * Upload del file DDT principale (ddt_file_url/name/mime columns).
   * Usato nel wizard o nel detail "sostituisci documento DDT".
   */
  const uploadMainDDT = useMutation({
    mutationFn: async (params: { ddtId: string; file: File }) => {
      const uploaded = await uploadToStorage(params.file, params.ddtId);
      const { error } = await supabase
        .from("ddt_ricezione")
        .update({
          ddt_file_url: uploaded.url,
          ddt_file_name: uploaded.name,
          ddt_file_mime: uploaded.mime,
        } as never)
        .eq("id", params.ddtId);
      if (error) throw error;
      return uploaded;
    },
    onSuccess: () => {
      toast.success("Documento DDT caricato");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Errore upload DDT"),
  });

  /**
   * Aggiunge uno o più allegati al JSONB attachments.
   */
  const uploadAttachments = useMutation({
    mutationFn: async (params: {
      ddtId: string;
      files: { file: File; kind: DDTAttachmentKind }[];
    }) => {
      const uploaded: DDTAttachment[] = [];
      for (const { file, kind } of params.files) {
        const res = await uploadToStorage(file, params.ddtId);
        uploaded.push({
          url: res.url,
          path: res.path,
          name: res.name,
          mime: res.mime,
          size: res.size,
          kind,
          uploaded_at: new Date().toISOString(),
        });
      }

      const { data: row, error: fetchErr } = await supabase
        .from("ddt_ricezione")
        .select("attachments")
        .eq("id", params.ddtId)
        .single();
      if (fetchErr) throw fetchErr;

      const existing =
        ((row as unknown as { attachments?: DDTAttachment[] })?.attachments as DDTAttachment[]) || [];
      const merged = [...existing, ...uploaded];

      const { error } = await supabase
        .from("ddt_ricezione")
        .update({ attachments: merged } as never)
        .eq("id", params.ddtId);
      if (error) throw error;
      return uploaded;
    },
    onSuccess: (data) => {
      toast.success(`${data.length} allegat${data.length === 1 ? "o" : "i"} caricat${data.length === 1 ? "o" : "i"}`);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Errore upload allegato"),
  });

  /**
   * Upload firma digitale (dataURL da SignaturePad o file).
   */
  const uploadSignature = useMutation({
    mutationFn: async (params: { ddtId: string; file: File }) => {
      const uploaded = await uploadToStorage(params.file, params.ddtId);
      const { error } = await supabase
        .from("ddt_ricezione")
        .update({ signature_url: uploaded.url } as never)
        .eq("id", params.ddtId);
      if (error) throw error;
      return uploaded;
    },
    onSuccess: () => {
      toast.success("Firma salvata");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Errore salvataggio firma"),
  });

  /**
   * Rimuove un allegato dal JSONB + dallo storage.
   */
  const deleteAttachment = useMutation({
    mutationFn: async (params: { ddtId: string; path: string }) => {
      const { data: row, error: fetchErr } = await supabase
        .from("ddt_ricezione")
        .select("attachments")
        .eq("id", params.ddtId)
        .single();
      if (fetchErr) throw fetchErr;

      const existing =
        ((row as unknown as { attachments?: DDTAttachment[] })?.attachments as DDTAttachment[]) || [];
      const filtered = existing.filter((a) => a.path !== params.path);

      const { error: upErr } = await supabase
        .from("ddt_ricezione")
        .update({ attachments: filtered } as never)
        .eq("id", params.ddtId);
      if (upErr) throw upErr;

      // Best-effort storage delete (non-blocking)
      void supabase.storage.from("ddt_attachments").remove([params.path]);
      return true;
    },
    onSuccess: () => {
      toast.success("Allegato rimosso");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Errore rimozione allegato"),
  });

  return {
    uploadMainDDT,
    uploadAttachments,
    uploadSignature,
    deleteAttachment,
  };
}
