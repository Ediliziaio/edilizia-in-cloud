import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { HrFestivita } from "@/types/hr";
import { toast } from "sonner";
import { isoDay, missingItalianHolidays } from "@/lib/personale/calendarioLavorativo";

export function useImportHrFestivita() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (year: number) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { data, error } = await supabase.rpc("hr_importa_festivita" as never, { p_company: companyId, p_anno: year, p_festivita: missingItalianHolidays([], year) } as never);
      if (error) throw error;
      return Number(data);
    },
    onSuccess: (count) => { void qc.invalidateQueries({ queryKey: ["hr-festivita", companyId] }); toast.success(count ? `${count} festività aggiunte` : "Calendario già aggiornato"); },
    onError: () => toast.error("Importazione non riuscita: nessuna festività del lotto è stata salvata. Riprova."),
  });
}

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
      isoDay(data.data || "");
      if (!data.descrizione?.trim()) throw new Error("Descrizione obbligatoria");
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
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<HrFestivita> & { id: string }) => {
      if (!companyId) throw new Error("companyId required");
      const { error } = await supabase
        .from("hr_festivita")
        .update({
          data: data.data,
          descrizione: data.descrizione,
          ricorrente: data.ricorrente,
        } as any)
        .eq("id", id)
        .eq("company_id", companyId);
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
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("companyId required");
      const { error } = await supabase
        .from("hr_festivita")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-festivita"] });
      toast.success("Festività eliminata");
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });
}
