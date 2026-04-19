import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

export interface Warehouse {
  id: string;
  company_id: string;
  name: string;
  type: "main" | "secondary" | "site" | "vehicle";
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  is_active: boolean;
  is_default: boolean;
  linked_order_id?: string | null;
  position: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type WarehouseInsert = Omit<Warehouse, "id" | "company_id" | "created_at" | "updated_at">;
export type WarehouseUpdate = Partial<WarehouseInsert>;

const QUERY_KEY = "warehouses";

export function useWarehouses(onlyActive = true) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const { isAdmin, isLoading: isLoadingPermissions } = usePermissions();
  const queryClient = useQueryClient();

  const { data: warehouses = [], isLoading, error } = useQuery<Warehouse[]>({
    // Include isAdmin e userId nella queryKey: cambiare utente / ruolo → refetch.
    queryKey: [QUERY_KEY, companyId, onlyActive, isAdmin, userId],
    enabled: !!companyId && !!userId && !isLoadingPermissions,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Admin: vede tutti i magazzini della company (comportamento originale).
      if (isAdmin) {
        let q = supabase
          .from("warehouses")
          .select("*")
          .eq("company_id", companyId!)
          .order("position", { ascending: true })
          .order("name", { ascending: true });

        if (onlyActive) q = q.eq("is_active", true);

        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as Warehouse[];
      }

      // Non-admin: intersezione con warehouse_assignments (active=true).
      // `warehouse_assignments` non è ancora nei tipi auto-generati: usiamo cast locale.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      let q = client
        .from("warehouses")
        .select("*, warehouse_assignments!inner(user_id, active)")
        .eq("company_id", companyId!)
        .eq("warehouse_assignments.user_id", userId!)
        .eq("warehouse_assignments.active", true)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (onlyActive) q = q.eq("is_active", true);

      const { data, error } = await q;
      if (error) throw error;

      // Rimuoviamo il campo joined prima di restituire (Warehouse[] pulito).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((w: any) => {
        const { warehouse_assignments: _warehouse_assignments, ...rest } = w;
        return rest as Warehouse;
      });
    },
  });

  // Magazzino default
  const defaultWarehouse = warehouses.find((w) => w.is_default) ?? warehouses[0] ?? null;

  // CREATE
  const createMutation = useMutation({
    mutationFn: async (payload: WarehouseInsert) => {
      if (!companyId) throw new Error("company_id mancante");
      const { data, error } = await supabase
        .from("warehouses")
        .insert({ ...payload, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return data as Warehouse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
      toast.success("Magazzino creato");
    },
    onError: (err: any) => toast.error("Errore creazione magazzino: " + err.message),
  });

  // UPDATE
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: WarehouseUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("warehouses")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Warehouse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
      toast.success("Magazzino aggiornato");
    },
    onError: (err: any) => toast.error("Errore aggiornamento magazzino: " + err.message),
  });

  // SET DEFAULT (aggiorna quello precedente via DB unique index)
  const setDefaultMutation = useMutation({
    mutationFn: async (warehouseId: string) => {
      // Prima rimuovi il default esistente per questa company
      await supabase
        .from("warehouses")
        .update({ is_default: false })
        .eq("company_id", companyId!)
        .eq("is_default", true);

      const { data, error } = await supabase
        .from("warehouses")
        .update({ is_default: true })
        .eq("id", warehouseId)
        .select()
        .single();
      if (error) throw error;
      return data as Warehouse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
      toast.success("Magazzino predefinito aggiornato");
    },
    onError: (err: any) => toast.error("Errore: " + err.message),
  });

  // DEACTIVATE (soft delete)
  const deactivateMutation = useMutation({
    mutationFn: async (warehouseId: string) => {
      const { error } = await supabase
        .from("warehouses")
        .update({ is_active: false })
        .eq("id", warehouseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
      toast.success("Magazzino disattivato");
    },
    onError: (err: any) => toast.error("Errore: " + err.message),
  });

  return {
    warehouses,
    defaultWarehouse,
    isLoading,
    error,
    createWarehouse: createMutation.mutateAsync,
    updateWarehouse: updateMutation.mutateAsync,
    setDefaultWarehouse: setDefaultMutation.mutateAsync,
    deactivateWarehouse: deactivateMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
