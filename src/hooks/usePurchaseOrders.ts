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
  sent_at: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  suppliers?: { name: string; email: string | null } | null;
  orders?: { order_number: string } | null;
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
        .select("*, suppliers(name, email), orders(order_number)")
        .eq("company_id", companyId!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data as unknown as PurchaseOrder[];
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (params: { supplier_id: string; notes?: string; expected_delivery_date?: string }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId!,
          supplier_id: params.supplier_id,
          notes: params.notes || null,
          expected_delivery_date: params.expected_delivery_date || null,
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
      const { error } = await supabase.from("purchase_orders").update(updates).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stato aggiornato");
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-detail"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const updateMutation = useMutation({
    mutationFn: async (params: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("purchase_orders").update(params.updates).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-detail"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return {
    orders: listQuery.data || [],
    isLoading: listQuery.isLoading,
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
    queryKey: ["purchase-order-detail", poId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(name, email, iban, bank_name, payment_method, address, city, province, postal_code, vat_number), orders(order_number)")
        .eq("id", poId!)
        .single();
      if (error) throw error;
      return data as unknown as PurchaseOrder & { suppliers: any };
    },
    enabled: !!poId,
  });

  const itemsQuery = useQuery({
    queryKey: ["purchase-order-items", poId],
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
      queryClient.invalidateQueries({ queryKey: ["purchase-order-items", poId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-detail", poId] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const updateItemMutation = useMutation({
    mutationFn: async (params: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("purchase_order_items").update(params.updates).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order-items", poId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-detail", poId] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order-items", poId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-detail", poId] });
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
