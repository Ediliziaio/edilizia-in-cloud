import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export interface PurchaseOrder {
  id: string;
  company_id: string;
  supplier_id: string;
  oda_number: string;
  status: string;
  issue_date: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  order_id: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  payment_terms: string | null;
  payment_method: string | null;
  notes: string | null;
  internal_notes: string | null;
  attachment_url: string | null;
  supplier_reference: string | null;
  delivery_address: string | null;
  delivery_warehouse_id: string | null;
  sent_at: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_verification_id: string | null;
  // joined
  suppliers?: { name: string; email: string | null } | null;
  orders?: { order_code: string } | null;
  warehouses?: { name: string } | null;
  last_verification?: { result: string | null } | null;
}

export interface PurchaseOrderItem {
  id: string;
  company_id: string;
  purchase_order_id: string;
  description: string;
  sku: string | null;
  unit_of_measure: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  line_total: number;
  vat_amount: number;
  quantity_received: number;
  received_date: string | null;
  article_template_id: string | null;
  order_item_id: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export function usePurchaseOrders() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const listQuery = useQuery({
    queryKey: queryKeys.purchaseOrders.list(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(name, email), orders(order_code), warehouses(name), last_verification:purchase_order_verifications!last_verification_id(result)")
        .eq("company_id", companyId!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data as unknown as PurchaseOrder[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (params: {
      supplier_id: string;
      notes?: string;
      expected_delivery_date?: string;
      delivery_warehouse_id?: string | null;
      /** Come e' stato piazzato l'ordine — vedi @/lib/odaOrigine. */
      origine?: string;
      /** Numero d'ordine sul sito del fornitore, o dello scontrino. */
      supplier_reference?: string | null;
      /** Commessa per cui si compra. Null = acquisto generico (magazzino). */
      order_id?: string | null;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId!,
          supplier_id: params.supplier_id,
          notes: params.notes || null,
          expected_delivery_date: params.expected_delivery_date || null,
          delivery_warehouse_id: params.delivery_warehouse_id || null,
          origine: params.origine || "email",
          supplier_reference: params.supplier_reference || null,
          order_id: params.order_id || null,
          created_by: user?.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Ordine d'acquisto creato");
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (params: { id: string; status: string; actual_delivery_date?: string }) => {
      const updates: any = { status: params.status };
      if (params.actual_delivery_date) updates.actual_delivery_date = params.actual_delivery_date;
      // Timestamp di passaggio stato: prima non li scriveva nessuno, quindi i
      // merge-field {{ordine_acquisto.sent_at}} dei template erano sempre vuoti.
      if (params.status === "inviato") updates.sent_at = new Date().toISOString();
      if (params.status === "confermato") updates.confirmed_at = new Date().toISOString();
      const { error } = await supabase.from("purchase_orders").update(updates).eq("id", params.id);
      if (error) throw error;

      // Quando l'ODA viene marcato come ricevuto, il carico lo fa il database.
      //
      // Qui prima si leggeva la giacenza nel browser, ci si sommava la quantità
      // e si riscriveva un valore ASSOLUTO, poi si inseriva il movimento a
      // parte. Due ricezioni in parallelo e una delle due spariva; e se la
      // seconda scrittura falliva, giacenza e movimenti restavano divergenti.
      // È il meccanismo che ha prodotto gli otto articoli fuori quadratura per
      // 388 pezzi che si vedono ancora oggi in produzione.
      //
      // `oda_registra_arrivo` fa tutto in una transazione — quantità ricevute,
      // carico, movimenti, avanzamento dell'ordine e stato della merce sul
      // ticket collegato — ed è la stessa funzione che usa il foglio «arrivo
      // merce». Un solo percorso di carico, che era il punto.
      //
      // Qui resta solo l'abbinamento riga → articolo (per codice interno,
      // barcode, poi nome; se non esiste lo si crea), perché la funzione vuole
      // già gli `stock_item_id` risolti.
      if (params.status === "ricevuto") {
        const { data: odaData } = await supabase
          .from("purchase_orders")
          .select("delivery_warehouse_id, supplier_id")
          .eq("id", params.id)
          .single();

        const { data: items } = await supabase
          .from("purchase_order_items")
          .select("id, description, sku, quantity, quantity_received, unit_price, vat_rate")
          .eq("purchase_order_id", params.id);

        const warehouseId = odaData?.delivery_warehouse_id ?? null;
        const righe: Array<{ item_id: string; quantity: number; stock_item_id: string | null }> = [];

        for (const item of items ?? []) {
          // Solo il residuo: se una parte è già arrivata via scan, ricaricare
          // la quantità piena raddoppierebbe la giacenza.
          const qtyToLoad = Number(item.quantity) - (Number(item.quantity_received) || 0);
          if (qtyToLoad <= 0) continue;

          let stockItemId: string | null = null;

          if (item.sku) {
            // Lo SKU si confronta con codice interno o barcode, NON col nome:
            // il vecchio ilike("name", sku) non trovava mai nulla e a ogni
            // ricezione nasceva un articolo duplicato in inventario.
            // Due eq separati invece di .or(): lo SKU è testo libero e dentro
            // la sintassi di .or() virgole e parentesi la romperebbero.
            const { data: byCode } = await supabase
              .from("warehouse_stock").select("id")
              .eq("company_id", companyId!).eq("internal_code", item.sku)
              .limit(1).maybeSingle();
            stockItemId = byCode?.id ?? null;
            if (!stockItemId) {
              const { data: byBarcode } = await supabase
                .from("warehouse_stock").select("id")
                .eq("company_id", companyId!).eq("barcode", item.sku)
                .limit(1).maybeSingle();
              stockItemId = byBarcode?.id ?? null;
            }
          }

          if (!stockItemId && item.description) {
            const { data: byName } = await supabase
              .from("warehouse_stock").select("id")
              .eq("company_id", companyId!).ilike("name", item.description)
              .maybeSingle();
            stockItemId = byName?.id ?? null;
          }

          if (!stockItemId && item.description) {
            const { data: creato, error: errCreazione } = await supabase
              .from("warehouse_stock")
              .insert({
                company_id: companyId!,
                warehouse_id: warehouseId,
                name: item.description,
                description: item.sku ? `SKU ${item.sku}` : null,
                quantity: 0, // la quantità la mette la funzione, con il movimento
                unit_cost: Number(item.unit_price ?? 0),
                vat_rate: Number(item.vat_rate ?? 22),
                supplier_id: odaData?.supplier_id ?? null,
                min_stock_level: 0,
              } as never)
              .select("id")
              .single();
            if (errCreazione) throw errCreazione;
            stockItemId = creato?.id ?? null;
          }

          righe.push({ item_id: item.id, quantity: qtyToLoad, stock_item_id: stockItemId });
        }

        if (righe.length > 0) {
          const { error: errArrivo } = await supabase.rpc("oda_registra_arrivo", {
            p_oda_id: params.id,
            p_righe: righe as never,
            p_ddt_number: null,
            p_ddt_data: params.actual_delivery_date ?? null,
            p_warehouse_id: warehouseId,
            p_note: "Ordine segnato come ricevuto dalla scheda",
            p_ddt_file_url: null,
          });
          if (errArrivo) throw errArrivo;
        }
      }
    },
    onSuccess: (_data, variables) => {
      toast.success("Stato aggiornato");
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      // detail(undefined) produceva ["purchase-order-detail", undefined], che
      // non matcha nessuna query reale: il dettaglio restava stale dopo il
      // cambio stato. L'id ce l'abbiamo — usiamolo.
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(variables.id) });
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const updateMutation = useMutation({
    mutationFn: async (params: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("purchase_orders").update(params.updates).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.id) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return {
    orders: listQuery.data || [],
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    create: createMutation,
    updateStatus: updateStatusMutation,
    update: updateMutation,
  };
}

export function usePurchaseOrderDetail(poId: string | null) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const detailQuery = useQuery({
    queryKey: queryKeys.purchaseOrders.detail(poId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(name, email, iban, bank_name, payment_method, address, city, province, postal_code, vat_number), orders(order_code)")
        .eq("id", poId!)
        .single();
      if (error) throw error;
      return data as unknown as PurchaseOrder & { suppliers: any };
    },
    enabled: !!poId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const itemsQuery = useQuery({
    queryKey: queryKeys.purchaseOrders.items(poId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", poId!)
        .order("sort_order");
      if (error) throw error;
      return data as unknown as PurchaseOrderItem[];
    },
    enabled: !!poId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const addItemMutation = useMutation({
    mutationFn: async (params: Partial<PurchaseOrderItem> & { purchase_order_id: string }) => {
      const { error } = await supabase.from("purchase_order_items").insert({
        company_id: companyId!,
        purchase_order_id: params.purchase_order_id,
        description: params.description || "Nuovo articolo",
        quantity: params.quantity || 1,
        unit_price: params.unit_price || 0,
        vat_rate: params.vat_rate || 22,
        discount_percent: params.discount_percent || 0,
        unit_of_measure: params.unit_of_measure || "pz",
        sku: params.sku || null,
        sort_order: params.sort_order || 0,
        notes: params.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const updateItemMutation = useMutation({
    mutationFn: async (params: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("purchase_order_items").update(params.updates).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return {
    order: detailQuery.data || null,
    isLoading: detailQuery.isLoading,
    items: itemsQuery.data || [],
    isItemsLoading: itemsQuery.isLoading,
    addItem: addItemMutation,
    updateItem: updateItemMutation,
    deleteItem: deleteItemMutation,
  };
}
