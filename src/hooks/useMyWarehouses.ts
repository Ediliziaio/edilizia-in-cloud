import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MyWarehouseAssignment {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_type: "main" | "secondary" | "site" | "vehicle";
  is_primary_manager: boolean;
  can_receive_goods: boolean;
  can_ship_to_site: boolean;
  can_transfer: boolean;
  can_count_inventory: boolean;
  can_view_purchase_orders: boolean;
}

/**
 * Hook che restituisce le assegnazioni warehouse dell'utente corrente.
 *
 * Usato:
 *  - internamente dai dialog di assegnazione
 *  - dalla UI per mostrare capability specifiche per magazzino
 *
 * RLS garantisce che l'utente veda solo le proprie assegnazioni (policy wa_self_view).
 */
type WarehouseAssignmentRaw = {
  id: string;
  warehouse_id: string;
  is_primary_manager: boolean | null;
  can_receive_goods: boolean | null;
  can_ship_to_site: boolean | null;
  can_transfer: boolean | null;
  can_count_inventory: boolean | null;
  can_view_purchase_orders: boolean | null;
  warehouse: { id: string; name: string; type: string } | null;
};

export function useMyWarehouses() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, isLoading, error } = useQuery<MyWarehouseAssignment[]>({
    queryKey: ["my-warehouses", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_assignments")
        .select(`
          id, warehouse_id, is_primary_manager,
          can_receive_goods, can_ship_to_site, can_transfer,
          can_count_inventory, can_view_purchase_orders,
          warehouse:warehouses (id, name, type)
        `)
        .eq("user_id", userId!)
        .eq("active", true);

      if (error) throw error;

      const rows = (data ?? []) as unknown as WarehouseAssignmentRaw[];
      return rows.map((r) => ({
        id: r.id,
        warehouse_id: r.warehouse_id,
        warehouse_name: r.warehouse?.name ?? "",
        warehouse_type: (r.warehouse?.type ?? "secondary") as MyWarehouseAssignment["warehouse_type"],
        is_primary_manager: !!r.is_primary_manager,
        can_receive_goods: !!r.can_receive_goods,
        can_ship_to_site: !!r.can_ship_to_site,
        can_transfer: !!r.can_transfer,
        can_count_inventory: !!r.can_count_inventory,
        can_view_purchase_orders: !!r.can_view_purchase_orders,
      }));
    },
  });

  const warehouses = data ?? [];

  return {
    warehouses,
    warehouseIds: warehouses.map((w) => w.warehouse_id),
    isWarehouseUser: warehouses.length > 0,
    isLoading,
    error,
  };
}
