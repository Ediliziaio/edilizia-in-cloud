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
  purchase_order_id: string;
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
}

export interface DDTRicezioneWithJoins extends DDTRicezione {
  purchase_orders?: {
    id: string;
    oda_number: string;
    status: string;
    order_id: string | null;
    suppliers?: { name: string; email?: string | null } | null;
    orders?: { id: string; order_code: string } | null;
  } | null;
  warehouses?: { id: string; name: string } | null;
}

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
      let q = supabase
        .from("ddt_ricezione")
        .select(
          "*, purchase_orders!inner(id, oda_number, status, order_id, supplier_id, suppliers(name, email), orders(id, order_code)), warehouses(id, name)"
        )
        .eq("company_id", companyId!)
        .order("data_ricezione", { ascending: false });

      if (filters?.stato && filters.stato !== "all") {
        q = q.eq("stato", filters.stato);
      }
      if (filters?.purchaseOrderId) {
        q = q.eq("purchase_order_id", filters.purchaseOrderId);
      }
      if (filters?.warehouseId) {
        q = q.eq("warehouse_id", filters.warehouseId);
      }
      if (filters?.fromDate) {
        q = q.gte("data_ricezione", filters.fromDate);
      }
      if (filters?.toDate) {
        q = q.lte("data_ricezione", filters.toDate);
      }

      // Safety cap: prima NESSUN limit → su azienda con >1000 DDT caricava
      // tutto con join 4-tabelle (PO + suppliers + orders + warehouses) →
      // payload enorme + parsing/render slow + RAM spike.
      // Ordine già DESC su data_ricezione → tieni i 500 più recenti.
      // Per storici > 500 servirà infinite scroll dedicato (TODO future).
      q = q.limit(500);

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data || []) as unknown as DDTRicezioneWithJoins[];

      if (filters?.supplierId) {
        rows = rows.filter(
          (r) => (r.purchase_orders as unknown as { supplier_id?: string })?.supplier_id === filters.supplierId
        );
      }

      return rows;
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
          "*, purchase_orders(id, oda_number, status, order_id, supplier_id, suppliers(name, email), orders(id, order_code)), warehouses(id, name)"
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
// COUNTS BY PO
// ============================================================================
export function useDDTCountsByPO() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery<Record<string, DDTCountAggregate>>({
    queryKey: queryKeys.ddtRicezione.countsByPO(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ddt_ricezione")
        .select("purchase_order_id, stato")
        .eq("company_id", companyId!);
      if (error) throw error;

      const map: Record<string, DDTCountAggregate> = {};
      for (const row of data || []) {
        const pid = (row as { purchase_order_id: string }).purchase_order_id;
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
export function useDDTRicezioneMutations(poId?: string | null) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const invalidateAll = () => {
    // Performance: invalidazioni minimali e mirate.
    // Prima: 8 invalidateQueries con duplicati (`ddtRicezione.all` == `["ddt-ricezione"]`)
    // e prefix troppo broad (`["warehouse"]` matcha 20+ query del magazzino,
    // tutte quelle del kanban/list/stats/calendar) → cascade refetch storm
    // ad ogni create/update/delete DDT.
    // Ora: 1 prefix DDT + 2 prefix warehouse specifici + PO detail mirati.
    // staleTime dei consumer copre il resto senza forzare refetch immediato.
    queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.all });
    queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
    queryClient.invalidateQueries({ queryKey: ["warehouse-movements"] });
    if (poId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) });
    }
  };

  const createDDT = useMutation({
    mutationFn: async (params: {
      purchase_order_id: string;
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

      let warehouseId = params.warehouse_id ?? null;
      if (!warehouseId) {
        const { data: po } = await supabase
          .from("purchase_orders")
          .select("delivery_warehouse_id")
          .eq("id", params.purchase_order_id)
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
        purchase_order_id: params.purchase_order_id,
        warehouse_id: warehouseId,
        numero_ddt: params.numero_ddt.trim(),
        data_ricezione: params.data_ricezione,
        quantita_ricevuta: params.quantita_ricevuta,
        stato: params.stato,
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
      };

      const { data, error } = await supabase
        .from("ddt_ricezione")
        .insert(payload as never)
        .select()
        .single();
      if (error) throw error;

      // Le due strade si parlano (fix 2026-09): un DDT "ricevuto completo"
      // registrava il documento ma lasciava l'OdA in bozza — e il costo in
      // commessa nasce dal trigger sul passaggio purchase_orders.status →
      // 'ricevuto' (trg_po_costo_da_ricezione). Qui il passaggio avviene.
      // Non bloccante: il DDT è già registrato, un errore qui non lo annulla.
      if (params.stato === "ricevuto" || params.stato === "verificato") {
        const { error: poErr } = await supabase
          .from("purchase_orders")
          .update({ status: "ricevuto" })
          .eq("id", params.purchase_order_id)
          .neq("status", "ricevuto")
          .neq("status", "annullato");
        if (poErr) {
          toast.warning("DDT registrato, ma lo stato dell'OdA non si è aggiornato: mettilo su 'Ricevuto' a mano per generare il costo.");
        }
      }
      return data as DDTRicezione;
    },
    onSuccess: () => {
      toast.success("DDT registrato");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Errore registrazione DDT"),
  });

  const updateDDT = useMutation({
    mutationFn: async (params: { id: string; updates: Partial<DDTRicezione> }) => {
      const { error } = await supabase
        .from("ddt_ricezione")
        .update(params.updates as never)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("DDT aggiornato");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Errore aggiornamento DDT"),
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
      // Bug pre-esistente: prima il DELETE eliminava SOLO la riga goods_receipts
      // lasciando order_items.fulfillment_status='received' + quantity_received
      // settati al valore della receipt cancellata → dati inconsistenti
      // (la riga risultava ricevuta ma senza prova).
      //
      // Fix: prima del DELETE leggiamo order_item_id, poi dopo il DELETE
      // ricalcoliamo da SUM delle ricezioni rimaste:
      //   - sum > 0 → quantity_received = sum, fulfillment_status='received'
      //   - sum == 0 → quantity_received=0, fulfillment_status='pending',
      //                receipt_id=NULL
      //
      // Soluzione corretta a lungo termine: RPC delete_goods_receipt_atomic.
      // Per ora client-side 3-step, fail-soft sull'UPDATE.
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
        try {
          const { data: remaining } = await supabase
            .from("goods_receipts")
            .select("quantity_received")
            .eq("order_item_id", orderItemId);
          const sumRemaining = (remaining ?? []).reduce(
            (acc, r) => acc + Number((r as { quantity_received?: number }).quantity_received ?? 0),
            0,
          );
          await supabase
            .from("order_items")
            .update(
              sumRemaining > 0
                ? {
                    quantity_received: sumRemaining,
                    fulfillment_status: "received" as never,
                    last_goods_receipt_date: new Date().toISOString(),
                  }
                : {
                    quantity_received: 0,
                    fulfillment_status: "pending" as never,
                    receipt_id: null,
                  } as never,
            )
            .eq("id", orderItemId);
        } catch (recalcErr) {
          // Non fatale: la receipt è stata cancellata, ma il fulfillment
          // status resta stale. L'utente vedrà il toast warning e potrà
          // sistemare manualmente.
          console.warn("[deleteGoodsReceipt] recalc fulfillment failed:", recalcErr);
        }
      }
    },
    onSuccess: () => {
      toast.success("Ricezione rimossa");
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message || "Errore rimozione ricezione"),
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
        ((row as { attachments?: DDTAttachment[] })?.attachments as DDTAttachment[]) || [];
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
        ((row as { attachments?: DDTAttachment[] })?.attachments as DDTAttachment[]) || [];
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
