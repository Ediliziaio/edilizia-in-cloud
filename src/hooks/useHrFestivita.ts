import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrFestivita } from "@/types/hr";
import { toast } from "sonner";

export function useHrFestivita() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-festivita", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_festivita")
        .select("*")
        .eq("company_id", companyId!)
        .order("data");
      if (error) throw error;
      return (data || []) as HrFestivita[];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useCreateHrFestivita() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<HrFestivita>) => {
      if (!companyId) throw new Error("companyId required");
      const { error } = await supabase.from("hr_festivita").insert({
        company_id: companyId,
        data: data.data!,
        descrizione: data.descrizione || "",
        ricorrente: data.ricorrente ?? false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-festivita"] });
      toast.success("Festività aggiunta");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}

export function useUpdateHrFestivita() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<HrFestivita> & { id: string }) => {
      const { error } = await supabase
        .from("hr_festivita")
        .update({
          data: data.data,
          descrizione: data.descrizione,
          ricorrente: data.ricorrente,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-festivita"] });
      toast.success("Festività aggiornata");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}

export function useDeleteHrFestivita() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_festivita").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-festivita"] });
      toast.success("Festività eliminata");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}
