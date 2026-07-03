import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HrMansione, KpiSuggerito } from "@/types/hr";
import { toast } from "sonner";

/** Catalogo mansioni (ruoli riutilizzabili) dell'azienda. */
export function useHrMansioni(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["hr-mansioni", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_mansioni")
        .select("*")
        .eq("company_id", companyId!)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HrMansione[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface MansioneInput {
  id?: string;
  nome: string;
  area?: string | null;
  descrizione?: string | null;
  responsabilita?: string[];
  kpi_suggeriti?: KpiSuggerito[];
  attivo?: boolean;
}

/** Create/update/delete del catalogo mansioni. */
export function useHrMansioneMutations(companyId: string | null | undefined) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["hr-mansioni", companyId] });

  const upsert = useMutation({
    mutationFn: async (input: MansioneInput) => {
      const nome = input.nome?.trim();
      if (!nome) throw new Error("Il nome della mansione è obbligatorio");
      const payload = {
        nome,
        area: input.area?.trim() || null,
        descrizione: input.descrizione?.trim() || null,
        responsabilita: (input.responsabilita ?? []).filter((r) => r.trim() !== ""),
        kpi_suggeriti: input.kpi_suggeriti ?? [],
        attivo: input.attivo ?? true,
      };
      if (input.id) {
        const { error } = await supabase
          .from("hr_mansioni")
          .update({ ...payload, updated_at: new Date().toISOString() } as any)
          .eq("id", input.id);
        if (error) throw error;
      } else {
        if (!companyId) throw new Error("companyId mancante");
        const { error } = await supabase
          .from("hr_mansioni")
          .insert({ ...payload, company_id: companyId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Mansione salvata");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore salvataggio mansione"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_mansioni").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Mansione eliminata");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore eliminazione mansione"),
  });

  return { upsert, remove };
}
