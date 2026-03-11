import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

// ── Types ──

export type OrderItemStatusExtended =
  | "da_ordinare"
  | "ordinato"
  | "in_arrivo"
  | "in_magazzino"
  | "prenotato"
  | "installato";

export interface OrderItemStatusConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

export const ORDER_ITEM_STATUS_CONFIG: Record<OrderItemStatusExtended, OrderItemStatusConfig> = {
  da_ordinare: {
    label: "Da ordinare",
    color: "text-amber-600",
    bgColor: "bg-amber-50/50 dark:bg-amber-950/20",
    borderColor: "border-amber-300",
    description: "Materiale ancora da acquistare",
  },
  ordinato: {
    label: "Ordinato",
    color: "text-blue-600",
    bgColor: "bg-blue-50/50 dark:bg-blue-950/20",
    borderColor: "border-blue-300",
    description: "Ordine inviato al fornitore",
  },
  in_arrivo: {
    label: "In arrivo",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50/50 dark:bg-indigo-950/20",
    borderColor: "border-indigo-300",
    description: "Confermato, data consegna fissata",
  },
  in_magazzino: {
    label: "In magazzino",
    color: "text-green-600",
    bgColor: "bg-green-50/50 dark:bg-green-950/20",
    borderColor: "border-green-300",
    description: "Fisicamente disponibile in magazzino",
  },
  prenotato: {
    label: "Prenotato",
    color: "text-purple-600",
    bgColor: "bg-purple-50/50 dark:bg-purple-950/20",
    borderColor: "border-purple-300",
    description: "Riservato per questa commessa",
  },
  installato: {
    label: "Installato",
    color: "text-muted-foreground",
    bgColor: "bg-muted/30",
    borderColor: "border-muted",
    description: "Posato in cantiere — scarico automatico",
  },
};

export interface BlockedOrder {
  order_id: string;
  order_code: string | null;
  customer_name: string;
  expected_date: string | null;
  work_start_date: string | null;
  blocking_items_count: number;
  missing_items: Array<{
    item_id: string;
    name: string;
    status: OrderItemStatusExtended;
    quantity: number;
    delivery_date: string | null;
  }>;
  urgency_level: "critica" | "alta" | "normale";
}

export interface LowStockAlert {
  stock_item_id: string;
  name: string;
  quantity: number;
  quantity_reserved: number;
  quantity_available: number;
  min_stock_level: number;
  deficit: number;
  supplier_name: string | null;
  section_name: string | null;
}

export interface OrderMaterialMovement {
  movement_id: string;
  stock_item_name: string | null;
  order_item_name: string | null;
  movement_type: string;
  quantity: number;
  unit_cost: number | null;
  lot_number: string | null;
  notes: string | null;
  performed_by_name: string | null;
  created_at: string;
}

export interface LotBatch {
  id: string;
  company_id: string;
  stock_item_id: string;
  lot_number: string;
  supplier_id: string | null;
  delivery_date: string | null;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
  supplier?: { name: string } | null;
}

export interface InventoryAuditItem {
  id: string;
  stock_item_id: string;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
  adjustment_applied: boolean;
  notes: string | null;
  audited_by: string | null;
  audited_at: string;
  applied_at: string | null;
  stock_item?: { name: string; quantity: number } | null;
}

export interface WarehouseStats {
  totalStockItems: number;
  totalStockValue: number;
  lowStockCount: number;
  blockedOrdersCount: number;
  reservedQuantityItems: number;
  pendingDeliveriesCount: number;
}

// ── Query Keys ──

export const magazzinoKeys = {
  all: ["magazzino-live"] as const,
  blockedOrders: (companyId: string) =>
    [...magazzinoKeys.all, "blocked-orders", companyId] as const,
  lowStock: (companyId: string) =>
    [...magazzinoKeys.all, "low-stock", companyId] as const,
  orderHistory: (companyId: string, orderId: string) =>
    [...magazzinoKeys.all, "order-history", companyId, orderId] as const,
  lotBatches: (companyId: string, stockItemId?: string) =>
    [...magazzinoKeys.all, "lot-batches", companyId, stockItemId ?? "all"] as const,
  audits: (companyId: string) =>
    [...magazzinoKeys.all, "audits", companyId] as const,
  stats: (companyId: string) =>
    [...magazzinoKeys.all, "stats", companyId] as const,
};

// ── Query Hooks ──

export function useBlockedOrders(companyId: string | null) {
  return useQuery({
    queryKey: magazzinoKeys.blockedOrders(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<BlockedOrder[]> => {
      const { data, error } = await supabase.rpc("get_blocked_orders", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        blocking_items_count: Number(row.blocking_items_count),
        missing_items: Array.isArray(row.missing_items) ? row.missing_items : [],
      }));
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 10,
  });
}

