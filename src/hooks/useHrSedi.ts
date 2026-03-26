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
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<HrSede> & { id: string }) => {
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
        .eq("id", id);
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
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_sedi").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-sedi"] });
      toast.success("Sede eliminata");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}
