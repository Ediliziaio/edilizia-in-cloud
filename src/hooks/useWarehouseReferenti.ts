import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Un referente può essere un dipendente (employee) o un subappaltatore. Mai un cliente.
export type ReferenteKind = "employee" | "subcontractor";

export interface WarehouseReferente {
  id: string;
  warehouse_id: string;
  company_id: string;
  employee_id: string | null;
  subcontractor_id: string | null;
  role_label: string;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Join fields (popolati dalla select)
  employee?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    role_type: string;
  } | null;
  subcontractor?: {
    id: string;
    ragione_sociale: string;
    responsabile: string | null;
    email: string | null;
    telefono: string | null;
  } | null;
}

/** Descrittore UI semplificato — usato dal picker e dalle card. */
export interface ReferentePerson {
  kind: ReferenteKind;
  id: string;
  displayName: string;
  subtitle: string | null;
  phone: string | null;
  email: string | null;
}

export function referenteToPerson(r: WarehouseReferente): ReferentePerson | null {
  if (r.employee) {
    const full = `${r.employee.first_name} ${r.employee.last_name}`.trim();
    return {
      kind: "employee",
      id: r.employee.id,
      displayName: full || r.employee.email || "Dipendente",
      subtitle: r.employee.role_type === "staff_interno" ? "Staff interno" : "Operaio",
      phone: r.employee.phone,
      email: r.employee.email,
    };
  }
  if (r.subcontractor) {
    return {
      kind: "subcontractor",
      id: r.subcontractor.id,
      displayName: r.subcontractor.ragione_sociale,
      subtitle: r.subcontractor.responsabile ? `Referente: ${r.subcontractor.responsabile}` : "Subappaltatore",
      phone: r.subcontractor.telefono,
      email: r.subcontractor.email,
    };
  }
  return null;
}

/**
 * Hook che restituisce i referenti di UN magazzino.
 * Se warehouseId è null, la query resta disabled.
 */
export function useWarehouseReferenti(warehouseId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const query = useQuery<WarehouseReferente[]>({
    queryKey: ["warehouse_referenti", warehouseId],
    enabled: !!warehouseId && !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_referenti" as any)
        .select(
          `
          *,
          employee:employees!warehouse_referenti_employee_id_fkey (
            id, first_name, last_name, email, phone, role_type
          ),
          subcontractor:subappaltatori!warehouse_referenti_subcontractor_id_fkey (
            id, ragione_sociale, responsabile, email, telefono
          )
          `
        )
        .eq("warehouse_id", warehouseId!)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WarehouseReferente[];
    },
  });

  /**
   * Sincronizza la lista referenti: upsert delle righe passate,
   * delete di quelle non più presenti.
   *
   * Il payload è il set finale desiderato di referenti per il warehouse.
   */
  const saveMutation = useMutation({
    mutationFn: async (payload: {
      warehouse_id: string;
      referenti: Array<{
        id?: string; // se presente = update
        employee_id?: string | null;
        subcontractor_id?: string | null;
        role_label: string;
        is_primary: boolean;
      }>;
    }) => {
      if (!companyId) throw new Error("company_id mancante");

      // 1) Elenca referenti esistenti sul DB
      const { data: existing, error: existingErr } = await supabase
        .from("warehouse_referenti" as any)
        .select("id")
        .eq("warehouse_id", payload.warehouse_id);
      if (existingErr) throw existingErr;

      const existingIds = new Set((existing ?? []).map((r: any) => r.id));
      const keptIds = new Set(
        payload.referenti.filter((r) => r.id).map((r) => r.id as string)
      );

      // 2) Delete delle righe rimosse
      const toDelete = Array.from(existingIds).filter((id) => !keptIds.has(id));
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("warehouse_referenti" as any)
          .delete()
          .in("id", toDelete);
        if (delErr) throw delErr;
      }

      // 3) Insert nuovi + update esistenti
      const inserts: any[] = [];
      const updates: Array<{ id: string; patch: any }> = [];

      for (const r of payload.referenti) {
        // Validazione lato client: esattamente uno tra employee_id e subcontractor_id
        if (!!r.employee_id === !!r.subcontractor_id) continue; // XOR violato, skip

        const row = {
          warehouse_id: payload.warehouse_id,
          company_id: companyId,
          employee_id: r.employee_id ?? null,
          subcontractor_id: r.subcontractor_id ?? null,
          role_label: r.role_label?.trim() || "Magazziniere",
          is_primary: !!r.is_primary,
        };
        if (r.id) updates.push({ id: r.id, patch: row });
        else inserts.push(row);
      }

      // Enforce al massimo 1 primary lato client (il DB ha già unique index)
      const primaryCount =
        inserts.filter((r) => r.is_primary).length +
        updates.filter((u) => u.patch.is_primary).length;
      if (primaryCount > 1) {
        throw new Error("Puoi selezionare al massimo un referente principale");
      }

      if (inserts.length > 0) {
        const { error: insErr } = await supabase
          .from("warehouse_referenti" as any)
          .insert(inserts);
        if (insErr) throw insErr;
      }

      for (const u of updates) {
        const { error: updErr } = await supabase
          .from("warehouse_referenti" as any)
          .update(u.patch)
          .eq("id", u.id);
        if (updErr) throw updErr;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["warehouse_referenti", variables.warehouse_id],
      });
      queryClient.invalidateQueries({ queryKey: ["warehouse_referenti_map", companyId] });
    },
    onError: (err: any) => {
      toast.error("Errore salvataggio referenti: " + (err?.message ?? "sconosciuto"));
    },
  });

  return {
    referenti: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    saveReferenti: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}

