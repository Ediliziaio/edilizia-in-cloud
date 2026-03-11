import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Types ──

export interface BlockedOrder {
  order_id: string;
  order_code: string | null;
  customer_name: string;
  expected_date: string | null;
  total_items: number;
  missing_items: number;
}

export interface LowStockAlert {
  stock_item_id: string;
  item_name: string;
  current_quantity: number;
  reserved: number;
  available: number;
  min_level: number;
  reorder_qty: number;
  supplier_id: string | null;
}

export interface MaterialMovement {
  movement_id: string;
  stock_item_name: string;
  movement_type: string;
  quantity: number;
  lot_number: string | null;
  notes: string | null;
  performed_by: string;
  created_at: string;
}

export interface LotBatch {
  id: string;
  company_id: string;
  stock_item_id: string;
  lot_number: string;
  quantity: number;
  received_date: string;
  expiry_date: string | null;
  supplier_id: string | null;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryAudit {
  id: string;
  company_id: string;
  stock_item_id: string;
  expected_quantity: number;
  counted_quantity: number;
  difference: number;
  adjustment_applied: boolean;
  performed_by: string;
  notes: string | null;
  created_at: string;
}

// ── Query Hooks ──

export function useBlockedOrders() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["warehouse-blocked-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_blocked_orders", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return (data ?? []) as BlockedOrder[];
    },
    enabled: !!companyId,
  });
}

export function useLowStockAlerts() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["warehouse-low-stock", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_low_stock_alerts", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return (data ?? []) as LowStockAlert[];
    },
    enabled: !!companyId,
  });
}

export function useOrderMaterialsHistory(orderId: string | null) {
  return useQuery({
    queryKey: ["warehouse-materials-history", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_order_materials_history", {
        p_order_id: orderId!,
      });
      if (error) throw error;
      return (data ?? []) as MaterialMovement[];
    },
    enabled: !!orderId,
  });
}

export function useLotBatches(stockItemId: string | null) {
  const { effectiveCompany } = useAuth();
  return useQuery({
    queryKey: ["warehouse-lot-batches", stockItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_lot_batches")
        .select("*")
        .eq("stock_item_id", stockItemId!)
        .eq("company_id", effectiveCompany!.id)
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data as LotBatch[];
    },
    enabled: !!stockItemId && !!effectiveCompany?.id,
  });
}

export function useInventoryAudits(stockItemId?: string) {
  const { effectiveCompany } = useAuth();
  return useQuery({
    queryKey: ["warehouse-audits", effectiveCompany?.id, stockItemId],
    queryFn: async () => {
      let q = supabase
        .from("inventory_audits")
        .select("*")
        .eq("company_id", effectiveCompany!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (stockItemId) q = q.eq("stock_item_id", stockItemId);
      const { data, error } = await q;
      if (error) throw error;
      return data as InventoryAudit[];
    },
    enabled: !!effectiveCompany?.id,
  });
}

// ── Mutation Hooks ──

export function useAddLotBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batch: Omit<LotBatch, "id" | "created_at">) => {
      const { error } = await supabase.from("warehouse_lot_batches").insert(batch as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-lot-batches"] });
      toast.success("Lotto aggiunto");
    },
    onError: () => toast.error("Errore nell'aggiunta del lotto"),
  });
}

export function useCreateInventoryAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (audit: {
      company_id: string;
      stock_item_id: string;
      expected_quantity: number;
      counted_quantity: number;
      performed_by: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("inventory_audits").insert(audit as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-audits"] });
      toast.success("Inventario registrato");
    },
    onError: () => toast.error("Errore nella registrazione dell'inventario"),
  });
}

export function useApplyAuditAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      auditId,
      stockItemId,
      newQuantity,
    }: {
      auditId: string;
      stockItemId: string;
      newQuantity: number;
    }) => {
      const { error: e1 } = await supabase
        .from("warehouse_stock")
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq("id", stockItemId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("inventory_audits")
        .update({ adjustment_applied: true } as any)
        .eq("id", auditId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse-audits"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock"] });
      toast.success("Rettifica applicata");
    },
    onError: () => toast.error("Errore nella rettifica"),
  });
}
