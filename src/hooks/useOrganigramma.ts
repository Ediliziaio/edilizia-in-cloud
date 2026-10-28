import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrProfilo } from "@/types/hr";
import { toast } from "sonner";

import { buildOrgTree } from "@/lib/personale/organizzazione";

export function useOrganigramma() {
  const companyId = useEffectiveCompanyId();

  const query = useQuery({
    queryKey: ["hr-organigramma", companyId],
    queryFn: async ({ signal }) => {
      if (!companyId) throw new Error("companyId required");
      const profili: HrProfilo[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase
          .from("hr_profili")
          .select("*")
          .eq("company_id", companyId)
          .eq("attivo", true)
          .order("posizione_organigramma")
          .order("cognome")
          .order("id")
          .range(from, from + 499)
          .abortSignal(signal);
        if (error) throw error;
        profili.push(...((data || []) as unknown as HrProfilo[]));
        if (!data || data.length < 500) break;
      }
      return {
        profili,
        tree: buildOrgTree(profili),
        reparti: [
          ...new Set(profili.map((p) => p.reparto).filter(Boolean)),
        ] as string[],
      };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  return query;
}

export function useAllHrProfili() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-profili-all", companyId],
    queryFn: async ({ signal }) => {
      if (!companyId) throw new Error("companyId required");
      const rows: HrProfilo[] = [];
      for (let from = 0; ; from += 500) {
      const { data, error } = await supabase
        .from("hr_profili")
        .select("*")
        .eq("company_id", companyId)
        .order("cognome", { ascending: true }).order("id")
        .range(from, from + 499).abortSignal(signal);

      if (error) throw error;
      rows.push(...((data ?? []) as unknown as HrProfilo[]));
      if (!data || data.length < 500) break;
      }
      return rows;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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
        .select(
          "id, first_name, last_name, email, phone, user_id, role_type, monthly_hours",
        )
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (empError) throw empError;

      // Get existing hr_profili employee_ids
      const { data: existing, error: existingError } = await supabase
        .from("hr_profili")
        .select("employee_id")
        .eq("company_id", companyId);

      if (existingError) throw existingError;
      const existingIds = new Set(
        (existing || []).map((e: any) => e.employee_id),
      );

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
      queryClient.invalidateQueries({ queryKey: ["hr-sedi-persone"] });
      toast.success(
        `${result.created} profili HR creati da anagrafica dipendenti`,
      );
    },
    onError: (err: any) => {
      toast.error("Errore sincronizzazione: " + err.message);
    },
  });
}

export function useUpdateHrProfilo() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<HrProfilo> & { id: string }) => {
      if (!companyId) throw new Error("companyId required");
      // Remove immutable and non-DB fields
      const {
        created_at,
        company_id,
        employee_id,
        user_id,
        children,
        depth,
        sede,
        responsabile,
        employee_first_name,
        employee_last_name,
        employee_email,
        employee_phone,
        ...safeUpdates
      } = updates as any;

      const { error } = await supabase
        .from("hr_profili")
        .update({ ...safeUpdates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .eq("company_id", companyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-organigramma"] });
      queryClient.invalidateQueries({ queryKey: ["qualifiche-addetto", companyId] });
      queryClient.invalidateQueries({ queryKey: ["addetti-qualifiche-commessa", companyId] }); queryClient.invalidateQueries({ queryKey: ["pos-riesame-proprio", companyId] });
      queryClient.invalidateQueries({ queryKey: ["hr-profili-all"] });
      queryClient.invalidateQueries({ queryKey: ["hr-sedi-persone"] });
      toast.success("Profilo HR aggiornato");
    },
    onError: (err: any) => {
      toast.error("Errore aggiornamento: " + err.message);
    },
  });
}
