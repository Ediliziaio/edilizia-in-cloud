import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrProfilo, OrgTreeNode } from "@/types/hr";
import { toast } from "sonner";

function buildTree(profili: HrProfilo[]): OrgTreeNode[] {
  const map = new Map<string, OrgTreeNode>();
  const roots: OrgTreeNode[] = [];

  profili.forEach((p) => {
    map.set(p.id, { ...p, children: [], depth: 0 });
  });

  profili.forEach((p) => {
    const node = map.get(p.id)!;
    if (p.responsabile_id && map.has(p.responsabile_id)) {
      const parent = map.get(p.responsabile_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export function useOrganigramma() {
  const companyId = useEffectiveCompanyId();

  const query = useQuery({
    queryKey: ["hr-organigramma", companyId],
    queryFn: async () => {
      if (!companyId) throw new Error("companyId required");

      const { data, error } = await supabase
        .from("hr_profili")
        .select("*")
        .eq("company_id", companyId)
        .eq("attivo", true)
        .order("posizione_organigramma", { ascending: true })
        .order("cognome", { ascending: true });

      if (error) throw error;

      const profili = (data || []) as unknown as HrProfilo[];
      return {
        profili,
        tree: buildTree(profili),
        reparti: [...new Set(profili.map((p) => p.reparto).filter(Boolean))] as string[],
      };
    },
    enabled: !!companyId,
  });

  return query;
}

export function useAllHrProfili() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-profili-all", companyId],
    queryFn: async () => {
      if (!companyId) throw new Error("companyId required");

      const { data, error } = await supabase
        .from("hr_profili")
        .select("*")
        .eq("company_id", companyId)
        .order("cognome", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as HrProfilo[];
    },
    enabled: !!companyId,
  });
}

export function useSyncFromEmployees() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("companyId required");

      // Get all active employees
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("id, first_name, last_name, email, phone, user_id, role_type, monthly_hours")
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (empError) throw empError;

      // Get existing hr_profili employee_ids
      const { data: existing } = await supabase
        .from("hr_profili")
        .select("employee_id")
        .eq("company_id", companyId);

      const existingIds = new Set((existing || []).map((e: any) => e.employee_id));

      const toCreate = (employees || []).filter((e) => !existingIds.has(e.id));

      if (toCreate.length === 0) {
        return { created: 0 };
      }

      const rows = toCreate.map((e) => ({
        company_id: companyId,
        employee_id: e.id,
        user_id: e.user_id,
        nome: e.first_name,
        cognome: e.last_name,
        email: e.email,
        telefono: e.phone,
        ore_settimanali: 40,
        ore_giornaliere: 8,
        tipo_contratto: "indeterminato",
        orario_tipo: "standard",
        attivo: true,
      }));

      const { error: insertError } = await supabase
        .from("hr_profili")
        .insert(rows as any);

      if (insertError) throw insertError;

      return { created: toCreate.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["hr-organigramma"] });
      queryClient.invalidateQueries({ queryKey: ["hr-profili-all"] });
      toast.success(`${result.created} profili HR creati da anagrafica dipendenti`);
    },
    onError: (err: any) => {
      toast.error("Errore sincronizzazione: " + err.message);
    },
  });
}

export function useUpdateHrProfilo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<HrProfilo> & { id: string }) => {
      const { error } = await supabase
        .from("hr_profili")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-organigramma"] });
      queryClient.invalidateQueries({ queryKey: ["hr-profili-all"] });
      toast.success("Profilo HR aggiornato");
    },
    onError: (err: any) => {
      toast.error("Errore aggiornamento: " + err.message);
    },
  });
}
