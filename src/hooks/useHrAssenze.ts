import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrAssenza } from "@/types/hrDocumenti";
import { toast } from "sonner";

export function useHrAssenze(profiloId: string | null | undefined) {
  return useQuery({
    queryKey: ["hr-assenze", profiloId],
    enabled: !!profiloId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_assenze_eventi")
        .select("*")
        .eq("hr_profilo_id", profiloId!)
        .order("data_inizio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HrAssenza[];
    },
    staleTime: 60 * 1000,
  });
}

export function useUpsertHrAssenza(profiloId: string) {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (a: Partial<HrAssenza> & { id?: string }) => {
      const { id, created_at, updated_at, ...rest } = a as any;
      for (const f of ["data_fine", "protocollo", "note", "certificato_path", "certificato_name"]) {
        if (rest[f] === "") rest[f] = null;
      }
      if (rest.giorni === "" || rest.giorni == null) rest.giorni = null;
      if (id) {
        const { error } = await supabase.from("hr_assenze_eventi").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
        const { error } = await supabase.from("hr_assenze_eventi").insert({
          ...rest, hr_profilo_id: profiloId, company_id: companyId, created_by: uid,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-assenze", profiloId] });
      toast.success("Assenza salvata");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore salvataggio assenza"),
  });
}

export function useDeleteHrAssenza(profiloId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: HrAssenza) => {
      if (a.certificato_path) { await supabase.storage.from("hr-documenti").remove([a.certificato_path]); }
      const { error } = await supabase.from("hr_assenze_eventi").delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-assenze", profiloId] });
      toast.success("Assenza eliminata");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore eliminazione"),
  });
}
