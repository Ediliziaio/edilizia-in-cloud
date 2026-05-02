import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrSede } from "@/types/hr";
import { toast } from "sonner";

export function useHrSedi() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-sedi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_sedi")
        .select("*")
        .eq("company_id", companyId!)
        .order("nome");
      if (error) throw error;
      return (data || []) as HrSede[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useCreateHrSede() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<HrSede>) => {
      if (!companyId) throw new Error("companyId required");
      const { error } = await supabase.from("hr_sedi").insert({
        company_id: companyId,
        nome: data.nome || "",
        indirizzo: data.indirizzo ?? null,
        citta: data.citta ?? null,
        provincia: data.provincia ?? null,
        cap: data.cap ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        raggio_mt: data.raggio_mt ?? 200,
        attiva: data.attiva ?? true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-sedi"] });
      toast.success("Sede creata con successo");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}

export function useUpdateHrSede() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<HrSede> & { id: string }) => {
      if (!companyId) throw new Error("companyId required");
      const { error } = await supabase
        .from("hr_sedi")
        .update({
          nome: data.nome,
          indirizzo: data.indirizzo,
          citta: data.citta,
          provincia: data.provincia,
          cap: data.cap,
          lat: data.lat,
          lng: data.lng,
          raggio_mt: data.raggio_mt,
          attiva: data.attiva,
        } as any)
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-sedi"] });
      toast.success("Sede aggiornata");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}

export function useDeleteHrSede() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("companyId required");

      const { count, error: countError } = await supabase
        .from("hr_profili")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("sede_id", id);

      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error("Non puoi eliminare una sede assegnata a profili HR. Disattivala o sposta prima i profili.");
      }

      const { error } = await supabase
        .from("hr_sedi")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-sedi"] });
      toast.success("Sede eliminata");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}