/**
 * Mappa { warehouse_id -> WarehouseReferente[] } per TUTTI i magazzini
 * della company corrente. Utile per la card list.
 */
export function useAllWarehouseReferentiMap() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery<Record<string, WarehouseReferente[]>>({
    queryKey: ["warehouse_referenti_map", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_referenti" as any)
        .select(
          `
          *,
          employee:employees!warehouse_referenti_employee_id_fkey (
            id, first_name, last_name, email, phone, role_type
          ),
          subcontractor:subappaltatori!warehouse_referenti_subcontractor_id_fkey (
            id, ragione_sociale, responsabile, email, telefono
          )
          `
        )
        .eq("company_id", companyId!)
        .order("is_primary", { ascending: false });
      if (error) throw error;

      const map: Record<string, WarehouseReferente[]> = {};
      for (const row of (data ?? []) as unknown as WarehouseReferente[]) {
        if (!map[row.warehouse_id]) map[row.warehouse_id] = [];
        map[row.warehouse_id].push(row);
      }
      return map;
    },
  });
}

/**
 * Lista di candidati selezionabili come referente: dipendenti attivi
 * (operai + staff_interno + employee) + subappaltatori attivi.
 * NON restituisce clienti.
 */
export function useReferenteCandidates() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const employeesQuery = useQuery<ReferentePerson[]>({
    queryKey: ["referente_candidates_employees", companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, email, phone, role_type, is_active")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .filter(
          (e: any) =>
            // Solo operai / staff interno / employee generici. Esclude customer.
            e.role_type === "operaio" ||
            e.role_type === "staff_interno" ||
            e.role_type === "employee" ||
            e.role_type === "subcontractor"
        )
        .map((e: any) => ({
          kind: "employee" as const,
          id: e.id,
          displayName: `${e.first_name} ${e.last_name}`.trim() || e.email || "Dipendente",
          subtitle:
            e.role_type === "staff_interno"
              ? "Staff interno"
              : e.role_type === "subcontractor"
                ? "Subappaltatore (anagrafica dipendenti)"
                : "Operaio",
          phone: e.phone,
          email: e.email,
        }));
    },
  });

  const subcontractorsQuery = useQuery<ReferentePerson[]>({
    queryKey: ["referente_candidates_subcontractors", companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori")
        .select("id, ragione_sociale, responsabile, email, telefono, is_active")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("ragione_sociale", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        kind: "subcontractor" as const,
        id: s.id,
        displayName: s.ragione_sociale,
        subtitle: s.responsabile ? `Referente: ${s.responsabile}` : "Subappaltatore",
        phone: s.telefono,
        email: s.email,
      }));
    },
  });

  return {
    employees: employeesQuery.data ?? [],
    subcontractors: subcontractorsQuery.data ?? [],
    isLoading: employeesQuery.isLoading || subcontractorsQuery.isLoading,
  };
}

/**
 * Ritorna i warehouse_id dove l'utente corrente è referente.
 * Usa la SQL function `public.get_my_warehouse_ids()` (SECURITY DEFINER)
 * che filtra via employees.user_id = auth.uid().
 *
 * Utile per il view "I miei magazzini" dell'utente referente (non admin).
 */
export function useMyWarehouseIds() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery<string[]>({
    queryKey: ["my_warehouse_ids", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_warehouse_ids" as any);
      if (error) throw error;
      return ((data ?? []) as Array<{ get_my_warehouse_ids: string } | string>).map(
        (row: any) => (typeof row === "string" ? row : row.get_my_warehouse_ids ?? row)
      );
    },
  });
}

/**
 * Check puntuale: l'utente corrente è referente di UN magazzino?
 */
export function useIsWarehouseReferente(warehouseId: string | null) {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: ["is_warehouse_referente", user?.id, warehouseId],
    enabled: !!user?.id && !!warehouseId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_warehouse_referente" as any, {
        p_user_id: user!.id,
        p_warehouse_id: warehouseId!,
      });
      if (error) throw error;
      return !!data;
    },
  });
}
