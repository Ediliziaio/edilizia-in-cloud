// ============================================================================
// useDDTRicezione — Hooks per la gestione DDT fornitori
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
// ============================================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

// ── Types ───────────────────────────────────────────────────────────────────

export type DDTStato = "attesa" | "parziale" | "ricevuto";

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
}

export interface DDTRicezioneWithJoins extends DDTRicezione {
  purchase_orders?: {
    id: string;
    oda_number: string;
    status: string;
    order_id: string | null;
    suppliers?: { name: string } | null;
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
          "*, purchase_orders!inner(id, oda_number, status, order_id, supplier_id, suppliers(name), orders(id, order_code)), warehouses(id, name)"
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

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data || []) as unknown as DDTRicezioneWithJoins[];

      // Filtro client-side per supplier: richiederebbe un or() complesso server-side
      if (filters?.supplierId) {
        rows = rows.filter(
          (r) => (r.purchase_orders as any)?.supplier_id === filters.supplierId
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
// BY PURCHASE ORDER: DDT collegati a un singolo ODA
// ============================================================================
export function useDDTByPurchaseOrder(poId: string | null | undefined) {
  return useQuery<DDTRicezione[]>({
    queryKey: queryKeys.ddtRicezione.byPurchaseOrder(poId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ddt_ricezione")
        .select("*")
        .eq("purchase_order_id", poId!)
        .order("data_ricezione", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DDTRicezione[];
    },
    enabled: !!poId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// ============================================================================
// DETAIL: singolo DDT + goods_receipts collegate (via ddt_ricezione_id)
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
        .select("*, order_items(id, description, quantity, order_id)")
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
// COUNTS BY PO: aggregato DDT per ODA (per badge in liste)
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
        const pid = (row as any).purchase_order_id as string;
        if (!map[pid]) {
          map[pid] = {
            purchase_order_id: pid,
            total: 0,
            ricevuti: 0,
            parziali: 0,
            attesa: 0,
          };
        }
        map[pid].total += 1;
        const stato = (row as any).stato as DDTStato;
        if (stato === "ricevuto") map[pid].ricevuti += 1;
        else if (stato === "parziale") map[pid].parziali += 1;
        else if (stato === "attesa") map[pid].attesa += 1;
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
    queryClient.invalidateQueries({ queryKey: queryKeys.ddtRicezione.all });
    // Legacy key usato da PurchaseOrderDetail
    queryClient.invalidateQueries({ queryKey: ["ddt-ricezione"] });
    // Warehouse ricalcola stock/movimenti per via del trigger auto_carico
    queryClient.invalidateQueries({ queryKey: ["warehouse"] });
    queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
    queryClient.invalidateQueries({ queryKey: ["warehouse-movements"] });
    if (poId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
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
    }) => {
      if (!companyId) throw new Error("Company non disponibile");
      if (!params.numero_ddt.trim()) throw new Error("Numero DDT obbligatorio");

      // Se warehouse_id non passato, usa il default del PO → poi della company
      let warehouseId = params.warehouse_id ?? null;
      if (!warehouseId) {
        const { data: po } = await supabase
          .from("purchase_orders")
          .select("delivery_warehouse_id")
          .eq("id", params.purchase_order_id)
          .single();
        warehouseId = (po as any)?.delivery_warehouse_id ?? null;
      }
      if (!warehouseId) {
        const { data: defWh } = await supabase
          .from("warehouses")
          .select("id")
          .eq("company_id", companyId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle();
        warehouseId = (defWh as any)?.id ?? null;
      }
      if (!warehouseId) {
        throw new Error(
          "Nessun magazzino disponibile: impostare un magazzino di default per l'azienda"
        );
      }

      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase
        .from("ddt_ricezione")
        .insert({
          company_id: companyId,
          purchase_order_id: params.purchase_order_id,
          warehouse_id: warehouseId,
          numero_ddt: params.numero_ddt.trim(),
          data_ricezione: params.data_ricezione,
          quantita_ricevuta: params.quantita_ricevuta,
          stato: params.stato,
          note: params.note?.trim() || null,
          created_by: user?.id ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
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
        .update(params.updates as any)
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

  // Crea un goods_receipt legato al DDT: usa l'RPC atomica insert_goods_receipt_atomic
  // (stesso meccanismo di useGoodsReceipt) che aggiorna order_items + timeline in
  // transazione e triggera il carico stock via trigger DB.
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

      // warehouse_id dal DDT padre se non passato
      let warehouseId = params.warehouse_id ?? null;
      if (!warehouseId) {
        const { data: ddt } = await supabase
          .from("ddt_ricezione")
          .select("warehouse_id")
          .eq("id", params.ddt_ricezione_id)
          .single();
        warehouseId = (ddt as any)?.warehouse_id ?? null;
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
        } as any,
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
      const { error } = await supabase.from("goods_receipts").delete().eq("id", id);
      if (error) throw error;
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