export function useLowStockAlerts(companyId: string | null) {
  return useQuery({
    queryKey: magazzinoKeys.lowStock(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<LowStockAlert[]> => {
      const { data, error } = await supabase.rpc("get_low_stock_alerts", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        quantity: Number(row.quantity),
        quantity_reserved: Number(row.quantity_reserved),
        quantity_available: Number(row.quantity_available),
        min_stock_level: Number(row.min_stock_level),
        deficit: Number(row.deficit),
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useOrderMaterialsHistory(companyId: string | null, orderId: string | null) {
  return useQuery({
    queryKey: magazzinoKeys.orderHistory(companyId ?? "", orderId ?? ""),
    enabled: !!companyId && !!orderId,
    queryFn: async (): Promise<OrderMaterialMovement[]> => {
      const { data, error } = await supabase.rpc("get_order_materials_history", {
        p_company_id: companyId!,
        p_order_id: orderId!,
      });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        quantity: Number(row.quantity),
        unit_cost: row.unit_cost ? Number(row.unit_cost) : null,
      }));
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function useLotBatches(companyId: string | null, stockItemId?: string) {
  return useQuery({
    queryKey: magazzinoKeys.lotBatches(companyId ?? "", stockItemId),
    enabled: !!companyId,
    queryFn: async (): Promise<LotBatch[]> => {
      let query = supabase
        .from("warehouse_lot_batches")
        .select("*, supplier:suppliers(name)")
        .eq("company_id", companyId!)
        .order("delivery_date", { ascending: false });

      if (stockItemId) {
        query = query.eq("stock_item_id", stockItemId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useInventoryAudits(companyId: string | null) {
  return useQuery({
    queryKey: magazzinoKeys.audits(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<InventoryAuditItem[]> => {
      const { data, error } = await supabase
        .from("inventory_audits")
        .select("*, stock_item:warehouse_stock(name, quantity)")
        .eq("company_id", companyId!)
        .order("audited_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useWarehouseStats(companyId: string | null) {
  return useQuery({
    queryKey: magazzinoKeys.stats(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<WarehouseStats> => {
      const [stockRes, lowStockRes, blockedRes, pendingRes] = await Promise.all([
        supabase
          .from("warehouse_stock")
          .select("id, quantity, unit_cost, quantity_reserved, min_stock_level")
          .eq("company_id", companyId!),
        supabase.rpc("get_low_stock_alerts", { p_company_id: companyId! }),
        supabase.rpc("get_blocked_orders", { p_company_id: companyId! }),
        supabase
          .from("order_items")
          .select("id, status", { count: "exact", head: true })
          .in("status", ["ordinato", "in_arrivo"]),
      ]);

      const stock = stockRes.data ?? [];
      const totalStockValue = stock.reduce(
        (s, item: any) => s + (Number(item.quantity) * Number(item.unit_cost ?? 0)),
        0
      );
      const reservedItems = stock.filter((i: any) => Number(i.quantity_reserved) > 0).length;

      return {
        totalStockItems: stock.length,
        totalStockValue,
        lowStockCount: (lowStockRes.data ?? []).length,
        blockedOrdersCount: (blockedRes.data ?? []).length,
        reservedQuantityItems: reservedItems,
        pendingDeliveriesCount: pendingRes.count ?? 0,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

// ── Mutation Hooks ──

export function useUpdateOrderItemStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      status,
      deliveryDate,
      lotNumber,
      stockItemId,
    }: {
      itemId: string;
      status: OrderItemStatusExtended;
      deliveryDate?: string | null;
      lotNumber?: string | null;
      stockItemId?: string | null;
    }) => {
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (deliveryDate !== undefined) updates.delivery_date = deliveryDate;
      if (lotNumber !== undefined) updates.lot_number = lotNumber;
      if (stockItemId !== undefined) updates.stock_item_id = stockItemId;

      const { error } = await supabase
        .from("order_items")
        .update(updates)
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: magazzinoKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
  });
}

export function useAddLotBatchMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      batch: Omit<LotBatch, "id" | "created_at" | "supplier">
    ) => {
      const { error } = await supabase
        .from("warehouse_lot_batches")
        .insert(batch as any);
      if (error) throw error;

      // Update parent stock with latest lot info
      await supabase
        .from("warehouse_stock")
        .update({
          last_lot_number: batch.lot_number,
          last_delivery_date: batch.delivery_date,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", batch.stock_item_id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: magazzinoKeys.lotBatches(variables.company_id, variables.stock_item_id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      toast.success("Lotto aggiunto");
    },
    onError: () => toast.error("Errore nell'aggiunta del lotto"),
  });
}

export function useCreateInventoryAuditMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      stockItemId,
      systemQuantity,
      actualQuantity,
      notes,
      auditedBy,
    }: {
      companyId: string;
      stockItemId: string;
      systemQuantity: number;
      actualQuantity: number;
      notes?: string;
      auditedBy: string;
    }) => {
      const { error } = await supabase.from("inventory_audits").insert({
        company_id: companyId,
        stock_item_id: stockItemId,
        system_quantity: systemQuantity,
        actual_quantity: actualQuantity,
        notes: notes ?? null,
        audited_by: auditedBy,
        audited_at: new Date().toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: magazzinoKeys.all });
      toast.success("Inventario registrato");
    },
    onError: () => toast.error("Errore nella registrazione dell'inventario"),
  });
}

export function useApplyAuditAdjustmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      auditId,
      stockItemId,
      actualQuantity,
      difference,
      companyId,
    }: {
      auditId: string;
      stockItemId: string;
      actualQuantity: number;
      difference: number;
      companyId: string;
    }) => {
      // Create adjustment movement
      const { error: movError } = await supabase
        .from("warehouse_movements")
        .insert({
          stock_item_id: stockItemId,
          movement_type: "rettifica",
          quantity: Math.abs(difference),
          notes: `Rettifica inventariale — differenza: ${difference > 0 ? "+" : ""}${difference}`,
          performed_by: (await supabase.auth.getUser()).data.user?.id,
          company_id: companyId,
        } as any);
      if (movError) throw movError;

      // Update stock to actual quantity
      const { error: stockError } = await supabase
        .from("warehouse_stock")
        .update({ quantity: actualQuantity, updated_at: new Date().toISOString() })
        .eq("id", stockItemId);
      if (stockError) throw stockError;

      // Mark audit as applied
      const { error: auditError } = await supabase
        .from("inventory_audits")
        .update({
          adjustment_applied: true,
          applied_at: new Date().toISOString(),
        } as any)
        .eq("id", auditId);
      if (auditError) throw auditError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: magazzinoKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      toast.success("Rettifica applicata");
    },
    onError: () => toast.error("Errore nella rettifica"),
  });
}
