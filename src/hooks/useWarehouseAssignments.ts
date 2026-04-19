import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface WarehouseAssignmentRow {
  id: string;
  warehouse_id: string;
  user_id: string;
  is_primary_manager: boolean;
  can_receive_goods: boolean;
  can_ship_to_site: boolean;
  can_transfer: boolean;
  can_count_inventory: boolean;
  can_view_purchase_orders: boolean;
  active: boolean;
  assigned_at: string;
  notes: string | null;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
}

export interface AssignUserInput {
  warehouse_id: string;
  user_id: string;
  is_primary_manager?: boolean;
  can_receive_goods?: boolean;
  can_ship_to_site?: boolean;
  can_transfer?: boolean;
  can_count_inventory?: boolean;
  can_view_purchase_orders?: boolean;
  notes?: string | null;
}

export type CapabilityField =
  | "is_primary_manager"
  | "can_receive_goods"
  | "can_ship_to_site"
  | "can_transfer"
  | "can_count_inventory"
  | "can_view_purchase_orders"
  | "active";

/**
 * Hook CRUD per le assegnazioni utente-magazzino.
 * Usato esclusivamente dal dialog admin (`WarehouseAssignmentsDialog`).
 *
 * RLS: solo company_admin/super_admin possono scrivere (policy wa_admin_manage).
 *
 * Nota: la tabella `warehouse_assignments` è definita nella migration
 * 20260921000001_warehouse_assignments_and_rls.sql. Usiamo cast locali per
 * consentire la build prima della rigenerazione di types.ts.
 */
export function useWarehouseAssignments(warehouseId: string | null) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const queryKey = ["warehouse-assignments", warehouseId, companyId];

  const { data: assignments = [], isLoading, error } = useQuery<WarehouseAssignmentRow[]>({
    queryKey,
    enabled: !!warehouseId && !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data, error } = await client
        .from("warehouse_assignments")
        .select(`
          id, warehouse_id, user_id,
          is_primary_manager, can_receive_goods, can_ship_to_site,
          can_transfer, can_count_inventory, can_view_purchase_orders,
          active, assigned_at, notes,
          profile:profiles!warehouse_assignments_user_id_fkey (id, first_name, last_name, email)
        `)
        .eq("warehouse_id", warehouseId!)
        .eq("company_id", companyId!)
        .order("assigned_at", { ascending: false });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any): WarehouseAssignmentRow => {
        const first = r.profile?.first_name ?? "";
        const last = r.profile?.last_name ?? "";
        const fullName = `${first} ${last}`.trim();
        return {
          id: r.id,
          warehouse_id: r.warehouse_id,
          user_id: r.user_id,
          is_primary_manager: !!r.is_primary_manager,
          can_receive_goods: !!r.can_receive_goods,
          can_ship_to_site: !!r.can_ship_to_site,
          can_transfer: !!r.can_transfer,
          can_count_inventory: !!r.can_count_inventory,
          can_view_purchase_orders: !!r.can_view_purchase_orders,
          active: !!r.active,
          assigned_at: r.assigned_at,
          notes: r.notes ?? null,
          profile: r.profile
            ? {
                id: r.profile.id,
                full_name: fullName || null,
                email: r.profile.email ?? null,
              }
            : null,
        };
      });
    },
  });

  // CREATE / REACTIVATE: se esiste già un record (UNIQUE warehouse_id+user_id)
  // fa upsert, altrimenti insert. Questo copre anche il caso "riattivazione".
  const assignMutation = useMutation({
    mutationFn: async (input: AssignUserInput) => {
      if (!companyId) throw new Error("company_id mancante");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;

      const payload = {
        company_id: companyId,
        warehouse_id: input.warehouse_id,
        user_id: input.user_id,
        is_primary_manager: input.is_primary_manager ?? false,
        can_receive_goods: input.can_receive_goods ?? true,
        can_ship_to_site: input.can_ship_to_site ?? true,
        can_transfer: input.can_transfer ?? true,
        can_count_inventory: input.can_count_inventory ?? true,
        can_view_purchase_orders: input.can_view_purchase_orders ?? true,
        active: true,
        assigned_by: user?.id ?? null,
        notes: input.notes ?? null,
      };

      // Upsert by UNIQUE(warehouse_id, user_id)
      const { data, error } = await client
        .from("warehouse_assignments")
        .upsert(payload, { onConflict: "warehouse_id,user_id" })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["my-warehouses"] });
      toast.success("Utente assegnato al magazzino");
    },
    onError: (err: Error) => {
      toast.error("Errore assegnazione: " + err.message);
    },
  });

  // UPDATE singola capability (o active) di una riga esistente
  const updateCapabilityMutation = useMutation({
    mutationFn: async ({
      id,
      field,
      value,
    }: {
      id: string;
      field: CapabilityField;
      value: boolean;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { error } = await client
        .from("warehouse_assignments")
        .update({ [field]: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["my-warehouses"] });
    },
    onError: (err: Error) => {
      toast.error("Errore aggiornamento: " + err.message);
    },
  });

  // REVOKE: soft-delete (active=false), NON hard delete
  const revokeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { error } = await client
        .from("warehouse_assignments")
        .update({ active: false })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["my-warehouses"] });
      toast.success("Assegnazione revocata");
    },
    onError: (err: Error) => {
      toast.error("Errore revoca: " + err.message);
    },
  });

  return {
    assignments,
    isLoading,
    error,
    assignUser: assignMutation.mutateAsync,
    updateCapability: updateCapabilityMutation.mutateAsync,
    revokeAssignment: revokeMutation.mutateAsync,
    isAssigning: assignMutation.isPending,
    isUpdating: updateCapabilityMutation.isPending,
    isRevoking: revokeMutation.isPending,
  };
}
