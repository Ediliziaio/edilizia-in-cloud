import type { Supplier } from "@/lib/suppliers/anagraficaFornitore";
import { condizioniPagamentoFornitore } from "@/lib/documentiOperativi/fornitore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { riceviResiduoOda } from "@/lib/orders/riceviResiduoOda";
import { readAllOrderRows } from "@/lib/orders/listScope";

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
  document_details?: Json;
  // joined
  suppliers?: Supplier | null;
  orders?: { work_address?: string | null; order_code: string; description?: string | null; deleted_at?: string | null } | null;
  /** solo nell'elenco: per «quanto è arrivato» senza aprire l'ordine */
  purchase_order_items?: Array<{ quantity: number | null; quantity_received: number | null; unit_price?: number | null }>;
  ddt_ricezione?: Array<{ count: number }>;
  warehouses?: { name: string } | null;
  last_verification?: { result: string | null } | null;
}

export interface PurchaseOrderItem {
  id: string;
  company_id: string;
  purchase_order_id: string;
  description: string;
  /** Rif., misure, colore e apertura: li scrive il database, solo per le righe su misura. */
  misure_testo?: string | null;
  riferimento?: string | null;
  misure_fonte?: string | null;
  misure?: Record<string, unknown> | null;
  colore?: string | null;
  apertura?: string | null;
  /** Prezzo ricavato da un'offerta a corpo, ripartita sui mq. */
  ripartito?: boolean;
  sku: string | null;
  unit_of_measure: string | null;
  quantity: number;
  unit_price: number;
  price_pending?: boolean;
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
      // tutte le pagine: con un .select() solo PostgREST si fermava a mille
      // ordini, e contatori, impegnato ed esportazione con lui
      const rows = await readAllOrderRows<PurchaseOrder>((da, a) => supabase
        .from("purchase_orders")
        .select("*, suppliers(name, email), orders(order_code, description, deleted_at), warehouses(name), last_verification:purchase_order_verifications!last_verification_id(result), purchase_order_items(quantity, quantity_received, unit_price), ddt_ricezione(count)")
        .eq("company_id", companyId!)
        .order("issue_date", { ascending: false })
        .order("id")
        .range(da, a) as unknown as PromiseLike<{ data: PurchaseOrder[] | null; error: unknown }>);
      return rows;
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
      /** Numero scritto a mano. Vuoto = lo assegna il database (generate_oda_number). */
      oda_number?: string | null;
    }) => {
      const {data:fornitore,error:erroreFornitore}=await supabase.from("suppliers").select("payment_method,termini_giorni,termini_fine_mese").eq("id",params.supplier_id).eq("company_id",companyId!).single();
      if(erroreFornitore) throw erroreFornitore;
      const condizioni = condizioniPagamentoFornitore(fornitore);
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId!,
          supplier_id: params.supplier_id,
          payment_terms: condizioni === "Da definire con il fornitore" ? null : condizioni,
          payment_method: fornitore.payment_method,
          notes: params.notes || null,
          expected_delivery_date: params.expected_delivery_date || null,
          delivery_warehouse_id: params.delivery_warehouse_id || null,
          origine: params.origine || "email",
          supplier_reference: params.supplier_reference || null,
          order_id: params.order_id || null,
          ...(params.oda_number?.trim() ? { oda_number: params.oda_number.trim() } : {}),
          created_by: user?.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Ordine d'acquisto creato");
      refreshMaterialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
    onError: (e) => {
      // Numero già usato: lo dice chi ha chiamato, con il numero.
      if ((e as { code?: string } | null)?.code === "23505") return;
      toast.error("Errore", { description: (e as { message?: string } | null)?.message ?? String(e) });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (params: { id: string; status: string; actual_delivery_date?: string }) => {
      // «Ricevuto» non è uno stato da scrivere: è merce che entra. Si
      // registrano le quantità (e il carico) con oda_registra_arrivo, ed è lei
      // a portare l'ordine a ricevuto quando tutte le righe sono coperte — e
      // solo allora nasce il costo sulla commessa. Prima qui si scriveva lo
      // stato e poi si registravano le righe: se la seconda parte falliva,
      // l'ordine restava ricevuto con il costo e senza merce.
      if (params.status === "ricevuto") {
        const esito = await riceviResiduoOda({
          companyId: companyId!,
          odaId: params.id,
          data: params.actual_delivery_date ?? null,
          note: "Ordine segnato come ricevuto dalla scheda",
        });
        // senza righe, o con le righe già tutte arrivate, non c'è niente da
        // contare: lo stato si mette a mano (il costo nasce dal trigger)
        if (esito.senzaRighe || (esito.righe === 0 && esito.completo)) {
          const { error } = await supabase.from("purchase_orders")
            .update({ status: "ricevuto", actual_delivery_date: params.actual_delivery_date ?? new Date().toLocaleDateString("en-CA") })
            .eq("id", params.id);
          if (error) throw error;
        } else if (!esito.completo) {
          // qualche riga non è entrata: l'ordine resta «parziale» e va detto,
          // non lasciato credere ricevuto
          toast.warning("Ordine non ancora completo", {
            description: esito.suMisura
              ? "Le posizioni su misura si spuntano una per una da «Arrivo merce per posizione»."
              : `${esito.errori.length || "Alcune"} ${esito.errori.length === 1 ? "riga non registrata" : "righe non registrate"}: controlla le righe dell'ordine.`,
          });
          return { completo: false };
        }
        return { completo: true };
      }

      const updates: any = { status: params.status };
      if (params.actual_delivery_date) updates.actual_delivery_date = params.actual_delivery_date;
      // Timestamp di passaggio stato: prima non li scriveva nessuno, quindi i
      // merge-field {{ordine_acquisto.sent_at}} dei template erano sempre vuoti.
      if (params.status === "inviato") updates.sent_at = new Date().toISOString();
      if (params.status === "confermato") updates.confirmed_at = new Date().toISOString();
      const { error } = await supabase.from("purchase_orders").update(updates).eq("id", params.id);
      if (error) throw error;
      return { completo: true };
    },
    onSuccess: (_data, variables) => {
      toast.success("Stato aggiornato");
      refreshMaterialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      // detail(undefined) produceva ["purchase-order-detail", undefined], che
      // non matcha nessuna query reale: il dettaglio restava stale dopo il
      // cambio stato. L'id ce l'abbiamo — usiamolo.
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(variables.id) });
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.stockAll });
      // un arrivo carica il magazzino: anche il registro movimenti e il pannello live
      if (variables.status === "ricevuto") {
        queryClient.invalidateQueries({ queryKey: ["warehouse-movements-registry"] });
        queryClient.invalidateQueries({ queryKey: ["magazzino-live"] });
      }
    },
    onError: (e) => toast.error("Errore", { description: (e as { message?: string } | null)?.message ?? String(e) }),
  });

  const updateMutation = useMutation({
    mutationFn: async (params: { id: string; updates: TablesUpdate<"purchase_orders"> }) => {
      if (!companyId) throw new Error("Sessione aziendale non disponibile. Accedi di nuovo.");
      const { error } = await supabase.from("purchase_orders").update(params.updates).eq("id", params.id).eq("company_id", companyId).select("id").single();
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      refreshMaterialQueries(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.id) }),
      ]);
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
        .select("*, suppliers(*), orders(order_code, work_address)")
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
        unit_price: params.price_pending || params.unit_price == null ? 0 : params.unit_price,
        price_pending: params.price_pending ?? params.unit_price == null,
        vat_rate: params.vat_rate ?? 22,
        discount_percent: params.discount_percent || 0,
        unit_of_measure: params.unit_of_measure || "pz",
        sku: params.sku || null,
        sort_order: params.sort_order || 0,
        notes: params.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      refreshMaterialQueries(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) }),
      ]);
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  /** Tutte le righe dell'ordine alla stessa aliquota: un solo UPDATE, per il reverse charge. */
  const impostaIvaRigheMutation = useMutation({
    mutationFn: async (aliquota: number) => {
      const { error } = await supabase.from("purchase_order_items").update({ vat_rate: aliquota }).eq("purchase_order_id", poId!);
      if (error) throw error;
    },
    onSuccess: async () => {
      refreshMaterialQueries(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) }),
      ]);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (params: { id: string; updates: TablesUpdate<"purchase_order_items"> }) => {
      const updates = {...params.updates,...(params.updates.unit_price != null && params.updates.price_pending === undefined ? {price_pending:false} : {})};
      const { error } = await supabase.from("purchase_order_items").update(updates).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      refreshMaterialQueries(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) }),
      ]);
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      refreshMaterialQueries(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.items(poId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) }),
      ]);
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return {
    order: detailQuery.data || null,
    isLoading: detailQuery.isLoading,
    items: itemsQuery.data || [],
    isItemsLoading: itemsQuery.isLoading,
    isItemsFetching: itemsQuery.isFetching,
    addItem: addItemMutation,
    updateItem: updateItemMutation,
    impostaIvaRighe: impostaIvaRigheMutation,
    deleteItem: deleteItemMutation,
  };
}
