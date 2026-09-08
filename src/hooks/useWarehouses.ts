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
  const { effectiveCompany, user, role } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const { isAdmin, isLoading: isLoadingPermissions } = usePermissions();
  const queryClient = useQueryClient();

  const { data: warehouses = [], isLoading, error } = useQuery<Warehouse[]>({
    // Include isAdmin e userId nella queryKey: cambiare utente / ruolo → refetch.
    queryKey: [QUERY_KEY, companyId, onlyActive, isAdmin, userId],
    enabled: !!companyId && !!userId && (!isLoadingPermissions || role === "company_admin" || role === "super_admin"),
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
      let q = supabase
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
      type RowWithAssignments = Warehouse & { warehouse_assignments?: unknown };
      const rows = (data ?? []) as unknown as RowWithAssignments[];
      return rows.map((w) => {
        const { warehouse_assignments: _joined, ...rest } = w;
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
      queryClient.invalidateQueries({ queryKey: ["my-warehouses", companyId] });
      toast.success("Magazzino creato");
    },
    onError: (err: Error) => toast.error("Errore creazione magazzino: " + err.message),
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
      queryClient.invalidateQueries({ queryKey: ["my-warehouses", companyId] });
      toast.success("Magazzino aggiornato");
    },
    onError: (err: Error) => toast.error("Errore aggiornamento magazzino: " + err.message),
  });

  // SET DEFAULT — P2 FIX wave 4: usa RPC atomica set_default_warehouse
  // per evitare race condition su tab concorrenti (le due UPDATE separate
  // potevano generare "no default" momentaneo o due default simultanei).
  const setDefaultMutation = useMutation({
    mutationFn: async (warehouseId: string) => {
      const { data, error } = await supabase.rpc("set_default_warehouse", {
        p_warehouse_id: warehouseId,
      });
      if (error) throw error;
      return data as Warehouse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
      queryClient.invalidateQueries({ queryKey: ["my-warehouses", companyId] });
      toast.success("Magazzino predefinito aggiornato");
    },
    onError: (err: Error) => toast.error("Errore: " + err.message),
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
      queryClient.invalidateQueries({ queryKey: ["my-warehouses", companyId] });
      toast.success("Magazzino disattivato");
    },
    onError: (err: Error) => toast.error("Errore: " + err.message),
  });

  // DELETE (hard delete). Il commento di prima diceva "quando non è protetto
  // da vincoli DB": ma i vincoli sul magazzino sono quasi tutti ON DELETE SET
  // NULL, cioè il database NON protegge niente — lascia articoli, movimenti e
  // lotti senza magazzino, in silenzio (101 articoli e 124 movimenti il giorno
  // dell'audit). Per questo si conta prima e si dice cosa c'è dentro.
  const deleteMutation = useMutation({
    mutationFn: async (warehouseId: string) => {
      const [stock, movimenti, lotti, daQui, aQui] = await Promise.all([
        supabase.from("warehouse_stock").select("id", { count: "exact", head: true }).eq("warehouse_id", warehouseId),
        supabase.from("warehouse_movements").select("id", { count: "exact", head: true }).eq("warehouse_id", warehouseId),
        supabase.from("stock_lotti").select("id", { count: "exact", head: true }).eq("warehouse_id", warehouseId),
        supabase.from("warehouse_transfers").select("id", { count: "exact", head: true }).eq("from_warehouse_id", warehouseId),
        supabase.from("warehouse_transfers").select("id", { count: "exact", head: true }).eq("to_warehouse_id", warehouseId),
      ]);
      const errore = [stock, movimenti, lotti, daQui, aQui].find((r) => r.error)?.error;
      if (errore) throw errore;
      const n = (r: { count: number | null }) => r.count ?? 0;
      const parti: string[] = [];
      if (n(stock) > 0) parti.push(`${n(stock)} articol${n(stock) === 1 ? "o" : "i"}`);
      if (n(movimenti) > 0) parti.push(`${n(movimenti)} moviment${n(movimenti) === 1 ? "o" : "i"}`);
      if (n(lotti) > 0) parti.push(`${n(lotti)} lott${n(lotti) === 1 ? "o" : "i"}`);
      const trasferimenti = n(daQui) + n(aQui);
      if (trasferimenti > 0) parti.push(`${trasferimenti} trasferiment${trasferimenti === 1 ? "o" : "i"}`);
      if (parti.length > 0) {
        throw new Error(`Il magazzino ha ${parti.join(", ")} collegati: spostali o svuotalo prima di eliminarlo.`);
      }
      const { error } = await supabase
        .from("warehouses")
        .delete()
        .eq("id", warehouseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
      queryClient.invalidateQueries({ queryKey: ["my-warehouses", companyId] });
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      toast.success("Magazzino eliminato");
    },
    onError: (err: Error) => {
      toast.error("Impossibile eliminare il magazzino", {
        description:
          err.message ||
          "Il magazzino potrebbe essere collegato a ordini, DDT, giacenze o movimenti.",
      });
    },
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
    deleteWarehouse: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
